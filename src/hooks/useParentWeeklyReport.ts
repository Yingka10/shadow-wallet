import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isoWeek from 'dayjs/plugin/isoWeek';
import { supabase } from '../lib/supabase';
import { updateTaskSchedule, updateTaskRecurrenceDays } from '../lib/taskActions';
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
  | 'adjust_schedule'
  | 'adjust_recurrence'
  | 'pause_or_renegotiate'
  | 'break_down_goal';

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
  currentRecurrenceDays?: number[];
  suggestedRecurrenceDays?: number[];
  adopted?: boolean;
  /** 家長按下「再觀察一週」——跟 adopted 互斥，兩者都代表這則建議已經有結論了。 */
  deferred?: boolean;
  /** 套用/觀察的當下時間（ISO），家長按下按鈕才會寫入。 */
  decidedAt?: string;
  /**
   * 家長實際套用的值——跟 suggestedClaimPeriod 等「AI 原始建議」分開存。
   * 家長按「修改建議」改過數字再套用時，這裡記的是他真正選的那組值，
   * suggestedX 永遠維持 AI（或候選清單）當初給的原始建議，兩者都留著
   * 才對得起「原始建議／家長最後選擇」都要保存的要求。
   */
  adoptedClaimPeriod?: ScheduleClaimPeriod;
  adoptedMaxClaimsPerPeriod?: number;
  adoptedRecurrenceDays?: number[];
};

function isValidDayArray(v: unknown): v is number[] {
  return Array.isArray(v)
    && v.length > 0
    && v.every(d => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6)
    && new Set(v).size === v.length;
}

/**
 * Gemini's weekly-report output isn't structured yet, so schedule-suggestion
 * fields may be missing, malformed, or hand-seeded for testing. Drop them
 * (keep the plain-text suggestion) unless both fields of a kind are present and valid.
 */
function sanitizeSuggestions(raw: WeeklySuggestion[]): WeeklySuggestion[] {
  return raw.map(sg => {
    let clean = sg;

    const validPeriod = VALID_CLAIM_PERIODS.includes(sg.suggestedClaimPeriod as ScheduleClaimPeriod);
    const validMax = typeof sg.suggestedMaxClaimsPerPeriod === 'number'
      && Number.isInteger(sg.suggestedMaxClaimsPerPeriod)
      && sg.suggestedMaxClaimsPerPeriod > 0;
    if (!sg.taskId || !validPeriod || !validMax) {
      const { suggestedClaimPeriod, suggestedMaxClaimsPerPeriod, currentClaimPeriod, currentMaxClaimsPerPeriod, ...rest } = clean;
      clean = rest;
    }

    const validDays = isValidDayArray(sg.suggestedRecurrenceDays);
    if (!sg.taskId || !validDays) {
      const { suggestedRecurrenceDays, currentRecurrenceDays, ...rest } = clean;
      clean = rest;
    }

    return clean;
  });
}

export type GrowthLineStatus = 'stable' | 'watch' | 'needs_discussion';

/**
 * 跟 Edge Function（generate-weekly-report/validators.ts）的 WeeklyGrowthLine
 * 鏡射宣告——那邊是 Deno 檔案，這裡沒辦法直接 import，型別要保持一致。
 */
export type WeeklyGrowthLine = {
  key: TaskCategory;
  label: string;
  status: GrowthLineStatus;
  facts: string[];
  summary: string;
};

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
  /** 這週完成任務時，孩子自己開始 vs 被家長提醒才開始的次數——start_mode 統計。 */
  selfStartedCount: number;
  remindedCount: number;
  /**
   * 完成時段分布（晚餐後／睡前）——純資訊，不是建議依據。只有完成時記的
   * planned_time_window，沒有「排定 vs 實際」的對比資料，不足以判斷該不該
   * 調整時段。
   */
  afterDinnerCount: number;
  beforeBedCount: number;
  aiInsight: string;
  dialoguePrompt: string;
  /** 這週的成長線卡片——deterministic 算好的 status/facts，AI 只改寫過 summary。空陣列＝這週還沒有任何一條線有活動。 */
  growthLines: WeeklyGrowthLine[];
  /** growthLines 裡值得強調的那一條；undefined＝這週沒有特別要討論的線。 */
  focusLineKey: TaskCategory | undefined;
  /** 只針對 focusLineKey 的最小下一步；沒有 focus line 時是空字串。 */
  nextStep: string;
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
  adoptRecurrenceSuggestion: (taskId: string, recurrenceDays: number[]) => Promise<void>;
  deferSuggestion: (
    taskId: string,
    action: SuggestionAction,
    seed?: Pick<WeeklySuggestion, 'body' | 'actionLabel' | 'taskName'>,
  ) => Promise<void>;
  acknowledgeSuggestion: (
    taskId: string,
    action: SuggestionAction,
    seed?: Pick<WeeklySuggestion, 'body' | 'actionLabel' | 'taskName'>,
  ) => Promise<void>;
  revertSuggestion: (taskId: string, action: SuggestionAction) => Promise<void>;
};

/** Keep task state and Weekly Report decision evidence in causal order. */
export async function applySuggestionMutation(
  mutateTask: () => Promise<unknown>,
  patchSuggestion: () => Promise<unknown>,
): Promise<void> {
  await mutateTask();
  await patchSuggestion();
}

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

/**
 * Pure merge step behind patchSuggestionRecord: find the matching (taskId, action)
 * entry and patch it, or append a freshly-seeded one if it isn't there yet
 * (synthetic suggestions like pause_or_renegotiate aren't written to DB until the
 * first time a parent interacts with them). Kept standalone so the find-vs-append
 * decision is unit-testable without mocking supabase.
 */
export function mergeSuggestionPatch(
  existing: WeeklySuggestion[],
  taskId: string,
  action: SuggestionAction,
  patch: Partial<WeeklySuggestion>,
  seed?: Pick<WeeklySuggestion, 'body' | 'actionLabel' | 'taskName'>,
): WeeklySuggestion[] {
  const matched = existing.some(sg => sg.taskId === taskId && sg.action === action);
  return matched
    ? existing.map(sg => (sg.taskId === taskId && sg.action === action ? { ...sg, ...patch } : sg))
    : [
        ...existing,
        {
          body: seed?.body ?? '',
          actionLabel: seed?.actionLabel ?? '',
          ...(seed?.taskName ? { taskName: seed.taskName } : null),
          action,
          taskId,
          ...patch,
        } as WeeklySuggestion,
      ];
}

/**
 * Pure decision behind revertSuggestion: only adjust_schedule/adjust_recurrence have
 * an "applied value" to restore (from the pre-adoption snapshot kept on the
 * suggestion itself); every other action kind — and a missing snapshot — is a no-op.
 */
export function computeRevertTarget(
  action: SuggestionAction,
  sg: Pick<WeeklySuggestion, 'currentClaimPeriod' | 'currentMaxClaimsPerPeriod' | 'currentRecurrenceDays'>,
):
  | { kind: 'adjust_schedule'; claimPeriod: ScheduleClaimPeriod; maxClaimsPerPeriod: number }
  | { kind: 'adjust_recurrence'; recurrenceDays: number[] }
  | null {
  if (action === 'adjust_schedule') {
    if (sg.currentClaimPeriod == null || sg.currentMaxClaimsPerPeriod == null) return null;
    return { kind: 'adjust_schedule', claimPeriod: sg.currentClaimPeriod, maxClaimsPerPeriod: sg.currentMaxClaimsPerPeriod };
  }
  if (action === 'adjust_recurrence') {
    if (sg.currentRecurrenceDays == null) return null;
    return { kind: 'adjust_recurrence', recurrenceDays: sg.currentRecurrenceDays };
  }
  return null;
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
  const [selfStartedCount, setSelfStartedCount] = useState(0);
  const [remindedCount, setRemindedCount] = useState(0);
  const [afterDinnerCount, setAfterDinnerCount] = useState(0);
  const [beforeBedCount, setBeforeBedCount] = useState(0);
  const [aiInsight, setAiInsight] = useState(PENDING_INSIGHT);
  const [growthLines, setGrowthLines] = useState<WeeklyGrowthLine[]>([]);
  const [focusLineKey, setFocusLineKey] = useState<TaskCategory | undefined>(undefined);
  const [nextStep, setNextStep] = useState('');
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
          .select('id, task_id, coin_earned, time_saved_min, completed_at, status, start_mode, planned_time_window, tasks(name)')
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
      // 主動開始 vs 家長提醒——start_mode 一直都有記，只是從沒被彙總進週報過。
      setSelfStartedCount(completionData.filter(c => c.start_mode === 'self_started').length);
      setRemindedCount(completionData.filter(c => c.start_mode === 'reminded').length);
      // 完成時段分布——純資料顯示，不做成「建議」：這裡只有完成當下記的一筆
      // planned_time_window，沒有「排定哪個時段、實際做到沒」的對比資料，
      // 沒有足夠信號可以判斷「哪個時段比較好」，硬做規則建議會是亂猜。
      setAfterDinnerCount(completionData.filter(c => c.planned_time_window === 'after_dinner').length);
      setBeforeBedCount(completionData.filter(c => c.planned_time_window === 'before_bed').length);

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
              .select('motivation_observation, ai_suggestions, task_adjustments')
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
          growth_lines?: WeeklyGrowthLine[];
          focus_line_key?: TaskCategory | null;
          next_step?: string;
        } | null;
        task_adjustments: { abandonment_tier?: 1 | 2 | 3 | null } | null;
      } | null;

      if (report?.motivation_observation) {
        setAiInsight(report.motivation_observation);
        setAffirmations(report.ai_suggestions?.affirmations ?? PENDING_AFFIRMATIONS);
        setDialoguePrompt(report.ai_suggestions?.dialogue ?? '');
        setAiReady(true);
      } else {
        setAiInsight(PENDING_INSIGHT);
        setAffirmations(PENDING_AFFIRMATIONS);
        setDialoguePrompt('');
        setAiReady(false);
      }
      // growthLines 是 deterministic 算好的，跟 AI 有沒有成功生成無關——
      // 就算 aiReady=false（AI 掛掉或還沒生成過），只要 weekly_reports 那筆
      // 存在，growth_lines 就該顯示，不用等 AI。
      setGrowthLines(Array.isArray(report?.ai_suggestions?.growth_lines) ? report!.ai_suggestions!.growth_lines! : []);
      setFocusLineKey(report?.ai_suggestions?.focus_line_key ?? undefined);
      setNextStep(report?.ai_suggestions?.next_step ?? '');

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
      const mappedLTGs = rawLTGs.map(g => mapGoalProgress(g, start, weeklyDoneByTask, previousDoneByTask));
      setLongTermGoals(mappedLTGs);

      // 規則版建議：棄坑分級（detect-abandonment 已經算好、寫進 task_adjustments，
      // 這裡只是接上來變成一則可以「採用/觀察」的建議卡片）跟拆小目標（用長期
      // 任務「這週沒有進度」的既有訊號）。跟 AI 建議走同一個陣列、同一套持久化
      // 機制。棄坑分級是整個孩子層級的訊號、不是特定任務，借用 childId 當
      // taskId 方便沿用既有的 adopt/defer/patch；拆小目標則是真的有對應任務，
      // 用該長期任務自己的 taskId。
      const baseSuggestions = report?.ai_suggestions?.suggestions
        ? sanitizeSuggestions(report.ai_suggestions.suggestions)
        : [];
      const abandonmentTier = report?.task_adjustments?.abandonment_tier ?? null;
      const hasAbandonmentSuggestion = baseSuggestions.some(
        sg => sg.action === 'pause_or_renegotiate' && sg.taskId === childId,
      );
      const abandonmentSuggestion: WeeklySuggestion[] =
        (typeof abandonmentTier === 'number' && abandonmentTier >= 2 && !hasAbandonmentSuggestion)
          ? [{
              body: abandonmentTier >= 3
                ? '已經連續 14 天以上沒有任務完成紀錄，現在的安排可能跟孩子的步調不合了，建議先暫停、找時間重新聊聊怎麼調整。'
                : '已經一週左右沒有任務完成紀錄，建議留意一下，看看是不是有什麼地方卡住了。',
              actionLabel: '前往任務管理',
              action: 'pause_or_renegotiate',
              taskId: childId,
              taskName: childRes.data?.nickname || undefined,
            }]
          : [];

      // Tier 2（7天）以上才提，Tier 1（3天）留給孩子端的溫和提示，週報不用重複說。
      // 拆小目標：這週完全沒進度的長期任務，最多提 2 個，不要一次洗版。
      const stalledGoals = mappedLTGs.filter(g => g.noProgressThisWeek).slice(0, 2);
      const breakDownSuggestions: WeeklySuggestion[] = stalledGoals
        .filter(g => !baseSuggestions.some(sg => sg.action === 'break_down_goal' && sg.taskId === g.taskId))
        .map(g => ({
          body: `「${g.taskName}」這週還沒有進度，目標可能一次要求太多了，建議跟孩子聊聊，看看能不能拆成幾個更小的步驟慢慢來。`,
          actionLabel: '前往長期任務',
          action: 'break_down_goal',
          taskId: g.taskId,
          taskName: g.taskName,
        }));

      const finalSuggestions = [...baseSuggestions, ...abandonmentSuggestion, ...breakDownSuggestions];
      setSuggestions(finalSuggestions.length > 0 ? finalSuggestions : PENDING_SUGGESTIONS);

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

  /**
   * 幫某一則建議的紀錄打補丁（讓卡片留在清單裡，只換按鈕/badge，不整筆刪掉）。
   * 套用、觀察都經過這裡，只是 patch 的內容不同。
   *
   * 同一個任務可能同時有排程建議跟排定日建議（taskId 相同），一定要連 action
   * 種類一起比對，不然處理其中一則會把另一則也標成同樣的結論。
   */
  const patchSuggestionRecord = useCallback(async (
    taskId: string,
    action: SuggestionAction,
    patch: Partial<WeeklySuggestion>,
    /**
     * 用來「補插入」的最小資料——像棄坑分級這種規則版建議是前端合成的，
     * 家長第一次按套用/觀察之前根本沒被寫進 DB 過，這時候找不到既有紀錄
     * 可以打補丁，要用這份資料生一筆新的，而不是靜靜跳過。
     */
    seed?: Pick<WeeklySuggestion, 'body' | 'actionLabel' | 'taskName'>,
  ) => {
    const weekStartDate = getWeekBounds(weekOffset).start.format('YYYY-MM-DD');
    const { data: reportRow, error: fetchErr } = await supabase
      .from('weekly_reports')
      .select('id, ai_suggestions')
      .eq('child_id', childId)
      .eq('week_start', weekStartDate)
      .maybeSingle();

    if (fetchErr || !reportRow) return;

    const current = (reportRow.ai_suggestions ?? {}) as {
      suggestions?: WeeklySuggestion[];
      affirmations?: string[];
      dialogue?: string;
    };
    const existing = current.suggestions ?? [];
    const updated = mergeSuggestionPatch(existing, taskId, action, patch, seed);

    await supabase
      .from('weekly_reports')
      .update({ ai_suggestions: { ...current, suggestions: updated } })
      .eq('id', reportRow.id);
  }, [childId, weekOffset]);

  const adoptScheduleSuggestion = useCallback(async (
    taskId: string,
    claimPeriod: ScheduleClaimPeriod,
    maxClaimsPerPeriod: number,
  ) => {
    await applySuggestionMutation(
      () => updateTaskSchedule(taskId, claimPeriod, maxClaimsPerPeriod),
      () => patchSuggestionRecord(taskId, 'adjust_schedule', {
        adopted: true,
        deferred: false,
        decidedAt: new Date().toISOString(),
        // 家長編輯過就跟 AI 原始建議不一樣了——兩者分開存，suggestedX 永遠是原始建議。
        adoptedClaimPeriod: claimPeriod,
        adoptedMaxClaimsPerPeriod: maxClaimsPerPeriod,
      }),
    );
    await fetchAll();
  }, [patchSuggestionRecord, fetchAll]);

  const adoptRecurrenceSuggestion = useCallback(async (
    taskId: string,
    recurrenceDays: number[],
  ) => {
    await applySuggestionMutation(
      () => updateTaskRecurrenceDays(taskId, recurrenceDays),
      () => patchSuggestionRecord(taskId, 'adjust_recurrence', {
        adopted: true,
        deferred: false,
        decidedAt: new Date().toISOString(),
        adoptedRecurrenceDays: recurrenceDays,
      }),
    );
    await fetchAll();
  }, [patchSuggestionRecord, fetchAll]);

  /** 「再觀察一週」——跟採用一樣是個真的決定，要留紀錄，不是單純從畫面上消失。 */
  const deferSuggestion = useCallback(async (
    taskId: string,
    action: SuggestionAction,
    seed?: Pick<WeeklySuggestion, 'body' | 'actionLabel' | 'taskName'>,
  ) => {
    await patchSuggestionRecord(taskId, action, {
      deferred: true,
      decidedAt: new Date().toISOString(),
    }, seed);
    await fetchAll();
  }, [patchSuggestionRecord, fetchAll]);

  /**
   * 有些建議「採用」不是自動改資料庫，是帶家長去對應畫面自己處理——
   * 暫停/重新協商、拆小目標都是需要親子對話的決定，不該讓 AI 或規則引擎
   * 幫忙盲目寫入。這裡只負責留下「家長已經看過、決定要處理」的紀錄，
   * 實際導頁由呼叫端（畫面）自己做。
   */
  const acknowledgeSuggestion = useCallback(async (
    taskId: string,
    action: SuggestionAction,
    seed?: Pick<WeeklySuggestion, 'body' | 'actionLabel' | 'taskName'>,
  ) => {
    await patchSuggestionRecord(taskId, action, {
      adopted: true,
      deferred: false,
      decidedAt: new Date().toISOString(),
    }, seed);
    await fetchAll();
  }, [patchSuggestionRecord, fetchAll]);

  /**
   * 取消套用——回到採用前的狀態。
   *
   * currentClaimPeriod/currentMaxClaimsPerPeriod/currentRecurrenceDays 本來就是
   * 「採用前」的快照（候選清單算的時候存的），不用另外多存一份「舊值」，直接拿來
   * 當復原目標，把任務改回去、把這則建議的 adopted 狀態清掉即可。
   */
  const revertSuggestion = useCallback(async (taskId: string, action: SuggestionAction) => {
    const sg = suggestions.find(s => s.taskId === taskId && s.action === action);
    if (!sg) return;

    const target = computeRevertTarget(action, sg);
    if (target == null) return;

    await applySuggestionMutation(
      () => target.kind === 'adjust_schedule'
        ? updateTaskSchedule(taskId, target.claimPeriod, target.maxClaimsPerPeriod)
        : updateTaskRecurrenceDays(taskId, target.recurrenceDays),
      () => patchSuggestionRecord(taskId, action, {
        adopted: false,
        decidedAt: undefined,
        adoptedClaimPeriod: undefined,
        adoptedMaxClaimsPerPeriod: undefined,
        adoptedRecurrenceDays: undefined,
      }),
    );
    await fetchAll();
  }, [suggestions, patchSuggestionRecord, fetchAll]);

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
    selfStartedCount,
    remindedCount,
    afterDinnerCount,
    beforeBedCount,
    aiInsight,
    dialoguePrompt,
    growthLines,
    focusLineKey,
    nextStep,
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
    adoptRecurrenceSuggestion,
    deferSuggestion,
    acknowledgeSuggestion,
    revertSuggestion,
  };
}
