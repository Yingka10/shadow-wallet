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
  for (const hazard of HAZARDS) {
    if (!hazardApplies(hazard, ageGroup)) continue;
    for (const term of hazard.terms) {
      if (normalized.includes(normalize(term))) {
        return { code: hazard.code, matchedTerm: term, where };
      }
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
