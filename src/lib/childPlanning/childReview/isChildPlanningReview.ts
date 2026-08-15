// GrowBook — 這張卡片是不是 P1 的共同條件回覆（P1-A4B2 §3 / §23）
//
// ─────────────────────────────────────────────────────────────────────────
// 孩子端的 P1 畫面說的是：
//
//     你的做法沒有被改掉，爸媽只是對要一起配合的條件提出了安排。
//
// 對一份 P0 的家長調整版來說，那句話**不成立** —— 那條路徑的家長本來
// 就可以改完成標準。所以判準是 lineage：沿 adopted_from 走得回一份
// 孩子自己規劃過的計畫，才算 P1。
//
// App 端只看得到 current 與它的直接來源，所以這裡是一層近似；
// **整條 chain 由 RPC 走**（NOT_CHILD_PLANNING_LINEAGE）。
// ─────────────────────────────────────────────────────────────────────────

import type {
  ChildProposalPlanVersion,
  ChildProposalReviewData,
} from '../../childProposal/types';
import type { ChildPlanningReviewability } from './types';

/**
 * 還沒說定的事，翻成孩子看得懂的話。
 *
 * ⚠️ purpose_category 不在這裡，而且**不應該**在這裡：那是 GrowBook 自己
 *    要判定的分類，翻成「任務分類還沒選」問孩子等於請他當分類器。
 *    真的出現就是上游漏了，RPC 會回 SYSTEM_ENRICHMENT_REQUIRED。
 */
const CHILD_PENDING_COPY: Record<string, string> = {
  cadence: '一週怎麼安排',
  session_size: '每次大約多久',
  duration: '這次先試多久',
  reward: '完成後怎麼回饋',
};

export function childPendingLabels(pending: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(pending)) return [];
  return pending
    .map((term) => CHILD_PENDING_COPY[term])
    .filter((copy): copy is string => typeof copy === 'string');
}

/** 未決集合裡有沒有系統自己該處理的事。 */
export function hasSystemUnresolved(plan: ChildProposalPlanVersion | null): boolean {
  const pending = plan?.requires_parent_decision;
  if (!Array.isArray(pending)) return false;
  return pending.some((term) => CHILD_PENDING_COPY[term] === undefined);
}

/**
 * 這一版是不是 P1 的家長共同條件草案。
 *
 * ⚠️ 只看 authorship 與 lineage。內容看起來像什麼都不能決定它走哪一條
 *    畫面 —— P0 的調整版有時候長得跟 P1 的草案幾乎一樣。
 */
export function isChildPlanningReviewVersion(
  current: ChildProposalPlanVersion | null,
  source: ChildProposalPlanVersion | null,
): boolean {
  if (!current || current.authored_by !== 'parent') return false;
  if (current.requires_child_review !== true) return false;
  if (typeof current.adopted_from_plan_version_id !== 'string') return false;
  if (!source || source.id !== current.adopted_from_plan_version_id) return false;

  // 來源本身就是孩子那一版（第一輪），或是上一份也帶著 adoption 的草案
  // （第二輪以後）。後者的完整驗證只有 RPC 做得到。
  if (source.authored_by === 'child') {
    return typeof source.source_planning_session_id === 'string'
      && source.child_confirmed_plan !== null
      && source.child_confirmed_plan !== undefined;
  }
  return source.authored_by === 'parent'
    && typeof source.adopted_from_plan_version_id === 'string';
}

export function childPlanningReviewability(
  review: ChildProposalReviewData,
): ChildPlanningReviewability {
  const { proposal, currentPlanVersion: current, sourcePlanVersion: source } = review;

  if (!isChildPlanningReviewVersion(current, source)) {
    return { ok: false, block: 'not_child_planning_review' };
  }
  if (proposal.status !== 'needs_child_review'
    || proposal.current_plan_version_id !== current.id
    || current.proposal_id !== proposal.id) {
    return { ok: false, block: 'not_in_review' };
  }
  if (proposal.task_id !== null) {
    return { ok: false, block: 'already_has_task' };
  }
  if (hasSystemUnresolved(current)) {
    return { ok: false, block: 'system_enrichment_required' };
  }

  const pending = childPendingLabels(current.requires_parent_decision);
  // **這一顆「可以」會不會讓任務開始，由資料決定。**
  // 還有事沒說定就不是開始，畫面上也不可以那樣寫。
  return { ok: true, activates: pending.length === 0, pending };
}

/** 給 UI 用的布林。細節要分辨時用 childPlanningReviewability。 */
export function isChildPlanningReview(review: ChildProposalReviewData): boolean {
  return childPlanningReviewability(review).ok;
}
