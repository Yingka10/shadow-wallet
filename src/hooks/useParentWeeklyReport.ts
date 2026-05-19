import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isoWeek from 'dayjs/plugin/isoWeek';
import { supabase } from '../lib/supabase';
import type { TaskCategory } from '../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

const TZ = 'Asia/Taipei';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type WeeklyActivityBar = {
  cat: TaskCategory;
  done: number;
  total: number;
};

export type WeeklyCoinFlow = {
  income: number;
  incomeFrom: number;
  spend: number;
  spendFrom: number;
};

export type SuggestionAction =
  | 'adjust_reminder'
  | 'increase_difficulty'
  | 'add_contribution';

export type WeeklySuggestion = {
  body: string;
  actionLabel: string;
  action: SuggestionAction;
  taskId?: string;
  taskName?: string;
};

export type GrowthMoment = {
  id: string;
  dateLabel: string;
  title: string;
  body?: string;
  createdAt: string;
};

export type ParentWeeklyReportData = {
  childName: string;
  weekLabel: string;
  weekRange: string;
  totalTasks: number;
  checkIns: number;
  aiInsight: string;
  activity: WeeklyActivityBar[];
  coinFlow: WeeklyCoinFlow;
  suggestions: WeeklySuggestion[];
  moments: GrowthMoment[];
  affirmations: string[];
  aiReady: boolean;
  loading: boolean;
  error: string | null;
  weekOffset: number;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  addMoment: (title: string, body: string) => Promise<void>;
  refresh: () => void;
  requestAiRefresh: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Fallback content (shown while AI report hasn't been generated yet)
// ---------------------------------------------------------------------------

const PENDING_INSIGHT = '本週 AI 洞察正在生成中，通常在週日深夜完成。可點擊右上角重新整理。';

const PENDING_SUGGESTIONS: WeeklySuggestion[] = [];

const PENDING_AFFIRMATIONS: string[] = [
  '這週辛苦了，謝謝你的努力。',
  '你做到了，我都有看見。',
  '繼續加油，我們一起！',
];

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function getWeekBounds(offset: number) {
  const start = dayjs().tz(TZ).add(offset, 'week').startOf('isoWeek');
  const end = start.endOf('isoWeek');
  return { start, end };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches weekly report data for a child.
 * weekOffset: 0 = current week, -1 = last week.
 * AI insight, suggestions, and affirmations are read from weekly_reports table
 * (populated by WF-3 generate-weekly-report Edge Function every Sunday).
 */
export function useParentWeeklyReport(childId: string): ParentWeeklyReportData {
  const [weekOffset, setWeekOffset] = useState(0);
  const [childName, setChildName] = useState('');
  const [activity, setActivity] = useState<WeeklyActivityBar[]>([]);
  const [coinFlow, setCoinFlow] = useState<WeeklyCoinFlow>({
    income: 0, incomeFrom: 0, spend: 0, spendFrom: 0,
  });
  const [moments, setMoments] = useState<GrowthMoment[]>([]);
  const [totalTasks, setTotalTasks] = useState(0);
  const [checkIns, setCheckIns] = useState(0);
  const [aiInsight, setAiInsight] = useState(PENDING_INSIGHT);
  const [suggestions, setSuggestions] = useState<WeeklySuggestion[]>(PENDING_SUGGESTIONS);
  const [affirmations, setAffirmations] = useState<string[]>(PENDING_AFFIRMATIONS);
  const [aiReady, setAiReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { start: weekStart, end: weekEnd } = getWeekBounds(weekOffset);
  const weekNum = weekStart.isoWeek();
  const weekLabel = `第 ${weekNum} 週`;
  const weekRange =
    `${weekStart.month() + 1} 月 ${weekStart.date()} 日 — ` +
    `${weekEnd.month() + 1} 月 ${weekEnd.date()} 日`;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getWeekBounds(weekOffset);
      const startISO = start.toISOString();
      const endISO = end.toISOString();
      const weekStartDate = start.format('YYYY-MM-DD');

      const [childRes, ctRes, completionsRes, walletRes] = await Promise.all([
        supabase.from('children').select('nickname, family_id').eq('id', childId).single(),
        supabase.from('child_tasks').select('task_id').eq('child_id', childId).eq('is_active', true),
        supabase
          .from('task_completions')
          .select('task_id, coin_earned, completed_at')
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

      if (childRes.error) throw childRes.error;
      setChildName(childRes.data?.nickname ?? '');
      const familyId = childRes.data?.family_id ?? null;

      const taskIds = (ctRes.data ?? []).map(r => r.task_id);
      const completionData = completionsRes.data ?? [];
      setCheckIns(completionData.length);

      const walletId = walletRes.data?.id ?? null;

      const [tasksRes, txRes, momentRes, reportRes] = await Promise.all([
        taskIds.length > 0
          ? supabase.from('tasks').select('id, category').in('id', taskIds).eq('is_active', true)
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
          .from('growth_moments')
          .select('id, title, body, created_at')
          .eq('child_id', childId)
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false }),
        familyId
          ? supabase
              .from('weekly_reports')
              .select('motivation_observation, ai_suggestions')
              .eq('family_id', familyId)
              .eq('child_id', childId)
              .eq('week_start', weekStartDate)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (tasksRes.error) throw tasksRes.error;

      // Activity bars
      const tasks = tasksRes.data ?? [];
      setTotalTasks(tasks.length);
      const completedIds = new Set(completionData.map(c => c.task_id));
      const catCounts: Record<TaskCategory, { done: number; total: number }> = {
        A: { done: 0, total: 0 },
        B: { done: 0, total: 0 },
        C: { done: 0, total: 0 },
        D: { done: 0, total: 0 },
      };
      for (const task of tasks) {
        const cat = task.category as TaskCategory;
        catCounts[cat].total += 1;
        if (completedIds.has(task.id)) catCounts[cat].done += 1;
      }
      setActivity(
        (['A', 'B', 'C', 'D'] as TaskCategory[]).map(cat => ({
          cat,
          done: catCounts[cat].done,
          total: catCounts[cat].total,
        })),
      );

      // Coin flow
      const txData = txRes.data ?? [];
      const earnTxs = txData.filter(t => t.type === 'earn');
      const redeemTxs = txData.filter(t => t.type === 'redeem');
      setCoinFlow({
        income: earnTxs.reduce((sum, t) => sum + t.amount, 0),
        incomeFrom: earnTxs.length,
        spend: Math.abs(redeemTxs.reduce((sum, t) => sum + t.amount, 0)),
        spendFrom: redeemTxs.length,
      });

      // Growth moments
      type RawMoment = { id: string; title: string; body: string | null; created_at: string };
      const rawMoments = (momentRes.data ?? []) as RawMoment[];
      setMoments(
        rawMoments.map(m => ({
          id: m.id,
          title: m.title,
          body: m.body ?? undefined,
          dateLabel: dayjs(m.created_at).tz(TZ).format('M/D HH:mm'),
          createdAt: m.created_at,
        })),
      );

      // AI insights from weekly_reports
      const report = reportRes.data as {
        motivation_observation: string | null;
        ai_suggestions: {
          suggestions?: WeeklySuggestion[];
          affirmations?: string[];
        } | null;
      } | null;

      if (report?.motivation_observation) {
        setAiInsight(report.motivation_observation);
        setSuggestions(report.ai_suggestions?.suggestions ?? PENDING_SUGGESTIONS);
        setAffirmations(report.ai_suggestions?.affirmations ?? PENDING_AFFIRMATIONS);
        setAiReady(true);
      } else {
        setAiInsight(PENDING_INSIGHT);
        setSuggestions(PENDING_SUGGESTIONS);
        setAffirmations(PENDING_AFFIRMATIONS);
        setAiReady(false);
      }
    } catch (err) {
      console.error('[useParentWeeklyReport] fetch error:', err);
      setError('資料載入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, [childId, weekOffset]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const addMoment = useCallback(async (title: string, body: string) => {
    const { error: err } = await supabase
      .from('growth_moments')
      .insert({ child_id: childId, title: title.trim(), body: body.trim() || null });
    if (err) {
      console.error('[useParentWeeklyReport] addMoment error:', err);
      throw err;
    }
    await fetchAll();
  }, [childId, fetchAll]);

  const requestAiRefresh = useCallback(async () => {
    const { error: err } = await supabase.functions.invoke('generate-weekly-report', {
      body: { childId },
    });
    if (err) throw err;
    await fetchAll();
  }, [childId, fetchAll]);

  return {
    childName,
    weekLabel,
    weekRange,
    totalTasks,
    checkIns,
    aiInsight,
    activity,
    coinFlow,
    suggestions,
    moments,
    affirmations,
    aiReady,
    loading,
    error,
    weekOffset,
    canGoBack: weekOffset > -1,
    canGoForward: weekOffset < 0,
    goBack: () => setWeekOffset(o => Math.max(o - 1, -1)),
    goForward: () => setWeekOffset(o => Math.min(o + 1, 0)),
    addMoment,
    refresh: fetchAll,
    requestAiRefresh,
  };
}
