import { useEffect, useCallback, useRef, useState } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from '../lib/supabase';
import { applyHabitResume } from '../lib/taskActions';
import { taipeiDayRange } from '../lib/taipeiDate';
import { isTaskDueToday } from '../lib/taskSchedule';
import type { Task, LongTermGoal } from '../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

export type TodayTask = Task & {
  isCompleted: boolean;
  goal?: LongTermGoal;
};

export type UseTodayTasksResult = {
  weekdayTasks: TodayTask[];
  weekendTasks: TodayTask[];
  longTermTasks: TodayTask[];
  tempTasks: TodayTask[];
  isPrerequisiteMet: boolean;
  completedTodayIds: Set<string>;
  loading: boolean;
  refresh: () => void;
};

export function useTodayTasks(childId: string): UseTodayTasksResult {
  const [weekdayTasks, setWeekdayTasks] = useState<TodayTask[]>([]);
  const [weekendTasks, setWeekendTasks] = useState<TodayTask[]>([]);
  const [longTermTasks, setLongTermTasks] = useState<TodayTask[]>([]);
  const [tempTasks, setTempTasks] = useState<TodayTask[]>([]);
  const [completedTodayIds, setCompletedTodayIds] = useState<Set<string>>(new Set());
  const [isPrerequisiteMet, setIsPrerequisiteMet] = useState(false);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const channelNameRef = useRef(`task_completions:child_${childId}_${Date.now()}`);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
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
        setTempTasks([]);
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

      // 3. Fetch today's completions.
      // Compare against UTC-instant bounds of the Taipei calendar day — a bare
      // 'YYYY-MM-DD' string is cast as UTC midnight, so completions made during
      // Taipei 00:00–08:00 would be missed and the task never shows as done.
      const { startIso, endIso } = taipeiDayRange();
      const { data: completionRows, error: cErr } = await supabase
        .from('task_completions')
        .select('task_id')
        .eq('child_id', childId)
        .gte('completed_at', startIso)
        .lt('completed_at', endIso);

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
            goal.active_days,
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
      const longTerm = tasks
        .filter(t => t.is_long_term)
        .map(t => ({ ...t, isCompleted: completedIds.has(t.id), goal: goalsByTaskId.get(t.id) }));

      // 今天該顯示的短期任務。判斷邏輯抽到 isTaskDueToday，與家長端今日總覽
      // (useParentDashboard) 共用同一事實來源，避免兩邊清單再次漂移。
      const shortTermTasks = tasks
        .filter(t => !t.is_long_term)
        .filter(t => isTaskDueToday(t));

      // 臨時任務：day_type='once' 且 due_date > 今天 → 獨立 bucket，不進今日清單
      const todayStr = dayjs().tz('Asia/Taipei').format('YYYY-MM-DD');
      const tempTasksList = tasks
        .filter(t => !t.is_long_term && t.day_type === 'once' && t.due_date && t.due_date > todayStr)
        .map(t => ({ ...t, isCompleted: completedIds.has(t.id) }));
      setTempTasks(tempTasksList);

      // 'custom' and 'once' tasks appear in whichever section is relevant today.
      // Exclude 'weekend'-only tasks on weekdays and vice versa.
      const wdFilter = shortTermTasks.filter(t => t.day_type !== 'weekend');
      const weFilter = shortTermTasks.filter(t => t.day_type !== 'weekday');

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
        .channel(channelNameRef.current, { config: { broadcast: { self: false } } })
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
    tempTasks,
    isPrerequisiteMet,
    completedTodayIds,
    loading,
    refresh: fetchAll,
  };
}
