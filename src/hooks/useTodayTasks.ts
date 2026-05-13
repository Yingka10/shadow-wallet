import { useEffect, useCallback, useRef, useState } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from '../lib/supabase';
import { applyHabitResume } from '../lib/taskActions';
import type { Task, LongTermGoal } from '../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

export type TodayTask = Task & {
  isCompleted: boolean;
  goal?: LongTermGoal;
};

export type UseTodayTasksResult = {
  weekdayTasks: TodayTask[];
  weekendTasks: TodayTask[];
  longTermTasks: TodayTask[];
  isPrerequisiteMet: boolean;
  completedTodayIds: Set<string>;
  loading: boolean;
  refresh: () => void;
};

function getTodayStr(): string {
  return dayjs().tz(TZ).format('YYYY-MM-DD');
}

function isWeekendToday(): boolean {
  const day = dayjs().tz(TZ).day(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

export function useTodayTasks(childId: string): UseTodayTasksResult {
  const [weekdayTasks, setWeekdayTasks] = useState<TodayTask[]>([]);
  const [weekendTasks, setWeekendTasks] = useState<TodayTask[]>([]);
  const [longTermTasks, setLongTermTasks] = useState<TodayTask[]>([]);
  const [completedTodayIds, setCompletedTodayIds] = useState<Set<string>>(new Set());
  const [isPrerequisiteMet, setIsPrerequisiteMet] = useState(false);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const today = getTodayStr();
      const weekend = isWeekendToday();

      // 1. Get task IDs assigned to this child
      const { data: childTaskRows, error: ctErr } = await supabase
        .from('child_tasks')
        .select('task_id')
        .eq('child_id', childId)
        .eq('is_active', true);

      if (ctErr) throw ctErr;
      const taskIds = (childTaskRows ?? []).map(r => r.task_id);
      if (taskIds.length === 0) {
        setWeekdayTasks([]);
        setWeekendTasks([]);
        setLongTermTasks([]);
        setCompletedTodayIds(new Set());
        setIsPrerequisiteMet(true);
        return;
      }

      // 2. Fetch task details
      const { data: taskRows, error: tErr } = await supabase
        .from('tasks')
        .select('*')
        .in('id', taskIds)
        .eq('is_active', true);

      if (tErr) throw tErr;
      const tasks: Task[] = taskRows ?? [];

      // 3. Fetch today's completions
      const { data: completionRows, error: cErr } = await supabase
        .from('task_completions')
        .select('task_id')
        .eq('child_id', childId)
        .gte('completed_at', today)
        .lt('completed_at', dayjs().tz(TZ).add(1, 'day').format('YYYY-MM-DD'));

      if (cErr) throw cErr;
      const completedIds = new Set((completionRows ?? []).map(r => r.task_id));
      setCompletedTodayIds(completedIds);

      // 4. Fetch active long-term goals
      const { data: goalRows, error: gErr } = await supabase
        .from('long_term_goals')
        .select('*')
        .eq('child_id', childId)
        .eq('status', 'active');

      if (gErr) throw gErr;
      const goals: LongTermGoal[] = goalRows ?? [];
      const goalsByTaskId = new Map(goals.map(g => [g.task_id, g]));

      // 5. Apply habit resume (soft reset) for missed days
      for (const goal of goals) {
        if (goal.goal_type === 'habit') {
          await applyHabitResume(
            goal.id,
            childId,
            goal.task_id,
            goal.current_day,
            goal.checkpoint_rewards,
          );
        }
      }

      // 6. Derive prerequisite status: all Task-A and Task-B completed today
      const aTasks = tasks.filter(t => t.category === 'A' && !t.is_long_term);
      const bTasks = tasks.filter(t => t.category === 'B' && !t.is_long_term);
      const prereqMet =
        aTasks.every(t => completedIds.has(t.id)) &&
        bTasks.every(t => completedIds.has(t.id));
      setIsPrerequisiteMet(prereqMet);

      // 7. Split into three buckets
      const shortTermTasks = tasks.filter(t => !t.is_long_term);
      const longTerm = tasks
        .filter(t => t.is_long_term)
        .map(t => ({ ...t, isCompleted: completedIds.has(t.id), goal: goalsByTaskId.get(t.id) }));

      // Weekday tasks: day_type='weekday' or 'both'
      // On weekdays show all; on weekends show only 'both'
      const wdFilter = weekend
        ? shortTermTasks.filter(t => t.day_type === 'both')
        : shortTermTasks.filter(t => t.day_type === 'weekday' || t.day_type === 'both');

      // Weekend tasks: day_type='weekend' or 'both'
      // On weekends show all; on weekdays show only 'both'
      const weFilter = weekend
        ? shortTermTasks.filter(t => t.day_type === 'weekend' || t.day_type === 'both')
        : shortTermTasks.filter(t => t.day_type === 'both');

      const sortTasks = (list: Task[]): TodayTask[] => {
        const incomplete = list
          .filter(t => !completedIds.has(t.id) || t.allow_repeat)
          .sort((a, b) => {
            const order: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
            return (order[a.category] ?? 4) - (order[b.category] ?? 4);
          });
        const complete = list
          .filter(t => completedIds.has(t.id) && !t.allow_repeat)
          .map(t => ({ ...t, isCompleted: true }));
        return [
          ...incomplete.map(t => ({ ...t, isCompleted: completedIds.has(t.id) })),
          ...complete,
        ];
      };

      setWeekdayTasks(sortTasks(wdFilter));
      setWeekendTasks(sortTasks(weFilter));
      setLongTermTasks(longTerm);
    } catch (err) {
      console.error('[useTodayTasks] fetchAll error:', err);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  // Subscribe to realtime changes on task_completions for this child
  useEffect(() => {
    let isMounted = true;

    const setupSubscription = async () => {
      // Load initial data
      await fetchAll();

      // Unsubscribe from old channel if it exists
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      if (!isMounted) return;

      // Create new subscription channel
      const channel = supabase
        .channel(`task_completions:child_${childId}`, { config: { broadcast: { self: false } } })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'task_completions',
            filter: `child_id=eq.${childId}`,
          },
          () => {
            if (isMounted) {
              fetchAll();
            }
          },
        )
        .subscribe();

      if (isMounted) {
        channelRef.current = channel;
      }
    };

    setupSubscription();

    return () => {
      isMounted = false;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [childId]);

  return {
    weekdayTasks,
    weekendTasks,
    longTermTasks,
    isPrerequisiteMet,
    completedTodayIds,
    loading,
    refresh: fetchAll,
  };
}
