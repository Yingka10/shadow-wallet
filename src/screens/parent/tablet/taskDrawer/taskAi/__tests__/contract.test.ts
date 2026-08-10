// 第八階段 A — AI 建議的 input / output 契約
//
// 兩個東西在這裡被盯著：
//
//   input   **送出去的是什麼**。孩子的暱稱、family id、child id、錢包餘額
//           一項都不需要，所以一項都不能出現。這種洩漏不會有錯誤訊息，
//           只會安靜地發生，所以只能靠測試。
//
//   output  **收回來的東西可不可信**。既有的 ai-proxy 寫 `JSON.parse(x) as T`，
//           那行字讓型別系統對整批資料失效。這裡的 validator 逐欄檢查，
//           而且壞一項就整批丟掉。

import {
  buildTaskAiInput,
  validateTaskAiRecommendationResult,
  AI_LIMITS,
  IMMUTABLE_FIELDS,
  type TaskAiSuggestion,
} from '../index';
import { createTaskDraft, type DraftChildContext } from '../../taskDraft';
import { ALL_FAMILIES } from '../../taskCatalog';
import type { TaskPresetFamily, TaskPresetVariant } from '../../taskCatalog';

const CHILD: DraftChildContext = {
  nickname: '承恩',
  birthDate: '2018-03-05',
  familyId: 'family-secret-id',
};

function pickFamily(predicate: (f: TaskPresetFamily) => boolean): TaskPresetFamily {
  const found = ALL_FAMILIES.find(predicate);
  if (!found) throw new Error('找不到符合條件的 family');
  return found;
}

function firstVariant(family: TaskPresetFamily): TaskPresetVariant {
  return family.variants[0];
}

function anyDraft() {
  const family = pickFamily(() => true);
  const variant = firstVariant(family);
  return { family, variant, draft: createTaskDraft(family, variant, CHILD, '6-9') };
}

// ---------------------------------------------------------------------------
// 1-3. input
// ---------------------------------------------------------------------------

describe('input 的隱私最小化', () => {
  const { variant, draft } = anyDraft();
  const input = buildTaskAiInput({
    draft, variant, ageGroup: '6-9', childNickname: CHILD.nickname,
  });
  const serialised = JSON.stringify(input);

  it('1. 不含孩子姓名', () => {
    // 預設標題長成「承恩的餐桌任務」，所以這條不是象徵性的 ——
    // 沒有遮蔽的話，名字會跟著每一次請求送出去。
    expect(draft.title).toContain(CHILD.nickname);
    expect(serialised).not.toContain('承恩');
    expect(serialised).not.toContain(CHILD.nickname);
  });

  it('1b. 遮蔽之後句子仍然讀得通，不是把名字挖掉留下殘句', () => {
    expect(input.currentDraft.title).toContain('孩子');
  });

  it('2. 不含家戶 family id、生日或 email', () => {
    expect(serialised).not.toContain('family-secret-id');
    expect(serialised).not.toContain('2018-03-05');
    expect(serialised).not.toMatch(/@/);
  });

  it('2a. 草稿上的 familyId 是 preset 家族代號，不是家戶 id —— 兩者不要搞混', () => {
    // BaseTaskDraft.familyId 指的是任務目錄裡的家族（例如「餐桌固定任務」），
    // 家戶的 family id 從來不會進到草稿裡。這一條把那個區別釘住，
    // 免得日後有人「順手」把家戶 id 也塞進草稿。
    expect(draft.familyId).not.toBe(CHILD.familyId);
    expect(ALL_FAMILIES.map(f => f.id)).toContain(draft.familyId);
  });

  it('2b. 年齡只送分級，不送生日也不送歲數', () => {
    expect(input.childContext).toEqual({ ageGroup: '6-9' });
  });

  it('2c. childContext 只有 ageGroup 一個鍵', () => {
    expect(Object.keys(input.childContext)).toEqual(['ageGroup']);
  });

  it('3. immutablePolicies 帶著完整的禁改清單', () => {
    expect(input.immutablePolicies.blockedFields).toEqual([...IMMUTABLE_FIELDS]);
    expect(input.immutablePolicies.rewardPolicy).toBe(draft.rewardPolicy);
    expect(input.immutablePolicies.purposeCategory).toBe(draft.purposeCategory);
  });

  it('3b. 家長原始期待在禁改清單裡 —— AI 可以建議完成標準，不能改寫家長要什麼', () => {
    expect(IMMUTABLE_FIELDS).toContain('originalExpectation');
    expect(IMMUTABLE_FIELDS).toContain('rewardPolicy');
    expect(IMMUTABLE_FIELDS).toContain('coinAmount');
  });

  it('排程送的是一句人話，不是 recurrenceDays 陣列', () => {
    expect(typeof input.currentDraft.scheduleSummary).toBe('string');
    expect(serialised).not.toMatch(/"recurrenceDays"/);
  });

  it('五種 editor 都不會洩漏識別資訊', () => {
    for (const family of ALL_FAMILIES) {
      for (const variant of family.variants) {
        const draft = createTaskDraft(family, variant, CHILD, '6-9');
        const json = JSON.stringify(buildTaskAiInput({
          draft, variant, ageGroup: '6-9', childNickname: CHILD.nickname,
        }));
        expect({ variant: variant.id, leaked: json.includes('承恩') || json.includes('family-secret-id') })
          .toEqual({ variant: variant.id, leaked: false });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4-10. validator
// ---------------------------------------------------------------------------

function suggestion(overrides: Partial<TaskAiSuggestion> = {}): Record<string, unknown> {
  return {
    id: 'sug-1',
    kind: 'clarify_completion',
    fieldPath: 'completionDescription',
    currentValue: null,
    suggestedValue: '把讀到的一段講給家人聽',
    rationale: '「認真閱讀」很難判斷做到了沒。',
    expectedBenefit: 'clearer_expectation',
    confidence: 'high',
    ...overrides,
  };
}

function result(suggestions: unknown[]): Record<string, unknown> {
  return {
    status: 'suggestions',
    schemaVersion: 1,
    summary: '有幾個地方可以再清楚一點。',
    suggestions,
  };
}

describe('validator', () => {
  it('4. 合法的回傳會通過', () => {
    const out = validateTaskAiRecommendationResult(result([suggestion()]));
    expect(out.status).toBe('suggestions');
    expect(out.suggestions).toHaveLength(1);
  });

  it('4b. no_change 會通過', () => {
    const out = validateTaskAiRecommendationResult({
      status: 'no_change', schemaVersion: 1, summary: '目前設定已經清楚。', suggestions: [],
    });
    expect(out.status).toBe('no_change');
  });

  it('5. 未知的 fieldPath 被拒絕', () => {
    for (const bad of ['whatever', 'draft.title', 'task.name', '__proto__', 'constructor']) {
      const out = validateTaskAiRecommendationResult(result([suggestion({ fieldPath: bad as never })]));
      expect({ bad, status: out.status }).toEqual({ bad, status: 'unavailable' });
    }
  });

  it('6. 想改 rewardPolicy 被拒絕', () => {
    for (const path of ['rewardPolicy', 'reward_policy', 'purposeCategory', 'completionPolicy']) {
      const out = validateTaskAiRecommendationResult(result([suggestion({ fieldPath: path as never })]));
      expect({ path, status: out.status }).toEqual({ path, status: 'unavailable' });
    }
  });

  it('7. 想改幣值被拒絕', () => {
    for (const path of ['coinAmount', 'coin_amount', 'rewardCoinAmount', 'reward.coin.finalAmount', 'coin']) {
      const out = validateTaskAiRecommendationResult(result([
        suggestion({ fieldPath: path as never, suggestedValue: 30 }),
      ]));
      expect({ path, status: out.status }).toEqual({ path, status: 'unavailable' });
    }
  });

  it('7b. 想改家長原始期待被拒絕', () => {
    const out = validateTaskAiRecommendationResult(result([
      suggestion({ fieldPath: 'originalExpectation' as never }),
    ]));
    expect(out.status).toBe('unavailable');
  });

  it('8. 不安全的輸出整批回 unavailable，不是只丟掉壞的那一項', () => {
    const out = validateTaskAiRecommendationResult(result([
      suggestion({ id: 'good-1' }),
      suggestion({ id: 'bad', fieldPath: 'coinAmount' as never }),
      suggestion({ id: 'good-2' }),
    ]));
    // 家長不該看到「兩張看起來沒問題的卡」，而不知道第三張被扔了。
    expect(out).toEqual({
      status: 'unavailable', schemaVersion: 1, reason: 'UNSAFE_OUTPUT', suggestions: [],
    });
  });

  it('8b. 含 HTML tag 的文字視為不安全', () => {
    const out = validateTaskAiRecommendationResult(result([
      suggestion({ suggestedValue: '<img src=x onerror=alert(1)>' }),
    ]));
    expect(out.status).toBe('unavailable');
  });

  it('9. 過長的文字被拒絕', () => {
    const long = 'あ'.repeat(AI_LIMITS.maxTextValueLength + 1);
    expect(validateTaskAiRecommendationResult(result([suggestion({ suggestedValue: long })])).status)
      .toBe('unavailable');

    const longRationale = 'あ'.repeat(AI_LIMITS.maxRationaleLength + 1);
    expect(validateTaskAiRecommendationResult(result([suggestion({ rationale: longRationale })])).status)
      .toBe('unavailable');

    const longSummary = 'あ'.repeat(AI_LIMITS.maxSummaryLength + 1);
    expect(validateTaskAiRecommendationResult({ ...result([suggestion()]), summary: longSummary }).status)
      .toBe('unavailable');
  });

  it('9b. 超過數量上限被拒絕', () => {
    const many = Array.from({ length: AI_LIMITS.maxSuggestions + 1 }, (_, i) =>
      suggestion({ id: `sug-${i}` }));
    expect(validateTaskAiRecommendationResult(result(many)).status).toBe('unavailable');
  });

  it('9c. 離譜的數值被拒絕 —— 建議每次 9999 分鐘不是建議', () => {
    for (const [path, value] of [
      ['sessionMinutes', 9999], ['durationDays', 5000],
      ['weeklyFrequency', 99], ['reviewAfterDays', 5000],
      ['sessionMinutes', 0], ['sessionMinutes', -5], ['sessionMinutes', 12.5],
    ] as const) {
      const out = validateTaskAiRecommendationResult(result([
        suggestion({ fieldPath: path as never, suggestedValue: value, currentValue: 20 }),
      ]));
      expect({ path, value, status: out.status }).toEqual({ path, value, status: 'unavailable' });
    }
  });

  it('10. 重複的 id 被拒絕', () => {
    const out = validateTaskAiRecommendationResult(result([
      suggestion({ id: 'same' }), suggestion({ id: 'same', fieldPath: 'title' }),
    ]));
    expect(out.status).toBe('unavailable');
  });

  it('未知的 status 被拒絕', () => {
    for (const status of ['ok', 'error', 'partial', undefined, 42]) {
      expect(validateTaskAiRecommendationResult({ ...result([suggestion()]), status }).status)
        .toBe('unavailable');
    }
  });

  it('schemaVersion 不是 1 就拒絕', () => {
    expect(validateTaskAiRecommendationResult({ ...result([suggestion()]), schemaVersion: 2 }).status)
      .toBe('unavailable');
  });

  it('未知的 kind / benefit / confidence 被拒絕', () => {
    expect(validateTaskAiRecommendationResult(result([suggestion({ kind: 'diagnose_child' as never })])).status)
      .toBe('unavailable');
    expect(validateTaskAiRecommendationResult(result([suggestion({ expectedBenefit: 'more_obedient' as never })])).status)
      .toBe('unavailable');
    expect(validateTaskAiRecommendationResult(result([suggestion({ confidence: 'certain' as never })])).status)
      .toBe('unavailable');
  });

  it('空的 suggestedValue 被拒絕', () => {
    for (const empty of ['', '   ', []]) {
      expect(validateTaskAiRecommendationResult(result([suggestion({ suggestedValue: empty as never })])).status)
        .toBe('unavailable');
    }
  });

  it('值的型別與 fieldPath 不符就拒絕', () => {
    // sessionMinutes 是數字欄位，給字串不行。
    expect(validateTaskAiRecommendationResult(result([
      suggestion({ fieldPath: 'sessionMinutes', suggestedValue: '20 分鐘' as never }),
    ])).status).toBe('unavailable');
    // title 是字串欄位，給陣列不行。
    expect(validateTaskAiRecommendationResult(result([
      suggestion({ fieldPath: 'title', suggestedValue: ['a', 'b'] as never }),
    ])).status).toBe('unavailable');
  });

  it('no_change 帶著建議是自相矛盾的回傳', () => {
    expect(validateTaskAiRecommendationResult({
      status: 'no_change', schemaVersion: 1, summary: '沒問題', suggestions: [suggestion()],
    }).status).toBe('unavailable');
  });

  it('不是物件的東西一律拒絕', () => {
    for (const junk of [null, undefined, 'text', 42, [], true]) {
      expect(validateTaskAiRecommendationResult(junk).status).toBe('unavailable');
    }
  });
});
