// GrowBook — 這份 child plan 現在可以直接同意嗎（P1-A4A §3）
//
// ─────────────────────────────────────────────────────────────────────────
// 判斷分成兩層，而且兩層的意思差很多：
//
//   block = not_child_planning_plan   → 這條路徑本來就不該處理它（走 legacy）
//   block = shared_decision_required  → **不是錯誤**，是「還有事要一起決定」
//
// 第二種在 UI 上不可以長得像失敗。孩子把「怎麼做到」想得很清楚，但沒有決定
// 一週幾次 —— 那份計畫本身完全成立，缺的是家庭共同條件，而共同條件本來就
// 不該由孩子一個人或 AI 決定。顯示成「還不能確認」等於責怪他沒想完。
// ─────────────────────────────────────────────────────────────────────────

import type {
  ChildPlanSharedDecision,
  ChildProposalPlanVersion,
  ParentProposalCardData,
} from '../../childProposal/types';
import type { ChildPlanConfirmability } from './types';

function text(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 這一版是不是 P1 的 child planning 版本。
 *
 * ⚠️ **只看 lineage 欄位。** 不看標題、不看 snapshot、不看 model ——
 *    那些是內容，內容看起來像什麼都不能決定它走哪一條確認路徑。
 */
export function isChildPlanningPlanVersion(
  plan: ChildProposalPlanVersion | null,
): boolean {
  if (!plan) return false;
  return plan.authored_by === 'child'
    && typeof plan.source_planning_session_id === 'string'
    && typeof plan.planning_schema_version === 'number'
    && plan.child_confirmed_plan !== null
    && plan.child_confirmed_plan !== undefined;
}

/** 還沒決定的共同條件。非 P1 版本一律空陣列。 */
export function childPlanSharedDecisions(
  plan: ChildProposalPlanVersion | null,
): ChildPlanSharedDecision[] {
  if (!isChildPlanningPlanVersion(plan)) return [];
  const pending = plan?.requires_parent_decision;
  return Array.isArray(pending) ? [...pending] : [];
}

/**
 * 正式任務需要的系統欄位齊不齊。
 *
 * 與既有 isDirectConfirmablePlan 的清單相同 —— 兩條線最後都要走
 * create_parent_task_v1，需要的東西一模一樣。差別在 authorship 與 lineage，
 * 不在這裡。
 */
function systemFieldsComplete(plan: ChildProposalPlanVersion): boolean {
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

export function childPlanConfirmability(
  card: ParentProposalCardData,
): ChildPlanConfirmability {
  const { proposal, currentPlanVersion: plan } = card;

  if (!isChildPlanningPlanVersion(plan)) {
    return { ok: false, block: 'not_child_planning_plan', pending: [] };
  }
  const version = plan as ChildProposalPlanVersion;

  if (proposal.status !== 'proposed'
    || proposal.current_plan_version_id !== version.id
    || version.proposal_id !== proposal.id) {
    return { ok: false, block: 'not_current_proposed', pending: [] };
  }

  // 順序是刻意的：先講「還有事要一起決定」，再講「系統欄位不齊」。
  // 前者是家長看得懂、而且真的要做點什麼的事；後者是 GrowBook 自己的問題。
  const pending = childPlanSharedDecisions(version);
  if (pending.length > 0) {
    return { ok: false, block: 'shared_decision_required', pending };
  }

  if (version.enrichment_status !== 'enriched') {
    return { ok: false, block: 'enrichment_incomplete', pending: [] };
  }

  if (!systemFieldsComplete(version)) {
    // **不自動補值。** 缺 durationDays 就生一個 30 出來，等於家長確認了
    // 一個沒有人提過的期限。
    return { ok: false, block: 'system_fields_incomplete', pending: [] };
  }

  return { ok: true };
}

/** 給 UI 用的布林。細節要分辨時用 childPlanConfirmability。 */
export function isChildPlanDirectConfirmable(card: ParentProposalCardData): boolean {
  return childPlanConfirmability(card).ok;
}
