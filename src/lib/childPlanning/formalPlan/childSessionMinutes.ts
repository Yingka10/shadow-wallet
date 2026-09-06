// 孩子自己決定的單次份量 —— 與 publish RPC 的判準鏡射。
//
// ─────────────────────────────────────────────────────────────────────────
// publish_child_confirmed_plan_v1 決定 estimated_minutes 的規則是：
//
//   IF (v_plan -> 'sessionSize' ->> 'kind') = 'minutes'
//     AND (v_plan -> 'provenance' -> 'fields' ->> 'sessionSize')
//         IN ('child_stated', 'derived_from_child')
//
// 也就是「模型估的份量不算，孩子講過的才算」。
//
// 這裡要有一份一模一樣的判準，因為幣值錨點是在 App 端算的，而它必須是
// **RPC 最後寫進 estimated_minutes 的那個數字**的價格。兩邊判準只要有
// 一點不同，就會回到 2026-09-07 那個狀態：計畫寫 10 分鐘、錨點是 15
// 分鐘的價，家長按確認永遠被擋。
//
// ⚠️ 改這裡就要改那支 RPC，反之亦然。
// ─────────────────────────────────────────────────────────────────────────

import type { ChildGoalPlan } from '../types';

const CHILD_OWNED_SESSION_SOURCES: readonly string[] = ['child_stated', 'derived_from_child'];

export function childSessionMinutes(plan: ChildGoalPlan | null | undefined): number | null {
  if (plan === null || plan === undefined) return null;
  if (plan.progressionKind !== 'rhythm') return null;

  const size = plan.sessionSize;
  if (size === null || size === undefined || size.kind !== 'minutes') return null;
  if (!CHILD_OWNED_SESSION_SOURCES.includes(plan.provenance.fields.sessionSize)) return null;

  return Number.isInteger(size.minutes) ? size.minutes : null;
}
