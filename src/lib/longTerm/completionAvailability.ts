// GrowBook — 今天到底能不能按那顆完成（LT-FINAL-1R §B）
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支**與 progression 分開**，因為它問的是完全不同的問題：
//
//   progression   這件事怎麼往前走
//   availability  今天這一刻按不按得下去
//
// ⚠️ **週目標不是完成上限。** `weekCompleted < weeklyTarget` 絕對不可以
//    出現在這裡的條件裡 —— 一週約定三次的計畫，孩子第四次仍然可以記錄，
//    而且照正式金額結算（P1-REWARD-FIX 已經把 payout_basis 定為
//    per_completion，claim cap 是 claim_period / max_claims_per_period）。
//
//    把週目標拿來當上限，等於替家庭發明一條他們沒有談過的規則。
//
// 回傳帶 reason，UI 就不必自己猜「為什麼不能按」——猜的結果通常是
// 一句對不上實際原因的話。
// ─────────────────────────────────────────────────────────────────────────

import dayjs, { type Dayjs } from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { LongTermGoal, Task } from '../../types/database';
import { fixedDayEvidence, progressionSupportsChildCheckIn } from './progression';
import type { LongTermProgression } from './progression';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

export type LongTermCompletionReason =
  | 'available'
  | 'already_recorded_today'
  | 'claim_limit_reached'
  | 'not_scheduled_today'
  | 'before_plan'
  | 'after_plan'
  | 'paused'
  | 'unsupported_progression';

export type LongTermCompletionAvailability = {
  canComplete: boolean;
  reason: LongTermCompletionReason;
};

export type CompletionRecord = { completed_at: string };

type Input = {
  task: Task;
  goal: LongTermGoal;
  progression: LongTermProgression | null;
  completions: readonly CompletionRecord[];
  now?: Dayjs;
  planStart: Dayjs;
  planEnd: Dayjs | null;
};

function taipeiWeekStart(moment: Dayjs): Dayjs {
  const local = moment.tz(TZ);
  return local.startOf('day').subtract((local.day() + 6) % 7, 'day');
}

/**
 * 這一刻的實際 claim 窗口裡已經記了幾次。
 *
 * ⚠️ 窗口由 `tasks.claim_period` 決定，**不是**由 cadence 決定。
 *    P1 的每週節奏計畫是 day/1（同一天一次），一週能記幾次沒有上限。
 */
export function claimWindowCount(
  claimPeriod: Task['claim_period'],
  completions: readonly CompletionRecord[],
  now: Dayjs,
): number {
  const local = now.tz(TZ);
  if (claimPeriod === 'week') {
    const start = taipeiWeekStart(local);
    return completions.filter((completion) => {
      const at = dayjs(completion.completed_at).tz(TZ);
      return !at.isBefore(start, 'day') && at.isBefore(start.add(7, 'day'), 'day');
    }).length;
  }
  if (claimPeriod === 'once') return completions.length;
  // 'day' 與缺值都當成「以今天為窗口」。
  //
  // ⚠️ 缺值走這一條是既有 invariant：claim_period 是 NOT NULL DEFAULT 'day'
  //    之前建立的舊任務才會是 null，而它們的歷史行為就是一天一次。
  //    **不准拿週目標補** —— 那會憑空生出一條沒有人約定過的上限。
  return completions.filter(
    (completion) => dayjs(completion.completed_at).tz(TZ).isSame(local, 'day'),
  ).length;
}

export function resolveLongTermCompletionAvailability({
  task,
  goal,
  progression,
  completions,
  now = dayjs().tz(TZ),
  planStart,
  planEnd,
}: Input): LongTermCompletionAvailability {
  const deny = (reason: LongTermCompletionReason): LongTermCompletionAvailability =>
    ({ canComplete: false, reason });

  if (goal.status === 'paused') return deny('paused');
  if (!progressionSupportsChildCheckIn(progression)) return deny('unsupported_progression');

  const today = now.tz(TZ).startOf('day');
  if (today.isBefore(planStart, 'day')) return deny('before_plan');
  if (planEnd !== null && today.isAfter(planEnd, 'day')) return deny('after_plan');

  if (progression === 'fixed_days') {
    const days = fixedDayEvidence(task, goal);
    if (!days.includes(today.day())) return deny('not_scheduled_today');
  }

  const cap = Number.isInteger(task.max_claims_per_period)
    && (task.max_claims_per_period ?? 0) > 0
    ? (task.max_claims_per_period as number)
    : 1;
  const used = claimWindowCount(task.claim_period, completions, now);
  if (used >= cap) {
    // 上限是 1 而且窗口是今天 —— 那句話講成「今天已經記過了」比
    // 「達到上限」清楚得多，孩子讀得懂的是前者。
    return deny(
      cap === 1 && (task.claim_period === 'day' || !task.claim_period)
        ? 'already_recorded_today'
        : 'claim_limit_reached',
    );
  }

  return { canComplete: true, reason: 'available' };
}
