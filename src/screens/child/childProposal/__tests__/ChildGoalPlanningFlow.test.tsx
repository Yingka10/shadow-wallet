// P1-A2 — 一起想怎麼開始：canonical 對話路徑
//
// ─────────────────────────────────────────────────────────────────────────
// port 全部注入，所以整條路徑（含逾時、stale、三輪問完）在 jest 裡跑得完，
// 不需要網路也不需要資料庫。
//
// 這一支要證明的不是「畫面畫得出來」，而是四件產品規則在畫面上真的成立：
//
//   · 孩子的原話不會被對話中的答案改掉
//   · 選項旁邊永遠有「我自己想」
//   · AI 掛掉時三條路都還在
//   · 確認之後**提案仍然是 draft**
// ─────────────────────────────────────────────────────────────────────────

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('../../../../lib/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
  supabaseEnvironment: { ok: true },
}));

import ChildGoalPlanningFlow, { type PlanningFlowPorts } from '../ChildGoalPlanningFlow';
import { PLANNING_COPY } from '../copy';
import type { ChildGoalPlan, ChildGoalPlanningResult } from '../../../../lib/childPlanning';

// ---------------------------------------------------------------------------

const PLAN = {
  desiredOutcome: '兩週讀完這本書',
  actionPlanSummary: '平日睡前讀 15 分鐘，兩週把它讀完。',
  currentFocus: '先維持平日睡前的閱讀',
  nextAction: { text: '今晚睡前先讀 15 分鐘', source: 'child_stated' },
  reviewPoint: { type: 'after_days', days: 7 },
  planningContribution: 'organized_child_plan',
  provenance: {
    childOriginalGoal: '我想兩週讀完這本書',
    childStatedApproach: '平日睡前讀 15 分鐘',
    childChosenOption: null,
    fields: {
      approach: 'child_stated',
      cadence: 'child_stated',
      sessionSize: 'derived_from_child',
      preferredTime: 'undecided',
      nextAction: 'child_stated',
      reviewPoint: 'derived_from_child',
      phases: 'undecided',
      target: 'undecided',
      controllableActions: 'undecided',
    },
  },
  model: 'test-model',
  goalControlType: 'directly_actionable',
  progressionKind: 'rhythm',
  cadence: { mode: 'weekly_frequency', weeklyFrequency: 5 },
  sessionSize: { kind: 'minutes', minutes: 15 },
  trialPeriod: { days: 7 },
} as unknown as ChildGoalPlan;

const READY: ChildGoalPlanningResult = { status: 'ready', schemaVersion: 1, plan: PLAN };

const CLARIFICATION: ChildGoalPlanningResult = {
  status: 'needs_clarification',
  schemaVersion: 1,
  knownGoal: '我想變厲害',
  question: { kind: 'goal_focus', text: '你最想在哪一件事情上變厲害？' },
  model: 'test-model',
};

const CHOICE: ChildGoalPlanningResult = {
  status: 'needs_choice',
  schemaVersion: 1,
  knownGoal: '我想兩週讀完這本書',
  question: '你想先用哪一種方式開始？',
  options: [
    { id: 'option-1', text: '每天睡前讀 15 分鐘' },
    { id: 'option-2', text: '週末一次讀完一章' },
  ],
  allowCustomAnswer: true,
  model: 'test-model',
};

const TIMEOUT: ChildGoalPlanningResult = {
  status: 'unavailable',
  schemaVersion: 1,
  reason: 'TIMEOUT',
};

type Harness = {
  ports: PlanningFlowPorts;
  requests: Parameters<PlanningFlowPorts['requestPlan']>[0][];
  rounds: Parameters<PlanningFlowPorts['recordRound']>[0][];
  confirms: Parameters<PlanningFlowPorts['confirm']>[0][];
  sendToParents: jest.Mock;
  done: jest.Mock;
};

/** 依序回這些結果的替身。用光之後一直回最後一個。 */
function harness(
  results: readonly ChildGoalPlanningResult[],
  options: { persistFails?: boolean } = {},
): Harness {
  const requests: Harness['requests'] = [];
  const rounds: Harness['rounds'] = [];
  const confirms: Harness['confirms'] = [];
  let index = 0;
  let revision = 0;

  const ports: PlanningFlowPorts = {
    async requestPlan(request) {
      requests.push(request);
      const result = results[Math.min(index, results.length - 1)];
      index += 1;
      return result;
    },
    async recordRound(args) {
      rounds.push(args);
      if (options.persistFails) {
        return { ok: false, code: 'STALE_SESSION', reason: 'REVISION_MISMATCH', message: '舊的' };
      }
      revision += 1;
      return {
        ok: true,
        sessionId: 'session-1',
        status: args.result.status === 'ready' ? 'ready' : 'in_progress',
        revision,
        roundsUsed: rounds.length,
        attemptsUsed: rounds.length,
        idempotentReplay: false,
      };
    },
    async confirm(args) {
      confirms.push(args);
      revision += 1;
      return {
        ok: true,
        sessionId: 'session-1',
        status: 'child_confirmed',
        revision,
        roundsUsed: rounds.length,
        attemptsUsed: rounds.length,
        idempotentReplay: false,
      };
    },
  };

  return { ports, requests, rounds, confirms, sendToParents: jest.fn(), done: jest.fn() };
}

function renderFlow(h: Harness) {
  return render(
    <ChildGoalPlanningFlow
      ports={h.ports}
      initialRevision={0}
      onSendToParents={h.sendToParents}
      onDone={h.done}
    />,
  );
}

/** 走完開場：選一個支援強度（預設「我有自己的想法」）並送出。 */
async function openWith(
  h: Harness,
  choice: 'has_own_idea' | 'want_options' | 'first_step_only' = 'has_own_idea',
  approach?: string,
) {
  const view = renderFlow(h);
  fireEvent.press(view.getByTestId(`planning-opening-${choice}`));
  if (approach !== undefined) {
    fireEvent.changeText(view.getByTestId('planning-approach-input'), approach);
  }
  fireEvent.press(view.getByTestId('planning-opening-next'));
  return view;
}

// ---------------------------------------------------------------------------

describe('§7 開場只問一題', () => {
  it('沒有把方法、頻率、份量、時段問成一張表', async () => {
    const view = renderFlow(harness([READY]));

    expect(view.getByText(PLANNING_COPY.opening.question)).toBeTruthy();
    // 這一頁只有三個選項，沒有第二題。
    expect(view.queryByTestId('planning-approach-input')).toBeNull();
    expect(view.queryByText(PLANNING_COPY.ready.cadenceLabel)).toBeNull();
    expect(view.queryByText(PLANNING_COPY.ready.sessionSizeLabel)).toBeNull();
  });

  it('只有「我有自己的想法」才追問怎麼做', () => {
    const view = renderFlow(harness([READY]));

    fireEvent.press(view.getByTestId('planning-opening-want_options'));
    expect(view.queryByTestId('planning-approach-input')).toBeNull();

    fireEvent.press(view.getByTestId('planning-opening-has_own_idea'));
    expect(view.getByTestId('planning-approach-input')).toBeTruthy();
  });
});

describe('§8 支援強度由孩子選，不是 AI 自己決定', () => {
  it.each([
    ['has_own_idea', 'organize_only'],
    ['want_options', 'give_me_options'],
    ['first_step_only', 'first_step_only'],
  ] as const)('%s → %s', async (choice, expected) => {
    const h = harness([READY]);
    await openWith(h, choice, choice === 'has_own_idea' ? '平日睡前讀 15 分鐘' : undefined);

    await waitFor(() => expect(h.requests).toHaveLength(1));
    expect(h.requests[0].planningSupportPreference).toBe(expected);
  });
});

describe('Case 1｜孩子已有完整方法 → ready → 確認', () => {
  it('確認會存進 session，而且**不轉送提案**', async () => {
    const h = harness([READY]);
    const view = await openWith(h, 'has_own_idea', '平日睡前讀 15 分鐘');

    await waitFor(() => expect(view.getByTestId('planning-ready')).toBeTruthy());
    fireEvent.press(view.getByTestId('planning-confirm'));

    await waitFor(() => expect(view.getByTestId('planning-confirmed')).toBeTruthy());
    expect(h.confirms).toEqual([{ expectedRevision: 1 }]);
    // 這一包停在 draft：確認計畫**不是**送出給爸媽。
    expect(h.sendToParents).not.toHaveBeenCalled();
  });

  it('預覽只給孩子需要決定的那幾件事', async () => {
    const h = harness([READY]);
    const view = await openWith(h, 'has_own_idea', '平日睡前讀 15 分鐘');

    await waitFor(() => expect(view.getByTestId('planning-ready-plan')).toBeTruthy());
    expect(view.getByText(PLAN.desiredOutcome)).toBeTruthy();
    expect(view.getByText(PLAN.nextAction.text)).toBeTruthy();
    // 沒有分類、沒有幣值、沒有審核語言。
    for (const forbidden of ['成長幣', '審核', '批准', '任務類型', 'AI']) {
      expect(view.queryByText(new RegExp(forbidden))).toBeNull();
    }
  });
});

describe('Case 2｜目標模糊 → 問一題 → 原話不變', () => {
  it('答案進 responses，**不會**變成新的原話', async () => {
    const h = harness([CLARIFICATION, READY]);
    const view = await openWith(h, 'want_options');

    await waitFor(() => expect(view.getByTestId('planning-clarification')).toBeTruthy());
    // 只顯示模型那一題，沒有附加別的表單。
    expect(view.getByText('你最想在哪一件事情上變厲害？')).toBeTruthy();

    fireEvent.changeText(view.getByTestId('planning-answer-input'), '我想把英文口說變好');
    fireEvent.press(view.getByTestId('planning-answer-next'));

    await waitFor(() => expect(h.requests).toHaveLength(2));
    expect(h.requests[1].responses).toEqual([
      {
        type: 'clarification_answer',
        questionKind: 'goal_focus',
        question: '你最想在哪一件事情上變厲害？',
        answer: '我想把英文口說變好',
      },
    ]);
    // 他的答案沒有被塞進「他自己講的做法」那一欄。
    expect(h.requests[1].childApproach).toBeNull();
  });
});

describe('Case 3 / 4｜選項與「我自己想」', () => {
  it('選項旁邊永遠有「我自己想」', async () => {
    const h = harness([CHOICE]);
    const view = await openWith(h, 'want_options');

    await waitFor(() => expect(view.getByTestId('planning-choice')).toBeTruthy());
    expect(view.getByTestId('planning-option-option-1')).toBeTruthy();
    expect(view.getByTestId('planning-option-option-2')).toBeTruthy();
    expect(view.getByTestId('planning-option-custom')).toBeTruthy();
    // 沒有「推薦」「最適合」—— 選項是平等的。
    for (const forbidden of ['推薦', '最適合', '建議你', '最好']) {
      expect(view.queryByText(new RegExp(forbidden))).toBeNull();
    }
  });

  it('挑一個 → 下一輪知道那是**他挑的**', async () => {
    const h = harness([CHOICE, READY]);
    const view = await openWith(h, 'want_options');

    await waitFor(() => expect(view.getByTestId('planning-choice')).toBeTruthy());
    fireEvent.press(view.getByTestId('planning-option-option-1'));

    await waitFor(() => expect(h.requests).toHaveLength(2));
    expect(h.requests[1].responses).toEqual([
      { type: 'choice_selection', optionId: 'option-1', optionText: '每天睡前讀 15 分鐘' },
    ]);
  });

  it('「我自己想」→ 他打的字是他的原話，不是選項', async () => {
    const h = harness([CHOICE, READY]);
    const view = await openWith(h, 'want_options');

    await waitFor(() => expect(view.getByTestId('planning-choice')).toBeTruthy());
    fireEvent.press(view.getByTestId('planning-option-custom'));

    fireEvent.changeText(view.getByTestId('planning-custom-input'), '我想每天早上先讀一章');
    fireEvent.press(view.getByTestId('planning-custom-next'));

    await waitFor(() => expect(h.requests).toHaveLength(2));
    expect(h.requests[1].responses).toEqual([
      { type: 'custom_choice', answer: '我想每天早上先讀一章' },
    ]);
  });
});

describe('Case 6｜AI 掛掉，孩子不會被困住', () => {
  it('逾時後三條路都在', async () => {
    const h = harness([TIMEOUT]);
    const view = await openWith(h, 'want_options');

    await waitFor(() => expect(view.getByTestId('planning-unavailable')).toBeTruthy());
    expect(view.getByTestId('planning-retry')).toBeTruthy();
    expect(view.getByTestId('planning-write-own-entry')).toBeTruthy();
    expect(view.getByTestId('planning-send-to-parents')).toBeTruthy();
  });

  it('「先把想法送給爸媽」走的是既有的送出，與這場對話無關', async () => {
    const h = harness([TIMEOUT]);
    const view = await openWith(h, 'want_options');

    await waitFor(() => expect(view.getByTestId('planning-unavailable')).toBeTruthy());
    fireEvent.press(view.getByTestId('planning-send-to-parents'));

    expect(h.sendToParents).toHaveBeenCalledTimes(1);
    // 送出不是「確認計畫」—— 兩者是不同的事。
    expect(h.confirms).toHaveLength(0);
  });

  it('等待中就看得到出路，不必等到逾時', async () => {
    // requestPlan 永遠不 resolve —— 模擬那 20-30 秒的長尾。
    const h = harness([READY]);
    h.ports.requestPlan = () => new Promise(() => {});

    const view = renderFlow(h);
    fireEvent.press(view.getByTestId('planning-opening-want_options'));
    fireEvent.press(view.getByTestId('planning-opening-next'));

    await waitFor(() => expect(view.getByTestId('planning-requesting')).toBeTruthy());
    expect(view.getByTestId('planning-escape-self')).toBeTruthy();
    expect(view.getByTestId('planning-send-to-parents')).toBeTruthy();
    // 沒有假的進度百分比，也沒有承諾還要幾秒。
    expect(view.queryByText(/%/)).toBeNull();
    expect(view.queryByText(/還有\s*\d+\s*秒/)).toBeNull();
  });
});

describe('Case 7｜舊的回應晚到', () => {
  it('存不進去就不顯示成 ready —— 孩子不該對著不會被保留的計畫點頭', async () => {
    const h = harness([READY], { persistFails: true });
    const view = await openWith(h, 'has_own_idea', '平日睡前讀 15 分鐘');

    await waitFor(() => expect(view.getByTestId('planning-unavailable')).toBeTruthy());
    expect(view.queryByTestId('planning-ready')).toBeNull();
    expect(h.confirms).toHaveLength(0);
  });
});

describe('§14 「我想改一下」不是打開一張表單', () => {
  it('回到他自己決定怎麼開始的那一層', async () => {
    const h = harness([READY]);
    const view = await openWith(h, 'has_own_idea', '平日睡前讀 15 分鐘');

    await waitFor(() => expect(view.getByTestId('planning-ready')).toBeTruthy());
    fireEvent.press(view.getByTestId('planning-revise'));

    expect(view.getByTestId('planning-write-own')).toBeTruthy();
    // 不是一張把節奏／份量／時段全部攤開的 admin 表單。
    expect(view.queryByText(PLANNING_COPY.ready.cadenceLabel)).toBeNull();
    expect(view.queryByText(PLANNING_COPY.ready.sessionSizeLabel)).toBeNull();
  });
});
