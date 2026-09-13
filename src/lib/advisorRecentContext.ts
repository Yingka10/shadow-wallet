import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

import { supabase } from './supabase';
import type { ChildProposalPlanVersion } from './childProposal/types';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

const TZ = 'Asia/Taipei';
export const ADVISOR_RECENT_COMPLETED_WEEKS = 4;
const MAX_TASKS_PER_WEEK = 8;

export type AdvisorRecentTaskActivity = {
  taskName: string;
  completedCount: number;
  selfStartedCount: number;
  remindedCount: number;
};

export type AdvisorRecentWeek = {
  weekStart: string;
  weekEnd: string;
  tasks: AdvisorRecentTaskActivity[];
};

export type AdvisorSharedPlanChange = {
  taskName: string;
  changedAt: string;
  changes: string[];
};

export type AdvisorRecentFamilyContext = {
  /** 已結束的 ISO 週，依時間由舊到新；不把本週未完資料跟完整週直接相比。 */
  completedWeeks: AdvisorRecentWeek[];
  /** 最近一筆已生效共同版本相對於它採用來源的可確認差異。 */
  latestSharedPlanChange: AdvisorSharedPlanChange | null;
};

type CompletionRow = {
  task_id: string;
  completed_at: string;
  start_mode: string | null;
};

type PlanComparable = Pick<
  ChildProposalPlanVersion,
  | 'id'
  | 'adopted_from_plan_version_id'
  | 'cadence_mode'
  | 'cadence_weekly_frequency'
  | 'cadence_days'
  | 'preferred_time'
  | 'preferred_time_custom'
  | 'duration_days'
  | 'effective_at'
  | 'parent_confirmed_at'
  | 'created_at'
>;

type PlanChangeCandidate = {
  taskName: string;
  current: PlanComparable;
  source: PlanComparable;
};

function formatWeekdayList(days: number[] | null): string {
  if (!days || days.length === 0) return '未指定固定星期';
  const labels: Record<number, string> = {
    0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六',
  };
  const order = [1, 2, 3, 4, 5, 6, 0];
  const sorted = [...new Set(days)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return `週${sorted.map(day => labels[day] ?? '?').join('、')}`;
}

function formatCadence(plan: PlanComparable): string {
  if (plan.cadence_mode === 'weekly_frequency' && plan.cadence_weekly_frequency != null) {
    return `每週 ${plan.cadence_weekly_frequency} 次`;
  }
  if (plan.cadence_mode === 'fixed_days') return formatWeekdayList(plan.cadence_days);
  if (plan.cadence_mode === 'one_time') return '單次完成';
  if (plan.cadence_mode === 'plan_schedule') return '依計畫進度';
  return '未指定節奏';
}

function formatPreferredTime(plan: PlanComparable): string {
  if (plan.preferred_time === 'custom') return plan.preferred_time_custom?.trim() || '自訂時段';
  const labels: Record<string, string> = {
    after_dinner: '晚餐後',
    before_bed: '睡前',
    flexible: '彈性安排',
  };
  return plan.preferred_time ? (labels[plan.preferred_time] ?? plan.preferred_time) : '未指定時段';
}

/**
 * 把逐筆完成紀錄整理成最近幾個「已結束」的週。這層只陳述完成與開始方式，
 * 不用現在的任務目標回推歷史目標，避免任務改版後把舊週算錯。
 */
export function buildRecentCompletedWeeks(
  completions: CompletionRow[],
  taskNameById: Map<string, string>,
  currentWeekStart: string,
): AdvisorRecentWeek[] {
  const currentStart = dayjs.tz(currentWeekStart, TZ).startOf('day');
  const buckets = new Map<string, Map<string, AdvisorRecentTaskActivity>>();

  for (const row of completions) {
    const completedAt = dayjs(row.completed_at).tz(TZ);
    if (!completedAt.isValid() || !completedAt.isBefore(currentStart)) continue;
    const weekStart = completedAt.startOf('isoWeek').format('YYYY-MM-DD');
    const earliest = currentStart.subtract(ADVISOR_RECENT_COMPLETED_WEEKS, 'week');
    if (dayjs.tz(weekStart, TZ).isBefore(earliest)) continue;

    if (!buckets.has(weekStart)) buckets.set(weekStart, new Map());
    const byTask = buckets.get(weekStart)!;
    const current = byTask.get(row.task_id) ?? {
      taskName: taskNameById.get(row.task_id) ?? '任務名稱未提供',
      completedCount: 0,
      selfStartedCount: 0,
      remindedCount: 0,
    };
    current.completedCount += 1;
    if (row.start_mode === 'self_started') current.selfStartedCount += 1;
    if (row.start_mode === 'reminded') current.remindedCount += 1;
    byTask.set(row.task_id, current);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, byTask]) => ({
      weekStart,
      weekEnd: dayjs.tz(weekStart, TZ).add(6, 'day').format('YYYY-MM-DD'),
      tasks: [...byTask.values()]
        .sort((a, b) => b.completedCount - a.completedCount || a.taskName.localeCompare(b.taskName, 'zh-Hant'))
        .slice(0, MAX_TASKS_PER_WEEK),
    }));
}

/** 只列兩個版本真的不同的欄位；沒有差異就不把它包裝成「調整」。 */
export function buildSharedPlanChange(candidate: PlanChangeCandidate): AdvisorSharedPlanChange | null {
  const changes: string[] = [];
  const beforeCadence = formatCadence(candidate.source);
  const afterCadence = formatCadence(candidate.current);
  if (beforeCadence !== afterCadence) changes.push(`執行節奏：${beforeCadence} → ${afterCadence}`);

  const beforeTime = formatPreferredTime(candidate.source);
  const afterTime = formatPreferredTime(candidate.current);
  if (beforeTime !== afterTime) changes.push(`安排時段：${beforeTime} → ${afterTime}`);

  if (candidate.source.duration_days !== candidate.current.duration_days) {
    const before = candidate.source.duration_days == null ? '未指定期限' : `${candidate.source.duration_days} 天`;
    const after = candidate.current.duration_days == null ? '未指定期限' : `${candidate.current.duration_days} 天`;
    changes.push(`計畫期間：${before} → ${after}`);
  }

  if (changes.length === 0) return null;
  return {
    taskName: candidate.taskName,
    changedAt:
      candidate.current.effective_at
      ?? candidate.current.parent_confirmed_at
      ?? candidate.current.created_at,
    changes: changes.slice(0, 3),
  };
}

const PLAN_FIELDS = [
  'id',
  'adopted_from_plan_version_id',
  'cadence_mode',
  'cadence_weekly_frequency',
  'cadence_days',
  'preferred_time',
  'preferred_time_custom',
  'duration_days',
  'effective_at',
  'parent_confirmed_at',
  'created_at',
].join(', ');

/**
 * 讀取顧問用的最小跨週脈絡。兩個來源彼此獨立降級：完成歷史或共同版本其中
 * 一邊查不到，另一邊仍可用；整段失敗也只回空 context，不阻斷顧問聊天。
 */
export async function loadAdvisorRecentFamilyContext(
  childId: string,
): Promise<AdvisorRecentFamilyContext> {
  const currentWeekStart = dayjs().tz(TZ).startOf('isoWeek');
  const earliestStart = currentWeekStart.subtract(ADVISOR_RECENT_COMPLETED_WEEKS, 'week');
  let completedWeeks: AdvisorRecentWeek[] = [];
  let latestSharedPlanChange: AdvisorSharedPlanChange | null = null;

  try {
    const { data: completionRows, error: completionError } = await supabase
      .from('task_completions')
      .select('task_id, completed_at, start_mode')
      .eq('child_id', childId)
      .gte('completed_at', earliestStart.toISOString())
      .lt('completed_at', currentWeekStart.toISOString())
      .order('completed_at', { ascending: true });
    if (completionError) throw completionError;

    const rows = (completionRows ?? []) as CompletionRow[];
    const taskIds = [...new Set(rows.map(row => row.task_id))];
    let taskNameById = new Map<string, string>();
    if (taskIds.length > 0) {
      const { data: tasks, error: taskError } = await supabase
        .from('tasks')
        .select('id, name')
        .in('id', taskIds);
      if (taskError) throw taskError;
      taskNameById = new Map((tasks ?? []).map(task => [task.id, task.name]));
    }
    completedWeeks = buildRecentCompletedWeeks(
      rows,
      taskNameById,
      currentWeekStart.format('YYYY-MM-DD'),
    );
  } catch (err) {
    console.warn('[advisorRecentContext] completion history unavailable:', err);
  }

  try {
    const { data: proposals, error: proposalError } = await supabase
      .from('child_proposals')
      .select('task_id, current_plan_version_id')
      .eq('child_id', childId)
      .eq('status', 'active')
      .not('task_id', 'is', null)
      .not('current_plan_version_id', 'is', null);
    if (proposalError) throw proposalError;

    const currentIds = (proposals ?? [])
      .map(proposal => proposal.current_plan_version_id)
      .filter((id): id is string => typeof id === 'string');
    if (currentIds.length > 0) {
      const { data: currentRows, error: currentError } = await supabase
        .from('child_proposal_plan_versions')
        .select(PLAN_FIELDS)
        .in('id', currentIds);
      if (currentError) throw currentError;

      const currents = (currentRows ?? []) as unknown as PlanComparable[];
      const sourceIds = currents
        .map(version => version.adopted_from_plan_version_id)
        .filter((id): id is string => typeof id === 'string');
      if (sourceIds.length > 0) {
        const [{ data: sourceRows, error: sourceError }, { data: taskRows, error: taskError }] = await Promise.all([
          supabase.from('child_proposal_plan_versions').select(PLAN_FIELDS).in('id', sourceIds),
          supabase
            .from('tasks')
            .select('id, name')
            .in('id', (proposals ?? []).map(proposal => proposal.task_id).filter((id): id is string => typeof id === 'string')),
        ]);
        if (sourceError) throw sourceError;
        if (taskError) throw taskError;

        const sourceById = new Map(
          ((sourceRows ?? []) as unknown as PlanComparable[]).map(version => [version.id, version]),
        );
        const taskNameById = new Map((taskRows ?? []).map(task => [task.id, task.name]));
        const proposalByVersionId = new Map(
          (proposals ?? []).map(proposal => [proposal.current_plan_version_id, proposal]),
        );
        const changes = currents
          .map(current => {
            const source = current.adopted_from_plan_version_id
              ? sourceById.get(current.adopted_from_plan_version_id)
              : undefined;
            const proposal = proposalByVersionId.get(current.id);
            if (!source || !proposal?.task_id) return null;
            return buildSharedPlanChange({
              current,
              source,
              taskName: taskNameById.get(proposal.task_id) ?? '任務名稱未提供',
            });
          })
          .filter((change): change is AdvisorSharedPlanChange => change != null)
          .sort((a, b) => b.changedAt.localeCompare(a.changedAt));
        latestSharedPlanChange = changes[0] ?? null;
      }
    }
  } catch (err) {
    console.warn('[advisorRecentContext] shared-plan history unavailable:', err);
  }

  return { completedWeeks, latestSharedPlanChange };
}
