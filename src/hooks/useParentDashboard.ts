import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from '../lib/supabase';
import { calcCoin } from '../lib/taskActions';
import { taipeiDayRange } from '../lib/taipeiDate';
import { isTaskDueToday } from '../lib/taskSchedule';
import type { Child, PayoutBasisValue, Task, TaskCategory } from '../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DashboardTaskStatus = 'done' | 'pending' | 'missed' | 'review';

export type DashboardTask = {
  id: string;
  name: string;
  cat: TaskCategory;
  status: DashboardTaskStatus;
  completedAt?: string;
  reward: { kind: 'coins'; amount: number } | { kind: 'time'; amount: number } | null;
  /**
   * null = legacy 任務（每次完成即結算，家長可以在標記時調整金額）。
   * 有值 = 幣值由伺服器依結算語意決定，家長端不得再輸入金額。
   */
  payoutBasis: PayoutBasisValue | null;
  /** per_period 任務約定的每期達標次數。 */
  periodTargetCount: number | null;
};

export type DashboardGoal = {
  name: string;
  current: number;
  target: number;
  etaLabel: string;
};

export type ParentDashboardData = {
  child: Child | null;
  spendingBalance: number;
  weekCoinDelta: number;
  /** 本週（近 7 天）時間儲蓄累計，供首頁「本週摘要」使用 */
  weekTimeSavedMin: number;
  timeSavedUnredeemedMin: number;
  timeSavedAllMin: number;
  goal: DashboardGoal | null;
  todayTasks: DashboardTask[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isEndOfDay(): boolean {
  return dayjs().tz(TZ).hour() >= 21;
}

function deriveDashboardTasks(
  tasks: Task[],
  completions: { task_id: string; status: string; coin_earned: number; time_saved_min: number; completed_at: string }[],
  isPrerequisiteMet: boolean,
): DashboardTask[] {
  const completionByTask = new Map(completions.map(c => [c.task_id, c]));
  const pastCutoff = isEndOfDay();

  return tasks.map((task): DashboardTask => {
    const completion = completionByTask.get(task.id);

    if (completion) {
      const status: DashboardTaskStatus =
        completion.status === 'flagged' ? 'review' : 'done';

      const reward =
        task.category === 'B'
          ? { kind: 'time' as const, amount: completion.time_saved_min }
          : task.category === 'A'
          ? null
          : { kind: 'coins' as const, amount: completion.coin_earned };

      return {
        id: task.id,
        name: task.name,
        cat: task.category,
        status,
        completedAt: dayjs(completion.completed_at).tz(TZ).format('HH:mm'),
        reward,
        payoutBasis: task.payout_basis ?? null,
        periodTargetCount: task.period_target_count ?? null,
      };
    }

    const status: DashboardTaskStatus = pastCutoff ? 'missed' : 'pending';

    const reward =
      task.category === 'B'
        ? { kind: 'time' as const, amount: task.time_saving_min }
        : task.category === 'A'
        ? null
        : { kind: 'coins' as const, amount: calcCoin(task, isPrerequisiteMet) };

    return {
      id: task.id,
      name: task.name,
      cat: task.category,
      status,
      reward,
      payoutBasis: task.payout_basis ?? null,
      periodTargetCount: task.period_target_count ?? null,
    };
  });
}

function computeEta(remaining: number, weekDelta: number): string {
  if (remaining <= 0) return '即將達成';
  if (weekDelta <= 0) return '計算中';
  const weeks = Math.ceil(remaining / weekDelta);
  return weeks === 1 ? '1週' : `${weeks}週`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useParentDashboard(childId: string): ParentDashboardData {
  const [child, setChild] = useState<Child | null>(null);
  const [spendingBalance, setSpendingBalance] = useState(0);
  const [weekCoinDelta, setWeekCoinDelta] = useState(0);
  const [weekTimeSavedMin, setWeekTimeSavedMin] = useState(0);
  const [timeSavedUnredeemedMin, setTimeSavedUnredeemedMin] = useState(0);
  const [timeSavedAllMin, setTimeSavedAllMin] = useState(0);
  const [goal, setGoal] = useState<DashboardGoal | null>(null);
  const [todayTasks, setTodayTasks] = useState<DashboardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!childId) {
        setLoading(false);
        return;
      }

      // Taipei-day UTC bounds — a bare 'YYYY-MM-DD' casts to UTC midnight and
      // drops completions made during Taipei 00:00–08:00 from today's counts.
      const { startIso: today, endIso: tomorrow } = taipeiDayRange();
      const sevenDaysAgo = dayjs().tz(TZ).subtract(7, 'day').toISOString();

      // ── Round 1: queries that don't depend on each other ───────────────────
      const [childRes, walletRes, ctRes, tsRes, rewardRes, completionsRes, weekTimeRes] = await Promise.all([
        supabase.from('children').select('*').eq('id', childId).single(),
        supabase.from('wallets').select('id, balance').eq('child_id', childId).eq('wallet_type', 'spending').single(),
        supabase.from('child_tasks').select('task_id').eq('child_id', childId).eq('is_active', true),
        supabase.from('time_savings').select('minutes_saved, is_redeemed').eq('child_id', childId),
        supabase.from('reward_items').select('name, coin_cost').eq('child_id', childId).eq('is_active', true).order('created_at').limit(1),
        supabase.from('task_completions')
          .select('task_id, status, coin_earned, time_saved_min, completed_at')
          .eq('child_id', childId)
          .gte('completed_at', today)
          .lt('completed_at', tomorrow),
        supabase.from('task_completions')
          .select('time_saved_min')
          .eq('child_id', childId)
          .gte('completed_at', sevenDaysAgo),
      ]);

      if (childRes.error) throw childRes.error;
      setChild(childRes.data);

      const walletId = walletRes.data?.id ?? null;
      const balance = walletRes.data?.balance ?? 0;
      setSpendingBalance(balance);

      const taskIds = (ctRes.data ?? []).map(r => r.task_id);

      const tsSums = (tsRes.data ?? []).reduce(
        (acc, row) => {
          acc.all += row.minutes_saved;
          if (!row.is_redeemed) acc.unredeemed += row.minutes_saved;
          return acc;
        },
        { all: 0, unredeemed: 0 },
      );
      setTimeSavedAllMin(tsSums.all);
      setTimeSavedUnredeemedMin(tsSums.unredeemed);

      setWeekTimeSavedMin(
        (weekTimeRes.data ?? []).reduce((sum, row) => sum + (row.time_saved_min ?? 0), 0),
      );

      // ── Round 2: queries that depend on Round 1 results ────────────────────
      const [tasksRes, weekTxRes] = await Promise.all([
        taskIds.length > 0
          ? supabase.from('tasks').select('*').in('id', taskIds).eq('is_active', true)
          : Promise.resolve({ data: [] as Task[], error: null }),
        walletId
          ? supabase.from('transactions')
              .select('amount')
              .eq('wallet_id', walletId)
              .eq('type', 'earn')
              .gte('created_at', sevenDaysAgo)
          : Promise.resolve({ data: [] as { amount: number }[], error: null }),
      ]);

      if (tasksRes.error) throw tasksRes.error;
      if (weekTxRes.error) throw weekTxRes.error;

      const weekDelta = (weekTxRes.data ?? []).reduce((sum, tx) => sum + tx.amount, 0);
      setWeekCoinDelta(weekDelta);

      // ── Derive goal ────────────────────────────────────────────────────────
      const rewardItem = rewardRes.data?.[0] ?? null;
      if (rewardItem) {
        setGoal({
          name: rewardItem.name,
          current: balance,
          target: rewardItem.coin_cost,
          etaLabel: computeEta(rewardItem.coin_cost - balance, weekDelta),
        });
      } else {
        setGoal(null);
      }

      // ── Derive today's tasks ───────────────────────────────────────────────
      const tasks = tasksRes.data ?? [];
      const completions = completionsRes.data ?? [];

      // isPrerequisiteMet: all A and B tasks completed today
      const abTasks = tasks.filter(t => (t.category === 'A' || t.category === 'B') && !t.is_long_term);
      const completedIds = new Set(completions.map(c => c.task_id));
      const isPrerequisiteMet = abTasks.every(t => completedIds.has(t.id));

      // Only show tasks that are actually due today — same predicate the child's
      // home screen uses, so the parent's 今日總覽 matches what the child sees
      // (weekend-only tasks on a weekday and expired one-off tasks are hidden).
      const todayVisibleTasks = tasks.filter(t => !t.is_long_term && isTaskDueToday(t));

      setTodayTasks(deriveDashboardTasks(todayVisibleTasks, completions, isPrerequisiteMet));
    } catch (err) {
      console.error('[useParentDashboard] error:', err);
      setError('資料載入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    child,
    spendingBalance,
    weekCoinDelta,
    weekTimeSavedMin,
    timeSavedUnredeemedMin,
    timeSavedAllMin,
    goal,
    todayTasks,
    loading,
    error,
    refresh: fetchAll,
  };
}
