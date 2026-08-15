// GrowBook — 孩子原本 vs 家長提出（P1-A4B1 §8）
//
// ─────────────────────────────────────────────────────────────────────────
// 家長改的如果是孩子**已經明確講過**的事，那不是一個普通的編輯。
//
//     孩子：平日睡前 15 分鐘
//     家長：睡前太晚了，改成晚餐後
//
// 這種時候畫面上必須兩行都在。只顯示新值的話，孩子打開來看到的是
// 一份「本來就長這樣」的計畫 —— 他自己講過的那句話消失了，而且沒有人
// 告訴他消失了。
//
// 所以 diff 保存的是 material difference，不是「有沒有被編輯過」。
// ─────────────────────────────────────────────────────────────────────────

import { formatPreferredTime } from '../../childProposal/materialDiff';
import type { ChildProposalPlanVersion } from '../../childProposal/types';
import { projectSharedTerms } from './projectSharedTerms';
import type { ChildPlanningSharedTerms } from './types';

const WEEKDAYS: Record<number, string> = {
  0: '週日', 1: '週一', 2: '週二', 3: '週三', 4: '週四', 5: '週五', 6: '週六',
};
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export type SharedTermChange = {
  /** 家長話，不是欄位名。 */
  label: string;
  /** 孩子原本的安排。沒有講過就是 null —— 那種時候不該假裝他講過。 */
  before: string | null;
  after: string;
};

function cadenceText(plan: ChildProposalPlanVersion): string | null {
  if (plan.cadence_mode === 'weekly_frequency') {
    return typeof plan.cadence_weekly_frequency === 'number'
      ? `一週 ${plan.cadence_weekly_frequency} 次`
      : null;
  }
  if (plan.cadence_mode === 'fixed_days') {
    const selected = new Set(plan.cadence_days ?? []);
    const labels = WEEKDAY_ORDER.filter((day) => selected.has(day)).map((day) => WEEKDAYS[day]);
    return labels.length > 0 ? `每${labels.join('、')}` : null;
  }
  if (plan.cadence_mode === 'one_time') return '先完成一次';
  return null;
}

function minutesText(plan: ChildProposalPlanVersion): string | null {
  return typeof plan.estimated_minutes === 'number' && plan.estimated_minutes > 0
    ? `每次約 ${plan.estimated_minutes} 分鐘`
    : null;
}

function durationText(plan: ChildProposalPlanVersion): string | null {
  return typeof plan.duration_days === 'number' && plan.duration_days > 0
    ? `先試 ${plan.duration_days} 天`
    : null;
}

function rewardText(plan: ChildProposalPlanVersion): string | null {
  if (plan.reward_policy === 'coin_eligible') return '完成一次給成長幣';
  if (plan.reward_policy === 'progress_only') return '看得到進度，不給成長幣';
  if (plan.reward_policy === 'record_only') return '先把完成記錄下來';
  if (plan.reward_policy === 'family_contribution') return '記在家庭貢獻裡';
  return null;
}

/**
 * 家長提出的條件與來源版本的差異。
 *
 * ⚠️ `before` 是**來源版本上的值**。第一次協商時來源就是孩子那一版，
 *    所以它就是「孩子原本」。之後的來回，來源是上一份草案 ——
 *    那時要顯示的是「上一次說好的」，語意仍然成立。
 */
export function sharedTermChanges(
  source: ChildProposalPlanVersion,
  terms: ChildPlanningSharedTerms,
): SharedTermChange[] {
  const next = projectSharedTerms(source, terms);
  const changes: SharedTermChange[] = [];

  const beforeCadence = cadenceText(source);
  const afterCadence = cadenceText(next);
  if (afterCadence !== null && afterCadence !== beforeCadence) {
    changes.push({ label: '進行頻率', before: beforeCadence, after: afterCadence });
  }

  const beforeTime = formatPreferredTime(source);
  const afterTime = formatPreferredTime(next);
  if (afterTime !== null && afterTime !== beforeTime) {
    changes.push({ label: '什麼時候做', before: beforeTime, after: afterTime });
  }

  const beforeMinutes = minutesText(source);
  const afterMinutes = minutesText(next);
  if (afterMinutes !== null && afterMinutes !== beforeMinutes) {
    changes.push({ label: '每次大約做多久', before: beforeMinutes, after: afterMinutes });
  }

  const beforeDuration = durationText(source);
  const afterDuration = durationText(next);
  if (afterDuration !== null && afterDuration !== beforeDuration) {
    changes.push({ label: '這次先試多久', before: beforeDuration, after: afterDuration });
  }

  if (terms.rewardChoice === 'no_coin' && source.reward_policy === 'coin_eligible') {
    changes.push({
      label: '怎麼給回饋',
      before: rewardText(source),
      after: '看得到進度，不給成長幣',
    });
  }

  return changes;
}

/** 這一份草案裡，有哪幾項是改掉孩子已經講過的安排。 */
export function overriddenChildChoices(
  source: ChildProposalPlanVersion,
  terms: ChildPlanningSharedTerms,
): SharedTermChange[] {
  return sharedTermChanges(source, terms).filter((change) => change.before !== null);
}
