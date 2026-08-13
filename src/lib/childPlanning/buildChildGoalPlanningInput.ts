// GrowBook — 組出送進 AI 的 planning input（P1-A1）
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支刻意**不吃 ChildProposal**。
//
// P1-A1 的邊界是「先把契約釘住」，還沒有接上正式的 Child Proposal 流程；
// 讓這一層直接讀提案列，等於在 contract 還沒驗證完之前就先長出一條
// 依賴，之後要改語意會連帶動到 P0 的資料流。
//
// 所以它吃的是一個**明確的請求**：孩子講了什麼、他自己想到了什麼。
// 之後真的要接上提案時，寫一支 adapter 把 ChildProposal 轉成這個形狀就好，
// 這個模組不用改。
//
// 送出去的一樣只有實質內容 —— 沒有 childId、familyId、暱稱或生日。
// 年齡只送分級，與 P0-3 同一個理由：模型判斷用不到身分，
// 少送一個欄位就少一個外流面。
// ─────────────────────────────────────────────────────────────────────────

import {
  CHILD_GOAL_PLANNING_LIMITS,
  CHILD_GOAL_PLANNING_SCHEMA_VERSION,
  type ChildGoalPlanningInput,
  type ChildPlanAgeGroup,
  type ChildPlanCadence,
  type ChildPlanningSupportPreference,
} from './types';

const AGE_GROUPS: readonly string[] = ['2-4', '4-6', '6-9', '9-12'];

const SUPPORT_PREFERENCES: readonly string[] = [
  'organize_only',
  'suggest_if_needed',
  'give_me_options',
  'first_step_only',
];

/** 呼叫端手上的東西。全部是孩子講過或選過的，沒有推導。 */
export type ChildGoalPlanningRequest = {
  ageGroup: string;
  childOriginalGoal: string;
  childOriginalMotivation?: string | null;
  /** 孩子自己已經想到的做法。**不要把它塞進 goal**。 */
  childApproach?: string | null;
  cadence?: ChildPlanCadence | null;
  preferredTime?: string | null;
  planningSupportPreference?: string | null;
};

function trimmedOrNull(value: string | null | undefined, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}

/**
 * 節奏的形狀檢查。
 *
 * 形狀不對就當成「孩子沒選」（null），**不修補** —— 一個
 * 「weeklyFrequency 缺了就補 3」的寬容 parser 產出的是一個沒有人
 * 決定過的數字，而它之後會被標成 provenance = 'child'。
 */
function normalizeCadence(cadence: ChildPlanCadence | null | undefined): ChildPlanCadence | null {
  if (cadence === null || cadence === undefined) return null;

  if (cadence.mode === 'one_time') return { mode: 'one_time' };

  if (cadence.mode === 'weekly_frequency') {
    const times = cadence.weeklyFrequency;
    if (
      typeof times !== 'number'
      || !Number.isInteger(times)
      || times < 1
      || times > CHILD_GOAL_PLANNING_LIMITS.maxWeeklyFrequency
    ) {
      return null;
    }
    return { mode: 'weekly_frequency', weeklyFrequency: times };
  }

  if (cadence.mode === 'fixed_days') {
    const days = cadence.days;
    if (!Array.isArray(days) || days.length === 0) return null;
    const normalized: number[] = [];
    for (const day of days) {
      if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6) return null;
      if (!normalized.includes(day)) normalized.push(day);
    }
    return { mode: 'fixed_days', days: normalized.sort((a, b) => a - b) };
  }

  return null;
}

/**
 * 組出 input，或 null（= 這一輪根本不該呼叫模型）。
 *
 * 沒有目標或沒有年齡段就是 null：那一輪一定產不出可用的計畫，
 * 而呼叫一次模型要花錢也要花時間。
 */
export function buildChildGoalPlanningInput(
  request: ChildGoalPlanningRequest,
): ChildGoalPlanningInput | null {
  const childOriginalGoal = trimmedOrNull(
    request.childOriginalGoal,
    CHILD_GOAL_PLANNING_LIMITS.maxGoalLength,
  );
  if (childOriginalGoal === null) return null;
  if (!AGE_GROUPS.includes(request.ageGroup)) return null;

  const support =
    typeof request.planningSupportPreference === 'string'
    && SUPPORT_PREFERENCES.includes(request.planningSupportPreference)
      ? (request.planningSupportPreference as ChildPlanningSupportPreference)
      : null;

  return {
    schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
    ageGroup: request.ageGroup as ChildPlanAgeGroup,
    childOriginalGoal,
    childOriginalMotivation: trimmedOrNull(
      request.childOriginalMotivation,
      CHILD_GOAL_PLANNING_LIMITS.maxMotivationLength,
    ),
    childApproach: trimmedOrNull(
      request.childApproach,
      CHILD_GOAL_PLANNING_LIMITS.maxApproachLength,
    ),
    cadence: normalizeCadence(request.cadence),
    preferredTime: trimmedOrNull(
      request.preferredTime,
      CHILD_GOAL_PLANNING_LIMITS.maxPreferredTimeLength,
    ),
    planningSupportPreference: support,
  };
}
