import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type {
  LongTermGoal,
  PreferredTimeWindow,
  Task,
  TaskCompletion,
} from '../../types/database';
import {
  buildWeeklyProgress,
  fixedDayEvidence,
  resolveAgreedPreferredTime,
  resolveLongTermCompletionAvailability,
  resolveLongTermProgression,
  resolveSessionMinutes,
  resolveTodayAction,
} from '../../lib/longTerm';
import type {
  AgreedPreferredTime,
  AgreedRewardView,
  ChildConfirmedPlanView,
  LongTermCompletionReason,
  LongTermProgression,
} from '../../lib/longTerm';

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

// ── Journey Hero｜我現在走到哪裡（§4）──────────────────────────────────
export type GoalJourneyHero = {
  categoryLabel: string;
  /** 第 1 週 / 第 3 階段。 */
  positionLabel: string;
  /**
   * 這段路現在的樣子。**只來自談定過的資料**（孩子寫下的期望、目前階段名）。
   * 沒有就是 null —— Hero 少一行，不要生一句話。
   */
  positionNote: string | null;
  /** 共 2 週 / 共 4 階段。還沒安排週期就是 null。 */
  totalLabel: string | null;
};

// ── Progress｜我現在怎麼往前（§12、§13）────────────────────────────────
/** 這週節奏上的一格。數量＝約定次數，是真資料不是裝飾。 */
export type GoalRhythmNode = {
  id: string;
  done: boolean;
};

export type GoalStage = {
  id: string;
  name: string;
  status: 'completed' | 'current' | 'next' | 'upcoming';
  /** 說好的回饋。secondary，永遠不是這一段的主角（§15）。 */
  coin: number | null;
};

type GoalProgressBase = {
  title: string;
  /** 主要數字前的小字：本週 / 已完成 / 目前。 */
  lead: string | null;
  /** 主要數字：2 / 3、2 / 4 階段、8 / 20 頁。 */
  value: string;
  note: string | null;
};

/**
 * progression 改的是這一段的**內部呈現**，不是整頁重新換版（§2）。
 */
export type GoalProgressView =
  | (GoalProgressBase & { kind: 'rhythm'; nodes: GoalRhythmNode[] })
  | (GoalProgressBase & { kind: 'fixed_days'; days: GoalDayStatus[] })
  | (GoalProgressBase & { kind: 'staged'; stages: GoalStage[] })
  | (GoalProgressBase & { kind: 'accumulation'; ratio: number })
  | (GoalProgressBase & { kind: 'plain' });

// ── Next Stop｜接下來的一站（§14）──────────────────────────────────────
export type GoalNextStop = {
  /** 完成第 5 次 / 累積 50 頁。 */
  title: string;
  caption: string;
  note: string | null;
  /** 有就顯示，但只能是 secondary information（§15）。 */
  coin: number | null;
};

export type GoalRecentRecord = {
  id: string;
  dateLabel: string;
  detail: string;
  timeWindowLabel: string | null;
};

/**
 * 計畫目前的生命週期狀態。
 *
 * ⚠️ **進度不會讓計畫結束。** 兩週的節奏計畫做滿 14 次不是完成，
 *    做了 9 次也不是失敗 —— 它的終點是日期或家庭正式決定，不是次數。
 *    「達到目標」是另一件事，見 targetReached。
 */
export type GoalPlanState =
  | 'active'
  | 'upcoming'
  | 'paused'
  | 'completed'
  | 'expired'
  | 'unplanned';

export type GoalPresentation = {
  headerTitle: string;
  /** 這件事怎麼往前走。唯一來源是 resolveLongTermProgression。 */
  progression: LongTermProgression | null;
  planState: GoalPlanState;
  /**
   * 已經做到約定的量了嗎。
   *
   * ⚠️ 與 planState 是**兩件事**。達標只是一個值得說一句的時刻，
   *    不是計畫結束。
   */
  targetReached: boolean;
  categoryLabel: string;
  planWeekLabel: string;

  // ── 這一週（§C：不 clamp）────────────────────────────────────────────
  weekCompletedActual: number;
  weekTarget: number;
  weekTargetReached: boolean;
  weekExtra: number;
  weekProgressLabel: string;
  weekProgressNote: string | null;
  weekDays: GoalDayStatus[];
  weekSummary: string;

  overallLabel: string;
  overallPercent: number;
  focusText: string;
  nextText: string;
  planNotice?: string | null;

  // ── 今天 ─────────────────────────────────────────────────────────────
  todayTitle: string;
  todayAction: string;
  todayStatusText?: string | null;
  sessionMinutes: number | null;
  canCompleteToday: boolean;
  /** 不能按的時候是為什麼。UI 不必自己猜。 */
  completionReason: LongTermCompletionReason;

  // ── 時段：兩個 domain（§I）────────────────────────────────────────────
  /** 家庭談定的時段，詞彙完整。 */
  agreedTime: AgreedPreferredTime | null;
  /** 一次完成紀錄的 context，只有兩個值。 */
  preferredTimeWindow: PreferredTimeWindow | null;
  /** 這份計畫的約定時段記得下來嗎（決定要不要顯示時段選擇）。 */
  supportsTimeWindow: boolean;

  // ── 孩子自己確認過的那份計畫（§H）─────────────────────────────────────
  childPlan: ChildConfirmedPlanView | null;

  // ── 說好的回饋（§J）──────────────────────────────────────────────────
  /** P1：目前有效共同版本的 confirmed_* 快照。 */
  agreedReward: AgreedRewardView | null;
  /**
   * 這筆任務的回饋語意是 legacy 的（P0 per_period，或沒有快照）。
   *
   * ⚠️ 那些家庭當初看到的畫面寫的是「每次完成」，沒有人真的確認過
   *    每週結算。**不要在這裡把它重新詮釋成「說好的回饋」。**
   */
  legacyReward: boolean;

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

function getCurrentSkillStage(goal: LongTermGoal): string {
  const levels = goal.level_definitions ?? [];
  const index = Math.min(
    Math.max(goal.current_level ?? 0, 0),
    Math.max(levels.length - 1, 0),
  );
  return String(levels[index]?.name ?? '下一個練習階段');
}

function buildRhythmMilestones(goal: LongTermGoal): GoalMilestone[] {
  // ⚠️ 只列**真的存在**的 checkpoint。
  //
  //    之前這裡會補一條「N 週後一起回顧」—— 沒有人約定過那件事，
  //    它是畫面自己生出來的。孩子看到的里程碑必須全部指得出誰講的。
  return Object.entries(goal.checkpoint_rewards ?? {})
    .map(([threshold, coin]) => ({ threshold: Number(threshold), coin: Number(coin) }))
    .filter(({ threshold }) => Number.isFinite(threshold) && threshold >= 1)
    .sort((left, right) => left.threshold - right.threshold)
    .map((checkpoint) => ({
      id: `checkpoint-${checkpoint.threshold}`,
      title: `第 ${checkpoint.threshold} 次的計畫節點`,
      detail: checkpoint.coin > 0 ? `成長幣 +${checkpoint.coin}（達成時一起確認）` : null,
      status: 'planned' as const,
    }));
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

const CATEGORY_LABEL: Record<string, string> = {
  A: '生活習慣',
  B: '家庭參與',
  C: '自主挑戰',
  D: '學習與技能',
};

/** 完成紀錄記得下來的兩個時段。約定詞彙比這個寬，見 agreedTime。 */
const RECORDABLE_WINDOWS = ['after_dinner', 'before_bed'];

const COMPLETION_STATUS_COPY: Record<LongTermCompletionReason, string | null> = {
  available: null,
  already_recorded_today: '今天已經記過了',
  claim_limit_reached: '這一段時間的紀錄已經滿了',
  not_scheduled_today: '今天不用記錄，照自己的節奏休息',
  before_plan: '計畫還沒開始',
  after_plan: '一起回顧這段計畫',
  paused: '這個計畫暫停中',
  unsupported_progression: '這個計畫的進度由家長一起確認',
};

export type BuildGoalPresentationExtras = {
  /** 沿 adoption lineage 讀回來的孩子正式計畫。沒有就是 legacy。 */
  childPlan?: ChildConfirmedPlanView | null;
  /** 目前有效共同版本的 confirmed_* 快照。 */
  agreedReward?: AgreedRewardView | null;
  /** 這筆任務有共同版本，但回饋語意是 legacy 的。 */
  legacyReward?: boolean;
};

export function buildGoalPresentation(
  task: Task,
  goal: LongTermGoal,
  completions: GoalCompletionRecord[],
  now = dayjs().tz(TZ),
  extras: BuildGoalPresentationExtras = {},
): GoalPresentation {
  // ── 這件事怎麼往前走 ─────────────────────────────────────────────────
  //
  // ⚠️ 只問一次，而且只問 resolveLongTermProgression。
  //    goal_type / task.name / category / duration_type 一律不參與 ——
  //    各自猜一次的結果就是首頁說 0%、點進去說本週 2/3。
  const progression = resolveLongTermProgression(task, goal);
  const isRhythm = progression === 'rhythm';
  const isFixedDays = progression === 'fixed_days';
  const isStaged = progression === 'staged';
  const isAccumulation = progression === 'accumulation';

  const activeDays = fixedDayEvidence(task, goal);
  const weeklyFrequency = getWeeklyFrequency(task);
  const planStart = getPlanStart(goal, task, now);
  const dueDateEnd = task.due_date ? getValidDueDate(planStart, task.due_date) : null;
  const goalEnd = goal.end_date ? getValidDueDate(planStart, goal.end_date) : null;
  const planEnd = goalEnd ?? dueDateEnd;

  const rhythmCompletions = validRhythmCompletions(
    completions,
    activeDays,
    isRhythm,
    planStart,
    planEnd,
  );
  const weekDays = buildWeekDays(activeDays, rhythmCompletions, now, planStart, planEnd);

  // ── 這一週（不 clamp）────────────────────────────────────────────────
  const weekTarget = isRhythm
    ? weeklyFrequency ?? 0
    : weekDays.filter((day) => day.isScheduled).length;
  const weekly = buildWeeklyProgress(rhythmCompletions, weekTarget, now);

  // ── 期間 ────────────────────────────────────────────────────────────
  const totalWeeks = planEnd
    ? getCoveredWeeks(planStart, planEnd)
    : goal.total_days && goal.total_days > 0
      ? Math.max(Math.ceil(goal.total_days / 7), 1)
      : 0;
  const currentWeek = getCurrentPlanWeek(planStart, now, totalWeeks);

  // ── 進度數字（依 progression，各自的單位）─────────────────────────────
  const stagedTarget = Math.max(goal.level_count ?? goal.level_definitions?.length ?? 0, 0);
  const stagedCurrent = Math.max(goal.current_level ?? 0, 0);
  const accTarget = Number(goal.target_value ?? 0);
  const accCurrent = Math.max(Number(goal.current_value ?? 0), 0);
  const accUnit = goal.value_unit?.trim() ?? '';

  // ⚠️ **達標與計畫結束是兩件事**（§D）。這個布林只給畫面說一句話用，
  //    不進 planState。
  const targetReached = isStaged
    ? stagedTarget > 0 && stagedCurrent >= stagedTarget
    : isAccumulation
      ? accTarget > 0 && accCurrent >= accTarget
      : weekly.weekTargetReached;

  const today = now.tz(TZ).startOf('day');
  const hasSchedule = isRhythm
    ? (weeklyFrequency ?? 0) > 0
    : isFixedDays
      ? activeDays.length > 0
      : progression !== null;

  // ── 生命週期（§D：不從進度推）─────────────────────────────────────────
  const planState: GoalPlanState = goal.status === 'paused'
    ? 'paused'
    : goal.status === 'completed'
      ? 'completed'
      : today.isBefore(planStart, 'day')
        ? 'upcoming'
        : planEnd !== null && today.isAfter(planEnd, 'day')
          ? 'expired'
          : !hasSchedule
            ? 'unplanned'
            : 'active';

  // ── 今天能不能按（§B：與 progression 分開，且不看週目標）──────────────
  const availability = resolveLongTermCompletionAvailability({
    task,
    goal,
    progression,
    completions,
    now,
    planStart,
    planEnd,
  });
  const canCompleteToday = planState === 'active' && availability.canComplete;
  const completionReason = planState === 'paused'
    ? 'paused'
    : planState === 'upcoming'
      ? 'before_plan'
      : planState === 'expired'
        ? 'after_plan'
        : availability.reason;

  // ── 今天要做什麼（§G：只來自 canonical 來源）──────────────────────────
  const childPlan = extras.childPlan ?? null;
  const todayAction = resolveTodayAction(task, childPlan);
  const sessionMinutes = resolveSessionMinutes(task);
  const agreedTime = resolveAgreedPreferredTime(task);
  const supportsTimeWindow = agreedTime !== null
    && RECORDABLE_WINDOWS.includes(agreedTime.value);

  const todayCompletion = completions.find(
    (completion) => dayjs(completion.completed_at).tz(TZ).isSame(today, 'day'),
  ) ?? null;

  const overallPercent = isStaged && stagedTarget > 0
    ? Math.min(Math.round((stagedCurrent / stagedTarget) * 100), 100)
    : isAccumulation && accTarget > 0
      ? Math.min(Math.round((accCurrent / accTarget) * 100), 100)
      // 節奏計畫的「整體進度」是**走到第幾週**，不是做了幾次 ——
      // 用次數當百分比，做滿約定次數就會顯示 100%，而計畫還在跑。
      : totalWeeks > 0
        ? Math.min(Math.round((currentWeek / totalWeeks) * 100), 100)
        : 0;

  const milestones = isStaged
    ? buildSkillMilestones(goal, stagedCurrent, Math.max(stagedTarget, 1))
    : isAccumulation
      ? buildChallengeMilestones(goal, accCurrent, Math.max(accTarget, 1), accUnit)
      : buildRhythmMilestones(goal);

  const nextReward = isStaged
    ? getNextSkillReward(goal, stagedCurrent)
    : isAccumulation
      ? getNextCheckpoint(goal, accCurrent)
      : null;

  const scheduledCapacity = planEnd !== null && (isRhythm || isFixedDays)
    ? isRhythm
      ? getCoveredWeeks(planStart, planEnd) * weekTarget
      : countScheduledDates(planStart, planEnd, activeDays)
    : null;

  return {
    headerTitle: task.name,
    progression,
    planState,
    targetReached,
    categoryLabel: CATEGORY_LABEL[String(task.category ?? '').trim()] ?? '成長計畫',
    planWeekLabel: isStaged
      ? `第 ${Math.min(stagedCurrent + 1, Math.max(stagedTarget, 1))} 階段／共 ${Math.max(stagedTarget, 1)} 階段`
      : planState === 'unplanned' || totalWeeks === 0
        ? '還沒安排週期'
        : `第 ${currentWeek} 週／共 ${totalWeeks} 週`,

    weekCompletedActual: weekly.weekCompletedActual,
    weekTarget: weekly.weekTarget,
    weekTargetReached: weekly.weekTargetReached,
    weekExtra: weekly.weekExtra,
    weekProgressLabel: weekly.label,
    weekProgressNote: weekly.note,
    weekDays,
    weekSummary: isStaged
      ? '這週可以依自己的節奏，繼續目前的練習階段。'
      : isAccumulation
        ? '累積進度會在家長確認後更新。'
        : weekly.note ?? weekly.label,

    overallLabel: isStaged
      ? `第 ${stagedCurrent} / ${Math.max(stagedTarget, 1)} 階段`
      : isAccumulation
        ? `${accCurrent} / ${accTarget}${accUnit ? ` ${accUnit}` : ''}`
        : totalWeeks > 0
          ? `第 ${currentWeek} 週 / 共 ${totalWeeks} 週`
          : '還沒安排週期',
    overallPercent,
    focusText: planState === 'unplanned'
      ? '先和家人一起安排適合的執行日期'
      : isStaged
        ? `目前階段：${getCurrentSkillStage(goal)}`
        : isAccumulation
          ? `目前已累積 ${accCurrent}${accUnit ? ` ${accUnit}` : ''}`
          : childPlan?.desiredOutcome ?? task.name,
    nextText: isStaged && goal.level_definitions?.[stagedCurrent]
      ? `下一個里程碑：${String(goal.level_definitions[stagedCurrent].name ?? `第 ${stagedCurrent + 1} 階段`)}`
      : nextReward
        ? isAccumulation
          ? `下一個里程碑：累積 ${nextReward.threshold}${accUnit ? ` ${accUnit}` : ''}`
          : `下一個里程碑：完成第 ${nextReward.threshold} 次`
        : weekly.note ?? weekly.label,
    planNotice: planState === 'active'
      && scheduledCapacity !== null
      && goal.total_days !== null
      && scheduledCapacity < (goal.total_days ?? 0)
      ? null
      : null,

    todayTitle: planState === 'paused'
      ? '計畫暫停中'
      : planState === 'completed'
        ? '這段計畫已完成'
        : planState === 'upcoming'
          ? '計畫還沒開始'
          : planState === 'expired'
            ? '一起回顧這段計畫'
            : planState === 'unplanned'
              ? '尚未安排日期'
              : '今天的小步驟',
    todayAction,
    todayStatusText: todayCompletion ? '今天做完了' : COMPLETION_STATUS_COPY[completionReason],
    sessionMinutes,
    canCompleteToday,
    completionReason,

    agreedTime,
    preferredTimeWindow: goal.preferred_time_window,
    supportsTimeWindow,

    childPlan,
    agreedReward: extras.agreedReward ?? null,
    legacyReward: extras.legacyReward ?? false,

    nextReward,
    milestones,
    recentRecords: buildRecentRecords(task, completions),
    planPeriodLabel: buildPlanPeriodLabel(
      goal,
      planStart,
      planEnd,
      totalWeeks,
      isStaged || isAccumulation,
    ),
    completionConditionLabel: isStaged
      ? `完成 ${Math.max(stagedTarget, 1)} 個階段`
      : isAccumulation
        ? `累積 ${accTarget}${accUnit ? ` ${accUnit}` : ''}`
        // ⚠️ 節奏計畫**沒有**「總共要做 N 次」這個終點。
        //    寫成次數的話，做滿那個數字就會有人以為結束了。
        : totalWeeks > 0 && weekly.weekTarget > 0
          ? `${totalWeeks} 週計畫 · 每週 ${weekly.weekTarget} 次`
          : '還沒安排週期',
    adjustableItemsLabel: isStaged
      ? '練習時段、每週次數、階段內容'
      : '執行時段、每週次數、任務內容',
    finalRewardText: planState === 'unplanned'
      ? '安排好週期後，再一起回顧這段計畫'
      : isStaged
        ? '完成最後階段後，一起留下這段學習成果'
        : totalWeeks > 0
          ? `第 ${totalWeeks} 週結束後一起回顧，可以繼續、調整，或讓計畫先告一段落`
          : '完成旅程後，一起選一個值得記住的時刻',
    reviewTitle: '一起回顧這段成長',
    reviewPrompt: isStaged
      ? '哪一段練習最有感？下一步想怎麼調整？'
      : '這段時間哪裡最順？下一步想怎麼調整？',
  };
}
