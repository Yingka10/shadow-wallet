import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from '../lib/supabase';
import type { Child, Task, TaskCategory } from '../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

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
};

export type ParentTaskListData = {
  child: Child | null;
  tasks: TaskListItem[];          // active tasks only
  inactiveTasks: TaskListItem[];  // tasks stopped for this child
  todayCompletedIds: Set<string>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
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

function deriveReward(task: Task): TaskListItem['reward'] {
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
    setLoading(true);
    setError(null);
    try {
      const today    = dayjs().tz(TZ).format('YYYY-MM-DD');
      const tomorrow = dayjs().tz(TZ).add(1, 'day').format('YYYY-MM-DD');

      // ── Round 1: parallel ─────────────────────────────────────────────────
      const [childRes, ctRes, completionsRes] = await Promise.all([
        supabase.from('children').select('*').eq('id', childId).single(),
        // Fetch all child_tasks (active + inactive) so we can show the stopped list
        supabase.from('child_tasks').select('id, task_id, is_active').eq('child_id', childId),
        supabase.from('task_completions')
          .select('task_id')
          .eq('child_id', childId)
          .gte('completed_at', today)
          .lt('completed_at', tomorrow),
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
