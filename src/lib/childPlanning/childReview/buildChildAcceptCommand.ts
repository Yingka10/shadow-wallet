// GrowBook — 孩子回覆的命令組裝（P1-A4B2 §14 / §17 / §24）
//
// ─────────────────────────────────────────────────────────────────────────
// ⚠️ 這裡**沒有第二套 coin/reward evaluator**。走的是既有的
//    planEvaluationCommand → evaluateTaskReward，與家長那兩條線同一條
//    計算鏈；差別只在拿結果去跟什麼比對。
//
// ⚠️ 政策重算是必要的，即使 A4B1 幾天前才算過。孩子可能隔了一週才打開
//    App —— 那期間政策可能已經換版。對不上就回 POLICY_CHANGED，
//    **不是**把家長那一版上的證據改掉：孩子按下「可以」的那一刻偷偷
//    換一個金額，是這條路徑上最不該發生的事。
// ─────────────────────────────────────────────────────────────────────────

import { evaluateTaskReward } from '../../../screens/parent/tablet/taskDrawer/taskReward';
import { TASK_POLICY_VERSION } from '../../../screens/parent/tablet/taskDrawer/taskCatalog';
import { planEvaluationCommand } from '../../childProposal/directConfirm';
import type {
  ChildProposalFailure,
  ChildProposalPlanVersion,
  ChildProposalReviewData,
} from '../../childProposal/types';
import { childPlanningReviewability } from './isChildPlanningReview';
import { CHILD_REVIEW_REASON_MAX } from './types';
import type {
  AcceptChildPlanningTermsCommand,
  RequestChildPlanningTermChangesCommand,
} from './types';

export type BuildChildAcceptCommandResult =
  | { ok: true; command: AcceptChildPlanningTermsCommand; activates: boolean }
  | ChildProposalFailure;

export type BuildChildRequestChangesResult =
  | { ok: true; command: RequestChildPlanningTermChangesCommand }
  | ChildProposalFailure;

const BLOCK_MESSAGE = {
  not_child_planning_review: '這份安排不是從你自己的計畫來的。',
  not_in_review: '安排剛剛更新了，重新看看就好。',
  already_has_task: '這件事已經開始了。',
  system_enrichment_required: 'GrowBook 還在整理這件事，等一下再看看。',
} as const;

function policyChanged(message: string): ChildProposalFailure {
  return { ok: false, code: 'POLICY_CHANGED', reason: 'POLICY_CHANGED', message };
}

/**
 * 現在這一刻的政策判定，並與這一版上的 canonical policy evidence 對帳。
 *
 * ⚠️ **不讀 ai_snapshot**（P1-A4A.1）。錨點是 policy_session_coin_reference
 *    與 policy_payout_type —— 那兩欄是 append-only 的，所以「用現在的規則
 *    再算一次跟當時的證據比對」才有意義。
 */
export function buildChildAcceptRewardDecision(
  review: ChildProposalReviewData,
  childAgeGroup: string,
): { ok: true; rewardDecision: unknown } | ChildProposalFailure {
  const plan = review.currentPlanVersion;
  const decision = evaluateTaskReward({
    command: planEvaluationCommand({
      proposal: review.proposal,
      currentPlanVersion: plan,
    }),
    childAgeGroup,
  });

  if (decision.eligibility !== 'allowed') return policyChanged(decision.explanation);
  if (plan.task_policy_version !== TASK_POLICY_VERSION) {
    return policyChanged('任務規則更新了，請重新整理後再看一次。');
  }
  if (plan.reward_policy !== decision.rewardPolicy
    || plan.reward_policy_version !== decision.rewardPolicyVersion) {
    return policyChanged('回饋規則更新了，請重新整理後再看一次。');
  }

  const anchor = policyEvidence(plan);
  if (decision.rewardPolicy === 'coin_eligible') {
    if (anchor.payoutType !== 'per_completion') {
      return policyChanged('這份安排的回饋方式還沒有正式的結算規則。');
    }
    if (anchor.coins === null || anchor.coins !== decision.coin.suggestedAmount) {
      return policyChanged('成長幣的算法更新了，請重新整理後再看一次。');
    }
    if (decision.coin.finalAmount !== decision.coin.suggestedAmount) {
      return policyChanged('這一步不能調整成長幣金額。');
    }
  } else if (anchor.coins !== null) {
    return policyChanged('這份不發幣的安排帶有過期的幣值，請重新整理。');
  }

  return { ok: true, rewardDecision: decision };
}

function policyEvidence(
  plan: ChildProposalPlanVersion,
): { coins: number | null; payoutType: string | null } {
  const reference = plan.policy_session_coin_reference;
  return {
    coins: typeof reference === 'number' && Number.isInteger(reference) ? reference : null,
    payoutType: plan.policy_payout_type ?? null,
  };
}

export function buildChildAcceptCommand(
  review: ChildProposalReviewData,
  childAgeGroup: string,
): BuildChildAcceptCommandResult {
  const reviewable = childPlanningReviewability(review);
  if (!reviewable.ok) {
    return {
      ok: false,
      code: reviewable.block === 'system_enrichment_required'
        ? 'POLICY_REJECTED'
        : 'VALIDATION_FAILED',
      reason: reviewable.block === 'system_enrichment_required'
        ? 'SYSTEM_ENRICHMENT_REQUIRED'
        : 'PLAN_NOT_REVIEWABLE',
      message: BLOCK_MESSAGE[reviewable.block],
    };
  }

  const base = {
    schemaVersion: 1 as const,
    proposalId: review.proposal.id,
    expectedPlanVersionId: review.currentPlanVersion.id,
  };

  // 還有事沒說完的那一輪不會建立任務，所以不需要（也不應該）帶幣值判定。
  // 帶了等於在說「這是最後一輪」，而它不是。
  if (!reviewable.activates) {
    return { ok: true, command: base, activates: false };
  }

  const reward = buildChildAcceptRewardDecision(review, childAgeGroup);
  if (reward.ok !== true) return reward;

  return {
    ok: true,
    command: { ...base, rewardDecision: reward.rewardDecision },
    activates: true,
  };
}

export function buildChildRequestChangesCommand(
  review: ChildProposalReviewData,
  reason?: string,
): BuildChildRequestChangesResult {
  const reviewable = childPlanningReviewability(review);
  if (!reviewable.ok) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      reason: 'PLAN_NOT_REVIEWABLE',
      message: BLOCK_MESSAGE[reviewable.block],
    };
  }

  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (trimmed.length > CHILD_REVIEW_REASON_MAX) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      reason: 'REASON_TOO_LONG',
      message: `想說的話請控制在 ${CHILD_REVIEW_REASON_MAX} 字以內。`,
    };
  }

  return {
    ok: true,
    command: {
      schemaVersion: 1,
      proposalId: review.proposal.id,
      expectedPlanVersionId: review.currentPlanVersion.id,
      ...(trimmed.length > 0 ? { reason: trimmed } : null),
    },
  };
}
