// P1-A1 — 期限由孩子決定
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支測的是新的第五態 needs_duration：模型判斷孩子沒講期間時，
// 插一輪讓孩子自己選。
//
// 核心產品原則：**孩子看得到每一個數字才點下去，所以這不是猜。**
// 模型不可以自己決定期限，也不可以給出家長之後改不動的值（1-180）。
// ─────────────────────────────────────────────────────────────────────────

import { validateChildGoalPlanningResult } from '../validateChildGoalPlanningResult';
import { childGoalPlanningInputIsUsable } from '../../../../supabase/functions/ai-proxy/childGoalPlanningLogic';
import { buildChildGoalPlanningInput } from '../buildChildGoalPlanningInput';
import { CHILD_PLANNING_RESPONSE_TYPES, resolveGoalDuration } from '../types';
import type { ChildGoalPlanningInput } from '../types';

const INPUT: ChildGoalPlanningInput = {
  schemaVersion: 1,
  ageGroup: '6-9',
  childOriginalGoal: '我想把哈利波特讀完',
  childOriginalMotivation: null,
  childApproach: null,
  cadence: null,
  goalDuration: null,
  preferredTime: null,
  planningSupportPreference: null,
  responses: [],
};

function durationPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'needs_duration',
    schemaVersion: 1,
    knownGoal: '我想把哈利波特讀完',
    question: '你想花多久把它讀完？',
    options: [
      { id: 'two-weeks', text: '兩個星期', days: 14 },
      { id: 'one-month', text: '一個月', days: 30 },
    ],
    allowCustomAnswer: true,
    model: 'gemini-flash-latest',
    ...overrides,
  };
}

describe('needs_duration', () => {
  it('接受一份形狀正確的期限提問', () => {
    const result = validateChildGoalPlanningResult(durationPayload(), INPUT);

    expect(result.status).toBe('needs_duration');
  });

  // 把 200 悄悄改成 180，就是讓孩子確認一個他沒說過的期限。
  // 與 childProposalPlanDraftLogic 的既有作法一致：拒絕，不 clamp。
  it('拒絕超出 180 天的選項，不靜默收斂', () => {
    const result = validateChildGoalPlanningResult(
      durationPayload({
        options: [
          { id: 'two-weeks', text: '兩個星期', days: 14 },
          { id: 'a-year', text: '一年', days: 365 },
        ],
      }),
      INPUT,
    );

    expect(result.status).toBe('unavailable');
  });
  it('拒絕只有一個選項', () => {
    const result = validateChildGoalPlanningResult(
      durationPayload({ options: [{ id: 'two-weeks', text: '兩個星期', days: 14 }] }),
      INPUT,
    );

    expect(result.status).toBe('unavailable');
  });
  // 孩子一定可以自己說一個期間，或說這件事沒有終點。
  it('拒絕關掉自由作答的選項清單', () => {
    const result = validateChildGoalPlanningResult(
      durationPayload({ allowCustomAnswer: false }),
      INPUT,
    );

    expect(result.status).toBe('unavailable');
  });
});

// ---------------------------------------------------------------------------
// goalDuration —— 孩子選的期限要進得了計畫
// ---------------------------------------------------------------------------

const BASE_PROVENANCE = {
  childOriginalGoal: '我想把哈利波特讀完',
  childStatedApproach: null as string | null,
  childChosenOption: null as { id: string; text: string } | null,
  fields: {
    approach: 'undecided',
    cadence: 'ai_suggested',
    sessionSize: 'ai_suggested',
    preferredTime: 'undecided',
    nextAction: 'ai_suggested',
    reviewPoint: 'ai_suggested',
    phases: 'undecided',
    target: 'undecided',
    controllableActions: 'undecided',
  } as Record<string, string>,
};

function readyPayload(planOverrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'ready',
    schemaVersion: 1,
    plan: {
      goalControlType: 'directly_actionable',
      progressionKind: 'rhythm',
      desiredOutcome: '把哈利波特讀完',
      actionPlanSummary: '先用一週三次的節奏開始。',
      currentFocus: '先把三次固定下來',
      nextAction: { text: '今天先讀 10 分鐘', source: 'ai_suggested' },
      reviewPoint: { type: 'after_days', days: 7 },
      planningContribution: 'filled_missing_details',
      provenance: BASE_PROVENANCE,
      model: 'gemini-flash-latest',
      cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
      sessionSize: { kind: 'minutes', minutes: 10 },
      trialPeriod: { days: 7 },
      goalDuration: { kind: 'days', days: 42 },
      ...planOverrides,
    },
  };
}

describe('goalDuration', () => {
  it('把孩子選的天數帶進計畫', () => {
    const result = validateChildGoalPlanningResult(readyPayload(), INPUT);

    expect(result.status).toBe('ready');
    expect(result.status === 'ready' && result.plan.goalDuration).toEqual({
      kind: 'days',
      days: 42,
    });
  });
  // 與 cadence 同一條原則：孩子選過的東西不可以被換掉。
  it('孩子選了 42 天，計畫卻寫 90 天 → CHILD_INPUT_OVERWRITTEN', () => {
    const result = validateChildGoalPlanningResult(
      readyPayload({ goalDuration: { kind: 'days', days: 90 } }),
      { ...INPUT, goalDuration: { kind: 'days', days: 42 } },
    );

    expect(result.status).toBe('unavailable');
    expect(result.status === 'unavailable' && result.rejections).toContain(
      'CHILD_INPUT_OVERWRITTEN',
    );
  });
});

// ---------------------------------------------------------------------------
// 孩子選的期限住在 responses 裡
// ---------------------------------------------------------------------------
//
// 與 childApproach 同一個理由：期限是孩子在對話裡做的決定，而 responses
// 是既有的、只 append、而且已經會被持久化的那一份紀錄。另外開一個欄位
// 存它，等於同一件事有兩個來源，session 從資料庫還原時就會分岔。

describe('resolveGoalDuration', () => {
  it('還沒選過就是 null —— 不替他預設一個期間', () => {
    expect(resolveGoalDuration([])).toBeNull();
  });

  it('他選了兩個星期', () => {
    expect(resolveGoalDuration([{ type: 'duration_selection', days: 14 }])).toEqual({
      kind: 'days',
      days: 14,
    });
  });

  it('他說這件事沒有終點', () => {
    expect(resolveGoalDuration([{ type: 'duration_open_ended' }])).toEqual({
      kind: 'open_ended',
    });
  });

  // responses 只 append，所以「改過」的樣子是後面又多一筆。
  it('改過就以最後一次為準', () => {
    expect(
      resolveGoalDuration([
        { type: 'duration_selection', days: 14 },
        { type: 'duration_open_ended' },
      ]),
    ).toEqual({ kind: 'open_ended' });
  });

  it('其他種類的回應不影響它', () => {
    expect(
      resolveGoalDuration([
        { type: 'duration_selection', days: 30 },
        { type: 'choice_selection', optionId: 'option-1', optionText: '每次讀 10 分鐘' },
      ]),
    ).toEqual({ kind: 'days', days: 30 });
  });
});

// ---------------------------------------------------------------------------
// 期限那一輪要真的走得完整條路
// ---------------------------------------------------------------------------
//
// ⚠️ 這一段測的是 flow 測試**繞過去**的那一層。ChildGoalPlanningFlow 的
//    測試注入 port，所以 buildChildGoalPlanningInput 與 ai-proxy 的入口檢查
//    都不會被執行 —— 畫面全綠，孩子卻在真實路徑上一步都走不動。

describe('duration 回應走得過入口檢查', () => {
  it('組得出 input，responses 不會整個作廢', () => {
    const input = buildChildGoalPlanningInput({
      ageGroup: '6-9',
      childOriginalGoal: '我想把哈利波特讀完',
      responses: [{ type: 'duration_selection', days: 14 }],
    });

    expect(input).not.toBeNull();
    expect(input?.responses).toEqual([{ type: 'duration_selection', days: 14 }]);
  });

  it('open_ended 也是', () => {
    const input = buildChildGoalPlanningInput({
      ageGroup: '6-9',
      childOriginalGoal: '我想每週練琴三次',
      responses: [{ type: 'duration_open_ended' }],
    });

    expect(input?.responses).toEqual([{ type: 'duration_open_ended' }]);
  });

  it('Function 端的入口檢查也收得下', () => {
    const input = buildChildGoalPlanningInput({
      ageGroup: '6-9',
      childOriginalGoal: '我想把哈利波特讀完',
      responses: [{ type: 'duration_selection', days: 14 }],
    });

    expect(input).not.toBeNull();
    expect(childGoalPlanningInputIsUsable(input!)).toBe(true);
  });

  // 這一條是為了下一次：清單漏更新正是「兩端都測了卻測不到」的根因，
  // 而 parity 測試就是拿這個陣列去掃 Function 端原始碼的。
  it('回應型別清單涵蓋每一個變體', () => {
    expect([...CHILD_PLANNING_RESPONSE_TYPES].sort()).toEqual([
      'choice_selection',
      'clarification_answer',
      'custom_choice',
      'duration_open_ended',
      'duration_selection',
    ]);
  });
});
