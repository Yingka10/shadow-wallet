import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from './supabase';
import { taipeiDayRange } from './taipeiDate';
import type {
  CheckpointRewards,
  CompletionStartMode,
  CreateFamilyGoalInput,
  OverrideType,
  PreferredTimeWindow,
  SkillMilestone,
  Task,
} from '../types/database';

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

  // 2. Find today's completion for this task + child.
  // Taipei-day UTC bounds — a bare date string would be read as UTC midnight and
  // miss a self-report the child made during Taipei 00:00–08:00.
  const { startIso, endIso } = taipeiDayRange();
  const nowIso   = dayjs().tz(TZ).toISOString();

  let existingCompletion: { id: string; coin_earned: number } | null = null;
  const { data: found } = await supabase
    .from('task_completions')
    .select('id, coin_earned')
    .eq('task_id', taskId)
    .eq('child_id', childId)
    .gte('completed_at', startIso)
    .lt('completed_at', endIso)
    .maybeSingle();

  if (found != null) {
    existingCompletion = found;
  } else {
    // No child self-report yet — create a parent-initiated completion
    const { data: created, error: insertError } = await supabase
      .from('task_completions')
      .insert({
        task_id:         taskId,
        child_id:        childId,
        completed_at:    nowIso,
        reported_at:     nowIso,
        reported_by:     'parent' as const,
        status:          markOption === 'none' ? 'flagged' : 'completed',
        coin_earned:     0,
        time_saved_min:  0,
        mentor_child_id: null,
      })
      .select('id, coin_earned')
      .single();

    if (insertError != null || created == null) throw new Error('建立完成紀錄失敗');
    existingCompletion = created;
  }

  const completionId  = existingCompletion.id;
  const originalCoin  = existingCompletion.coin_earned;

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

/**
 * Creates a parent-initiated task completion on behalf of the child.
 * Used when the parent marks a pending task as done directly from the home screen.
 * Writes task_completions (reported_by='parent') and credits the spending wallet.
 */
export async function parentCompleteTaskForChild(
  taskId: string,
  childId: string,
  coinAmount: number,
  timeSavedMin: number,
): Promise<void> {
  const safeAmount = Math.round(Math.max(0, coinAmount));
  const nowIso = dayjs().tz(TZ).toISOString();

  const { data: completion, error: insertError } = await supabase
    .from('task_completions')
    .insert({
      task_id:         taskId,
      child_id:        childId,
      completed_at:    nowIso,
      reported_at:     nowIso,
      reported_by:     'parent' as const,
      status:          'completed' as const,
      coin_earned:     safeAmount,
      time_saved_min:  timeSavedMin,
      mentor_child_id: null,
    })
    .select('id')
    .single();

  if (insertError != null || completion == null) throw new Error('標記完成失敗');

  if (safeAmount > 0) {
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id, balance')
      .eq('child_id', childId)
      .eq('wallet_type', 'spending')
      .single();

    if (walletError != null || wallet == null) throw new Error('找不到錢包');

    const { error: updateError } = await supabase
      .from('wallets')
      .update({ balance: wallet.balance + safeAmount })
      .eq('id', wallet.id);

    if (updateError != null) throw new Error(updateError.message);

    await supabase.from('transactions').insert({
      wallet_id:      wallet.id,
      amount:         safeAmount,
      type:           'earn' as const,
      reference_type: 'task_completion',
      reference_id:   completion.id,
      note:           null,
    });
  }
}

type CreateChildTaskInput = {
  familyId: string;
  childId: string;
  ageGroup: '2-4' | '4-6' | '6-9' | '9-12';
  name: string;
  category: 'B' | 'C';
  baseTimeMin: number;
  difficulty: number;
  dayType: 'once' | 'custom' | 'both';
  dueDate?: string | null;
  recurrenceDays?: number[] | null;
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
 * Records a task completion and applies all reward side-effects atomically
 * via the complete_task Postgres RPC.
 *
 * Atomicity guarantee: the duplicate guard, coin award, time_savings, and
 * habit milestone are all inside a single DB transaction. If any step fails,
 * the whole thing rolls back — so a retry always sees a clean state and the
 * duplicate guard will not falsely block it.
 *
 * @param taskId            The task being completed
 * @param childId           The child completing the task
 * @param completedDate     ISO date string (YYYY-MM-DD) in Asia/Taipei timezone
 * @param isPrerequisiteMet Whether all Task-A and Task-B tasks are done today
 * @param task              Full task row — kept in signature for call-site compat
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
  // Build a full Taipei-time timestamp so task_completions.completed_at shows
  // the real clock time rather than midnight UTC.
  const now = new Date();
  const taipeiHour = String((now.getUTCHours() + 8) % 24).padStart(2, '0');
  const taipeiMin = String(now.getUTCMinutes()).padStart(2, '0');
  const completedAt = `${completedDate}T${taipeiHour}:${taipeiMin}:00+08:00`;

  const { data, error } = await supabase.rpc('complete_task', {
    p_task_id:             taskId,
    p_child_id:            childId,
    p_completed_at:        completedAt,
    p_is_prerequisite_met: isPrerequisiteMet,
    p_goal_id:             goalId ?? null,
  });

  if (error) throw new Error(error.message);

  const result = data as {
    error?: string;
    completionId?: string;
    coinEarned?: number;
    timeSavedMin?: number;
    milestone?: { goalId: string; day: number; coinReward: number } | null;
  };

  if (result.error === 'already_completed') {
    throw new Error('今天已經完成過這個任務了');
  }

  return {
    completionId: result.completionId!,
    coinEarned:   result.coinEarned!,
    timeSavedMin: result.timeSavedMin!,
    milestone:    result.milestone ?? null,
  };
}

export async function recordCompletionContext(
  completionId: string,
  plannedTimeWindow: PreferredTimeWindow,
  startMode: CompletionStartMode | null,
): Promise<void> {
  const { error } = await supabase.rpc('record_completion_context', {
    p_completion_id: completionId,
    p_planned_time_window: plannedTimeWindow,
    p_start_mode: startMode,
  });

  if (error) throw new Error(error.message);
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
  const yesterdayDow = yesterday.day(); // 0=Sun, 1=Mon, ..., 6=Sat

  if (!isActiveDayForHabit(yesterdayDow, activeDays)) return;

  // Taipei-day UTC bounds for *yesterday* — bare date strings would read as UTC
  // midnight and mis-window the "missed yesterday" check around Taipei 00:00–08:00.
  const { startIso, endIso } = taipeiDayRange(yesterday);
  const { data: completions } = await supabase
    .from('task_completions')
    .select('id')
    .eq('task_id', taskId)
    .eq('child_id', childId)
    .gte('completed_at', startIso)
    .lt('completed_at', endIso)
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

// ── 長期任務管理（暫停 / 恢復 / 刪除）─────────────────────────────────────────

/** 暫停一個長期任務（status → 'paused'），孩子端不再顯示打卡，可隨時恢復。 */
export async function pauseLongTermGoal(goalId: string): Promise<void> {
  const { error } = await supabase
    .from('long_term_goals')
    .update({ status: 'paused' })
    .eq('id', goalId);
  if (error) throw new Error(error.message);
}

/** 恢復一個已暫停的長期任務（status → 'active'）。 */
export async function resumeLongTermGoal(goalId: string): Promise<void> {
  const { error } = await supabase
    .from('long_term_goals')
    .update({ status: 'active' })
    .eq('id', goalId);
  if (error) throw new Error(error.message);
}

/**
 * 刪除一個長期任務：移除 goal、child_tasks 連結，並停用底層 task。
 * 底層 task 採「停用」而非硬刪除，以保留既有 task_completions（金流/打卡紀錄）
 * 不被外鍵連帶刪除——符合信任制保留歷史的原則。
 */
export async function deleteLongTermGoal(goalId: string, taskId: string): Promise<void> {
  const { error: goalErr } = await supabase
    .from('long_term_goals')
    .delete()
    .eq('id', goalId);
  if (goalErr) throw new Error(goalErr.message);

  await supabase.from('child_tasks').delete().eq('task_id', taskId);
  await supabase.from('tasks').update({ is_active: false }).eq('id', taskId);
}

// ── 技能學習類（skill）長期任務 ───────────────────────────────────────────────

/** 單一里程碑幣值上限。*/
export const MAX_SKILL_MILESTONE_COIN = 50;

/** 將幣值夾在 1–MAX_SKILL_MILESTONE_COIN，並取整。*/
export function clampSkillCoin(v: number): number {
  return Math.max(1, Math.min(MAX_SKILL_MILESTONE_COIN, Math.round(v)));
}

/**
 * 依里程碑數量產生預設幣值（等差分佈 10 → 50）。
 * count 保證 ≥2（由 UI 最少 2 個里程碑約束）。
 * count=2 → [10,50]、count=3 → [10,30,50]、count=5 → [10,20,30,40,50]
 */
export function calcSkillDefaultCoins(count: number): number[] {
  if (count <= 1) return [MAX_SKILL_MILESTONE_COIN];
  return Array.from({ length: count }, (_, i) =>
    Math.round(10 + (40 / (count - 1)) * i),
  );
}

/** 里程碑幣值必須非遞減（coins[i+1] >= coins[i]）。*/
export function skillCoinsAreValid(coins: number[]): boolean {
  for (let i = 1; i < coins.length; i++) {
    if (coins[i] < coins[i - 1]) return false;
  }
  return true;
}

/** 產生 uuid v4。優先用平台 crypto，缺席時退回 Math.random 版本（RN/Hermes）。*/
function genMilestoneId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type CreateSkillGoalInput = {
  familyId: string;
  childId: string;
  name: string;
  milestones: Omit<SkillMilestone, 'id'>[];   // id 由函數內部產生
  targetMonths: number;
};

/**
 * 建立技能學習類長期任務。
 * 寫入 tasks（is_long_term=true, long_term_type='skill'）+ long_term_goals
 * （里程碑存於 level_definitions）。
 *
 * 不建立 child_tasks：技能類沒有每日打卡，里程碑完成 UI 延後到 P5b，
 * 現在綁進每日任務清單會讓它變成一個可被誤完成的 0 幣任務。
 *
 * 與習慣類差異：
 * - 幣值不存 coin_override（總幣值由 level_definitions 各階段算），避免汙染
 *   「本週可賺幣值」等統計（spec 前置確認項目 B）。
 * - current_day / total_days 對技能類只是參考時程，不代表進度。
 *
 * 兩步寫入無原生 transaction，採補償刪除：goal 寫入失敗則刪除已建 task，
 * 不留孤兒資料。
 */
export async function createSkillGoal(input: CreateSkillGoalInput): Promise<void> {
  const today = dayjs().tz(TZ).format('YYYY-MM-DD');

  const milestones: SkillMilestone[] = input.milestones.map((m) => ({
    id: genMilestoneId(),
    name: m.name.trim(),
    coin: clampSkillCoin(m.coin),
  }));

  // Step 1：建立 task
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert({
      family_id: input.familyId,
      name: input.name.trim(),
      category: 'D',
      day_type: 'both',
      is_long_term: true,
      long_term_type: 'skill',
      base_time_min: 0,
      difficulty: 1,
      coin_override: null,   // 技能類幣值由 level_definitions 管理，不存於此
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
    throw new Error(taskError?.message ?? '建立技能任務失敗');
  }

  // Step 2：建立 long_term_goal
  const { error: goalError } = await supabase.from('long_term_goals').insert({
    child_id: input.childId,
    task_id: task.id,
    goal_type: 'skill',
    status: 'active',
    current_day: 0,                          // 技能類不用，佔位
    total_days: input.targetMonths * 30,     // 參考時程，非進度
    checkpoint_rewards: null,                // 技能類不用
    level_definitions: milestones,
    current_level: 0,
    level_count: milestones.length,
    started_at: today,
    interrupt_count: 0,
  });

  if (goalError) {
    // 補償刪除：避免孤兒 task
    await supabase.from('tasks').delete().eq('id', task.id);
    throw new Error(goalError.message);
  }
}

/**
 * [P5b — NOT YET IMPLEMENTED]
 *
 * Marks a skill milestone as completed and awards its coins.
 *
 * ATOMICITY REQUIREMENT (implement as a Postgres RPC, not multi-step JS):
 *   These three writes must be atomic — all succeed or all roll back:
 *     1. UPDATE long_term_goals SET current_level = current_level + 1
 *     2. INSERT transactions (coin award)
 *     3. UPDATE wallets SET balance = balance + milestone.coin
 *   Without atomicity, a partial failure lets the child replay the same
 *   milestone and collect the coins a second time.
 *
 *   Recommended RPC signature:
 *     complete_skill_milestone(p_goal_id uuid, p_child_id uuid, p_level_index int)
 *     → jsonb { ok, newLevel, coinEarned }
 *
 *   Also verify the duplicate guard: if the RPC fails mid-way, current_level
 *   must be rolled back so a retry is not blocked by the guard.
 */
export async function completeSkillMilestone(
  _goalId: string,
  _childId: string,
  _levelIndex: number,
): Promise<never> {
  throw new Error('completeSkillMilestone not yet implemented (P5b)');
}

// ── 家庭責任類（family）長期任務 ─────────────────────────────────────────────

/** 每次完成時間存摺的最小/最大分鐘數限制。 */
export const MIN_FAMILY_TIME = 5;
export const MAX_FAMILY_TIME = 120;

/**
 * 建立家庭責任類長期任務。
 * 依序寫入 tasks（category='B', is_long_term=true）→ child_tasks → long_term_goals。
 * 任何步驟失敗都補償刪除已建資料，不留孤兒 row。
 *
 * 進度模型：
 * - total_days = commitWeeks × 7（日曆天，決定承諾期何時期滿）
 * - target_completions = activeDays.length × commitWeeks（應完成次數，達成率分母）
 * - current_day = 實際完成次數（由 completeTask 的 Task-B 路徑自動遞增，非日曆天）
 *
 * 時間存摺：task.time_saving_min > 0，completeTask 的 Task-B 路徑自動處理 time_savings 記錄。
 */
export async function createFamilyGoal(input: CreateFamilyGoalInput): Promise<void> {
  const today = dayjs().tz(TZ).format('YYYY-MM-DD');
  const timeMin = Math.max(MIN_FAMILY_TIME, Math.min(MAX_FAMILY_TIME, Math.round(input.timeMin)));
  const totalDays = input.commitWeeks * 7;
  const targetCompletions = input.activeDays.length * input.commitWeeks;

  // Step 1：建立 task（Task-B，時間存摺）
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert({
      family_id: input.familyId,
      name: input.name.trim(),
      category: 'B',
      day_type: 'custom',
      recurrence_days: [...input.activeDays].sort((a, b) => a - b),
      is_long_term: true,
      long_term_type: 'family',
      base_time_min: timeMin,
      difficulty: 1,
      coin_override: null,
      time_saving_min: timeMin,
      is_system_default: false,
      allow_repeat: false,
      min_age: 0,
      max_age: 99,
      is_active: true,
    })
    .select('id')
    .single();

  if (taskError || !task) {
    throw new Error(taskError?.message ?? '建立家庭責任任務失敗');
  }

  // Step 2：綁定 child_tasks（使家庭責任出現在孩子每日任務清單）
  const { error: childTaskError } = await supabase.from('child_tasks').insert({
    child_id: input.childId,
    task_id: task.id,
    is_active: true,
  });

  if (childTaskError) {
    await supabase.from('tasks').delete().eq('id', task.id);
    throw new Error(childTaskError.message);
  }

  // Step 3：建立 long_term_goal
  const { error: goalError } = await supabase.from('long_term_goals').insert({
    child_id: input.childId,
    task_id: task.id,
    goal_type: 'family',
    status: 'active',
    current_day: 0,
    total_days: totalDays,
    target_completions: targetCompletions,
    active_days: input.activeDays,
    family_time_per_completion: timeMin,
    checkpoint_rewards: null,
    motivation_note: null,
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
        day_type: input.dayType,
        due_date: input.dueDate ?? null,
        recurrence_days: input.recurrenceDays ?? null,
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
