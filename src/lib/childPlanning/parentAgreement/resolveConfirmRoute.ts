// GrowBook — 一份提案走哪一條確認路徑（P1-A4A §2）
//
// ─────────────────────────────────────────────────────────────────────────
// 只有一個地方決定這件事，而且它**只看 authorship 與 lineage**：
//
//   authored_by = 'ai'                              → legacy P0 Direct Confirm
//   authored_by = 'child' ＋ planning lineage 齊全   → P1 Parent Agreement
//   其他                                            → 沒有直接確認的路徑
//
// ⚠️ 不看 plan_title、不看 ai_snapshot、不看 ai_model。
//    那些是內容 —— 內容看起來像什麼，都不能決定一份計畫的 ownership。
//    一旦開始用內容判斷，某天一份 AI 版本剛好長得像孩子寫的，
//    就會走進一條它不該走的路徑，而且沒有任何測試看得出來。
//
// ⚠️ 這裡也**不合併**兩條路徑。把 legacy 的 `authored_by === 'ai'` 放寬成
//    `'ai' || 'child'` 會得到一支看似通用、其實語意分叉的 function：
//    一條的意思是「採用 GrowBook 的建議」，另一條是「同意孩子的安排」。
// ─────────────────────────────────────────────────────────────────────────

import { isDirectConfirmablePlan } from '../../childProposal/directConfirm';
import type { ParentProposalCardData } from '../../childProposal/types';
import { isChildPlanningPlanVersion } from './isChildPlanDirectConfirmable';

export type ProposalConfirmRoute =
  /** P0：家長採用 GrowBook 整理的 AI 計畫。 */
  | 'legacy_ai_plan'
  /** P1：家長同意孩子自己規劃並確認過的安排。 */
  | 'child_planning_plan'
  /** 兩條都不適用（例如家長調整版、或還沒有計畫）。 */
  | 'none';

export function resolveConfirmRoute(card: ParentProposalCardData): ProposalConfirmRoute {
  const plan = card.currentPlanVersion;
  if (!plan) return 'none';

  // 先判 P1：它的條件比較窄（要有完整 lineage），而且與 legacy 互斥 ——
  // legacy 要求 authored_by='ai'，P1 要求 'child'，同一列不可能兩者皆是。
  if (isChildPlanningPlanVersion(plan)) return 'child_planning_plan';

  // legacy 的可確認判斷一個字都沒改。這裡只是問它。
  if (plan.authored_by === 'ai' && isDirectConfirmablePlan(card)) return 'legacy_ai_plan';

  return 'none';
}
