// GrowBook — 家長共同條件命令的組裝（P1-A4B1 §3 / §12 / §15）
//
// ─────────────────────────────────────────────────────────────────────────
// ⚠️ 這裡**沒有第二套 coin/reward evaluator**。幣值重算走的是既有的
//    planEvaluationCommand → evaluateTaskReward，輸入是「把家長提出的
//    條件套上去之後的計畫」（projectSharedTerms）。
//
// ⚠️ 家長在這一步看不到、也送不出任何金額。他提出的是條件；
//    幣值是規則引擎對那組條件的判定。
// ─────────────────────────────────────────────────────────────────────────

import { evaluateTaskReward } from '../../../screens/parent/tablet/taskDrawer/taskReward';
import { planEvaluationCommand } from '../../childProposal/directConfirm';
import type {
  ChildProposalFailure,
  ChildProposalPlanVersion,
  ParentProposalCardData,
} from '../../childProposal/types';
import { childPlanningNegotiability } from './isChildPlanningNegotiable';
import { pricingRelevantChange, projectCard, projectSharedTerms } from './projectSharedTerms';
import {
  CHILD_PLANNING_PREFERRED_TIMES,
  DURATION_DAYS_RANGE,
  SESSION_MINUTES_RANGE,
} from './types';
import type {
  ChildPlanningRewardEvaluation,
  ChildPlanningSharedTerms,
  ProposeChildPlanningTermsCommand,
} from './types';

export type BuildChildPlanningTermsResult =
  | { ok: true; command: ProposeChildPlanningTermsCommand }
  | ChildProposalFailure;

function invalid(reason: string, message: string): ChildProposalFailure {
  return { ok: false, code: 'VALIDATION_FAILED', reason, message };
}

const BLOCK_MESSAGE = {
  not_child_planning_plan: '這份提案不是孩子自己規劃的計畫。',
  not_current_proposed: '這份計畫已經更新，請重新整理後再試。',
  already_has_task: '這份提案已經有正式任務了。',
  enrichment_required: 'GrowBook 還需要先整理這件事的回饋規則。',
} as const;

function validateTerms(
  source: ChildProposalPlanVersion,
  terms: ChildPlanningSharedTerms,
): ChildProposalFailure | null {
  if (terms.cadenceMode === 'weekly_frequency') {
    const n = terms.cadenceWeeklyFrequency;
    if (!Number.isInteger(n) || (n ?? 0) < 1 || (n ?? 0) > 7 || terms.cadenceDays !== undefined) {
      return invalid('CADENCE_INVALID', '一週幾次請填 1 到 7，而且不用再選星期。');
    }
  } else if (terms.cadenceMode === 'fixed_days') {
    const days = terms.cadenceDays;
    if (!Array.isArray(days) || days.length === 0
      || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
      || terms.cadenceWeeklyFrequency !== undefined) {
      return invalid('CADENCE_INVALID', '請至少選一個星期，而且不用再填次數。');
    }
  } else if (terms.cadenceWeeklyFrequency !== undefined || terms.cadenceDays !== undefined) {
    return invalid('CADENCE_INVALID', '請先選擇要用「一週幾次」還是「固定星期」。');
  }

  if (terms.preferredTime !== undefined) {
    if (!(CHILD_PLANNING_PREFERRED_TIMES as readonly string[]).includes(terms.preferredTime)) {
      return invalid('PREFERRED_TIME_INVALID', '請選擇適合的時段。');
    }
    const custom = terms.preferredTimeCustom;
    if (terms.preferredTime === 'custom'
      ? (typeof custom !== 'string' || custom.trim().length === 0 || custom.length > 60)
      : custom !== undefined) {
      return invalid('PREFERRED_TIME_INVALID', '請填寫時段（60 字以內）。');
    }
  } else if (terms.preferredTimeCustom !== undefined) {
    return invalid('PREFERRED_TIME_INVALID', '請先選擇時段。');
  }

  if (terms.sessionMinutes !== undefined) {
    const m = terms.sessionMinutes;
    if (!Number.isInteger(m) || m < SESSION_MINUTES_RANGE.min || m > SESSION_MINUTES_RANGE.max) {
      return invalid('SESSION_SIZE_INVALID',
        `每次時間請落在 ${SESSION_MINUTES_RANGE.min} 到 ${SESSION_MINUTES_RANGE.max} 分鐘。`);
    }
  }

  if (terms.durationDays !== undefined) {
    const d = terms.durationDays;
    if (!Number.isInteger(d) || d < DURATION_DAYS_RANGE.min || d > DURATION_DAYS_RANGE.max) {
      return invalid('DURATION_INVALID',
        `先試多久請落在 ${DURATION_DAYS_RANGE.min} 到 ${DURATION_DAYS_RANGE.max} 天。`);
    }
    // 家長提出的是 trial window，不是把長期目標改成一次性任務。
    // duration_type 是系統判定，這條路徑上永遠不動它。
    if (source.duration_type !== 'long_term') {
      return invalid('DURATION_NOT_NEGOTIABLE', '這件事的執行期間不是由這裡決定的。');
    }
  }

  return null;
}

/** 這一組條件跟現在的安排一樣嗎。一樣就不該產生新版本（§15）。 */
export function hasMaterialChange(
  source: ChildProposalPlanVersion,
  terms: ChildPlanningSharedTerms,
): boolean {
  const next = projectSharedTerms(source, terms);
  const downgradesReward = terms.rewardChoice === 'no_coin'
    && source.reward_policy === 'coin_eligible';
  return downgradesReward
    || next.cadence_mode !== source.cadence_mode
    || next.cadence_weekly_frequency !== source.cadence_weekly_frequency
    || JSON.stringify(next.cadence_days) !== JSON.stringify(source.cadence_days)
    || next.preferred_time !== source.preferred_time
    || next.preferred_time_custom !== source.preferred_time_custom
    || next.estimated_minutes !== source.estimated_minutes
    || next.duration_days !== source.duration_days;
}

/**
 * 這一組條件下的政策判定。
 *
 * 只有「來源是可發幣的計畫、而且結算語意已知」時才算得出來。算不出來
 * 就回 null —— **不猜一個數字**，reward 會留在未決集合裡由孩子與家長
 * 之後一起看。
 */
export function freshRewardEvaluation(
  card: ParentProposalCardData,
  terms: ChildPlanningSharedTerms,
  childAgeGroup: string,
): ChildPlanningRewardEvaluation | null {
  const source = card.currentPlanVersion;
  if (!source || source.reward_policy !== 'coin_eligible') return null;
  if (terms.rewardChoice === 'no_coin') return null;
  // 來源沒有結算語意時，這一步也產生不出來 —— 參考價要能對應到
  // 「怎麼結算」才有意義。
  if (source.policy_payout_type !== 'per_completion') return null;
  if (!source.task_policy_version) return null;

  const decision = evaluateTaskReward({
    command: planEvaluationCommand(projectCard(card, terms)),
    childAgeGroup,
  });
  if (decision.eligibility !== 'allowed' || decision.rewardPolicy !== 'coin_eligible') return null;
  if (decision.coin === null || !Number.isInteger(decision.coin.suggestedAmount)) return null;
  if (decision.coin.suggestedAmount <= 0) return null;

  return {
    rewardPolicy: 'coin_eligible',
    eligibility: 'allowed',
    rewardPolicyVersion: decision.rewardPolicyVersion,
    taskPolicyVersion: source.task_policy_version,
    sessionCoinReference: decision.coin.suggestedAmount,
    payoutType: 'per_completion',
  };
}

export function buildChildPlanningTermsCommand(
  card: ParentProposalCardData,
  terms: ChildPlanningSharedTerms,
  childAgeGroup: string,
): BuildChildPlanningTermsResult {
  const negotiable = childPlanningNegotiability(card);
  if (!negotiable.ok) {
    return {
      ok: false,
      code: negotiable.block === 'enrichment_required' ? 'POLICY_REJECTED' : 'VALIDATION_FAILED',
      reason: negotiable.block === 'enrichment_required'
        ? 'ENRICHMENT_REQUIRED'
        : 'PLAN_NOT_NEGOTIABLE',
      message: BLOCK_MESSAGE[negotiable.block],
    };
  }

  const source = card.currentPlanVersion as ChildProposalPlanVersion;
  const invalidTerm = validateTerms(source, terms);
  if (invalidTerm) return invalidTerm;

  if (!hasMaterialChange(source, terms)) {
    return {
      ok: false,
      code: 'NO_MATERIAL_CHANGE',
      reason: 'NO_MATERIAL_CHANGE',
      message: '這些安排和目前的計畫一樣。',
    };
  }

  const evaluation = freshRewardEvaluation(card, terms, childAgeGroup);

  // 改了每次多久卻算不出新的判定 —— 沿用舊數字會讓孩子看到一個依據
  // 已經不存在的金額。RPC 端也會擋（REWARD_REEVALUATION_REQUIRED），
  // 這裡先擋是為了不要讓家長按下去才看到紅字。
  if (evaluation === null && terms.rewardChoice !== 'no_coin'
    && source.reward_policy === 'coin_eligible'
    && source.policy_session_coin_reference !== null
    && pricingRelevantChange(source, terms)) {
    return {
      ok: false,
      code: 'POLICY_CHANGED',
      reason: 'REWARD_REEVALUATION_REQUIRED',
      message: '改了每次要做多久，成長幣要重新算過，請重新整理後再試。',
    };
  }

  return {
    ok: true,
    command: {
      schemaVersion: 1,
      proposalId: card.proposal.id,
      expectedPlanVersionId: source.id,
      sharedTerms: terms,
      ...(evaluation !== null ? { rewardEvaluation: evaluation } : null),
    },
  };
}
