// Shadow Wallet — 孩子提案的狀態機（P0-1）
//
// ─────────────────────────────────────────────────────────────────────────
// 這張表是 SQL 那份的鏡像。兩份都存在是刻意的：
//
//   DB 的 child_proposal_transition_allowed 是**強制**的（繞不過）；
//   這一份是**可用的** —— 畫面要決定按鈕能不能按、要顯示什麼提示，
//   總不能為了問一句「這個轉換合法嗎」打一次 RPC。
//
// 代價是兩份可能不一致。所以有一支 parity 測試直接讀 migration 檔，
// 把 SQL 的 VALUES 解出來與這裡逐列比對 ——
// 任何一邊改了、另一邊沒改，測試就紅。
//
// ⚠️ 加新狀態或新轉換時，**兩邊一起改**，而且不要繞過 parity 測試。
//    只改一邊的話，鬆的那一邊會變成實際規則。
// ─────────────────────────────────────────────────────────────────────────

import type { ChildProposalActorRole, ChildProposalStatus } from './types';

export type ChildProposalTransition = {
  from: ChildProposalStatus;
  to: ChildProposalStatus;
  /** 誰有權做這一步。 */
  actor: ChildProposalActorRole;
};

/**
 * 合法的狀態轉換。順序與 SQL 那份一致，方便對照。
 *
 * 沒有列在這裡的都不合法，包含幾個看起來很自然的：
 *
 *   proposed → draft            家長已經看過了，退回去是在改寫歷史
 *   active → 任何狀態            P0 的終點。之後的調整走 adjustment request（P0-8）
 *   closed_unsuitable → 任何狀態  被回絕的想法不會自己復活；要再提是新的一份提案
 *   draft → closed_unsuitable    家長看不到 draft，沒有東西可以回絕
 */
export const CHILD_PROPOSAL_TRANSITIONS: readonly ChildProposalTransition[] = [
  { from: 'draft', to: 'proposed', actor: 'child' },
  { from: 'proposed', to: 'needs_child_review', actor: 'parent' },
  { from: 'proposed', to: 'active', actor: 'parent' },
  { from: 'proposed', to: 'closed_unsuitable', actor: 'parent' },
  { from: 'needs_child_review', to: 'active', actor: 'child' },
  { from: 'needs_child_review', to: 'proposed', actor: 'child' },
  { from: 'needs_child_review', to: 'closed_unsuitable', actor: 'parent' },
] as const;

/** P0 的終點狀態。到這裡之後不再有轉換。 */
export const CHILD_PROPOSAL_TERMINAL_STATUSES: readonly ChildProposalStatus[] = [
  'active',
  'closed_unsuitable',
] as const;

/**
 * 這個轉換合法嗎？
 *
 * @param actor 省略 = 只檢查形狀（from → to 本身合不合法），不檢查是誰做的。
 *              DB 的 trigger 用的就是這個模式：它看不到 actor，
 *              但它必須擋住 closed_unsuitable 被改回 active 這種形狀錯誤。
 */
export function isChildProposalTransitionAllowed(
  from: ChildProposalStatus,
  to: ChildProposalStatus,
  actor?: ChildProposalActorRole,
): boolean {
  return CHILD_PROPOSAL_TRANSITIONS.some(
    (t) => t.from === from && t.to === to && (actor === undefined || t.actor === actor),
  );
}

/** 這個角色從這個狀態可以走到哪裡。畫面用來決定要顯示哪些動作。 */
export function nextChildProposalStatuses(
  from: ChildProposalStatus,
  actor: ChildProposalActorRole,
): ChildProposalStatus[] {
  return CHILD_PROPOSAL_TRANSITIONS
    .filter((t) => t.from === from && t.actor === actor)
    .map((t) => t.to);
}

export function isChildProposalTerminal(status: ChildProposalStatus): boolean {
  return CHILD_PROPOSAL_TERMINAL_STATUSES.includes(status);
}

/**
 * 這個狀態的提案可以留下試行紀錄嗎？
 *
 * active 之後完成紀錄走 task_completions —— 那條路徑才有 coin policy
 * 與信任制的一天一筆保證。同一件事同時存在兩張表的話，週報會算兩次，
 * 而其中一次沒有經過任何幣值政策。
 */
export function acceptsTrialEvents(status: ChildProposalStatus): boolean {
  return status === 'draft' || status === 'proposed' || status === 'needs_child_review';
}

/**
 * 這個狀態的提案會依 policy 入帳嗎？
 *
 * **只有 active。** 這個函式存在的理由是讓「試行不入帳」在程式碼裡
 * 有一個可以被指著的地方，而不是散在各個查詢的 WHERE 條件裡。
 */
export function earnsCoins(status: ChildProposalStatus): boolean {
  return status === 'active';
}
