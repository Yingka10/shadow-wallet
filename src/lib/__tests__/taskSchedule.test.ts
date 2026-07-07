import { isTaskDueToday, type SchedulableTask } from '../taskSchedule';

// 參考時間固定注入，避免測試隨執行日漂移。
const WED = '2026-07-08T12:00:00+08:00'; // 台北 週三 (dow=3)
const SAT = '2026-07-11T12:00:00+08:00'; // 台北 週六 (dow=6)

function task(partial: Partial<SchedulableTask>): SchedulableTask {
  return { day_type: 'both', recurrence_days: null, due_date: null, ...partial };
}

describe('isTaskDueToday', () => {
  it('both：平日與週末都顯示', () => {
    expect(isTaskDueToday(task({ day_type: 'both' }), WED)).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'both' }), SAT)).toBe(true);
  });

  it('weekday：只在平日顯示', () => {
    expect(isTaskDueToday(task({ day_type: 'weekday' }), WED)).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'weekday' }), SAT)).toBe(false);
  });

  it('weekend：只在週末顯示', () => {
    expect(isTaskDueToday(task({ day_type: 'weekend' }), SAT)).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'weekend' }), WED)).toBe(false);
  });

  it('custom：recurrence_days 含今天星期幾才顯示', () => {
    expect(isTaskDueToday(task({ day_type: 'custom', recurrence_days: [1, 3, 5] }), WED)).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'custom', recurrence_days: [1, 3, 5] }), SAT)).toBe(false);
    expect(isTaskDueToday(task({ day_type: 'custom', recurrence_days: [0, 6] }), SAT)).toBe(true);
  });

  it('custom：recurrence_days 為 null 時不顯示', () => {
    expect(isTaskDueToday(task({ day_type: 'custom', recurrence_days: null }), WED)).toBe(false);
  });

  it('once：沒有 due_date 就顯示', () => {
    expect(isTaskDueToday(task({ day_type: 'once' }), WED)).toBe(true);
  });

  it('due_date 已過（早於今天）一律不顯示，即使是 both', () => {
    // 參考日台北 2026-07-08，昨天到期
    expect(isTaskDueToday(task({ day_type: 'once', due_date: '2026-07-07' }), WED)).toBe(false);
    expect(isTaskDueToday(task({ day_type: 'both', due_date: '2026-07-07' }), WED)).toBe(false);
  });

  it('due_date 為今天或未來仍顯示', () => {
    expect(isTaskDueToday(task({ day_type: 'once', due_date: '2026-07-08' }), WED)).toBe(true);
    expect(isTaskDueToday(task({ day_type: 'once', due_date: '2026-07-09' }), WED)).toBe(true);
  });
});
