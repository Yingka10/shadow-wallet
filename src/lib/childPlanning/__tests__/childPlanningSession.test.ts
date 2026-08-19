// P1-A2 — 對話有盡頭、失敗不算孩子的錯、確認過的不可變
//
// 這三條在畫面上看不出來（畫面只會少一顆按鈕），所以只能在這裡釘住。

import {
  abandonChildPlanningSession,
  canRequestPlanningRound,
  childPlanningSessionExits,
  isTerminalPlanningStatus,
  confirmChildPlan,
  createChildPlanningSession,
  recordChildResponse,
  recordPlanningResult,
  type ChildPlanningSessionState,
} from '../childPlanningSession';
import {
  CHILD_GOAL_PLANNING_MAX_ATTEMPTS,
  CHILD_GOAL_PLANNING_MAX_ROUNDS,
  type ChildGoalPlan,
  type ChildGoalPlanningResult,
} from '../types';

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
  knownGoal: '我想變厲害',
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

const PLAN = {
  desiredOutcome: '兩週讀完這本書',
  actionPlanSummary: '平日睡前讀 15 分鐘。',
  currentFocus: '先維持平日睡前的閱讀',
  nextAction: { text: '今晚睡前先讀 15 分鐘', source: 'child_stated' },
  reviewPoint: null,
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
      reviewPoint: 'undecided',
      phases: 'undecided',
      target: 'undecided',
      controllableActions: 'undecided',
    },
  },
  model: 'test-model',
  goalControlType: 'directly_actionable',
  progressionKind: 'rhythm',
  cadence: null,
  sessionSize: null,
  trialPeriod: null,
} as unknown as ChildGoalPlan;

const READY: ChildGoalPlanningResult = { status: 'ready', schemaVersion: 1, plan: PLAN };

/** 一路跑到某個狀態。中途任何一步被拒絕就直接爆，測試不該悄悄接受。 */
function run(
  state: ChildPlanningSessionState,
  steps: readonly ChildGoalPlanningResult[],
): ChildPlanningSessionState {
  let current = state;
  for (const step of steps) {
    const outcome = recordPlanningResult(current, step);
    if (!outcome.ok) throw new Error(`unexpected refusal: ${outcome.reason}`);
    current = outcome.state;
  }
  return current;
}

describe('對話有盡頭', () => {
  it(`最多 ${CHILD_GOAL_PLANNING_MAX_ROUNDS} 輪`, () => {
    const state = run(createChildPlanningSession(), [CLARIFICATION, CHOICE, CHOICE]);

    expect(state.roundsUsed).toBe(CHILD_GOAL_PLANNING_MAX_ROUNDS);
    expect(canRequestPlanningRound(state)).toBe(false);
    expect(recordPlanningResult(state, CHOICE)).toEqual({
      ok: false,
      reason: 'ROUND_LIMIT_REACHED',
    });
  });

  it('問滿之後仍然給得出兩條出路 —— 不是把孩子卡在那裡', () => {
    const state = run(createChildPlanningSession(), [CLARIFICATION, CHOICE, CHOICE]);
    const exits = childPlanningSessionExits(state);

    expect(exits.roundsExhausted).toBe(true);
    expect(exits.canRequestRound).toBe(false);
    // 這兩個型別上就是字面量 true —— 藏起來的畫面編譯不過。
    expect(exits.canWriteOwnStart).toBe(true);
    expect(exits.canSendToParents).toBe(true);
  });

  it('孩子還是可以在問滿之後自己寫怎麼開始', () => {
    const state = run(createChildPlanningSession(), [CLARIFICATION, CHOICE, CHOICE]);
    const outcome = recordChildResponse(state, {
      type: 'custom_choice',
      answer: '我想每天早上先讀一章',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.state.responses).toHaveLength(1);
  });
});

describe('技術失敗不算在孩子頭上', () => {
  it('逾時不消耗 round', () => {
    const state = run(createChildPlanningSession(), [TIMEOUT, TIMEOUT]);

    // 兩次逾時之後，孩子一題都還沒被問到 —— 額度也應該一題都還沒少。
    expect(state.roundsUsed).toBe(0);
    expect(state.attemptsUsed).toBe(2);
    expect(canRequestPlanningRound(state)).toBe(true);
  });

  it('但逾時消耗 attempt —— 「再試一次」有盡頭', () => {
    let state = createChildPlanningSession();
    for (let i = 0; i < CHILD_GOAL_PLANNING_MAX_ATTEMPTS; i += 1) {
      const outcome = recordPlanningResult(state, TIMEOUT);
      if (!outcome.ok) throw new Error(`unexpected refusal: ${outcome.reason}`);
      state = outcome.state;
    }

    expect(canRequestPlanningRound(state)).toBe(false);
    expect(recordPlanningResult(state, TIMEOUT)).toEqual({
      ok: false,
      reason: 'ATTEMPT_LIMIT_REACHED',
    });
    // 掛成這樣，兩條出路仍然開著。
    expect(childPlanningSessionExits(state).canSendToParents).toBe(true);
  });

  it('一次逾時不會把整場 session 判死', () => {
    const state = run(createChildPlanningSession(), [TIMEOUT, READY]);

    expect(state.status).toBe('ready');
    expect(state.latestResult).toEqual(READY);
  });
});

describe('孩子確認過的計畫不可變', () => {
  it('ready → 確認 → child_confirmed', () => {
    const outcome = confirmChildPlan(run(createChildPlanningSession(), [READY]));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.state.status).toBe('child_confirmed');
    expect(outcome.state.confirmedPlan).toEqual(PLAN);
  });

  it('沒有 ready 計畫就確認不了', () => {
    expect(confirmChildPlan(run(createChildPlanningSession(), [CHOICE]))).toEqual({
      ok: false,
      reason: 'NO_READY_PLAN',
    });
    expect(confirmChildPlan(createChildPlanningSession())).toEqual({
      ok: false,
      reason: 'NO_READY_PLAN',
    });
  });

  it('確認之後不能再打模型、不能再回話、也不能再確認一次', () => {
    const confirmed = confirmChildPlan(run(createChildPlanningSession(), [READY]));
    if (!confirmed.ok) throw new Error('expected confirm to succeed');
    const state = confirmed.state;

    expect(canRequestPlanningRound(state)).toBe(false);
    expect(recordPlanningResult(state, READY)).toEqual({
      ok: false,
      reason: 'SESSION_CONFIRMED',
    });
    expect(recordChildResponse(state, { type: 'custom_choice', answer: '改一下' })).toEqual({
      ok: false,
      reason: 'SESSION_CONFIRMED',
    });
    expect(confirmChildPlan(state)).toEqual({ ok: false, reason: 'SESSION_CONFIRMED' });
  });
});

describe('孩子回話之後回到 in_progress', () => {
  it('上一輪的 ready 不再算數 —— 他剛剛給了新資訊', () => {
    const outcome = recordChildResponse(run(createChildPlanningSession(), [READY]), {
      type: 'custom_choice',
      answer: '我想改成早上讀',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.state.status).toBe('in_progress');
  });

  it('只 append，不改寫已經說過的話', () => {
    let state = createChildPlanningSession();
    for (const answer of ['第一句', '第二句']) {
      const outcome = recordChildResponse(state, { type: 'custom_choice', answer });
      if (!outcome.ok) throw new Error('unexpected refusal');
      state = outcome.state;
    }

    expect(state.responses.map((r) => (r.type === 'custom_choice' ? r.answer : ''))).toEqual([
      '第一句',
      '第二句',
    ]);
  });
});

// ---------------------------------------------------------------------------
// P1-A2 Correction — abandoned 是第二個終點
// ---------------------------------------------------------------------------

describe('孩子選擇不規劃、直接送出', () => {
  it('in_progress → abandoned', () => {
    const outcome = abandonChildPlanningSession(run(createChildPlanningSession(), [CHOICE]));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.state.status).toBe('abandoned');
    // 放棄的對話裡不會有一份「他確認過的計畫」。
    expect(outcome.state.confirmedPlan).toBeNull();
  });

  it('ready → abandoned（他看過計畫但選擇不用它）', () => {
    const outcome = abandonChildPlanningSession(run(createChildPlanningSession(), [READY]));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.state.status).toBe('abandoned');
    expect(outcome.state.confirmedPlan).toBeNull();
  });

  it('已經確認過的不能被當成沒規劃送出', () => {
    const confirmed = confirmChildPlan(run(createChildPlanningSession(), [READY]));
    if (!confirmed.ok) throw new Error('expected confirm to succeed');

    // 偷走一份他同意過的計畫，等於讓它從來沒發生過。
    expect(abandonChildPlanningSession(confirmed.state)).toEqual({
      ok: false,
      reason: 'SESSION_CONFIRMED',
    });
  });

  it('放棄之後不能再打模型、不能再回話、不能確認、也不能再放棄一次', () => {
    const abandoned = abandonChildPlanningSession(run(createChildPlanningSession(), [CHOICE]));
    if (!abandoned.ok) throw new Error('expected abandon to succeed');
    const state = abandoned.state;

    expect(canRequestPlanningRound(state)).toBe(false);
    expect(recordPlanningResult(state, READY)).toEqual({
      ok: false,
      reason: 'SESSION_ABANDONED',
    });
    expect(recordChildResponse(state, { type: 'custom_choice', answer: '再想想' })).toEqual({
      ok: false,
      reason: 'SESSION_ABANDONED',
    });
    expect(confirmChildPlan(state)).toEqual({ ok: false, reason: 'SESSION_ABANDONED' });
    expect(abandonChildPlanningSession(state)).toEqual({
      ok: false,
      reason: 'SESSION_ABANDONED',
    });
  });

  it('兩個終點都算終點', () => {
    expect(isTerminalPlanningStatus('child_confirmed')).toBe(true);
    expect(isTerminalPlanningStatus('abandoned')).toBe(true);
    expect(isTerminalPlanningStatus('in_progress')).toBe(false);
    expect(isTerminalPlanningStatus('ready')).toBe(false);
  });
});
