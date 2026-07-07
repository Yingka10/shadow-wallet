import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type { Task } from '../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

/** The fields needed to decide whether a task belongs on "today"'s list. */
export type SchedulableTask = Pick<Task, 'day_type' | 'recurrence_days' | 'due_date'>;

/**
 * 判斷一個「非長期」任務今天（Asia/Taipei）該不該出現在當日清單。
 *
 * 這是孩子端 (`useTodayTasks`) 與家長端今日總覽 (`useParentDashboard`) 共用的
 * 唯一事實來源——兩邊各自複製這段邏輯正是先前「兩邊任務不一樣」的根因，抽成
 * 一個函數避免再次漂移。
 *
 * 規則（與孩子端原本內嵌邏輯 1:1 一致）：
 * - `due_date` 已過（早於今天）→ 不顯示（隱藏過期的一次性任務）。
 * - `both`：每天顯示。
 * - `weekday` / `weekend`：只在平日 / 週末顯示。
 * - `custom`：`recurrence_days` 包含今天星期幾才顯示。
 * - `once`：顯示（過期與否由上面的 `due_date` 判斷把關）。
 *
 * 長期任務（`is_long_term`）不走這裡——它們有自己的區塊，呼叫端先自行排除。
 *
 * @param task 至少含 `day_type` / `recurrence_days` / `due_date` 的任務。
 * @param now  參考時間，預設為現在；主要供測試注入固定時間。
 */
export function isTaskDueToday(task: SchedulableTask, now?: dayjs.ConfigType): boolean {
  const ref = dayjs(now).tz(TZ);
  const today = ref.format('YYYY-MM-DD');
  const dow = ref.day(); // 0=Sun, 1=Mon, ..., 6=Sat
  const weekend = dow === 0 || dow === 6;

  // Hide tasks whose due_date has already passed.
  if (task.due_date && task.due_date < today) return false;

  switch (task.day_type) {
    case 'both':    return true;
    case 'weekday': return !weekend;
    case 'weekend': return weekend;
    case 'custom':  return (task.recurrence_days ?? []).includes(dow);
    case 'once':    return true;
    default:        return false;
  }
}
