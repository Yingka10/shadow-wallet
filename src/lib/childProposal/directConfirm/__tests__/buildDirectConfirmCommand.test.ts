import type { ChildProposal, ChildProposalPlanVersion, ParentProposalCardData } from '../../types';
import { buildDirectConfirmCommand, isDirectConfirmablePlan } from '../buildDirectConfirmCommand';

const proposal = {
  id: '11111111-1111-4111-8111-111111111111',
  family_id: '22222222-2222-4222-8222-222222222222',
  child_id: '33333333-3333-4333-8333-333333333333',
  status: 'proposed',
  child_original_goal: '我想兩週把這本書讀完',
  child_original_motivation: '因為同學說很好看',
  proposal_source: 'child',
  current_plan_version_id: '44444444-4444-4444-8444-444444444444',
} as ChildProposal;

const plan = {
  id: proposal.current_plan_version_id,
  proposal_id: proposal.id,
  authored_by: 'ai',
  plan_title: '兩週閱讀挑戰',
  plan_summary: '用每週節奏累積閱讀投入',
  purpose_category: 'D',
  completion_description: '完成一次約定的閱讀時段',
  progress_model: 'weekly_rhythm',
  next_step: '拿出一本想讀的書，先閱讀約 15 分鐘',
  cadence_mode: 'weekly_frequency',
  cadence_weekly_frequency: 4,
  cadence_days: null,
  preferred_time: 'after_dinner',
  preferred_time_custom: null,
  estimated_minutes: 15,
  duration_type: 'long_term',
  duration_days: 14,
  reward_policy: 'coin_eligible',
  reward_eligibility: 'allowed',
  reward_policy_version: 'coin-policy-1.0.0',
  task_policy_version: 'task-taxonomy-2026-07',
  ai_suggested_coin_amount: 10,
  ai_snapshot: { source: 'test' },
  ai_model: 'test-model',
  ai_request_id: 'request-1',
} as ChildProposalPlanVersion;

function card(overrides: Partial<ChildProposalPlanVersion> = {}): ParentProposalCardData {
  return { proposal, currentPlanVersion: { ...plan, ...overrides } };
}

describe('buildDirectConfirmCommand', () => {
  it('只送 proposal/version 與現行政策確認過的 reward decision', () => {
    const result = buildDirectConfirmCommand(card(), '6-9');

    expect(result).toEqual({
      ok: true,
      command: expect.objectContaining({
        schemaVersion: 1,
        proposalId: proposal.id,
        expectedPlanVersionId: plan.id,
        rewardDecision: expect.objectContaining({
          rewardPolicy: 'coin_eligible',
          eligibility: 'allowed',
          rewardPolicyVersion: 'coin-policy-1.0.0',
          coin: expect.objectContaining({ suggestedAmount: 10, finalAmount: 10 }),
        }),
      }),
    });
    expect(JSON.stringify(result)).not.toContain('aiSnapshot');
    expect(JSON.stringify(result)).not.toContain('childOriginalGoal');
  });

  it('政策已改或 AI 顯示的建議不等於現行 canonical 建議時不偷偷換金額', () => {
    expect(buildDirectConfirmCommand(card({ ai_suggested_coin_amount: 9 }), '6-9'))
      .toMatchObject({ ok: false, code: 'POLICY_CHANGED' });
    expect(buildDirectConfirmCommand(card({ reward_policy_version: 'old-policy' }), '6-9'))
      .toMatchObject({ ok: false, code: 'POLICY_CHANGED' });
  });

  it('B 類不能因孩子希望或 AI 欄位而變成 coin task', () => {
    expect(buildDirectConfirmCommand(card({ purpose_category: 'B' }), '6-9'))
      .toMatchObject({ ok: false, code: 'POLICY_CHANGED' });
  });

  it('只有 exact current、AI-authored、完整 structured plan 可以 direct confirm', () => {
    expect(isDirectConfirmablePlan(card())).toBe(true);
    expect(isDirectConfirmablePlan(card({ authored_by: 'parent' }))).toBe(false);
    expect(isDirectConfirmablePlan(card({ completion_description: null }))).toBe(false);
    expect(isDirectConfirmablePlan(card({ cadence_weekly_frequency: null }))).toBe(false);
    expect(isDirectConfirmablePlan({ ...card(), currentPlanVersion: null })).toBe(false);
  });

  it('weekly_frequency 保持彈性週節奏，不能夾帶 fixed weekdays', () => {
    expect(isDirectConfirmablePlan(card({ cadence_days: [1, 3, 5] }))).toBe(false);
  });

  it('P0-3 合法的 one-time plan 不需要虛構 duration days', () => {
    expect(isDirectConfirmablePlan(card({
      duration_type: 'one_time',
      duration_days: null,
      cadence_mode: 'one_time',
      cadence_weekly_frequency: null,
      cadence_days: null,
      progress_model: null,
    }))).toBe(true);
  });
});
