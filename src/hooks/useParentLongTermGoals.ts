import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isoWeek from 'dayjs/plugin/isoWeek';
import { supabase } from '../lib/supabase';
import {
  pauseLongTermGoal,
  resumeLongTermGoal,
  deleteLongTermGoal,
} from '../lib/taskActions';
import {
  createLongTermTaskProgressPresentation,
  progressPercentOf,
  type LongTermMilestone,
  type LongTermTaskProgressPresentation,
} from '../lib/longTermTaskProgress';
import { todayDateString } from '../lib/dateOnly';
import type { LongTermType, GoalStatus, RewardPolicyValue } from '../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

const TZ = 'Asia/Taipei';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LongTermGoalItem = {
  id: string;
  taskId: string;
  name: string;
  goalType: LongTermType;
  status: GoalStatus;
  /**
   * 進度百分比。null = 這種任務算不出有意義的比例（例如期間型的家庭角色）——
   * **不是 0**。0 會被畫成一條空的進度條，那等於宣稱孩子一點都沒做。
   */
  progressPct: number | null;
  progressLabel: string;
  /** 完整的呈現描述。畫面要分辨形式時看它，不要自己判斷 planMode。 */
  progress: LongTermTaskProgressPresentation;
  weeklyCompleted: number;
  previousWeeklyCompleted: number;
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
  first_review_after_days: number | null;
  started_at: string | null;
};

/** 從 tasks 取的、決定「這是新任務還是 legacy」的兩個欄位。 */
type TaskShapeRow = {
  id: string;
  name: string;
  reward_policy: RewardPolicyValue | null;
  plan_mode: 'growth_plan' | 'short_support' | 'family_role' | null;
};

type MilestoneRow = {
  id: string;
  task_id: string;
  title: string;
  target_day: number | null;
  sort_order: number | null;
};

const VALID_GOAL_TYPES: LongTermType[] = ['habit', 'skill', 'responsibility', 'challenge'];

/** 計畫開始日（本地時區的日期，不含時間）。里程碑的第 N 天從這裡算起。 */
function startDateOf(g: GoalRow): string | null {
  return g.started_at ? dayjs(g.started_at).tz(TZ).format('YYYY-MM-DD') : null;
}

/** started_at + firstReviewAfterDays 的日期。算不出來就不給。 */
function firstReviewDateOf(g: GoalRow): string | null {
  if (!g.started_at || !g.first_review_after_days || g.first_review_after_days <= 0) return null;
  return dayjs(g.started_at).tz(TZ).add(g.first_review_after_days, 'day').format('YYYY-MM-DD');
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
        .select('id, task_id, goal_type, status, current_day, total_days, current_level, level_count, target_completions, current_value, target_value, value_unit, first_review_after_days, started_at')
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
      const weekStart = dayjs().tz(TZ).startOf('isoWeek');
      const weekEnd = weekStart.endOf('isoWeek');
      const prevStart = weekStart.subtract(1, 'week');
      const prevEnd = weekEnd.subtract(1, 'week');

      const [
        tasksRes, weeklyCompletionsRes, previousCompletionsRes, milestonesRes,
      ] = await Promise.all([
        supabase
          .from('tasks')
          // reward_policy 與 plan_mode 決定進度該怎麼說 —— 見 longTermTaskProgress。
          .select('id, name, reward_policy, plan_mode')
          .in('id', taskIds),
        supabase
          .from('task_completions')
          .select('task_id')
          .eq('child_id', childId)
          .in('task_id', taskIds)
          .gte('completed_at', weekStart.toISOString())
          .lte('completed_at', weekEnd.toISOString()),
        supabase
          .from('task_completions')
          .select('task_id')
          .eq('child_id', childId)
          .in('task_id', taskIds)
          .gte('completed_at', prevStart.toISOString())
          .lte('completed_at', prevEnd.toISOString()),
        // 成長計畫的里程碑。要 target_day 才講得出「下一個在第幾天」，
        // 要 sort_order 只是為了穩定順序 —— 真正的排序在 presenter 依日期做。
        supabase
          .from('task_plan_milestones')
          .select('id, task_id, title, target_day, sort_order')
          .in('task_id', taskIds),
      ]);

      if (tasksRes.error) throw tasksRes.error;
      if (weeklyCompletionsRes.error) throw weeklyCompletionsRes.error;
      if (previousCompletionsRes.error) throw previousCompletionsRes.error;
      // 里程碑子表是抽屜這一版才有的。舊專案沒有這張表時不該讓整頁掛掉 ——
      // 沒有里程碑就是「進行中的成長計畫」，那本來就是合法的呈現。

      const taskMap = new Map(
        ((tasksRes.data ?? []) as TaskShapeRow[]).map(row => [row.id, row]),
      );
      const milestonesByTask = new Map<string, LongTermMilestone[]>();
      for (const row of (milestonesRes.data ?? []) as MilestoneRow[]) {
        const list = milestonesByTask.get(row.task_id) ?? [];
        list.push({
          id: row.id,
          title: row.title,
          targetDay: row.target_day,
          sortOrder: row.sort_order,
        });
        milestonesByTask.set(row.task_id, list);
      }
      const weeklyDoneByTask = new Map<string, number>();
      const previousDoneByTask = new Map<string, number>();
      for (const completion of weeklyCompletionsRes.data ?? []) {
        weeklyDoneByTask.set(completion.task_id, (weeklyDoneByTask.get(completion.task_id) ?? 0) + 1);
      }
      for (const completion of previousCompletionsRes.data ?? []) {
        previousDoneByTask.set(completion.task_id, (previousDoneByTask.get(completion.task_id) ?? 0) + 1);
      }

      setItems(validGoals.map(g => {
        const task = taskMap.get(g.task_id);
        const progress = createLongTermTaskProgressPresentation({
          task: {
            rewardPolicy: task?.reward_policy ?? null,
            planMode: task?.plan_mode ?? null,
          },
          longTermGoal: {
            goalType: g.goal_type,
            currentDay: g.current_day,
            totalDays: g.total_days,
            currentLevel: g.current_level,
            levelCount: g.level_count,
            targetCompletions: g.target_completions,
            currentValue: g.current_value,
            targetValue: g.target_value,
            valueUnit: g.value_unit,
            firstReviewAfterDays: g.first_review_after_days,
            firstReviewDate: firstReviewDateOf(g),
            startDate: startDateOf(g),
          },
          milestones: milestonesByTask.get(g.task_id) ?? [],
          today: todayDateString(),
        });
        return {
          id: g.id,
          taskId: g.task_id,
          name: task?.name ?? '未命名任務',
          goalType: g.goal_type,
          status: g.status,
          progressPct: progressPercentOf(progress),
          progressLabel: progress.headline,
          progress,
          weeklyCompleted: weeklyDoneByTask.get(g.task_id) ?? 0,
          previousWeeklyCompleted: previousDoneByTask.get(g.task_id) ?? 0,
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
