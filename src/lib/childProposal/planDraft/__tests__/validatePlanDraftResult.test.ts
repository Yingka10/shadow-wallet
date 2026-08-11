// P0-3 — 網路上回來的東西要再驗一次
//
// 為什麼 server 驗過了這裡還要驗：中間可能有代理、快取、或一個部署到一半
// 的舊版 Function。而這一層的下游是**寫進資料庫**，放行一份形狀不對的東西
// 就是留下一列 plan_title 是 undefined 的計畫版本。

import { validatePlanDraftResult } from '../validatePlanDraftResult';
import type { ChildProposalPlanDraft } from '../types';

function draft(overrides: Partial<ChildProposalPlanDraft> = {}): ChildProposalPlanDraft {
  return {
    schemaVersion: 1,
    planTitle: '兩週閱讀挑戰',
    planSummary: '先用一週 4 次的節奏開始。',
    completionDescription: '完成一次約定的閱讀時段',
    activityKind: 'reading',
    nextStepSuggestion: '選一本想看的書，閱讀約 15 分鐘',
    cadence: { mode: 'weekly_frequency', weeklyFrequency: 4 },
    cadenceSource: 'child',
    estimatedMinutes: 15,
    durationType: 'long_term',
    durationDays: 14,
    category: 'D',
    categoryReason: '練習閱讀',
    difficulty: 'standard',
    rewardPolicy: 'coin_eligible',
    rewardEligibility: 'allowed',
    rewardPolicyVersion: 'coin-policy-1.0.0',
    pricingStatus: 'priced',
    aiSuggestedCoinAmount: 10,
    blockingIssues: [],
    requiresConfirmation: [],
    warnings: [],
    clarificationQuestion: null,
    model: 'gemini-flash-latest',
    ...overrides,
  };
}

function ok(overrides: Partial<ChildProposalPlanDraft> = {}) {
  return validatePlanDraftResult({ status: 'draft', schemaVersion: 1, draft: draft(overrides) });
}

function bad(patch: Record<string, unknown>) {
  return validatePlanDraftResult({
    status: 'draft',
    schemaVersion: 1,
    draft: { ...draft(), ...patch },
  });
}

describe('正常的回應', () => {
  it('原樣通過', () => {
    const result = ok();
    expect(result.status).toBe('draft');
    if (result.status === 'draft') {
      expect(result.draft.planTitle).toBe('兩週閱讀挑戰');
      expect(result.draft.cadence).toEqual({ mode: 'weekly_frequency', weeklyFrequency: 4 });
    }
  });

  it('沒有節奏時 cadenceSource 必須是 none', () => {
    expect(ok({ cadence: null, cadenceSource: 'none' }).status).toBe('draft');
  });
});

describe('看不懂的一律 INVALID_RESPONSE', () => {
  it.each([
    ['null', null],
    ['字串', 'nope'],
    ['沒有 status', { schemaVersion: 1 }],
    ['沒見過的 status', { status: 'maybe', schemaVersion: 1 }],
    ['schema 版本不同', { status: 'draft', schemaVersion: 2, draft: {} }],
    ['draft 是空的', { status: 'draft', schemaVersion: 1, draft: {} }],
  ])('%s', (_label, value) => {
    expect(validatePlanDraftResult(value)).toEqual({
      status: 'unavailable', schemaVersion: 1, reason: 'INVALID_RESPONSE',
    });
  });

  it.each([
    ['缺標題', { planTitle: '' }],
    ['標題過長', { planTitle: 'x'.repeat(200) }],
    ['缺摘要', { planSummary: '  ' }],
    ['缺完成說明', { completionDescription: '' }],
    ['類別看不懂', { category: 'Z' }],
    ['估時是字串', { estimatedMinutes: '15' }],
    ['估時超出範圍', { estimatedMinutes: 500 }],
    ['期間超出範圍', { durationDays: 9999 }],
    ['執行形式看不懂', { durationType: 'forever' }],
    ['回饋方式看不懂', { rewardPolicy: 'give_everything' }],
    ['資格看不懂', { rewardEligibility: 'maybe' }],
    ['缺政策版本', { rewardPolicyVersion: '' }],
    ['幣值狀態看不懂', { pricingStatus: 'free' }],
    ['缺 model', { model: '' }],
    ['blockingIssues 不是陣列', { blockingIssues: 'none' }],
    ['節奏形狀不對', { cadence: { mode: 'weekly_frequency' } }],
    ['星期超出範圍', { cadence: { mode: 'fixed_days', days: [9] } }],
    ['有節奏卻說沒有來源', { cadenceSource: 'none' }],
    ['沒有節奏卻宣稱是孩子選的', { cadence: null }],
  ])('%s → 不放行', (_label, patch) => {
    expect(bad(patch)).toMatchObject({ status: 'unavailable', reason: 'INVALID_RESPONSE' });
  });
});

describe('幣值與回饋方式必須對得上', () => {
  it('不發幣卻附了建議幣值 → 整筆不放行', () => {
    expect(bad({ rewardPolicy: 'family_contribution', aiSuggestedCoinAmount: 12 }))
      .toMatchObject({ status: 'unavailable', reason: 'INVALID_RESPONSE' });
  });

  it('幣值還沒定案（unpriced）卻附了數字 → 不放行', () => {
    expect(bad({ pricingStatus: 'unpriced', aiSuggestedCoinAmount: 12 }))
      .toMatchObject({ status: 'unavailable', reason: 'INVALID_RESPONSE' });
  });

  it('unpriced 且沒有數字 → 正常，這是目前最常見的情況', () => {
    expect(ok({ pricingStatus: 'unpriced', aiSuggestedCoinAmount: null }).status).toBe('draft');
  });

  it('離譜的幣值不放行', () => {
    expect(bad({ aiSuggestedCoinAmount: 100000 }))
      .toMatchObject({ status: 'unavailable', reason: 'INVALID_RESPONSE' });
  });
});

describe('server 說沒有草稿', () => {
  it.each(['SERVICE_ERROR', 'INVALID_AI_OUTPUT', 'INVALID_INPUT', 'TIMEOUT'])(
    '%s 原樣傳達 —— 診斷才不會找錯地方',
    (reason) => {
      expect(validatePlanDraftResult({ status: 'unavailable', schemaVersion: 1, reason }))
        .toEqual({ status: 'unavailable', schemaVersion: 1, reason });
    },
  );

  it('沒見過的理由退回 INVALID_RESPONSE，不原樣照收', () => {
    expect(
      validatePlanDraftResult({ status: 'unavailable', schemaVersion: 1, reason: 'BANANA' }),
    ).toEqual({ status: 'unavailable', schemaVersion: 1, reason: 'INVALID_RESPONSE' });
  });
});
