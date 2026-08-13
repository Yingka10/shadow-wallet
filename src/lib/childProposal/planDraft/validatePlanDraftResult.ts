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
  type PayoutType,
  type PlanDraftAgeGroup,
  type PlanDraftBandId,
  type PlanDraftCadence,
  type PlanDraftUnavailableReason,
  type PricingBasis,
  type PricingResult,
} from './types';

const CATEGORIES: readonly string[] = ['A', 'B', 'C', 'D'];
const DIFFICULTIES: readonly string[] = ['easy', 'standard', 'hard'];
const DURATION_TYPES: readonly string[] = ['one_time', 'recurring', 'long_term'];
const PRICING_STATUSES: readonly string[] = ['priced', 'unpriced', 'coin_disabled', 'gated'];
const CADENCE_SOURCES: readonly string[] = ['child', 'ai_suggested', 'none'];
const PAYOUT_TYPES: readonly string[] = [
  'per_completion',
  'per_period',
  'per_milestone',
  'final_completion',
];
const AGE_GROUPS: readonly string[] = ['2-4', '4-6', '6-9', '9-12'];
const BAND_IDS: readonly string[] = ['5-10', '11-20', '21-30', '31-45', '46+'];
const ACTIVITY_KINDS: readonly string[] = [
  'reading',
  'practice',
  'exercise',
  'creating',
  'learning',
  'helping',
  'other',
];
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

function validPricingBasis(value: unknown): PricingBasis | null {
  if (value === null || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  const policyVersion = nonEmptyString(raw.policyVersion, 80);
  if (policyVersion === null) return null;
  if (typeof raw.ageGroup !== 'string' || !AGE_GROUPS.includes(raw.ageGroup)) return null;
  if (raw.taskType !== 'C' && raw.taskType !== 'D') return null;
  if (typeof raw.band !== 'string' || !BAND_IDS.includes(raw.band)) return null;
  if (typeof raw.difficulty !== 'string' || !DIFFICULTIES.includes(raw.difficulty)) return null;
  const estimatedMinutes = intInRange(
    raw.estimatedMinutes,
    PLAN_DRAFT_LIMITS.minMinutes,
    PLAN_DRAFT_LIMITS.maxMinutes,
  );
  if (estimatedMinutes === null) return null;
  if (raw.computedFrom !== 'deterministic') return null;

  return {
    policyVersion,
    ageGroup: raw.ageGroup as PlanDraftAgeGroup,
    taskType: raw.taskType,
    band: raw.band as PlanDraftBandId,
    difficulty: raw.difficulty as PricingBasis['difficulty'],
    estimatedMinutes,
    computedFrom: 'deterministic',
  };
}

/**
 * payoutType 與 pricing 是不是一份合法組合。
 *
 * `pricing === null` 一律合法（不發幣／unpriced/gated/coin_disabled，跟
 * pricingStatus 是同一件事，不在這裡重複判斷）。`pricing !== null` 時，
 * `pricing.payoutType` 必須跟草稿頂層的 `payoutType` 一致——兩處各說各話
 * 代表回應本身是壞的，不是「有一點不一致但還能用」。
 */
function validPricingResult(
  value: unknown,
  payoutType: PayoutType,
): PricingResult | null | 'invalid' {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return 'invalid';
  const raw = value as Record<string, unknown>;

  if (raw.payoutType !== payoutType) return 'invalid';

  const basis = validPricingBasis(raw.basis);
  if (basis === null) return 'invalid';

  if (payoutType === 'per_completion') {
    if (raw.status !== 'resolved') return 'invalid';
    const finalRewardCoins = intInRange(raw.finalRewardCoins, 1, 999);
    const sessionCoinReference = intInRange(raw.sessionCoinReference, 1, 999);
    if (finalRewardCoins === null || sessionCoinReference === null) return 'invalid';
    // per_completion 的 session 價就是最終金額——兩者對不上代表資料本身矛盾。
    if (finalRewardCoins !== sessionCoinReference) return 'invalid';
    return { payoutType, status: 'resolved', finalRewardCoins, sessionCoinReference, basis };
  }

  if (payoutType === 'per_period') {
    if (raw.status !== 'session_reference_only') return 'invalid';
    if (raw.gapCode !== 'PERIOD_PRICING_POLICY_GAP') return 'invalid';
    const sessionCoinReference = intInRange(raw.sessionCoinReference, 1, 999);
    if (sessionCoinReference === null) return 'invalid';
    return {
      payoutType,
      status: 'session_reference_only',
      sessionCoinReference,
      gapCode: 'PERIOD_PRICING_POLICY_GAP',
      basis,
    };
  }

  // per_milestone / final_completion
  if (raw.status !== 'policy_gap') return 'invalid';
  if (raw.gapCode !== 'MILESTONE_PRICING_POLICY_GAP') return 'invalid';
  const sessionCoinReference = intInRange(raw.sessionCoinReference, 1, 999);
  if (sessionCoinReference === null) return 'invalid';
  return {
    payoutType,
    status: 'policy_gap',
    sessionCoinReference,
    gapCode: 'MILESTONE_PRICING_POLICY_GAP',
    basis,
  };
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

  // 封閉列舉。認不出來就整筆不放行 —— 這一欄決定正式完成標準的句型，
  // 靜靜退回 'other' 會讓一個閱讀計畫的完成標準變成「完成一次說好的步驟」。
  if (typeof raw.activityKind !== 'string' || !ACTIVITY_KINDS.includes(raw.activityKind)) {
    return null;
  }

  // 建議可以沒有（null），但不可以是一個看不懂的型別。
  const nextStepSuggestion =
    raw.nextStepSuggestion === null || raw.nextStepSuggestion === undefined
      ? null
      : nonEmptyString(raw.nextStepSuggestion, PLAN_DRAFT_LIMITS.maxNextStepLength);
  if (
    raw.nextStepSuggestion !== null
    && raw.nextStepSuggestion !== undefined
    && nextStepSuggestion === null
  ) {
    return null;
  }

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

  if (typeof raw.payoutType !== 'string' || !PAYOUT_TYPES.includes(raw.payoutType)) return null;
  const payoutType = raw.payoutType as PayoutType;

  const pricing = validPricingResult(raw.pricing, payoutType);
  if (pricing === 'invalid') return null;
  // pricing 非 null 的話，rewardPolicy 一定要是 coin_eligible、pricingStatus 一定要是
  // priced——跟舊版 coinAmountConsistent 是同一條規則，只是套在新欄位上。
  if (pricing !== null && !coinAmountConsistent(pricing.sessionCoinReference, raw.rewardPolicy, raw.pricingStatus)) {
    return null;
  }

  const sessionCoinReference =
    raw.sessionCoinReference === null || raw.sessionCoinReference === undefined
      ? null
      : intInRange(raw.sessionCoinReference, 1, 999);
  if (
    raw.sessionCoinReference !== null
    && raw.sessionCoinReference !== undefined
    && sessionCoinReference === null
  ) {
    return null;
  }
  if (!coinAmountConsistent(sessionCoinReference, raw.rewardPolicy, raw.pricingStatus)) {
    return null;
  }
  // pricing 有值時，sessionCoinReference 一定要跟它裡面的數字相等——
  // 兩處各講一個數字代表回應本身矛盾。
  if (pricing !== null && sessionCoinReference !== pricing.sessionCoinReference) return null;
  if (pricing === null && sessionCoinReference !== null) return null;

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
  // shim：舊欄位必須跟新欄位相等，不能各講各的。
  if (aiSuggestedCoinAmount !== sessionCoinReference) return null;

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
    activityKind: raw.activityKind as ChildProposalPlanDraft['activityKind'],
    nextStepSuggestion,
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
    payoutType,
    pricing,
    sessionCoinReference,
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
