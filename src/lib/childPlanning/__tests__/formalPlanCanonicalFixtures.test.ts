// P1-A3 §22 / §19 / §23 — canonical fixtures 與兩條回歸線
//
// ─────────────────────────────────────────────────────────────────────────────
// 這一組回答的是「這四種目標在 A3 之後長什麼樣」。
//
// 它守的重點不是「欄位有沒有填」，而是**三種 progression 不會被壓平成同一種**：
//
//   rhythm        兩週讀書、平日睡前 15 分鐘
//   staged        做一本漫畫 —— 階段必須完整留著，不可以塞進 weekly_rhythm
//   accumulation  暑假讀 5 本書 —— 是 5 / 本書，不是五個 milestone
//   external      國文考 100 分 —— 成果留在 desiredOutcome，
//                 下一步必須是孩子控制得了的行動
//
// ⚠️ progression → progress_model 的**實際對應在 RPC 裡**（SQL）。
//    在 TS 這邊再寫一份對照表，是這一包最容易產生分岔的地方 ——
//    兩份規則遲早會有一份忘了改，而那一份會是比較寬鬆的那個。
//    所以這裡釘的是**輸入端的結構事實**：那些事實成立，SQL 的分支才走得對。
//    真正的落地由 20260825 的 migration 測試 ＋ staging acceptance 驗。
// ─────────────────────────────────────────────────────────────────────────────

import { validateNextStep } from '../../childProposal/planDraft/canonicalPlanFields';
import { validateChildGoalPlanningResult } from '../validateChildGoalPlanningResult';
import {
  CHILD_GOAL_PLANNING_SCHEMA_VERSION,
  type ChildGoalPlan,
  type ChildGoalPlanningInput,
  type ChildPlanProvenance,
} from '../types';

function input(
  goal: string,
  approach: string | null = null,
  cadence: ChildGoalPlanningInput['cadence'] = null,
): ChildGoalPlanningInput {
  return {
    schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
    ageGroup: '6-9',
    childOriginalGoal: goal,
    childOriginalMotivation: null,
    childApproach: approach,
    cadence,
    preferredTime: null,
    planningSupportPreference: null,
    responses: [],
  };
}

function provenance(
  goal: string,
  approach: string | null,
  fields: Partial<ChildPlanProvenance['fields']> = {},
): ChildPlanProvenance {
  return {
    childOriginalGoal: goal,
    childStatedApproach: approach,
    childChosenOption: null,
    fields: {
      approach: approach === null ? 'undecided' : 'child_stated',
      cadence: 'undecided',
      sessionSize: 'undecided',
      preferredTime: 'undecided',
      nextAction: 'derived_from_child',
      reviewPoint: 'undecided',
      phases: 'undecided',
      target: 'undecided',
      controllableActions: 'undecided',
      ...fields,
    },
  };
}

/** 這一份計畫真的是一份合法、可以被孩子確認的計畫嗎。 */
function assertConfirmable(plan: ChildGoalPlan, source: ChildGoalPlanningInput) {
  const validated = validateChildGoalPlanningResult(
    { status: 'ready', schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION, plan },
    source,
  );
  // ready 才進得了 session 的 ready 狀態，也才確認得了 —— 這是 A3 的前提。
  expect(validated.status).toBe('ready');
  return validated;
}

// ---------------------------------------------------------------------------

describe('Rhythm — 兩週讀書，平日睡前 15 分鐘', () => {
  const source = input('我想兩週讀完一本書', '每天睡前讀 15 分鐘', {
    mode: 'weekly_frequency',
    weeklyFrequency: 5,
  });
  const plan: ChildGoalPlan = {
    desiredOutcome: '兩週讀完一本書',
    actionPlanSummary: '每天睡前讀 15 分鐘，兩週讀完。',
    currentFocus: '養成睡前讀書的習慣',
    nextAction: { text: '今晚睡前讀 15 分鐘', source: 'child_stated' },
    reviewPoint: { type: 'after_days', days: 7 },
    planningContribution: 'organized_child_plan',
    provenance: provenance('我想兩週讀完一本書', '每天睡前讀 15 分鐘', {
      cadence: 'child_stated',
      sessionSize: 'child_stated',
      nextAction: 'child_stated',
      reviewPoint: 'ai_suggested',
    }),
    model: 'test-model',
    goalControlType: 'directly_actionable',
    progressionKind: 'rhythm',
    cadence: { mode: 'weekly_frequency', weeklyFrequency: 5 },
    sessionSize: { kind: 'minutes', minutes: 15 },
    trialPeriod: { days: 7 },
  };

  it('是一份可以確認的計畫', () => {
    assertConfirmable(plan, source);
  });

  it('帶著 RPC 判定 weekly_rhythm 需要的兩個結構事實', () => {
    // SQL 的條件是 progressionKind='rhythm' ＋ long_term ＋ 有節奏。
    // 前兩個由這裡提供，long_term 來自 enrichment。
    expect(plan.progressionKind).toBe('rhythm');
    expect(plan.progressionKind === 'rhythm' && plan.cadence?.mode).toBe('weekly_frequency');
  });

  it('單次份量是孩子講的，不必由 enrichment 補', () => {
    expect(plan.progressionKind === 'rhythm' && plan.sessionSize).toEqual({
      kind: 'minutes',
      minutes: 15,
    });
    expect(plan.provenance.fields.sessionSize).toBe('child_stated');
  });
});

describe('Staged — 做一本漫畫', () => {
  const source = input('我想做一本漫畫');
  const plan: ChildGoalPlan = {
    desiredOutcome: '做一本漫畫',
    actionPlanSummary: '先想故事，再畫角色，最後畫成頁面。',
    currentFocus: '先把故事想出來',
    nextAction: { text: '寫下三句故事大綱', source: 'ai_suggested' },
    reviewPoint: null,
    planningContribution: 'filled_missing_details',
    provenance: provenance('我想做一本漫畫', null, {
      nextAction: 'ai_suggested',
      phases: 'ai_suggested',
    }),
    model: 'test-model',
    goalControlType: 'directly_actionable',
    progressionKind: 'staged',
    phases: [
      { id: 'story', title: '決定故事', observableDoneWhen: '寫得出三句故事大綱' },
      { id: 'characters', title: '畫角色', observableDoneWhen: '畫出兩個角色的樣子' },
      { id: 'pages', title: '畫頁面', observableDoneWhen: '畫完第一頁' },
    ],
  };

  it('是一份可以確認的計畫', () => {
    assertConfirmable(plan, source);
  });

  it('階段完整，而且型別上沒有 cadence 可以填', () => {
    expect(plan.progressionKind === 'staged' && plan.phases).toHaveLength(3);
    // staged 的計畫在型別上根本沒有 cadence —— 所以 RPC 讀 v_plan -> 'cadence'
    // 一定是 null，也就走不到 weekly_rhythm 那一支。
    expect('cadence' in plan).toBe(false);
    expect('sessionSize' in plan).toBe(false);
  });

  it('每一階段的完成條件都是可觀察的', () => {
    // 「真正理解」「更有自信」不行 —— 那是心理狀態，孩子沒辦法判斷自己到了沒。
    for (const phase of plan.progressionKind === 'staged' ? plan.phases : []) {
      expect(phase.observableDoneWhen.length).toBeGreaterThan(0);
      expect(phase.observableDoneWhen).not.toMatch(/理解|自信|喜歡|有動機/);
    }
  });

  it('沒有任何 milestone payout 的痕跡', () => {
    // staged ≠ per_milestone。這一包完全不建立那個對應。
    const serialized = JSON.stringify(plan);
    for (const forbidden of ['milestone', 'payout', 'coin', 'reward']) {
      expect({ forbidden, present: serialized.toLowerCase().includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });
});

describe('Accumulation — 暑假讀 5 本書', () => {
  const source = input('暑假我想讀 5 本書');
  const plan: ChildGoalPlan = {
    desiredOutcome: '暑假讀 5 本書',
    actionPlanSummary: '一本一本慢慢讀，讀完就記一本。',
    currentFocus: '先讀第一本',
    nextAction: { text: '挑一本想讀的書', source: 'derived_from_child' },
    reviewPoint: null,
    planningContribution: 'organized_child_plan',
    provenance: provenance('暑假我想讀 5 本書', null, { target: 'child_stated' }),
    model: 'test-model',
    goalControlType: 'directly_actionable',
    progressionKind: 'accumulation',
    targetValue: 5,
    targetUnit: '本書',
    currentValue: 0,
  };

  it('是一份可以確認的計畫', () => {
    assertConfirmable(plan, source);
  });

  it('目標量與單位完整保留', () => {
    expect(plan.progressionKind === 'accumulation' && plan.targetValue).toBe(5);
    expect(plan.progressionKind === 'accumulation' && plan.targetUnit).toBe('本書');
  });

  it('不會變成五個 milestone', () => {
    expect('phases' in plan).toBe(false);
    // 「讀 5 本書」拆成五個階段的話，孩子每讀完一本都要面對一個
    // 「階段完成」的儀式，而他其實只是繼續讀下一本。
    expect(plan.provenance.fields.phases).toBe('undecided');
  });

  it('型別上沒有 cadence —— 走不到 weekly_rhythm', () => {
    expect('cadence' in plan).toBe(false);
  });
});

describe('External outcome — 國文考 100 分', () => {
  const source = input('我想國文考 100 分');
  const plan: ChildGoalPlan = {
    desiredOutcome: '國文考 100 分',
    actionPlanSummary: '每週複習三次，把錯的題目再做一次。',
    currentFocus: '把上次錯的題目弄懂',
    nextAction: { text: '把上次錯的題目做一遍', source: 'ai_suggested' },
    reviewPoint: { type: 'after_sessions', sessions: 6 },
    planningContribution: 'filled_missing_details',
    provenance: provenance('我想國文考 100 分', null, {
      nextAction: 'ai_suggested',
      controllableActions: 'ai_suggested',
      // 孩子完全沒表態節奏，這個「每週三次」是模型提的。
      // A3 因此**不會**把它寫進正式的 cadence 欄位 —— 見下面那一則。
      cadence: 'ai_suggested',
      reviewPoint: 'ai_suggested',
    }),
    model: 'test-model',
    goalControlType: 'external_outcome',
    controllableActions: ['每週複習三次', '把錯的題目再做一次'],
    progressionKind: 'rhythm',
    cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
    sessionSize: null,
    trialPeriod: null,
  };

  it('是一份可以確認的計畫', () => {
    assertConfirmable(plan, source);
  });

  it('成果留在 desiredOutcome，不會被換成一個可控行動', () => {
    expect(plan.desiredOutcome).toBe('國文考 100 分');
  });

  it('下一步是可控行動 —— 而且「考 100 分」本身過不了同一個驗證', () => {
    // 這是兩件事的對照：nextAction 通過既有的 validateNextStep，
    // 而孩子的成果本身通不過。所以 next_step 在結構上不可能是那個成果。
    expect(validateNextStep(plan.nextAction.text).ok).toBe(true);
    expect(validateNextStep('國文考 100 分').ok).toBe(false);
    expect(validateNextStep(plan.desiredOutcome).ok).toBe(false);
  });

  it('模型提的節奏是 ai_suggested —— A3 不會把它寫成孩子的約定', () => {
    // §11 的執法點：判準是 provenance，不是「這一欄有沒有值」。
    // 孩子按確認是同意計畫的方向，不是逐欄替每個細節拍板；
    // 直接寫進正式欄位的話，家長會看到一句「孩子想一週三次」，
    // 而他從來沒這樣說過。這一份會落在 requires_parent_decision。
    expect(plan.provenance.fields.cadence).toBe('ai_suggested');
    expect(plan.progressionKind === 'rhythm' && plan.cadence).not.toBeNull();
  });

  it('goalControlType 與 progression 是兩個正交維度', () => {
    // 不可控的成果配上 rhythm 的行動計畫，是合法而且常見的形狀。
    expect(plan.goalControlType).toBe('external_outcome');
    expect(plan.progressionKind).toBe('rhythm');
  });

  it('goalControlType 不參與任何回饋判定', () => {
    // external_outcome → 不發幣、directly_actionable → 發幣，兩種推導都不存在。
    const serialized = JSON.stringify(plan).toLowerCase();
    for (const forbidden of ['eligib', 'coin', 'reward', 'payout']) {
      expect({ forbidden, present: serialized.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });
});

// ---------------------------------------------------------------------------

describe('§19 Direct Confirm 必須刻意保持拒絕', () => {
  const DIRECT_CONFIRM = require('fs')
    .readFileSync(
      require('path').join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'supabase',
        'migrations',
        '20260821000000_canonical_confirmed_reward.sql',
      ),
      'utf8',
    )
    .replace(/\r\n/g, '\n');

  it('confirm_child_proposal_v1 仍然只收 authored_by = ai 的版本', () => {
    // P1 的正式計畫是 authored_by='child'，所以送進去仍然會被
    // PLAN_NOT_CONFIRMABLE 擋 —— **這一輪不修它**。
    //
    // 原因不是功能壞掉，而是我們還沒有正式重新定義 Parent Confirmation
    // 的語意。在那之前放寬它，等於讓家長對著一份沒有設計過的流程按確認。
    const start = DIRECT_CONFIRM.indexOf('FUNCTION public.confirm_child_proposal_v1(');
    expect(start).toBeGreaterThan(-1);
    const confirm = DIRECT_CONFIRM.slice(start, DIRECT_CONFIRM.indexOf('$$;', start));
    expect(confirm).toContain("v_plan.authored_by <> 'ai'");
    expect(confirm).toContain('PLAN_NOT_CONFIRMABLE');
  });
});
