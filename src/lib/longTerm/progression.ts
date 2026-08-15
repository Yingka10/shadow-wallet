// GrowBook — 一份長期計畫「怎麼往前走」（LT-FINAL-1R §A）
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支是**唯一**決定 progression 的地方。Home、Detail、Progress、
// Milestone、完成能力全部問它 —— 各自猜一次的結果就是首頁說 0%、
// 點進去說本週 2/3。
//
// ⚠️ 判準只看**結構化證據**。以下四樣一律不得參與：
//
//    goal_type      它由兩條路徑寫：建立時由 plan_mode 推成 skill，
//                   weekly_rhythm 的 child proposal 又會被改寫成 habit。
//                   同一個欄位兩種來源，它說的不是「怎麼前進」。
//    task.name      內容嗅探。一個叫「閱讀習慣」的家長自訂任務會被誤判，
//                   一個叫「每天練琴 15 分鐘」的節奏計畫則認不出來。
//    category       那是「為什麼做」（A/B/C/D），不是「怎麼前進」。
//    duration_type  長期不是一種進度模型，是執行期間。
//
// 讀不出來就回 null。**不猜** —— 猜出來的階段制會讓孩子看到一個他
// 從來沒有規劃過的進度條。
// ─────────────────────────────────────────────────────────────────────────

import type { LongTermGoal, Task } from '../../types/database';

export type LongTermProgression =
  /** 每週節奏：一週做幾次，中斷不歸零。終點是日期，不是次數。 */
  | 'rhythm'
  /** 固定星期：每週的哪幾天。 */
  | 'fixed_days'
  /** 階段制：真的有 level 定義，由家長確認。 */
  | 'staged'
  /** 累積制：真的有目標值與單位。 */
  | 'accumulation';

/** 真的有階段可走嗎。level_count 是家長設的，level_definitions 是內容。 */
export function hasLevelEvidence(goal: LongTermGoal | null | undefined): boolean {
  if (!goal) return false;
  if (typeof goal.level_count === 'number' && goal.level_count > 0) return true;
  return Array.isArray(goal.level_definitions) && goal.level_definitions.length > 0;
}

/** 真的有累積目標嗎。**不從任務名稱 parse 數字**（§O）。 */
export function hasAccumulationEvidence(goal: LongTermGoal | null | undefined): boolean {
  if (!goal) return false;
  return typeof goal.target_value === 'number'
    && goal.target_value > 0
    && typeof goal.value_unit === 'string'
    && goal.value_unit.trim().length > 0;
}

/**
 * 真的有固定星期嗎。
 *
 * ⚠️ 兩邊都沒有值時**不要**回退成週一到週五或整週 —— 那是憑空發明一張
 *    行程表，而孩子會照著它以為今天該做。
 */
export function fixedDayEvidence(
  task: Pick<Task, 'recurrence_days'> | null | undefined,
  goal: LongTermGoal | null | undefined,
): number[] {
  const configured = goal?.active_days ?? task?.recurrence_days ?? null;
  if (!Array.isArray(configured)) return [];
  return [...new Set(
    configured.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  )].sort((a, b) => a - b);
}

export function resolveLongTermProgression(
  task: Task | null | undefined,
  goal: LongTermGoal | null | undefined,
): LongTermProgression | null {
  if (!task) return null;

  // 1–2. 節奏的證據最強：progress_model 是 P0 契約推導出來的（證據不足
  //      時它就是 null，不會亂寫），schedule_mode 是家庭實際約定的排法。
  if (task.progress_model === 'weekly_rhythm') return 'rhythm';
  if (task.schedule_mode === 'weekly_frequency') return 'rhythm';

  // 3–4. 階段與累積都要**真的有那個東西**才算。
  if (hasLevelEvidence(goal)) return 'staged';
  if (hasAccumulationEvidence(goal)) return 'accumulation';

  // 5. 固定星期。
  if (fixedDayEvidence(task, goal).length > 0) return 'fixed_days';

  return null;
}

/** 這種進度模型支不支援孩子自己打卡。 */
export function progressionSupportsChildCheckIn(
  progression: LongTermProgression | null,
): boolean {
  return progression === 'rhythm' || progression === 'fixed_days';
}
