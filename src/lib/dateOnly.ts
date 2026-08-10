// Shadow Wallet — 只有日期、沒有時間的計算
//
// 為什麼不用 `new Date(str)` 加減：
//
// `new Date('2026-08-01')` 會被當成 UTC 午夜，`new Date(2026, 7, 1)` 是本機午夜。
// 兩者混用時，在 UTC+8 拿到的「今天」可能比使用者的今天早一天 ——
// 里程碑會提早或延後一天亮起，而且只在某些時區、某些時段出錯。
//
// 這裡的所有函式都只處理 `YYYY-MM-DD` 字串，內部一律用 `Date.UTC`。
// 沒有時分秒，就沒有時區。

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnlyString(value: string | null | undefined): value is string {
  if (!value || !DATE_ONLY.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // 用 UTC 還原一次，抓 2026-02-30 這種格式合法但不存在的日期。
  const stamp = Date.UTC(y, m - 1, d);
  const back = new Date(stamp);
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
}

function toUtcStamp(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcStamp(stamp: number): string {
  return new Date(stamp).toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `2026-07-01` + 6 天 → `2026-07-07`。輸入不合法時回 null，不丟錯。 */
export function addDays(date: string, days: number): string | null {
  if (!isDateOnlyString(date) || !Number.isFinite(days)) return null;
  return fromUtcStamp(toUtcStamp(date) + Math.trunc(days) * DAY_MS);
}

/** a 早於 b 回負數、相同回 0、晚於回正數。兩邊都必須合法。 */
export function compareDates(a: string, b: string): number {
  return toUtcStamp(a) - toUtcStamp(b);
}

/**
 * 使用者本機的今天，格式 `YYYY-MM-DD`。
 *
 * 刻意用 getFullYear / getMonth / getDate 而不是 toISOString ——
 * 後者是 UTC，在 UTC+8 的晚上八點之後會給出「明天」。
 */
export function todayDateString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}
