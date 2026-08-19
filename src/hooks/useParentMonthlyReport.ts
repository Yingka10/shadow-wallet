import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from '../lib/supabase';
import type { TaskCategory } from '../types/database';
import type { LongTermGoalProgress } from './useParentWeeklyReport';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';
const MAX_BACK_MONTHS = 6;

export type MonthlyAbcdCount = {
  cat: TaskCategory;
  done: number;
};

export type ParentMonthlyReportData = {
  monthLabel: string;
  totalCompleted: number;
  activeDays: number;
  coinIncome: number;
  coinSpend: number;
  abcd: MonthlyAbcdCount[];
  longTermGoals: LongTermGoalProgress[];
  reflection: string;
  saveReflection: (text: string) => Promise<void>;
  saving: boolean;
  loading: boolean;
  error: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  refresh: () => void;
};

type RawLTG = {
  id: string;
  task_id: string;
  goal_type: string;
  total_days: number | null;
  current_day: number;
  level_count: number | null;
  current_level: number | null;
  target_value: number | null;
  current_value: number | null;
  value_unit: string | null;
  /** 大多是純數字幣值；rhythm 的 checkpoint 可能是帶 title/note 的物件（見 database.ts CheckpointRewardEntry）。 */
  checkpoint_rewards: Record<string, number | { coin?: number }> | null;
  last_active_date: string | null;
  status: string;
  tasks: { name: string } | null;
};

function mapGoal(g: RawLTG): LongTermGoalProgress {
  let current = 0;
  let target = 0;
  let unit = '';

  switch (g.goal_type) {
    case 'habit':
      current = g.current_day;
      target = g.total_days ?? 0;
      unit = '天';
      break;
    case 'skill':
      current = g.current_level ?? 0;
      target = g.level_count ?? 0;
      unit = '關';
      break;
    case 'challenge':
      current = g.current_value ?? 0;
      target = g.target_value ?? 0;
      unit = g.value_unit ?? '';
      break;
  }

  let nextMilestone: string | null = null;
  let milestoneReward: number | null = null;

  if (g.checkpoint_rewards && unit) {
    const rewards = g.checkpoint_rewards;
    const nextThreshold = Object.keys(rewards)
      .map(Number)
      .filter(n => !isNaN(n) && n > current)
      .sort((a, b) => a - b)[0];
    if (nextThreshold !== undefined) {
      nextMilestone = `第 ${nextThreshold} ${unit}`;
      const entry = rewards[String(nextThreshold)];
      milestoneReward = typeof entry === 'number' ? entry : entry?.coin ?? null;
    }
  }

  return {
    id: g.id,
    taskId: g.task_id,
    goalType: g.goal_type,
    taskName: g.tasks?.name ?? '(未知任務)',
    current,
    target,
    unit,
    nextMilestone,
    milestoneReward,
    noProgressThisWeek: false,
    weeklyCompleted: 0,
    previousWeeklyCompleted: 0,
    status: g.status,
  };
}

/**
 * Fetches monthly report data for a child.
 * monthOffset: 0 = current month, -1 = last month.
 * Data is aggregated from task_completions + transactions.
 * Parent reflection is read/written to monthly_reports table.
 */
export function useParentMonthlyReport(childId: string): ParentMonthlyReportData {
  const [monthOffset, setMonthOffset] = useState(0);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [activeDays, setActiveDays] = useState(0);
  const [coinIncome, setCoinIncome] = useState(0);
  const [coinSpend, setCoinSpend] = useState(0);
  const [abcd, setAbcd] = useState<MonthlyAbcdCount[]>([
    { cat: 'A', done: 0 },
    { cat: 'B', done: 0 },
    { cat: 'C', done: 0 },
    { cat: 'D', done: 0 },
  ]);
  const [longTermGoals, setLongTermGoals] = useState<LongTermGoalProgress[]>([]);
  const [reflection, setReflection] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset to current month when child switches
  useEffect(() => {
    setMonthOffset(0);
  }, [childId]);

  const monthStart = dayjs().tz(TZ).add(monthOffset, 'month').startOf('month');
  const monthLabel = `${monthStart.year()} 年 ${monthStart.month() + 1} 月`;
  const canGoBack = monthOffset > -MAX_BACK_MONTHS;
  const canGoForward = monthOffset < 0;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const start = dayjs().tz(TZ).add(monthOffset, 'month').startOf('month');
      const end = start.endOf('month');
      const startISO = start.toISOString();
      const endISO = end.toISOString();
      const monthKey = start.format('YYYY-MM');

      const childRes = await supabase
        .from('children')
        .select('family_id')
        .eq('id', childId)
        .single();
      if (childRes.error) throw childRes.error;
      const fId = childRes.data.family_id;
      setFamilyId(fId);

      const [completionsRes, walletRes] = await Promise.all([
        supabase
          .from('task_completions')
          .select('task_id, completed_at')
          .eq('child_id', childId)
          .gte('completed_at', startISO)
          .lte('completed_at', endISO),
        supabase
          .from('wallets')
          .select('id')
          .eq('child_id', childId)
          .eq('wallet_type', 'spending')
          .single(),
      ]);

      const completionData = completionsRes.data ?? [];
      setTotalCompleted(completionData.length);

      const daySet = new Set(
        completionData.map(c => dayjs(c.completed_at).tz(TZ).format('YYYY-MM-DD'))
      );
      setActiveDays(daySet.size);

      const walletId = walletRes.data?.id ?? null;
      const taskIds = [...new Set(completionData.map(c => c.task_id))];

      const [tasksRes, txRes, reportRes, ltgRes] = await Promise.all([
        taskIds.length > 0
          ? supabase.from('tasks').select('id, category').in('id', taskIds)
          : Promise.resolve({ data: [] as { id: string; category: string }[], error: null }),
        walletId
          ? supabase
              .from('transactions')
              .select('amount, type')
              .eq('wallet_id', walletId)
              .in('type', ['earn', 'redeem'])
              .gte('created_at', startISO)
              .lte('created_at', endISO)
          : Promise.resolve({ data: [] as { amount: number; type: string }[], error: null }),
        supabase
          .from('monthly_reports')
          .select('parent_reflection')
          .eq('family_id', fId)
          .eq('child_id', childId)
          .eq('month', monthKey)
          .maybeSingle(),
        supabase
          .from('long_term_goals')
          .select('id, task_id, goal_type, total_days, current_day, level_count, current_level, target_value, current_value, value_unit, checkpoint_rewards, last_active_date, status, tasks(name)')
          .eq('child_id', childId)
          .eq('status', 'active'),
      ]);

      if (tasksRes.error) throw tasksRes.error;

      // ABCD breakdown — count completions by category
      const catMap = new Map(
        (tasksRes.data ?? []).map(t => [t.id, t.category as TaskCategory])
      );
      const counts: Record<TaskCategory, number> = { A: 0, B: 0, C: 0, D: 0 };
      for (const c of completionData) {
        const cat = catMap.get(c.task_id);
        if (cat) counts[cat] += 1;
      }
      setAbcd((['A', 'B', 'C', 'D'] as TaskCategory[]).map(cat => ({ cat, done: counts[cat] })));

      // Coin flow
      const txData = txRes.data ?? [];
      setCoinIncome(txData.filter(t => t.type === 'earn').reduce((s, t) => s + t.amount, 0));
      setCoinSpend(
        Math.abs(txData.filter(t => t.type === 'redeem').reduce((s, t) => s + t.amount, 0))
      );

      // Parent reflection from monthly_reports
      const report = reportRes.data as { parent_reflection: unknown } | null;
      setReflection(
        typeof report?.parent_reflection === 'string' ? report.parent_reflection : ''
      );

      // Long-term goals (current active state, not month-scoped)
      const rawLTGs = (ltgRes.data ?? []) as unknown as RawLTG[];
      setLongTermGoals(rawLTGs.map(mapGoal));
    } catch (err) {
      console.error('[useParentMonthlyReport] fetch error:', err);
      setError('資料載入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, [childId, monthOffset]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const saveReflection = useCallback(async (text: string) => {
    setSaving(true);
    try {
      const start = dayjs().tz(TZ).add(monthOffset, 'month').startOf('month');
      const monthKey = start.format('YYYY-MM');
      let fId = familyId;
      if (!fId) {
        const { data } = await supabase
          .from('children')
          .select('family_id')
          .eq('id', childId)
          .single();
        fId = data?.family_id ?? null;
      }
      if (!fId) throw new Error('family not found');
      await supabase.from('monthly_reports').upsert(
        { family_id: fId, child_id: childId, month: monthKey, parent_reflection: text },
        { onConflict: 'family_id,child_id,month' }
      );
      setReflection(text);
    } catch (err) {
      console.error('[saveReflection] error:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [childId, monthOffset, familyId]);

  const goBack = useCallback(
    () => setMonthOffset(o => Math.max(o - 1, -MAX_BACK_MONTHS)),
    []
  );
  const goForward = useCallback(
    () => setMonthOffset(o => Math.min(o + 1, 0)),
    []
  );

  return {
    monthLabel,
    totalCompleted,
    activeDays,
    coinIncome,
    coinSpend,
    abcd,
    longTermGoals,
    reflection,
    saveReflection,
    saving,
    loading,
    error,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    refresh: fetchAll,
  };
}
