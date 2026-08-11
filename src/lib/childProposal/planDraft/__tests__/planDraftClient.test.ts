// P0-3 — 真實 client 的失效行為與服務模式
//
// 這一支不碰網路：invoke 被注入成一支函式，所以逾時、服務掛掉、
// 回一堆亂碼都測得到，而且不會花到任何配額。

import {
  createPlanDraftClientSetup,
  LiveChildProposalPlanDraftClient,
  type InvokeAiProxy,
} from '../planDraftClient';
import type { ChildProposalPlanDraftInput } from '../types';

const INPUT: ChildProposalPlanDraftInput = {
  schemaVersion: 1,
  ageGroup: '6-9',
  childOriginalGoal: '我想兩週把這本書讀完',
  childOriginalMotivation: '因為同學說這本書很好看',
  proposalSource: 'child',
  cadence: { mode: 'weekly_frequency', weeklyFrequency: 4 },
  preferredTime: null,
  childRewardPreference: 'hopes_for_coin',
};

const GOOD_DRAFT = {
  status: 'draft',
  schemaVersion: 1,
  draft: {
    schemaVersion: 1,
    planTitle: '兩週閱讀挑戰',
    planSummary: '先用一週 4 次的節奏開始。',
    completionDescription: '完成一次約定的閱讀時段',
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
    pricingStatus: 'unpriced',
    aiSuggestedCoinAmount: null,
    blockingIssues: [],
    requiresConfirmation: [],
    warnings: [],
    clarificationQuestion: null,
    model: 'gemini-flash-latest',
  },
};

describe('送出去的請求', () => {
  it('用既有的 ai-proxy，type 是 childProposalPlanDraft', async () => {
    const invoke = jest.fn<ReturnType<InvokeAiProxy>, Parameters<InvokeAiProxy>>(
      async () => ({ data: GOOD_DRAFT, error: null }),
    );

    const result = await new LiveChildProposalPlanDraftClient(invoke).requestPlanDraft(INPUT);

    expect(result.status).toBe('draft');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toEqual({
      type: 'childProposalPlanDraft',
      payload: INPUT,
    });
  });

  it('帶著可中止的 signal —— 沒有人能讓它永遠掛著', async () => {
    const invoke = jest.fn<ReturnType<InvokeAiProxy>, Parameters<InvokeAiProxy>>(
      async () => ({ data: GOOD_DRAFT, error: null }),
    );
    await new LiveChildProposalPlanDraftClient(invoke).requestPlanDraft(INPUT);
    expect(invoke.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
  });
});

describe('失效時只降到「這一輪沒有草稿」', () => {
  it('逾時 → TIMEOUT，而且不回任何本機產物', async () => {
    const invoke: InvokeAiProxy = (_body, signal) =>
      new Promise((resolve) => {
        signal?.addEventListener('abort', () =>
          resolve({ data: null, error: { name: 'AbortError' } }),
        );
      });

    const client = new LiveChildProposalPlanDraftClient(invoke, 10);
    const result = await client.requestPlanDraft(INPUT);

    expect(result).toEqual({ status: 'unavailable', schemaVersion: 1, reason: 'TIMEOUT' });
  });

  it('Function 回錯誤 → SERVICE_ERROR', async () => {
    const invoke: InvokeAiProxy = async () => ({
      data: null, error: { message: 'boom', name: 'FunctionsHttpError' },
    });
    const result = await new LiveChildProposalPlanDraftClient(invoke).requestPlanDraft(INPUT);
    expect(result).toMatchObject({ status: 'unavailable', reason: 'SERVICE_ERROR' });
  });

  it('invoke 直接丟例外 → SERVICE_ERROR，不往外拋', async () => {
    const invoke: InvokeAiProxy = async () => {
      throw new Error('network down');
    };
    const result = await new LiveChildProposalPlanDraftClient(invoke).requestPlanDraft(INPUT);
    expect(result).toMatchObject({ status: 'unavailable', reason: 'SERVICE_ERROR' });
  });

  it('回了看不懂的東西 → INVALID_RESPONSE（不 cast，走 validator）', async () => {
    const invoke: InvokeAiProxy = async () => ({
      data: { status: 'draft', schemaVersion: 1, draft: { planTitle: '只有標題' } },
      error: null,
    });
    const result = await new LiveChildProposalPlanDraftClient(invoke).requestPlanDraft(INPUT);
    expect(result).toMatchObject({ status: 'unavailable', reason: 'INVALID_RESPONSE' });
  });

  it('外層已經取消就不送出 —— 取消之後才發出的請求仍然會計入配額', async () => {
    const invoke = jest.fn<ReturnType<InvokeAiProxy>, Parameters<InvokeAiProxy>>(
      async () => ({ data: GOOD_DRAFT, error: null }),
    );
    const controller = new AbortController();
    controller.abort();

    const result = await new LiveChildProposalPlanDraftClient(invoke)
      .requestPlanDraft(INPUT, controller.signal);

    expect(result).toMatchObject({ status: 'unavailable', reason: 'TIMEOUT' });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('服務模式', () => {
  const invoke: InvokeAiProxy = async () => ({ data: GOOD_DRAFT, error: null });

  it('測試環境一律關閉 —— 測試自己注入需要的替身', () => {
    const setup = createPlanDraftClientSetup('live', invoke);
    expect(setup.client).toBeNull();
    expect(setup.resolution.mode).toBe('off');
  });

  it.each([undefined, '', 'banana', 'off'])('%s → 沒有 client', (raw) => {
    expect(createPlanDraftClientSetup(raw, invoke).client).toBeNull();
  });

  it('fake 也不提供 client —— 這一包的產物會被寫進資料庫', () => {
    const setup = createPlanDraftClientSetup('fake', invoke);
    expect(setup.client).toBeNull();
    expect(setup.resolution.mode).toBe('off');
  });

  it('關閉時回 null，而不是一個一定會失敗的 client', () => {
    // null 與「會失敗的 client」的差別是：前者讓呼叫端整個不跑，
    // 後者會讓人一直重試一個永遠不會成功的東西。
    expect(createPlanDraftClientSetup('off', invoke).client).toBeNull();
  });
});
