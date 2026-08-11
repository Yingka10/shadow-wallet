// Shadow Wallet — 回來的東西是不是一份能用的 Plan Draft（P0-3）
//
// ─────────────────────────────────────────────────────────────────────────
// **不 cast。**
//
//   const result = data as ChildProposalPlanDraftResult;   ← 不可以
//
// Function 端已經驗過一次，但那是 Function 端。這裡拿到的是網路上回來的
// unknown，中間可能有代理、快取、或一個部署到一半的舊版 Function。
// 與 taskAi 的 validateTaskAiResult 同一條規則。
//
// 這一層特別重要的原因是它的下游：驗過就會被寫成 authored_by='ai' 的
// 計畫版本。放行一份形狀不對的東西，等於在資料庫裡留下一列
// 「plan_title 是 undefined」的計畫，而畫面上只會顯示一片空白。
//
// 驗不過一律回 unavailable('INVALID_RESPONSE')，**不修補、不補預設值**。
// ─────────────────────────────────────────────────────────────────────────

import {
  CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION,
  PLAN_DRAFT_LIMITS,
  type ChildProposalPlanDraft,
  type ChildProposalPlanDraftResult,
  type PlanDraftCadence,
  type PlanDraftUnavailableReason,
} from './types';

const CATEGORIES: readonly string[] = ['A', 'B', 'C', 'D'];
const DIFFICULTIES: readonly string[] = ['easy', 'standard', 'hard'];
const DURATION_TYPES: readonly string[] = ['one_time', 'recurring', 'long_term'];
const PRICING_STATUSES: readonly string[] = ['priced', 'unpriced', 'coin_disabled', 'gated'];
const CADENCE_SOURCES: readonly string[] = ['child', 'ai_suggested', 'none'];
const REWARD_POLICIES: readonly string[] = [
  'record_only',
  'family_contribution',
  'progress_only',
  'coin_eligible',
];
const REWARD_ELIGIBILITIES: readonly string[] = ['not_evaluated', 'allowed', 'blocked'];
const UNAVAILABLE_REASONS: readonly string[] = [
  'TIMEOUT',
  'INVALID_RESPONSE',
  'INVALID_AI_OUTPUT',
  'SERVICE_ERROR',
  'SERVICE_DISABLED',
  'INVALID_INPUT',
];

export function planDraftUnavailable(
  reason: PlanDraftUnavailableReason,
): ChildProposalPlanDraftResult {
  return {
    status: 'unavailable',
    schemaVersion: CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION,
    reason,
  };
}

function nonEmptyString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

function intInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value >= min && value <= max ? value : null;
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const trimmed = item.trim();
    if (trimmed.length > 0) out.push(trimmed);
  }
  return out;
}

function validCadence(value: unknown): PlanDraftCadence | null | 'invalid' {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return 'invalid';
  const raw = value as Record<string, unknown>;

  if (raw.mode === 'one_time') return { mode: 'one_time' };

  if (raw.mode === 'weekly_frequency') {
    const times = intInRange(raw.weeklyFrequency, 1, PLAN_DRAFT_LIMITS.maxWeeklyFrequency);
    return times === null ? 'invalid' : { mode: 'weekly_frequency', weeklyFrequency: times };
  }

  if (raw.mode === 'fixed_days') {
    if (!Array.isArray(raw.days) || raw.days.length === 0) return 'invalid';
    const days: number[] = [];
    for (const day of raw.days) {
      const parsed = intInRange(day, 0, 6);
      if (parsed === null) return 'invalid';
      if (!days.includes(parsed)) days.push(parsed);
    }
    return { mode: 'fixed_days', days: days.sort((a, b) => a - b) };
  }

  return 'invalid';
}

/**
 * 幣值與回饋方式必須互相對得上。
 *
 * 一個「不發幣但建議 12 幣」的組合不是小瑕疵 —— 家長端會顯示那個 12，
 * 而規則引擎從來沒有同意過它。這種矛盾一律當成無效回應。
 */
function coinAmountConsistent(
  amount: number | null,
  policy: string,
  pricingStatus: string,
): boolean {
  if (amount === null) return true;
  return policy === 'coin_eligible' && pricingStatus === 'priced';
}

function validateDraft(value: unknown): ChildProposalPlanDraft | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const planTitle = nonEmptyString(raw.planTitle, PLAN_DRAFT_LIMITS.maxTitleLength);
  const planSummary = nonEmptyString(raw.planSummary, PLAN_DRAFT_LIMITS.maxSummaryLength);
  const completionDescription = nonEmptyString(
    raw.completionDescription,
    PLAN_DRAFT_LIMITS.maxCompletionLength,
  );
  if (planTitle === null || planSummary === null || completionDescription === null) return null;

  const cadence = validCadence(raw.cadence);
  if (cadence === 'invalid') return null;

  if (typeof raw.cadenceSource !== 'string' || !CADENCE_SOURCES.includes(raw.cadenceSource)) {
    return null;
  }
  // 有節奏就一定要說得出是誰決定的；沒有節奏就不能自稱有來源。
  if (cadence === null && raw.cadenceSource !== 'none') return null;
  if (cadence !== null && raw.cadenceSource === 'none') return null;

  const estimatedMinutes = intInRange(
    raw.estimatedMinutes,
    PLAN_DRAFT_LIMITS.minMinutes,
    PLAN_DRAFT_LIMITS.maxMinutes,
  );
  if (estimatedMinutes === null) return null;

  if (typeof raw.durationType !== 'string' || !DURATION_TYPES.includes(raw.durationType)) {
    return null;
  }

  const durationDays =
    raw.durationDays === null || raw.durationDays === undefined
      ? null
      : intInRange(
          raw.durationDays,
          PLAN_DRAFT_LIMITS.minDurationDays,
          PLAN_DRAFT_LIMITS.maxDurationDays,
        );
  if (raw.durationDays !== null && raw.durationDays !== undefined && durationDays === null) {
    return null;
  }

  if (typeof raw.category !== 'string' || !CATEGORIES.includes(raw.category)) return null;
  if (typeof raw.difficulty !== 'string' || !DIFFICULTIES.includes(raw.difficulty)) return null;
  if (typeof raw.rewardPolicy !== 'string' || !REWARD_POLICIES.includes(raw.rewardPolicy)) {
    return null;
  }
  if (
    typeof raw.rewardEligibility !== 'string'
    || !REWARD_ELIGIBILITIES.includes(raw.rewardEligibility)
  ) {
    return null;
  }
  if (typeof raw.pricingStatus !== 'string' || !PRICING_STATUSES.includes(raw.pricingStatus)) {
    return null;
  }

  // 資格判定過的版本一定要附政策版本 —— DB 的 CHECK 也是這樣要求的。
  const rewardPolicyVersion = nonEmptyString(raw.rewardPolicyVersion, 80);
  if (rewardPolicyVersion === null) return null;

  const aiSuggestedCoinAmount =
    raw.aiSuggestedCoinAmount === null || raw.aiSuggestedCoinAmount === undefined
      ? null
      : intInRange(raw.aiSuggestedCoinAmount, 1, 999);
  if (
    raw.aiSuggestedCoinAmount !== null
    && raw.aiSuggestedCoinAmount !== undefined
    && aiSuggestedCoinAmount === null
  ) {
    return null;
  }
  if (!coinAmountConsistent(aiSuggestedCoinAmount, raw.rewardPolicy, raw.pricingStatus)) {
    return null;
  }

  const blockingIssues = stringList(raw.blockingIssues);
  const requiresConfirmation = stringList(raw.requiresConfirmation);
  const warnings = stringList(raw.warnings);
  if (blockingIssues === null || requiresConfirmation === null || warnings === null) return null;

  const model = nonEmptyString(raw.model, 80);
  if (model === null) return null;

  return {
    schemaVersion: CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION,
    planTitle,
    planSummary,
    completionDescription,
    cadence,
    cadenceSource: raw.cadenceSource as ChildProposalPlanDraft['cadenceSource'],
    estimatedMinutes,
    durationType: raw.durationType as ChildProposalPlanDraft['durationType'],
    durationDays,
    category: raw.category as ChildProposalPlanDraft['category'],
    categoryReason: typeof raw.categoryReason === 'string' ? raw.categoryReason.trim() : '',
    difficulty: raw.difficulty as ChildProposalPlanDraft['difficulty'],
    rewardPolicy: raw.rewardPolicy as ChildProposalPlanDraft['rewardPolicy'],
    rewardEligibility: raw.rewardEligibility as ChildProposalPlanDraft['rewardEligibility'],
    rewardPolicyVersion,
    pricingStatus: raw.pricingStatus as ChildProposalPlanDraft['pricingStatus'],
    aiSuggestedCoinAmount,
    blockingIssues,
    requiresConfirmation,
    warnings,
    clarificationQuestion:
      typeof raw.clarificationQuestion === 'string' && raw.clarificationQuestion.trim().length > 0
        ? raw.clarificationQuestion.trim()
        : null,
    model,
  };
}

/** 網路回來的 unknown → 結構化結果。看不懂一律 INVALID_RESPONSE。 */
export function validatePlanDraftResult(value: unknown): ChildProposalPlanDraftResult {
  if (value === null || typeof value !== 'object') return planDraftUnavailable('INVALID_RESPONSE');
  const raw = value as Record<string, unknown>;

  if (raw.schemaVersion !== CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION) {
    return planDraftUnavailable('INVALID_RESPONSE');
  }

  if (raw.status === 'unavailable') {
    return planDraftUnavailable(
      typeof raw.reason === 'string' && UNAVAILABLE_REASONS.includes(raw.reason)
        ? (raw.reason as PlanDraftUnavailableReason)
        : 'INVALID_RESPONSE',
    );
  }

  if (raw.status !== 'draft') return planDraftUnavailable('INVALID_RESPONSE');

  const draft = validateDraft(raw.draft);
  if (draft === null) return planDraftUnavailable('INVALID_RESPONSE');

  return { status: 'draft', schemaVersion: CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION, draft };
}
