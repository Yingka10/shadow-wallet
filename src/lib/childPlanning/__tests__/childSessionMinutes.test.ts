import { childSessionMinutes } from '../formalPlan/childSessionMinutes';
import type { ChildGoalPlan } from '../types';

function plan(overrides: Partial<ChildGoalPlan> = {}): ChildGoalPlan {
  return {
    desiredOutcome: '把哈利波特看完',
    actionPlanSummary: '一週 3 次，每次 10 分鐘。',
    currentFocus: '先試每次 10 分鐘',
    nextAction: { text: '今天先讀 10 分鐘', source: 'derived_from_child' },
    reviewPoint: { type: 'after_days', days: 7 },
    planningContribution: 'child_chose_option',
    provenance: {
      childOriginalGoal: '我想要把哈利波特看完',
      childStatedApproach: null,
      childChosenOption: { id: 'option-1', text: '每次先讀 10 分鐘' },
      fields: {
        approach: 'derived_from_child', cadence: 'child_stated',
        sessionSize: 'derived_from_child', preferredTime: 'undecided',
        nextAction: 'derived_from_child', reviewPoint: 'derived_from_child',
        phases: 'undecided', target: 'undecided', controllableActions: 'undecided',
      },
    },
    goalDuration: { kind: 'days', days: 30 },
    model: 'gemini-flash-latest',
    goalControlType: 'directly_actionable',
    progressionKind: 'rhythm',
    cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
    sessionSize: { kind: 'minutes', minutes: 10 },
    trialPeriod: { days: 7 },
    ...overrides,
  } as ChildGoalPlan;
}

describe('childSessionMinutes 與 publish RPC 的判準一致', () => {
  it('孩子講過的份量算數', () => {
    expect(childSessionMinutes(plan())).toBe(10);
  });

  it('child_stated 也算數', () => {
    const p = plan();
    p.provenance.fields.sessionSize = 'child_stated';
    expect(childSessionMinutes(p)).toBe(10);
  });

  it('模型自己建議的份量不算 —— 那不是孩子的約定', () => {
    const p = plan();
    p.provenance.fields.sessionSize = 'ai_suggested';
    expect(childSessionMinutes(p)).toBeNull();
  });

  it('undecided 不算', () => {
    const p = plan();
    p.provenance.fields.sessionSize = 'undecided';
    expect(childSessionMinutes(p)).toBeNull();
  });

  it('不是分鐘制的份量不算', () => {
    expect(childSessionMinutes(plan({ sessionSize: null }))).toBeNull();
  });

  it('沒有計畫就是 null，不丟例外', () => {
    expect(childSessionMinutes(null)).toBeNull();
    expect(childSessionMinutes(undefined)).toBeNull();
  });
});
