// P1-A1 — Child Goal Planning 的 canonical 案例
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支是這個工作包最重要的產出：**用案例把契約釘死**。
//
// 每一個案例都跑完整條路徑，不是只驗一端：
//
//   孩子講的話 → prompt → （手寫的）模型輸出 → Function 端正規化與組裝
//                → App 端 validator（含所有 deterministic guard）
//
// 手寫的模型輸出是刻意的：這是 **contract acceptance**，不是
// real-model acceptance。它證明的是「模型這樣回，系統會這樣處理」，
// 不證明「Gemini 真的會這樣回」。後者要打 staging 才算數。
//
// 它住在 supabase/functions 底下（而不是 src）的理由：這裡兩端的檔案
// 都 import 得到，而且這個目錄不進 App 的 tsc/bundle。
// ─────────────────────────────────────────────────────────────────────────

import {
  buildChildGoalPlanningPrompt,
  childGoalPlanningInputIsUsable,
  composeChildGoalPlanningResponse,
  informationIsSufficient,
  normalizeChildGoalPlanning,
  type ChildGoalPlanningInput,
  type ChildGoalPlanningResponse,
} from '../childGoalPlanningLogic';
import { validateChildGoalPlanningResult } from '../../../../src/lib/childPlanning/validateChildGoalPlanningResult';
import type {
  ChildGoalPlanningInput as AppInput,
  ChildGoalPlanningResult,
} from '../../../../src/lib/childPlanning/types';

const MODEL = 'gemini-flash-latest';

function input(overrides: Partial<ChildGoalPlanningInput> = {}): ChildGoalPlanningInput {
  return {
    schemaVersion: 1,
    ageGroup: '6-9',
    childOriginalGoal: '我想變厲害',
    childOriginalMotivation: null,
    childApproach: null,
    cadence: null,
    preferredTime: null,
    planningSupportPreference: null,
    responses: [],
    ...overrides,
  };
}

/**
 * 一次跑完整條路徑：模型輸出 → Function 組裝 → App validator。
 *
 * 中間刻意經過一次 JSON round-trip —— 真實路徑上這份東西會被序列化、
 * 過網路、再被 App 端當成 unknown 收下。少了這一步，測試會比真實情況寬鬆。
 */
function roundTrip(
  fnInput: ChildGoalPlanningInput,
  modelOutput: unknown,
): { response: ChildGoalPlanningResponse; result: ChildGoalPlanningResult } {
  const understanding = normalizeChildGoalPlanning(modelOutput);
  const response: ChildGoalPlanningResponse =
    understanding === null
      ? { status: 'unavailable', schemaVersion: 1, reason: 'INVALID_AI_OUTPUT' }
      : composeChildGoalPlanningResponse({ input: fnInput, understanding, model: MODEL });

  return {
    response,
    result: validateChildGoalPlanningResult(
      JSON.parse(JSON.stringify(response)),
      fnInput as AppInput,
    ),
  };
}

// ---------------------------------------------------------------------------
// Case 1 — 孩子已經完整想好
// ---------------------------------------------------------------------------

const CASE_1_INPUT = input({
  childOriginalGoal: '我想兩週讀完神奇樹屋',
  childApproach: '平日睡前讀 15 分鐘',
  cadence: { mode: 'fixed_days', days: [1, 2, 3, 4, 5] },
  preferredTime: '睡前',
  planningSupportPreference: 'organize_only',
});

const CASE_1_MODEL = {
  status: 'ready',
  desiredOutcome: '兩週讀完神奇樹屋',
  goalControlType: 'directly_actionable',
  progressionKind: 'rhythm',
  actionPlanSummary: '平日睡前讀 15 分鐘，兩週把這本書讀完。',
  currentFocus: '先維持平日睡前的閱讀',
  nextAction: { text: '今晚睡前先讀 15 分鐘', source: 'child_stated' },
  reviewPoint: { type: 'after_days', days: 7 },
  planningContribution: 'organized_child_plan',
  suggestedCadence: null,
  sessionSize: { kind: 'minutes', minutes: 15 },
  trialPeriod: { days: 7 },
  phases: null,
  targetValue: null,
  targetUnit: null,
  currentValue: null,
  controllableActions: null,
};

describe('Case 1｜孩子已經完整想好', () => {
  const { result } = roundTrip(CASE_1_INPUT, CASE_1_MODEL);

  it('是 ready、directly_actionable、rhythm、organized_child_plan', () => {
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.plan.goalControlType).toBe('directly_actionable');
    expect(result.plan.progressionKind).toBe('rhythm');
    expect(result.plan.planningContribution).toBe('organized_child_plan');
  });

  it('AI 沒有新增任何孩子沒說過的安排', () => {
    if (result.status !== 'ready' || result.plan.progressionKind !== 'rhythm') {
      throw new Error('expected rhythm plan');
    }
    // 節奏原封不動 —— 不是「差不多」，是同一個物件內容。
    expect(result.plan.cadence).toEqual(CASE_1_INPUT.cadence);
    expect(result.plan.provenance.fields.cadence).toBe('child_stated');
    expect(result.plan.provenance.fields.preferredTime).toBe('child_stated');
  });

  it('孩子的原話與方法逐字保留', () => {
    if (result.status !== 'ready') throw new Error('expected ready');
    expect(result.plan.provenance.childOriginalGoal).toBe('我想兩週讀完神奇樹屋');
    expect(result.plan.provenance.childStatedApproach).toBe('平日睡前讀 15 分鐘');
  });

  it('單次份量記成「從孩子的話推出來的」，不是 AI 想的', () => {
    if (result.status !== 'ready') throw new Error('expected ready');
    expect(result.plan.provenance.fields.sessionSize).toBe('derived_from_child');
  });

  it('成果保留在 desiredOutcome，而下一步是他今天做得到的事', () => {
    if (result.status !== 'ready') throw new Error('expected ready');
    expect(result.plan.desiredOutcome).toContain('讀完');
    expect(result.plan.nextAction.text).not.toContain('讀完');
    expect(result.plan.nextAction.source).toBe('child_stated');
  });
});

// ---------------------------------------------------------------------------
// Case 2 — 模糊目標
// ---------------------------------------------------------------------------

const CASE_2_INPUT = input({ childOriginalGoal: '我想變厲害' });

describe('Case 2｜模糊目標「我想變厲害」', () => {
  const { result } = roundTrip(CASE_2_INPUT, {
    status: 'needs_clarification',
    question: { kind: 'goal_focus', text: '你最想在哪一件事情上變厲害？' },
  });

  it('回 needs_clarification，而且只有一題', () => {
    expect(result.status).toBe('needs_clarification');
    if (result.status !== 'needs_clarification') return;
    expect(result.question.kind).toBe('goal_focus');
    // 型別上就是單一物件 —— 一次問五題在結構上寫不出來。
    expect(Array.isArray(result.question)).toBe(false);
  });

  it('孩子的目標沒有被改寫', () => {
    if (result.status !== 'needs_clarification') throw new Error('expected clarification');
    expect(result.knownGoal).toBe('我想變厲害');
  });
});

// ---------------------------------------------------------------------------
// Case 3 — 知道成果，不知道方法
// ---------------------------------------------------------------------------

const CASE_3_INPUT = input({ childOriginalGoal: '我想國文考 100 分' });

describe('Case 3｜知道成果，不知道方法', () => {
  const { result } = roundTrip(CASE_3_INPUT, {
    status: 'ready',
    desiredOutcome: '國文考 100 分',
    goalControlType: 'external_outcome',
    progressionKind: 'rhythm',
    actionPlanSummary: '成績沒辦法直接控制，先把每週的複習做起來。',
    currentFocus: '先固定複習的時間',
    nextAction: { text: '先複習 15 分鐘', source: 'ai_suggested' },
    reviewPoint: { type: 'after_days', days: 14 },
    planningContribution: 'filled_missing_details',
    suggestedCadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
    sessionSize: { kind: 'minutes', minutes: 15 },
    trialPeriod: { days: 14 },
    phases: null,
    targetValue: null,
    targetUnit: null,
    currentValue: null,
    controllableActions: ['每次先複習 15 分鐘', '把寫錯的題目抄下來'],
  });

  it('成果是 external_outcome，但行動計畫的 progression 是 rhythm', () => {
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    // 這正是兩個維度分開的理由：不可控的成果一樣可以有節奏型的行動計畫。
    expect(result.plan.goalControlType).toBe('external_outcome');
    expect(result.plan.progressionKind).toBe('rhythm');
  });

  it('保留「國文考 100 分」這個成果', () => {
    if (result.status !== 'ready') throw new Error('expected ready');
    expect(result.plan.desiredOutcome).toBe('國文考 100 分');
  });

  it('但下一步不是分數', () => {
    if (result.status !== 'ready') throw new Error('expected ready');
    // 「15 分鐘」裡的「分」是時間，不是成績——要擋的是把成果當成行動。
    expect(result.plan.nextAction.text).not.toContain('100 分');
    expect(result.plan.nextAction.text).not.toContain('考');
    expect(result.plan.nextAction.text).not.toBe(result.plan.desiredOutcome);
  });

  it('可控行動獨立於 progression 存在', () => {
    if (result.status !== 'ready' || result.plan.goalControlType !== 'external_outcome') {
      throw new Error('expected external outcome');
    }
    expect(result.plan.controllableActions).toHaveLength(2);
    expect(result.plan.provenance.fields.controllableActions).toBe('ai_suggested');
  });

  it('先問一題也是合法的（不是每次都必須直接生計畫）', () => {
    const { result: asked } = roundTrip(CASE_3_INPUT, {
      status: 'needs_clarification',
      question: { kind: 'approach', text: '你想先從哪一種練習開始試試看？' },
    });
    expect(asked.status).toBe('needs_clarification');
  });
});

// ---------------------------------------------------------------------------
// Case 4 — 孩子有自己的方法
// ---------------------------------------------------------------------------

const CASE_4_INPUT = input({
  childOriginalGoal: '我想投籃更準',
  childApproach: '我想每天放學投 20 球',
  cadence: { mode: 'weekly_frequency', weeklyFrequency: 7 },
});

const CASE_4_MODEL = {
  status: 'ready',
  desiredOutcome: '投籃更準',
  goalControlType: 'directly_actionable',
  progressionKind: 'rhythm',
  actionPlanSummary: '每天放學投 20 球，先照他自己想的方式做。',
  currentFocus: '先把每天 20 球固定下來',
  nextAction: { text: '放學後先投 20 球', source: 'child_stated' },
  reviewPoint: { type: 'after_days', days: 7 },
  planningContribution: 'organized_child_plan',
  suggestedCadence: null,
  sessionSize: { kind: 'count', count: 20, unit: '球' },
  trialPeriod: { days: 7 },
  phases: null,
  targetValue: null,
  targetUnit: null,
  currentValue: null,
  controllableActions: null,
};

describe('Case 4｜孩子有自己的方法', () => {
  const { result } = roundTrip(CASE_4_INPUT, CASE_4_MODEL);

  it('孩子的方法被保留，不是被換掉', () => {
    expect(result.status).toBe('ready');
    if (result.status !== 'ready' || result.plan.progressionKind !== 'rhythm') return;
    expect(result.plan.provenance.childStatedApproach).toBe('我想每天放學投 20 球');
    expect(result.plan.sessionSize).toEqual({ kind: 'count', count: 20, unit: '球' });
    expect(result.plan.cadence).toEqual(CASE_4_INPUT.cadence);
    expect(result.plan.planningContribution).toBe('organized_child_plan');
  });

  it('被換成另一套訓練就整份不放行', () => {
    // 孩子連節奏帶方法都講了，下一步卻是 AI 想的 —— 這正是「覆寫」
    // 在資料上唯一看得出來的形狀。
    const { result: overwritten } = roundTrip(CASE_4_INPUT, {
      ...CASE_4_MODEL,
      nextAction: { text: '先做 20 下運球練習', source: 'ai_suggested' },
    });
    expect(overwritten.status).toBe('unavailable');
    if (overwritten.status !== 'unavailable') return;
    expect(overwritten.rejections).toContain('CHILD_INPUT_OVERWRITTEN');
  });

  it('已經有方法了還丟選項給他 → 這一輪無效', () => {
    const { response, result: choice } = roundTrip(CASE_4_INPUT, {
      status: 'needs_choice',
      question: '你想先用哪一種方式開始？',
      options: ['先練運球', '先練投籃姿勢'],
    });
    expect(response.status).toBe('unavailable');
    expect(choice.status).toBe('unavailable');
  });
});

// ---------------------------------------------------------------------------
// Case 5 — 技能型
// ---------------------------------------------------------------------------

const CASE_5_INPUT = input({ childOriginalGoal: '我想學會騎腳踏車' });

describe('Case 5｜技能型「我想學會騎腳踏車」', () => {
  it('可以是 staged，而且每個階段都看得見', () => {
    const { result } = roundTrip(CASE_5_INPUT, {
      status: 'ready',
      desiredOutcome: '學會騎腳踏車',
      goalControlType: 'directly_actionable',
      progressionKind: 'staged',
      actionPlanSummary: '先從滑行開始，能穩住之後再練踩踏。',
      currentFocus: '先練滑行',
      nextAction: { text: '先在草地上滑行 10 分鐘', source: 'ai_suggested' },
      reviewPoint: { type: 'after_phase', phaseIndex: 1 },
      planningContribution: 'filled_missing_details',
      suggestedCadence: null,
      sessionSize: null,
      trialPeriod: null,
      phases: [
        { title: '能自己滑行', observableDoneWhen: '能雙腳離地滑行 5 公尺' },
        { title: '能自己踩踏', observableDoneWhen: '能不扶著騎完 10 公尺' },
      ],
      targetValue: null,
      targetUnit: null,
      currentValue: null,
      controllableActions: null,
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready' || result.plan.progressionKind !== 'staged') return;
    expect(result.plan.phases).toHaveLength(2);
    // review point 指向真的存在的那個階段。
    expect(result.plan.reviewPoint).toEqual({ type: 'after_phase', phaseId: 'phase-1' });
  });

  it('缺「現在到哪」時，先問一題也是合法的', () => {
    const { result } = roundTrip(CASE_5_INPUT, {
      status: 'needs_clarification',
      question: { kind: 'current_level', text: '你現在騎到什麼程度了呢？' },
    });
    expect(result.status).toBe('needs_clarification');
    if (result.status !== 'needs_clarification') return;
    expect(result.question.kind).toBe('current_level');
  });
});

// ---------------------------------------------------------------------------
// Case 6 — 專案型
// ---------------------------------------------------------------------------

describe('Case 6｜專案型「我想做一本漫畫」', () => {
  const { result } = roundTrip(input({ childOriginalGoal: '我想做一本漫畫' }), {
    status: 'ready',
    desiredOutcome: '做出一本自己的漫畫',
    goalControlType: 'directly_actionable',
    progressionKind: 'staged',
    actionPlanSummary: '先想故事，再畫分鏡，最後上色收尾。',
    currentFocus: '先把故事想出來',
    nextAction: { text: '先寫三句故事大綱', source: 'ai_suggested' },
    reviewPoint: null,
    planningContribution: 'filled_missing_details',
    suggestedCadence: null,
    sessionSize: null,
    trialPeriod: null,
    phases: [
      { title: '想好故事', observableDoneWhen: '寫出三句故事大綱' },
      { title: '畫出分鏡', observableDoneWhen: '畫出 4 頁分鏡草稿' },
      { title: '完成上色', observableDoneWhen: '4 頁都上完色' },
    ],
    targetValue: null,
    targetUnit: null,
    currentValue: null,
    controllableActions: null,
  });

  it('是 staged，有自然的階段', () => {
    expect(result.status).toBe('ready');
    if (result.status !== 'ready' || result.plan.progressionKind !== 'staged') return;
    expect(result.plan.phases).toHaveLength(3);
  });

  it('沒有被硬塞一個固定節奏 —— staged 在型別上就沒有 cadence 欄位', () => {
    if (result.status !== 'ready') throw new Error('expected ready');
    expect('cadence' in result.plan).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Case 7 — 累積型
// ---------------------------------------------------------------------------

describe('Case 7｜累積型「暑假想讀 5 本書」', () => {
  const { result } = roundTrip(input({ childOriginalGoal: '暑假想讀 5 本書' }), {
    status: 'ready',
    desiredOutcome: '暑假讀 5 本書',
    goalControlType: 'directly_actionable',
    progressionKind: 'accumulation',
    actionPlanSummary: '暑假讀 5 本書，一本一本累積上去。',
    currentFocus: '先挑第一本想看的書',
    nextAction: { text: '先挑一本想看的書', source: 'ai_suggested' },
    reviewPoint: null,
    planningContribution: 'filled_missing_details',
    suggestedCadence: null,
    sessionSize: null,
    trialPeriod: null,
    phases: null,
    targetValue: 5,
    targetUnit: '本',
    currentValue: 0,
    controllableActions: null,
  });

  it('是 accumulation，進度是 current / target', () => {
    expect(result.status).toBe('ready');
    if (result.status !== 'ready' || result.plan.progressionKind !== 'accumulation') return;
    expect(result.plan.targetValue).toBe(5);
    expect(result.plan.targetUnit).toBe('本');
    expect(result.plan.currentValue).toBe(0);
  });

  it('沒有被拆成「第一本」「第二本」—— accumulation 沒有 phases 欄位', () => {
    if (result.status !== 'ready') throw new Error('expected ready');
    expect('phases' in result.plan).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Case 8 — AI 不該多嘴
// ---------------------------------------------------------------------------

const CASE_8_INPUT = input({
  childOriginalGoal: '我想每天練直笛',
  childApproach: '一週三次，每次 20 分鐘，先試兩週',
  cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
  preferredTime: '睡前',
});

describe('Case 8｜資訊已經足夠，不該再問', () => {
  it('Function 端就認定資訊足夠', () => {
    expect(informationIsSufficient(CASE_8_INPUT)).toBe(true);
  });

  it('prompt 直接禁止這一輪問問題或給選項', () => {
    const prompt = buildChildGoalPlanningPrompt(CASE_8_INPUT);
    expect(prompt).toContain('不可以再問問題、也不可以再給選項');
  });

  it('模型還是問了 → 這一輪無效，不是把問題吞掉再自己編一份計畫', () => {
    const { response, result } = roundTrip(CASE_8_INPUT, {
      status: 'needs_clarification',
      question: { kind: 'cadence', text: '你想一週幾次呢？' },
    });
    expect(response).toEqual({
      status: 'unavailable',
      schemaVersion: 1,
      reason: 'INVALID_AI_OUTPUT',
    });
    expect(result.status).toBe('unavailable');
  });

  it('改成丟選項給他，一樣是多嘴', () => {
    const { response } = roundTrip(CASE_8_INPUT, {
      status: 'needs_choice',
      question: '你想先用哪一種方式開始？',
      options: ['一週兩次', '一週四次'],
    });
    expect(response.status).toBe('unavailable');
  });

  it('就算問題繞過 Function 直接到 App，App 端也擋得下來', () => {
    const result = validateChildGoalPlanningResult(
      {
        status: 'needs_clarification',
        schemaVersion: 1,
        knownGoal: CASE_8_INPUT.childOriginalGoal,
        question: { kind: 'session_size', text: '你每次想練多久？' },
        model: MODEL,
      },
      CASE_8_INPUT as AppInput,
    );
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.rejections).toContain('UNNECESSARY_CLARIFICATION');
  });
});

// ---------------------------------------------------------------------------
// Case 9 — 不可控結果
// ---------------------------------------------------------------------------

const CASE_9_INPUT = input({ childOriginalGoal: '我要比賽第一名' });

const CASE_9_MODEL = {
  status: 'ready',
  desiredOutcome: '比賽拿第一名',
  goalControlType: 'external_outcome',
  progressionKind: 'rhythm',
  actionPlanSummary: '名次沒辦法直接控制，先把每週的練習做起來。',
  currentFocus: '先固定每週的練習',
  nextAction: { text: '今天先練 20 分鐘', source: 'ai_suggested' },
  reviewPoint: { type: 'after_sessions', sessions: 3 },
  planningContribution: 'filled_missing_details',
  suggestedCadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
  sessionSize: { kind: 'minutes', minutes: 20 },
  trialPeriod: { sessions: 3 },
  phases: null,
  targetValue: null,
  targetUnit: null,
  currentValue: null,
  controllableActions: ['每次練習前先暖身', '練完記下哪裡卡住'],
};

describe('Case 9｜不可控結果「我要比賽第一名」', () => {
  it('成果保留，行動是他控制得了的', () => {
    const { result } = roundTrip(CASE_9_INPUT, CASE_9_MODEL);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready' || result.plan.goalControlType !== 'external_outcome') return;
    expect(result.plan.desiredOutcome).toContain('第一名');
    expect(result.plan.controllableActions).toHaveLength(2);
  });

  it('「下一步：拿第一名」整份不放行', () => {
    const { result } = roundTrip(CASE_9_INPUT, {
      ...CASE_9_MODEL,
      nextAction: { text: '拿第一名', source: 'ai_suggested' },
    });
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.rejections).toContain('NEXT_ACTION_INVALID');
  });

  it('把成果混進可控制的行動裡也不放行', () => {
    const { result } = roundTrip(CASE_9_INPUT, {
      ...CASE_9_MODEL,
      controllableActions: ['每次練習前先暖身', '這次比賽要拿第一名'],
    });
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.rejections).toContain('OUTCOME_USED_AS_ACTION');
  });

  it('external_outcome 卻沒給可控行動 → 型別上就不成立', () => {
    const { result } = roundTrip(CASE_9_INPUT, {
      ...CASE_9_MODEL,
      controllableActions: null,
    });
    expect(result.status).toBe('unavailable');
  });
});

// ---------------------------------------------------------------------------
// Case 10 — 心理推測
// ---------------------------------------------------------------------------

describe('Case 10｜不准心理推測', () => {
  it('計畫摘要裡出現「失去動機」就整份不放行', () => {
    const { result } = roundTrip(CASE_9_INPUT, {
      ...CASE_9_MODEL,
      actionPlanSummary: '你最近好像失去動機了，先把練習排回來。',
    });
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.rejections).toContain('MENTAL_STATE_DIAGNOSIS');
  });

  it('階段的完成條件不可以是「更有自信」', () => {
    const { result } = roundTrip(input({ childOriginalGoal: '我想學會騎腳踏車' }), {
      status: 'ready',
      desiredOutcome: '學會騎腳踏車',
      goalControlType: 'directly_actionable',
      progressionKind: 'staged',
      actionPlanSummary: '先從滑行開始，能穩住之後再練踩踏。',
      currentFocus: '先練滑行',
      nextAction: { text: '先在草地上滑行 10 分鐘', source: 'ai_suggested' },
      reviewPoint: null,
      planningContribution: 'filled_missing_details',
      suggestedCadence: null,
      sessionSize: null,
      trialPeriod: null,
      phases: [
        { title: '能自己滑行', observableDoneWhen: '騎車時更有自信' },
        { title: '能自己踩踏', observableDoneWhen: '能不扶著騎完 10 公尺' },
      ],
      targetValue: null,
      targetUnit: null,
      currentValue: null,
      controllableActions: null,
    });

    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.rejections).toContain('PHASE_NOT_OBSERVABLE');
  });

  it('連澄清問題都不可以夾帶心理推測', () => {
    const result = validateChildGoalPlanningResult(
      {
        status: 'needs_clarification',
        schemaVersion: 1,
        knownGoal: '我想變厲害',
        question: { kind: 'goal_focus', text: '你好像有點沒興趣了，還想做嗎？' },
        model: MODEL,
      },
      CASE_2_INPUT as AppInput,
    );
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.rejections).toContain('MENTAL_STATE_DIAGNOSIS');
  });
});

// ---------------------------------------------------------------------------
// Case 11 — 目標清楚，但還不知道怎麼安排
// ---------------------------------------------------------------------------

const CASE_11_INPUT = input({
  childOriginalGoal: '我想兩週讀完這本書，但不知道怎麼安排',
  planningSupportPreference: 'give_me_options',
});

describe('Case 11｜目標清楚、還沒決定怎麼做', () => {
  const { result } = roundTrip(CASE_11_INPUT, {
    status: 'needs_choice',
    question: '你想先用哪一種方式開始？',
    options: ['每天睡前讀 15 分鐘', '週末一次讀完一章', '每天上學前讀 10 分鐘'],
  });

  it('是 needs_choice，不是 clarification —— 他知道自己要幹嘛', () => {
    expect(result.status).toBe('needs_choice');
  });

  it('給的是 2-3 個平等的選項，不是一個 AI 決定好的 schedule', () => {
    if (result.status !== 'needs_choice') throw new Error('expected needs_choice');
    expect(result.options).toHaveLength(3);
    expect(result.options.map((option) => option.id)).toEqual([
      'option-1',
      'option-2',
      'option-3',
    ]);
  });

  it('孩子一定可以說「我自己想」', () => {
    if (result.status !== 'needs_choice') throw new Error('expected needs_choice');
    expect(result.allowCustomAnswer).toBe(true);
  });

  it('目標沒有被改寫', () => {
    if (result.status !== 'needs_choice') throw new Error('expected needs_choice');
    expect(result.knownGoal).toBe('我想兩週讀完這本書，但不知道怎麼安排');
  });

  it('孩子挑了之後，下一輪的計畫記成 child_chose_option', () => {
    // P1-A2：挑走的選項進 responses，**不**寫回 childApproach。
    // 寫回去的話，一句 AI 寫的話會在資料裡變成孩子講的話。
    const chosen = input({
      childOriginalGoal: '我想兩週讀完這本書，但不知道怎麼安排',
      cadence: { mode: 'weekly_frequency', weeklyFrequency: 7 },
      preferredTime: '睡前',
      responses: [
        { type: 'choice_selection', optionId: 'option-1', optionText: '每天睡前讀 15 分鐘' },
      ],
    });

    const { result: after } = roundTrip(chosen, {
      ...CASE_1_MODEL,
      desiredOutcome: '兩週讀完這本書',
      // 模型這一輪忘了標也沒關係 —— 挑沒挑過由對話紀錄決定。
      planningContribution: 'organized_child_plan',
      nextAction: { text: '今晚睡前先讀 15 分鐘', source: 'child_stated' },
    });

    expect(after.status).toBe('ready');
    if (after.status !== 'ready') return;
    expect(after.plan.planningContribution).toBe('child_chose_option');
    // 選項的文字是 AI 寫的，決定是孩子做的 —— 兩件事分開留在資料裡。
    expect(after.plan.provenance.childStatedApproach).toBeNull();
    expect(after.plan.provenance.childChosenOption).toEqual({
      id: 'option-1',
      text: '每天睡前讀 15 分鐘',
    });
    // 而且它是 child-owned，不是 AI 自己挑的。
    expect(after.plan.provenance.fields.approach).toBe('derived_from_child');
  });

  it('孩子說「我自己想」並自己輸入 → 是他的原話，不是選項', () => {
    const own = input({
      childOriginalGoal: '我想兩週讀完這本書，但不知道怎麼安排',
      cadence: { mode: 'weekly_frequency', weeklyFrequency: 7 },
      preferredTime: '睡前',
      responses: [{ type: 'custom_choice', answer: '我想每天早上起床先讀一章' }],
    });

    const { result: after } = roundTrip(own, {
      ...CASE_1_MODEL,
      desiredOutcome: '兩週讀完這本書',
      nextAction: { text: '明天早上起床先讀一章', source: 'child_stated' },
    });

    expect(after.status).toBe('ready');
    if (after.status !== 'ready') return;
    // 他自己打的字 → child_stated，而且沒有任何「他挑了選項」的紀錄。
    expect(after.plan.provenance.childStatedApproach).toBe('我想每天早上起床先讀一章');
    expect(after.plan.provenance.childChosenOption).toBeNull();
    expect(after.plan.provenance.fields.approach).toBe('child_stated');
    expect(after.plan.planningContribution).not.toBe('child_chose_option');
  });

  it('孩子的原話不會被對話中的回答蓋掉', () => {
    const answered = input({
      childOriginalGoal: '我想變厲害',
      cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
      responses: [
        {
          type: 'clarification_answer',
          questionKind: 'goal_focus',
          question: '你最想在哪一件事情上變厲害？',
          answer: '我想把英文口說變好',
        },
        { type: 'custom_choice', answer: '每天跟媽媽練五句英文' },
      ],
    });

    const { result: after } = roundTrip(answered, {
      ...CASE_1_MODEL,
      desiredOutcome: '英文口說變好',
      nextAction: { text: '今天先跟媽媽練五句', source: 'child_stated' },
    });

    expect(after.status).toBe('ready');
    if (after.status !== 'ready') return;
    // 他最早說的那句話一個字都沒有變 —— 這是整份契約最不能弄丟的東西。
    expect(after.plan.provenance.childOriginalGoal).toBe('我想變厲害');
  });

  it('沒有人挑過選項卻自稱 child_chose_option → 降級，不照抄', () => {
    const { response } = roundTrip(CASE_9_INPUT, {
      ...CASE_9_MODEL,
      planningContribution: 'child_chose_option',
    });
    if (response.status !== 'ready') throw new Error('expected ready');
    expect(response.plan.planningContribution).toBe('filled_missing_details');
  });
});

// ---------------------------------------------------------------------------
// Case 12 — 領域專業的邊界
// ---------------------------------------------------------------------------

const CASE_12_INPUT = input({
  childOriginalGoal: '我想彈完這首曲子',
  childApproach: '老師叫我先練右手旋律，再練左手',
  cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
});

const CASE_12_MODEL = {
  status: 'ready',
  desiredOutcome: '彈完這首曲子',
  goalControlType: 'directly_actionable',
  progressionKind: 'staged',
  actionPlanSummary: '照老師說的順序：先右手旋律，再左手，最後合起來。',
  currentFocus: '先練右手旋律',
  nextAction: { text: '今天先練右手旋律 10 分鐘', source: 'child_stated' },
  reviewPoint: { type: 'after_phase', phaseIndex: 1 },
  planningContribution: 'organized_child_plan',
  suggestedCadence: null,
  sessionSize: null,
  trialPeriod: null,
  phases: [
    { title: '右手旋律', observableDoneWhen: '能不看譜彈完右手' },
    { title: '左手伴奏', observableDoneWhen: '能不看譜彈完左手' },
  ],
  targetValue: null,
  targetUnit: null,
  currentValue: null,
  controllableActions: null,
};

describe('Case 12｜孩子已經有老師教的方法', () => {
  it('整理老師的順序 → 通過，而且階段記成從孩子的話推出來的', () => {
    const { result } = roundTrip(CASE_12_INPUT, CASE_12_MODEL);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready' || result.plan.progressionKind !== 'staged') return;
    expect(result.plan.provenance.fields.phases).toBe('derived_from_child');
    expect(result.plan.provenance.childStatedApproach).toBe('老師叫我先練右手旋律，再練左手');
    expect(result.plan.phases[0].title).toBe('右手旋律');
  });

  it('AI 另造一套自己的鋼琴學習順序 → 不放行', () => {
    // 覆寫在資料上唯一的形狀：下一步變成 AI 想的。
    const { result } = roundTrip(CASE_12_INPUT, {
      ...CASE_12_MODEL,
      currentFocus: '先練音階',
      nextAction: { text: '今天先練 C 大調音階', source: 'ai_suggested' },
      phases: [
        { title: '基礎音階', observableDoneWhen: '能彈完 C 大調音階' },
        { title: '和弦轉換', observableDoneWhen: '能連續轉三個和弦' },
      ],
    });
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.rejections).toContain('CHILD_INPUT_OVERWRITTEN');
  });

  it('把模型的一般知識講成領域權威 → 不放行', () => {
    const { result } = roundTrip(CASE_12_INPUT, {
      ...CASE_12_MODEL,
      actionPlanSummary: '這是最有效的鋼琴練習順序，研究顯示先分手練最好。',
    });
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.rejections).toContain('DOMAIN_AUTHORITY_CLAIM');
  });

  it('prompt 明講它不是教練，phases 只是暫定路線', () => {
    const prompt = buildChildGoalPlanningPrompt(CASE_12_INPUT);
    expect(prompt).toContain('你是規劃夥伴，不是教練或老師');
    expect(prompt).toContain('暫定路線');
    expect(prompt).toContain('那一套優先');
  });
});

// ---------------------------------------------------------------------------
// 不可以偷偷補決定
// ---------------------------------------------------------------------------

describe('孩子沒說的事，AI 不可以自己決定', () => {
  it('沒說時段就一定是 undecided', () => {
    const { result } = roundTrip(CASE_9_INPUT, CASE_9_MODEL);
    if (result.status !== 'ready') throw new Error('expected ready');
    expect(result.plan.provenance.fields.preferredTime).toBe('undecided');
  });

  it('計畫裡冒出「晚上 8:00」就整份不放行', () => {
    const { result } = roundTrip(CASE_9_INPUT, {
      ...CASE_9_MODEL,
      actionPlanSummary: '每天晚上 8:00 練習 20 分鐘。',
    });
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.rejections).toContain('UNDECIDED_DETAIL_INVENTED');
  });

  it('「每天晚上八點」這種寫法也擋得下來', () => {
    const { result } = roundTrip(CASE_9_INPUT, {
      ...CASE_9_MODEL,
      currentFocus: '每天晚上八點練習',
    });
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.rejections).toContain('UNDECIDED_DETAIL_INVENTED');
  });

  it('孩子沒選節奏時，AI 的建議不會被掛到孩子頭上', () => {
    const { result } = roundTrip(CASE_9_INPUT, CASE_9_MODEL);
    if (result.status !== 'ready' || result.plan.progressionKind !== 'rhythm') {
      throw new Error('expected rhythm');
    }
    expect(result.plan.provenance.fields.cadence).toBe('ai_suggested');
  });
});

// ---------------------------------------------------------------------------
// 壞掉的輸出
// ---------------------------------------------------------------------------

describe('看不懂的輸出就是沒有計畫', () => {
  it.each([
    ['不是物件', 'nope'],
    ['沒有 status', { desiredOutcome: 'x' }],
    ['認不得的 progressionKind', { ...CASE_1_MODEL, progressionKind: 'outcome_to_action' }],
    ['認不得的 goalControlType', { ...CASE_1_MODEL, goalControlType: 'maybe' }],
    ['認不得的 clarification kind', {
      status: 'needs_clarification',
      question: { kind: 'why_not', text: '為什麼？' },
    }],
    ['只有一個選項', {
      status: 'needs_choice',
      question: '你想先用哪一種方式開始？',
      options: ['每天睡前讀 15 分鐘'],
    }],
    ['太長的下一步', {
      ...CASE_1_MODEL,
      nextAction: { text: '一'.repeat(41), source: 'child_stated' },
    }],
    ['壞掉的階段', {
      ...CASE_1_MODEL,
      progressionKind: 'staged',
      phases: [{ title: '只有一個階段', observableDoneWhen: '做完' }],
    }],
    ['accumulation 缺目標', {
      ...CASE_1_MODEL,
      progressionKind: 'accumulation',
      targetValue: null,
      targetUnit: null,
    }],
  ])('%s → unavailable', (_label, modelOutput) => {
    const { result } = roundTrip(CASE_1_INPUT, modelOutput);
    expect(result.status).toBe('unavailable');
  });

  it('outcome_to_action 已經不是合法的 progression', () => {
    // 舊契約的形狀送進來要整筆退掉，不是「認得但忽略」。
    expect(
      normalizeChildGoalPlanning({ ...CASE_1_MODEL, progressionKind: 'outcome_to_action' }),
    ).toBeNull();
  });

  it('input 本身不可用時，連模型都不會被呼叫', () => {
    expect(childGoalPlanningInputIsUsable(input({ childOriginalGoal: '   ' }))).toBe(false);
    expect(childGoalPlanningInputIsUsable(input({ ageGroup: '13-15' as never }))).toBe(false);
    expect(childGoalPlanningInputIsUsable(input({ schemaVersion: 2 as never }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// prompt 真的把孩子講過的東西送進去
// ---------------------------------------------------------------------------

describe('prompt 說得出孩子已經想到多少', () => {
  it('孩子的方法與節奏都寫進 prompt，而且明講不要改掉', () => {
    const prompt = buildChildGoalPlanningPrompt(CASE_4_INPUT);
    expect(prompt).toContain('我想每天放學投 20 球');
    expect(prompt).toContain('不要換成另一套');
    expect(prompt).toContain('不要改掉它');
  });

  it('沒有方法時，prompt 不會假裝孩子講過，而且說得出可以給選項', () => {
    const prompt = buildChildGoalPlanningPrompt(CASE_2_INPUT);
    expect(prompt).toContain('孩子沒有說他打算怎麼做');
    expect(prompt).toContain('needs_choice');
  });

  it('prompt 分得清楚兩個維度', () => {
    const prompt = buildChildGoalPlanningPrompt(CASE_3_INPUT);
    expect(prompt).toContain('goalControlType 與 progressionKind 是**兩個不同的問題**');
    expect(prompt).toContain('progressionKind 是 rhythm');
  });

  it('輸出 schema 裡沒有任何幣值欄位 —— 這條鏈不碰幣', () => {
    const prompt = buildChildGoalPlanningPrompt(CASE_1_INPUT);
    // 唯一提到幣的地方是那句禁令本身。
    expect(prompt).toContain('不要提到任何幣值');
    for (const forbidden of ['"coins"', '"aiSuggestedCoinAmount"', '"sessionCoinReference"']) {
      expect({ forbidden, present: prompt.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });
});
