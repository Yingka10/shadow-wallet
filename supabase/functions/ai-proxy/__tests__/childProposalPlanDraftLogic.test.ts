// P0-3 — Plan Draft 的純邏輯
//
// 這一支釘住的是「模型講什麼都不算數」的那幾條線：
//   · 孩子選過的節奏，模型改不掉
//   · A/B 不會因為任何建議變成可以發幣
//   · 幣值只從規則引擎來
//   · 看不懂的輸出就是沒有草稿，不是用預設值頂著

import { runEligibilityGate } from '../rewardEligibility';
import {
  buildPlanDraftPrompt,
  buildPricingResult,
  composePlanDraft,
  describeCadenceForPrompt,
  normalizePlanDraftUnderstanding,
  normalizeSuggestedCadence,
  planDraftInputIsUsable,
  resolveDurationType,
  resolveRewardPolicy,
  toEligibilityDurationType,
  type ChildProposalPlanDraftInput,
  type PayoutType,
  type PlanDraftPricing,
  type PlanDraftUnderstanding,
} from '../childProposalPlanDraftLogic';

const DEMO_GOAL = '我想兩週把這本書讀完';

function input(
  overrides: Partial<ChildProposalPlanDraftInput> = {},
): ChildProposalPlanDraftInput {
  return {
    schemaVersion: 2,
    ageGroup: '6-9',
    childOriginalGoal: DEMO_GOAL,
    childOriginalMotivation: '因為同學說這本書很好看',
    proposalSource: 'child',
    cadence: { mode: 'weekly_frequency', weeklyFrequency: 4 },
    preferredTime: null,
    childRewardPreference: 'hopes_for_coin',
    ...overrides,
  };
}

function understanding(
  overrides: Partial<PlanDraftUnderstanding> = {},
): PlanDraftUnderstanding {
  return {
    planTitle: '兩週閱讀挑戰',
    planSummary: '先用一週 4 次的節奏，每次讀一個不會太大的段落。',
    completionDescription: '完成一次約定的閱讀時段',
    activityKind: 'reading',
    nextStepSuggestion: '選一本想看的書，閱讀約 15 分鐘',
    category: 'D',
    categoryReason: '練習閱讀，有進步軌跡',
    estimatedMinutes: 15,
    difficulty: 'standard',
    outcomeBased: false,
    needsClarification: false,
    clarificationQuestion: null,
    durationDays: 14,
    suggestedCadence: null,
    ...overrides,
  };
}

const UNPRICED: PlanDraftPricing = { status: 'unpriced', policyVersion: 'coin-policy-1.0.0' };
const PRICED: PlanDraftPricing = {
  status: 'priced',
  coins: 10,
  band: '11-20',
  policyVersion: 'coin-policy-1.0.0',
};

function gateFor(u: PlanDraftUnderstanding, ageGroup: '2-4' | '6-9' = '6-9') {
  return runEligibilityGate({
    category: u.category,
    ageGroup,
    taskSource: 'child',
    durationType: toEligibilityDurationType(resolveDurationType(null, u.durationDays)),
    outcomeBased: u.outcomeBased,
    needsClarification: u.needsClarification,
    clarificationQuestion: u.clarificationQuestion,
  });
}

// ---------------------------------------------------------------------------

describe('孩子選過的節奏，模型改不掉', () => {
  it('孩子選一週 4 次 → 草稿就是一週 4 次，即使模型說每天', () => {
    const draft = composePlanDraft({
      input: input(),
      understanding: understanding({
        suggestedCadence: { mode: 'fixed_days', days: [0, 1, 2, 3, 4, 5, 6] },
      }),
      gate: gateFor(understanding()),
      pricing: UNPRICED,
      model: 'test-model',
    });

    expect(draft.cadence).toEqual({ mode: 'weekly_frequency', weeklyFrequency: 4 });
    expect(draft.cadenceSource).toBe('child');
  });

  it('孩子選固定星期二四 → 原樣保留', () => {
    const draft = composePlanDraft({
      input: input({ cadence: { mode: 'fixed_days', days: [2, 4] } }),
      understanding: understanding({
        suggestedCadence: { mode: 'weekly_frequency', weeklyFrequency: 7 },
      }),
      gate: gateFor(understanding()),
      pricing: UNPRICED,
      model: 'test-model',
    });

    expect(draft.cadence).toEqual({ mode: 'fixed_days', days: [2, 4] });
    expect(draft.cadenceSource).toBe('child');
  });

  it('孩子沒決定（我還不知道）→ 這時才採用 AI 的建議', () => {
    const draft = composePlanDraft({
      input: input({ cadence: null }),
      understanding: understanding({
        suggestedCadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
      }),
      gate: gateFor(understanding()),
      pricing: UNPRICED,
      model: 'test-model',
    });

    expect(draft.cadence).toEqual({ mode: 'weekly_frequency', weeklyFrequency: 3 });
    expect(draft.cadenceSource).toBe('ai_suggested');
  });

  it('孩子沒決定、AI 也沒給 → 就是沒有節奏，不編一個', () => {
    const draft = composePlanDraft({
      input: input({ cadence: null }),
      understanding: understanding({ suggestedCadence: null }),
      gate: gateFor(understanding()),
      pricing: UNPRICED,
      model: 'test-model',
    });

    expect(draft.cadence).toBeNull();
    expect(draft.cadenceSource).toBe('none');
  });

  it('prompt 在孩子選過時明講不要改，沒選時才請它建議', () => {
    expect(buildPlanDraftPrompt(input())).toContain('不要改掉它');
    expect(buildPlanDraftPrompt(input({ cadence: null }))).toContain('孩子還沒決定節奏');
  });
});

describe('孩子的原話是 source of truth', () => {
  it('prompt 帶的是原話，而且明講不要換掉孩子想做的事', () => {
    const prompt = buildPlanDraftPrompt(input());
    expect(prompt).toContain(DEMO_GOAL);
    expect(prompt).toContain('不要換掉孩子想做的事');
  });

  it('組出來的草稿沒有任何欄位可以寫回原話', () => {
    const draft = composePlanDraft({
      input: input(),
      understanding: understanding(),
      gate: gateFor(understanding()),
      pricing: UNPRICED,
      model: 'test-model',
    });

    expect(Object.keys(draft)).not.toContain('childOriginalGoal');
    expect(Object.keys(draft)).not.toContain('childOriginalMotivation');
  });
});

describe('回饋資格走既有規則引擎', () => {
  it('D 類 6-9 由孩子提出 → 可以發幣', () => {
    const u = understanding({ category: 'D' });
    const draft = composePlanDraft({
      input: input(), understanding: u, gate: gateFor(u), pricing: UNPRICED, model: 'm',
    });
    expect(draft.rewardPolicy).toBe('coin_eligible');
    expect(draft.rewardEligibility).toBe('allowed');
  });

  it('B 類（家庭參與）不會因為孩子想要成長幣就變成可發幣', () => {
    const u = understanding({ category: 'B' });
    const draft = composePlanDraft({
      // 孩子明確希望有成長幣 —— 那是願望，不是資格。
      input: input({ childRewardPreference: 'hopes_for_coin' }),
      understanding: u,
      gate: gateFor(u),
      pricing: { status: 'coin_disabled', policyVersion: 'coin-policy-1.0.0' },
      model: 'm',
    });

    expect(draft.rewardPolicy).toBe('family_contribution');
    expect(draft.rewardEligibility).toBe('blocked');
    expect(draft.aiSuggestedCoinAmount).toBeNull();
  });

  it('A 類是生活常規 → 只有進度，沒有幣', () => {
    const u = understanding({ category: 'A' });
    const draft = composePlanDraft({
      input: input(), understanding: u, gate: gateFor(u),
      pricing: { status: 'coin_disabled', policyVersion: 'coin-policy-1.0.0' }, model: 'm',
    });
    expect(draft.rewardPolicy).toBe('progress_only');
    expect(draft.rewardEligibility).toBe('blocked');
  });

  it('結果導向被閘門擋下 → 不承諾幣，並留下要家長看的理由', () => {
    const u = understanding({ outcomeBased: true });
    const gate = gateFor(u);
    const draft = composePlanDraft({
      input: input(), understanding: u, gate,
      pricing: { status: 'gated', policyVersion: 'coin-policy-1.0.0' }, model: 'm',
    });

    expect(draft.rewardPolicy).toBe('progress_only');
    expect(draft.rewardEligibility).toBe('blocked');
    expect(draft.blockingIssues.join('')).toContain('結果導向');
  });

  it('2-4 歲不獨立發幣（沿用閘門的年齡規則）', () => {
    const u = understanding();
    const draft = composePlanDraft({
      input: input({ ageGroup: '2-4' }), understanding: u, gate: gateFor(u, '2-4'),
      pricing: { status: 'gated', policyVersion: 'coin-policy-1.0.0' }, model: 'm',
    });
    expect(draft.rewardEligibility).toBe('blocked');
  });

  it('resolveRewardPolicy 只看閘門，不看孩子的期待', () => {
    const blocked = runEligibilityGate({
      category: 'C', ageGroup: '6-9', taskSource: 'parent', durationType: 'recurring',
    });
    expect(resolveRewardPolicy(blocked)).toBe('progress_only');
  });
});

describe('幣值只從規則引擎來', () => {
  it('unpriced（政策數字未定案）→ 沒有建議幣值，而不是猜一個', () => {
    const u = understanding();
    const draft = composePlanDraft({
      input: input(), understanding: u, gate: gateFor(u), pricing: UNPRICED, model: 'm',
    });
    expect(draft.pricingStatus).toBe('unpriced');
    expect(draft.aiSuggestedCoinAmount).toBeNull();
  });

  it('priced → 建議幣值就是規則引擎算出來的那個數字', () => {
    const u = understanding();
    const draft = composePlanDraft({
      input: input(), understanding: u, gate: gateFor(u), pricing: PRICED, model: 'm',
    });
    expect(draft.aiSuggestedCoinAmount).toBe(10);
  });

  it('payoutType 恆為 per_completion，不從 cadence 推導', () => {
    // demo 主線本身用的是 weekly_frequency 節奏，仍然必須是 per_completion——
    // 這正是這個欄位「不能從 cadence 推導」的直接證據。
    const u = understanding();
    const draft = composePlanDraft({
      input: input({ cadence: { mode: 'weekly_frequency', weeklyFrequency: 4 } }),
      understanding: u, gate: gateFor(u), pricing: PRICED, model: 'm',
    });
    expect(draft.payoutType).toBe('per_completion');
  });

  it('priced + coin_eligible → pricing.resolved，sessionCoinReference 跟 aiSuggestedCoinAmount 相等', () => {
    const u = understanding();
    const draft = composePlanDraft({
      input: input(), understanding: u, gate: gateFor(u), pricing: PRICED, model: 'm',
    });
    expect(draft.pricing).toEqual({
      payoutType: 'per_completion',
      status: 'resolved',
      finalRewardCoins: 10,
      sessionCoinReference: 10,
      basis: {
        policyVersion: 'coin-policy-1.0.0',
        ageGroup: '6-9',
        taskType: 'D',
        band: '11-20',
        difficulty: u.difficulty,
        estimatedMinutes: u.estimatedMinutes,
        computedFrom: 'deterministic',
      },
    });
    expect(draft.sessionCoinReference).toBe(10);
    expect(draft.aiSuggestedCoinAmount).toBe(draft.sessionCoinReference);
  });

  it('unpriced → pricing 是 null，不是一個假的 per_completion 分支', () => {
    const u = understanding();
    const draft = composePlanDraft({
      input: input(), understanding: u, gate: gateFor(u), pricing: UNPRICED, model: 'm',
    });
    expect(draft.pricing).toBeNull();
    expect(draft.sessionCoinReference).toBeNull();
  });

  it('模型回應裡的任何數字都到不了建議幣值 —— normalize 根本不讀它', () => {
    const parsed = normalizePlanDraftUnderstanding({
      ...understanding(),
      coins: 999,
      suggestedCoins: 999,
      aiSuggestedCoinAmount: 999,
    });
    expect(parsed).not.toBeNull();
    expect(JSON.stringify(parsed)).not.toContain('999');
  });

  it('prompt 明講不要決定幣值', () => {
    expect(buildPlanDraftPrompt(input())).toContain('不要決定任何幣值');
  });
});

describe('buildPricingResult — payout-aware 定價', () => {
  const baseArgs = {
    pricing: PRICED,
    rewardPolicy: 'coin_eligible' as const,
    ageGroup: '6-9' as const,
    category: 'D' as const,
    difficulty: 'standard' as const,
    estimatedMinutes: 15,
  };

  it('rewardPolicy 不是 coin_eligible → null', () => {
    expect(
      buildPricingResult({ ...baseArgs, payoutType: 'per_completion', rewardPolicy: 'progress_only' }),
    ).toBeNull();
  });

  it('session 價沒算出來（unpriced）→ null，不管 payoutType 是什麼', () => {
    expect(
      buildPricingResult({ ...baseArgs, payoutType: 'per_completion', pricing: UNPRICED }),
    ).toBeNull();
  });

  it('per_completion + priced → resolved，finalRewardCoins 等於 sessionCoinReference', () => {
    const result = buildPricingResult({ ...baseArgs, payoutType: 'per_completion' });
    expect(result).toMatchObject({
      payoutType: 'per_completion',
      status: 'resolved',
      finalRewardCoins: 10,
      sessionCoinReference: 10,
    });
  });

  it('per_period → session_reference_only，型別上沒有 finalRewardCoins', () => {
    const result = buildPricingResult({ ...baseArgs, payoutType: 'per_period' });
    expect(result).toMatchObject({
      payoutType: 'per_period',
      status: 'session_reference_only',
      sessionCoinReference: 10,
      gapCode: 'PERIOD_PRICING_POLICY_GAP',
    });
    expect(result && 'finalRewardCoins' in result).toBe(false);
  });

  it.each<PayoutType>(['per_milestone', 'final_completion'])(
    '%s → policy_gap，型別上沒有 finalRewardCoins',
    (payoutType) => {
      const result = buildPricingResult({ ...baseArgs, payoutType });
      expect(result).toMatchObject({
        payoutType,
        status: 'policy_gap',
        sessionCoinReference: 10,
        gapCode: 'MILESTONE_PRICING_POLICY_GAP',
      });
      expect(result && 'finalRewardCoins' in result).toBe(false);
    },
  );

  it('basis 帶著算出這個數字的完整依據', () => {
    const result = buildPricingResult({ ...baseArgs, payoutType: 'per_completion' });
    expect(result?.basis).toEqual({
      policyVersion: 'coin-policy-1.0.0',
      ageGroup: '6-9',
      taskType: 'D',
      band: '11-20',
      difficulty: 'standard',
      estimatedMinutes: 15,
      computedFrom: 'deterministic',
    });
  });
});

describe('長期只是執行形式，不是第五個類別', () => {
  it('兩週 → durationDays 14、long_term', () => {
    const u = understanding({ durationDays: 14 });
    const draft = composePlanDraft({
      input: input(), understanding: u, gate: gateFor(u), pricing: UNPRICED, model: 'm',
    });
    expect(draft.durationDays).toBe(14);
    expect(draft.durationType).toBe('long_term');
    // 類別仍然是「為什麼做」，沒有被期間污染。
    expect(draft.category).toBe('D');
  });

  it('一次就好 → one_time，而且沒有期間', () => {
    expect(resolveDurationType({ mode: 'one_time' }, null)).toBe('one_time');
    expect(resolveDurationType({ mode: 'one_time' }, 14)).toBe('one_time');
  });

  it('有節奏沒期間 → recurring', () => {
    expect(resolveDurationType({ mode: 'weekly_frequency', weeklyFrequency: 4 }, null))
      .toBe('recurring');
  });

  it('規則引擎的詞彙是 single / recurring / long_term', () => {
    expect(toEligibilityDurationType('one_time')).toBe('single');
    expect(toEligibilityDurationType('recurring')).toBe('recurring');
    expect(toEligibilityDurationType('long_term')).toBe('long_term');
  });
});

describe('D 類獎勵投入，不是結果', () => {
  it('prompt 給了可以與不可以的例子', () => {
    const prompt = buildPlanDraftPrompt(input());
    expect(prompt).toContain('完成一次約定的閱讀時段');
    expect(prompt).toContain('投入或練習');
    expect(prompt).toContain('不是結果或成績');
  });

  it('completionDescription 原樣進草稿（是 P0-5 要用的東西）', () => {
    const u = understanding({ completionDescription: '完成一次約定的閱讀時段' });
    const draft = composePlanDraft({
      input: input(), understanding: u, gate: gateFor(u), pricing: UNPRICED, model: 'm',
    });
    expect(draft.completionDescription).toBe('完成一次約定的閱讀時段');
  });
});

describe('看不懂的輸出就是沒有草稿', () => {
  it.each([
    ['null', null],
    ['字串', 'oops'],
    ['陣列', []],
    ['空物件', {}],
  ])('%s → null', (_label, value) => {
    expect(normalizePlanDraftUnderstanding(value)).toBeNull();
  });

  it.each([
    ['缺標題', { planTitle: '' }],
    ['缺摘要', { planSummary: '   ' }],
    ['缺完成說明', { completionDescription: '' }],
    ['類別看不懂', { category: 'Z' }],
    ['估時不是數字', { estimatedMinutes: '十五' }],
    ['估時是 0', { estimatedMinutes: 0 }],
    ['估時超過上限', { estimatedMinutes: 999 }],
    ['期間超過上限', { durationDays: 5000 }],
  ])('%s → null', (_label, patch) => {
    expect(normalizePlanDraftUnderstanding({ ...understanding(), ...patch })).toBeNull();
  });

  it('活動種類認不出來時退回 other —— 挑一個「最像」的會寫出不相干的完成標準', () => {
    const parsed = normalizePlanDraftUnderstanding({
      ...understanding(), activityKind: '看影片學東西',
    });
    expect(parsed?.activityKind).toBe('other');
  });

  it.each(['reading', 'practice', 'exercise', 'creating', 'learning', 'helping', 'other'])(
    '認得 %s',
    (activityKind) => {
      const parsed = normalizePlanDraftUnderstanding({ ...understanding(), activityKind });
      expect(parsed?.activityKind).toBe(activityKind);
    },
  );

  it('下一步建議可以沒有 —— 想不到就是 null，不硬湊', () => {
    expect(
      normalizePlanDraftUnderstanding({ ...understanding(), nextStepSuggestion: null }),
    ).toMatchObject({ nextStepSuggestion: null });
    expect(
      normalizePlanDraftUnderstanding({ ...understanding(), nextStepSuggestion: '   ' }),
    ).toMatchObject({ nextStepSuggestion: null });
  });

  it('prompt 有要求活動種類與下一步，而且給了封閉清單', () => {
    const prompt = buildPlanDraftPrompt(input());
    expect(prompt).toContain('activityKind 從清單裡挑一個最接近的，不要自己造詞');
    expect(prompt).toContain('nextStepSuggestion');
    expect(prompt).toContain('想不到具體的就給 null');
  });

  it('難度看不懂時退回 standard，不整筆丟掉', () => {
    const parsed = normalizePlanDraftUnderstanding({ ...understanding(), difficulty: '超難' });
    expect(parsed?.difficulty).toBe('standard');
  });

  it('節奏建議形狀不對就當作沒建議，不修補', () => {
    expect(normalizeSuggestedCadence({ mode: 'weekly_frequency' })).toBeNull();
    expect(normalizeSuggestedCadence({ mode: 'weekly_frequency', weeklyFrequency: 9 })).toBeNull();
    expect(normalizeSuggestedCadence({ mode: 'fixed_days', days: [] })).toBeNull();
    expect(normalizeSuggestedCadence({ mode: 'fixed_days', days: [9] })).toBeNull();
    expect(normalizeSuggestedCadence({ mode: 'plan_schedule' })).toBeNull();
    expect(normalizeSuggestedCadence('每天')).toBeNull();
  });

  it('合法的節奏建議會被排序去重', () => {
    expect(normalizeSuggestedCadence({ mode: 'fixed_days', days: [4, 2, 2] }))
      .toEqual({ mode: 'fixed_days', days: [2, 4] });
  });
});

describe('沒有可用輸入就不呼叫模型', () => {
  it('空目標 / 看不懂的年齡段 → 不可用', () => {
    expect(planDraftInputIsUsable(input({ childOriginalGoal: '   ' }))).toBe(false);
    expect(
      planDraftInputIsUsable(input({ ageGroup: '99-100' as ChildProposalPlanDraftInput['ageGroup'] })),
    ).toBe(false);
  });

  it('demo 的那一筆是可用的', () => {
    expect(planDraftInputIsUsable(input())).toBe(true);
  });
});

describe('prompt 用孩子的語言描述節奏', () => {
  it.each([
    [{ mode: 'weekly_frequency' as const, weeklyFrequency: 4 }, '一週 4 次'],
    [{ mode: 'fixed_days' as const, days: [2, 4] }, '固定每週二、四'],
    [{ mode: 'one_time' as const }, '先做一次看看'],
  ])('%o → %s', (cadence, expected) => {
    expect(describeCadenceForPrompt(cadence)).toBe(expected);
  });

  it('沒選就說他想跟爸媽討論', () => {
    expect(describeCadenceForPrompt(null)).toContain('一起討論');
  });
});

describe('model 名稱誠實記錄', () => {
  it('組出來的草稿帶著真正回答的 model', () => {
    const u = understanding();
    const draft = composePlanDraft({
      input: input(), understanding: u, gate: gateFor(u), pricing: UNPRICED,
      model: 'gemini-flash-lite-latest',
    });
    expect(draft.model).toBe('gemini-flash-lite-latest');
  });
});
