import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { taipeiDayRange } from '../taipeiDate';

dayjs.extend(utc);
dayjs.extend(timezone);

describe('taipeiDayRange', () => {
  it('回傳台北日曆日的 UTC 邊界（台北 00:00 = 前一日 16:00 UTC）', () => {
    // 台北中午
    const { startIso, endIso } = taipeiDayRange('2026-07-04T12:00:00+08:00');
    expect(startIso).toBe('2026-07-03T16:00:00.000Z');
    expect(endIso).toBe('2026-07-04T16:00:00.000Z');
  });

  it('半開區間跨度剛好一天', () => {
    const { startIso, endIso } = taipeiDayRange('2026-07-04T12:00:00+08:00');
    expect(dayjs(endIso).diff(dayjs(startIso), 'hour')).toBe(24);
  });

  it('台北 00:00–08:00 的瞬間仍歸在同一天（P0-5 回歸測試）', () => {
    // 台北 2026-07-04 07:30 —— 舊字串比較法會把它誤判到前一天
    const early = '2026-07-04T07:30:00+08:00';
    const { startIso, endIso } = taipeiDayRange(early);
    const t = dayjs(early);
    expect(t.isAfter(dayjs(startIso)) || t.isSame(dayjs(startIso))).toBe(true);
    expect(t.isBefore(dayjs(endIso))).toBe(true);
    // 且該日邊界就是 07-03T16:00Z ~ 07-04T16:00Z
    expect(startIso).toBe('2026-07-03T16:00:00.000Z');
    expect(endIso).toBe('2026-07-04T16:00:00.000Z');
  });

  it('台北剛過午夜（00:05）歸在新的一天，不被算到前一天', () => {
    const justAfterMidnight = '2026-07-04T00:05:00+08:00';
    const { startIso } = taipeiDayRange(justAfterMidnight);
    // 該日 start 應是 07-04 00:00 台北 = 07-03T16:00Z，而非 07-03 當日
    expect(startIso).toBe('2026-07-03T16:00:00.000Z');
  });

  it('不同輸入型別（Date 物件）也能正確計算', () => {
    const d = new Date('2026-07-04T12:00:00+08:00');
    const { startIso, endIso } = taipeiDayRange(d);
    expect(startIso).toBe('2026-07-03T16:00:00.000Z');
    expect(endIso).toBe('2026-07-04T16:00:00.000Z');
  });
});
