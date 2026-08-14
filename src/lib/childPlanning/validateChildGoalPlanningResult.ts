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
//
// 這支需要 input 才驗得完：「該不該再問一題」「孩子講過的節奏有沒有被
// 換掉」「時段是不是憑空冒出來的」都是相對於孩子講過什麼才成立的判斷。
// ─────────────────────────────────────────────────────────────────────────

import {
  cadenceEquals,
  checkPlanActionText,
  childVocabulary,
  containsClockTime,
  containsDomainAuthorityClaim,
  containsMentalStateDiagnosis,
  evidenceSatisfies,
  informationSufficiency,
} from './planGuards';
import {
  CHILD_GOAL_PLANNING_LIMITS,
  CHILD_GOAL_PLANNING_SCHEMA_VERSION,
  CHILD_PLANNING_CONTRIBUTIONS,
  CHILD_PLAN_CLARIFICATION_KINDS,
  CHILD_PLAN_FIELD_SOURCES,
  CHILD_PLAN_GOAL_CONTROL_TYPES,
  CHILD_PLAN_PROGRESSION_KINDS,
  effectiveChildApproach,
  isChildOwned,
  type ChildGoalPlan,
  type ChildGoalPlanControl,
  type ChildGoalPlanCore,
  type ChildGoalPlanProgression,
  type ChildGoalPlanningInput,
  type ChildGoalPlanningResult,
  type ChildGoalPlanningUnavailableReason,
  type ChildPlanCadence,
  type ChildPlanClarificationKind,
  type ChildPlanFieldSource,
  type ChildPlanGoalControlType,
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

const PROVENANCE_KEYS = [
  'approach',
  'cadence',
  'sessionSize',
  'preferredTime',
  'nextAction',
  'reviewPoint',
  'phases',
  'target',
  'controllableActions',
] as const;

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

  // 孩子挑走的選項。null 合法（他沒挑過）；有值就必須是完整的一組，
  // 只有 id 或只有文字都不行 —— 半組資料會讓「他挑了什麼」變成猜的。
  const rawChosen = value.childChosenOption;
  let childChosenOption: ChildPlanProvenance['childChosenOption'] = null;
  if (rawChosen !== null && rawChosen !== undefined) {
    if (!isRecord(rawChosen)) return null;
    const id = nonEmptyString(rawChosen.id, L.maxOptionIdLength);
    const text = nonEmptyString(rawChosen.text, L.maxOptionLength);
    if (id === null || text === null) return null;
    childChosenOption = { id, text };
  }

  const fields = {} as ChildPlanProvenance['fields'];
  for (const key of PROVENANCE_KEYS) {
    const source = validFieldSource(value.fields[key]);
    if (source === null) return null;
    fields[key] = source;
  }

  return { childOriginalGoal, childStatedApproach, childChosenOption, fields };
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

function validOptions(value: unknown): ChildPlanStartOption[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length < L.minChoiceOptions || value.length > L.maxChoiceOptions) return null;

  const options: ChildPlanStartOption[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) return null;
    const id = nonEmptyString(item.id, L.maxPhaseIdLength);
    const text = nonEmptyString(item.text, L.maxOptionLength);
    if (id === null || text === null) return null;
    if (seen.has(id)) return null;
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
    || (nextActionSource !== 'child_stated'
      && nextActionSource !== 'derived_from_child'
      && nextActionSource !== 'ai_suggested')
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

  // nextAction 的來源在兩個地方各講一次，講不一樣就是回應本身矛盾。
  if (provenance.fields.nextAction !== nextActionSource) {
    rejections.add('SHAPE_INVALID');
    return null;
  }

  // 下一步走既有的 validateNextStep。過不了就整份不放行——
  // 這是「不可以把成果當成行動」在程式裡的樣子。
  const action = checkPlanActionText(nextActionText);
  if (!action.ok) {
    rejections.add(action.reason === 'domain_authority' ? 'DOMAIN_AUTHORITY_CLAIM' : 'NEXT_ACTION_INVALID');
  }

  return {
    core: {
      desiredOutcome,
      actionPlanSummary,
      currentFocus,
      nextAction: { text: nextActionText, source: nextActionSource },
      reviewPoint,
      planningContribution,
      provenance,
      model,
    },
    texts: [desiredOutcome, actionPlanSummary, currentFocus, nextActionText],
  };
}

/**
 * 成果控制得了嗎。
 *
 * external_outcome 的每一條可控行動都要通過與下一步同一套驗證：
 * 「拿第一名」不是孩子控制得了的行動，寫在這裡等於把成果偽裝成計畫。
 */
function validateControl(
  raw: Record<string, unknown>,
  rejections: Rejections,
): { control: ChildGoalPlanControl; texts: string[] } | null {
  if (
    typeof raw.goalControlType !== 'string'
    || !(CHILD_PLAN_GOAL_CONTROL_TYPES as readonly string[]).includes(raw.goalControlType)
  ) {
    rejections.add('SHAPE_INVALID');
    return null;
  }
  const goalControlType = raw.goalControlType as ChildPlanGoalControlType;

  if (goalControlType === 'directly_actionable') {
    // 控制得了的目標不該有「可控行動」這個欄位 —— 整份計畫就是可控行動。
    if (raw.controllableActions !== null && raw.controllableActions !== undefined) {
      rejections.add('SHAPE_INVALID');
      return null;
    }
    return { control: { goalControlType }, texts: [] };
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
    const check = checkPlanActionText(text);
    if (!check.ok) {
      rejections.add(
        check.reason === 'domain_authority' ? 'DOMAIN_AUTHORITY_CLAIM' : 'OUTCOME_USED_AS_ACTION',
      );
    }
    controllableActions.push(text);
  }

  return {
    control: { goalControlType, controllableActions },
    texts: controllableActions,
  };
}

/** progression 專屬的欄位。回 null 代表形狀不對。 */
function validateProgression(
  raw: Record<string, unknown>,
  core: ChildGoalPlanCore,
  rejections: Rejections,
): { progression: ChildGoalPlanProgression; texts: string[] } | null {
  if (
    typeof raw.progressionKind !== 'string'
    || !(CHILD_PLAN_PROGRESSION_KINDS as readonly string[]).includes(raw.progressionKind)
  ) {
    rejections.add('SHAPE_INVALID');
    return null;
  }
  const kind = raw.progressionKind as ChildPlanProgressionKind;

  if (kind !== 'staged' && core.reviewPoint?.type === 'after_phase') {
    // 沒有 phase 的 progression 指向一個不存在的階段。
    rejections.add('SHAPE_INVALID');
    return null;
  }

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

    return {
      progression: { progressionKind: 'rhythm', cadence, sessionSize, trialPeriod },
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
      progression: { progressionKind: 'staged', phases },
      texts: phases.flatMap((phase) => [phase.title, phase.observableDoneWhen]),
    };
  }

  // accumulation
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

  return {
    progression: { progressionKind: 'accumulation', targetValue, targetUnit, currentValue },
    texts: [targetUnit],
  };
}

/**
 * provenance 的內部一致性 —— 不需要 input 就看得出來的部分。
 *
 * 一個欄位不存在，它的來源就只能是 undecided。反過來也一樣：
 * 說得出來源，那個欄位就得真的在。兩者對不上代表這份 provenance
 * 是拼出來的，而不是真的在記錄誰決定了什麼。
 */
function checkProvenanceShape(plan: ChildGoalPlan, rejections: Rejections): void {
  const { fields } = plan.provenance;

  const expectUndecided = (key: keyof ChildPlanProvenance['fields'], present: boolean) => {
    if (!present && fields[key] !== 'undecided') rejections.add('SHAPE_INVALID');
    if (present && fields[key] === 'undecided') rejections.add('SHAPE_INVALID');
  };

  expectUndecided('phases', plan.progressionKind === 'staged');
  expectUndecided('target', plan.progressionKind === 'accumulation');
  expectUndecided('controllableActions', plan.goalControlType === 'external_outcome');
  expectUndecided(
    'sessionSize',
    plan.progressionKind === 'rhythm' && plan.sessionSize !== null,
  );
  expectUndecided('reviewPoint', plan.reviewPoint !== null);

  // 節奏是唯一的例外：只有 rhythm 的計畫帶得動它，但孩子講過的節奏仍然
  // 要留下記錄（staged 的目標孩子一樣可以說「我想一週三次」）。
  // 所以非 rhythm 時只允許 undecided 或 child_stated —— AI 不可以替一個
  // 沒有節奏欄位的計畫「建議」一個節奏，那個建議沒有地方放。
  if (plan.progressionKind === 'rhythm') {
    expectUndecided('cadence', plan.cadence !== null);
  } else if (fields.cadence !== 'undecided' && fields.cadence !== 'child_stated') {
    rejections.add('SHAPE_INVALID');
  }
}

/**
 * 與孩子講過的話對照。
 *
 * 這一段是 Principle A、證據優先序與「不可以偷偷補決定」的執法點，
 * 而且它**只有拿得到 input 才做得到** —— 光看回應本身，一個被換掉的
 * 方法看起來跟一個被整理過的方法一模一樣。
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

  // 孩子目前的方法：第一頁打的字，或對話裡他挑／打的最後一個。
  const chosen = effectiveChildApproach(input);
  const inputApproach = chosen.text;

  // 他自己打的字必須逐字保留；他沒打過就必須是 null ——
  // 把 AI 選項的文字寫進這一欄，等於在資料裡宣稱那句話是孩子講的。
  const typedApproach = chosen.origin === 'child_typed' ? chosen.text : null;
  if (provenance.childStatedApproach !== typedApproach) {
    rejections.add('CHILD_INPUT_OVERWRITTEN');
  }

  // 他挑走的選項，逐字 ＋ id 都要對得上。
  if (chosen.origin === 'child_chose_option') {
    if (
      provenance.childChosenOption === null
      || provenance.childChosenOption.id !== chosen.optionId
      || provenance.childChosenOption.text !== chosen.text
    ) {
      rejections.add('CHILD_INPUT_OVERWRITTEN');
    }
  } else if (provenance.childChosenOption !== null) {
    // 沒挑過卻記了一個選擇 —— 那是一個沒有發生過的決定。
    rejections.add('CHILD_INPUT_OVERWRITTEN');
  }

  // 方法的來源由**對話紀錄**決定，不由模型自陳。
  //
  //   他自己打的     → child_stated
  //   他挑了選項     → derived_from_child（AI 的文字 ＋ 他的決定）
  //   還沒決定       → undecided
  //
  // 這一條同時是 §12 那句「不能重新標回 ai_suggested」的執法點：
  // approach 這個欄位在任何情況下都不允許是 ai_suggested。
  const expectedApproachSource =
    chosen.origin === 'child_typed'
      ? 'child_stated'
      : chosen.origin === 'child_chose_option'
        ? 'derived_from_child'
        : 'undecided';
  if (provenance.fields.approach !== expectedApproachSource) {
    rejections.add('CHILD_INPUT_OVERWRITTEN');
  }

  // 「孩子挑了一個選項」與對話紀錄必須完全一致，兩個方向都要成立：
  // 沒挑過卻標了，是憑空多出一個決定；挑過卻沒標，是把他的決定抹掉。
  const contributionSaysChose = plan.planningContribution === 'child_chose_option';
  if (contributionSaysChose !== (chosen.origin === 'child_chose_option')) {
    rejections.add('CHILD_INPUT_OVERWRITTEN');
  }

  // 孩子連節奏帶方法都講了，下一步就不可能是 AI 想出來的。
  //
  // 這條是「不得直接覆寫成另一套訓練」唯一驗得出來的形式：光看回應本身，
  // 一份把「老師叫我先練右手旋律」換成模型自己那套鋼琴課程的計畫，
  // 跟一份整理過的計畫長得一模一樣 —— 差別只在下一步是誰想的。
  if (
    informationSufficiency(input) === 'sufficient'
    && !isChildOwned(provenance.fields.nextAction)
  ) {
    rejections.add('CHILD_INPUT_OVERWRITTEN');
  }

  // 孩子已經有一套方法時，階段只能是那套方法的整理，不是模型另造的課程。
  // GrowBook 的 phases 是 provisional route，不是 authoritative curriculum。
  if (
    inputApproach !== null
    && plan.progressionKind === 'staged'
    && !isChildOwned(provenance.fields.phases)
  ) {
    rejections.add('CHILD_INPUT_OVERWRITTEN');
  }

  // 節奏：孩子選過就一定是 child_stated，而且 rhythm 要原封不動。
  if (input.cadence !== null) {
    if (!evidenceSatisfies(provenance.fields.cadence, 'child_stated')) {
      rejections.add('CHILD_INPUT_OVERWRITTEN');
    }
    if (plan.progressionKind === 'rhythm' && !cadenceEquals(plan.cadence, input.cadence)) {
      rejections.add('CHILD_INPUT_OVERWRITTEN');
    }
  } else if (plan.progressionKind === 'rhythm' && plan.cadence !== null) {
    // 孩子沒選、卻標成他講的 —— 那是把 AI 的建議掛到孩子頭上。
    if (isChildOwned(provenance.fields.cadence)) rejections.add('CHILD_INPUT_OVERWRITTEN');
  }

  // 時段：孩子沒說就必須留白，而且計畫裡不可以冒出一個具體鐘點。
  if (input.preferredTime === null || input.preferredTime.trim().length === 0) {
    if (provenance.fields.preferredTime !== 'undecided') {
      rejections.add('UNDECIDED_DETAIL_INVENTED');
    }
    if (texts.some(containsClockTime)) rejections.add('UNDECIDED_DETAIL_INVENTED');
  } else if (!evidenceSatisfies(provenance.fields.preferredTime, 'child_stated')) {
    rejections.add('CHILD_INPUT_OVERWRITTEN');
  }

  // 心理狀態推測與領域權威宣稱：所有 AI 寫的敘述都掃一次，但**孩子自己
  // 用過的字眼不算**——那是保留他的話，不是模型在診斷或冒充專家。
  // （硬性 guard 不吃這個放寬：下一步／可控行動走完整的 checkPlanActionText，
  //   階段完成條件一律不准是心理狀態。兩者都在上面各自判斷過了。）
  const vocabulary = childVocabulary(input);
  if (texts.some((value) => containsMentalStateDiagnosis(value, vocabulary.mentalState))) {
    rejections.add('MENTAL_STATE_DIAGNOSIS');
  }
  if (texts.some((value) => containsDomainAuthorityClaim(value, vocabulary.domainAuthority))) {
    rejections.add('DOMAIN_AUTHORITY_CLAIM');
  }
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

  if (value.status === 'needs_clarification') return validateClarification(value, input);
  if (value.status === 'needs_choice') return validateChoice(value, input);

  if (value.status !== 'ready') return childGoalPlanningUnavailable('INVALID_RESPONSE');

  const rejections = new Rejections();

  if (!isRecord(value.plan)) {
    return childGoalPlanningUnavailable('INVALID_RESPONSE', ['SHAPE_INVALID']);
  }
  const raw = value.plan;

  const coreParts = validateCore(raw, rejections);
  if (coreParts === null) {
    return childGoalPlanningUnavailable('INVALID_RESPONSE', rejections.list);
  }

  const control = validateControl(raw, rejections);
  if (control === null) {
    return childGoalPlanningUnavailable('INVALID_RESPONSE', rejections.list);
  }

  const progression = validateProgression(raw, coreParts.core, rejections);
  if (progression === null) {
    return childGoalPlanningUnavailable('INVALID_RESPONSE', rejections.list);
  }

  const plan: ChildGoalPlan = {
    ...coreParts.core,
    ...control.control,
    ...progression.progression,
  };

  checkProvenanceShape(plan, rejections);
  checkAgainstChildInput(
    plan,
    input,
    [...coreParts.texts, ...control.texts, ...progression.texts],
    rejections,
  );

  if (rejections.any) {
    // 形狀對但原則不對 → 是模型這一次寫錯了，不是契約漂移。
    return childGoalPlanningUnavailable(
      rejections.shapeOnly ? 'INVALID_RESPONSE' : 'INVALID_AI_OUTPUT',
      rejections.list,
    );
  }

  return { status: 'ready', schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION, plan };
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

  const rejections = new Rejections();
  checkConversationText([text], knownGoal, input, rejections);

  // 同一種問題不准問第二次。
  //
  // 這是多輪對話才會出現的失敗，也是孩子最快放棄的一種：他已經回答過
  // 「你最想在哪件事變厲害？」，下一輪又被問一次同樣的事，那等於在說
  // 他剛剛打的字沒有人在讀。歷史就在 responses 裡，這一條驗得出來。
  const answeredKinds = (Array.isArray(input.responses) ? input.responses : [])
    .filter((response) => response.type === 'clarification_answer')
    .map((response) => (response as { questionKind: ChildPlanClarificationKind }).questionKind);
  if (answeredKinds.includes(kind as ChildPlanClarificationKind)) {
    rejections.add('UNNECESSARY_CLARIFICATION');
  }

  if (rejections.any) {
    return childGoalPlanningUnavailable('INVALID_AI_OUTPUT', rejections.list);
  }

  return {
    status: 'needs_clarification',
    schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
    knownGoal,
    question: { kind: kind as ChildPlanClarificationKind, text },
    model,
  };
}

/**
 * 「目標清楚了，但還沒決定怎麼做」。
 *
 * 與 clarification 的差別不是語氣，是產品狀態：這裡不再需要孩子解釋
 * 他想幹嘛，只需要他決定從哪裡開始。而**決定權在他** ——
 * allowCustomAnswer 是字面量 true，回傳別的值就是壞掉的回應。
 */
function validateChoice(
  value: Record<string, unknown>,
  input: ChildGoalPlanningInput,
): ChildGoalPlanningResult {
  const knownGoal = nonEmptyString(value.knownGoal, L.maxGoalLength);
  const model = nonEmptyString(value.model, L.maxModelLength);
  const question = nonEmptyString(value.question, L.maxChoiceQuestionLength);
  const options = validOptions(value.options);
  if (knownGoal === null || model === null || question === null || options === null) {
    return childGoalPlanningUnavailable('INVALID_RESPONSE', ['SHAPE_INVALID']);
  }

  // 孩子永遠可以自己想。這不是一個可以被關掉的旗標。
  if (value.allowCustomAnswer !== true) {
    return childGoalPlanningUnavailable('INVALID_RESPONSE', ['SHAPE_INVALID']);
  }

  const rejections = new Rejections();
  checkConversationText(
    [question, ...options.map((option) => option.text)],
    knownGoal,
    input,
    rejections,
  );

  // 孩子已經有方法了還在給他選項 —— 那就是把他的方法換掉的前一步。
  // 「已經有方法」包含他上一輪剛挑走的那個選項：再給一次選項，
  // 孩子看到的是自己剛剛那一下完全沒有算數。
  if (effectiveChildApproach(input).text !== null) {
    rejections.add('CHILD_INPUT_OVERWRITTEN');
  }

  if (rejections.any) {
    return childGoalPlanningUnavailable('INVALID_AI_OUTPUT', rejections.list);
  }

  return {
    status: 'needs_choice',
    schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
    knownGoal,
    question,
    options,
    allowCustomAnswer: true,
    model,
  };
}

/**
 * 兩種「還在對話」的狀態共用的檢查。
 *
 * 問題與選項一樣不可以夾帶心理推測或領域權威，孩子的目標一樣不可以
 * 被改寫，而資訊已經足夠時**兩種都算多嘴** —— 給選項也是在耽誤他。
 */
function checkConversationText(
  texts: string[],
  knownGoal: string,
  input: ChildGoalPlanningInput,
  rejections: Rejections,
): void {
  // 孩子自己用過的字眼不算 —— 「你想找到最有效的讀書方法，對嗎？」
  // 是在確認他講的東西，不是在冒充專家。
  const vocabulary = childVocabulary(input);
  if (texts.some((value) => containsMentalStateDiagnosis(value, vocabulary.mentalState))) {
    rejections.add('MENTAL_STATE_DIAGNOSIS');
  }
  if (texts.some((value) => containsDomainAuthorityClaim(value, vocabulary.domainAuthority))) {
    rejections.add('DOMAIN_AUTHORITY_CLAIM');
  }
  if (knownGoal !== input.childOriginalGoal.trim()) rejections.add('CHILD_INPUT_OVERWRITTEN');
  if (informationSufficiency(input) === 'sufficient') {
    rejections.add('UNNECESSARY_CLARIFICATION');
  }
}
