// GrowBook — 家長同意命令的組裝與 reward freshness（P1-A4A §10 / §11 / §12）
//
// ─────────────────────────────────────────────────────────────────────────
// 家長可能是幾天後才按下確認。所以即使 A3 的 enrichment 當時算完了，
// 這裡仍然要用**現在的**政策再算一次，再跟計畫上記著的證據比對。
//
// ⚠️ 這裡**沒有第二套 coin/reward evaluator**。它呼叫的是既有的
//    evaluateTaskReward，輸入由既有的 planEvaluationCommand 攤平 ——
//    與 P0 Direct Confirm 完全同一條計算鏈。差別只有一個：
//
//      P0  拿 plan.ai_suggested_coin_amount 當比對錨點
//      P1  拿 A3 enrichment 當時記在 ai_snapshot.policy 裡的
//          sessionCoinReference 當錨點
//
//    理由是 A3 刻意不在 child formal plan 上存幣值（那一步不發幣、
//    也不替家長先決定金額）。但 A3 的 enrichment 走的就是既有的
//    rewardEligibility → coinPolicy 規則鏈，它算出來的 session 價
//    有被記進 snapshot —— 那是一個**伺服器端存著的、規則引擎產生的**
//    數字，正好可以當錨點。沒有它的話，家長端送什麼幣值都沒有東西可比。
// ─────────────────────────────────────────────────────────────────────────

import { evaluateTaskReward } from '../../../screens/parent/tablet/taskDrawer/taskReward';
import { TASK_POLICY_VERSION } from '../../../screens/parent/tablet/taskDrawer/taskCatalog';
import { planEvaluationCommand } from '../../childProposal/directConfirm';
import type {
  ChildProposalFailure,
  ChildProposalPlanVersion,
  ChildProposalRewardDecision,
  ParentProposalCardData,
} from '../../childProposal/types';
import { childPlanConfirmability } from './isChildPlanDirectConfirmable';
import type {
  BuildChildPlanConfirmCommandResult,
  ChildPlanConfirmBlock,
} from './types';

function policyChanged(message: string): ChildProposalFailure {
  return { ok: false, code: 'POLICY_CHANGED', reason: 'POLICY_CHANGED', message };
}

const BLOCK_MESSAGE: Record<ChildPlanConfirmBlock, string> = {
  not_child_planning_plan: '這份提案不是孩子自己規劃的版本。',
  not_current_proposed: '這份計畫已經更新，請重新整理後再確認。',
  shared_decision_required: '還有幾個安排需要一起確認。',
  enrichment_incomplete: 'GrowBook 還在整理這份計畫，請稍後再確認。',
  system_fields_incomplete: 'GrowBook 還在整理這份計畫，請稍後再確認。',
};

/**
 * A3 enrichment 當時算出來的 session 價與結算方式。
 *
 * 讀的是 snapshot 裡的 policy 區塊 —— 那一段是 deterministic 規則引擎的
 * 輸出，不是模型的自由文字。讀不到就當作「沒有可比對的錨點」。
 */
function enrichmentCoinAnchor(
  plan: ChildProposalPlanVersion,
): { coins: number | null; payoutType: string | null } {
  const snapshot = plan.ai_snapshot;
  if (snapshot === null || typeof snapshot !== 'object') return { coins: null, payoutType: null };
  const policy = (snapshot as { policy?: unknown }).policy;
  if (policy === null || typeof policy !== 'object') return { coins: null, payoutType: null };

  const reference = (policy as { sessionCoinReference?: unknown }).sessionCoinReference;
  const payoutType = (policy as { payoutType?: unknown }).payoutType;
  return {
    coins: typeof reference === 'number' && Number.isInteger(reference) ? reference : null,
    payoutType: typeof payoutType === 'string' ? payoutType : null,
  };
}

export type BuildChildPlanRewardDecisionResult =
  | { ok: true; rewardDecision: ChildProposalRewardDecision }
  | ChildProposalFailure;

export function buildChildPlanRewardDecision(
  card: ParentProposalCardData,
  childAgeGroup: string,
): BuildChildPlanRewardDecisionResult {
  const confirmable = childPlanConfirmability(card);
  if (!confirmable.ok) {
    return {
      ok: false,
      code: confirmable.block === 'shared_decision_required'
        ? 'POLICY_REJECTED'
        : 'VALIDATION_FAILED',
      reason: confirmable.block === 'shared_decision_required'
        ? 'SHARED_DECISION_REQUIRED'
        : 'PLAN_NOT_CONFIRMABLE',
      message: BLOCK_MESSAGE[confirmable.block],
    };
  }

  const plan = card.currentPlanVersion as ChildProposalPlanVersion;
  const decision = evaluateTaskReward({
    command: planEvaluationCommand(card),
    childAgeGroup,
  });

  if (decision.eligibility !== 'allowed') return policyChanged(decision.explanation);
  if (plan.task_policy_version !== TASK_POLICY_VERSION) {
    return policyChanged('任務政策已更新，請重新整理後再確認。');
  }
  if (plan.reward_policy !== decision.rewardPolicy
    || plan.reward_policy_version !== decision.rewardPolicyVersion) {
    return policyChanged('回饋政策已更新，請重新整理後再確認。');
  }

  const anchor = enrichmentCoinAnchor(plan);

  if (decision.rewardPolicy === 'coin_eligible') {
    // staged / accumulation 不代表 milestone / final-completion 發放。
    // payoutType 不是 per_completion 時，session 價根本不等於最終金額 ——
    // 拿它去確認會讓家長同意一個沒有結算路徑的數字。
    if (anchor.payoutType !== 'per_completion') {
      return policyChanged('這份計畫的回饋方式還沒有正式的結算規則，先不建立成成長幣任務。');
    }
    if (anchor.coins === null || anchor.coins !== decision.coin.suggestedAmount) {
      return policyChanged('成長幣建議已更新，請重新整理後再確認。');
    }
    // 家長不改金額。這一包家長確認的是「GrowBook 已經算好的合法回饋」，
    // 不是一個可以自由輸入的欄位。
    if (decision.coin.finalAmount !== decision.coin.suggestedAmount) {
      return policyChanged('這一步不能調整成長幣金額。');
    }
  } else if (anchor.coins !== null) {
    return policyChanged('這份不發幣的計畫帶有過期幣值，請重新整理。');
  }

  return { ok: true, rewardDecision: decision };
}

export function buildChildPlanConfirmCommand(
  card: ParentProposalCardData,
  childAgeGroup: string,
): BuildChildPlanConfirmCommandResult {
  const reward = buildChildPlanRewardDecision(card, childAgeGroup);
  if (reward.ok !== true) return reward;

  return {
    ok: true,
    command: {
      schemaVersion: 1,
      proposalId: card.proposal.id,
      expectedPlanVersionId: card.currentPlanVersion!.id,
      rewardDecision: reward.rewardDecision,
    },
  };
}
