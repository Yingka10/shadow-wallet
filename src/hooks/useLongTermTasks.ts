import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { LongTermType } from '../types/database';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LongTermTaskItem = {
  id: string;
  name: string;
  goalType: LongTermType;
  progressPct: number;
  progressLabel: string;
};

export type LongTermTasksData = {
  items: LongTermTaskItem[];
  totalActive: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type GoalRow = {
  id: string;
  task_id: string;
  goal_type: LongTermType;
  current_day: number;
  total_days: number | null;
  current_level: number | null;
  level_count: number | null;
  target_completions: number | null;
  current_value: number | null;
  target_value: number | null;
  value_unit: string | null;
};

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
    case 'responsibility': {
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
      // Unknown / null goal_type — never crash the list, show a neutral fallback.
      return { pct: 0, label: '進行中' };
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLongTermTasks(childId: string): LongTermTasksData {
  const [items, setItems] = useState<LongTermTaskItem[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!childId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data: goals, error: goalsErr } = await supabase
        .from('long_term_goals')
        .select('id, task_id, goal_type, current_day, total_days, current_level, level_count, target_completions, current_value, target_value, value_unit')
        .eq('child_id', childId)
        .eq('status', 'active')
        .order('started_at', { ascending: false });

      if (goalsErr) throw goalsErr;

      // Guard against legacy/bad rows: only keep goals with a known goal_type so
      // downstream UI lookups (GOAL_TYPE_META, deriveProgress) never hit undefined.
      const validGoalTypes: LongTermType[] = ['habit', 'skill', 'responsibility', 'challenge'];
      const validGoals = ((goals ?? []) as GoalRow[]).filter(g =>
        validGoalTypes.includes(g.goal_type),
      );

      if (validGoals.length === 0) {
        setItems([]);
        setTotalActive(0);
        return;
      }

      setTotalActive(validGoals.length);
      const preview = validGoals.slice(0, 3);
      const taskIds = preview.map(g => g.task_id);

      const { data: tasks, error: tasksErr } = await supabase
        .from('tasks')
        .select('id, name')
        .in('id', taskIds);

      if (tasksErr) throw tasksErr;

      const nameMap = new Map((tasks ?? []).map(t => [t.id, t.name as string]));

      setItems(preview.map(g => {
        const { pct, label } = deriveProgress(g);
        return {
          id: g.id,
          name: nameMap.get(g.task_id) ?? '未命名任務',
          goalType: g.goal_type,
          progressPct: pct,
          progressLabel: label,
        };
      }));
    } catch (err) {
      console.error('[useLongTermTasks] error:', err);
      setError('資料載入失敗');
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  return { items, totalActive, loading, error, refresh: fetchAll };
}
