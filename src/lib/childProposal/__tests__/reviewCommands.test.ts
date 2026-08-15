import type {
  ChildProposal,
  ChildProposalPlanVersion,
  ChildProposalReviewData,
  ParentProposalCardData,
  ParentProposalMaterialEdits,
} from '../types';
import {
  buildAcceptReviewCommand,
  buildCloseUnsuitableCommand,
  buildRequestChangesCommand,
  buildRevisionCommand,
} from '../reviewCommands';

const proposal = {
  id: '11111111-1111-4111-8111-111111111111',
  family_id: '22222222-2222-4222-8222-222222222222',
  child_id: '33333333-3333-4333-8333-333333333333',
  status: 'proposed',
  child_original_goal: '我想兩週把這本書讀完',
  proposal_source: 'child',
  current_plan_version_id: '55555555-5555-4555-8555-555555555555',
  task_id: null,
} as ChildProposal;

const aiPlan = {
  id: '44444444-4444-4444-8444-444444444444',
  proposal_id: proposal.id,
  authored_by: 'ai',
  plan_title: '兩週閱讀挑戰',
  purpose_category: 'D',
  completion_description: '完成一次 15 分鐘閱讀',
  progress_model: 'weekly_rhythm',
  next_step: '拿出書讀 15 分鐘',
  cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 4, cadence_days: null,
  preferred_time: 'after_dinner', preferred_time_custom: null, estimated_minutes: 15,
  duration_type: 'long_term', duration_days: 14,
  reward_policy: 'coin_eligible', reward_eligibility: 'allowed',
  reward_policy_version: 'coin-policy-1.0.0', task_policy_version: 'task-taxonomy-2026-07',
  ai_suggested_coin_amount: 10,
} as ChildProposalPlanVersion;

const parentPlan = {
  ...aiPlan,
  id: proposal.current_plan_version_id!,
  authored_by: 'parent',
  adopted_from_plan_version_id: aiPlan.id,
  cadence_weekly_frequency: 3,
  requires_child_review: true,
  parent_confirmed_at: '2026-08-11T01:00:00Z',
  effective_at: null,
  child_accepted_at: null,
} as ChildProposalPlanVersion;

const edits: ParentProposalMaterialEdits = {
  cadenceMode: 'weekly_frequency',
  cadenceWeeklyFrequency: 3,
  cadenceDays: null,
  preferredTime: 'after_dinner',
  preferredTimeCustom: null,
  completionDescription: '完成一次 15 分鐘閱讀',
};

describe('review command builders', () => {
  it('revision command 只包含 editable material fields', () => {
    const card: ParentProposalCardData = {
      proposal: { ...proposal, status: 'proposed', current_plan_version_id: aiPlan.id },
      currentPlanVersion: aiPlan,
    };
    expect(buildRevisionCommand(card, edits)).toEqual({
      ok: true,
      command: {
        schemaVersion: 1,
        proposalId: proposal.id,
        expectedPlanVersionId: aiPlan.id,
        materialEdits: edits,
      },
    });
    expect(JSON.stringify(buildRevisionCommand(card, edits))).not.toContain('durationDays');
    expect(JSON.stringify(buildRevisionCommand(card, edits))).not.toContain('rewardPolicy');
  });

  it('缺少 exact current plan 時不建立 revision command', () => {
    expect(buildRevisionCommand({ proposal, currentPlanVersion: null }, edits))
      .toMatchObject({ ok: false, code: 'PLAN_NOT_CONFIRMABLE' });
  });

  // ── P1-FINAL ────────────────────────────────────────────────────────────
  //
  // 協商第二輪的 current 是家長自己的共同條件草案 —— 它也是
  // authored_by='parent'、也 requires_child_review，上面那幾關都擋不住。
  // 走過去的話：未決條件被清空、policy evidence 掉了、孩子自己寫的完成
  // 標準被改掉，而那份協商從此走不到 active。

  it('家長的共同條件草案不走 P0 的 material edit', () => {
    const draft = {
      ...parentPlan,
      // A4B1 一律不寫 parent_confirmed_at —— 那一步沒有任何東西被確認。
      parent_confirmed_at: null,
      source_planning_session_id: null,
      requires_parent_decision: ['reward'],
    } as ChildProposalPlanVersion;

    expect(buildRevisionCommand({
      proposal: { ...proposal, current_plan_version_id: draft.id },
      currentPlanVersion: draft,
    }, edits)).toMatchObject({
      ok: false,
      code: 'POLICY_REJECTED',
      reason: 'CHILD_PLAN_FIELD_NOT_EDITABLE',
    });
  });

  it('P0 的家長調整版仍然可以再調整 —— 那條路一個字都沒變', () => {
    expect(buildRevisionCommand({
      proposal: { ...proposal, current_plan_version_id: parentPlan.id },
      currentPlanVersion: parentPlan,
    }, edits)).toMatchObject({ ok: true });
  });

  it('accept 使用 current parent plan 產生 fresh canonical reward decision', () => {
    const review: ChildProposalReviewData = {
      proposal: { ...proposal, status: 'needs_child_review' },
      currentPlanVersion: parentPlan,
      sourcePlanVersion: aiPlan,
    };
    expect(buildAcceptReviewCommand(review, '6-9')).toEqual({
      ok: true,
      command: expect.objectContaining({
        schemaVersion: 1,
        proposalId: proposal.id,
        expectedPlanVersionId: parentPlan.id,
        rewardDecision: expect.objectContaining({
          rewardPolicy: 'coin_eligible',
          rewardPolicyVersion: 'coin-policy-1.0.0',
          coin: expect.objectContaining({ suggestedAmount: 10, finalAmount: 10 }),
        }),
      }),
    });
  });

  it('parent review version 若不完整或 policy drift 回 typed failure', () => {
    const review = (override: Partial<ChildProposalPlanVersion>): ChildProposalReviewData => ({
      proposal: { ...proposal, status: 'needs_child_review' },
      currentPlanVersion: { ...parentPlan, ...override },
      sourcePlanVersion: aiPlan,
    });
    expect(buildAcceptReviewCommand(review({ completion_description: null }), '6-9'))
      .toMatchObject({ ok: false, code: 'PLAN_NOT_CONFIRMABLE' });
    expect(buildAcceptReviewCommand(review({ ai_suggested_coin_amount: 9 }), '6-9'))
      .toMatchObject({ ok: false, code: 'POLICY_CHANGED' });
  });

  it('request changes 保留 expected current parent version', () => {
    const review: ChildProposalReviewData = {
      proposal: { ...proposal, status: 'needs_child_review' },
      currentPlanVersion: parentPlan,
      sourcePlanVersion: aiPlan,
    };
    expect(buildRequestChangesCommand(review, '想換一天試試看')).toEqual({
      schemaVersion: 1,
      proposalId: proposal.id,
      expectedPlanVersionId: parentPlan.id,
      reason: '想換一天試試看',
    });
  });

  it('close 永遠明確帶 nullable expected version，不把 undefined 當無 guard', () => {
    expect(buildCloseUnsuitableCommand({
      proposal: { ...proposal, current_plan_version_id: null },
      currentPlanVersion: null,
    }, ' 最近比較忙 ')).toEqual({
      schemaVersion: 1,
      proposalId: proposal.id,
      expectedPlanVersionId: null,
      reason: '最近比較忙',
    });
  });
});
