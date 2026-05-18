// NOTE: This hook writes to a `growth_moments` table.
// Create it in Supabase before using the "記錄 +" feature:
//
//   create table growth_moments (
//     id         uuid primary key default gen_random_uuid(),
//     child_id   uuid not null references children(id),
//     title      text not null,
//     body       text,
//     created_at timestamptz not null default now()
//   );

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
  loading: boolean;
  error: string | null;
  weekOffset: number;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  addMoment: (title: string, body: string) => Promise<void>;
  refresh: () => void;
};

// ---------------------------------------------------------------------------
// Mock AI content — replace with AI integration when ready
// ---------------------------------------------------------------------------

const MOCK_AI_INSIGHTS = [
  '這週孩子展現出穩定的自律力，特別是平日的任務完成率比上週進步不少。有幾個貼心的舉動不在任何任務清單裡，卻讓人很暖心。下週可以聊聊「主動幫忙」這件事，讓孩子感受到被看見。',
  '這週學習類任務的完成率維持在高水位，孩子正在建立穩定的習慣。金幣的使用也比較謹慎，收支比表現穩健。可以考慮在下週引入一個難度稍高的挑戰，讓成就感更紮實。',
];

const MOCK_SUGGESTIONS: WeeklySuggestion[] = [
  {
    body: '這週有部分任務的打卡時間集中在很晚，可能錯過最佳完成時段。建議把提醒時間提早 30 分鐘試試。',
    actionLabel: '調整提醒時間',
    action: 'adjust_reminder',
  },
  {
    body: '孩子近期對中等難度任務都應付自如，是個好時機加入一個較高難度的挑戰，讓成就感更紮實。',
    actionLabel: '提高任務難度',
    action: 'increase_difficulty',
  },
  {
    body: '這週孩子有主動幫忙做了一些額外的家務，可以新增一個正式的貢獻型任務來肯定並延續這個行為。',
    actionLabel: '新增貢獻型任務',
    action: 'add_contribution',
  },
];

const MOCK_AFFIRMATIONS = [
  '這週你幫了很多忙，我都有看到，謝謝你。',
  '你一件一件把事情做完，這比任何金幣都更讓我驕傲。',
  '你主動去做那件事的時候，讓我感到非常驕傲。',
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
 * AI insight and affirmations are mocked until AI integration is complete.
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

      const [childRes, ctRes, completionsRes, walletRes] = await Promise.all([
        supabase.from('children').select('nickname').eq('id', childId).single(),
        supabase
          .from('child_tasks')
          .select('task_id')
          .eq('child_id', childId)
          .eq('is_active', true),
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

      const taskIds = (ctRes.data ?? []).map(r => r.task_id);
      const completionData = completionsRes.data ?? [];
      setCheckIns(completionData.length);

      const walletId = walletRes.data?.id ?? null;

      const [tasksRes, txRes, momentRes] = await Promise.all([
        taskIds.length > 0
          ? supabase
              .from('tasks')
              .select('id, category')
              .in('id', taskIds)
              .eq('is_active', true)
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
          .from('growth_moments' as never)
          .select('id, title, body, created_at')
          .eq('child_id', childId)
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false }),
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
      .from('growth_moments' as any)
      .insert({ child_id: childId, title: title.trim(), body: body.trim() || null });
    if (err) {
      console.error('[useParentWeeklyReport] addMoment error:', err);
      throw err;
    }
    await fetchAll();
  }, [childId, fetchAll]);

  const aiInsight = MOCK_AI_INSIGHTS[weekNum % MOCK_AI_INSIGHTS.length];

  return {
    childName,
    weekLabel,
    weekRange,
    totalTasks,
    checkIns,
    aiInsight,
    activity,
    coinFlow,
    suggestions: MOCK_SUGGESTIONS,
    moments,
    affirmations: MOCK_AFFIRMATIONS,
    loading,
    error,
    weekOffset,
    canGoBack: weekOffset > -1,
    canGoForward: weekOffset < 0,
    goBack: () => setWeekOffset(o => Math.max(o - 1, -1)),
    goForward: () => setWeekOffset(o => Math.min(o + 1, 0)),
    addMoment,
    refresh: fetchAll,
  };
}
