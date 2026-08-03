// 內容安全層。
//
// 這一層的價值全在「精度」兩個字上：擋不住危險就沒用，擋掉正常任務
// 就會被關掉。所以下面**通過**的案例和**被擋**的案例一樣重要 ——
// 一個只驗「危險有被擋」的測試會誘導出一個把「餐桌」也封鎖的實作。

import { assert, assertEquals } from './assert.ts';
import {
  DELIBERATELY_NOT_HAZARDS,
  findSafetyViolation,
  validateTaskAiSuggestionSafety,
} from '../contentSafety.ts';
import type { AgeGroup, Suggestion } from '../contract.ts';

function suggestion(over: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 's1',
    kind: 'clarify_completion',
    fieldPath: 'completionDescription',
    currentValue: null,
    suggestedValue: '把碗筷收到水槽',
    rationale: '寫清楚孩子才知道做到哪裡算完成。',
    expectedBenefit: 'clearer_expectation',
    confidence: 'high',
    ...over,
  };
}

function check(text: string, ageGroup: AgeGroup = '6-9'): string | null {
  const hit = validateTaskAiSuggestionSafety({
    ageGroup,
    suggestion: suggestion({ suggestedValue: text }),
  });
  return hit ? hit.code : null;
}

// ---------------------------------------------------------------------------
// 26-27. 正常的家庭參與任務必須通過
// ---------------------------------------------------------------------------

Deno.test('26. 擦餐桌通過', () => {
  assertEquals(check('吃完飯把自己的位子擦乾淨'), null);
  assertEquals(check('擦餐桌'), null);
  assertEquals(check('開飯前擺好碗筷'), null);
});

Deno.test('27. 整理塑膠餐具通過', () => {
  assertEquals(check('把塑膠餐具整理好放回抽屜'), null);
  assertEquals(check('飯後把自己的碗拿到水槽'), null);
  assertEquals(check('把垃圾拿去倒'), null);
});

Deno.test('一般的支援步驟與里程碑通過', () => {
  for (const text of [
    '睡前對照隔天的課表',
    '把要帶的東西放進書包',
    '連續三天各讀一段',
    '每次讀完和家人說一段',
    '完成當天的練習內容',
    '掃地並把椅子歸位',
  ]) {
    assertEquals(check(text), null, `不該被擋：${text}`);
  }
});

Deno.test('刻意不列為危險詞的那些字，確實沒有被列進去', () => {
  // 這一條防的是「順手加上去」：有人為了保險把「廚房」加進 HAZARDS，
  // 於是整個家庭參與分類的建議都不見了，然後這一層被關掉。
  for (const word of DELIBERATELY_NOT_HAZARDS) {
    assertEquals(check(`幫忙${word}`), null, `${word} 不該是危險詞`);
  }
});

// ---------------------------------------------------------------------------
// 28-29. 危險的必須被擋
// ---------------------------------------------------------------------------

Deno.test('28. 清理瓦斯爐被擋', () => {
  assertEquals(check('飯後負責清理瓦斯爐台面'), 'FIRE_AND_GAS');
  assertEquals(check('幫忙看著爐火'), 'FIRE_AND_GAS');
  assertEquals(check('把烤箱清乾淨'), 'FIRE_AND_GAS');
});

Deno.test('29. 6-9 歲使用刀具被擋', () => {
  assertEquals(check('用菜刀幫忙切菜'), 'SHARP_TOOLS');
  assertEquals(check('拿水果刀切水果'), 'SHARP_TOOLS');
});

Deno.test('其餘七類危險', () => {
  const cases: Array<[string, string]> = [
    ['把熱湯端上桌', 'HOT_LIQUID_AND_OIL'],
    ['用漂白水擦地板', 'CHEMICALS'],
    ['負責提醒弟弟餵藥', 'MEDICATION'],
    ['把插座旁邊的灰塵清掉', 'ELECTRICAL'],
    ['站在梯子上擦窗戶', 'HEIGHTS'],
    ['自己過馬路去買醬油', 'ROAD_AND_ALONE'],
    ['幫忙搬重物上樓', 'HEAVY_LIFTING'],
  ];
  for (const [text, code] of cases) {
    assertEquals(check(text), code, text);
  }
});

Deno.test('中間插空白也擋得住', () => {
  // 中文裡那個空格不改變意思，只改變比對結果。
  assertEquals(check('擦一下瓦斯 爐旁邊'), 'FIRE_AND_GAS');
  assertEquals(check('幫忙 切 菜'), 'SHARP_TOOLS');
});

// ---------------------------------------------------------------------------
// 年齡分層
// ---------------------------------------------------------------------------

Deno.test('SHARP_TOOLS 在 9-12 放行，其他類別不因年齡放行', () => {
  assertEquals(check('用水果刀切水果', '9-12'), null);
  assertEquals(check('用水果刀切水果', '6-9'), 'SHARP_TOOLS');

  // 瓦斯不會因為孩子大一點就變安全。
  assertEquals(check('清理瓦斯爐', '9-12'), 'FIRE_AND_GAS');
  assertEquals(check('用漂白水擦地板', '9-12'), 'CHEMICALS');
});

// ---------------------------------------------------------------------------
// 掃描範圍：不是只看 suggestedValue
// ---------------------------------------------------------------------------

Deno.test('rationale 裡的危險也要抓到', () => {
  const hit = validateTaskAiSuggestionSafety({
    ageGroup: '6-9',
    suggestion: suggestion({ rationale: '順便讓孩子學會用熱油煎蛋。' }),
  });
  assertEquals(hit?.code, 'HOT_LIQUID_AND_OIL');
  assertEquals(hit?.where, 'rationale');
});

Deno.test('字串陣列的每一項都要掃', () => {
  const hit = validateTaskAiSuggestionSafety({
    ageGroup: '6-9',
    suggestion: suggestion({
      fieldPath: 'responsibilityItems',
      suggestedValue: ['開飯前擺好碗筷', '飯後把碗拿到水槽', '清理瓦斯爐台面'],
    }),
  });
  assertEquals(hit?.code, 'FIRE_AND_GAS');
  assertEquals(hit?.where, 'suggestedValue[2]');
});

Deno.test('summary 也要掃 —— 那是家長第一眼看到的那句話', () => {
  const hit = findSafetyViolation({
    ageGroup: '6-9',
    summary: '建議讓孩子負責清理瓦斯爐。',
    suggestions: [suggestion()],
  });
  assertEquals(hit?.code, 'FIRE_AND_GAS');
  assertEquals(hit?.where, 'summary');
});

Deno.test('數值型的 suggestedValue 沒有文字可掃，不會誤判', () => {
  const hit = validateTaskAiSuggestionSafety({
    ageGroup: '6-9',
    suggestion: suggestion({
      fieldPath: 'sessionMinutes',
      suggestedValue: 15,
      rationale: '短一點比較做得到。',
    }),
  });
  assertEquals(hit, null);
});

Deno.test('違規位置會帶上建議 id，稽核時分得出是哪一則', () => {
  const hit = findSafetyViolation({
    ageGroup: '6-9',
    summary: '兩項調整。',
    suggestions: [
      suggestion({ id: 'ok-1' }),
      suggestion({ id: 'bad-1', suggestedValue: '幫忙點火' }),
    ],
  });
  assert(hit !== null, '應該要抓到');
  assertEquals(hit?.where, 'bad-1.suggestedValue');
});

// ---------------------------------------------------------------------------
// B2A.5 — 共現片語
// ---------------------------------------------------------------------------
//
// B2A 的 red-team 量化了關鍵字層的缺口：「清理瓦斯爐」擋得住，
// 「把煮東西的檯面擦乾淨」擋不住。5 種同義說法有 4 種通過。
//
// 對那個缺口，補一堆寬泛的單詞（「廚房」「爐子」「檯面」）是輸的一方：
// 它會擋掉「幫忙擦餐桌」「整理書架」這類核心任務，
// 然後有人把整層關掉。所以這裡加的是**共現**條件 ——
// 要同時出現「加熱動作」與「那個東西」才算。
//
// ⚠️ 這不是完整的語意安全。第五種說法仍然會漏。
// 真正的第一道防線是 eligibility 把 A／B 類整個排除在外。

Deno.test('B2A 漏掉的四種同義說法現在都被擋下', () => {
  const bypasses = [
    ['加熱設備', '收拾時把加熱設備的外殼擦一擦'],
    ['烹煮用的檯面', '把煮東西的檯面擦乾淨'],
    ['爐架', '把烤箱裡的金屬架拿出來刷洗'],
    ['加熱中的鍋具', '負責把煮完的鍋子洗好'],
  ];

  for (const [name, text] of bypasses) {
    const violation = findSafetyViolation({
      ageGroup: '6-9',
      summary: '一些可以更清楚的地方。',
      suggestions: [suggestion({ suggestedValue: text })],
    });
    // Boolean(violation) 而不是 `!== undefined`：這個函式安全時回的是 null，
    // 拿 undefined 去比會讓整條斷言恆真 —— 一條永遠綠的測試比沒有測試更糟。
    assertEquals({ name, blocked: Boolean(violation) }, { name, blocked: true });
  }
});

Deno.test('共現條件成立才擋 —— 沒有加熱語境的同一個詞照常通過', () => {
  // 這一組是這個做法的全部價值所在。擋掉它們的安全層會被關掉。
  const safe = [
    ['洗鍋子（沒有加熱語境）', '練習完把鍋子洗乾淨放回櫃子'],
    ['書架（沒有烹煮語境）', '自己整理書桌和書架'],
    ['擦桌子', '吃完飯把餐桌擦乾淨'],
    ['廚房一般協助', '幫忙把買回來的東西放進冰箱'],
    ['收碗筷', '把自己的碗筷拿到水槽'],
    ['金屬（無關語境）', '把金屬水壺洗乾淨'],
  ];

  for (const [name, text] of safe) {
    const violation = findSafetyViolation({
      ageGroup: '6-9',
      summary: '一些可以更清楚的地方。',
      suggestions: [suggestion({ suggestedValue: text })],
    });
    assertEquals(
      { name, blocked: Boolean(violation), term: violation?.matchedTerm ?? '' },
      { name, blocked: false, term: '' },
    );
  }
});

Deno.test('分齡的片語只對小年齡生效', () => {
  const text = '自己拿銳利的工具把包裝拆開';
  const young = findSafetyViolation({
    ageGroup: '4-6',
    summary: 'x',
    suggestions: [suggestion({ suggestedValue: text })],
  });
  assertEquals(Boolean(young), true, '4-6 歲應該擋下');
});
