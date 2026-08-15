// GrowBook — 這張卡片現在能不能提出共同條件（P1-A4B1 §2 / §11）
//
// ─────────────────────────────────────────────────────────────────────────
// 兩件事要分清楚，而且分錯的代價很具體：
//
//   family-negotiable   cadence / session_size / duration / reward
//                       → 家庭一起決定，家長可以提出
//
//   system-unresolved   purpose_category / duration_type
//                       → GrowBook 自己要判定的事
//
// purpose_category 決定回饋規則。讓家長在畫面上選 A/B/C/D，等於請他當
// 分類器，而那個選擇會直接影響孩子拿不拿得到幣。duration_type 同理：
// 它不是偏好，是判定 —— 而且**沒有辦法從孩子的計畫裡 deterministic 得出**
// （audit 見 docs/CHILD_GOAL_PLANNING_CONTRACT.md §14），所以也不能請
// 家長猜一個。
// ─────────────────────────────────────────────────────────────────────────

import type {
  ChildProposalPlanVersion,
  ParentProposalCardData,
} from '../../childProposal/types';
import type { ChildPlanningNegotiability } from './types';

/** 家庭可以一起決定的條件。 */
export const FAMILY_NEGOTIABLE_TERMS = [
  'cadence', 'session_size', 'duration', 'reward',
] as const;

/** GrowBook 自己還沒整理完的事。家長不是分類器。 */
export const SYSTEM_UNRESOLVED_TERMS = ['purpose_category'] as const;

export type FamilyNegotiableTerm = typeof FAMILY_NEGOTIABLE_TERMS[number];

function isFamilyTerm(value: string): value is FamilyNegotiableTerm {
  return (FAMILY_NEGOTIABLE_TERMS as readonly string[]).includes(value);
}

/** 未決集合裡屬於家庭的那幾項。 */
export function familyNegotiableTerms(
  plan: ChildProposalPlanVersion | null,
): FamilyNegotiableTerm[] {
  const pending = plan?.requires_parent_decision;
  if (!Array.isArray(pending)) return [];
  return pending.filter(isFamilyTerm);
}

/** 未決集合裡屬於系統的那幾項。有任何一項就不該讓家長動手。 */
export function systemUnresolvedTerms(plan: ChildProposalPlanVersion | null): string[] {
  const pending = plan?.requires_parent_decision;
  if (!Array.isArray(pending)) return [];
  return pending.filter((term) => (SYSTEM_UNRESOLVED_TERMS as readonly string[]).includes(term));
}

/**
 * 這一版是不是 P1 的協商對象。
 *
 * ⚠️ 判準是 **lineage**，不是內容。第一次協商的來源是孩子那一版；
 *    之後孩子退回再談時，來源會是上一份家長草案 —— 兩種都算，只要
 *    沿著 adopted_from 走得回一份 child planning 版本。
 *
 *    這裡只看得到當前這一版，所以 App 端的判斷是「本身是 child planning
 *    版本，或是一份採自別版的家長草案」。**真正的整條 chain 由 RPC 走**
 *    （NOT_CHILD_PLANNING_LINEAGE）—— 只有它看得到所有版本。
 */
export function isChildPlanningNegotiableVersion(
  plan: ChildProposalPlanVersion | null,
): boolean {
  if (!plan) return false;
  if (plan.authored_by === 'child') {
    return typeof plan.source_planning_session_id === 'string'
      && plan.child_confirmed_plan !== null
      && plan.child_confirmed_plan !== undefined;
  }
  return plan.authored_by === 'parent'
    && typeof plan.adopted_from_plan_version_id === 'string';
}

export function childPlanningNegotiability(
  card: ParentProposalCardData,
): ChildPlanningNegotiability {
  const { proposal, currentPlanVersion: plan } = card;

  if (!isChildPlanningNegotiableVersion(plan)) {
    return { ok: false, block: 'not_child_planning_plan' };
  }
  const version = plan as ChildProposalPlanVersion;

  if (proposal.status !== 'proposed'
    || proposal.current_plan_version_id !== version.id
    || version.proposal_id !== proposal.id) {
    return { ok: false, block: 'not_current_proposed' };
  }
  if (proposal.task_id !== null) {
    return { ok: false, block: 'already_has_task' };
  }

  // 系統還沒整理完的事排在最前面：它不是「家長還沒做」，是 GrowBook
  // 還沒做。顯示成待辦會讓家長一直找不到那個按鈕在哪裡。
  if (systemUnresolvedTerms(version).length > 0 || version.duration_type === null) {
    return { ok: false, block: 'enrichment_required' };
  }

  return { ok: true, pending: familyNegotiableTerms(version) };
}

/** 給 UI 用的布林。細節要分辨時用 childPlanningNegotiability。 */
export function isChildPlanningNegotiable(card: ParentProposalCardData): boolean {
  return childPlanningNegotiability(card).ok;
}
