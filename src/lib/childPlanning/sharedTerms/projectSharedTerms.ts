// GrowBook — 把家長提出的條件套到來源版本上（P1-A4B1 §12）
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支存在的唯一理由是**不要有第二套 evaluator**。
//
// 家長把每次時間從 15 改成 30 分鐘之後，pricing band 可能就換了，所以
// 幣值必須用現在的規則重算。要重算就要有一份「套用新條件之後的計畫」——
// 而唯一正確的做法是把新條件套到來源版本上，再丟給既有的
// planEvaluationCommand → evaluateTaskReward。
//
// 自己算一次 band、自己查一次表，那就是第二套定價邏輯，兩邊遲早分岔。
// ─────────────────────────────────────────────────────────────────────────

import type {
  ChildProposalPlanVersion,
  ParentProposalCardData,
} from '../../childProposal/types';
import type { ChildPlanningSharedTerms } from './types';

/**
 * 套用共同條件之後的計畫版本。
 *
 * ⚠️ 只碰共同條件那幾欄。孩子擁有的欄位（標題、做法、下一步）原樣帶過 ——
 *    型別上 ChildPlanningSharedTerms 也沒有那些鍵。
 */
export function projectSharedTerms(
  source: ChildProposalPlanVersion,
  terms: ChildPlanningSharedTerms,
): ChildProposalPlanVersion {
  const cadenceChanged = terms.cadenceMode !== undefined;
  const timeChanged = terms.preferredTime !== undefined;

  return {
    ...source,
    cadence_mode: cadenceChanged ? terms.cadenceMode! : source.cadence_mode,
    cadence_weekly_frequency: cadenceChanged
      ? (terms.cadenceMode === 'weekly_frequency' ? terms.cadenceWeeklyFrequency ?? null : null)
      : source.cadence_weekly_frequency,
    cadence_days: cadenceChanged
      ? (terms.cadenceMode === 'fixed_days' ? [...(terms.cadenceDays ?? [])] : null)
      : source.cadence_days,
    preferred_time: timeChanged ? terms.preferredTime! : source.preferred_time,
    preferred_time_custom: timeChanged
      ? (terms.preferredTime === 'custom' ? terms.preferredTimeCustom ?? null : null)
      : source.preferred_time_custom,
    estimated_minutes: terms.sessionMinutes ?? source.estimated_minutes,
    // 先試多久只對長期計畫有意義。一次性／週期性任務的天數不由這裡決定。
    duration_days: source.duration_type === 'long_term'
      ? (terms.durationDays ?? source.duration_days)
      : source.duration_days,
  };
}

/** 給 evaluator 用的卡片投影。proposal 那一半完全不動。 */
export function projectCard(
  card: ParentProposalCardData,
  terms: ChildPlanningSharedTerms,
): ParentProposalCardData {
  const plan = card.currentPlanVersion;
  if (!plan) return card;
  return { ...card, currentPlanVersion: projectSharedTerms(plan, terms) };
}

/** 會影響定價的條件有沒有變。目前只有「每次多久」。 */
export function pricingRelevantChange(
  source: ChildProposalPlanVersion,
  terms: ChildPlanningSharedTerms,
): boolean {
  return terms.sessionMinutes !== undefined
    && terms.sessionMinutes !== source.estimated_minutes;
}
