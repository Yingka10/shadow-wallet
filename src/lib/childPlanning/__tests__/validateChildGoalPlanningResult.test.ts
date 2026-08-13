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

const BASE_PROVENANCE = {
  childOriginalGoal: '我想練直笛',
  childStatedApproach: null as string | null,
  fields: {
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

function plan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    goalControlType: 'directly_actionable',
    progressionKind: 'rhythm',
    desiredOutcome: '每天都練到直笛',
    actionPlanSummary: '先用一週三次的節奏開始。',
    currentFocus: '先把三次固定下來',
    nextAction: { text: '今天先練 10 分鐘', source: 'ai_suggested' },
    reviewPoint: { type: 'after_days', days: 7 },
    planningContribution: 'filled_missing_details',
    provenance: BASE_PROVENANCE,
    model: 'gemini-flash-latest',
    cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
    sessionSize: { kind: 'minutes', minutes: 10 },
    trialPeriod: { days: 7 },
    ...overrides,
  };
}

/** provenance 只改幾個欄位，其他沿用。 */
function provenance(
  fields: Record<string, string> = {},
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...BASE_PROVENANCE,
    ...extra,
    fields: { ...BASE_PROVENANCE.fields, ...fields },
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
    expect(validate().status).toBe('ready');
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
    ['認不得的 progressionKind', { progressionKind: 'outcome_to_action' }],
    ['認不得的 goalControlType', { goalControlType: 'sort_of' }],
    ['認不得的 provenance 來源', { provenance: provenance({ cadence: 'guessed' }) }],
    ['缺一個 provenance 欄位（新加的 controllableActions）', {
      provenance: {
        childOriginalGoal: '我想練直笛',
        childStatedApproach: null,
        fields: {
          cadence: 'ai_suggested',
          sessionSize: 'ai_suggested',
          preferredTime: 'undecided',
          nextAction: 'ai_suggested',
          reviewPoint: 'ai_suggested',
          phases: 'undecided',
          target: 'undecided',
        },
      },
    }],
    ['太長的摘要', { actionPlanSummary: '好'.repeat(121) }],
    ['認不得的 nextAction 來源', {
      nextAction: { text: '今天先練 10 分鐘', source: 'robot' },
    }],
    ['nextAction 的來源與 provenance 講不一樣', {
      nextAction: { text: '今天先練 10 分鐘', source: 'derived_from_child' },
    }],
    ['一週八次', { cadence: { mode: 'weekly_frequency', weeklyFrequency: 8 } }],
    ['試行期與 review point 講不同的數字', {
      trialPeriod: { days: 14 },
      reviewPoint: { type: 'after_days', days: 7 },
    }],
    ['rhythm 卻指向一個階段', {
      trialPeriod: null,
      reviewPoint: { type: 'after_phase', phaseId: 'phase-1' },
      provenance: provenance({ reviewPoint: 'ai_suggested' }),
    }],
    ['沒有可控行動卻說得出它的來源', {
      provenance: provenance({ controllableActions: 'ai_suggested' }),
    }],
    ['directly_actionable 卻附了可控行動', {
      controllableActions: ['先複習 15 分鐘'],
      provenance: provenance({ controllableActions: 'ai_suggested' }),
    }],
    ['沒有 reviewPoint 卻說得出它的來源', {
      reviewPoint: null,
      trialPeriod: null,
    }],
  ])('%s → 不放行', (_label, overrides) => {
    const result = validate(overrides as unknown as Record<string, unknown>);
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.rejections).toContain('SHAPE_INVALID');
  });
});

describe('external_outcome', () => {
  const external = {
    goalControlType: 'external_outcome',
    controllableActions: ['先複習 15 分鐘', '把寫錯的題目抄下來'],
    provenance: provenance({ controllableActions: 'ai_suggested' }),
  };

  it('附上可控行動 → 通過', () => {
    expect(validate(external).status).toBe('ready');
  });

  it('沒有可控行動 → 不放行', () => {
    expect(
      validate({ ...external, controllableActions: null }).status,
    ).toBe('unavailable');
  });

  it('可控行動裡混進不可控的成果 → OUTCOME_USED_AS_ACTION', () => {
    const result = validate({
      ...external,
      controllableActions: ['先複習 15 分鐘', '這次要拿第一名'],
    });
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('OUTCOME_USED_AS_ACTION');
  });

  it('三種 progression 都可以搭配 external_outcome', () => {
    // 兩個維度正交 —— 不可控的成果不會被綁定成某一種前進方式。
    expect(validate(external).status).toBe('ready');
    expect(
      validate({
        ...external,
        progressionKind: 'accumulation',
        cadence: undefined,
        sessionSize: undefined,
        trialPeriod: undefined,
        targetValue: 20,
        targetUnit: '次',
        currentValue: 0,
        provenance: provenance({
          controllableActions: 'ai_suggested',
          cadence: 'undecided',
          sessionSize: 'undecided',
          target: 'ai_suggested',
        }),
      }).status,
    ).toBe('ready');
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
    provenance: provenance({
      cadence: 'undecided',
      sessionSize: 'undecided',
      reviewPoint: 'undecided',
      phases: 'ai_suggested',
    }),
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
      validate({
        ...staged,
        reviewPoint: { type: 'after_phase', phaseId: 'phase-9' },
        provenance: provenance({
          cadence: 'undecided',
          sessionSize: 'undecided',
          reviewPoint: 'ai_suggested',
          phases: 'ai_suggested',
        }),
      }).status,
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
    nextAction: { text: '放學後先練 10 分鐘', source: 'child_stated' },
    planningContribution: 'organized_child_plan',
    provenance: provenance(
      {
        cadence: 'child_stated',
        sessionSize: 'derived_from_child',
        nextAction: 'child_stated',
        reviewPoint: 'derived_from_child',
      },
      { childStatedApproach: '每天放學練 10 分鐘' },
    ),
  };

  it('原封不動照抄回來 → 通過', () => {
    expect(validate(echoed, withChildInput).status).toBe('ready');
  });

  it('目標被改寫 → CHILD_INPUT_OVERWRITTEN', () => {
    const result = validate(
      {
        ...echoed,
        provenance: provenance(
          {
            cadence: 'child_stated',
            sessionSize: 'derived_from_child',
            nextAction: 'child_stated',
            reviewPoint: 'derived_from_child',
          },
          { childOriginalGoal: '建立每日練習習慣', childStatedApproach: '每天放學練 10 分鐘' },
        ),
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
        provenance: provenance({
          cadence: 'child_stated',
          sessionSize: 'derived_from_child',
          nextAction: 'child_stated',
          reviewPoint: 'derived_from_child',
        }),
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

  it('節奏還在，但 provenance 說是 AI 想的 → 低順位覆蓋高順位，擋下', () => {
    const result = validate(
      {
        ...echoed,
        provenance: provenance(
          {
            cadence: 'ai_suggested',
            sessionSize: 'derived_from_child',
            nextAction: 'child_stated',
            reviewPoint: 'derived_from_child',
          },
          { childStatedApproach: '每天放學練 10 分鐘' },
        ),
      },
      withChildInput,
    );
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('CHILD_INPUT_OVERWRITTEN');
  });

  it('孩子都講完了，下一步卻是 AI 想的 → 擋下', () => {
    const result = validate(
      {
        ...echoed,
        nextAction: { text: '先做 20 下運球練習', source: 'ai_suggested' },
        provenance: provenance(
          {
            cadence: 'child_stated',
            sessionSize: 'derived_from_child',
            nextAction: 'ai_suggested',
            reviewPoint: 'derived_from_child',
          },
          { childStatedApproach: '每天放學練 10 分鐘' },
        ),
      },
      withChildInput,
    );
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('CHILD_INPUT_OVERWRITTEN');
  });

  it('沒有人挑過選項卻自稱 child_chose_option → 擋下', () => {
    const result = validate({ planningContribution: 'child_chose_option' });
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('CHILD_INPUT_OVERWRITTEN');
  });
});

describe('孩子沒說的事', () => {
  it('沒說時段卻不是 undecided → UNDECIDED_DETAIL_INVENTED', () => {
    const result = validate({ provenance: provenance({ preferredTime: 'ai_suggested' }) });
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('UNDECIDED_DETAIL_INVENTED');
  });

  it('說了時段，provenance 卻不認帳 → CHILD_INPUT_OVERWRITTEN', () => {
    const result = validate({}, { ...INPUT, preferredTime: '睡前' });
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('CHILD_INPUT_OVERWRITTEN');
  });

  it('孩子沒選節奏，AI 的建議卻被掛到他頭上 → CHILD_INPUT_OVERWRITTEN', () => {
    const result = validate({ provenance: provenance({ cadence: 'child_stated' }) });
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('CHILD_INPUT_OVERWRITTEN');
  });
});

describe('領域權威', () => {
  it('計畫摘要宣稱「最有效」→ DOMAIN_AUTHORITY_CLAIM', () => {
    const result = validate({ actionPlanSummary: '這是最有效的直笛練習順序。' });
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('DOMAIN_AUTHORITY_CLAIM');
  });

  it('下一步寫成專業處方 → DOMAIN_AUTHORITY_CLAIM', () => {
    const result = validate({
      nextAction: { text: '照專業訓練處方練習', source: 'ai_suggested' },
    });
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('DOMAIN_AUTHORITY_CLAIM');
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

describe('需要孩子挑一個', () => {
  const choice = {
    status: 'needs_choice',
    schemaVersion: 1,
    knownGoal: '我想練直笛',
    question: '你想先用哪一種方式開始？',
    options: [
      { id: 'option-1', text: '每天睡前練 10 分鐘' },
      { id: 'option-2', text: '週末一次練久一點' },
    ],
    allowCustomAnswer: true,
    model: 'gemini-flash-latest',
  };

  it('正常的選項會通過', () => {
    const result = validateChildGoalPlanningResult(choice, INPUT);
    expect(result.status).toBe('needs_choice');
    if (result.status !== 'needs_choice') return;
    expect(result.options).toHaveLength(2);
    expect(result.allowCustomAnswer).toBe(true);
  });

  it('allowCustomAnswer 不是 true 就是壞掉的回應', () => {
    for (const bad of [false, undefined, 'yes', null]) {
      expect(
        validateChildGoalPlanningResult({ ...choice, allowCustomAnswer: bad }, INPUT).status,
      ).toBe('unavailable');
    }
  });

  it('只有一個選項不算選項', () => {
    expect(
      validateChildGoalPlanningResult(
        { ...choice, options: [choice.options[0]] },
        INPUT,
      ).status,
    ).toBe('unavailable');
  });

  it('四個選項太多了', () => {
    expect(
      validateChildGoalPlanningResult(
        {
          ...choice,
          options: [
            { id: 'option-1', text: 'A' },
            { id: 'option-2', text: 'B' },
            { id: 'option-3', text: 'C' },
            { id: 'option-4', text: 'D' },
          ],
        },
        INPUT,
      ).status,
    ).toBe('unavailable');
  });

  it('孩子已經有方法了還給他選項 → CHILD_INPUT_OVERWRITTEN', () => {
    const result = validateChildGoalPlanningResult(choice, {
      ...INPUT,
      childApproach: '我想每天放學練 10 分鐘',
    });
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('CHILD_INPUT_OVERWRITTEN');
  });

  it('選項裡夾帶領域權威也不放行', () => {
    const result = validateChildGoalPlanningResult(
      {
        ...choice,
        options: [
          { id: 'option-1', text: '每天睡前練 10 分鐘' },
          { id: 'option-2', text: '照最有效的順序練' },
        ],
      },
      INPUT,
    );
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.rejections).toContain('DOMAIN_AUTHORITY_CLAIM');
  });
});
