import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isoWeek from 'dayjs/plugin/isoWeek';
import { supabase } from '../lib/supabase';
import { updateTaskSchedule } from '../lib/taskActions';
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
  | 'add_contribution'
  | 'adjust_schedule';

export type ScheduleClaimPeriod = 'day' | 'week' | 'once';
const VALID_CLAIM_PERIODS: ScheduleClaimPeriod[] = ['day', 'week', 'once'];

export type WeeklySuggestion = {
  body: string;
  actionLabel: string;
  action: SuggestionAction;
  taskId?: string;
  taskName?: string;
  currentClaimPeriod?: ScheduleClaimPeriod;
  currentMaxClaimsPerPeriod?: number;
  suggestedClaimPeriod?: ScheduleClaimPeriod;
  suggestedMaxClaimsPerPeriod?: number;
  adopted?: boolean;
};

/**
 * Gemini's weekly-report output isn't structured yet, so schedule-suggestion
 * fields may be missing, malformed, or hand-seeded for testing. Drop them
 * (keep the plain-text suggestion) unless both fields are present and valid.
 */
function sanitizeSuggestions(raw: WeeklySuggestion[]): WeeklySuggestion[] {
  return raw.map(sg => {
    const validPeriod = VALID_CLAIM_PERIODS.includes(sg.suggestedClaimPeriod as ScheduleClaimPeriod);
    const validMax = typeof sg.suggestedMaxClaimsPerPeriod === 'number'
      && Number.isInteger(sg.suggestedMaxClaimsPerPeriod)
      && sg.suggestedMaxClaimsPerPeriod > 0;
    if (!sg.taskId || !validPeriod || !validMax) {
      const { suggestedClaimPeriod, suggestedMaxClaimsPerPeriod, currentClaimPeriod, currentMaxClaimsPerPeriod, ...rest } = sg;
      return rest;
    }
    return sg;
  });
}

export type GrowthMoment = {
  id: string;
  dateLabel: string;
  title: string;
  body?: string;
  createdAt: string;
};

export type LongTermGoalProgress = {
  id: string;
  taskId: string;
  goalType: string;
  taskName: string;
  current: number;
  target: number;
  unit: string;
  nextMilestone: string | null;
  milestoneReward: number | null;
  noProgressThisWeek: boolean;
  weeklyCompleted: number;
  previousWeeklyCompleted: number;
  status: string;
};

// 「查看完整紀錄」四個分頁各自的一列
export type WeeklyTaskRecord = {
  id: string;
  dateLabel: string;
  taskName: string;
  coinEarned: number;
  status: string;
};

export type WeeklyCoinRecord = {
  id: string;
  dateLabel: string;
  label: string;
  amount: number;
  isIncome: boolean;
};

export type WeeklyTimeSavingRecord = {
  id: string;
  dateLabel: string;
  minutes: number;
  taskName: string;
  poolLabel: string;
};

export type WeeklyRedemptionRecord = {
  id: string;
  dateLabel: string;
  name: string;
  coinCost: number;
  status: string;
};

export type ParentWeeklyReportData = {
  childName: string;
  weekLabel: string;
  weekRange: string;
  totalTasks: number;
  checkIns: number;
  timeSavedMin: number;
  aiInsight: string;
  dialoguePrompt: string;
  activity: WeeklyActivityBar[];
  coinFlow: WeeklyCoinFlow;
  suggestions: WeeklySuggestion[];
  moments: GrowthMoment[];
  affirmations: string[];
  longTermGoals: LongTermGoalProgress[];
  taskRecords: WeeklyTaskRecord[];
  coinRecords: WeeklyCoinRecord[];
  timeSavingRecords: WeeklyTimeSavingRecord[];
  redemptionRecords: WeeklyRedemptionRecord[];
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
  adoptScheduleSuggestion: (
    taskId: string,
    claimPeriod: ScheduleClaimPeriod,
    maxClaimsPerPeriod: number,
  ) => Promise<void>;
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
// Helpers
// ---------------------------------------------------------------------------

function getWeekBounds(offset: number) {
  const start = dayjs().tz(TZ).add(offset, 'week').startOf('isoWeek');
  const end = start.endOf('isoWeek');
  return { start, end };
}

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
  checkpoint_rewards: Record<string, number> | null;
  last_active_date: string | null;
  status: string;
  tasks: { name: string } | null;
};

function mapGoalProgress(
  g: RawLTG,
  weekStart: dayjs.Dayjs,
  weeklyDoneByTask: Map<string, number>,
  previousDoneByTask: Map<string, number>,
): LongTermGoalProgress {
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
    // 'responsibility' and anything else: current=0, target=0, unit=''
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
      milestoneReward = rewards[String(nextThreshold)] ?? null;
    }
  }

  const noProgressThisWeek =
    g.last_active_date == null ||
    dayjs(g.last_active_date).tz(TZ).isBefore(weekStart, 'day');

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
    noProgressThisWeek,
    weeklyCompleted: weeklyDoneByTask.get(g.task_id) ?? 0,
    previousWeeklyCompleted: previousDoneByTask.get(g.task_id) ?? 0,
    status: g.status,
  };
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
  const [timeSavedMin, setTimeSavedMin] = useState(0);
  const [aiInsight, setAiInsight] = useState(PENDING_INSIGHT);
  const [suggestions, setSuggestions] = useState<WeeklySuggestion[]>(PENDING_SUGGESTIONS);
  const [affirmations, setAffirmations] = useState<string[]>(PENDING_AFFIRMATIONS);
  const [dialoguePrompt, setDialoguePrompt] = useState('');
  const [longTermGoals, setLongTermGoals] = useState<LongTermGoalProgress[]>([]);
  const [taskRecords, setTaskRecords] = useState<WeeklyTaskRecord[]>([]);
  const [coinRecords, setCoinRecords] = useState<WeeklyCoinRecord[]>([]);
  const [timeSavingRecords, setTimeSavingRecords] = useState<WeeklyTimeSavingRecord[]>([]);
  const [redemptionRecords, setRedemptionRecords] = useState<WeeklyRedemptionRecord[]>([]);
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
      const prevStartISO = start.subtract(1, 'week').toISOString();
      const prevEndISO = end.subtract(1, 'week').toISOString();
      const weekStartDate = start.format('YYYY-MM-DD');

      const [childRes, ctRes, completionsRes, previousCompletionsRes, walletRes] = await Promise.all([
        supabase.from('children').select('nickname, family_id').eq('id', childId).single(),
        supabase.from('child_tasks').select('task_id').eq('child_id', childId).eq('is_active', true),
        supabase
          .from('task_completions')
          .select('id, task_id, coin_earned, time_saved_min, completed_at, status, tasks(name)')
          .eq('child_id', childId)
          .gte('completed_at', startISO)
          .lte('completed_at', endISO),
        supabase
          .from('task_completions')
          .select('task_id')
          .eq('child_id', childId)
          .gte('completed_at', prevStartISO)
          .lte('completed_at', prevEndISO),
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
      const previousCompletionData = previousCompletionsRes.data ?? [];
      setCheckIns(completionData.length);
      setTimeSavedMin(completionData.reduce((sum, c) => sum + (c.time_saved_min ?? 0), 0));

      const walletId = walletRes.data?.id ?? null;

      const [tasksRes, txRes, momentRes, reportRes, ltgRes, timeSavingsRes, redemptionRes] = await Promise.all([
        taskIds.length > 0
          ? supabase.from('tasks').select('id, category').in('id', taskIds).eq('is_active', true)
          : Promise.resolve({ data: [] as { id: string; category: string }[], error: null }),
        walletId
          ? supabase
              .from('transactions')
              .select('id, amount, type, note, created_at, reference_id, reference_type')
              .eq('wallet_id', walletId)
              .in('type', ['earn', 'redeem'])
              .gte('created_at', startISO)
              .lte('created_at', endISO)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as { id: string; amount: number; type: string; note: string | null; created_at: string; reference_id: string | null; reference_type: string | null }[], error: null }),
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
        supabase
          .from('long_term_goals')
          .select('id, task_id, goal_type, total_days, current_day, level_count, current_level, target_value, current_value, value_unit, checkpoint_rewards, last_active_date, status, tasks(name)')
          .eq('child_id', childId)
          .eq('status', 'active'),
        supabase
          .from('time_savings')
          .select('id, minutes_saved, pool_type, created_at, completion_id')
          .eq('child_id', childId)
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false }),
        supabase
          .from('redemption_requests')
          .select('id, name, coin_cost, status, created_at')
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

      // AI insights from weekly_reports
      const report = reportRes.data as {
        motivation_observation: string | null;
        ai_suggestions: {
          suggestions?: WeeklySuggestion[];
          affirmations?: string[];
          dialogue?: string;
        } | null;
      } | null;

      if (report?.motivation_observation) {
        setAiInsight(report.motivation_observation);
        setSuggestions(
          report.ai_suggestions?.suggestions
            ? sanitizeSuggestions(report.ai_suggestions.suggestions)
            : PENDING_SUGGESTIONS,
        );
        setAffirmations(report.ai_suggestions?.affirmations ?? PENDING_AFFIRMATIONS);
        setDialoguePrompt(report.ai_suggestions?.dialogue ?? '');
        setAiReady(true);
      } else {
        setAiInsight(PENDING_INSIGHT);
        setSuggestions(PENDING_SUGGESTIONS);
        setAffirmations(PENDING_AFFIRMATIONS);
        setDialoguePrompt('');
        setAiReady(false);
      }

      // Long-term goal progress
      // Cast via unknown: Relationships:[] in database.ts means the TS type doesn't
      // know about the tasks FK, but the runtime join works if the DB FK exists.
      const rawLTGs = (ltgRes.data ?? []) as unknown as RawLTG[];
      const weeklyDoneByTask = new Map<string, number>();
      const previousDoneByTask = new Map<string, number>();
      for (const c of completionData) {
        weeklyDoneByTask.set(c.task_id, (weeklyDoneByTask.get(c.task_id) ?? 0) + 1);
      }
      for (const c of previousCompletionData) {
        previousDoneByTask.set(c.task_id, (previousDoneByTask.get(c.task_id) ?? 0) + 1);
      }
      setLongTermGoals(rawLTGs.map(g => mapGoalProgress(g, start, weeklyDoneByTask, previousDoneByTask)));

      // ── 「查看完整紀錄」四分頁清單 ───────────────────────────────────────────
      // 先建立「id → 真實名稱」對照表，讓每一筆紀錄都能顯示任務／獎勵的真名。
      type RawCompletionRow = {
        id: string;
        completed_at: string;
        coin_earned: number | null;
        status: string;
        tasks: { name: string } | { name: string }[] | null;
      };
      const pickTaskName = (t: RawCompletionRow['tasks']): string =>
        Array.isArray(t) ? (t[0]?.name ?? '任務') : (t?.name ?? '任務');
      const completionRows = completionData as unknown as RawCompletionRow[];

      // completion_id → 任務名（本週完成的任務都在這裡）
      const completionNameMap = new Map<string, string>();
      for (const c of completionRows) completionNameMap.set(c.id, pickTaskName(c.tasks));
      // goal_id → 長期任務名（里程碑獎勵用）
      const goalNameMap = new Map<string, string>();
      for (const g of rawLTGs) goalNameMap.set(g.id, g.tasks?.name ?? '長期任務');
      // redemption request_id → 獎勵名
      type RawRedemption = { id: string; name: string; coin_cost: number; status: string; created_at: string };
      const redemptionRows = (redemptionRes.data ?? []) as RawRedemption[];
      const requestNameMap = new Map<string, string>();
      for (const r of redemptionRows) requestNameMap.set(r.id, r.name);

      type RawTx = {
        id: string; amount: number; type: string; note: string | null;
        created_at: string; reference_id: string | null; reference_type: string | null;
      };
      const txRows = txData as RawTx[];

      // reward_item 兌換（redeem_wish 路徑）需要另外查名字
      const rewardItemIds = txRows
        .filter(t => t.reference_type === 'reward_item' && t.reference_id)
        .map(t => t.reference_id as string);
      const rewardItemNameMap = new Map<string, string>();
      if (rewardItemIds.length > 0) {
        const { data: riData } = await supabase
          .from('reward_items')
          .select('id, name')
          .in('id', rewardItemIds);
        for (const r of (riData ?? []) as { id: string; name: string }[]) {
          rewardItemNameMap.set(r.id, r.name);
        }
      }

      // 任務紀錄 ← task_completions（真任務名）
      setTaskRecords(
        completionRows
          .slice()
          .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
          .map(c => ({
            id: c.id,
            dateLabel: dayjs(c.completed_at).tz(TZ).format('M/D HH:mm'),
            taskName: pickTaskName(c.tasks),
            coinEarned: c.coin_earned ?? 0,
            status: c.status,
          })),
      );

      // 成長幣 ← transactions（依 reference 顯示真名：任務獎勵／里程碑／獎勵兌換）
      const TX_LABEL: Record<string, string> = {
        earn: '任務獎勵', redeem: '獎勵兌換', deduct: '扣除', interest: '利息', adjust: '調整',
      };
      const resolveTxLabel = (t: RawTx): string => {
        const ref = t.reference_id ?? '';
        switch (t.reference_type) {
          case 'task_completion':
            return completionNameMap.get(ref) ?? TX_LABEL.earn;
          case 'long_term_goal_milestone':
            return `${goalNameMap.get(ref) ?? '長期任務'} · 里程碑獎勵`;
          case 'reward_item':
            return rewardItemNameMap.get(ref) ?? TX_LABEL.redeem;
          case 'redemption_request':
            return requestNameMap.get(ref) ?? TX_LABEL.redeem;
          default:
            return t.note?.trim() || TX_LABEL[t.type] || '成長幣異動';
        }
      };
      setCoinRecords(
        txRows.map(t => ({
          id: t.id,
          dateLabel: dayjs(t.created_at).tz(TZ).format('M/D HH:mm'),
          label: resolveTxLabel(t),
          amount: Math.abs(t.amount),
          isIncome: t.type === 'earn',
        })),
      );

      // 時間儲蓄 ← time_savings（顯示產生時間的任務真名）
      const POOL_LABEL: Record<string, string> = {
        family_time: '家庭時間', game_time: '遊戲時間',
      };
      type RawTimeSaving = { id: string; minutes_saved: number; pool_type: string; created_at: string; completion_id: string | null };
      setTimeSavingRecords(
        ((timeSavingsRes.data ?? []) as RawTimeSaving[]).map(t => ({
          id: t.id,
          dateLabel: dayjs(t.created_at).tz(TZ).format('M/D HH:mm'),
          minutes: t.minutes_saved,
          taskName: (t.completion_id && completionNameMap.get(t.completion_id)) || '家庭本分任務',
          poolLabel: POOL_LABEL[t.pool_type] ?? '時間儲蓄',
        })),
      );

      // 獎勵兌換 ← redemption_requests（真獎勵名）
      const REDEMPTION_STATUS: Record<string, string> = {
        pending: '審核中', approved: '已核准', rejected: '未通過',
      };
      setRedemptionRecords(
        redemptionRows.map(r => ({
          id: r.id,
          dateLabel: dayjs(r.created_at).tz(TZ).format('M/D HH:mm'),
          name: r.name,
          coinCost: r.coin_cost,
          status: REDEMPTION_STATUS[r.status] ?? r.status,
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
      .from('growth_moments')
      .insert({ child_id: childId, title: title.trim(), body: body.trim() || null });
    if (err) {
      console.error('[useParentWeeklyReport] addMoment error:', err);
      throw err;
    }
    await fetchAll();
  }, [childId, fetchAll]);

  const adoptScheduleSuggestion = useCallback(async (
    taskId: string,
    claimPeriod: ScheduleClaimPeriod,
    maxClaimsPerPeriod: number,
  ) => {
    await updateTaskSchedule(taskId, claimPeriod, maxClaimsPerPeriod);

    // 標記已採用（而非移除），讓卡片留在清單裡但按鈕換成「已套用」。
    const weekStartDate = getWeekBounds(weekOffset).start.format('YYYY-MM-DD');
    const { data: reportRow, error: fetchErr } = await supabase
      .from('weekly_reports')
      .select('id, ai_suggestions')
      .eq('child_id', childId)
      .eq('week_start', weekStartDate)
      .maybeSingle();

    if (!fetchErr && reportRow?.ai_suggestions) {
      const current = reportRow.ai_suggestions as {
        suggestions?: WeeklySuggestion[];
        affirmations?: string[];
        dialogue?: string;
      };
      const updated = (current.suggestions ?? []).map(sg =>
        sg.taskId === taskId ? { ...sg, adopted: true } : sg,
      );
      await supabase
        .from('weekly_reports')
        .update({ ai_suggestions: { ...current, suggestions: updated } })
        .eq('id', reportRow.id);
    }

    await fetchAll();
  }, [childId, weekOffset, fetchAll]);

  const requestAiRefresh = useCallback(async () => {
    const weekStartDate = getWeekBounds(weekOffset).start.format('YYYY-MM-DD');
    const { error: err } = await supabase.functions.invoke('generate-weekly-report', {
      body: { childId, weekStart: weekStartDate },
    });
    if (err) throw err;
    await fetchAll();
  }, [childId, weekOffset, fetchAll]);

  return {
    childName,
    weekLabel,
    weekRange,
    totalTasks,
    checkIns,
    timeSavedMin,
    aiInsight,
    dialoguePrompt,
    activity,
    coinFlow,
    suggestions,
    moments,
    affirmations,
    longTermGoals,
    taskRecords,
    coinRecords,
    timeSavingRecords,
    redemptionRecords,
    aiReady,
    loading,
    error,
    weekOffset,
    canGoBack: weekOffset > -4,
    canGoForward: weekOffset < 0,
    goBack: () => setWeekOffset(o => Math.max(o - 1, -1)),
    goForward: () => setWeekOffset(o => Math.min(o + 1, 0)),
    addMoment,
    refresh: fetchAll,
    requestAiRefresh,
    adoptScheduleSuggestion,
  };
}
