import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type {
  LongTermGoal,
  PreferredTimeWindow,
  Task,
  TaskCompletion,
} from '../../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';
const ALL_WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS: Record<number, string> = {
  0: '日',
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六',
};

export type GoalCompletionRecord = Pick<
  TaskCompletion,
  'id' | 'completed_at' | 'planned_time_window' | 'start_mode'
>;

export type GoalDayState =
  | 'completed'
  | 'today'
  | 'upcoming'
  | 'missed'
  | 'unscheduled';

export type GoalDayStatus = {
  day: number;
  label: string;
  isoDate: string;
  isScheduled: boolean;
  state: GoalDayState;
};

/**
 * `status` 分成兩組，不要混用：
 *
 *   - 階段型（staged_skill）：completed / in_progress / next_stage / upcoming。
 *     **正在進行的那一階段是 `in_progress`，不是 `next`。** 兩者曾經共用
 *     `next`，於是 Hero 說「目前階段：雙手合奏」、Progress 卻說
 *     「下一個里程碑：雙手合奏」，同一個階段被講成兩件事。
 *   - 累積型 / 節點型：completed / next / upcoming / planned。這裡的 `next`
 *     指的是真正還沒開始的下一個節點，語意沒有問題。
 */
export type GoalMilestone = {
  id: string;
  title: string;
  detail: string | null;
  status: 'completed' | 'in_progress' | 'next_stage' | 'next' | 'upcoming' | 'planned';
};

export type GoalRecentRecord = {
  id: string;
  dateLabel: string;
  detail: string;
  timeWindowLabel: string | null;
};

export type GoalKind =
  | 'habit'
  | 'skill'
  | 'challenge'
  | 'family';

export type GoalProgressionType =
  | 'weekly_rhythm'
  | 'fixed_days'
  | 'staged_skill'
  | 'accumulation'
  | 'challenge';

export type GoalPlanState =
  | 'active'
  | 'upcoming'
  | 'paused'
  | 'completed'
  | 'expired'
  | 'unplanned';

export type GoalPresentation = {
  headerTitle: string;
  weekLabel: string;
  planWeekLabel: string;
  weekProgressLabel: string;
  weekCompleted: number;
  weekTarget: number;
  totalWeeks: number;
  goalKind: GoalKind;
  progression: GoalProgressionType | null;
  planState: GoalPlanState;
  categoryLabel: string;
  overallLabel: string;
  overallPercent: number;
  focusText: string;
  nextText: string;
  planNotice?: string | null;
  todayTitle: string;
  todayAction: string;
  todayStatusText?: string | null;
  preferredTimeWindow: PreferredTimeWindow | null;
  supportsPreferredTimeWindow: boolean;
  canCompleteToday: boolean;
  weekDays: GoalDayStatus[];
  weekSummary: string;
  nextReward: { threshold: number; coin: number } | null;
  milestones: GoalMilestone[];
  recentRecords: GoalRecentRecord[];
  planPeriodLabel: string;
  completionConditionLabel: string;
  adjustableItemsLabel: string;
  finalRewardText: string;
  reviewTitle: string;
  reviewPrompt: string;
};

export type GoalPresentationCapabilities = {
  sharedPlanSupportsPreferredTimeWindow?: boolean;
};

type StructuredPresentationTask = Task & {
  progress_model?: string | null;
  next_step?: string | null;
  supports_preferred_time_window?: boolean | null;
};

type StructuredPresentationGoal = LongTermGoal & {
  progress_model?: string | null;
  supports_preferred_time_window?: boolean | null;
};

function weekStart(now: Dayjs): Dayjs {
  const taipeiNow = now.tz(TZ);
  return taipeiNow.startOf('day').subtract((taipeiNow.day() + 6) % 7, 'day');
}

function validRhythmCompletions(
  completions: GoalCompletionRecord[],
  activeDays: number[],
  acceptsAnyPlanDay: boolean,
  planStart: Dayjs | null,
  planEnd: Dayjs | null,
): GoalCompletionRecord[] {
  const completionsByDate = new Map<string, GoalCompletionRecord>();

  for (const completion of completions) {
    const completedAt = dayjs(completion.completed_at).tz(TZ);
    if (!completedAt.isValid()) continue;

    const completionDate = completedAt.startOf('day');
    if (
      (!acceptsAnyPlanDay && !activeDays.includes(completedAt.day()))
      || (planStart !== null && completionDate.isBefore(planStart, 'day'))
      || (planEnd !== null && completionDate.isAfter(planEnd, 'day'))
    ) {
      continue;
    }

    const isoDate = completedAt.format('YYYY-MM-DD');
    if (!completionsByDate.has(isoDate)) {
      completionsByDate.set(isoDate, completion);
    }
  }

  return Array.from(completionsByDate.values());
}

function getWeeklyFrequency(task: Task): number | null {
  const frequency = Number(task.weekly_frequency);
  return task.schedule_mode === 'weekly_frequency'
    && Number.isInteger(frequency)
    && frequency >= 1
    && frequency <= 7
    ? frequency
    : null;
}

function getProgressModel(task: Task, goal: LongTermGoal): string | null {
  const taskModel = (task as StructuredPresentationTask).progress_model;
  const goalModel = (goal as StructuredPresentationGoal).progress_model;
  return goalModel?.trim() || taskModel?.trim() || null;
}

function getProgression(
  task: Task,
  goal: LongTermGoal,
  activeDays: number[],
): GoalProgressionType | null {
  if (goal.goal_type === 'skill') return 'staged_skill';
  if (goal.goal_type === 'challenge') {
    return Number.isFinite(goal.current_value) && Number.isFinite(goal.target_value)
      && Number(goal.target_value) > 0
      ? 'accumulation'
      : 'challenge';
  }

  if (
    getProgressModel(task, goal) === 'weekly_rhythm'
    || task.schedule_mode === 'weekly_frequency'
  ) {
    return 'weekly_rhythm';
  }

  return activeDays.length > 0 ? 'fixed_days' : null;
}

function getCategoryLabel(task: Task, goalKind: GoalKind): string {
  const labels: Record<string, string> = {
    A: '生活習慣',
    B: '家庭參與',
    C: '自主挑戰',
    D: '學習與技能',
  };
  const category = String(task.category ?? '').trim();
  if (labels[category]) return labels[category];

  return goalKind === 'family'
    ? labels.B
    : goalKind === 'challenge'
      ? labels.C
      : goalKind === 'skill'
        ? labels.D
        : labels.A;
}

function isPreferredTimeWindow(value: unknown): value is PreferredTimeWindow {
  return value === 'after_dinner' || value === 'before_bed';
}

function getStructuredNextStep(task: Task): string | null {
  const taskNextStep = (task as StructuredPresentationTask).next_step?.trim();
  return taskNextStep || task.completion_description?.trim() || null;
}

function buildFlexibleWeekSummary(
  completed: number,
  target: number,
): string {
  const activity = '完成';
  const remaining = Math.max(target - completed, 0);

  if (remaining === 0) {
    return `這週已${activity} ${completed} 次，這週的節奏完成了。`;
  }
  if (completed === 0) {
    return `這週還差 ${remaining} 次，今天繼續就好。`;
  }
  return `這週已${activity} ${completed} 次，這週還差 ${remaining} 次，今天繼續就好。`;
}

function completionsThisWeek(
  completions: GoalCompletionRecord[],
  now: Dayjs,
): GoalCompletionRecord[] {
  const start = weekStart(now);
  const end = start.add(7, 'day');

  return completions.filter((completion) => {
    const completedAt = dayjs(completion.completed_at).tz(TZ);
    return !completedAt.isBefore(start) && completedAt.isBefore(end);
  });
}

function buildWeekDays(
  activeDays: number[],
  completions: GoalCompletionRecord[],
  now: Dayjs,
  planStart: Dayjs | null,
  planEnd: Dayjs | null,
): GoalDayStatus[] {
  const start = weekStart(now);
  const today = now.tz(TZ).startOf('day');

  return ALL_WEEK_DAYS.map((day) => {
    const offset = day === 0 ? 6 : day - 1;
    const date = start.add(offset, 'day');
    const isInsidePlan =
      (planStart === null || !date.isBefore(planStart, 'day'))
      && (planEnd === null || !date.isAfter(planEnd, 'day'));
    const isScheduled = isInsidePlan && activeDays.includes(day);
    const completion = completions.find((item) =>
      dayjs(item.completed_at).tz(TZ).isSame(date, 'day'),
    );

    let state: GoalDayStatus['state'];
    if (!isScheduled) {
      state = 'unscheduled';
    } else if (completion) {
      state = 'completed';
    } else if (date.isSame(today, 'day')) {
      state = 'today';
    } else if (date.isAfter(today, 'day')) {
      state = 'upcoming';
    } else {
      state = 'missed';
    }

    return {
      day,
      label: DAY_LABELS[day],
      isoDate: date.format('YYYY-MM-DD'),
      isScheduled,
      state,
    };
  });
}

function getActiveDays(
  task: Task,
  goal: LongTermGoal,
  isSkill: boolean,
  isChallenge: boolean,
): number[] {
  if (isSkill || isChallenge) return [];

  const configuredDays =
    goal.active_days
    ?? task.recurrence_days
    ?? [];

  return Array.from(
    new Set(configuredDays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)),
  );
}

function parseTaipeiDate(value: string): Dayjs {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? dayjs.tz(value, TZ)
    : dayjs(value).tz(TZ);
}

function getValidStartDate(startedAt: string): Dayjs | null {
  const start = parseTaipeiDate(startedAt).startOf('day');
  return start.isValid() ? start : null;
}

function getPlanStart(goal: LongTermGoal, task: Task, now: Dayjs): Dayjs {
  return getValidStartDate(goal.started_at)
    ?? getValidStartDate(goal.created_at)
    ?? getValidStartDate(task.created_at)
    ?? now.tz(TZ).startOf('day');
}

function getValidDueDate(start: Dayjs, dueDate: string): Dayjs | null {
  const end = parseTaipeiDate(dueDate).startOf('day');
  if (!end.isValid() || end.isBefore(start, 'day')) {
    return null;
  }

  return end;
}

function getCoveredWeeks(start: Dayjs, end: Dayjs): number {
  const coveredDays = end.diff(start, 'day') + 1;
  return Math.max(Math.ceil(coveredDays / 7), 1);
}

function getCurrentPlanWeek(start: Dayjs, now: Dayjs, totalWeeks: number): number {
  const elapsedDays = Math.max(now.tz(TZ).startOf('day').diff(start, 'day'), 0);
  return Math.min(Math.floor(elapsedDays / 7) + 1, totalWeeks);
}

function countScheduledDates(
  start: Dayjs,
  end: Dayjs,
  activeDays: number[],
): number {
  let count = 0;
  for (let date = start; !date.isAfter(end, 'day'); date = date.add(1, 'day')) {
    if (activeDays.includes(date.day())) count += 1;
  }
  return count;
}

function getNextCheckpoint(
  goal: LongTermGoal,
  current: number,
): { threshold: number; coin: number } | null {
  if (!goal.checkpoint_rewards) return null;

  const threshold = Object.keys(goal.checkpoint_rewards)
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > current)
    .sort((a, b) => a - b)[0];

  if (threshold === undefined) return null;
  return {
    threshold,
    coin: Number(goal.checkpoint_rewards[String(threshold)] ?? 0),
  };
}

function getNextSkillReward(
  goal: LongTermGoal,
  current: number,
): { threshold: number; coin: number } | null {
  const nextLevel = goal.level_definitions?.[current];
  const coin = Number(nextLevel?.coin);
  if (!nextLevel || !Number.isFinite(coin)) return null;

  return {
    threshold: current + 1,
    coin,
  };
}

/**
 * 正在練習的那一階段的名稱。
 *
 * `current_level` 是**已完成的階段數**（建立時寫 0，每完成一階段 +1），所以
 * 正在進行的階段就是 `level_definitions[current_level]`。這裡不對
 * `current_level` 做任何 ±1 的語意搬移，只是把索引換成名字。
 */
function getCurrentSkillStage(goal: LongTermGoal): string {
  const levels = goal.level_definitions ?? [];
  const index = Math.min(
    Math.max(goal.current_level ?? 0, 0),
    Math.max(levels.length - 1, 0),
  );
  return String(levels[index]?.name ?? `第 ${index + 1} 階段`);
}

function buildRhythmMilestones(
  goal: LongTermGoal,
): GoalMilestone[] {
  const checkpoints = Object.entries(goal.checkpoint_rewards ?? {})
    .map(([threshold, coin]) => ({
      threshold: Number(threshold),
      coin: Number(coin),
    }))
    .filter(({ threshold }) => Number.isFinite(threshold) && threshold >= 1)
    .sort((left, right) => left.threshold - right.threshold);
  const milestones: GoalMilestone[] = checkpoints.map((checkpoint) => ({
    id: `checkpoint-${checkpoint.threshold}`,
    title: `第 ${checkpoint.threshold} 次的計畫節點`,
    detail: checkpoint.coin > 0
      ? `成長幣 +${checkpoint.coin}（達成時一起確認）`
      : null,
    status: 'planned',
  }));
  return milestones;
}

/**
 * 階段時間軸。
 *
 * `current` 是已完成的階段數，所以：
 *   - 第 1..current 階段 → 已完成
 *   - 第 current + 1 階段 → **進行中**（不是「下一個」，孩子現在就在練這個）
 *   - 第 current + 2 階段 → 下一階段
 *   - 再往後 → 尚未到
 *
 * `isFinished`（計畫已結束）時整條時間軸都不得有「進行中」——家長提早收尾時
 * 未完成的階段就是沒完成，不補成完成、也不假裝還在進行。
 */
function buildSkillMilestones(
  goal: LongTermGoal,
  current: number,
  target: number,
  isFinished: boolean,
): GoalMilestone[] {
  const levels = goal.level_definitions ?? [];
  const milestones = Array.from({ length: target }, (_, index): GoalMilestone => {
    const levelNumber = index + 1;
    const level = levels[index];
    const coin = Number(level?.coin);

    return {
      id: `skill-level-${levelNumber}`,
      title: String(level?.name ?? `第 ${levelNumber} 階段`),
      detail: Number.isFinite(coin) && coin > 0 ? `成長幣 +${coin}` : null,
      status: levelNumber <= current
        ? 'completed'
        : isFinished
          ? 'upcoming'
          : levelNumber === current + 1
            ? 'in_progress'
            : levelNumber === current + 2
              ? 'next_stage'
              : 'upcoming',
    };
  });

  /*
    這裡**不**補一筆合成的「完成計畫後一起回顧」。Progress 只放真實存在的
    結構化節點（level_definitions 的階段），回顧那件事屬於 Together Review，
    由 finalRewardText 負責。合成節點會讓孩子以為計畫裡真的排了這一站。
  */
  return milestones;
}

/*
  累積型計畫的 Progress 只放**已經存在**的 checkpoint_rewards。

  刻意不合成兩種節點：
    - 「已累積 X」—— current/target 本來就由 Progress 自己畫出來，
      再排成一個里程碑等於把同一個數字講兩次。
    - 「達到 Y」＋回顧文案 —— 那是期滿回顧，屬於 Together Review。

  沒有設 checkpoint_rewards 的計畫就沒有時間軸，這是誠實的：家長真的沒有
  在計畫裡排任何節點。
*/
function buildChallengeMilestones(
  goal: LongTermGoal,
  current: number,
  unit: string,
): GoalMilestone[] {
  const unitSuffix = unit ? ` ${unit}` : '';
  const checkpoints = Object.entries(goal.checkpoint_rewards ?? {})
    .map(([threshold, coin]) => ({
      threshold: Number(threshold),
      coin: Number(coin),
    }))
    .filter(({ threshold }) => Number.isFinite(threshold) && threshold > 0)
    .sort((left, right) => left.threshold - right.threshold);
  const nextCheckpoint = checkpoints.find(({ threshold }) => threshold > current)?.threshold;

  return checkpoints.map((checkpoint): GoalMilestone => ({
    id: `checkpoint-${checkpoint.threshold}`,
    title: `累積 ${checkpoint.threshold}${unitSuffix}`,
    detail: checkpoint.coin > 0 ? `成長幣 +${checkpoint.coin}` : null,
    status: checkpoint.threshold <= current
      ? 'completed'
      : checkpoint.threshold === nextCheckpoint
        ? 'next'
        : 'upcoming',
  }));
}

function buildRecentRecords(
  task: Task,
  completions: GoalCompletionRecord[],
): GoalRecentRecord[] {
  const timeWindowLabels: Record<PreferredTimeWindow, string> = {
    after_dinner: '晚餐後',
    before_bed: '睡前',
  };

  return [...completions]
    .sort(
      (left, right) =>
        dayjs(right.completed_at).valueOf() - dayjs(left.completed_at).valueOf(),
    )
    .slice(0, 3)
    .map((completion) => ({
      id: completion.id,
      dateLabel: dayjs(completion.completed_at).tz(TZ).format('YYYY/MM/DD'),
      detail: `${task.base_time_min} 分鐘`,
      timeWindowLabel: completion.planned_time_window
        ? timeWindowLabels[completion.planned_time_window]
        : null,
    }));
}

function buildPlanPeriodLabel(
  goal: LongTermGoal,
  start: Dayjs,
  dueDate: Dayjs | null,
  totalWeeks: number,
  usesExactTotalDays: boolean,
): string {
  if (totalWeeks === 0 && dueDate === null) {
    return `${start.format('YYYY-MM-DD')} ～ 尚未安排執行日期`;
  }

  const exactTotalDays = usesExactTotalDays ? Math.max(goal.total_days ?? 0, 0) : 0;
  const calculatedEnd = exactTotalDays > 0
    ? start.add(exactTotalDays - 1, 'day')
    : start.add(totalWeeks, 'week').subtract(1, 'day');
  const end = dueDate ?? calculatedEnd;

  return `${start.format('YYYY-MM-DD')} ～ ${end.format('YYYY-MM-DD')}（共 ${totalWeeks} 週）`;
}

export function buildGoalPresentation(
  task: Task,
  goal: LongTermGoal,
  completions: GoalCompletionRecord[],
  now = dayjs().tz(TZ),
  capabilities: GoalPresentationCapabilities = {},
): GoalPresentation {
  const isSkill = goal.goal_type === 'skill';
  // DB 的值是 'responsibility'；孩子端對外仍叫「家庭」（見 goalKind）。
  const isFamily = goal.goal_type === 'responsibility';
  const isChallenge = goal.goal_type === 'challenge';
  const isRhythmGoal = !isSkill && !isChallenge && !isFamily;
  const goalKind: GoalKind = isSkill
    ? 'skill'
    : isFamily
      ? 'family'
      : isChallenge
        ? 'challenge'
        : 'habit';
  const hasChallengeValues =
    isChallenge
    && Number.isFinite(goal.current_value)
    && Number.isFinite(goal.target_value)
    && Number(goal.target_value) > 0;
  const challengeUnit = hasChallengeValues ? goal.value_unit?.trim() ?? '' : '';
  const weeklyFrequency = getWeeklyFrequency(task);
  const isFlexibleWeeklyRhythm =
    weeklyFrequency !== null
    && !isSkill
    && !isChallenge;
  const activeDays = getActiveDays(task, goal, isSkill, isChallenge);
  const progression = getProgression(task, goal, activeDays);
  const progressModel = getProgressModel(task, goal);
  const planStart = getPlanStart(goal, task, now);
  const dueDateEnd = task.due_date
    ? getValidDueDate(planStart, task.due_date)
    : null;
  const goalEnd = goal.end_date
    ? getValidDueDate(planStart, goal.end_date)
    : null;
  const challengeEnd =
    isChallenge && goal.total_days && goal.total_days > 0
      ? planStart.add(goal.total_days - 1, 'day')
      : null;
  const planEnd = goalEnd ?? dueDateEnd ?? challengeEnd;
  const hasExplicitRhythmPeriod =
    progression === 'weekly_rhythm'
    && progressModel === 'weekly_rhythm'
    && weeklyFrequency !== null
    && getValidStartDate(goal.started_at) !== null
    && (goalEnd !== null || dueDateEnd !== null);
  const rhythmCompletions = validRhythmCompletions(
    completions,
    activeDays,
    isFlexibleWeeklyRhythm,
    planStart,
    planEnd,
  );
  const weeklyCompletions = completionsThisWeek(rhythmCompletions, now);
  const weekDays = isFlexibleWeeklyRhythm
    ? []
    : buildWeekDays(
        activeDays,
        rhythmCompletions,
        now,
        planStart,
        planEnd,
      );
  const completionCurrent = isSkill || isChallenge
    ? completions.length
    : rhythmCompletions.length;
  const current = isSkill
    ? Math.max(goal.current_level ?? 0, 0)
    : hasChallengeValues
      ? Math.max(Number(goal.current_value), 0)
      : completionCurrent;
  const completionTarget = isFamily
    ? Math.max(goal.target_completions ?? goal.total_days ?? 1, 1)
    : Math.max(goal.total_days ?? 1, 1);
  const target = isSkill
    ? Math.max(goal.level_count ?? goal.level_definitions?.length ?? 1, 1)
    : hasChallengeValues
      ? Math.max(Number(goal.target_value), 1)
      : completionTarget;
  const weekTarget = isFlexibleWeeklyRhythm
    ? weeklyFrequency ?? 0
    : weekDays.filter((day) => day.isScheduled).length;
  const weekCompleted = isFlexibleWeeklyRhythm
    ? Math.min(weeklyCompletions.length, weekTarget)
    : weeklyCompletions.length;
  const completionWeekSize = isFlexibleWeeklyRhythm
    ? weeklyFrequency ?? 1
    : Math.max(activeDays.length, 1);
  const hasUnplannedCycle =
    planEnd === null
    && activeDays.length === 0
    && !isFlexibleWeeklyRhythm
    && (goal.goal_type === 'habit' || goal.goal_type === 'responsibility');
  const fallbackTotalWeeks = (isSkill || isChallenge) && goal.total_days
    ? Math.max(Math.ceil(goal.total_days / 7), 1)
    : hasUnplannedCycle
      ? 0
      : activeDays.length === 0
      ? 1
      : Math.max(Math.ceil(completionTarget / completionWeekSize), 1);
  const dueDateWeeks = planEnd ? getCoveredWeeks(planStart, planEnd) : null;
  const totalWeeks = dueDateWeeks ?? fallbackTotalWeeks;
  const currentWeek = getCurrentPlanWeek(planStart, now, totalWeeks);
  const overallPercent = Math.max(
    Math.min(Math.round((current / target) * 100), 100),
    0,
  );
  const today = now.tz(TZ).startOf('day');
  const todayIsInsidePlan =
    !today.isBefore(planStart, 'day')
    && (planEnd === null || !today.isAfter(planEnd, 'day'));
  const todayIsActive =
    todayIsInsidePlan
    && (isFlexibleWeeklyRhythm || activeDays.includes(today.day()));
  const currentStage = getCurrentSkillStage(goal);
  // 正在第幾階段 = 已完成幾階段 + 1。這是**呈現層**的換算，DB 的
  // current_level 語意（已完成數）一個字都沒動。
  const currentStageNumber = Math.min(current + 1, target);
  const stagedSkillIsFinished =
    isSkill && (goal.status === 'completed' || current >= target);
  const nextReward = isSkill
    ? getNextSkillReward(goal, current)
    : isChallenge
      ? getNextCheckpoint(goal, current)
      : null;
  const hasReachedTarget = !hasExplicitRhythmPeriod && current >= target;
  const isFuture = today.isBefore(planStart, 'day');
  const isExpired = planEnd !== null && today.isAfter(planEnd, 'day');
  const hasEmptyDailySchedule =
    activeDays.length === 0
    && !isFlexibleWeeklyRhythm
    && (goal.goal_type === 'habit' || goal.goal_type === 'responsibility');
  const planState: GoalPlanState =
    goal.status === 'paused'
      ? 'paused'
      : goal.status === 'completed' || hasReachedTarget
        ? 'completed'
        : isFuture
          ? 'upcoming'
          : isExpired
            ? 'expired'
            : hasEmptyDailySchedule
              ? 'unplanned'
              : 'active';
  const canCompleteToday =
    planState === 'active'
    && (goal.goal_type === 'habit' || goal.goal_type === 'responsibility')
    && todayIsActive;
  let todayTitle = '今天的小步驟';
  let todayStatusText: string | null = null;

  if (planState === 'paused') {
    todayTitle = '計畫暫停中';
    todayStatusText = '這個計畫暫停中';
  } else if (planState === 'completed') {
    todayTitle = '這段計畫已完成';
    todayStatusText = '這段計畫已完成';
  } else if (planState === 'upcoming') {
    todayTitle = '計畫還沒開始';
    todayStatusText = '計畫還沒開始';
  } else if (planState === 'expired') {
    todayTitle = '一起回顧這段計畫';
    todayStatusText = '一起回顧這段計畫';
  } else if (planState === 'unplanned') {
    todayTitle = '尚未安排日期';
    todayStatusText = '這個計畫尚未安排日期';
  } else if (isSkill) {
    todayTitle = '目前階段';
    todayStatusText = '這個階段由家長確認完成';
  } else if (isChallenge) {
    todayTitle = '目前的累積進度';
    todayStatusText = '累積進度由家長一起確認';
  } else if (!todayIsActive) {
    todayTitle = '今天不用記錄';
    todayStatusText = '今天不用記錄，照自己的節奏休息';
  }
  const progressionAction = isRhythmGoal && task.base_time_min > 0
    ? `安排 ${task.base_time_min} 分鐘完成這一步`
    : isSkill
      ? `這一階段先練習：${currentStage}`
      : isChallenge
        ? hasChallengeValues
          ? `已累積 ${current}${challengeUnit ? ` ${challengeUnit}` : ''}，由家長確認後更新`
          : '這項累積進度由家長確認後更新'
        : null;
  const scheduledCapacity =
    planEnd !== null && (goal.goal_type === 'habit' || goal.goal_type === 'responsibility')
      ? isFlexibleWeeklyRhythm
        ? getCoveredWeeks(planStart, planEnd) * weekTarget
        : countScheduledDates(planStart, planEnd, activeDays)
      : null;
  const planNotice =
    (planState === 'active' || planState === 'unplanned')
    && !hasExplicitRhythmPeriod
    && scheduledCapacity !== null
    && scheduledCapacity < target
      ? `目前期間最多安排 ${scheduledCapacity} 次，和 ${target} 次目標不一致，可以和家人一起調整。`
      : null;
  const planWeekLabel = isSkill
    ? `第 ${currentStageNumber} 階段 · 共 ${target} 階段`
    : hasUnplannedCycle
      ? '尚未安排週期'
      : `第 ${currentWeek} 週／共 ${totalWeeks} 週`;
  const completionConditionLabel = hasExplicitRhythmPeriod
    ? `${totalWeeks} 週計畫 · 每週 ${weeklyFrequency} 次`
    : isSkill
    ? `完成 ${target} 個階段`
    : hasChallengeValues
      ? `累積 ${target}${challengeUnit ? ` ${challengeUnit}` : ''}`
      : `完成 ${target} 次`;
  const adjustableItemsLabel = isRhythmGoal
    ? '執行時段、每週次數與做法'
    : isSkill
      ? '練習時段、每週次數、階段內容'
      : isFamily
        ? '參與時段、每週次數、任務內容'
        : '執行時段、每週次數、任務內容';
  const milestones = isSkill
    ? buildSkillMilestones(goal, current, target, stagedSkillIsFinished)
    : hasChallengeValues
      ? buildChallengeMilestones(goal, current, challengeUnit)
      : buildRhythmMilestones(goal);
  const preferredTimeWindow = isPreferredTimeWindow(goal.preferred_time_window)
    ? goal.preferred_time_window
    : isPreferredTimeWindow(task.preferred_time)
      ? task.preferred_time
      : null;
  const supportsPreferredTimeWindow =
    preferredTimeWindow !== null
    || (goal as StructuredPresentationGoal).supports_preferred_time_window === true
    || (task as StructuredPresentationTask).supports_preferred_time_window === true
    || capabilities.sharedPlanSupportsPreferredTimeWindow === true;

  return {
    headerTitle: task.name,
    weekLabel: hasUnplannedCycle
      ? '尚未安排週期'
      : isRhythmGoal
      ? `第 ${currentWeek} 週`
      : isSkill
        ? `第 ${currentStageNumber} 階段`
        : '成長旅程',
    planWeekLabel,
    weekProgressLabel: isSkill
      ? '依自己的節奏練習'
      : isChallenge
        ? '累積進度由家長確認'
        : weekTarget === 0
          ? '本週尚未安排日期'
          : `本週完成 ${weekCompleted}／${weekTarget} 次`,
    weekCompleted,
    weekTarget,
    totalWeeks,
    goalKind,
    progression,
    planState,
    categoryLabel: getCategoryLabel(task, goalKind),
    overallLabel: hasExplicitRhythmPeriod
      ? planWeekLabel
      : isSkill
      // Hero 講「正在第幾階段」，Progress 講「已完成幾階段」。加上「已完成」
      // 三個字，兩個數字才不會被讀成同一件事的兩種說法。
      ? `已完成 ${current} / ${target} 階段`
      : hasChallengeValues
        ? `${current} / ${target}${challengeUnit ? ` ${challengeUnit}` : ''}`
        : `${current} / ${target} 次`,
    overallPercent: hasExplicitRhythmPeriod && totalWeeks > 0
      ? Math.round((currentWeek / totalWeeks) * 100)
      : overallPercent,
    focusText: hasUnplannedCycle
      ? '先和家人一起安排適合的執行日期'
      : isRhythmGoal
      ? currentWeek === 1
        ? '第 1 週：找到適合自己的執行節奏'
        : `第 ${currentWeek} 週：繼續找到適合自己的執行節奏`
      : isSkill
        ? stagedSkillIsFinished
          ? '這段練習已經告一段落'
          : `目前練習：${currentStage}`
        : hasChallengeValues
          ? `目前已累積 ${current}${challengeUnit ? ` ${challengeUnit}` : ''}`
          : isFamily
            ? '每一次參與，都讓家裡的節奏更穩一點'
            : '先找到適合自己的生活節奏',
    nextText: progression === 'weekly_rhythm'
      ? todayIsActive
        ? '今天繼續就好，已完成的努力都會保留'
        : '下一次繼續就好，已完成的努力都會保留'
      // 階段型不講「下一個里程碑」：那個名字指的是孩子**現在**正在練的階段。
      : isSkill
        ? stagedSkillIsFinished
          ? '可以和家人一起回顧這段練習'
          : `現在正在：${currentStage}`
        : nextReward
          ? hasChallengeValues
            ? `下一個里程碑：累積 ${nextReward.threshold}${challengeUnit ? ` ${challengeUnit}` : ''}`
            : `下一個里程碑：完成第 ${nextReward.threshold} 次`
          : `下一次繼續完成「${task.name}」就好`,
    planNotice,
    todayTitle,
    todayAction: getStructuredNextStep(task) ?? progressionAction ?? task.name,
    todayStatusText,
    preferredTimeWindow,
    supportsPreferredTimeWindow,
    canCompleteToday,
    weekDays,
    weekSummary: isFlexibleWeeklyRhythm
      ? buildFlexibleWeekSummary(weekCompleted, weekTarget)
      : isRhythmGoal
      ? `這週已完成 ${weeklyCompletions.length} 次。少一天沒有關係，找到適合自己的節奏更重要。`
      : isSkill
        ? '這週可以依自己的節奏，繼續目前的練習階段。'
        : isChallenge
          ? '累積進度會在家長確認後更新。'
          : `這週已完成 ${weeklyCompletions.length} 次。`,
    nextReward,
    milestones,
    recentRecords: buildRecentRecords(task, completions),
    planPeriodLabel: buildPlanPeriodLabel(
      goal,
      planStart,
      planEnd,
      totalWeeks,
      isSkill || isChallenge,
    ),
    completionConditionLabel,
    adjustableItemsLabel,
    finalRewardText: hasUnplannedCycle
      ? '安排好週期後，再一起回顧這段計畫'
      : isRhythmGoal
        ? `第 ${totalWeeks} 週結束後一起回顧，可以繼續、調整做法，或讓計畫先告一段落`
        : isSkill
          ? '完成最後階段後，一起留下這段學習成果'
          : '完成旅程後，一起選一個值得記住的時刻',
    reviewTitle: isRhythmGoal ? '週末一起回顧' : '一起回顧這段成長',
    reviewPrompt: isRhythmGoal
      ? '這週哪一點最順？下週想怎麼調整？'
      : isSkill
        ? '哪一段練習最有感？下一步想怎麼調整？'
        : '這段時間哪裡最順？下一步想怎麼調整？',
  };
}
