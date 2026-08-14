// GrowBook — ChildProposal → planning request 的 adapter（P1-A2）
//
// ─────────────────────────────────────────────────────────────────────────
// 這個檔案存在，是為了讓 childPlanning **不認識** ChildProposal。
//
// P1-A1 刻意把 buildChildGoalPlanningInput 做成「吃一個明確的請求」，
// 並留下一句「之後寫 adapter 即可」。這就是那支 adapter，而且它只住在
// 畫面這一層 —— 兩個 lib 因此都不知道對方存在：
//
//   childPlanning   不知道有 proposal 這種東西
//   childProposal   不知道有 planning 這種東西
//
// 之後換付費 API、或 planning 改接別的來源（例如家長端也能規劃），
// 要改的只有這一個檔案。
//
// ⚠️ 這裡只做**搬運與翻譯**，不做決定：
//    · 不補預設值（孩子沒選的節奏就是 null）
//    · 不改寫原話
//    · 不把對話中的答案塞回四個內容欄位
// ─────────────────────────────────────────────────────────────────────────

import type { ChildGoalPlanningRequest } from '../../../lib/childPlanning';
import type {
  ChildPlanCadence,
  ChildPlanningResponse,
  ChildPlanningSupportPreference,
} from '../../../lib/childPlanning';
import type { ChildProposal, ChildProposalCadenceMode } from '../../../lib/childProposal/types';

/**
 * 提案的節奏 → planning 的節奏。
 *
 * `plan_schedule` 回 null 而不是硬翻成別的模式：那個模式是「照計畫表」，
 * planning 這一層沒有對應的概念，翻錯的話孩子會看到一個他沒選過的節奏。
 */
export function toPlanningCadence(
  mode: ChildProposalCadenceMode | null,
  weeklyFrequency: number | null,
  days: number[] | null,
): ChildPlanCadence | null {
  if (mode === 'one_time') return { mode: 'one_time' };

  if (mode === 'weekly_frequency') {
    return typeof weeklyFrequency === 'number'
      ? { mode: 'weekly_frequency', weeklyFrequency }
      : null;
  }

  if (mode === 'fixed_days') {
    return Array.isArray(days) && days.length > 0
      ? { mode: 'fixed_days', days: [...days].sort((a, b) => a - b) }
      : null;
  }

  return null;
}

export type PlanningRequestContext = {
  ageGroup: string;
  /** 孩子在開場那一頁選的支援強度。沒選就是 null。 */
  planningSupportPreference: ChildPlanningSupportPreference | null;
  /** 孩子在開場那一頁自己打的做法。**不是**對話裡的答案。 */
  childApproach: string | null;
  /** 這場對話到目前為止孩子回過的話。 */
  responses: readonly ChildPlanningResponse[];
};

/**
 * 把一筆真實的 proposal 列 ＋ 這場對話的狀態，組成 planning 的請求。
 *
 * 讀的是**資料庫那一列**，不是畫面上的草稿：提案一旦建立，畫面上的
 * 那份就不再是權威（與 P0-3 的 generatePlanDraft 同一個理由）。
 */
export function toPlanningRequest(
  proposal: ChildProposal,
  context: PlanningRequestContext,
): ChildGoalPlanningRequest {
  return {
    ageGroup: context.ageGroup,
    // 原話逐字帶過去。這一層一個字都不動它。
    childOriginalGoal: proposal.child_original_goal,
    childOriginalMotivation: proposal.child_original_motivation,
    childApproach: context.childApproach,
    cadence: toPlanningCadence(
      proposal.cadence_mode,
      proposal.cadence_weekly_frequency,
      proposal.cadence_days,
    ),
    // preferred_time_custom 優先：那是孩子自己打的字，
    // preferred_time 是他從固定選項裡挑的。
    preferredTime: proposal.preferred_time_custom ?? proposal.preferred_time,
    planningSupportPreference: context.planningSupportPreference,
    responses: context.responses,
  };
}
