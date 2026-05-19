import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from './supabase';
import type { Task, CheckpointRewards } from '../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

type CreateChildTaskInput = {
  familyId: string;
  childId: string;
  ageGroup: '2-4' | '4-6' | '6-9' | '9-12';
  name: string;
  category: 'B' | 'C';
  baseTimeMin: number;
  difficulty: number;
};
// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Calculates the coin reward for completing a task.
 * Task-A and Task-B always return 0.
 * Task-C/D use coin_override if set, otherwise Math.round(base_time_min * difficulty).
 * Applies a 0.7 discount when prerequisite tasks are incomplete.
 */
export function calcCoin(task: Task, isPrerequisiteMet: boolean): number {
  if (task.category === 'A' || task.category === 'B') return 0;
  const base = task.coin_override ?? Math.round(task.base_time_min * task.difficulty);
  const discount = isPrerequisiteMet ? 1.0 : 0.7;
  return Math.round(base * discount);
}

export type MilestoneResult = {
  goalId: string;
  day: number;
  coinReward: number;
};

/**
 * Checks whether currentDay (after increment) hits a checkpoint.
 * Returns the MilestoneResult if so, null otherwise.
 */
export function checkMilestone(
  goalId: string,
  currentDay: number,
  checkpointRewards: CheckpointRewards | null,
): MilestoneResult | null {
  if (!checkpointRewards) return null;
  const coin = checkpointRewards[String(currentDay)];
  if (coin === undefined) return null;
  return { goalId, day: currentDay, coinReward: coin };
}

/**
 * Returns the highest checkpoint day strictly less than currentDay.
 * Used to enforce the "don't fall below last checkpoint" rule after a habit gap.
 * Returns 0 when currentDay is at or before the first checkpoint.
 */
export function getPrevCheckpoint(
  currentDay: number,
  checkpointRewards: CheckpointRewards | null,
): number {
  if (!checkpointRewards) return 0;
  const days = Object.keys(checkpointRewards)
    .map(Number)
    .sort((a, b) => a - b);
  const prev = days.filter(d => d < currentDay);
  return prev.length > 0 ? prev[prev.length - 1] : 0;
}
export type CompletionResult = {
  completionId: string;
  coinEarned: number;
  timeSavedMin: number;
  milestone: MilestoneResult | null;
};

/**
 * Records a task completion via the complete-task Edge Function.
 * All DB writes (task_completion, wallet, transaction, time_savings, long_term_goal)
 * happen server-side for consistency.
 *
 * @param taskId            The task being completed
 * @param childId           The child completing the task
 * @param completedDate     ISO date string (YYYY-MM-DD) in Asia/Taipei timezone
 * @param isPrerequisiteMet Whether all Task-A and Task-B tasks are done today
 * @param task              Full task row — still used for local UI coin preview
 * @param goalId            Required only for Task-D habit-type tasks
 */
export async function completeTask(
  taskId: string,
  childId: string,
  completedDate: string,
  isPrerequisiteMet: boolean,
  task: Task,
  goalId?: string,
): Promise<CompletionResult> {
  const { data, error } = await supabase.functions.invoke('complete-task', {
    body: { taskId, childId, completedDate, isPrerequisiteMet, goalId },
  });

  if (error) throw new Error(error.message ?? 'complete-task Edge Function failed');

  const result = data as CompletionResult;

  // Re-attach milestone goalId for callers that rely on it (Edge Function returns it already,
  // but coerce the type to match MilestoneResult)
  if (result.milestone) {
    result.milestone = result.milestone as MilestoneResult;
  }

  // Keep coin/time in sync with local task state for immediate UI feedback
  // (Edge Function recalculates authoritative values from DB, but these should match)
  const expectedCoin = calcCoin(task, isPrerequisiteMet);
  if (result.coinEarned !== expectedCoin) {
    console.warn('[completeTask] server coinEarned differs from client preview', {
      server: result.coinEarned,
      client: expectedCoin,
    });
  }

  return result;
}

/**
 * Checks whether a habit-type long-term goal missed yesterday's check-in
 * and decrements current_day by 1 (floor = previous checkpoint day).
 * Called on HomeScreen mount to enforce the "soft reset" anti-frustration rule.
 */
export async function applyHabitResume(
  goalId: string,
  childId: string,
  taskId: string,
  currentDay: number,
  checkpointRewards: CheckpointRewards | null,
): Promise<void> {
  const yesterday = dayjs().tz(TZ).subtract(1, 'day').format('YYYY-MM-DD');

  const { data: completions } = await supabase
    .from('task_completions')
    .select('id')
    .eq('task_id', taskId)
    .eq('child_id', childId)
    .gte('completed_at', yesterday)
    .lt('completed_at', dayjs().tz(TZ).format('YYYY-MM-DD'))
    .limit(1);

  const missedYesterday = !completions || completions.length === 0;
  if (!missedYesterday || currentDay <= 0) return;

  const floor = getPrevCheckpoint(currentDay, checkpointRewards);
  const newDay = Math.max(currentDay - 1, floor);

  await supabase
    .from('long_term_goals')
    .update({ current_day: newDay })
    .eq('id', goalId);
}

/**
 * Convert an age group identifier into numeric min/max ages.
 *
 * This helps ensure inserted `tasks` rows carry concrete numeric
 * `min_age`/`max_age` values rather than string enums.
 */
function getAgeRange(ageGroup: CreateChildTaskInput['ageGroup']): { minAge: number; maxAge: number } {
  if (ageGroup === '2-4') return { minAge: 2, maxAge: 4 };
  if (ageGroup === '4-6') return { minAge: 4, maxAge: 6 };
  if (ageGroup === '6-9') return { minAge: 6, maxAge: 9 };
  return { minAge: 9, maxAge: 12 };
}


/**
 * 建立一筆孩子專屬的自訂任務，並同步綁定到 child_tasks。
 */
export async function createChildTask(input: CreateChildTaskInput): Promise<void> {
  const ageRange = getAgeRange(input.ageGroup);
  // Normalize numeric fields to match DB column expectations and avoid accidental type mismatches
  const safeBaseTime = Number.isFinite(Number(input.baseTimeMin)) ? Math.max(1, Math.round(input.baseTimeMin)) : 1;
  // Keep one decimal for difficulty (e.g. 1.5) but avoid passing weird strings
  const safeDifficulty = Number.isFinite(Number(input.difficulty))
    ? Math.round(Number(input.difficulty) * 10) / 10
    : 1;
  const safeTimeSaving = input.category === 'B' ? safeBaseTime : 0;

  try {
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        family_id: input.familyId,
        name: input.name,
        category: input.category,
        day_type: 'both',
        long_term_type: null,
        is_long_term: false,
        base_time_min: safeBaseTime,
        difficulty: safeDifficulty,
        coin_override: null,
        is_system_default: false,
        allow_repeat: false,
        min_age: ageRange.minAge,
        max_age: ageRange.maxAge,
        is_active: true,
        time_saving_min: safeTimeSaving,
      })
      .select('id')
      .single();

    if (taskError || !task) {
      console.error('[createChildTask] tasks.insert error:', taskError);
      throw new Error(taskError?.message ?? '建立任務失敗');
    }

    const { error: childTaskError } = await supabase.from('child_tasks').insert({
      child_id: input.childId,
      task_id: task.id,
      is_active: true,
    });

    if (childTaskError) {
      // rollback created task to avoid orphan rows
      await supabase.from('tasks').delete().eq('id', task.id);
      console.error('[createChildTask] child_tasks.insert error:', childTaskError);
      throw new Error(childTaskError.message);
    }
  } catch (err) {
    // rethrow with helpful message for caller
    console.error('[createChildTask] unexpected error:', err);
    throw err;
  }
}
