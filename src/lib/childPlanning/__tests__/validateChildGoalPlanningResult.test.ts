// P1-A1 — App 端 validator 的防線
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支測的是「Function 端漂移了、或中間有人改過」的情況。
// canonical 案例測的是正常路徑；這裡測的是**不正常的東西進得來嗎**。
//
// 所有 payload 都是手寫的原始物件，不經過 Function 端的組裝 ——
// 這正是重點：App 端不可以因為「Function 應該不會這樣回」就放行。
// ─────────────────────────────────────────────────────────────────────────

import { validateChildGoalPlanningResult } from '../validateChildGoalPlanningResult';
import type { ChildGoalPlanningInput } from '../types';

const INPUT: ChildGoalPlanningInput = {
  schemaVersion: 1,
  ageGroup: '6-9',
  childOriginalGoal: '我想練直笛',
  childOriginalMotivation: null,
  childApproach: null,
  cadence: null,
  preferredTime: null,
  planningSupportPreference: null,
};

function plan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    progressionKind: 'rhythm',
    desiredOutcome: '每天都練到直笛',
    actionPlanSummary: '先用一週三次的節奏開始。',
    currentFocus: '先把三次固定下來',
    nextAction: { text: '今天先練 10 分鐘', source: 'ai_suggested' },
    reviewPoint: { type: 'after_days', days: 7 },
    planningContribution: 'filled_missing_details',
    provenance: {
      childOriginalGoal: '我想練直笛',
      childStatedApproach: null,
      fields: {
        cadence: 'ai_suggested',
        sessionSize: 'ai_suggested',
        preferredTime: 'undecided',
        nextAction: 'ai_suggested',
        reviewPoint: 'derived',
        phases: 'undecided',
        target: 'undecided',
      },
    },
    startOptions: null,
    model: 'gemini-flash-latest',
    cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
    sessionSize: { kind: 'minutes', minutes: 10 },
    trialPeriod: { days: 7 },
    ...overrides,
  };
}

function validate(
  planOverrides: Record<string, unknown> = {},
  input: ChildGoalPlanningInput = INPUT,
) {
  return validateChildGoalPlanningResult(
    { status: 'ready', schemaVersion: 1, plan: plan(planOverrides) },
    input,
  );
}

describe('正常的一份計畫會通過', () => {
  it('ready', () => {
    const result = validate();
    expect(result.status).toBe('ready');
  });
});

describe('版本與外層形狀', () => {
  it.each([
    null,
    'nope',
    42,
    { status: 'ready' },
    { status: 'ready', schemaVersion: 2, plan: {} },
    { status: 'banana', schemaVersion: 1 },
  ])('%s → INVALID_RESPONSE', (value) => {
    expect(validateChildGoalPlanningResult(value, INPUT)).toMatchObject({
      status: 'unavailable',
      reason: 'INVALID_RESPONSE',
    });
  });

  it('unavailable 照實轉達，認不得的理由退回 INVALID_RESPONSE', () => {
    expect(
      validateChildGoalPlanningResult(
        { status: 'unavailable', schemaVersion: 1, reason: 'TIMEOUT' },
        INPUT,
      ),
    ).toEqual({ status: 'unavailable', schemaVersion: 1, reason: 'TIMEOUT' });

    expect(
      validateChildGoalPlanningResult(
        { status: 'unavailable', schemaVersion: 1, reason: 'ROBOT_TIRED' },
        INPUT,
      ),
    ).toEqual({ status: 'unavailable', schemaVersion: 1, reason: 'INVALID_RESPONSE' });
  });
});

describe('形狀不對的計畫', () => {
  it.each([
    ['認不得的 progressionKind', { progressionKind: 'milestones' }],
    ['認不得的 provenance 來源', {
      provenance: {
        childOriginalGoal: '我想練直笛',
        childStatedApproach: null,
        fields: {
          cadence: 'guessed',
          sessionSize: 'ai_suggested',
          preferredTime: 'undecided',
          nextAction: 'ai_suggested',
          reviewPoint: 'derived',
          phases: 'undecided',
          target: 'undecided',
        },
      },
    }],
    ['缺一個 provenance 欄位', {
      provenance: {
        childOriginalGoal: '我想練直笛',
        childStatedApproach: null,
        fields: { cadence: 'ai_suggested' },
      },
    }],
    ['太長的摘要', { actionPlanSummary: '好'.repeat(121) }],
    ['認不得的 nextAction 來源', {
      nextAction: { text: '今天先練 10 分鐘', source: 'robot' },
    }],
    ['一週八次', { cadence: { mode: 'weekly_frequency', weeklyFrequency: 8 } }],
    ['試行期與 review point 講不同的數字', {
      trialPeriod: { days: 14 },
      reviewPoint: { type: 'after_days', days: 7 },
    }],
    ['rhythm 卻指向一個階段', {
      trialPeriod: null,
      reviewPoint: { type: 'after_phase', phaseId: 'phase-1' },
    }],
    ['沒有選項卻自稱在提供選項', { planningContribution: 'suggested_options' }],
    ['不是在提供選項卻附了選項', {
      startOptions: [
        { id: 'option-1', text: '先每週三次' },
        { id: 'option-2', text: '先每天五分鐘' },
      ],
    }],
    ['只有一個選項', {
      planningContribution: 'suggested_options',
      startOptions: [{ id: 'option-1', text: '先每週三次' }],
    }],
  ])('%s → 不放行', (_label, overrides) => {
    const result = validate(overrides as unknown as Record<string, unknown>);
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.rejections).toContain('SHAPE_INVALID');
  });
});

describe('staged 的階段', () => {
  const staged = {
    progressionKind: 'staged',
    cadence: undefined,
    sessionSize: undefined,
    trialPeriod: undefined,
    reviewPoint: null,
    phases: [
      { id: 'phase-1', title: '想好故事', observableDoneWhen: '寫出三句故事大綱' },
      { id: 'phase-2', title: '畫出分鏡', observableDoneWhen: '畫出 4 頁分鏡草稿' },
    ],
    provenance: {
      childOriginalGoal: '我想練直笛',
      childStatedApproach: null,
      fields: {
        cadence: 'undecided',
        sessionSize: 'undecided',
        preferredTime: 'undecided',
        nextAction: 'ai_suggested',
        reviewPoint: 'undecided',
        phases: 'ai_suggested',
        target: 'undecided',
      },
    },
  };

  it('兩個階段可以', () => {
    expect(validate(staged).status).toBe('ready');
  });

  it('只有一個階段不行 —— 那不是階段，是一件事', () => {
    expect(validate({ ...staged, phases: [staged.phases[0]] }).status).toBe('unavailable');
  });

  it('六個階段不行 —— 為了湊數字拆出來的階段不是真的進展', () => {
    const phases = Array.from({ length: 6 }, (_, i) => ({
      id: `phase-${i + 1}`,
      title: `第 ${i + 1} 步`,
      observableDoneWhen: '做完這一步',
    }));
    expect(validate({ ...staged, phases }).status).toBe('unavailable');
  });

  it('重複的階段 id 不行', () => {
    expect(
      validate({
        ...staged,
        phases: [
          { id: 'phase-1', title: '想好故事', observableDoneWhen: '寫出三句故事大綱' },
          { id: 'phase-1', title: '畫出分鏡', observableDoneWhen: '畫出 4 頁分鏡草稿' },
        ],
      }).status,
    ).toBe('unavailable');
  });

  it('review point 指向不存在的階段不行', () => {
    expect(
      validate({ ...staged, reviewPoint: { type: 'after_phase', phaseId: 'phase-9' } }).status,
    ).toBe('unavailable');
  });
});

describe('孩子講過的東西', () => {
  const withChildInput: ChildGoalPlanningInput = {
    ...INPUT,
    childApproach: '每天放學練 10 分鐘',
    cadence: { mode: 'weekly_frequency', weeklyFrequency: 7 },
  };

  const echoed = {
    cadence: { mode: 'weekly_frequency', weeklyFrequency: 7 },
    nextAction: { text: '放學後先練 10 分鐘', source: 'child' },
    planningContribution: 'organized_child_plan',
    provenance: {
      childOriginalGoal: '我想練直笛',
      childStatedApproach: '每天放學練 10 分鐘',
      fields: {
        cadence: 'child',
        sessionSize: 'derived',
        preferredTime: 'undecided',
        nextAction: 'child',
        reviewPoint: 'derived',
        phases: 'undecided',
        target: 'undecided',
      },
    },
  };

  it('原封不動照抄回來 → 通過', () => {
    expect(validate(echoed, withChildInput).status).toBe('ready');
  });

  it('目標被改寫 → CHILD_INPUT_OVERWRITTEN', () => {
    const result = validate(
      {
        ...echoed,
        provenance: { ...echoed.provenance, childOriginalGoal: '建立每日練習習慣' },
      },
      withChildInput,
    );
    expect(result).toMatchObject({ status: 'unavailable', reason: 'INVALID_AI_OUTPUT' });
    if (result.status !== 'unavailable') return;
    expect(result.rejections).toContain('CHILD_INPUT_OVERWRITTEN');
  });

  it('方法被弄丟 → CHILD_INPUT_OVERWRITTEN', () => {
    const result = validate(
      {
        ...echoed,
        provenance: { ...echoed.provenance, childStatedApproach: null },
      },
      withChildInput,
    );
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('CHILD_INPUT_OVERWRITTEN');
  });

  it('節奏被換掉 → CHILD_INPUT_OVERWRITTEN', () => {
    const result = validate(
      { ...echoed, cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 } },
      withChildInput,
    );
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('CHILD_INPUT_OVERWRITTEN');
  });

  it('節奏還在，但 provenance 說是 AI 想的 → 一樣擋下', () => {
    const result = validate(
      {
        ...echoed,
        provenance: {
          ...echoed.provenance,
          fields: { ...echoed.provenance.fields, cadence: 'ai_suggested' },
        },
      },
      withChildInput,
    );
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('CHILD_INPUT_OVERWRITTEN');
  });
});

describe('孩子沒說的事', () => {
  it('沒說時段卻不是 undecided → UNDECIDED_DETAIL_INVENTED', () => {
    const result = validate({
      provenance: {
        childOriginalGoal: '我想練直笛',
        childStatedApproach: null,
        fields: {
          cadence: 'ai_suggested',
          sessionSize: 'ai_suggested',
          preferredTime: 'ai_suggested',
          nextAction: 'ai_suggested',
          reviewPoint: 'derived',
          phases: 'undecided',
          target: 'undecided',
        },
      },
    });
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('UNDECIDED_DETAIL_INVENTED');
  });

  it('說了時段，provenance 卻不認帳 → CHILD_INPUT_OVERWRITTEN', () => {
    const result = validate({}, { ...INPUT, preferredTime: '睡前' });
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('CHILD_INPUT_OVERWRITTEN');
  });
});

describe('澄清問題', () => {
  it('正常的一題會通過', () => {
    const result = validateChildGoalPlanningResult(
      {
        status: 'needs_clarification',
        schemaVersion: 1,
        knownGoal: '我想練直笛',
        question: { kind: 'cadence', text: '你想一週練幾次呢？' },
        model: 'gemini-flash-latest',
      },
      INPUT,
    );
    expect(result.status).toBe('needs_clarification');
  });

  it('認不得的問題種類不放行', () => {
    const result = validateChildGoalPlanningResult(
      {
        status: 'needs_clarification',
        schemaVersion: 1,
        knownGoal: '我想練直笛',
        question: { kind: 'why_not', text: '為什麼？' },
        model: 'gemini-flash-latest',
      },
      INPUT,
    );
    expect(result.status).toBe('unavailable');
  });

  it('問問題時改寫孩子的目標也不放行', () => {
    const result = validateChildGoalPlanningResult(
      {
        status: 'needs_clarification',
        schemaVersion: 1,
        knownGoal: '建立每日練習習慣',
        question: { kind: 'cadence', text: '你想一週練幾次呢？' },
        model: 'gemini-flash-latest',
      },
      INPUT,
    );
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('CHILD_INPUT_OVERWRITTEN');
  });
});
