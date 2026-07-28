import { isTaskDueToday, type SchedulableTask } from '../taskSchedule';

/**
 * 系統時間固定在 2026-07-28T12:00:00+08:00（台北 週二，dow=2，平日）。
 *
 * 凍結時鐘的重點不是「換一個比較晚的日期」——而是讓**沒有傳 now** 的呼叫也能斷言。
 * production 兩個呼叫端（useTodayTasks / useParentDashboard）都是 `isTaskDueToday(t)`
 * 不帶參考時間，走的正是 `dayjs()` 這條路；只測有注入時間的版本等於沒測到真正跑的分支。
 */
const FROZEN_NOW = '2026-07-28T12:00:00+08:00';

// 相對於凍結時間的「過去 / 今天 / 未來」，全部由上面那個常數推導，不寫死其他日期。
const YESTERDAY = '2026-07-27';
const TODAY = '2026-07-28';
const TOMORROW = '2026-07-29';

// 明確注入的參考時間（測不同星期幾用）。
const TUE = '2026-07-28T12:00:00+08:00'; // 台北 週二 (dow=2)，平日
const SAT = '2026-08-01T12:00:00+08:00'; // 台北 週六 (dow=6)，週末

function task(partial: Partial<SchedulableTask>): SchedulableTask {
  return { day_type: 'both', recurrence_days: null, due_date: null, ...partial };
}

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(FROZEN_NOW));
});

afterAll(() => {
  jest.useRealTimers();
});

describe('isTaskDueToday：星期幾規則', () => {
  it('both：平日與週末都顯示', () => {
    expect(isTaskDueToday(task({ day_type: 'both' }), TUE)).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'both' }), SAT)).toBe(true);
  });

  it('weekday：只在平日顯示', () => {
    expect(isTaskDueToday(task({ day_type: 'weekday' }), TUE)).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'weekday' }), SAT)).toBe(false);
  });

  it('weekend：只在週末顯示', () => {
    expect(isTaskDueToday(task({ day_type: 'weekend' }), SAT)).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'weekend' }), TUE)).toBe(false);
  });

  it('custom：recurrence_days 含今天星期幾才顯示', () => {
    expect(isTaskDueToday(task({ day_type: 'custom', recurrence_days: [1, 2, 5] }), TUE)).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'custom', recurrence_days: [1, 2, 5] }), SAT)).toBe(false);
    expect(isTaskDueToday(task({ day_type: 'custom', recurrence_days: [0, 6] }), SAT)).toBe(true);
  });

  it('custom：recurrence_days 為 null 時不顯示', () => {
    expect(isTaskDueToday(task({ day_type: 'custom', recurrence_days: null }), TUE)).toBe(false);
  });

  it('once：沒有 due_date 就顯示', () => {
    expect(isTaskDueToday(task({ day_type: 'once' }), TUE)).toBe(true);
  });
});

describe('isTaskDueToday：due_date 的過去 / 今天 / 未來', () => {
  it('過去：due_date 早於今天一律不顯示，即使是 both', () => {
    expect(isTaskDueToday(task({ day_type: 'once', due_date: YESTERDAY }), TUE)).toBe(false);
    expect(isTaskDueToday(task({ day_type: 'both', due_date: YESTERDAY }), TUE)).toBe(false);
  });

  it('今天：due_date 等於今天要顯示（今天到期＝今天要做）', () => {
    expect(isTaskDueToday(task({ day_type: 'once', due_date: TODAY }), TUE)).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'both', due_date: TODAY }), TUE)).toBe(true);
  });

  it('未來：once 進臨時任務 bucket，不進今日清單', () => {
    // 契約來自 bdf99e8「首頁新增任務改版（臨時任務 / 週期任務）」：
    // day_type='once' 且 due_date > 今天的任務由 useTodayTasks 另開 bucket 呈現，
    // 所以這裡刻意回 false，不是漏判。
    expect(isTaskDueToday(task({ day_type: 'once', due_date: TOMORROW }), TUE)).toBe(false);
  });

  it('未來：週期任務不受未來 due_date 影響，照常顯示', () => {
    expect(isTaskDueToday(task({ day_type: 'both', due_date: TOMORROW }), TUE)).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'weekday', due_date: TOMORROW }), TUE)).toBe(true);
  });
});

describe('isTaskDueToday：省略 now 時使用凍結的系統時間', () => {
  // 這組完全不傳參考時間，驗證 production 實際走的預設分支。
  it('以台北今天（2026-07-28 週二）判斷過去 / 今天 / 未來', () => {
    expect(isTaskDueToday(task({ day_type: 'once', due_date: YESTERDAY }))).toBe(false);
    expect(isTaskDueToday(task({ day_type: 'once', due_date: TODAY }))).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'once', due_date: TOMORROW }))).toBe(false);
  });

  it('以台北今天的星期幾（週二＝平日）判斷 day_type', () => {
    expect(isTaskDueToday(task({ day_type: 'weekday' }))).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'weekend' }))).toBe(false);
    expect(isTaskDueToday(task({ day_type: 'custom', recurrence_days: [2] }))).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'custom', recurrence_days: [3] }))).toBe(false);
  });
});

describe('isTaskDueToday：Asia/Taipei 與 UTC 的日期邊界', () => {
  // 台北 = UTC+8，所以 UTC 16:00 之後就已經是台北的隔天。
  // 用 UTC 表示的參考時間跨過這條線時，「今天」必須跟著台北走而不是跟著 UTC。
  it('UTC 15:30（台北同日 23:30）仍算台北的今天', () => {
    const beforeMidnightTaipei = '2026-07-28T15:30:00Z'; // 台北 2026-07-28 23:30
    expect(isTaskDueToday(task({ day_type: 'once', due_date: TODAY }), beforeMidnightTaipei)).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'once', due_date: YESTERDAY }), beforeMidnightTaipei)).toBe(false);
  });

  it('UTC 16:30（台北已跨日 00:30）算台北的隔天，前一天的任務就過期', () => {
    const afterMidnightTaipei = '2026-07-28T16:30:00Z'; // 台北 2026-07-29 00:30
    expect(isTaskDueToday(task({ day_type: 'once', due_date: TODAY }), afterMidnightTaipei)).toBe(false);
    expect(isTaskDueToday(task({ day_type: 'once', due_date: TOMORROW }), afterMidnightTaipei)).toBe(true);
  });

  it('跨日同時要換星期幾：台北週五 23:30 → 週六 00:30', () => {
    const friNightTaipei = '2026-07-31T15:30:00Z'; // 台北 2026-07-31 23:30 週五
    const satMorningTaipei = '2026-07-31T16:30:00Z'; // 台北 2026-08-01 00:30 週六
    expect(isTaskDueToday(task({ day_type: 'weekday' }), friNightTaipei)).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'weekend' }), friNightTaipei)).toBe(false);
    expect(isTaskDueToday(task({ day_type: 'weekday' }), satMorningTaipei)).toBe(false);
    expect(isTaskDueToday(task({ day_type: 'weekend' }), satMorningTaipei)).toBe(true);
  });
});

describe('isTaskDueToday：跨年不受影響', () => {
  // due_date 是字串比較，年份進位若處理錯就會把 1/1 判成過期。
  it('台北 12/31 時，隔年 1/1 到期算未來', () => {
    const nyeTaipei = '2026-12-31T12:00:00+08:00';
    expect(isTaskDueToday(task({ day_type: 'once', due_date: '2027-01-01' }), nyeTaipei)).toBe(false);
    expect(isTaskDueToday(task({ day_type: 'both', due_date: '2027-01-01' }), nyeTaipei)).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'once', due_date: '2026-12-31' }), nyeTaipei)).toBe(true);
  });

  it('台北 1/1 時，去年 12/31 到期算過去', () => {
    const newYearTaipei = '2027-01-01T12:00:00+08:00';
    expect(isTaskDueToday(task({ day_type: 'once', due_date: '2026-12-31' }), newYearTaipei)).toBe(false);
    expect(isTaskDueToday(task({ day_type: 'both', due_date: '2026-12-31' }), newYearTaipei)).toBe(false);
    expect(isTaskDueToday(task({ day_type: 'once', due_date: '2027-01-01' }), newYearTaipei)).toBe(true);
  });

  it('跨年那一刻的 UTC 邊界也跟著台北：UTC 12/31 16:30 = 台北 1/1 00:30', () => {
    const newYearTaipeiViaUtc = '2026-12-31T16:30:00Z';
    expect(isTaskDueToday(task({ day_type: 'once', due_date: '2026-12-31' }), newYearTaipeiViaUtc)).toBe(false);
    expect(isTaskDueToday(task({ day_type: 'once', due_date: '2027-01-01' }), newYearTaipeiViaUtc)).toBe(true);
  });
});
