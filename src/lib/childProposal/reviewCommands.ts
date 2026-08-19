import { buildProposalRewardDecision } from './directConfirm';
// 直接指到葉子模組，不走 sharedTerms barrel —— 那一支會拉進
// buildChildPlanningTermsCommand → childProposal/directConfirm，繞回這裡。
import { isParentSharedTermDraft } from '../childPlanning/sharedTerms/isChildPlanningNegotiable';
import {
  CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
  type AcceptChildProposalPlanCommand,
  type ChildProposalFailure,
  type ChildProposalReviewData,
  type CloseChildProposalUnsuitableCommand,
  type ParentProposalCardData,
  type ParentProposalMaterialEdits,
  type RequestChildProposalChangesCommand,
  type ReviseChildProposalPlanCommand,
} from './types';

type BuildRevisionCommandResult =
  | { ok: true; command: ReviseChildProposalPlanCommand }
  | ChildProposalFailure;

type BuildAcceptReviewCommandResult =
  | { ok: true; command: AcceptChildProposalPlanCommand }
  | ChildProposalFailure;

function planNotConfirmable(message: string): ChildProposalFailure {
  return {
    ok: false,
    code: 'PLAN_NOT_CONFIRMABLE',
    reason: 'PLAN_NOT_CONFIRMABLE',
    message,
  };
}

function text(value: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildRevisionCommand(
  card: ParentProposalCardData,
  materialEdits: ParentProposalMaterialEdits,
): BuildRevisionCommandResult {
  const plan = card.currentPlanVersion;
  if (!plan
    || card.proposal.status !== 'proposed'
    || card.proposal.current_plan_version_id !== plan.id
    || plan.proposal_id !== card.proposal.id
    || !['ai', 'parent'].includes(plan.authored_by)) {
    return planNotConfirmable('目前沒有可調整的完整計畫，請重新整理後再試。');
  }

  // P1-FINAL：協商到第二輪時，current 是家長自己的共同條件草案 —— 而它
  // 也是 authored_by='parent'，所以上面那一關擋不住。
  //
  // 這一支是 P0 的 material edit：它會照 source 重建一版，而**沒有**帶上
  // requires_parent_decision 與 policy evidence 兩組欄位，還允許改
  // completion_description（那一欄在 P1 是孩子自己寫的）。走過去的結果是
  // 未決條件被靜靜清空、或孩子端 CHILD_PLAN_INTEGRITY_VIOLATION 死路。
  //
  // 想改共同條件請走 propose_child_planning_terms_v1。
  if (isParentSharedTermDraft(plan)) {
    return {
      ok: false,
      code: 'POLICY_REJECTED',
      reason: 'CHILD_PLAN_FIELD_NOT_EDITABLE',
      message: '這份安排要用「一起補幾個安排」提出，不是直接改。',
    };
  }

  return {
    ok: true,
    command: {
      schemaVersion: CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
      proposalId: card.proposal.id,
      expectedPlanVersionId: plan.id,
      materialEdits,
    },
  };
}

function isReviewConfirmable(review: ChildProposalReviewData): boolean {
  const { proposal, currentPlanVersion: plan, sourcePlanVersion: source } = review;
  if (proposal.status !== 'needs_child_review'
    || proposal.current_plan_version_id !== plan.id
    || proposal.id !== plan.proposal_id
    || plan.authored_by !== 'parent'
    || plan.requires_child_review !== true
    || !plan.parent_confirmed_at
    || plan.effective_at !== null
    || plan.child_accepted_at !== null
    || plan.adopted_from_plan_version_id !== source.id
    || source.proposal_id !== proposal.id) return false;
  if (!text(plan.plan_title) || !text(plan.completion_description) || !text(plan.next_step)) {
    return false;
  }
  if (!plan.purpose_category || !plan.duration_type || !plan.reward_policy) return false;
  if (plan.reward_eligibility !== 'allowed'
    || !text(plan.reward_policy_version)
    || !text(plan.task_policy_version)
    || !Number.isInteger(plan.estimated_minutes)
    || (plan.estimated_minutes ?? 0) <= 0) return false;
  if (plan.duration_type === 'long_term'
    && (!Number.isInteger(plan.duration_days) || (plan.duration_days ?? 0) <= 0)) return false;
  if (plan.cadence_mode === 'weekly_frequency') {
    return plan.progress_model === 'weekly_rhythm'
      && Number.isInteger(plan.cadence_weekly_frequency)
      && (plan.cadence_weekly_frequency ?? 0) >= 1
      && (plan.cadence_weekly_frequency ?? 0) <= 7
      && plan.cadence_days === null;
  }
  return plan.cadence_mode === 'fixed_days'
    && plan.cadence_weekly_frequency === null
    && Array.isArray(plan.cadence_days)
    && plan.cadence_days.length > 0;
}

export function buildAcceptReviewCommand(
  review: ChildProposalReviewData,
  childAgeGroup: string,
): BuildAcceptReviewCommandResult {
  if (!isReviewConfirmable(review)) {
    return planNotConfirmable('這份調整目前還不能成立，請重新整理後再試。');
  }

  const reward = buildProposalRewardDecision({
    proposal: review.proposal,
    currentPlanVersion: review.currentPlanVersion,
  }, childAgeGroup);
  if (reward.ok !== true) return reward;

  return {
    ok: true,
    command: {
      schemaVersion: CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
      proposalId: review.proposal.id,
      expectedPlanVersionId: review.currentPlanVersion.id,
      rewardDecision: reward.rewardDecision,
    },
  };
}

export function buildRequestChangesCommand(
  review: ChildProposalReviewData,
  reason?: string,
): RequestChildProposalChangesCommand {
  const normalizedReason = reason?.trim();
  return {
    schemaVersion: CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
    proposalId: review.proposal.id,
    expectedPlanVersionId: review.currentPlanVersion.id,
    ...(normalizedReason ? { reason: normalizedReason } : null),
  };
}

export function buildCloseUnsuitableCommand(
  card: ParentProposalCardData,
  reason: string,
): CloseChildProposalUnsuitableCommand {
  return {
    schemaVersion: CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
    proposalId: card.proposal.id,
    expectedPlanVersionId: card.proposal.current_plan_version_id,
    reason: reason.trim(),
  };
}
