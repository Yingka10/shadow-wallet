import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { taipeiDayRange } from '../lib/taipeiDate';
import {
  mapTaskToDisplayGroup,
  type ParentTaskDisplayGroup,
} from '../lib/parentTaskDisplayGroup';
import type { Child, RewardPolicyValue, Task, TaskCategory } from '../types/database';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TaskListItem = {
  id: string;
  childTaskId: string;  // child_tasks.id — used for deactivate/reactivate
  name: string;
  cat: TaskCategory;
  difficulty: number;
  freqLabel: string;
  reward: { kind: 'coins'; amount: number } | { kind: 'time'; amount: number } | null;
  isLongTerm: boolean;
  isActive: boolean;    // child_tasks.is_active
  childTaskCreatedAt: string;
  taskCreatedAt: string;
  /** NULL = 這一版之前建立的任務，分組沿用舊的 category 規則。 */
  rewardPolicy: RewardPolicyValue | null;
  /** 依 reward_policy（legacy 才看 category）決定的顯示分區。 */
  displayGroup: ParentTaskDisplayGroup;
};

export type ParentTaskListData = {
  child: Child | null;
  tasks: TaskListItem[];          // active tasks only
  inactiveTasks: TaskListItem[];  // tasks stopped for this child
  todayCompletedIds: Set<string>;
  loading: boolean;
  error: string | null;
  /**
   * 重新抓一次。回 Promise 是為了讓呼叫端等得到 ——
   * 建立任務之後要「更新完再切分頁」，fire-and-forget 會讓家長切過去看到舊清單。
   */
  refresh: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveFreqLabel(task: Task): string {
  if (task.day_type === 'once') {
    return task.due_date ? `截止 ${task.due_date.slice(5)}` : '一次性';
  }
  if (task.day_type === 'both')    return '每日';
  if (task.day_type === 'weekday') return '平日';
  if (task.day_type === 'weekend') return '假日';
  if (task.day_type === 'custom' && task.recurrence_days?.length) {
    const days = [...task.recurrence_days].sort((a, b) => a - b);
    if (days.length === 7) return '每日';
    if (JSON.stringify(days) === JSON.stringify([1, 2, 3, 4, 5])) return '平日';
    if (JSON.stringify(days) === JSON.stringify([0, 6])) return '週末';
    const LABELS = ['日', '一', '二', '三', '四', '五', '六'];
    return days.map(d => `週${LABELS[d]}`).join(' ');
  }
  return task.day_type;
}

const CAT_ORDER: Record<TaskCategory, number> = { A: 0, B: 1, C: 2, D: 3 };

/**
 * 這個任務完成後會得到什麼。
 *
 * 新任務（reward_policy 有值）與 legacy 任務走完全不同的兩條路，
 * 而且**刻意不共用計算**：新任務的幣值是政策定價後寫進 reward_coin_amount 的，
 * legacy 的是 base_time_min × difficulty 現場算的。讓它們共用一個公式，
 * 等於讓其中一邊的改動悄悄改掉另一邊。這與 complete_task 的分岔方式一致。
 */
function deriveReward(task: Task): TaskListItem['reward'] {
  if (task.reward_policy) {
    if (task.reward_policy !== 'coin_eligible') return null;
    const amount = task.reward_coin_amount ?? 0;
    // 0 幣的 coin_eligible 任務不該存在（DB 有 CHECK 擋著）。真的出現時
    // 顯示「無」而不是「0 枚」——後者看起來像系統算出來的結果。
    return amount > 0 ? { kind: 'coins', amount } : null;
  }

  // ── 以下是 legacy 路徑，與這一版之前完全相同 ──
  if (task.category === 'A') return null;
  if (task.category === 'B') return { kind: 'time', amount: task.time_saving_min };
  if (task.is_long_term) return null;
  const amount = task.coin_override ?? Math.round(task.base_time_min * task.difficulty);
  return { kind: 'coins', amount };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useParentTaskList(childId: string): ParentTaskListData {
  const [child, setChild] = useState<Child | null>(null);
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [inactiveTasks, setInactiveTasks] = useState<TaskListItem[]>([]);
  const [todayCompletedIds, setTodayCompletedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    // childId 在孩子清單載入完成前是空字串。沒有這道防線的話會送出 `id=eq.`，
    // Postgres 以 22P02（invalid input syntax for type uuid: ""）回 400，
    // 畫面就停在「資料載入失敗」而不是等資料進來。
    // useParentLongTermGoals 早就有同一道防線，這裡補齊。
    if (!childId) {
      setChild(null);
      setTasks([]);
      setInactiveTasks([]);
      setTodayCompletedIds(new Set());
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Taipei-day UTC bounds — a bare 'YYYY-MM-DD' would be read as UTC midnight
      // and miss completions made during Taipei 00:00–08:00.
      const { startIso, endIso } = taipeiDayRange();

      // ── Round 1: parallel ─────────────────────────────────────────────────
      const [childRes, ctRes, completionsRes] = await Promise.all([
        supabase.from('children').select('*').eq('id', childId).single(),
        // Fetch all child_tasks (active + inactive) so we can show the stopped list
        supabase.from('child_tasks').select('id, task_id, is_active, created_at').eq('child_id', childId),
        supabase.from('task_completions')
          .select('task_id')
          .eq('child_id', childId)
          .gte('completed_at', startIso)
          .lt('completed_at', endIso),
      ]);

      if (childRes.error) throw childRes.error;
      setChild(childRes.data);

      const allCtRows = (ctRes.data ?? []);
      const taskIds = allCtRows.map(r => r.task_id);
      setTodayCompletedIds(new Set((completionsRes.data ?? []).map(r => r.task_id)));

      if (taskIds.length === 0) {
        setTasks([]);
        setInactiveTasks([]);
        return;
      }

      // ── Round 2: fetch task details (only globally active tasks) ──────────
      const { data: taskRows, error: tasksErr } = await supabase
        .from('tasks')
        .select('*')
        .in('id', taskIds)
        .eq('is_active', true);

      if (tasksErr) throw tasksErr;

      const taskMap = new Map((taskRows ?? []).map(t => [t.id, t]));

      const activeItems: TaskListItem[] = [];
      const inactiveItems: TaskListItem[] = [];

      for (const ct of allCtRows) {
        const task = taskMap.get(ct.task_id);
        if (!task) continue; // globally deleted — skip

        const item: TaskListItem = {
          id:          task.id,
          childTaskId: ct.id,
          name:        task.name,
          cat:         task.category,
          difficulty:  task.difficulty,
          freqLabel:   deriveFreqLabel(task),
          reward:      deriveReward(task),
          isLongTerm:  task.is_long_term,
          isActive:    ct.is_active,
          childTaskCreatedAt: ct.created_at,
          taskCreatedAt: task.created_at,
          rewardPolicy: task.reward_policy ?? null,
          displayGroup: mapTaskToDisplayGroup({
            category: task.category,
            rewardPolicy: task.reward_policy ?? null,
          }),
        };

        if (ct.is_active) {
          activeItems.push(item);
        } else {
          inactiveItems.push(item);
        }
      }

      activeItems.sort((a, b) => CAT_ORDER[a.cat] - CAT_ORDER[b.cat]);
      inactiveItems.sort((a, b) => CAT_ORDER[a.cat] - CAT_ORDER[b.cat]);

      setTasks(activeItems);
      setInactiveTasks(inactiveItems);
    } catch (err) {
      console.error('[useParentTaskList] error:', err);
      setError('資料載入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { child, tasks, inactiveTasks, todayCompletedIds, loading, error, refresh: fetchAll };
}
