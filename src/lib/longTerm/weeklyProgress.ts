// GrowBook — 這一週走到哪裡（LT-FINAL-1R §C）
//
// ─────────────────────────────────────────────────────────────────────────
// 一條規則：**不 clamp 資料值。**
//
// 之前是 `Math.min(weeklyCompletions.length, weekTarget)` —— 做了四次
// 會顯示成 3/3，孩子多做的那一次在畫面上不存在。而它確實發生了，
// 也確實發了幣。
//
// 但也不要顯示成 4/3 或 133%。這一段是節奏回饋，不是達成率 ——
// 「本週完成 4 次 · 原本約定 3 次」講的是同一件事，而且不會讓孩子
// 覺得自己在刷一個分數。
// ─────────────────────────────────────────────────────────────────────────

import dayjs, { type Dayjs } from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { CompletionRecord } from './completionAvailability';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

export type LongTermWeeklyProgress = {
  /** 這週實際完成幾次。**沒有被 clamp。** */
  weekCompletedActual: number;
  /** 這週約定幾次。0 = 沒有約定過。 */
  weekTarget: number;
  weekTargetReached: boolean;
  /** 超出約定的次數。0 = 沒有超出。 */
  weekExtra: number;
  /** 給畫面用的一句話。 */
  label: string;
  /** 補充語氣。沒有就是 null，不要硬補一句。 */
  note: string | null;
};

export function taipeiWeekStart(moment: Dayjs): Dayjs {
  const local = moment.tz(TZ);
  return local.startOf('day').subtract((local.day() + 6) % 7, 'day');
}

export function completionsThisWeek(
  completions: readonly CompletionRecord[],
  now: Dayjs,
): CompletionRecord[] {
  const start = taipeiWeekStart(now);
  const end = start.add(7, 'day');
  return completions.filter((completion) => {
    const at = dayjs(completion.completed_at).tz(TZ);
    return !at.isBefore(start, 'day') && at.isBefore(end, 'day');
  });
}

export function buildWeeklyProgress(
  completions: readonly CompletionRecord[],
  weekTarget: number,
  now: Dayjs = dayjs().tz(TZ),
): LongTermWeeklyProgress {
  const done = completionsThisWeek(completions, now).length;
  const target = Number.isFinite(weekTarget) && weekTarget > 0 ? Math.trunc(weekTarget) : 0;
  const reached = target > 0 && done >= target;
  const extra = target > 0 ? Math.max(done - target, 0) : 0;

  if (target === 0) {
    return {
      weekCompletedActual: done,
      weekTarget: 0,
      weekTargetReached: false,
      weekExtra: 0,
      label: done > 0 ? `本週完成 ${done} 次` : '還沒安排這週要做幾次',
      note: null,
    };
  }

  if (extra > 0) {
    // 不寫 4 / 3。多做的那幾次是好事，但它不是一個超標率。
    return {
      weekCompletedActual: done,
      weekTarget: target,
      weekTargetReached: true,
      weekExtra: extra,
      label: `本週完成 ${done} 次`,
      note: `原本約定 ${target} 次`,
    };
  }

  return {
    weekCompletedActual: done,
    weekTarget: target,
    weekTargetReached: reached,
    weekExtra: 0,
    label: `本週 ${done} / ${target}`,
    note: reached
      ? '已到這週約定的節奏'
      : `還差 ${target - done} 次到這週約定的節奏`,
  };
}
