import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

/**
 * 一天的 UTC 瞬間邊界（半開區間 [startIso, endIso)）。
 * `startIso` / `endIso` 皆為 UTC ISO 字串，可直接與 `timestamptz` 欄位比較。
 */
export interface TaipeiDayRange {
  /** 台北該日 00:00 對應的 UTC 瞬間（含）。 */
  startIso: string;
  /** 台北隔日 00:00 對應的 UTC 瞬間（不含）。 */
  endIso: string;
}

/**
 * 回傳某個台北日曆日的 UTC 瞬間邊界，供查詢 `completed_at` 等 `timestamptz` 欄位使用。
 *
 * 為什麼需要它：`dayjs().tz('Asia/Taipei').format('YYYY-MM-DD')` 產生的是「日期字串」，
 * 拿去和 `timestamptz` 比較時 PostgreSQL 會把字串當成 **UTC 午夜**解讀，導致查詢窗口
 * 其實是台北 08:00–次日 08:00。結果台北 00:00–08:00 完成的紀錄被算到前一天
 * （AUDIT P0-5 / 2-4）。本函數改回傳正確的 UTC 瞬間邊界。
 *
 * 用法：把
 *   `.gte('completed_at', today).lt('completed_at', tomorrow)`
 * 換成
 *   `const { startIso, endIso } = taipeiDayRange();`
 *   `.gte('completed_at', startIso).lt('completed_at', endIso)`
 *
 * @param date 任一可被 dayjs 解析的值（Date / ISO 字串 / dayjs 物件）；預設為現在。
 *             會依其對應的台北日曆日計算邊界。
 * @returns `{ startIso, endIso }` 半開區間 [startIso, endIso)。
 */
export function taipeiDayRange(date?: dayjs.ConfigType): TaipeiDayRange {
  const start = dayjs(date).tz(TZ).startOf('day');
  return {
    startIso: start.toISOString(),
    endIso: start.add(1, 'day').toISOString(),
  };
}
