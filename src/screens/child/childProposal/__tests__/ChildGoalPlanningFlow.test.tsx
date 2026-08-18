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
//   · 確認與送出是**兩件事**：確認之後才把正式版本送給爸媽，
//     而送出失敗不會把孩子退回對話（P1-A3）
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

/** 有 title／detail／rhythmHint／rationale 拆解的版本（P6 追加）。 */
const CHOICE_STRUCTURED: ChildGoalPlanningResult = {
  status: 'needs_choice',
  schemaVersion: 1,
  knownGoal: '我想兩週讀完這本書',
  question: '你想先用哪一種方式開始？',
  options: [
    {
      id: 'option-1',
      text: '每次讀 10 分鐘就好，一週選 3 天',
      title: '先從短時間開始',
      detail: '每次讀 10 分鐘就好',
      rhythmHint: '一週 3 天',
      rationale: 'good_starting_point',
    },
    {
      id: 'option-2',
      text: '讀到一個段落就停下來',
      title: '讀一小段就停',
      detail: '讀到一個段落就停下來',
    },
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
  /** P1-A3：確認之後把正式版本送給爸媽跑了幾次。 */
  publishes: number;
  sendToParents: jest.Mock;
  done: jest.Mock;
};

/** 依序回這些結果的替身。用光之後一直回最後一個。 */
function harness(
  results: readonly ChildGoalPlanningResult[],
  options: { persistFails?: boolean; publishFails?: boolean } = {},
): Harness {
  const requests: Harness['requests'] = [];
  const rounds: Harness['rounds'] = [];
  const confirms: Harness['confirms'] = [];
  let index = 0;
  let revision = 0;
  const state = { publishes: 0 };

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
    async publish() {
      state.publishes += 1;
      // 第一次失敗、之後成功 —— 「再送一次」真的要能救得回來。
      if (options.publishFails && state.publishes === 1) {
        return { ok: false, code: 'PERSISTENCE_FAILED', message: '沒辦法把計畫送給爸媽' };
      }
      return {
        ok: true,
        proposalId: 'proposal-1',
        sessionId: 'session-1',
        planVersionId: 'version-1',
        versionNo: 1,
        authoredBy: 'child',
        proposalStatus: 'proposed',
        requiresParentDecision: [],
        enrichmentStatus: 'enriched',
        idempotentReplay: false,
      };
    },
  };

  return {
    ports,
    requests,
    rounds,
    confirms,
    get publishes() {
      return state.publishes;
    },
    sendToParents: jest.fn(),
    done: jest.fn(),
  };
}

function renderFlow(h: Harness, preferredTime: string | null = null) {
  return render(
    <ChildGoalPlanningFlow
      ports={h.ports}
      initialRevision={0}
      preferredTime={preferredTime}
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
  preferredTime: string | null = null,
) {
  const view = renderFlow(h, preferredTime);
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
    expect(view.queryByText(PLANNING_COPY.ready.rhythmLabel)).toBeNull();
    expect(view.queryByText(PLANNING_COPY.ready.trialLabel)).toBeNull();
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

describe('Case 1｜孩子已有完整方法 → ready → 確認 → 送出正式版本', () => {
  it('確認會存進 session，然後才送出正式版本', async () => {
    const h = harness([READY]);
    const view = await openWith(h, 'has_own_idea', '平日睡前讀 15 分鐘');

    await waitFor(() => expect(view.getByTestId('planning-ready')).toBeTruthy());
    fireEvent.press(view.getByTestId('planning-confirm'));

    await waitFor(() => expect(view.getByTestId('planning-confirmed')).toBeTruthy());
    expect(h.confirms).toEqual([{ expectedRevision: 1 }]);
    await waitFor(() => expect(h.publishes).toBe(1));
    // 「先把想法送給爸媽」是**不規劃**那條出口，與這裡無關 ——
    // 走錯的話，孩子確認過的計畫會被當成沒有規劃直接送出。
    expect(h.sendToParents).not.toHaveBeenCalled();
    expect(view.getByText(PLANNING_COPY.confirmed.body)).toBeTruthy();
  });

  it('送出失敗**不謊報**，但也不把他退回對話', async () => {
    const h = harness([READY], { publishFails: true });
    const view = await openWith(h, 'has_own_idea', '平日睡前讀 15 分鐘');

    await waitFor(() => expect(view.getByTestId('planning-ready')).toBeTruthy());
    fireEvent.press(view.getByTestId('planning-confirm'));

    // 他已經確認過了，那份計畫安全地存著 —— 退回對話等於讓他以為
    // 剛剛點的頭不算數。
    await waitFor(() => expect(view.getByTestId('planning-confirmed')).toBeTruthy());
    expect(view.getByText(PLANNING_COPY.confirmed.notSentBody)).toBeTruthy();
    expect(view.queryByText(PLANNING_COPY.confirmed.body)).toBeNull();
    expect(h.confirms).toHaveLength(1);
  });

  it('「再送一次」救得回來，而且不會重新確認一次', async () => {
    const h = harness([READY], { publishFails: true });
    const view = await openWith(h, 'has_own_idea', '平日睡前讀 15 分鐘');

    await waitFor(() => expect(view.getByTestId('planning-ready')).toBeTruthy());
    fireEvent.press(view.getByTestId('planning-confirm'));
    await waitFor(() => expect(view.getByTestId('planning-publish-retry')).toBeTruthy());

    fireEvent.press(view.getByTestId('planning-publish-retry'));
    await waitFor(() => expect(view.getByText(PLANNING_COPY.confirmed.body)).toBeTruthy());
    expect(h.publishes).toBe(2);
    // 確認只發生過一次 —— 重試的是送出，不是那個決定。
    expect(h.confirms).toHaveLength(1);
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

    // 選起來**還沒送出** —— 點到哪一個就直接打出去的話，孩子手指滑到
    // 就決定了，而且那一輪退不回來（已經寫進對話）。
    fireEvent.press(view.getByTestId('planning-option-option-1'));
    expect(h.requests).toHaveLength(1);

    // 改選也還來得及。
    fireEvent.press(view.getByTestId('planning-option-option-2'));
    expect(h.requests).toHaveLength(1);

    fireEvent.press(view.getByTestId('planning-option-option-1'));
    fireEvent.press(view.getByTestId('planning-choice-confirm'));

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
    expect(view.queryByText(PLANNING_COPY.ready.rhythmLabel)).toBeNull();
    expect(view.queryByText(PLANNING_COPY.ready.trialLabel)).toBeNull();
  });
});

describe('P6｜needs_choice 與 ready 的視覺還原', () => {
  it('步驟徽章跟著實際跑過的輪數走，不是寫死的 2／4——只跑 1 輪就到 ready 時分母不會硬湊成 4', async () => {
    // 開場（不帶 response 的第 1 輪）直接回 CHOICE，選完的第 2 輪直接回 READY——
    // 全程只有 2 輪，ready 不該出現「4」，因為根本沒有第 3、4 輪發生過。
    const h = harness([CHOICE, READY]);
    const view = await openWith(h, 'want_options');

    await waitFor(() => expect(view.getByTestId('planning-choice')).toBeTruthy());
    // 分母是架構上限（開場 + 最多 3 輪 = 4）：還不知道最後會停在第幾輪。
    expect(view.getByText('步驟 2 / 4')).toBeTruthy();

    fireEvent.press(view.getByTestId('planning-option-option-1'));
    fireEvent.press(view.getByTestId('planning-choice-confirm'));

    await waitFor(() => expect(view.getByTestId('planning-ready')).toBeTruthy());
    // ready 是終點：分母換成自己（走到底＝全部填滿），不是「2 直接跳成 4」。
    expect(view.getByText('步驟 3 / 3')).toBeTruthy();
    expect(view.queryByText('步驟 4 / 4')).toBeNull();
  });

  it('真的問滿 3 輪才到 ready 時，步驟數字才會走到 4／4', async () => {
    const h = harness([CLARIFICATION, CHOICE, READY]);
    const view = await openWith(h, 'want_options');

    await waitFor(() => expect(view.getByTestId('planning-clarification')).toBeTruthy());
    fireEvent.changeText(view.getByTestId('planning-answer-input'), '我想把英文口說變好');
    fireEvent.press(view.getByTestId('planning-answer-next'));

    await waitFor(() => expect(view.getByTestId('planning-choice')).toBeTruthy());
    expect(view.getByText('步驟 3 / 4')).toBeTruthy();

    fireEvent.press(view.getByTestId('planning-option-option-1'));
    fireEvent.press(view.getByTestId('planning-choice-confirm'));

    await waitFor(() => expect(view.getByTestId('planning-ready')).toBeTruthy());
    expect(view.getByText('步驟 4 / 4')).toBeTruthy();
  });

  it('「我有自己的方式」兩行文案都在，不是單行「我自己想」', async () => {
    const h = harness([CHOICE]);
    const view = await openWith(h, 'want_options');

    await waitFor(() => expect(view.getByTestId('planning-choice')).toBeTruthy());
    expect(view.getByText(PLANNING_COPY.choice.customTitle)).toBeTruthy();
    expect(view.getByText(PLANNING_COPY.choice.customSubtitle)).toBeTruthy();
    expect(view.queryByText('我自己想')).toBeNull();
  });

  it('preferred time 有真值時顯示建議時間 pill；沒有值時整行不出現，也不會冒出「還沒決定」', async () => {
    const withTime = harness([READY]);
    const viewWithTime = await openWith(withTime, 'has_own_idea', '平日睡前讀 15 分鐘', '晚餐後');
    await waitFor(() => expect(viewWithTime.getByTestId('planning-ready')).toBeTruthy());
    expect(viewWithTime.getByText(`🕒 ${PLANNING_COPY.ready.timeLabel}：晚餐後`)).toBeTruthy();

    const withoutTime = harness([READY]);
    const viewWithoutTime = await openWith(withoutTime, 'has_own_idea', '平日睡前讀 15 分鐘', null);
    await waitFor(() => expect(viewWithoutTime.getByTestId('planning-ready')).toBeTruthy());
    expect(viewWithoutTime.queryByText(new RegExp(PLANNING_COPY.ready.timeLabel))).toBeNull();
    expect(viewWithoutTime.queryByText('還沒決定')).toBeNull();
  });

  it('rhythm 大數字：一週次數與每次分鐘各自成一格', async () => {
    const h = harness([READY]);
    const view = await openWith(h, 'has_own_idea', '平日睡前讀 15 分鐘');

    await waitFor(() => expect(view.getByTestId('planning-ready')).toBeTruthy());
    expect(view.getByText('5')).toBeTruthy();
    expect(view.getByText('15')).toBeTruthy();
  });

  it('選項有 title／detail／rhythmHint 時三層都顯示；沒有 detail 的舊選項只退回一行', async () => {
    const h = harness([CHOICE_STRUCTURED]);
    const view = await openWith(h, 'want_options');

    await waitFor(() => expect(view.getByTestId('planning-choice')).toBeTruthy());
    // 選項 1：三層都在。
    expect(view.getByText('先從短時間開始')).toBeTruthy();
    expect(view.getByText('每次讀 10 分鐘就好')).toBeTruthy();
    expect(view.getByText('一週 3 天')).toBeTruthy();
    // 選項 2：有 title/detail，沒有 rhythmHint——不會冒出空字串或 undefined。
    expect(view.getByText('讀一小段就停')).toBeTruthy();
    expect(view.getByText('讀到一個段落就停下來')).toBeTruthy();
  });

  it('grounded rationale 有值時顯示低權重徽章；沒有值的選項完全不顯示徽章', async () => {
    const h = harness([CHOICE_STRUCTURED]);
    const view = await openWith(h, 'want_options');

    await waitFor(() => expect(view.getByTestId('planning-choice')).toBeTruthy());
    expect(view.getByText(PLANNING_COPY.choice.optionRationale.good_starting_point)).toBeTruthy();
    expect(
      view.queryByText(PLANNING_COPY.choice.optionRationale.closer_to_child_input),
    ).toBeNull();
  });

  it('沒有 rationale 的一般選項（舊 fixture）不會預設顯示任何徽章，也沒有「推薦方案」', async () => {
    const h = harness([CHOICE]);
    const view = await openWith(h, 'want_options');

    await waitFor(() => expect(view.getByTestId('planning-choice')).toBeTruthy());
    for (const forbidden of [
      '推薦方案',
      PLANNING_COPY.choice.optionRationale.good_starting_point,
      PLANNING_COPY.choice.optionRationale.closer_to_child_input,
    ]) {
      expect(view.queryByText(forbidden)).toBeNull();
    }
  });

  it('選項上方有微文案，降低「要一次選對」的壓力', async () => {
    const h = harness([CHOICE]);
    const view = await openWith(h, 'want_options');

    await waitFor(() => expect(view.getByTestId('planning-choice')).toBeTruthy());
    expect(view.getByText(PLANNING_COPY.choice.microcopy)).toBeTruthy();
  });
});
