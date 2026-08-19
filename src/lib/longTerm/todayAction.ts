// GrowBook — 今天要做的那一句話（LT-FINAL-1R §G）
//
// ─────────────────────────────────────────────────────────────────────────
// 只能來自 canonical 來源。之前這裡會自己生：
//
//     「${task.name} ${base_time_min} 分鐘，今天繼續就好」
//     「慢慢把左右手合起來」
//
// 那是 UI 在給方法建議，而它背後沒有任何人說過那句話 —— 家長沒說、
// 孩子沒寫、AI 也沒有。畫面上出現的每一句方法，都要指得出誰講的。
//
// 時間讀 estimated_minutes（家長估計的投入），**不是** base_time_min ——
// 後者是舊幣值公式的輸入，與「今天要做多久」無關。
// ─────────────────────────────────────────────────────────────────────────

import type { Task } from '../../types/database';
import type { ChildConfirmedPlanView } from './sharedPlanLineage';

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function resolveTodayAction(
  task: Pick<Task, 'next_step' | 'completion_description' | 'name'>,
  childPlan: ChildConfirmedPlanView | null,
): string {
  return text(task.next_step)
    // 孩子自己寫的第一步。task.next_step 通常就是從這裡來的，
    // 但共同版本被改寫過時，孩子那一句仍然是他自己的話。
    ?? text(childPlan?.nextAction)
    // deterministic fallback：怎樣算完成一次，是正式欄位不是建議。
    ?? text(task.completion_description)
    ?? task.name;
}

/** 每次大約多久。沒有值就是沒有，不要拿 base_time_min 頂。 */
export function resolveSessionMinutes(
  task: Pick<Task, 'estimated_minutes'>,
): number | null {
  return typeof task.estimated_minutes === 'number' && task.estimated_minutes > 0
    ? task.estimated_minutes
    : null;
}
