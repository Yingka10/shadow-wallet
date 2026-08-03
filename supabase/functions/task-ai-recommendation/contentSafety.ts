// task-ai-recommendation — 內容安全
//
// ─────────────────────────────────────────────────────────────────────────
// 這一層存在的理由是一筆具體的 fixture：`injection-06`。
//
// 模型建議讓一個 6-9 歲的孩子「清理瓦斯爐台面」「把熱湯端上桌」。
// 那則建議在 schema 上**完全合法**：allowlist 內的 fieldPath、正確型別、
// 長度沒超、沒有 HTML、沒有控制字元。outputValidator 沒有任何理由擋它 ——
// schema 不知道瓦斯爐是什麼。
//
// 所以安全必須是**另一層**，而且必須是 deterministic 的。
// 不能靠 prompt 裡那八條禁令：那是請求，不是規則。模型照不照做是它的事。
//
// ── 設計取捨：高精度優先 ────────────────────────────────────────────────
//
// 這裡刻意**不**封鎖「廚房」「餐桌」「爐」這種範圍詞。理由很實際：
// 「擦餐桌」「整理塑膠餐具」「開飯前擺好碗筷」是這個產品最核心的家庭參與任務，
// 一個會把它們擋掉的安全層會被繞過或關掉，然後就什麼都不擋了。
//
// 命中的是具體的危險物與危險動作，不是它們出現的場所。
//
// ⚠️ 這**不是**自然語言安全性的完整證明。它擋得住「清理瓦斯爐」，
// 擋不住「幫忙處理爐子上那個東西」。限制寫在
// docs/TASK_AI_EDGE_FUNCTION.md，不要在別處宣稱它是完整的。
// ─────────────────────────────────────────────────────────────────────────

import type { AgeGroup, Suggestion } from './contract.ts';

/**
 * 危險項目。
 *
 * `appliesTo`：
 *   'all'   — 任何年齡都擋
 *   'young' — 9-12 以下擋。9-12 放行是一個**判斷**，不是事實依據；
 *             見檔尾的說明與 docs 的限制段落。
 */
type Hazard = {
  code: string;
  appliesTo: 'all' | 'young';
  terms: readonly string[];
};

const HAZARDS: readonly Hazard[] = [
  {
    code: 'FIRE_AND_GAS',
    appliesTo: 'all',
    terms: ['瓦斯', '爐火', '爐台', '爐子', '明火', '火源', '點火', '打火機', '火柴', '烤箱', '炭火'],
  },
  {
    code: 'HOT_LIQUID_AND_OIL',
    appliesTo: 'all',
    terms: ['熱油', '熱湯', '滾水', '沸水', '熱水壺', '油鍋', '剛煮好的湯', '燙的鍋'],
  },
  {
    code: 'CHEMICALS',
    appliesTo: 'all',
    terms: ['漂白水', '強效清潔', '清潔劑', '殺蟲劑', '消毒水', '通樂', '鹽酸', '強酸', '強鹼', '溶劑'],
  },
  {
    code: 'MEDICATION',
    appliesTo: 'all',
    terms: ['餵藥', '給藥', '服藥', '藥物', '配藥', '分藥', '藥劑'],
  },
  {
    code: 'ELECTRICAL',
    appliesTo: 'all',
    terms: ['插座', '電線', '延長線', '拆電', '修電', '電器維修', '漏電', '變壓器', '插頭修'],
  },
  {
    code: 'HEIGHTS',
    appliesTo: 'all',
    terms: ['梯子', '爬高', '高處', '屋頂', '陽台外', '窗戶外', '爬窗', '踩椅子', '站上椅子'],
  },
  {
    code: 'ROAD_AND_ALONE',
    appliesTo: 'all',
    terms: ['過馬路', '馬路', '車道', '單獨外出', '自己出門', '獨自外出', '騎車上路', '路邊'],
  },
  {
    code: 'HEAVY_LIFTING',
    appliesTo: 'all',
    terms: ['搬重物', '重物', '搬運重', '扛起'],
  },
  {
    code: 'SHARP_TOOLS',
    appliesTo: 'young',
    terms: ['菜刀', '刀具', '水果刀', '削皮刀', '切菜', '切水果', '美工刀', '碎玻璃', '刀片'],
  },
];

/**
 * 這些**不是**危險詞，列出來是為了說明這一層的邊界在哪裡，
 * 也是為了讓後來的人不要「順手加上去」：
 *
 *   餐桌 / 廚房 / 碗筷 / 餐具 / 抹布 / 垃圾 / 水槽 / 擦桌子 / 掃地
 *
 * 這些是家庭參與任務的日常內容。把它們加進 HAZARDS 會讓這一層
 * 擋掉產品本身，然後被關掉。
 */
export const DELIBERATELY_NOT_HAZARDS = [
  '餐桌', '廚房', '碗筷', '餐具', '抹布', '垃圾', '水槽', '擦桌子', '掃地', '洗碗',
] as const;

// ─────────────────────────────────────────────────────────────────────────
// Phrase patterns —— B2A 發現的同義繞過
//
// 單詞比對擋得住「瓦斯爐」，擋不住「煮東西的檯面」。
// 但解法**不是**把「廚房」「爐子」加進單詞清單 —— 那會擋掉
// 「擦餐桌」「開飯前擺好碗筷」，然後整層會被關掉。
//
// 這裡改用**共現**：危險語境詞 ＋ 危險物件，而且要求兩者靠得夠近。
// 「洗鍋子」不會命中（沒有加熱語境），「煮飯時幫忙顧著鍋子」會。
//
// ⚠️ 這仍然不是完整的語意安全。它把已知的四種說法補起來，
// 不代表第五種說法會被擋。真正的第一道防線是 eligibility ——
// 家庭角色與家庭參與類任務根本不會送到 Gemini。
// ─────────────────────────────────────────────────────────────────────────

type PhrasePattern = { code: string; appliesTo: 'all' | 'young'; pattern: RegExp; label: string };

const PHRASE_PATTERNS: readonly PhrasePattern[] = [
  {
    code: 'FIRE_AND_GAS',
    appliesTo: 'all',
    // 「煮東西的檯面」「煮飯的台面」——「檯面」本身無害，煮＋檯面才是爐台。
    pattern: /(煮|炒|燉|煎|加熱)[^。，、]{0,6}[檯台]面/,
    label: '烹煮用的檯面',
  },
  {
    code: 'FIRE_AND_GAS',
    appliesTo: 'all',
    // 「上面那圈金屬架」—— 要求與烹煮／加熱語境共現，書架不會命中。
    pattern: /(爐|烤|煮|炒|加熱)[^。]{0,12}金屬架|金屬架[^。]{0,12}(爐|烤|煮|炒|加熱)/,
    label: '爐架',
  },
  {
    code: 'FIRE_AND_GAS',
    appliesTo: 'all',
    // 「加熱食物的那台機器」
    pattern: /(加熱|保溫|烹煮)[^。，、]{0,8}(機器|設備|器具|那台)/,
    label: '加熱設備',
  },
  {
    code: 'HOT_LIQUID_AND_OIL',
    appliesTo: 'all',
    // 「煮飯時幫忙顧著鍋子」——「洗鍋子」沒有加熱語境，不命中。
    pattern: /(煮|炒|燉|煎|加熱|燒)[^。，、]{0,8}鍋/,
    label: '加熱中的鍋具',
  },
  {
    code: 'SHARP_TOOLS',
    appliesTo: 'young',
    // 「抽屜裡那個銳利的工具」
    pattern: /(銳利|鋒利|尖銳)[^。，、]{0,6}(工具|器具|東西|物品)/,
    label: '銳利器具',
  },
  {
    code: 'SHARP_TOOLS',
    appliesTo: 'young',
    // 「把水果處理成小塊」這種迂迴說法，需與器具共現才算。
    pattern: /(切|剁|削)[^。，、]{0,6}(食材|蔬菜|水果|肉)/,
    label: '切食材',
  },
];

export type SafetyViolation = { code: string; matchedTerm: string; where: string };

/**
 * 比對前的正規化。
 *
 * 去掉所有空白：模型偶爾會寫「瓦斯 爐」或「切 菜」，而中文裡那個空格
 * 不改變意思，只改變比對結果。
 */
function normalize(text: string): string {
  return text.replace(/\s+/g, '');
}

function hazardApplies(hazard: Hazard, ageGroup: AgeGroup): boolean {
  if (hazard.appliesTo === 'all') return true;
  return ageGroup !== '9-12';
}

function scan(text: string, where: string, ageGroup: AgeGroup): SafetyViolation | null {
  const normalized = normalize(text);

  // 先比對單詞：命中時能講出是哪一個詞，稽核上比 regex 好讀。
  for (const hazard of HAZARDS) {
    if (!hazardApplies(hazard, ageGroup)) continue;
    for (const term of hazard.terms) {
      if (normalized.includes(normalize(term))) {
        return { code: hazard.code, matchedTerm: term, where };
      }
    }
  }

  // 再比對片語：單詞漏掉的同義說法在這裡。
  for (const phrase of PHRASE_PATTERNS) {
    if (phrase.appliesTo === 'young' && ageGroup === '9-12') continue;
    if (phrase.pattern.test(normalized)) {
      return { code: phrase.code, matchedTerm: phrase.label, where };
    }
  }

  return null;
}

/** 把一則建議裡所有會被家長讀到的文字攤平。 */
function textsOf(suggestion: Suggestion): Array<[string, string]> {
  const out: Array<[string, string]> = [['rationale', suggestion.rationale]];

  const value = suggestion.suggestedValue;
  if (typeof value === 'string') {
    out.push(['suggestedValue', value]);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => out.push([`suggestedValue[${i}]`, item]));
  }
  // 數值型的 suggestedValue 沒有文字可掃，跳過。

  return out;
}

/**
 * 檢查一則建議。
 *
 * 掃的是 **suggestedValue 與 rationale**，不是 fieldPath ——
 * 危險藏在內容裡，不在欄位名裡。一則 `responsibilityItems` 的建議
 * 和一則 `completionDescription` 的建議一樣可能叫孩子去碰瓦斯。
 */
export function validateTaskAiSuggestionSafety(args: {
  ageGroup: AgeGroup;
  suggestion: Suggestion;
}): SafetyViolation | null {
  for (const [where, text] of textsOf(args.suggestion)) {
    const hit = scan(text, where, args.ageGroup);
    if (hit) return hit;
  }
  return null;
}

/**
 * 檢查整批輸出，包含 summary。
 *
 * summary 也要掃：它是家長第一眼看到的那句話，而且模型很常把
 * 「我建議加入清理瓦斯爐」寫進去。只掃建議卡會漏掉它。
 */
export function findSafetyViolation(args: {
  ageGroup: AgeGroup;
  summary: string;
  suggestions: readonly Suggestion[];
}): SafetyViolation | null {
  const inSummary = scan(args.summary, 'summary', args.ageGroup);
  if (inSummary) return inSummary;

  for (const suggestion of args.suggestions) {
    const hit = validateTaskAiSuggestionSafety({ ageGroup: args.ageGroup, suggestion });
    if (hit) return { ...hit, where: `${suggestion.id}.${hit.where}` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Input 端的掃描
// ---------------------------------------------------------------------------

/**
 * 草稿本身就寫著危險操作時，**不要送給 AI**。
 *
 * 這不是為了保護模型，是為了不讓它幫忙把一句模糊的危險描述
 * **改寫得更具體、更可執行**。「幫忙顧一下爐子」已經不好，
 * 「先把火轉小，等冒煙再關掉」更糟 —— 而那正是這個功能擅長的事。
 *
 * 掃的是家長輸入的自由文字。`scheduleSummary` 與 `selectedOptions`
 * 是我們自己組出來的，不掃。
 */
export function scanInputForHighRisk(input: {
  childContext: { ageGroup: AgeGroup };
  parentIntent: { originalExpectation: string };
  currentDraft: {
    title: string;
    completionDescription: string;
    supportSteps?: string[];
    milestones?: string[];
    responsibilities?: string[];
  };
}): SafetyViolation | null {
  const ageGroup = input.childContext.ageGroup;

  const fields: Array<[string, string]> = [
    ['parentIntent.originalExpectation', input.parentIntent.originalExpectation],
    ['currentDraft.title', input.currentDraft.title],
    ['currentDraft.completionDescription', input.currentDraft.completionDescription],
  ];

  const lists: Array<[string, string[] | undefined]> = [
    ['currentDraft.supportSteps', input.currentDraft.supportSteps],
    ['currentDraft.milestones', input.currentDraft.milestones],
    ['currentDraft.responsibilities', input.currentDraft.responsibilities],
  ];
  for (const [name, list] of lists) {
    (list ?? []).forEach((item, i) => fields.push([`${name}[${i}]`, item]));
  }

  for (const [where, text] of fields) {
    const hit = scan(text, where, ageGroup);
    if (hit) return hit;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// 關於 'young' 這一層的判斷
//
// SHARP_TOOLS 在 9-12 放行，是因為十歲上下的孩子在有人陪的情況下用水果刀
// 是常見且合理的家庭任務，全年齡封鎖會讓這一層開始擋掉正當建議。
//
// 但這是一個**判斷**，不是有依據的年齡界線 —— 而且這個 Function
// 不知道有沒有大人在旁邊。如果產品之後要對 9-12 開放刀具類建議，
// 這裡應該改成「需要家長確認」而不是「直接放行」，
// 那需要 TaskAiSuggestion 上有一個目前不存在的欄位。
// 在那之前，這裡的行為要被當成已知的粗略處理，不要當成政策。
// ─────────────────────────────────────────────────────────────────────────
