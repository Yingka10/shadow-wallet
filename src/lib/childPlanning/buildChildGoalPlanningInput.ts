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
  CHILD_PLAN_CLARIFICATION_KINDS,
  type ChildGoalPlanningInput,
  type ChildPlanAgeGroup,
  type ChildPlanCadence,
  type ChildPlanningResponse,
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
  /** 孩子在第一頁自己想到的做法。**不要把它塞進 goal**，也不要塞對話中的答案。 */
  childApproach?: string | null;
  cadence?: ChildPlanCadence | null;
  preferredTime?: string | null;
  planningSupportPreference?: string | null;
  /** 這場對話到目前為止孩子回過的話。第一輪不給或給空陣列。 */
  responses?: readonly ChildPlanningResponse[] | null;
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
 * 對話紀錄的正規化。
 *
 * ⚠️ 壞掉的元素**不是丟掉，是整份失敗**（回 undefined）。
 *
 * 其他欄位形狀不對時當成「孩子沒選」是對的 —— 那代表資訊缺一塊。
 * 但這裡缺的那一塊是**孩子已經回答過的話**：默默丟掉一則答案，模型會
 * 拿到一份看起來完整、實際上少一句的對話，然後很合理地把同一題再問一次。
 * 孩子會覺得自己剛剛講的話沒有人在聽。
 *
 * 這些元素是我們自己的畫面組出來的，壞掉代表是程式錯誤 ——
 * 那一輪不該花錢打模型。
 */
function normalizeResponses(
  responses: readonly ChildPlanningResponse[] | null | undefined,
): ChildPlanningResponse[] | undefined {
  if (responses === null || responses === undefined) return [];
  if (!Array.isArray(responses)) return undefined;
  if (responses.length > CHILD_GOAL_PLANNING_LIMITS.maxResponses) return undefined;

  const L = CHILD_GOAL_PLANNING_LIMITS;
  const normalized: ChildPlanningResponse[] = [];

  for (const response of responses) {
    if (response === null || typeof response !== 'object') return undefined;

    if (response.type === 'clarification_answer') {
      const question = trimmedOrNull(response.question, L.maxQuestionLength);
      const answer = trimmedOrNull(response.answer, L.maxAnswerLength);
      if (question === null || answer === null) return undefined;
      if (!CHILD_PLAN_CLARIFICATION_KINDS.includes(response.questionKind)) return undefined;
      normalized.push({
        type: 'clarification_answer',
        questionKind: response.questionKind,
        question,
        answer,
      });
      continue;
    }

    if (response.type === 'choice_selection') {
      const optionId = trimmedOrNull(response.optionId, L.maxOptionIdLength);
      const optionText = trimmedOrNull(response.optionText, L.maxOptionLength);
      if (optionId === null || optionText === null) return undefined;
      normalized.push({ type: 'choice_selection', optionId, optionText });
      continue;
    }

    if (response.type === 'custom_choice') {
      const answer = trimmedOrNull(response.answer, L.maxAnswerLength);
      if (answer === null) return undefined;
      normalized.push({ type: 'custom_choice', answer });
      continue;
    }

    return undefined;
  }

  return normalized;
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

  const responses = normalizeResponses(request.responses);
  if (responses === undefined) return null;

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
    responses,
  };
}
