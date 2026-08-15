// GrowBook — 孩子看過共同條件之後的兩個回覆（P1-A4B2）
//
// ─────────────────────────────────────────────────────────────────────────
// 「可以」與「我想再調整」是兩個完全不同的意思，所以是兩支 RPC，
// 不是一支帶旗標的 updateProposal(status)。
//
// 而「可以」本身又有兩種結果 —— 這是這一包最重要的邊界：
//
//   共同條件都齊了   → 正式成立，任務開始
//   還有事沒說完     → 記下他同意這一輪，回去繼續談，**任務不會開始**
//
// 兩種都是「他說可以」，但只有第一種代表這件事定了。
// ─────────────────────────────────────────────────────────────────────────

import type { ChildProposalConfirmedReward, ChildProposalFailure } from '../../childProposal/types';

export const ACCEPT_CHILD_PLANNING_TERMS_RPC = 'accept_child_planning_terms_v1';
export const REQUEST_CHILD_PLANNING_TERM_CHANGES_RPC =
  'request_child_planning_term_changes_v1';

/** 孩子想說的話的長度上限。一句話，不是一篇作文。 */
export const CHILD_REVIEW_REASON_MAX = 120;

export type AcceptChildPlanningTermsCommand = {
  schemaVersion: 1;
  proposalId: string;
  expectedPlanVersionId: string;
  /**
   * 現在這一刻重算的政策判定。
   *
   * 家長提出到孩子按下「可以」可能隔了幾天 —— A4B1 算過一次不代表
   * 現在還成立。**共同條件還沒說完時不需要**（那一輪不會建立任務）。
   */
  rewardDecision?: unknown;
};

export type RequestChildPlanningTermChangesCommand = {
  schemaVersion: 1;
  proposalId: string;
  expectedPlanVersionId: string;
  /** 孩子想說的一句話。存在狀態事件上，不進 canonical 計畫。 */
  reason?: string;
};

/** 為什麼這張卡片現在不能由孩子回覆。 */
export type ChildPlanningReviewBlock =
  | 'not_child_planning_review'
  | 'not_in_review'
  | 'already_has_task'
  /** 系統還沒整理完。理論上不該走到孩子面前。 */
  | 'system_enrichment_required';

export type ChildPlanningReviewability =
  | {
    ok: true;
    /**
     * 這一次「可以」會不會讓任務真的開始。
     *
     * false = 還有共同條件沒說定 —— 畫面上不可以出現「開始任務」。
     */
    activates: boolean;
    /** 還沒說定的事，已經翻成孩子看得懂的話。 */
    pending: string[];
  }
  | { ok: false; block: ChildPlanningReviewBlock };

export type AcceptChildPlanningTermsSuccess = {
  ok: true;
  proposalId: string;
  planVersionId: string;
  status: 'active' | 'proposed';
  /** true = 任務真的開始了；false = 這一輪同意了，但還要繼續談。 */
  activated: boolean;
  taskId: string | null;
  childPlanVersionId: string | null;
  requiresParentDecision: string[];
  confirmedReward: ChildProposalConfirmedReward | null;
  idempotentReplay: boolean;
};

export type AcceptChildPlanningTermsResult =
  | AcceptChildPlanningTermsSuccess
  | ChildProposalFailure;

export type RequestChildPlanningTermChangesSuccess = {
  ok: true;
  proposalId: string;
  planVersionId: string;
  status: 'proposed';
  idempotentReplay: boolean;
};

export type RequestChildPlanningTermChangesResult =
  | RequestChildPlanningTermChangesSuccess
  | ChildProposalFailure;
