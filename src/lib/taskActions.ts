import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from './supabase';
import type { Task, CheckpointRewards, OverrideType } from '../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

export type MarkOption = 'exceeded' | 'partial' | 'none' | 'other';

export const OVERRIDE_TYPE_MAP: Record<MarkOption, OverrideType> = {
  exceeded: 'renegotiate',
  partial:  'partial',
  none:     'none',
  other:    'renegotiate',
};

const TZ = 'Asia/Taipei';

/**
 * Records a parent override for a child's completed task.
 * Writes to overrides, optionally adjusts wallet + transactions,
 * and updates task_completions.coin_earned / override_id / status.
 *
 * @throws when parent session is invalid, completion is not found, or any DB write fails
 */
export async function parentMarkTask(
  taskId: string,
  childId: string,
  markOption: MarkOption,
  adjustedCoin: number,
  note: string | null,
): Promise<void> {
  const safeAdjustedCoin = Math.round(adjustedCoin);

  // 1. Resolve parent ID
  const { data: parentId, error: rpcError } = await supabase.rpc('my_parent_id');
  if (rpcError != null || parentId == null) throw new Error('找不到家長帳號');

  // 2. Find today's completion for this task + child
  const today    = dayjs().tz(TZ).format('YYYY-MM-DD');
  const tomorrow = dayjs().tz(TZ).add(1, 'day').format('YYYY-MM-DD');

  const { data: completion, error: completionError } = await supabase
    .from('task_completions')
    .select('id, coin_earned')
    .eq('task_id', taskId)
    .eq('child_id', childId)
    .gte('completed_at', today)
    .lt('completed_at', tomorrow)
    .single();

  if (completionError != null || completion == null) throw new Error('找不到今日完成紀錄');

  const completionId  = completion.id;
  const originalCoin  = completion.coin_earned;

  // 3. Insert override record
  const { data: override, error: overrideError } = await supabase
    .from('overrides')
    .insert({
      completion_id: completionId,
      parent_id:     parentId,
      override_type: OVERRIDE_TYPE_MAP[markOption],
      coin_deducted: Math.max(originalCoin - safeAdjustedCoin, 0),
      credit_flag:   false,
      reason:        note ?? null,
    })
    .select('id')
    .single();

  if (overrideError != null || override == null) {
    throw new Error(overrideError?.message ?? '標記失敗');
  }

  const overrideId = override.id;

  // 4. Wallet adjustment (skip when coin value unchanged)
  const coinDiff = originalCoin - safeAdjustedCoin;   // positive = deduct, negative = add
  if (coinDiff !== 0) {
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id, balance')
      .eq('child_id', childId)
      .eq('wallet_type', 'spending')
      .single();

    if (walletError != null || wallet == null) throw new Error('找不到錢包');

    const walletId  = wallet.id;
    const newBalance = wallet.balance - coinDiff;

    const { error: walletUpdateError } = await supabase
      .from('wallets')
      .update({ balance: newBalance })
      .eq('id', walletId);

    if (walletUpdateError != null) throw new Error(walletUpdateError.message);

    const { error: txError } = await supabase.from('transactions').insert({
      wallet_id:      walletId,
      amount:         Math.abs(coinDiff),
      type:           coinDiff > 0 ? 'deduct' : 'adjust',
      reference_id:   overrideId,
      reference_type: 'override',
    });

    if (txError != null) throw new Error(txError.message);
  }

  // 5. Update task_completion: coin_earned + override_id; flag status if 'none'
  const completionUpdate = markOption === 'none'
    ? { coin_earned: safeAdjustedCoin, override_id: overrideId, status: 'flagged' as const }
    : { coin_earned: safeAdjustedCoin, override_id: overrideId };

  const { error: updateError } = await supabase
    .from('task_completions')
    .update(completionUpdate)
    .eq('id', completionId);

  if (updateError != null) throw new Error(updateError.message);
}

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
 * Records a task completion and applies the reward side-effects locally.
 *
 * DB writes are handled on the client because the Edge Function path is not
 * reliable in this workspace and was returning 400 before the insert completed.
 *
 * @param taskId            The task being completed
 * @param childId           The child completing the task
 * @param completedDate     ISO date string (YYYY-MM-DD) in Asia/Taipei timezone
 * @param isPrerequisiteMet Whether all Task-A and Task-B tasks are done today
 * @param task              Full task row — used for coin calculation
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

  // 4. 'once' task: deactivate from child's list after completion
  if (task.day_type === 'once') {
    await supabase
      .from('child_tasks')
      .update({ is_active: false })
      .eq('task_id', taskId)
      .eq('child_id', childId);
  }

  // 5. Task-D habit: increment current_day, check milestone
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

/** Returns true when the given day-of-week is a valid check-in day for this habit. */
export function isActiveDayForHabit(dow: number, activeDays: number[] | null): boolean {
  if (activeDays === null) return true;
  return activeDays.includes(dow);
}

/**
 * Checks whether a habit-type goal missed its most recent valid check-in day
 * and decrements current_day by 1 (floor = previous checkpoint day).
 * Called on HomeScreen mount — "soft reset" anti-frustration rule.
 *
 * If yesterday was not in activeDays (a rest day), returns immediately with no
 * DB access. activeDays=null means every day is valid (preserves original behaviour).
 */
export async function applyHabitResume(
  goalId: string,
  childId: string,
  taskId: string,
  currentDay: number,
  checkpointRewards: CheckpointRewards | null,
  activeDays: number[] | null,
): Promise<void> {
  const yesterday = dayjs().tz(TZ).subtract(1, 'day');
  const yesterdayStr = yesterday.format('YYYY-MM-DD');
  const yesterdayDow = yesterday.day(); // 0=Sun, 1=Mon, ..., 6=Sat

  if (!isActiveDayForHabit(yesterdayDow, activeDays)) return;

  const { data: completions } = await supabase
    .from('task_completions')
    .select('id')
    .eq('task_id', taskId)
    .eq('child_id', childId)
    .gte('completed_at', yesterdayStr)
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

type CreateLongTermGoalInput = {
  familyId: string;
  childId: string;
  name: string;
  totalDays: number;
  checkpointRewards: CheckpointRewards;
  activeDays?: number[];    // undefined → null in DB (every day active)
  motivationNote?: string;
};

/**
 * 建立 habit 類型長期目標。
 * 依序寫入 tasks（is_long_term=true）、child_tasks、long_term_goals（含關卡獎勵）。
 */
export async function createLongTermGoal(input: CreateLongTermGoalInput): Promise<void> {
  const today = dayjs().tz(TZ).format('YYYY-MM-DD');

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert({
      family_id: input.familyId,
      name: input.name,
      category: 'D',
      day_type: 'both',
      is_long_term: true,
      long_term_type: 'habit',
      base_time_min: 15,
      difficulty: 1,
      coin_override: null,
      time_saving_min: 0,
      is_system_default: false,
      allow_repeat: false,
      min_age: 0,
      max_age: 99,
      is_active: true,
    })
    .select('id')
    .single();

  if (taskError || !task) {
    throw new Error(taskError?.message ?? '建立長期任務失敗');
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

  const { error: goalError } = await supabase.from('long_term_goals').insert({
    child_id: input.childId,
    task_id: task.id,
    goal_type: 'habit',
    status: 'active',
    current_day: 0,
    total_days: input.totalDays,
    checkpoint_rewards: input.checkpointRewards,
    active_days: input.activeDays ?? null,
    motivation_note: input.motivationNote ?? null,
    started_at: today,
    interrupt_count: 0,
  });

  if (goalError) {
    await supabase.from('child_tasks').delete().eq('task_id', task.id);
    await supabase.from('tasks').delete().eq('id', task.id);
    throw new Error(goalError.message);
  }
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
