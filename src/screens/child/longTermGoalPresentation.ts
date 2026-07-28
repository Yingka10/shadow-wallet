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
const MONDAY_TO_FRIDAY = [1, 2, 3, 4, 5];
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

export type GoalMilestone = {
  id: string;
  title: string;
  detail: string | null;
  status: 'completed' | 'next' | 'upcoming';
};

export type GoalRecentRecord = {
  id: string;
  dateLabel: string;
  detail: string;
  timeWindowLabel: string | null;
};

export type GoalKind =
  | 'reading_habit'
  | 'habit'
  | 'skill'
  | 'challenge'
  | 'family';

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
  canCompleteToday: boolean;
  isReadingPlan: boolean;
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
  sectionOrder: ['hero', 'today', 'week', 'rewards', 'review'];
};

function weekStart(now: Dayjs): Dayjs {
  const taipeiNow = now.tz(TZ);
  return taipeiNow.startOf('day').subtract((taipeiNow.day() + 6) % 7, 'day');
}

function completionsThisWeek(
  completions: GoalCompletionRecord[],
  activeDays: number[],
  now: Dayjs,
  planStart: Dayjs | null,
  planEnd: Dayjs | null,
): GoalCompletionRecord[] {
  const start = weekStart(now);
  const end = start.add(7, 'day');
  const completionsByDate = new Map<string, GoalCompletionRecord>();

  for (const completion of completions) {
    const completedAt = dayjs(completion.completed_at).tz(TZ);
    const completionDate = completedAt.startOf('day');
    if (
      completedAt.isBefore(start)
      || !completedAt.isBefore(end)
      || !activeDays.includes(completedAt.day())
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
  isReadingHabit: boolean,
  isSkill: boolean,
  isChallenge: boolean,
): number[] {
  if (isSkill || isChallenge) return [];

  const configuredDays =
    goal.active_days
    ?? task.recurrence_days
    ?? (isReadingHabit ? MONDAY_TO_FRIDAY : ALL_WEEK_DAYS);

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

function getNextUnreachedCheckpoint(
  goal: LongTermGoal,
  effortCurrent: number,
  rewardCurrent: number,
): { threshold: number; coin: number } | null {
  if (!goal.checkpoint_rewards) return null;

  const threshold = Object.keys(goal.checkpoint_rewards)
    .map(Number)
    .filter(
      (value) =>
        Number.isFinite(value)
        && value > effortCurrent
        && value > rewardCurrent,
    )
    .sort((left, right) => left - right)[0];

  if (threshold === undefined) return null;
  return {
    threshold,
    coin: Number(goal.checkpoint_rewards[String(threshold)] ?? 0),
  };
}

function getUnconfirmedCheckpoint(
  goal: LongTermGoal,
  effortCurrent: number,
  rewardCurrent: number,
): number | null {
  if (!goal.checkpoint_rewards) return null;

  return Object.keys(goal.checkpoint_rewards)
    .map(Number)
    .filter(
      (threshold) =>
        Number.isFinite(threshold)
        && threshold > rewardCurrent
        && threshold <= effortCurrent,
    )
    .sort((left, right) => left - right)[0] ?? null;
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

function getCurrentSkillStage(goal: LongTermGoal): string {
  const levels = goal.level_definitions ?? [];
  const index = Math.min(
    Math.max(goal.current_level ?? 0, 0),
    Math.max(levels.length - 1, 0),
  );
  return String(levels[index]?.name ?? '下一個練習階段');
}

function buildMilestones(
  goal: LongTermGoal,
  rewardCurrent: number,
  effortCurrent: number,
  target: number,
  totalWeeks: number,
  isReadingHabit: boolean,
): GoalMilestone[] {
  const checkpoints = Object.entries(goal.checkpoint_rewards ?? {})
    .map(([threshold, coin]) => ({
      threshold: Number(threshold),
      coin: Number(coin),
    }))
    .filter(({ threshold }) => Number.isFinite(threshold) && threshold >= 1)
    .sort((left, right) => left.threshold - right.threshold);
  const firstCheckpoint = checkpoints.find(({ threshold }) => threshold === 1);
  const firstRewardRecorded = firstCheckpoint !== undefined && rewardCurrent >= 1;
  const firstEffortCompleted = effortCurrent >= 1;
  const milestones: GoalMilestone[] = [
    firstCheckpoint
      ? {
          id: 'start',
          title: firstRewardRecorded
            ? '完成第 1 次'
            : firstEffortCompleted
              ? '已完成第 1 次'
              : '完成第 1 次',
          detail: firstRewardRecorded && firstCheckpoint.coin > 0
            ? `成長幣 +${firstCheckpoint.coin} 已記下`
            : firstEffortCompleted
              ? '里程碑回饋可以和家人一起確認'
              : firstCheckpoint.coin > 0
                ? `達成後成長幣 +${firstCheckpoint.coin}`
                : null,
          status: firstRewardRecorded ? 'completed' : 'next',
        }
      : {
          id: 'start',
          title: effortCurrent > 0 ? '完成第 1 次' : '開始計畫',
          detail: null,
          status: 'completed',
        },
  ];

  const remainingCheckpoints = checkpoints.filter(({ threshold }) => threshold > 1);
  const nextCheckpoint = checkpoints.find(
    ({ threshold }) => threshold > rewardCurrent,
  )?.threshold;

  for (const checkpoint of remainingCheckpoints) {
    const rewardRecorded = checkpoint.threshold <= rewardCurrent;
    const effortCompleted = checkpoint.threshold <= effortCurrent;
    milestones.push({
      id: `checkpoint-${checkpoint.threshold}`,
      title: effortCompleted && !rewardRecorded
        ? `已完成第 ${checkpoint.threshold} 次`
        : `完成第 ${checkpoint.threshold} 次`,
      detail: effortCompleted && !rewardRecorded
        ? '里程碑回饋可以和家人一起確認'
        : checkpoint.coin > 0
          ? rewardRecorded
            ? `成長幣 +${checkpoint.coin} 已記下`
            : `達成後成長幣 +${checkpoint.coin}`
          : null,
      status: rewardRecorded
        ? 'completed'
        : checkpoint.threshold === nextCheckpoint
          ? 'next'
          : 'upcoming',
    });
  }

  const finalIsCompleted = goal.status === 'completed' || effortCurrent >= target;
  const finalIsNext = !finalIsCompleted && nextCheckpoint === undefined;
  const chineseWeekCounts: Record<number, string> = {
    1: '一',
    2: '二',
    3: '三',
    4: '四',
    5: '五',
    6: '六',
    7: '七',
    8: '八',
    9: '九',
    10: '十',
  };
  const weekCount = chineseWeekCounts[totalWeeks] ?? String(totalWeeks);

  milestones.push({
    id: 'final-review',
    title: totalWeeks === 0
      ? '安排好週期後一起回顧'
      : isReadingHabit
        ? `${weekCount}週後一起回顧`
      : '完成計畫後一起回顧',
    detail: '可以繼續、調整，或讓計畫先告一段落。',
    status: finalIsCompleted ? 'completed' : finalIsNext ? 'next' : 'upcoming',
  });

  return milestones;
}

function buildSkillMilestones(
  goal: LongTermGoal,
  current: number,
  target: number,
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
        : levelNumber === current + 1
          ? 'next'
          : 'upcoming',
    };
  });

  milestones.push({
    id: 'final-review',
    title: '完成計畫後一起回顧',
    detail: '可以繼續、調整，或讓計畫先告一段落。',
    status: goal.status === 'completed' || current >= target ? 'completed' : 'upcoming',
  });

  return milestones;
}

function buildChallengeMilestones(
  goal: LongTermGoal,
  current: number,
  target: number,
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
  const milestones: GoalMilestone[] = [
    {
      id: 'challenge-progress',
      title: `已累積 ${current}${unitSuffix}`,
      detail: null,
      status: 'completed',
    },
  ];

  for (const checkpoint of checkpoints) {
    milestones.push({
      id: `checkpoint-${checkpoint.threshold}`,
      title: `累積 ${checkpoint.threshold}${unitSuffix}`,
      detail: checkpoint.coin > 0 ? `成長幣 +${checkpoint.coin}` : null,
      status: checkpoint.threshold <= current
        ? 'completed'
        : checkpoint.threshold === nextCheckpoint
          ? 'next'
          : 'upcoming',
    });
  }

  milestones.push({
    id: 'final-review',
    title: `達到 ${target}${unitSuffix}`,
    detail: '可以繼續、調整，或讓計畫先告一段落。',
    status: goal.status === 'completed' || current >= target
      ? 'completed'
      : nextCheckpoint === undefined
        ? 'next'
        : 'upcoming',
  });

  return milestones;
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
): GoalPresentation {
  const isReadingPlan = task.name.includes('閱讀');
  const isSkill = goal.goal_type === 'skill';
  const isFamily = goal.goal_type === 'family';
  const isChallenge = goal.goal_type === 'challenge';
  const isReadingHabit = isReadingPlan && !isSkill && !isFamily && !isChallenge;
  const goalKind: GoalKind = isReadingHabit
    ? 'reading_habit'
    : isSkill
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
  const activeDays = getActiveDays(task, goal, isReadingHabit, isSkill, isChallenge);
  const planStart = getPlanStart(goal, task, now);
  const dueDateEnd = task.due_date
    ? getValidDueDate(planStart, task.due_date)
    : null;
  const challengeEnd =
    isChallenge && goal.total_days && goal.total_days > 0
      ? planStart.add(goal.total_days - 1, 'day')
      : null;
  const planEnd = dueDateEnd ?? challengeEnd;
  const weeklyCompletions = completionsThisWeek(
    completions,
    activeDays,
    now,
    planStart,
    planEnd,
  );
  const weekDays = buildWeekDays(
    activeDays,
    weeklyCompletions,
    now,
    planStart,
    planEnd,
  );
  const completionCurrent = completions.length;
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
  const weekTarget = weekDays.filter((day) => day.isScheduled).length;
  const completionWeekSize = Math.max(activeDays.length, 1);
  const hasUnplannedCycle =
    planEnd === null
    && activeDays.length === 0
    && (goal.goal_type === 'habit' || goal.goal_type === 'family');
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
  const todayIsActive = todayIsInsidePlan && activeDays.includes(today.day());
  const currentStage = getCurrentSkillStage(goal);
  const nextSkillLevel = goal.level_definitions?.[current];
  const checkpointCurrent = Math.max(goal.current_day ?? 0, 0);
  const nextReward = isSkill
    ? getNextSkillReward(goal, current)
    : isChallenge
      ? getNextCheckpoint(goal, current)
      : getNextUnreachedCheckpoint(goal, completionCurrent, checkpointCurrent);
  const unconfirmedCheckpoint = !isSkill && !isChallenge
    ? getUnconfirmedCheckpoint(goal, completionCurrent, checkpointCurrent)
    : null;
  const hasReachedTarget = current >= target;
  const isFuture = today.isBefore(planStart, 'day');
  const isExpired = planEnd !== null && today.isAfter(planEnd, 'day');
  const hasEmptyDailySchedule =
    activeDays.length === 0
    && (goal.goal_type === 'habit' || goal.goal_type === 'family');
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
    && (goal.goal_type === 'habit' || goal.goal_type === 'family')
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
  const scheduledCapacity =
    planEnd !== null && (goal.goal_type === 'habit' || goal.goal_type === 'family')
      ? countScheduledDates(planStart, planEnd, activeDays)
      : null;
  const planNotice =
    (planState === 'active' || planState === 'unplanned')
    && scheduledCapacity !== null
    && scheduledCapacity < target
      ? `目前期間最多安排 ${scheduledCapacity} 次，和 ${target} 次目標不一致，可以和家人一起調整。`
      : null;
  const planWeekLabel = isSkill
    ? `第 ${Math.min(current + 1, target)} 階段／共 ${target} 階段`
    : hasUnplannedCycle
      ? '尚未安排週期'
      : `第 ${currentWeek} 週／共 ${totalWeeks} 週`;
  const completionConditionLabel = isSkill
    ? `完成 ${target} 個階段`
    : hasChallengeValues
      ? `累積 ${target}${challengeUnit ? ` ${challengeUnit}` : ''}`
      : `完成 ${target} 次`;
  const adjustableItemsLabel = isReadingHabit
    ? '閱讀時段、每週次數、閱讀方式或內容'
    : isSkill
      ? '練習時段、每週次數、階段內容'
      : isFamily
        ? '參與時段、每週次數、任務內容'
        : '執行時段、每週次數、任務內容';
  const milestones = isSkill
    ? buildSkillMilestones(goal, current, target)
    : hasChallengeValues
      ? buildChallengeMilestones(goal, current, target, challengeUnit)
      : buildMilestones(
          goal,
          checkpointCurrent,
          current,
          target,
          totalWeeks,
          isReadingHabit,
        );

  return {
    headerTitle: task.name,
    weekLabel: hasUnplannedCycle
      ? '尚未安排週期'
      : isReadingHabit
      ? `第 ${currentWeek} 週`
      : isSkill
        ? `第 ${Math.min(current + 1, target)} 階段`
        : '成長旅程',
    planWeekLabel,
    weekProgressLabel: isSkill
      ? '依自己的節奏練習'
      : isChallenge
        ? '累積進度由家長確認'
        : activeDays.length === 0
          ? '本週尚未安排日期'
          : `本週完成 ${weeklyCompletions.length}／${weekTarget} 次`,
    weekCompleted: weeklyCompletions.length,
    weekTarget,
    totalWeeks,
    goalKind,
    planState,
    categoryLabel: isChallenge
      ? '自主挑戰'
      : isReadingPlan || isSkill
        ? '學習與技能'
        : isFamily
          ? '家庭參與'
          : '習慣養成',
    overallLabel: isSkill
      ? `第 ${current} / ${target} 階段`
      : hasChallengeValues
        ? `${current} / ${target}${challengeUnit ? ` ${challengeUnit}` : ''}`
        : `${current} / ${target} 次`,
    overallPercent,
    focusText: hasUnplannedCycle
      ? '先和家人一起安排適合的執行日期'
      : isReadingHabit
      ? currentWeek === 1
        ? '第 1 週：先找到適合自己的閱讀節奏'
        : `第 ${currentWeek} 週：繼續找到適合自己的閱讀節奏`
      : isSkill
        ? `目前階段：${currentStage}`
        : hasChallengeValues
          ? `目前已累積 ${current}${challengeUnit ? ` ${challengeUnit}` : ''}`
          : isFamily
            ? '每一次參與，都讓家裡的節奏更穩一點'
            : '先找到適合自己的生活節奏',
    nextText: unconfirmedCheckpoint !== null
      ? `已完成第 ${unconfirmedCheckpoint} 次，里程碑回饋可以和家人一起確認`
      : isSkill && nextSkillLevel
        ? `下一個里程碑：${String(nextSkillLevel.name ?? `第 ${current + 1} 階段`)}`
        : nextReward
          ? hasChallengeValues
            ? `下一個里程碑：累積 ${nextReward.threshold}${challengeUnit ? ` ${challengeUnit}` : ''}`
            : `下一個里程碑：完成第 ${nextReward.threshold} 次`
          : '下一個里程碑：一起看看這段時間的成長',
    planNotice,
    todayTitle,
    todayAction: isReadingHabit
      ? `自己選一本喜歡的書，閱讀 ${Math.max(task.base_time_min, 15)} 分鐘`
      : isSkill
        ? `這一階段先練習：${currentStage}`
        : isChallenge
          ? hasChallengeValues
            ? `已累積 ${current}${challengeUnit ? ` ${challengeUnit}` : ''}，由家長確認後更新`
            : '這項累積進度由家長確認後更新'
          : task.name,
    todayStatusText,
    preferredTimeWindow: goal.preferred_time_window,
    canCompleteToday,
    isReadingPlan: isReadingHabit,
    weekDays,
    weekSummary: isReadingHabit
      ? `這週已閱讀 ${weeklyCompletions.length} 次。少一天沒有關係，找到適合自己的節奏更重要。`
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
      : isReadingHabit
        ? `第 ${totalWeeks} 週結束後一起回顧，可以繼續、調整閱讀方式，或讓計畫先告一段落`
        : isSkill
          ? '完成最後階段後，一起留下這段學習成果'
          : '完成旅程後，一起選一個值得記住的時刻',
    reviewTitle: isReadingHabit ? '週末一起回顧' : '一起回顧這段成長',
    reviewPrompt: isReadingHabit
      ? '哪一本最喜歡？晚餐後還是睡前比較適合？'
      : isSkill
        ? '哪一段練習最有感？下一步想怎麼調整？'
        : '這段時間哪裡最順？下一步想怎麼調整？',
    sectionOrder: ['hero', 'today', 'week', 'rewards', 'review'],
  };
}
