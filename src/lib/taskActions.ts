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

// ── Async actions ─────────────────────────────────────────────────────────────

export type CompletionResult = {
  completionId: string;
  coinEarned: number;
  timeSavedMin: number;
  milestone: MilestoneResult | null;
};

/**
 * Records a task completion and handles all side-effects:
 * - Inserts a task_completion row
 * - Task-C/D: updates wallet balance and inserts a transaction
 * - Task-B: inserts a time_savings row
 * - Task-D habit: increments long_term_goal.current_day and checks for milestone coin
 *
 * @param taskId       The task being completed
 * @param childId      The child completing the task
 * @param completedDate ISO date string (YYYY-MM-DD) in Asia/Taipei timezone
 * @param isPrerequisiteMet Whether all Task-A and Task-B tasks are done today
 * @param task         Full task row (needed for coin calculation)
 * @param goalId       Required only for Task-D habit-type tasks
 */
export async function completeTask(
  taskId: string,
  childId: string,
  completedDate: string,
  isPrerequisiteMet: boolean,
  task: Task,
  goalId?: string,
): Promise<CompletionResult> {
  const coinEarned = calcCoin(task, isPrerequisiteMet);
  const timeSavedMin = task.category === 'B' ? task.time_saving_min : 0;

  // 1. Insert task_completion
  const { data: completion, error: completionError } = await supabase
    .from('task_completions')
    .insert({
      task_id: taskId,
      child_id: childId,
      completed_at: completedDate,
      reported_by: 'child',
      status: 'completed',
      coin_earned: coinEarned,
      time_saved_min: timeSavedMin,
    })
    .select('id')
    .single();

  if (completionError || !completion) {
    throw new Error(completionError?.message ?? 'Failed to insert task_completion');
  }

  const completionId = completion.id;
  let milestone: MilestoneResult | null = null;

  // 2. Task-C/D: update wallet and insert transaction
  if (coinEarned > 0) {
    const { data: wallet, error: walletFetchError } = await supabase
      .from('wallets')
      .select('id, balance')
      .eq('child_id', childId)
      .eq('wallet_type', 'spending')
      .single();

    if (walletFetchError || !wallet) {
      throw new Error(walletFetchError?.message ?? 'Spending wallet not found');
    }

    const { error: walletUpdateError } = await supabase
      .from('wallets')
      .update({ balance: wallet.balance + coinEarned })
      .eq('id', wallet.id);

    if (walletUpdateError) {
      throw new Error(walletUpdateError.message);
    }

    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        wallet_id: wallet.id,
        amount: coinEarned,
        type: 'earn',
        reference_id: completionId,
        reference_type: 'task_completion',
      });

    if (txError) throw new Error(txError.message);
  }

  // 3. Task-B: insert time_savings
  if (task.category === 'B' && timeSavedMin > 0) {
    const { error: tsError } = await supabase
      .from('time_savings')
      .insert({
        child_id: childId,
        completion_id: completionId,
        minutes_saved: timeSavedMin,
      });

    if (tsError) throw new Error(tsError.message);
  }

  // 4. Task-D habit: increment current_day, check milestone
  if (task.category === 'D' && task.long_term_type === 'habit' && goalId) {
    const { data: goal, error: goalFetchError } = await supabase
      .from('long_term_goals')
      .select('current_day, checkpoint_rewards')
      .eq('id', goalId)
      .single();

    if (goalFetchError || !goal) {
      throw new Error(goalFetchError?.message ?? 'Long-term goal not found');
    }

    const newDay = goal.current_day + 1;
    const { error: goalUpdateError } = await supabase
      .from('long_term_goals')
      .update({ current_day: newDay })
      .eq('id', goalId);

    if (goalUpdateError) throw new Error(goalUpdateError.message);

    const rewards = goal.checkpoint_rewards as CheckpointRewards | null;
    milestone = checkMilestone(goalId, newDay, rewards);

    // Award milestone coins
    if (milestone) {
      const { data: wallet, error: wErr } = await supabase
        .from('wallets')
        .select('id, balance')
        .eq('child_id', childId)
        .eq('wallet_type', 'spending')
        .single();

      if (!wErr && wallet) {
        await supabase
          .from('wallets')
          .update({ balance: wallet.balance + milestone.coinReward })
          .eq('id', wallet.id);

        await supabase.from('transactions').insert({
          wallet_id: wallet.id,
          amount: milestone.coinReward,
          type: 'earn',
          reference_id: goalId,
          reference_type: 'long_term_goal_milestone',
        });
      }
    }
  }

  return { completionId, coinEarned, timeSavedMin, milestone };
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

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert({
      family_id: input.familyId,
      name: input.name,
      category: input.category,
      day_type: 'both',
      long_term_type: null,
      is_long_term: false,
      base_time_min: input.baseTimeMin,
      difficulty: input.difficulty,
      coin_override: null,
      is_system_default: false,
      allow_repeat: false,
      min_age: ageRange.minAge,
      max_age: ageRange.maxAge,
      is_active: true,
      time_saving_min: input.category === 'B' ? input.baseTimeMin : 0,
      parent_task_id: null,
    })
    .select('id')
    .single();

  if (taskError || !task) {
    throw new Error(taskError?.message ?? '建立任務失敗');
  }

  const { error: childTaskError } = await supabase.from('child_tasks').insert({
    child_id: input.childId,
    task_id: task.id,
    is_active: true,
  });

  if (childTaskError) {
    await supabase.from('tasks').delete().eq('id', task.id);
    throw new Error(childTaskError.message);
  }
}
