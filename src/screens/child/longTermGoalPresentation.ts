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

export type GoalPresentation = {
  headerTitle: string;
  weekLabel: string;
  planWeekLabel: string;
  weekProgressLabel: string;
  weekCompleted: number;
  weekTarget: number;
  totalWeeks: number;
  categoryLabel: string;
  overallLabel: string;
  overallPercent: number;
  focusText: string;
  nextText: string;
  todayTitle: string;
  todayAction: string;
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
): GoalCompletionRecord[] {
  const start = weekStart(now);
  const end = start.add(7, 'day');
  const completionsByDate = new Map<string, GoalCompletionRecord>();

  for (const completion of completions) {
    const completedAt = dayjs(completion.completed_at).tz(TZ);
    if (
      completedAt.isBefore(start)
      || !completedAt.isBefore(end)
      || !activeDays.includes(completedAt.day())
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
): GoalDayStatus[] {
  const start = weekStart(now);
  const today = now.tz(TZ).startOf('day');

  return ALL_WEEK_DAYS.map((day) => {
    const offset = day === 0 ? 6 : day - 1;
    const date = start.add(offset, 'day');
    const isScheduled = activeDays.includes(day);
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

function getActiveDays(task: Task, goal: LongTermGoal, isReadingPlan: boolean): number[] {
  const configuredDays =
    goal.active_days
    ?? task.recurrence_days
    ?? (isReadingPlan ? MONDAY_TO_FRIDAY : ALL_WEEK_DAYS);

  return Array.from(
    new Set(configuredDays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)),
  );
}

function parseTaipeiDate(value: string): Dayjs {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? dayjs.tz(value, TZ)
    : dayjs(value).tz(TZ);
}

function getCoveredWeeks(startedAt: string, dueDate: string): number {
  const start = parseTaipeiDate(startedAt).startOf('day');
  const end = parseTaipeiDate(dueDate).startOf('day');
  const coveredDays = Math.max(end.diff(start, 'day') + 1, 1);
  return Math.max(Math.ceil(coveredDays / 7), 1);
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
  current: number,
  target: number,
  totalWeeks: number,
  isReadingPlan: boolean,
): GoalMilestone[] {
  const checkpoints = Object.entries(goal.checkpoint_rewards ?? {})
    .map(([threshold, coin]) => ({
      threshold: Number(threshold),
      coin: Number(coin),
    }))
    .filter(({ threshold }) => Number.isFinite(threshold) && threshold >= 1)
    .sort((left, right) => left.threshold - right.threshold);
  const firstCheckpoint = checkpoints.find(({ threshold }) => threshold === 1);
  const milestones: GoalMilestone[] = [
    {
      id: 'start',
      title: current > 0 ? '完成第 1 次' : '開始計畫',
      detail: current > 0 && firstCheckpoint && firstCheckpoint.coin > 0
        ? `成長幣 +${firstCheckpoint.coin}`
        : null,
      status: 'completed',
    },
  ];

  const remainingCheckpoints = checkpoints.filter(
    ({ threshold }) => threshold > 1 || current < 1,
  );
  const nextCheckpoint = remainingCheckpoints.find(
    ({ threshold }) => threshold > current,
  )?.threshold;

  for (const checkpoint of remainingCheckpoints) {
    milestones.push({
      id: `checkpoint-${checkpoint.threshold}`,
      title: `完成第 ${checkpoint.threshold} 次`,
      detail: checkpoint.coin > 0 ? `成長幣 +${checkpoint.coin}` : null,
      status: checkpoint.threshold <= current
        ? 'completed'
        : checkpoint.threshold === nextCheckpoint
          ? 'next'
          : 'upcoming',
    });
  }

  const finalIsCompleted = goal.status === 'completed' || current >= target;
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
    title: isReadingPlan ? `${weekCount}週後一起回顧` : '完成計畫後一起回顧',
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
  task: Task,
  totalWeeks: number,
): string {
  const start = parseTaipeiDate(goal.started_at);
  const calculatedEnd = start.add(totalWeeks, 'week').subtract(1, 'day');
  const end = task.due_date
    ? parseTaipeiDate(task.due_date)
    : calculatedEnd;

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
  const hasChallengeValues =
    isChallenge
    && Number.isFinite(goal.current_value)
    && Number.isFinite(goal.target_value)
    && Number(goal.target_value) > 0;
  const challengeUnit = hasChallengeValues ? goal.value_unit?.trim() ?? '' : '';
  const activeDays = getActiveDays(task, goal, isReadingPlan);
  const weeklyCompletions = completionsThisWeek(completions, activeDays, now);
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
  const weekTarget = activeDays.length;
  const completionWeekSize = Math.max(weekTarget, 1);
  const fallbackTotalWeeks = isSkill && goal.total_days
    ? Math.max(Math.ceil(goal.total_days / 7), 1)
    : Math.max(Math.ceil(completionTarget / completionWeekSize), 1);
  const totalWeeks = task.due_date
    ? getCoveredWeeks(goal.started_at, task.due_date)
    : fallbackTotalWeeks;
  const scheduleCurrent = isSkill ? current : completionCurrent;
  const currentWeek = Math.min(
    Math.floor(Math.max(scheduleCurrent - 1, 0) / completionWeekSize) + 1,
    totalWeeks,
  );
  const overallPercent = Math.max(
    Math.min(Math.round((current / target) * 100), 100),
    0,
  );
  const todayIsActive = activeDays.includes(now.tz(TZ).day());
  const currentStage = getCurrentSkillStage(goal);
  const nextSkillLevel = goal.level_definitions?.[current];
  const nextReward = isSkill
    ? getNextSkillReward(goal, current)
    : getNextCheckpoint(goal, current);

  const readingWeek = Math.min(
    Math.floor(Math.max(completionCurrent - 1, 0) / completionWeekSize) + 1,
    totalWeeks,
  );
  const planWeekLabel = isSkill
    ? `第 ${Math.min(current + 1, target)} 階段／共 ${target} 階段`
    : `第 ${currentWeek} 週／共 ${totalWeeks} 週`;
  const completionConditionLabel = isSkill
    ? `完成 ${target} 個階段`
    : hasChallengeValues
      ? `累積 ${target}${challengeUnit ? ` ${challengeUnit}` : ''}`
      : `完成 ${target} 次`;
  const adjustableItemsLabel = isReadingPlan
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
      : buildMilestones(goal, current, target, totalWeeks, isReadingPlan);

  return {
    headerTitle: task.name,
    weekLabel: isReadingPlan
      ? `第 ${readingWeek} 週`
      : isSkill
        ? `第 ${Math.min(current + 1, target)} 階段`
        : '成長旅程',
    planWeekLabel,
    weekProgressLabel: `本週完成 ${weeklyCompletions.length}／${weekTarget} 次`,
    weekCompleted: weeklyCompletions.length,
    weekTarget,
    totalWeeks,
    categoryLabel: isReadingPlan || isSkill
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
    focusText: isReadingPlan
      ? '第一週：先找到適合自己的閱讀節奏'
      : isSkill
        ? `目前階段：${currentStage}`
        : hasChallengeValues
          ? `目前已累積 ${current}${challengeUnit ? ` ${challengeUnit}` : ''}`
          : isFamily
            ? '每一次參與，都讓家裡的節奏更穩一點'
            : '先找到適合自己的生活節奏',
    nextText: isSkill && nextSkillLevel
      ? `下一個階段：${String(nextSkillLevel.name ?? `第 ${current + 1} 階段`)}`
      : nextReward
        ? hasChallengeValues
          ? `下一個里程碑：累積 ${nextReward.threshold}${challengeUnit ? ` ${challengeUnit}` : ''}`
          : `下一站：完成第 ${nextReward.threshold} 次`
        : '下一站：一起看看這段時間的成長',
    todayTitle: !todayIsActive && !isSkill
      ? '今天是休息日'
      : isSkill
        ? '目前的小步驟'
        : '今天的小步驟',
    todayAction: isReadingPlan
      ? `自己選一本喜歡的書，閱讀 ${Math.max(task.base_time_min, 15)} 分鐘`
      : isSkill
        ? `這一階段先練習：${currentStage}`
        : task.name,
    preferredTimeWindow: goal.preferred_time_window,
    canCompleteToday: !isSkill && todayIsActive,
    isReadingPlan,
    weekDays: buildWeekDays(activeDays, weeklyCompletions, now),
    weekSummary: isReadingPlan
      ? `這週已閱讀 ${weeklyCompletions.length} 次。少一天沒有關係，找到適合自己的節奏更重要。`
      : isSkill
        ? '這週可以依自己的節奏，繼續目前的練習階段。'
        : `這週已完成 ${weeklyCompletions.length} 次。`,
    nextReward,
    milestones,
    recentRecords: buildRecentRecords(task, completions),
    planPeriodLabel: buildPlanPeriodLabel(goal, task, totalWeeks),
    completionConditionLabel,
    adjustableItemsLabel,
    finalRewardText: isReadingPlan
      ? '四週後一起回顧，可以繼續、調整閱讀方式，或讓計畫先告一段落'
      : isSkill
        ? '完成最後階段後，一起留下這段學習成果'
        : '完成旅程後，一起選一個值得記住的時刻',
    reviewTitle: isReadingPlan ? '週末一起回顧' : '一起回顧這段成長',
    reviewPrompt: isReadingPlan
      ? '哪一本最喜歡？晚餐後還是睡前比較適合？'
      : isSkill
        ? '哪一段練習最有感？下一步想怎麼調整？'
        : '這段時間哪裡最順？下一步想怎麼調整？',
    sectionOrder: ['hero', 'today', 'week', 'rewards', 'review'],
  };
}
