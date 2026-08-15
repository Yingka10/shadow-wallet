// GrowBook — 家庭約定的時段 vs 一次完成當下的時段（LT-FINAL-1R §I）
//
// ─────────────────────────────────────────────────────────────────────────
// 這兩件事以前共用同一個型別，而那個型別只有兩個值：
//
//     PreferredTimeWindow = 'after_dinner' | 'before_bed'
//
// 但 A4B 的協商早就允許整套家庭詞彙（上學前、放學後、週末、需要時、
// 自訂…）。共用的後果是：一份正式談定「放學後」的計畫，在孩子端會
// 顯示成「尚未選擇時段」—— 明明談過了。
//
// 所以拆開：
//
//   AgreedPreferredTime   共同約定，讀 tasks.preferred_time(_custom)，
//                         詞彙完整。
//   PreferredTimeWindow   一次完成紀錄的 context，只有兩個值，
//                         繼續只服務 planned_time_window。
//
// ⚠️ **不要為了顯示去擴 completion 的 DB enum。** 記不記得下來是紀錄能力，
//    談不談得成是約定能力，兩者本來就不必一樣寬。
// ─────────────────────────────────────────────────────────────────────────

import type { Task } from '../../types/database';

export type AgreedPreferredTime = {
  /** 原始值，給比對用。custom 時是 'custom'。 */
  value: string;
  /** 畫面上的字。 */
  label: string;
};

const AGREED_TIME_COPY: Record<string, string> = {
  before_school: '上學前',
  after_school: '放學後',
  after_dinner: '晚餐後',
  before_bed: '睡前',
  weekend: '週末',
  when_needed: '需要時',
  anytime: '任何時候',
};

/**
 * 家庭談定的時段。談過就講得出來，沒談過就是 null。
 *
 * ⚠️ 不認得的值**不要**印原始字串（那會是 before_school 這種工程詞），
 *    也不要當成沒談過 —— 回一句誠實的「已經談好時段」。
 */
export function resolveAgreedPreferredTime(
  task: Pick<Task, 'preferred_time' | 'preferred_time_custom'> | null | undefined,
): AgreedPreferredTime | null {
  const custom = task?.preferred_time_custom?.trim();
  if (task?.preferred_time === 'custom' || (custom && !task?.preferred_time)) {
    return custom ? { value: 'custom', label: custom } : null;
  }

  const value = task?.preferred_time?.trim();
  if (!value) return null;
  const label = AGREED_TIME_COPY[value];
  if (label) return { value, label };
  return custom ? { value: 'custom', label: custom } : { value, label: '已經談好的時段' };
}
