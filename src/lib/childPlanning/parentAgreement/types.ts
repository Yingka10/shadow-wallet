// GrowBook — 家長對「孩子已經想清楚的完整計畫」的直接同意（P1-A4A）
//
// ─────────────────────────────────────────────────────────────────────────
// 這一包的產品語意不是「家長批准 AI 計畫」，也不是「家長接管孩子的 Plan」。
//
//   孩子已經確認「我要怎麼做到」；
//   家長現在只確認這份**已經完整**的安排能不能成為家庭共同約定。
//
// 所以它有一個很硬的前提：**只處理完整的 child plan。**
// 還有共同條件沒決定的（requires_parent_decision 非空），這一包不碰 ——
// 家長直接填一個 cadence 然後立刻 active，等於孩子從來沒答應過那個節奏。
// 那是 A4B 的協商流程。
//
// ⚠️ 這是既有 P0 Direct Confirm 的 **sibling，不是它的擴充**。
//    把 `authored_by === 'ai'` 放寬成 `'ai' || 'child'` 會得到一支
//    看似通用、其實語意分叉的 function：兩條線的 ownership semantics
//    完全不同（一條是「採用 GrowBook 的建議」，一條是「同意孩子的安排」）。
// ─────────────────────────────────────────────────────────────────────────

import type {
  ChildPlanSharedDecision,
  ChildProposalFailure,
  ChildProposalRewardDecision,
  ConfirmChildProposalSuccess,
} from '../../childProposal/types';

export const CONFIRM_CHILD_PLANNING_PROPOSAL_RPC = 'confirm_child_planning_proposal_v1';

/**
 * 家長同意命令。
 *
 * ⚠️ 型別上**沒有**任何一個計畫內容欄位 —— 沒有 planTitle、沒有 nextStep、
 *    沒有 cadence override。家長這顆「確認」不能同時偷偷編計畫，而那件事
 *    在這裡是寫不出來的（RPC 端也會擋，兩層都有）。
 */
export type ConfirmChildPlanningProposalCommand = {
  schemaVersion: 1;
  proposalId: string;
  /** 家長螢幕上那一版。對不上代表計畫已經換過，RPC 會回 STALE_PLAN_VERSION。 */
  expectedPlanVersionId: string;
  /** 由既有 canonical evaluator 現算的判定；RPC 會拿它跟 plan evidence 比對。 */
  rewardDecision: ChildProposalRewardDecision;
};

/**
 * 為什麼這份 child plan 現在還不能直接同意。
 *
 * `shared_decision_required` 是這一包最重要的一個值：它**不是錯誤**，
 * 而是「這份計畫還有需要一起決定的事」。UI 不該顯示成失敗。
 */
export type ChildPlanConfirmBlock =
  /** 不是 P1 的 child planning 版本 —— 這條路徑本來就不該處理它。 */
  | 'not_child_planning_plan'
  /** 提案狀態或 current version 對不上。 */
  | 'not_current_proposed'
  /** 還有共同條件沒決定。 */
  | 'shared_decision_required'
  /** enrichment 當時不可用，政策欄位還沒算。 */
  | 'enrichment_incomplete'
  /** 正式任務需要的系統欄位不齊。 */
  | 'system_fields_incomplete';

export type ChildPlanConfirmability =
  | { ok: true }
  | {
      ok: false;
      block: ChildPlanConfirmBlock;
      /** shared_decision_required 時列出還缺哪些；其餘為空陣列。 */
      pending: ChildPlanSharedDecision[];
    };

export type BuildChildPlanConfirmCommandResult =
  | { ok: true; command: ConfirmChildPlanningProposalCommand }
  | ChildProposalFailure;

/**
 * 家長同意的結果。
 *
 * 比 P0 多一個 `sourcePlanVersionId` —— 孩子那一版的 id。
 * 它是 lineage 的起點：之後要回答「孩子原本怎麼想」時，
 * 從這裡走到 child formal version，再讀 child_confirmed_plan。
 */
export type ConfirmChildPlanningProposalSuccess = ConfirmChildProposalSuccess & {
  sourcePlanVersionId: string;
};

export type ConfirmChildPlanningProposalResult =
  | ConfirmChildPlanningProposalSuccess
  | ChildProposalFailure;
