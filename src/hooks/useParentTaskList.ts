import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from '../lib/supabase';
import type { Child, Task, TaskCategory, DayType } from '../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TaskListItem = {
  id: string;
  name: string;
  cat: TaskCategory;
  difficulty: number;
  freqLabel: string;
  reward: { kind: 'coins'; amount: number } | { kind: 'time'; amount: number } | null;
  isLongTerm: boolean;
};

export type ParentTaskListData = {
  child: Child | null;
  tasks: TaskListItem[];
  todayCompletedIds: Set<string>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_TYPE_LABEL: Record<DayType, string> = {
  weekday: '平日',
  weekend: '假日',
  both:    '每日',
};

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
        supabase.from('child_tasks').select('task_id').eq('child_id', childId).eq('is_active', true),
        supabase.from('task_completions')
          .select('task_id')
          .eq('child_id', childId)
          .gte('completed_at', today)
          .lt('completed_at', tomorrow),
      ]);

      if (childRes.error) throw childRes.error;
      setChild(childRes.data);

      const taskIds = (ctRes.data ?? []).map(r => r.task_id);
      setTodayCompletedIds(new Set((completionsRes.data ?? []).map(r => r.task_id)));

      if (taskIds.length === 0) {
        setTasks([]);
        return;
      }

      // ── Round 2: fetch task details ───────────────────────────────────────
      const { data: taskRows, error: tasksErr } = await supabase
        .from('tasks')
        .select('*')
        .in('id', taskIds)
        .eq('is_active', true);

      if (tasksErr) throw tasksErr;

      const items: TaskListItem[] = (taskRows ?? [])
        .map((task): TaskListItem => ({
          id:        task.id,
          name:      task.name,
          cat:       task.category,
          difficulty: task.difficulty,
          freqLabel: DAY_TYPE_LABEL[task.day_type],
          reward:    deriveReward(task),
          isLongTerm: task.is_long_term,
        }))
        .sort((a, b) => CAT_ORDER[a.cat] - CAT_ORDER[b.cat]);

      setTasks(items);
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

  return { child, tasks, todayCompletedIds, loading, error, refresh: fetchAll };
}
