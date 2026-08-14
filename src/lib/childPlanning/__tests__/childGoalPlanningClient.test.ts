// P1-A1 — 真實 client 的失效行為與服務模式
//
// 這一支不碰網路：invoke 被注入成一支函式，所以逾時、服務掛掉、
// 回一堆亂碼都測得到，而且不會花到任何配額。

import {
  createChildGoalPlanningClientSetup,
  LiveChildGoalPlanningClient,
  type InvokeAiProxy,
} from '../childGoalPlanningClient';
import { generateChildGoalPlan } from '../generateChildGoalPlan';
import type { ChildGoalPlanningInput } from '../types';

const INPUT: ChildGoalPlanningInput = {
  schemaVersion: 1,
  ageGroup: '6-9',
  childOriginalGoal: '我想兩週讀完神奇樹屋',
  childOriginalMotivation: null,
  childApproach: '平日睡前讀 15 分鐘',
  cadence: { mode: 'fixed_days', days: [1, 2, 3, 4, 5] },
  preferredTime: '睡前',
  planningSupportPreference: 'organize_only',
  responses: [],
};

const GOOD_PLAN = {
  status: 'ready',
  schemaVersion: 1,
  plan: {
    goalControlType: 'directly_actionable',
    progressionKind: 'rhythm',
    desiredOutcome: '兩週讀完神奇樹屋',
    actionPlanSummary: '平日睡前讀 15 分鐘，兩週把這本書讀完。',
    currentFocus: '先維持平日睡前的閱讀',
    nextAction: { text: '今晚睡前先讀 15 分鐘', source: 'child_stated' },
    reviewPoint: { type: 'after_days', days: 7 },
    planningContribution: 'organized_child_plan',
    provenance: {
      childOriginalGoal: '我想兩週讀完神奇樹屋',
      childStatedApproach: '平日睡前讀 15 分鐘',
      childChosenOption: null,
      fields: {
        approach: 'child_stated',
        cadence: 'child_stated',
        sessionSize: 'derived_from_child',
        preferredTime: 'child_stated',
        nextAction: 'child_stated',
        reviewPoint: 'derived_from_child',
        phases: 'undecided',
        target: 'undecided',
        controllableActions: 'undecided',
      },
    },
    model: 'gemini-flash-latest',
    cadence: { mode: 'fixed_days', days: [1, 2, 3, 4, 5] },
    sessionSize: { kind: 'minutes', minutes: 15 },
    trialPeriod: { days: 7 },
  },
};

describe('送出去的請求', () => {
  it('用既有的 ai-proxy，type 是 childGoalPlanning', async () => {
    const invoke = jest.fn<ReturnType<InvokeAiProxy>, Parameters<InvokeAiProxy>>(async () => ({
      data: GOOD_PLAN,
      error: null,
    }));

    const result = await new LiveChildGoalPlanningClient(invoke).requestPlan(INPUT);

    expect(result.status).toBe('ready');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toEqual({ type: 'childGoalPlanning', payload: INPUT });
  });

  it('帶著可中止的 signal —— 沒有人能讓它永遠掛著', async () => {
    const invoke = jest.fn<ReturnType<InvokeAiProxy>, Parameters<InvokeAiProxy>>(async () => ({
      data: GOOD_PLAN,
      error: null,
    }));
    await new LiveChildGoalPlanningClient(invoke).requestPlan(INPUT);
    expect(invoke.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
  });
});

describe('失效時只降到「這一輪沒有計畫」', () => {
  it('逾時 → TIMEOUT，而且不回任何本機產物', async () => {
    const invoke: InvokeAiProxy = (_body, signal) =>
      new Promise((resolve) => {
        signal?.addEventListener('abort', () =>
          resolve({ data: null, error: { name: 'AbortError' } }),
        );
      });

    const result = await new LiveChildGoalPlanningClient(invoke, 10).requestPlan(INPUT);
    expect(result).toEqual({ status: 'unavailable', schemaVersion: 1, reason: 'TIMEOUT' });
  });

  it('Function 回錯誤 → SERVICE_ERROR', async () => {
    const invoke: InvokeAiProxy = async () => ({
      data: null,
      error: { message: 'boom', name: 'FunctionsHttpError' },
    });
    const result = await new LiveChildGoalPlanningClient(invoke).requestPlan(INPUT);
    expect(result).toMatchObject({ status: 'unavailable', reason: 'SERVICE_ERROR' });
  });

  it('invoke 直接丟例外 → SERVICE_ERROR，不往外拋', async () => {
    const invoke: InvokeAiProxy = async () => {
      throw new Error('network down');
    };
    const result = await new LiveChildGoalPlanningClient(invoke).requestPlan(INPUT);
    expect(result).toMatchObject({ status: 'unavailable', reason: 'SERVICE_ERROR' });
  });

  it('回了看不懂的東西 → INVALID_RESPONSE（不 cast，走 validator）', async () => {
    const invoke: InvokeAiProxy = async () => ({
      data: { status: 'ready', schemaVersion: 1, plan: { desiredOutcome: '只有一個欄位' } },
      error: null,
    });
    const result = await new LiveChildGoalPlanningClient(invoke).requestPlan(INPUT);
    expect(result).toMatchObject({ status: 'unavailable', reason: 'INVALID_RESPONSE' });
  });

  it('Function 說服務不可用 → 照實轉達', async () => {
    const invoke: InvokeAiProxy = async () => ({
      data: { status: 'unavailable', schemaVersion: 1, reason: 'SERVICE_ERROR' },
      error: null,
    });
    const result = await new LiveChildGoalPlanningClient(invoke).requestPlan(INPUT);
    expect(result).toEqual({ status: 'unavailable', schemaVersion: 1, reason: 'SERVICE_ERROR' });
  });

  it('外層已經取消就不送出 —— 取消之後才發出的請求仍然會計入配額', async () => {
    const invoke = jest.fn<ReturnType<InvokeAiProxy>, Parameters<InvokeAiProxy>>(async () => ({
      data: GOOD_PLAN,
      error: null,
    }));
    const controller = new AbortController();
    controller.abort();

    const result = await new LiveChildGoalPlanningClient(invoke).requestPlan(
      INPUT,
      controller.signal,
    );

    expect(result).toMatchObject({ status: 'unavailable', reason: 'TIMEOUT' });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('服務模式', () => {
  const invoke: InvokeAiProxy = async () => ({ data: GOOD_PLAN, error: null });

  it('測試環境一律關閉 —— 測試自己注入需要的替身', () => {
    const setup = createChildGoalPlanningClientSetup('live', invoke);
    expect(setup.client).toBeNull();
    expect(setup.resolution.mode).toBe('off');
  });

  it.each([undefined, '', 'banana', 'off', 'fake'])('%s → 沒有 client', (raw) => {
    expect(createChildGoalPlanningClientSetup(raw, invoke).client).toBeNull();
  });
});

describe('generator 的降級', () => {
  const invoke: InvokeAiProxy = async () => ({ data: GOOD_PLAN, error: null });

  it('AI 關著 → SERVICE_DISABLED，而且不組 input', async () => {
    const outcome = await generateChildGoalPlan(
      { client: null },
      { ageGroup: '6-9', childOriginalGoal: '我想變厲害' },
    );
    expect(outcome.result).toEqual({
      status: 'unavailable',
      schemaVersion: 1,
      reason: 'SERVICE_DISABLED',
    });
    expect(outcome.input).toBeNull();
  });

  it('input 組不出來 → INVALID_INPUT，一次請求都沒發出', async () => {
    const client = { requestPlan: jest.fn() };
    const outcome = await generateChildGoalPlan(
      { client: client as never },
      { ageGroup: '6-9', childOriginalGoal: '   ' },
    );
    expect(outcome.result).toMatchObject({ status: 'unavailable', reason: 'INVALID_INPUT' });
    expect(client.requestPlan).not.toHaveBeenCalled();
  });

  it('正常路徑會把組好的 input 一起帶回來（稽核用）', async () => {
    const outcome = await generateChildGoalPlan(
      { client: new LiveChildGoalPlanningClient(invoke) },
      {
        ageGroup: '6-9',
        childOriginalGoal: '我想兩週讀完神奇樹屋',
        childApproach: '平日睡前讀 15 分鐘',
        cadence: { mode: 'fixed_days', days: [1, 2, 3, 4, 5] },
        preferredTime: '睡前',
        planningSupportPreference: 'organize_only',
      },
    );
    expect(outcome.result.status).toBe('ready');
    expect(outcome.input).toEqual(INPUT);
  });
});
