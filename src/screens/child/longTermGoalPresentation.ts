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

export type GoalDayStatus = {
  day: number;
  label: string;
  state: 'completed' | 'self_started' | 'today' | 'future' | 'missed';
};

export type GoalPresentation = {
  headerTitle: string;
  weekLabel: string;
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
  finalRewardText: string;
  reviewTitle: string;
  reviewPrompt: string;
  sectionOrder: ['hero', 'today', 'week', 'rewards', 'review'];
};

function weekStart(now: Dayjs): Dayjs {
  return now.startOf('day').subtract((now.day() + 6) % 7, 'day');
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
): GoalDayStatus[] {
  const start = weekStart(now);
  const today = now.tz(TZ).startOf('day');

  return activeDays.map((day) => {
    const offset = day === 0 ? 6 : day - 1;
    const date = start.add(offset, 'day');
    const completion = completions.find((item) =>
      dayjs(item.completed_at).tz(TZ).isSame(date, 'day'),
    );

    let state: GoalDayStatus['state'];
    if (completion?.start_mode === 'self_started') {
      state = 'self_started';
    } else if (completion) {
      state = 'completed';
    } else if (date.isSame(today, 'day')) {
      state = 'today';
    } else if (date.isAfter(today, 'day')) {
      state = 'future';
    } else {
      state = 'missed';
    }

    return { day, label: DAY_LABELS[day], state };
  });
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

function getCurrentSkillStage(goal: LongTermGoal): string {
  const levels = goal.level_definitions ?? [];
  const index = Math.min(
    Math.max(goal.current_level ?? 0, 0),
    Math.max(levels.length - 1, 0),
  );
  return String(levels[index]?.name ?? '下一個練習階段');
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
  const activeDays = goal.active_days ?? (isReadingPlan ? MONDAY_TO_FRIDAY : ALL_WEEK_DAYS);
  const weeklyCompletions = completionsThisWeek(completions, now);
  const selfStartedCount = weeklyCompletions.filter(
    (completion) => completion.start_mode === 'self_started',
  ).length;
  const current = isSkill
    ? Math.max(goal.current_level ?? 0, 0)
    : completions.length;
  const target = isSkill
    ? Math.max(goal.level_count ?? goal.level_definitions?.length ?? 1, 1)
    : isFamily
      ? Math.max(goal.target_completions ?? goal.total_days ?? 1, 1)
      : Math.max(goal.total_days ?? 1, 1);
  const overallPercent = Math.min(Math.round((current / target) * 100), 100);
  const todayIsActive = activeDays.includes(now.tz(TZ).day());
  const currentStage = getCurrentSkillStage(goal);
  const nextReward = isSkill
    ? (() => {
        const level = goal.level_definitions?.[current];
        if (!level) return null;
        return { threshold: current + 1, coin: Number(level.coin ?? 0) };
      })()
    : getNextCheckpoint(goal, current);

  const readingWeek = Math.min(
    Math.floor(Math.max(current - 1, 0) / MONDAY_TO_FRIDAY.length) + 1,
    Math.max(Math.ceil(target / MONDAY_TO_FRIDAY.length), 1),
  );

  return {
    headerTitle: task.name,
    weekLabel: isReadingPlan
      ? `第 ${readingWeek} 週`
      : isSkill
        ? `第 ${Math.min(current + 1, target)} 階段`
        : '成長旅程',
    categoryLabel: isReadingPlan || isSkill
      ? '學習與技能'
      : isFamily
        ? '家庭參與'
        : '習慣養成',
    overallLabel: isSkill
      ? `第 ${current} / ${target} 階段`
      : `${current} / ${target} 次`,
    overallPercent,
    focusText: isReadingPlan
      ? '第一週：先找到適合自己的閱讀節奏'
      : isSkill
        ? `目前階段：${currentStage}`
        : isFamily
          ? '每一次參與，都讓家裡的節奏更穩一點'
          : '先找到適合自己的生活節奏',
    nextText: nextReward
      ? `下一站：完成第 ${nextReward.threshold} 次`
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
    weekDays: buildWeekDays(
      isReadingPlan ? MONDAY_TO_FRIDAY : activeDays,
      weeklyCompletions,
      now,
    ),
    weekSummary: isReadingPlan
      ? `這週已閱讀 ${weeklyCompletions.length} 次，其中 ${selfStartedCount} 次是自己開始的。`
      : isSkill
        ? '這週可以依自己的節奏，繼續目前的練習階段。'
        : `這週已完成 ${weeklyCompletions.length} 次。`,
    nextReward,
    finalRewardText: isReadingPlan
      ? '完成四週後，和家人一起選下一本書或慶祝方式'
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
