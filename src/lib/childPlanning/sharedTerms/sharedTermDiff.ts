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

/**
 * 回饋方式，講成家庭讀得懂而且**與錢包實際行為一致**的一句話。
 *
 * ⚠️ 這一行是家庭真正同意的那句話 —— 孩子按下「可以」的時候，同意的
 *    就是它。所以它必須說得出**一次完成會發生什麼**，而不是含糊帶過。
 *
 *    在 P1-REWARD-FIX 之前這裡寫的是「完成一次給成長幣」，而任務實際上
 *    是 per_period：一週做滿三次才給一次的錢。差三倍，而畫面上從來沒有
 *    出現過「每週達標」四個字。現在 payout_basis 一律是 per_completion，
 *    這句話才真的成立。
 *
 *    禁止寫成「每週達標 +N」—— 那是被推翻掉的舊語意。
 */
function rewardText(plan: ChildProposalPlanVersion): string | null {
  if (plan.reward_policy === 'coin_eligible') {
    // 錨點是 A4A.1 的正式欄位，不是 ai_suggested_coin_amount（那不是算出來的）。
    const coins = plan.policy_session_coin_reference;
    return typeof coins === 'number' && coins > 0
      ? `每完成一次，+${coins} 成長幣`
      : '每完成一次就有成長幣';
  }
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
  const changes = sharedTermVersionChanges(source, projectSharedTerms(source, terms));
  if (terms.rewardChoice === 'no_coin' && source.reward_policy === 'coin_eligible'
    && !changes.some((change) => change.label === '怎麼給回饋')) {
    changes.push({
      label: '怎麼給回饋',
      before: rewardText(source),
      after: '看得到進度，不給成長幣',
    });
  }
  return changes;
}

/**
 * 兩個版本之間的共同條件差異。
 *
 * ⚠️ **白名單**：只比對節奏、時段、每次多久、先試多久、回饋方式。
 *    孩子擁有的欄位（標題、做法、下一步、progression 結構）不在這裡 ——
 *    它們本來就不該有差異，真的有差異是資料錯了，不是一次合法的協商，
 *    那要在 RPC 層擋下來（CHILD_PLAN_INTEGRITY_VIOLATION），
 *    不是排成一行讓孩子挑「要不要接受」。
 *
 * P1-A4B2 的孩子端直接用這一支：來源是家長草案的 adopted_from。
 * **不另存一份 narrative** —— 第二份 truth 遲早會和資料說不一樣的話。
 */
export function sharedTermVersionChanges(
  source: ChildProposalPlanVersion,
  next: ChildProposalPlanVersion,
): SharedTermChange[] {
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

  const beforeReward = rewardText(source);
  const afterReward = rewardText(next);
  if (afterReward !== null && afterReward !== beforeReward) {
    changes.push({ label: '怎麼給回饋', before: beforeReward, after: afterReward });
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
