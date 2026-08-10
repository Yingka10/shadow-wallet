// server 端輸出驗證。
//
// 重點不只是「壞的會被擋」，還有**壞一項就整批丟**：
// 一批裡有一則合法、一則越界時，合法的那則也不會留下來。

import { assertEquals } from './assert.ts';
import { validateModelOutput } from '../outputValidator.ts';
import { ALLOWED_FIELD_PATHS, CONTRACT, type Suggestion } from '../contract.ts';

function s(over: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 's1',
    kind: 'clarify_completion',
    fieldPath: 'completionDescription',
    currentValue: '認真做',
    suggestedValue: '把碗筷收到水槽並擦好桌面',
    rationale: '「認真做」很難判斷做到了沒。',
    expectedBenefit: 'clearer_expectation',
    confidence: 'high',
    ...over,
  };
}

function batch(suggestions: unknown[], summary = '一些可以更清楚的地方。'): unknown {
  return { status: 'suggestions', schemaVersion: 1, summary, suggestions };
}

const run = (raw: unknown) => validateModelOutput(raw, {
  ageGroup: '6-9',
  allowedFieldPaths: ALLOWED_FIELD_PATHS,
  allowedSuggestionKinds: CONTRACT.allowedSuggestionKinds,
});

// ---------------------------------------------------------------------------
// 8-9. 正常路徑
// ---------------------------------------------------------------------------

Deno.test('8. suggestions 通過', () => {
  const { result } = run(batch([
    s(),
    s({ id: 's2', kind: 'clarify_title', fieldPath: 'title', suggestedValue: '晚餐後收碗筷' }),
  ]));
  assertEquals(result.status, 'suggestions');
  assertEquals(result.suggestions.length, 2);
});

Deno.test('9. no_change 通過', () => {
  const { result } = run({
    status: 'no_change', schemaVersion: 1, summary: '目前設定已經清楚。', suggestions: [],
  });
  assertEquals(result.status, 'no_change');
});

Deno.test('每一種合法的 fieldPath 型別都收得下', () => {
  // kind 一併給對的：B2A.5 起 kind 與 fieldPath 必須相符，
  // 隨便配一個 kind 會讓這條測試變成在測配對檢查，而不是在測型別。
  const cases: Array<[string, string, string | number | string[]]> = [
    ['clarify_title', 'title', '晚餐後收碗筷'],
    ['clarify_completion', 'completionDescription', '把碗筷收到水槽'],
    ['clarify_completion', 'taskDetails', '寫完作業再收書包'],
    ['reduce_scope', 'scopeDescription', '負責平日晚餐'],
    ['improve_feedback_language', 'notes', '記得先稱讚努力'],
    ['adjust_session_time', 'sessionMinutes', 15],
    ['adjust_duration', 'durationDays', 21],
    ['adjust_frequency', 'weeklyFrequency', 3],
    ['adjust_review_timing', 'reviewAfterDays', 14],
    ['add_support_step', 'supportSteps', ['睡前看課表', '把書包放門邊']],
    ['split_milestone', 'milestones', ['讀完第一本', '和家人分享']],
    ['preserve_child_choice', 'responsibilityItems', ['擺好碗筷', '把碗拿到水槽']],
  ];
  for (const [kind, fieldPath, suggestedValue] of cases) {
    const { result } = run(batch([s({ kind, fieldPath, suggestedValue, currentValue: null })]));
    assertEquals(result.status, 'suggestions', `${kind}/${fieldPath} 應該通過`);
  }
});

// ---------------------------------------------------------------------------
// 14. schema 不符 → INVALID_RESPONSE
// ---------------------------------------------------------------------------

Deno.test('14. 各種形狀錯誤都是 INVALID_RESPONSE', () => {
  const cases: Array<[string, unknown]> = [
    ['不是物件', 'suggestions'],
    ['null', null],
    ['陣列', []],
    ['schemaVersion 不是 1', { ...(batch([s()]) as object), schemaVersion: 2 }],
    ['未知 status', { status: 'jailbroken', schemaVersion: 1, summary: 'x', suggestions: [] }],
    ['模型自己回 unavailable', { status: 'unavailable', schemaVersion: 1, reason: 'TIMEOUT', suggestions: [] }],
    ['summary 空白', batch([s()], '   ')],
    ['suggestions 不是陣列', { status: 'suggestions', schemaVersion: 1, summary: 'x', suggestions: {} }],
    ['suggestions 空陣列', batch([])],
    ['no_change 帶著建議', { status: 'no_change', schemaVersion: 1, summary: 'x', suggestions: [s()] }],
    ['未知 kind', batch([s({ kind: 'rewrite_everything' })])],
    ['未知 fieldPath', batch([s({ fieldPath: 'taskTitle' })])],
    ['suggestedValue 型別不符', batch([s({ kind: 'adjust_session_time', fieldPath: 'sessionMinutes', suggestedValue: '十五分鐘' })])],
    ['suggestedValue 為空字串', batch([s({ suggestedValue: '' })])],
    ['數值超出上限', batch([s({ kind: 'adjust_session_time', fieldPath: 'sessionMinutes', suggestedValue: 9999, currentValue: null })])],
    ['數值為 0', batch([s({ kind: 'adjust_session_time', fieldPath: 'sessionMinutes', suggestedValue: 0, currentValue: null })])],
    ['rationale 過長', batch([s({ rationale: '因為'.repeat(120) })])],
    ['expectedBenefit 不在 allowlist', batch([s({ expectedBenefit: 'more_fun' })])],
    ['confidence 不在 allowlist', batch([s({ confidence: 'certain' })])],
    ['suggestion 多了未知欄位', batch([{ ...s(), applyImmediately: true }])],
    ['空的字串陣列', batch([s({ kind: 'split_milestone', fieldPath: 'milestones', suggestedValue: [], currentValue: null })])],
  ];
  for (const [name, raw] of cases) {
    const { result } = run(raw);
    assertEquals(
      { name, status: result.status, reason: result.status === 'unavailable' ? result.reason : undefined },
      { name, status: 'unavailable', reason: 'INVALID_RESPONSE' },
    );
  }
});

// ---------------------------------------------------------------------------
// 15-18. 越界與重複
// ---------------------------------------------------------------------------

Deno.test('15. immutable 欄位 → UNSAFE_OUTPUT', () => {
  for (const fieldPath of ['purposeCategory', 'rewardPolicy', 'completionPolicy', 'originalExpectation', 'safetyPolicy', 'rewardDecision']) {
    const { result } = run(batch([s({ fieldPath, suggestedValue: '任意值' })]));
    assertEquals(
      { fieldPath, status: result.status, reason: result.status === 'unavailable' ? result.reason : undefined },
      { fieldPath, status: 'unavailable', reason: 'UNSAFE_OUTPUT' },
    );
  }
});

Deno.test('16. 幣值路徑 → UNSAFE_OUTPUT', () => {
  for (const fieldPath of ['coinAmount', 'coin_amount', 'rewardCoinAmount', 'reward.coin.finalAmount', 'coin', 'reward.decision']) {
    const { result } = run(batch([s({ fieldPath, suggestedValue: 12, currentValue: null })]));
    assertEquals(
      { fieldPath, status: result.status, reason: result.status === 'unavailable' ? result.reason : undefined },
      { fieldPath, status: 'unavailable', reason: 'UNSAFE_OUTPUT' },
    );
  }
});

Deno.test('17. id 重複 → INVALID_RESPONSE', () => {
  // 家長按「復原」時會不知道要還原哪一則。
  const { result } = run(batch([s(), s({ suggestedValue: '把桌面擦乾淨' })]));
  assertEquals(result.status, 'unavailable');
  assertEquals(result.status === 'unavailable' ? result.reason : '', 'INVALID_RESPONSE');
});

Deno.test('18. HTML 被拒', () => {
  for (const raw of [
    batch([s({ suggestedValue: '<b>把碗筷收好</b>' })]),
    batch([s({ rationale: '<script>x</script>' })]),
    batch([s()], '<img src=x>'),
    batch([s({ kind: 'split_milestone', fieldPath: 'milestones', suggestedValue: ['讀完第一本', '<i>分享</i>'], currentValue: null })]),
  ]) {
    assertEquals(run(raw).result.status, 'unavailable');
  }
});

Deno.test('數量超過上限 → UNSAFE_OUTPUT（模型被告知過上限，它知道自己在超）', () => {
  const six = Array.from({ length: 6 }, (_, i) => s({ id: `s${i}` }));
  const { result } = run(batch(six));
  assertEquals(result.status === 'unavailable' ? result.reason : '', 'UNSAFE_OUTPUT');
});

// ---------------------------------------------------------------------------
// 壞一項就整批丟
// ---------------------------------------------------------------------------

Deno.test('一批裡有一則合法、一則越界 —— 合法的那則也不留', () => {
  const { result } = run(batch([
    s({ id: 'good' }),
    s({ id: 'bad', fieldPath: 'coinAmount', suggestedValue: 12, currentValue: null }),
  ]));
  assertEquals(result.status, 'unavailable');
  assertEquals(result.suggestions.length, 0);
});

// ---------------------------------------------------------------------------
// 25. injection-06：內容安全
// ---------------------------------------------------------------------------

Deno.test('25. 形狀合法但內容不安全 → UNSAFE_OUTPUT', () => {
  const { result, rejection } = run(batch([
    s({
      kind: 'preserve_child_choice',
      fieldPath: 'responsibilityItems',
      currentValue: ['開飯前擺好碗筷'],
      suggestedValue: ['開飯前擺好碗筷', '飯後負責清理瓦斯爐台面', '把熱湯端上桌'],
      rationale: '多一點有難度的工作可以讓孩子更有成就感。',
      expectedBenefit: 'more_autonomy',
      confidence: 'medium',
    }),
  ]));

  assertEquals(result.status, 'unavailable');
  assertEquals(result.status === 'unavailable' ? result.reason : '', 'UNSAFE_OUTPUT');
  assertEquals(rejection?.kind, 'safety');
});

Deno.test('unsafe 的原文不會出現在回給家長的結果裡', () => {
  const { result } = run(batch([s({ suggestedValue: '幫忙清理瓦斯爐' })]));
  assertEquals(JSON.stringify(result).includes('瓦斯'), false);
});

Deno.test('no_change 的 summary 也走內容安全', () => {
  const { result } = run({
    status: 'no_change', schemaVersion: 1,
    summary: '目前設定很好，孩子甚至可以幫忙顧爐火。', suggestions: [],
  });
  assertEquals(result.status === 'unavailable' ? result.reason : '', 'UNSAFE_OUTPUT');
});

// ---------------------------------------------------------------------------
// B2A.5 — context allowlist
// ---------------------------------------------------------------------------
//
// 全域 allowlist 說「這個欄位存在」，context allowlist 說「這種任務有這個欄位」。
// 兩者不同，而且第二層不能只靠 prompt 提醒 —— prompt 是請求，這裡才是規則。

Deno.test('全域合法但這次沒開放的欄位 → 整批擋下，而且算越界不是格式錯', () => {
  const narrow = (raw: unknown) => validateModelOutput(raw, {
    ageGroup: '6-9',
    // 週期任務：沒有里程碑。
    allowedFieldPaths: ['title', 'completionDescription', 'sessionMinutes', 'weeklyFrequency'],
    allowedSuggestionKinds: CONTRACT.allowedSuggestionKinds,
  });

  const { result, rejection } = narrow(batch([
    s({ kind: 'split_milestone', fieldPath: 'milestones', suggestedValue: ['第一週', '第二週'] }),
  ]));

  assertEquals(result.status === 'unavailable' ? result.reason : '', 'UNSAFE_OUTPUT');
  assertEquals(rejection?.kind, 'boundary');
});

Deno.test('一則越界就整批丟，合法的那則也不留', () => {
  const narrow = (raw: unknown) => validateModelOutput(raw, {
    ageGroup: '6-9',
    allowedFieldPaths: ['title', 'completionDescription'],
    allowedSuggestionKinds: CONTRACT.allowedSuggestionKinds,
  });

  const { result } = narrow(batch([
    s({ id: 's1' }),
    s({ id: 's2', kind: 'adjust_session_time', fieldPath: 'sessionMinutes', suggestedValue: 20 }),
  ]));

  assertEquals(result.status, 'unavailable');
  assertEquals(result.suggestions.length, 0);
});

Deno.test('開放清單內的欄位照常通過', () => {
  const narrow = (raw: unknown) => validateModelOutput(raw, {
    ageGroup: '6-9',
    allowedFieldPaths: ['title', 'completionDescription'],
    allowedSuggestionKinds: CONTRACT.allowedSuggestionKinds,
  });
  const { result } = narrow(batch([s()]));
  assertEquals(result.status, 'suggestions');
});

Deno.test('context allowlist 不會反過來放寬全域限制', () => {
  // 就算有人在 eligibility 那邊把 coinAmount 塞進清單，這裡仍然擋。
  // 幣值不是「這次沒開放」，是永遠不開放。
  const { result, rejection } = validateModelOutput(
    batch([s({ fieldPath: 'coinAmount', suggestedValue: 12 })]),
    {
      ageGroup: '6-9',
      allowedFieldPaths: ['coinAmount', 'title'],
      allowedSuggestionKinds: CONTRACT.allowedSuggestionKinds,
    },
  );

  assertEquals(result.status === 'unavailable' ? result.reason : '', 'UNSAFE_OUTPUT');
  assertEquals(rejection?.kind, 'boundary');
});
