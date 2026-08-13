// GrowBook — 回來的東西是不是一份能用的計畫（P1-A1）
//
// ─────────────────────────────────────────────────────────────────────────
// **不 cast。** 與 P0-3 的 validatePlanDraftResult 同一條規則：
// Function 端已經驗過一次，但那是 Function 端；這裡拿到的是網路上回來的
// unknown，中間可能有代理、快取、或一個部署到一半的舊版 Function。
//
// 這一支比 P0-3 那一支多做一件事：**它也是產品原則的執法者。**
//
//   形狀不對          → INVALID_RESPONSE + SHAPE_INVALID
//   形狀對、原則不對  → INVALID_AI_OUTPUT + 具體的 rejection code
//
// 兩者分開的理由是診斷：前者代表兩端契約漂移（要去看部署），
// 後者代表模型這一次寫了不該寫的東西（要去看 prompt）。
//
// 驗不過一律 unavailable，**不修補、不補預設值、不替模型改寫**。
// 一個會幫模型補完的 validator 產出的是沒有人決定過的內容。
//
// 這支需要 input 才驗得完：「該不該再問一題」「孩子講過的節奏有沒有被
// 換掉」「時段是不是憑空冒出來的」都是相對於孩子講過什麼才成立的判斷。
// ─────────────────────────────────────────────────────────────────────────

import {
  cadenceEquals,
  checkPlanActionText,
  containsClockTime,
  containsMentalStateDiagnosis,
  informationSufficiency,
} from './planGuards';
import {
  CHILD_GOAL_PLANNING_LIMITS,
  CHILD_GOAL_PLANNING_SCHEMA_VERSION,
  CHILD_PLANNING_CONTRIBUTIONS,
  CHILD_PLAN_CLARIFICATION_KINDS,
  CHILD_PLAN_FIELD_SOURCES,
  CHILD_PLAN_PROGRESSION_KINDS,
  type ChildGoalPlan,
  type ChildGoalPlanCore,
  type ChildGoalPlanningInput,
  type ChildGoalPlanningResult,
  type ChildGoalPlanningUnavailableReason,
  type ChildPlanCadence,
  type ChildPlanClarificationKind,
  type ChildPlanFieldSource,
  type ChildPlanPhase,
  type ChildPlanProgressionKind,
  type ChildPlanProvenance,
  type ChildPlanRejectionCode,
  type ChildPlanReviewPoint,
  type ChildPlanSessionSize,
  type ChildPlanStartOption,
  type ChildPlanningContribution,
} from './types';

const UNAVAILABLE_REASONS: readonly string[] = [
  'TIMEOUT',
  'INVALID_RESPONSE',
  'INVALID_AI_OUTPUT',
  'SERVICE_ERROR',
  'SERVICE_DISABLED',
  'INVALID_INPUT',
];

const L = CHILD_GOAL_PLANNING_LIMITS;

export function childGoalPlanningUnavailable(
  reason: ChildGoalPlanningUnavailableReason,
  rejections?: ChildPlanRejectionCode[],
): ChildGoalPlanningResult {
  return {
    status: 'unavailable',
    schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
    reason,
    ...(rejections && rejections.length > 0 ? { rejections } : null),
  };
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 一次收集，最後一起回報。重複的代碼只留一個。 */
class Rejections {
  private readonly codes: ChildPlanRejectionCode[] = [];

  add(code: ChildPlanRejectionCode): void {
    if (!this.codes.includes(code)) this.codes.push(code);
  }

  get list(): ChildPlanRejectionCode[] {
    return [...this.codes];
  }

  get shapeOnly(): boolean {
    return this.codes.length > 0 && this.codes.every((code) => code === 'SHAPE_INVALID');
  }

  get any(): boolean {
    return this.codes.length > 0;
  }
}

function validCadence(value: unknown): ChildPlanCadence | null | 'invalid' {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return 'invalid';

  if (value.mode === 'one_time') return { mode: 'one_time' };

  if (value.mode === 'weekly_frequency') {
    const times = intInRange(value.weeklyFrequency, 1, L.maxWeeklyFrequency);
    return times === null ? 'invalid' : { mode: 'weekly_frequency', weeklyFrequency: times };
  }

  if (value.mode === 'fixed_days') {
    if (!Array.isArray(value.days) || value.days.length === 0) return 'invalid';
    const days: number[] = [];
    for (const day of value.days) {
      const parsed = intInRange(day, 0, 6);
      if (parsed === null) return 'invalid';
      if (!days.includes(parsed)) days.push(parsed);
    }
    return { mode: 'fixed_days', days: days.sort((a, b) => a - b) };
  }

  return 'invalid';
}

function validSessionSize(value: unknown): ChildPlanSessionSize | null | 'invalid' {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return 'invalid';

  if (value.kind === 'minutes') {
    const minutes = intInRange(value.minutes, L.minSessionMinutes, L.maxSessionMinutes);
    return minutes === null ? 'invalid' : { kind: 'minutes', minutes };
  }

  if (value.kind === 'count') {
    const count = intInRange(value.count, L.minSessionCount, L.maxSessionCount);
    const unit = nonEmptyString(value.unit, L.maxUnitLength);
    return count === null || unit === null ? 'invalid' : { kind: 'count', count, unit };
  }

  return 'invalid';
}

function validReviewPoint(value: unknown): ChildPlanReviewPoint | 'invalid' {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return 'invalid';

  if (value.type === 'after_days') {
    const days = intInRange(value.days, L.minReviewDays, L.maxReviewDays);
    return days === null ? 'invalid' : { type: 'after_days', days };
  }
  if (value.type === 'after_sessions') {
    const sessions = intInRange(value.sessions, L.minReviewSessions, L.maxReviewSessions);
    return sessions === null ? 'invalid' : { type: 'after_sessions', sessions };
  }
  if (value.type === 'after_phase') {
    const phaseId = nonEmptyString(value.phaseId, L.maxPhaseIdLength);
    return phaseId === null ? 'invalid' : { type: 'after_phase', phaseId };
  }
  return 'invalid';
}

function validFieldSource(value: unknown): ChildPlanFieldSource | null {
  if (typeof value !== 'string') return null;
  return (CHILD_PLAN_FIELD_SOURCES as readonly string[]).includes(value)
    ? (value as ChildPlanFieldSource)
    : null;
}

function validProvenance(value: unknown): ChildPlanProvenance | null {
  if (!isRecord(value) || !isRecord(value.fields)) return null;

  const childOriginalGoal = nonEmptyString(value.childOriginalGoal, L.maxGoalLength);
  if (childOriginalGoal === null) return null;

  const rawApproach = value.childStatedApproach;
  let childStatedApproach: string | null = null;
  if (rawApproach !== null && rawApproach !== undefined) {
    childStatedApproach = nonEmptyString(rawApproach, L.maxApproachLength);
    if (childStatedApproach === null) return null;
  }

  const keys = [
    'cadence',
    'sessionSize',
    'preferredTime',
    'nextAction',
    'reviewPoint',
    'phases',
    'target',
  ] as const;

  const fields = {} as ChildPlanProvenance['fields'];
  for (const key of keys) {
    const source = validFieldSource(value.fields[key]);
    if (source === null) return null;
    fields[key] = source;
  }

  return { childOriginalGoal, childStatedApproach, fields };
}

function validPhases(value: unknown): ChildPlanPhase[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length < L.minPhases || value.length > L.maxPhases) return null;

  const phases: ChildPlanPhase[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) return null;
    const id = nonEmptyString(item.id, L.maxPhaseIdLength);
    const title = nonEmptyString(item.title, L.maxPhaseTitleLength);
    const observableDoneWhen = nonEmptyString(item.observableDoneWhen, L.maxDoneWhenLength);
    if (id === null || title === null || observableDoneWhen === null) return null;
    if (seen.has(id)) return null;
    seen.add(id);
    phases.push({ id, title, observableDoneWhen });
  }
  return phases;
}

function validStartOptions(value: unknown): ChildPlanStartOption[] | null | 'invalid' {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return 'invalid';
  if (value.length < L.minStartOptions || value.length > L.maxStartOptions) return 'invalid';

  const options: ChildPlanStartOption[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) return 'invalid';
    const id = nonEmptyString(item.id, L.maxPhaseIdLength);
    const text = nonEmptyString(item.text, L.maxOptionLength);
    if (id === null || text === null) return 'invalid';
    if (seen.has(id)) return 'invalid';
    seen.add(id);
    options.push({ id, text });
  }
  return options;
}

// ---------------------------------------------------------------------------
// Ready Plan
// ---------------------------------------------------------------------------

type CoreParts = {
  core: ChildGoalPlanCore;
  /** 所有由 AI 產出的自由文字，供 guard 一次掃過。 */
  texts: string[];
};

function validateCore(raw: Record<string, unknown>, rejections: Rejections): CoreParts | null {
  const desiredOutcome = nonEmptyString(raw.desiredOutcome, L.maxOutcomeLength);
  const actionPlanSummary = nonEmptyString(raw.actionPlanSummary, L.maxSummaryLength);
  const currentFocus = nonEmptyString(raw.currentFocus, L.maxFocusLength);
  const model = nonEmptyString(raw.model, L.maxModelLength);
  if (
    desiredOutcome === null
    || actionPlanSummary === null
    || currentFocus === null
    || model === null
  ) {
    rejections.add('SHAPE_INVALID');
    return null;
  }

  if (
    typeof raw.planningContribution !== 'string'
    || !(CHILD_PLANNING_CONTRIBUTIONS as readonly string[]).includes(raw.planningContribution)
  ) {
    rejections.add('SHAPE_INVALID');
    return null;
  }
  const planningContribution = raw.planningContribution as ChildPlanningContribution;

  if (!isRecord(raw.nextAction)) {
    rejections.add('SHAPE_INVALID');
    return null;
  }
  const nextActionText = nonEmptyString(raw.nextAction.text, L.maxActionLength);
  const nextActionSource = raw.nextAction.source;
  if (
    nextActionText === null
    || (nextActionSource !== 'child'
      && nextActionSource !== 'ai_suggested'
      && nextActionSource !== 'derived')
  ) {
    rejections.add('SHAPE_INVALID');
    return null;
  }

  const reviewPoint = validReviewPoint(raw.reviewPoint);
  if (reviewPoint === 'invalid') {
    rejections.add('SHAPE_INVALID');
    return null;
  }

  const provenance = validProvenance(raw.provenance);
  if (provenance === null) {
    rejections.add('SHAPE_INVALID');
    return null;
  }

  const startOptions = validStartOptions(raw.startOptions);
  if (startOptions === 'invalid') {
    rejections.add('SHAPE_INVALID');
    return null;
  }

  // 選項只在「AI 提供了幾種做法」時成立。其他情況有選項，代表這份計畫
  // 一邊說「只是幫你整理」一邊在給建議——兩件事不能同時是真的。
  if (startOptions !== null && planningContribution !== 'suggested_options') {
    rejections.add('SHAPE_INVALID');
    return null;
  }
  if (startOptions === null && planningContribution === 'suggested_options') {
    rejections.add('SHAPE_INVALID');
    return null;
  }

  // 下一步走既有的 validateNextStep。過不了就整份不放行——
  // 這是「不可以把成果當成行動」在程式裡的樣子。
  const action = checkPlanActionText(nextActionText);
  if (!action.ok) rejections.add('NEXT_ACTION_INVALID');

  return {
    core: {
      desiredOutcome,
      actionPlanSummary,
      currentFocus,
      nextAction: { text: nextActionText, source: nextActionSource },
      reviewPoint,
      planningContribution,
      provenance,
      startOptions,
      model,
    },
    texts: [
      desiredOutcome,
      actionPlanSummary,
      currentFocus,
      nextActionText,
      ...(startOptions ?? []).map((option) => option.text),
    ],
  };
}

/** progression 專屬的欄位。回 null 代表形狀不對。 */
function validateVariant(
  kind: ChildPlanProgressionKind,
  raw: Record<string, unknown>,
  core: ChildGoalPlanCore,
  rejections: Rejections,
): { plan: ChildGoalPlan; texts: string[] } | null {
  if (kind === 'rhythm') {
    const cadence = validCadence(raw.cadence);
    const sessionSize = validSessionSize(raw.sessionSize);
    if (cadence === 'invalid' || sessionSize === 'invalid') {
      rejections.add('SHAPE_INVALID');
      return null;
    }

    let trialPeriod: { days: number } | { sessions: number } | null = null;
    if (raw.trialPeriod !== null && raw.trialPeriod !== undefined) {
      if (!isRecord(raw.trialPeriod)) {
        rejections.add('SHAPE_INVALID');
        return null;
      }
      const days = intInRange(raw.trialPeriod.days, L.minReviewDays, L.maxReviewDays);
      const sessions = intInRange(
        raw.trialPeriod.sessions,
        L.minReviewSessions,
        L.maxReviewSessions,
      );
      if (days !== null) trialPeriod = { days };
      else if (sessions !== null) trialPeriod = { sessions };
      else {
        rejections.add('SHAPE_INVALID');
        return null;
      }
    }

    // trialPeriod 與 reviewPoint 講的是同一件事的兩種寫法。兩處講不同的
    // 數字，孩子會看到「先試 7 天」但畫面在第 14 天才提醒他回來看看。
    if (trialPeriod !== null) {
      const matches =
        'days' in trialPeriod
          ? core.reviewPoint?.type === 'after_days' && core.reviewPoint.days === trialPeriod.days
          : core.reviewPoint?.type === 'after_sessions'
            && core.reviewPoint.sessions === trialPeriod.sessions;
      if (!matches) {
        rejections.add('SHAPE_INVALID');
        return null;
      }
    }

    if (core.reviewPoint?.type === 'after_phase') {
      // rhythm 沒有 phase，指向一個不存在的階段。
      rejections.add('SHAPE_INVALID');
      return null;
    }

    return {
      plan: { ...core, progressionKind: 'rhythm', cadence, sessionSize, trialPeriod },
      texts: sessionSize !== null && sessionSize.kind === 'count' ? [sessionSize.unit] : [],
    };
  }

  if (kind === 'staged') {
    const phases = validPhases(raw.phases);
    if (phases === null) {
      rejections.add('SHAPE_INVALID');
      return null;
    }

    const reviewPoint = core.reviewPoint;
    if (
      reviewPoint?.type === 'after_phase'
      && !phases.some((phase) => phase.id === reviewPoint.phaseId)
    ) {
      // 指向一個不存在的階段。留著它，畫面會顯示一個永遠到不了的 review。
      rejections.add('SHAPE_INVALID');
      return null;
    }

    // 階段的完成條件必須看得見。「更有自信」沒有人有辦法說它到了沒有。
    for (const phase of phases) {
      if (containsMentalStateDiagnosis(phase.observableDoneWhen)) {
        rejections.add('PHASE_NOT_OBSERVABLE');
      }
    }

    return {
      plan: { ...core, progressionKind: 'staged', phases },
      texts: phases.flatMap((phase) => [phase.title, phase.observableDoneWhen]),
    };
  }

  if (kind === 'accumulation') {
    const targetValue = intInRange(raw.targetValue, L.minTargetValue, L.maxTargetValue);
    const targetUnit = nonEmptyString(raw.targetUnit, L.maxUnitLength);
    const currentValue = intInRange(raw.currentValue, 0, L.maxTargetValue);
    if (targetValue === null || targetUnit === null || currentValue === null) {
      rejections.add('SHAPE_INVALID');
      return null;
    }
    if (currentValue > targetValue) {
      rejections.add('SHAPE_INVALID');
      return null;
    }
    if (core.reviewPoint?.type === 'after_phase') {
      rejections.add('SHAPE_INVALID');
      return null;
    }

    return {
      plan: { ...core, progressionKind: 'accumulation', targetValue, targetUnit, currentValue },
      texts: [targetUnit],
    };
  }

  // outcome_to_action
  const cadence = validCadence(raw.cadence);
  if (cadence === 'invalid') {
    rejections.add('SHAPE_INVALID');
    return null;
  }
  if (!Array.isArray(raw.controllableActions)) {
    rejections.add('SHAPE_INVALID');
    return null;
  }
  if (
    raw.controllableActions.length < L.minControllableActions
    || raw.controllableActions.length > L.maxControllableActions
  ) {
    rejections.add('SHAPE_INVALID');
    return null;
  }

  const controllableActions: string[] = [];
  for (const item of raw.controllableActions) {
    const text = nonEmptyString(item, L.maxActionLength);
    if (text === null) {
      rejections.add('SHAPE_INVALID');
      return null;
    }
    // 每一句都要通過與下一步同一套驗證：「拿第一名」「考 100 分」
    // 不是孩子控制得了的行動，寫在這裡等於把成果偽裝成計畫。
    if (!checkPlanActionText(text).ok) rejections.add('OUTCOME_USED_AS_ACTION');
    controllableActions.push(text);
  }

  if (core.reviewPoint?.type === 'after_phase') {
    rejections.add('SHAPE_INVALID');
    return null;
  }

  return {
    plan: { ...core, progressionKind: 'outcome_to_action', controllableActions, cadence },
    texts: controllableActions,
  };
}

/**
 * 與孩子講過的話對照。
 *
 * 這一段是 Principle A 與「不可以偷偷補決定」的執法點，而且它**只有
 * 拿得到 input 才做得到** —— 光看回應本身，一個被換掉的方法看起來
 * 跟一個被整理過的方法一模一樣。
 */
function checkAgainstChildInput(
  plan: ChildGoalPlan,
  input: ChildGoalPlanningInput,
  texts: string[],
  rejections: Rejections,
): void {
  const { provenance } = plan;

  // 孩子的原話必須逐字保留。
  if (provenance.childOriginalGoal !== input.childOriginalGoal.trim()) {
    rejections.add('CHILD_INPUT_OVERWRITTEN');
  }

  const inputApproach =
    input.childApproach === null || input.childApproach.trim().length === 0
      ? null
      : input.childApproach.trim();
  if (provenance.childStatedApproach !== inputApproach) {
    rejections.add('CHILD_INPUT_OVERWRITTEN');
  }

  // 孩子已經講過方法時，這一輪不可能是「AI 提供了幾種做法」——
  // 那正是「把孩子的方法換成另一套」長出來的樣子。
  if (inputApproach !== null && plan.planningContribution === 'suggested_options') {
    rejections.add('CHILD_INPUT_OVERWRITTEN');
  }

  // 孩子連節奏帶方法都講了，下一步就不可能是 AI 想出來的。
  //
  // 這條是「不得直接覆寫成另一套訓練」唯一驗得出來的形式：光看回應本身，
  // 一份把「每天放學投 20 球」換成五階段運球訓練的計畫，跟一份整理過的
  // 計畫長得一模一樣 —— 差別只在下一步是誰想的。
  if (
    informationSufficiency(input) === 'sufficient'
    && plan.nextAction.source === 'ai_suggested'
  ) {
    rejections.add('CHILD_INPUT_OVERWRITTEN');
  }

  // 節奏：孩子選過就一定是 child，而且有節奏欄位的 progression 要原封不動。
  if (input.cadence !== null) {
    if (provenance.fields.cadence !== 'child') rejections.add('CHILD_INPUT_OVERWRITTEN');
    if (
      (plan.progressionKind === 'rhythm' || plan.progressionKind === 'outcome_to_action')
      && !cadenceEquals(plan.cadence, input.cadence)
    ) {
      rejections.add('CHILD_INPUT_OVERWRITTEN');
    }
  } else if (
    (plan.progressionKind === 'rhythm' || plan.progressionKind === 'outcome_to_action')
  ) {
    if (plan.cadence === null && provenance.fields.cadence !== 'undecided') {
      rejections.add('SHAPE_INVALID');
    }
    if (
      plan.cadence !== null
      && provenance.fields.cadence !== 'ai_suggested'
      && provenance.fields.cadence !== 'derived'
    ) {
      rejections.add('SHAPE_INVALID');
    }
  }

  // 時段：孩子沒說就必須留白，而且計畫裡不可以冒出一個具體鐘點。
  if (input.preferredTime === null || input.preferredTime.trim().length === 0) {
    if (provenance.fields.preferredTime !== 'undecided') {
      rejections.add('UNDECIDED_DETAIL_INVENTED');
    }
    if (texts.some(containsClockTime)) rejections.add('UNDECIDED_DETAIL_INVENTED');
  } else if (provenance.fields.preferredTime !== 'child') {
    rejections.add('CHILD_INPUT_OVERWRITTEN');
  }

  // 心理狀態推測：所有 AI 寫的自由文字都掃一次。
  if (texts.some(containsMentalStateDiagnosis)) rejections.add('MENTAL_STATE_DIAGNOSIS');
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * 網路回來的 unknown → 結構化結果。
 *
 * 需要 `input` 的理由見檔頭：有幾條產品原則是相對於「孩子講過什麼」
 * 才判斷得出來的。
 */
export function validateChildGoalPlanningResult(
  value: unknown,
  input: ChildGoalPlanningInput,
): ChildGoalPlanningResult {
  if (!isRecord(value)) return childGoalPlanningUnavailable('INVALID_RESPONSE');

  if (value.schemaVersion !== CHILD_GOAL_PLANNING_SCHEMA_VERSION) {
    return childGoalPlanningUnavailable('INVALID_RESPONSE');
  }

  if (value.status === 'unavailable') {
    return childGoalPlanningUnavailable(
      typeof value.reason === 'string' && UNAVAILABLE_REASONS.includes(value.reason)
        ? (value.reason as ChildGoalPlanningUnavailableReason)
        : 'INVALID_RESPONSE',
    );
  }

  if (value.status === 'needs_clarification') {
    return validateClarification(value, input);
  }

  if (value.status !== 'ready') return childGoalPlanningUnavailable('INVALID_RESPONSE');

  const rejections = new Rejections();

  if (!isRecord(value.plan)) {
    return childGoalPlanningUnavailable('INVALID_RESPONSE', ['SHAPE_INVALID']);
  }
  const raw = value.plan;

  if (
    typeof raw.progressionKind !== 'string'
    || !(CHILD_PLAN_PROGRESSION_KINDS as readonly string[]).includes(raw.progressionKind)
  ) {
    return childGoalPlanningUnavailable('INVALID_RESPONSE', ['SHAPE_INVALID']);
  }
  const kind = raw.progressionKind as ChildPlanProgressionKind;

  const coreParts = validateCore(raw, rejections);
  if (coreParts === null) {
    return childGoalPlanningUnavailable('INVALID_RESPONSE', rejections.list);
  }

  const variant = validateVariant(kind, raw, coreParts.core, rejections);
  if (variant === null) {
    return childGoalPlanningUnavailable('INVALID_RESPONSE', rejections.list);
  }

  checkAgainstChildInput(
    variant.plan,
    input,
    [...coreParts.texts, ...variant.texts],
    rejections,
  );

  if (rejections.any) {
    // 形狀對但原則不對 → 是模型這一次寫錯了，不是契約漂移。
    return childGoalPlanningUnavailable(
      rejections.shapeOnly ? 'INVALID_RESPONSE' : 'INVALID_AI_OUTPUT',
      rejections.list,
    );
  }

  return {
    status: 'ready',
    schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
    plan: variant.plan,
  };
}

function validateClarification(
  value: Record<string, unknown>,
  input: ChildGoalPlanningInput,
): ChildGoalPlanningResult {
  const knownGoal = nonEmptyString(value.knownGoal, L.maxGoalLength);
  const model = nonEmptyString(value.model, L.maxModelLength);
  if (knownGoal === null || model === null || !isRecord(value.question)) {
    return childGoalPlanningUnavailable('INVALID_RESPONSE', ['SHAPE_INVALID']);
  }

  const kind = value.question.kind;
  const text = nonEmptyString(value.question.text, L.maxQuestionLength);
  if (
    typeof kind !== 'string'
    || !(CHILD_PLAN_CLARIFICATION_KINDS as readonly string[]).includes(kind)
    || text === null
  ) {
    return childGoalPlanningUnavailable('INVALID_RESPONSE', ['SHAPE_INVALID']);
  }

  // 澄清也不可以夾帶心理推測（「你好像有點沒興趣，還想做嗎？」）。
  if (containsMentalStateDiagnosis(text)) {
    return childGoalPlanningUnavailable('INVALID_AI_OUTPUT', ['MENTAL_STATE_DIAGNOSIS']);
  }

  // 孩子的目標不可以在問問題的時候被改寫。
  if (knownGoal !== input.childOriginalGoal.trim()) {
    return childGoalPlanningUnavailable('INVALID_AI_OUTPUT', ['CHILD_INPUT_OVERWRITTEN']);
  }

  // Minimal Question Principle：孩子已經講夠了還在問，就是多嘴。
  if (informationSufficiency(input) === 'sufficient') {
    return childGoalPlanningUnavailable('INVALID_AI_OUTPUT', ['UNNECESSARY_CLARIFICATION']);
  }

  return {
    status: 'needs_clarification',
    schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
    knownGoal,
    question: { kind: kind as ChildPlanClarificationKind, text },
    model,
  };
}
