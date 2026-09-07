// P1-A3 §9 / §10 — P0 Plan Draft 只能當 enrichment evidence
//
// 這一組守的是整包最大的那個 guard：**P0 Plan Draft 不可以整包複製。**
//
// 它會產出一份看起來很完整的計畫（標題、摘要、下一步、建議節奏），
// 而且常常比孩子寫的漂亮。整包搬過來的話，孩子確認的那份計畫會被一份
// 他從來沒看過的東西取代 —— 而那正是 P1 存在的理由被推翻。

import { toChildPlanEnrichment } from '../formalPlan/toChildPlanEnrichment';
import type {
  ChildProposalPlanDraft,
  ChildProposalPlanDraftInput,
} from '../../childProposal/planDraft/types';

const INPUT: ChildProposalPlanDraftInput = {
  schemaVersion: 2,
  ageGroup: '6-9',
  childOriginalGoal: '我想兩週讀完一本書',
  childOriginalMotivation: null,
  proposalSource: 'child',
  cadence: null,
  preferredTime: null,
  childRewardPreference: 'hopes_for_coin',
};

/** 一份「什麼都想幫你決定好」的草稿 —— 正是我們要擋的那種。 */
const DRAFT: ChildProposalPlanDraft = {
  schemaVersion: 2,
  planTitle: '兩週閱讀養成計畫',
  planSummary: '每天睡前閱讀 15 分鐘，兩週內完成一本書。',
  completionDescription: '兩週後把整本書讀完',
  activityKind: 'reading',
  nextStepSuggestion: '今晚讀完第一章',
  cadence: { mode: 'weekly_frequency', weeklyFrequency: 5 },
  cadenceSource: 'ai_suggested',
  estimatedMinutes: 15,
  durationType: 'long_term',
  durationDays: 14,
  category: 'D',
  categoryReason: '學習與技能',
  difficulty: 'standard',
  rewardPolicy: 'coin_eligible',
  rewardEligibility: 'allowed',
  rewardPolicyVersion: 'coin-policy@2026-07',
  pricingStatus: 'priced',
  payoutType: 'per_completion',
  pricing: {
    payoutType: 'per_completion',
    status: 'resolved',
    finalRewardCoins: 8,
    sessionCoinReference: 8,
    basis: {
      policyVersion: 'coin-policy@2026-07',
      ageGroup: '6-9',
      taskType: 'D',
      band: '11-20',
      difficulty: 'standard',
      estimatedMinutes: 15,
      computedFrom: 'deterministic',
    },
  },
  sessionCoinReference: 8,
  aiSuggestedCoinAmount: 8,
  blockingIssues: [],
  requiresConfirmation: [],
  warnings: [],
  clarificationQuestion: null,
  model: 'test-model',
};

function enrich(overrides: Partial<ChildProposalPlanDraft> = {}) {
  return toChildPlanEnrichment({
    input: INPUT,
    draft: { ...DRAFT, ...overrides },
    requestId: 'req-1',
    generatedAt: '2026-08-14T00:00:00.000Z',
  });
}

describe('不可以使用的欄位，一個都沒有進來', () => {
  it('P0 的標題／摘要／下一步／建議節奏全部不在 enrichment 裡', () => {
    const result = enrich() as unknown as Record<string, unknown>;
    for (const key of [
      'planTitle',
      'planSummary',
      'nextStep',
      'nextStepSuggestion',
      'cadence',
      'cadenceSource',
      'progressModel',
    ]) {
      expect({ key, present: key in result }).toEqual({ key, present: false });
    }
  });

  it('那些字也沒有從別的鍵偷渡進來', () => {
    // 只看 enrichment 本體。aiSnapshot 是稽核證據，它**應該**留著
    // 「模型當時想寫什麼」—— 那正是它存在的理由。
    const { aiSnapshot: _snapshot, ...rest } = enrich();
    const serialized = JSON.stringify(rest);
    expect(serialized).not.toContain(DRAFT.planTitle);
    expect(serialized).not.toContain(DRAFT.planSummary);
    expect(serialized).not.toContain(DRAFT.nextStepSuggestion as string);
  });

  it('決定好的幣值一個都不帶', () => {
    // ⚠️ sessionCoinReference / payoutType **不在**這張清單裡（P1-A4A.1）。
    //    它們是規則引擎的判定，會寫進正式的 policy evidence 欄位；
    //    這張清單擋的是「已經決定要發多少」那一類欄位。
    //    兩者的差別見下面那一組。
    const { aiSnapshot: _snapshot, ...rest } = enrich();
    const serialized = JSON.stringify(rest);
    for (const forbidden of [
      'coinAmount',
      'finalRewardCoins',
      'aiSuggestedCoinAmount',
      'confirmedCoinAmount',
      'finalAmount',
    ]) {
      expect({ forbidden, present: serialized.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });
});

describe('可以使用的欄位，來源是既有的正式邏輯', () => {
  it('完成標準是固定句型，不是模型那一句', () => {
    // 模型寫的是「兩週後把整本書讀完」—— 結果導向，孩子讀了 13 天
    // 仍然是「沒完成」。正式欄位用 canonicalCompletionDescription 的句型。
    const result = enrich();
    expect(result.completionDescription).toBe('完成一次約定的閱讀時段');
    expect(result.completionDescription).not.toBe(DRAFT.completionDescription);
  });

  it('分類、投入量、期間照抄既有草稿', () => {
    const result = enrich();
    expect(result.purposeCategory).toBe('D');
    expect(result.estimatedMinutes).toBe(15);
    expect(result.durationType).toBe('long_term');
    expect(result.durationDays).toBe(14);
  });

  it('回饋判定原封不動地沿用規則引擎的結果', () => {
    const result = enrich();
    expect(result.reward).toEqual({
      policy: 'coin_eligible',
      eligibility: 'allowed',
      policyVersion: 'coin-policy@2026-07',
      // policy evidence（P1-A4A.1）：既有規則鏈算出的一次投入參考價與
      // 結算語意，照抄不加工。它們會成為正式欄位，家長同意那一步拿
      // 現在重算的結果跟它們對帳 —— 這一層動一個數字，那個對帳就失真。
      sessionCoinReference: 8,
      payoutType: 'per_completion',
    });
    expect(result.reward.sessionCoinReference).toBe(DRAFT.sessionCoinReference);
    expect(result.reward.payoutType).toBe(DRAFT.payoutType);
  });

  it('不能發幣的計畫，參考價照樣照抄 null —— 不補一個數字', () => {
    const result = enrich({
      category: 'B',
      rewardPolicy: 'family_contribution',
      rewardEligibility: 'blocked',
      pricingStatus: 'unpriced',
      sessionCoinReference: null,
      aiSuggestedCoinAmount: null,
    });
    expect(result.reward.sessionCoinReference).toBeNull();
  });

  it('B 類家庭參與不會因為孩子想要幣就變成可發幣', () => {
    // 孩子的 childRewardPreference 是 'hopes_for_coin'（見 INPUT），但資格由
    // rewardEligibility 閘門判定，這一層只是傳遞 —— 不做任何升級。
    const result = enrich({
      category: 'B',
      rewardPolicy: 'family_contribution',
      rewardEligibility: 'blocked',
    });
    expect(result.purposeCategory).toBe('B');
    expect(result.reward.policy).toBe('family_contribution');
    expect(result.reward.eligibility).toBe('blocked');
  });

  it('durationDays 是 null 時整個鍵不出現，不會變成 0', () => {
    const result = enrich({ durationDays: null });
    expect('durationDays' in result).toBe(false);
  });
});

describe('snapshot 是稽核證據，不是 canonical', () => {
  it('記下模型當時想寫的完成說明與下一步', () => {
    const snapshot = enrich().aiSnapshot as {
      plan: {
        aiCompletionDescriptionCandidate: string;
        canonicalCompletionDescription: string;
        aiNextStepSuggestion: string | null;
        canonicalNextStep: string | null;
        progressModel: string | null;
      };
    };
    expect(snapshot.plan.aiCompletionDescriptionCandidate).toBe('兩週後把整本書讀完');
    expect(snapshot.plan.canonicalCompletionDescription).toBe('完成一次約定的閱讀時段');
    expect(snapshot.plan.aiNextStepSuggestion).toBe('今晚讀完第一章');
    // P1 的下一步來自孩子確認過的 nextAction，不由這條鏈決定。
    // 記一個沒有被採用的值，之後讀 snapshot 的人會以為它生效過。
    expect(snapshot.plan.canonicalNextStep).toBeNull();
    expect(snapshot.plan.progressModel).toBeNull();
  });
});

describe('provider 中立', () => {
  it('enrichment 裡沒有任何 provider 專屬字眼', () => {
    const serialized = JSON.stringify(enrich()).toLowerCase();
    for (const forbidden of ['gemini', 'google', 'openai', 'anthropic', 'candidates']) {
      expect({ forbidden, present: serialized.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });
});

// ---------------------------------------------------------------------------
// 孩子選的份量要把幣值錨點一起帶走
// ---------------------------------------------------------------------------
//
// 2026-09-07 線上抓到：家長按確認時被擋在「成長幣建議已更新，請重新整理
// 後再確認。」，而重新整理沒有用 —— 錯的是資料本身。
//
// publish RPC 的規則是「份量孩子講過就照他的」，所以 estimated_minutes
// 被改成孩子選的 10 分鐘；但 policy_session_coin_reference 直接沿用
// enrichment，而 enrichment 是拿 P0 草稿猜的 15 分鐘定的價（10 幣）。
// 於是那一列自己就矛盾：10 分鐘的計畫掛著 15 分鐘的價。
//
// 家長端確認時會拿計畫的份量重算（10 分鐘 → 6 幣）再跟錨點對帳，
// 6 ≠ 10，於是**永遠**確認不了。
//
// 這跟期限那顆是同一道接縫：P0 草稿的輸入只有孩子最初打的那段話，
// 不含規劃對話。期限與份量都已經改由孩子決定，只有幣值還留在草稿那側。

describe('孩子選的份量會把幣值錨點一起改掉', () => {
  const enrich = (childSessionMinutes: number | null) =>
    toChildPlanEnrichment({
      input: INPUT,
      draft: DRAFT,
      requestId: 'req-1',
      generatedAt: '2026-09-07T00:00:00.000Z',
      childSessionMinutes,
    });

  it('estimatedMinutes 跟著孩子，不是草稿', () => {
    expect(enrich(10).estimatedMinutes).toBe(10);
  });

  it('錨點用孩子的份量重新定價 —— 6-9 歲 D 類 10 分鐘是 6 幣', () => {
    // 這個數字不是抄來的：草稿的 15 分鐘在政策裡是 10 幣，10 分鐘是 6 幣。
    // 錨點必須等於**家長端之後會重算出來的那個值**，否則對帳永遠失敗。
    expect(enrich(10).reward.sessionCoinReference).toBe(6);
  });

  it('份量一樣時原封不動沿用草稿的錨點', () => {
    // 沒有分歧就不要重算 —— 重算等於讓同一件事有兩個計算來源。
    expect(enrich(DRAFT.estimatedMinutes).reward.sessionCoinReference).toBe(
      DRAFT.sessionCoinReference,
    );
  });

  it('孩子沒講份量時（null）也沿用草稿', () => {
    expect(enrich(null).estimatedMinutes).toBe(DRAFT.estimatedMinutes);
    expect(enrich(null).reward.sessionCoinReference).toBe(DRAFT.sessionCoinReference);
  });

  it('不發幣的類別不會因為重算而長出一個幣值', () => {
    const result = toChildPlanEnrichment({
      input: INPUT,
      draft: { ...DRAFT, category: 'B', sessionCoinReference: null },
      requestId: 'req-1',
      generatedAt: '2026-09-07T00:00:00.000Z',
      childSessionMinutes: 10,
    });
    expect(result.reward.sessionCoinReference).toBeNull();
  });
});
