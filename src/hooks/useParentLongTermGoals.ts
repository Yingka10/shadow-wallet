import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  pauseLongTermGoal,
  resumeLongTermGoal,
  deleteLongTermGoal,
} from '../lib/taskActions';
import type { LongTermType, GoalStatus } from '../types/database';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LongTermGoalItem = {
  id: string;
  taskId: string;
  name: string;
  goalType: LongTermType;
  status: GoalStatus;
  progressPct: number;
  progressLabel: string;
};

export type ParentLongTermGoalsData = {
  items: LongTermGoalItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  pause: (goalId: string) => Promise<void>;
  resume: (goalId: string) => Promise<void>;
  remove: (goalId: string, taskId: string) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type GoalRow = {
  id: string;
  task_id: string;
  goal_type: LongTermType;
  status: GoalStatus;
  current_day: number;
  total_days: number | null;
  current_level: number | null;
  level_count: number | null;
  target_completions: number | null;
  current_value: number | null;
  target_value: number | null;
  value_unit: string | null;
};

const VALID_GOAL_TYPES: LongTermType[] = ['habit', 'skill', 'family', 'challenge'];

function deriveProgress(g: GoalRow): { pct: number; label: string } {
  switch (g.goal_type) {
    case 'habit': {
      const total = g.total_days ?? 1;
      return {
        pct: Math.min(100, Math.round((g.current_day / total) * 100)),
        label: `第 ${g.current_day} 天 / 共 ${total} 天`,
      };
    }
    case 'skill': {
      const cur = g.current_level ?? 0;
      const total = g.level_count ?? 1;
      return {
        pct: Math.min(100, Math.round((cur / total) * 100)),
        label: `第 ${cur} 關 / 共 ${total} 關`,
      };
    }
    case 'family': {
      const total = g.target_completions ?? 1;
      return {
        pct: Math.min(100, Math.round((g.current_day / total) * 100)),
        label: `完成 ${g.current_day} 次 / 目標 ${total} 次`,
      };
    }
    case 'challenge': {
      const cur = g.current_value ?? 0;
      const total = g.target_value ?? 1;
      const unit = g.value_unit ? ` ${g.value_unit}` : '';
      return {
        pct: Math.min(100, Math.round((cur / total) * 100)),
        label: `${cur} / ${total}${unit}`,
      };
    }
    default:
      return { pct: 0, label: '進行中' };
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * 抓取某孩子所有「進行中 / 已暫停」的長期任務（家長管理頁用），含進度與
 * 暫停 / 恢復 / 刪除動作。已完成（completed）的目標不在此列出。
 */
export function useParentLongTermGoals(childId: string): ParentLongTermGoalsData {
  const [items, setItems] = useState<LongTermGoalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!childId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data: goals, error: goalsErr } = await supabase
        .from('long_term_goals')
        .select('id, task_id, goal_type, status, current_day, total_days, current_level, level_count, target_completions, current_value, target_value, value_unit')
        .eq('child_id', childId)
        .in('status', ['active', 'paused'])
        .order('started_at', { ascending: false });

      if (goalsErr) throw goalsErr;

      const validGoals = ((goals ?? []) as GoalRow[]).filter(g =>
        VALID_GOAL_TYPES.includes(g.goal_type),
      );

      if (validGoals.length === 0) {
        setItems([]);
        return;
      }

      const taskIds = validGoals.map(g => g.task_id);
      const { data: tasks, error: tasksErr } = await supabase
        .from('tasks')
        .select('id, name')
        .in('id', taskIds);

      if (tasksErr) throw tasksErr;

      const nameMap = new Map((tasks ?? []).map(t => [t.id, t.name as string]));

      setItems(validGoals.map(g => {
        const { pct, label } = deriveProgress(g);
        return {
          id: g.id,
          taskId: g.task_id,
          name: nameMap.get(g.task_id) ?? '未命名任務',
          goalType: g.goal_type,
          status: g.status,
          progressPct: pct,
          progressLabel: label,
        };
      }));
    } catch (err) {
      console.error('[useParentLongTermGoals] error:', err);
      setError('資料載入失敗');
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const pause = useCallback(async (goalId: string) => {
    await pauseLongTermGoal(goalId);
    await fetchAll();
  }, [fetchAll]);

  const resume = useCallback(async (goalId: string) => {
    await resumeLongTermGoal(goalId);
    await fetchAll();
  }, [fetchAll]);

  const remove = useCallback(async (goalId: string, taskId: string) => {
    await deleteLongTermGoal(goalId, taskId);
    await fetchAll();
  }, [fetchAll]);

  return { items, loading, error, refresh: fetchAll, pause, resume, remove };
}
