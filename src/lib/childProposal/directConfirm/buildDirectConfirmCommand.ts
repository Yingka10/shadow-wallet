import { TASK_POLICY_VERSION, type PurposeCategory } from '../../../screens/parent/tablet/taskDrawer/taskCatalog';
import { evaluateTaskReward } from '../../../screens/parent/tablet/taskDrawer/taskReward';
import type { CreateParentTaskCommandBase } from '../../../screens/parent/tablet/taskDrawer/taskPersistence';
import type {
  ChildProposalFailure,
  ChildProposalPlanVersion,
  ChildProposalRewardDecision,
  ConfirmChildProposalCommand,
  ParentProposalCardData,
} from '../types';
import { CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION } from '../types';

/**
 * 第一次回顧排在幾天後。
 *
 * 與家長抽屜的 DRAFT_FALLBACKS.firstReviewDays 同值，也與 staging 上
 * 既有的 16 筆 long_term_goals 一致 —— 這條路徑建出來的長期計畫不該
 * 長得跟家長自己建的不一樣。
 */
const DEFAULT_FIRST_REVIEW_DAYS = 7;

const PURPOSE: Record<NonNullable<ChildProposalPlanVersion['purpose_category']>, PurposeCategory> = {
  A: 'life_routine',
  B: 'family_participation',
  C: 'autonomous_challenge',
  D: 'learning_skill',
};

function text(value: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Direct Confirm 只接受 UI 真正讀到的 exact current structured AI plan。 */
export function isDirectConfirmablePlan(card: ParentProposalCardData): boolean {
  const { proposal, currentPlanVersion: plan } = card;
  if (!plan || proposal.status !== 'proposed') return false;
  if (proposal.current_plan_version_id !== plan.id || plan.proposal_id !== proposal.id) return false;
  if (plan.authored_by !== 'ai') return false;
  if (!text(plan.plan_title) || !text(plan.completion_description) || !text(plan.next_step)) {
    return false;
  }
  if (!plan.purpose_category || !plan.duration_type || !plan.cadence_mode) return false;
  if (!plan.reward_policy || plan.reward_eligibility !== 'allowed') return false;
  if (!text(plan.reward_policy_version) || !text(plan.task_policy_version)) return false;
  if (!Number.isInteger(plan.estimated_minutes) || (plan.estimated_minutes ?? 0) <= 0) return false;
  if (plan.duration_type === 'long_term'
    && (!Number.isInteger(plan.duration_days) || (plan.duration_days ?? 0) <= 0)) return false;

  if (plan.cadence_mode === 'weekly_frequency') {
    return plan.progress_model === 'weekly_rhythm'
      && Number.isInteger(plan.cadence_weekly_frequency)
      && (plan.cadence_weekly_frequency ?? 0) >= 1
      && (plan.cadence_weekly_frequency ?? 0) <= 7
      && plan.cadence_days === null;
  }
  if (plan.cadence_mode === 'fixed_days') {
    return Array.isArray(plan.cadence_days) && plan.cadence_days.length > 0;
  }
  return plan.cadence_mode === 'one_time';
}

function policyChanged(message: string): ChildProposalFailure {
  return { ok: false, code: 'POLICY_CHANGED', reason: 'POLICY_CHANGED', message };
}

/**
 * 把 plan version 攤成 canonical evaluator 吃得下的命令。
 *
 * ⚠️ 這支是 **export 出去給 P1-A4A 重用的**（P1-A4A §10：不要第二套
 *    coin/reward evaluator）。兩條線的「怎麼算」必須完全一樣 ——
 *    差別只在「拿算出來的結果去跟什麼比對」，而那一段在各自的模組裡。
 *
 * 它不寫 DB、不判斷可不可以確認，只做欄位攤平。
 */
export function planEvaluationCommand(
  card: ParentProposalCardData,
): CreateParentTaskCommandBase {
  return evaluationCommand(card);
}

function evaluationCommand(card: ParentProposalCardData): CreateParentTaskCommandBase {
  const { proposal, currentPlanVersion: plan } = card;
  if (!plan || !plan.purpose_category || !plan.duration_type || !plan.reward_policy) {
    throw new Error('plan is not direct-confirmable');
  }

  const cadence = plan.cadence_mode;
  const schedule = {
    mode: cadence as 'one_time' | 'fixed_days' | 'weekly_frequency',
    startDate: '1970-01-01',
    ...(cadence === 'one_time' ? { scheduledDate: '1970-01-01' } : null),
    ...(cadence === 'fixed_days' ? { recurrenceDays: plan.cadence_days ?? [] } : null),
    ...(cadence === 'weekly_frequency'
      ? { weeklyFrequency: plan.cadence_weekly_frequency ?? undefined }
      : null),
    preferredTime: plan.preferred_time ?? 'when_needed',
    ...(text(plan.preferred_time_custom)
      ? { preferredTimeCustom: plan.preferred_time_custom }
      : null),
    estimatedMinutes: plan.estimated_minutes ?? undefined,
    reminderMode: 'none' as const,
    ...(plan.duration_days ? { durationDays: plan.duration_days, endDate: '1970-01-01' } : null),
  };

  return {
    schemaVersion: 1,
    creationSource: 'child_proposal',
    childId: proposal.child_id,
    familyId: proposal.family_id,
    rewardSupport: { intent: 'default' },
    task: {
      title: plan.plan_title!,
      purposeCategory: PURPOSE[plan.purpose_category],
      durationType: plan.duration_type,
      ...(plan.duration_type === 'long_term' ? { planMode: 'growth_plan' as const } : null),
      source: proposal.proposal_source,
      rewardPolicy: plan.reward_policy,
      completionPolicy: plan.duration_type === 'one_time'
        ? 'complete_once'
        : plan.duration_type === 'long_term' ? 'review_and_continue' : 'ongoing',
      originalExpectation: proposal.child_original_goal,
      completionDescription: plan.completion_description!,
    },
    schedule,
    content: { selectedOptions: {}, customOptionValues: {} },
    ...(plan.duration_type === 'long_term' ? {
      // 0 會被 long_term_goals_first_review_check（> 0）擋下來，而那個錯誤
      // 發生在 create_parent_task_core_v1 裡面 —— 整筆確認回滾，家長只看到
      // 「建立共同計畫失敗」。用抽屜的同一個預設值（7 天後第一次回顧），
      // 並夾住不超過計畫長度：durationDays 只有 1 天時，第 7 天不存在。
      review: {
        reviewEnabled: true,
        firstReviewAfterDays: Math.min(DEFAULT_FIRST_REVIEW_DAYS, plan.duration_days!),
        weekendReviewEnabled: false,
      },
      plan: { durationDays: plan.duration_days!, milestones: [], supportSteps: [], focusOptionIds: [] },
    } : null),
    metadata: {
      ageGroup: '',
      createdFromPreset: false,
      taskPolicyVersion: plan.task_policy_version!,
      editorKind: plan.duration_type === 'long_term' ? 'growth_plan'
        : plan.duration_type === 'one_time' ? 'one_time' : 'recurring',
      clientRequestId: proposal.id,
    },
  };
}

export type BuildDirectConfirmCommandResult =
  | { ok: true; command: ConfirmChildProposalCommand }
  | ChildProposalFailure;

export type BuildProposalRewardDecisionResult =
  | { ok: true; rewardDecision: ChildProposalRewardDecision }
  | ChildProposalFailure;

/**
 * 以 App 既有 canonical evaluator 產生 fresh decision，再與 version evidence 比對。
 * SQL 端只驗證這份 evidence；這裡不會寫 DB，也不是第二套 pricing engine。
 */
export function buildProposalRewardDecision(
  card: ParentProposalCardData,
  childAgeGroup: string,
): BuildProposalRewardDecisionResult {
  const plan = card.currentPlanVersion;
  if (!plan || !plan.purpose_category || !plan.duration_type || !plan.reward_policy
    || !text(plan.plan_title) || !text(plan.completion_description)
    || !text(plan.reward_policy_version) || !text(plan.task_policy_version)) {
    return {
      ok: false,
      code: 'PLAN_NOT_CONFIRMABLE',
      reason: 'PLAN_NOT_CONFIRMABLE',
      message: 'GrowBook 還沒有可確認的完整計畫，請重新整理後再試。',
    };
  }

  const base = evaluationCommand(card);
  const decision = evaluateTaskReward({ command: base, childAgeGroup });

  if (decision.eligibility !== 'allowed') return policyChanged(decision.explanation);
  if (plan.task_policy_version !== TASK_POLICY_VERSION) {
    return policyChanged('任務政策已更新，請重新整理 GrowBook 建議。');
  }
  if (plan.reward_policy !== decision.rewardPolicy
    || plan.reward_policy_version !== decision.rewardPolicyVersion) {
    return policyChanged('回饋政策已更新，請重新整理 GrowBook 建議。');
  }
  if (decision.rewardPolicy === 'coin_eligible') {
    if (plan.ai_suggested_coin_amount !== decision.coin.suggestedAmount) {
      return policyChanged('成長幣建議已更新，請重新整理後再確認。');
    }
  } else if (plan.ai_suggested_coin_amount !== null) {
    return policyChanged('這份不發幣的計畫帶有過期幣值，請重新整理。');
  }

  return { ok: true, rewardDecision: decision };
}

export function buildDirectConfirmCommand(
  card: ParentProposalCardData,
  childAgeGroup: string,
): BuildDirectConfirmCommandResult {
  if (!isDirectConfirmablePlan(card)) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      reason: 'PLAN_NOT_CONFIRMABLE',
      message: 'GrowBook 還沒有可確認的完整計畫，請重新整理後再試。',
    };
  }

  const plan = card.currentPlanVersion!;
  const reward = buildProposalRewardDecision(card, childAgeGroup);
  if (reward.ok !== true) return reward;

  return {
    ok: true,
    command: {
      schemaVersion: CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
      proposalId: card.proposal.id,
      expectedPlanVersionId: plan.id,
      rewardDecision: reward.rewardDecision,
    },
  };
}
