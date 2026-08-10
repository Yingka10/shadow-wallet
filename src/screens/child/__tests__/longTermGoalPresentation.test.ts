import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type { LongTermGoal, Task } from '../../../types/database';
import { buildGoalPresentation, type GoalCompletionRecord } from '../longTermGoalPresentation';

dayjs.extend(utc);
dayjs.extend(timezone);

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-reading',
    family_id: 'family-1',
    name: '自主閱讀計畫',
    category: 'D',
    day_type: 'custom',
    long_term_type: 'habit',
    is_long_term: true,
    base_time_min: 15,
    difficulty: 1,
    coin_override: null,
    is_system_default: false,
    allow_repeat: false,
    min_age: 6,
    max_age: 9,
    is_active: true,
    time_saving_min: 0,
    recurrence_days: [1, 2, 3, 4, 5],
    due_date: null,
    created_at: '2026-07-27T00:00:00+08:00',
    ...overrides,
  };
}

function makeGoal(overrides: Partial<LongTermGoal> = {}): LongTermGoal {
  return {
    id: 'goal-reading',
    child_id: 'child-1',
    task_id: 'task-reading',
    goal_type: 'habit',
    total_days: 20,
    current_day: 3,
    status: 'active',
    checkpoint_rewards: { '5': 10 },
    motivation_note: '自己選一本喜歡的書，閱讀 15 分鐘',
    started_at: '2026-07-27',
    next_review_at: null,
    completed_at: null,
    created_at: '2026-07-27T00:00:00+08:00',
    min_age: 6,
    interrupt_count: 0,
    last_active_date: null,
    active_days: [1, 2, 3, 4, 5],
    preferred_time_window: 'after_dinner',
    level_definitions: null,
    current_level: null,
    level_count: null,
    role_title: null,
    salary_mode: null,
    base_salary: null,
    weekly_target_rate: null,
    privilege_reward: null,
    family_time_per_completion: null,
    target_completions: null,
    target_value: null,
    current_value: null,
    value_unit: null,
    ...overrides,
  };
}

function makeCompletion(
  id: string,
  completedAt: string,
  startMode: GoalCompletionRecord['start_mode'],
  plannedTimeWindow: GoalCompletionRecord['planned_time_window'] = 'after_dinner',
): GoalCompletionRecord {
  return {
    id,
    completed_at: completedAt,
    planned_time_window: plannedTimeWindow,
    start_mode: startMode,
  };
}

function makeScheduledCompletions(
  count: number,
  start = '2026-07-27T19:00:00',
): GoalCompletionRecord[] {
  const completions: GoalCompletionRecord[] = [];
  let date = dayjs.tz(start, 'Asia/Taipei');

  while (completions.length < count) {
    if ([1, 2, 3, 4, 5].includes(date.day())) {
      completions.push(makeCompletion(
        `done-${completions.length + 1}`,
        date.toISOString(),
        null,
      ));
    }
    date = date.add(1, 'day');
  }

  return completions;
}

describe('buildGoalPresentation', () => {
  it.each([
    ['reading_habit', makeTask(), makeGoal()],
    [
      'habit',
      makeTask({ name: '每天整理書包' }),
      makeGoal({ goal_type: 'habit' }),
    ],
    [
      'skill',
      makeTask({ name: '鋼琴家之路', long_term_type: 'skill' }),
      makeGoal({ goal_type: 'skill' }),
    ],
    [
      'challenge',
      makeTask({ name: '自主閱讀挑戰', long_term_type: 'challenge' }),
      makeGoal({ goal_type: 'challenge' }),
    ],
    [
      'family',
      makeTask({ name: '一起整理客廳', long_term_type: 'responsibility' }),
      makeGoal({ goal_type: 'responsibility' }),
    ],
  ] as const)(
    'exposes the stable %s goal kind independently from display labels',
    (expectedKind, task, goal) => {
      const result = buildGoalPresentation(
        task,
        goal,
        [],
        dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
      );

      expect(result.goalKind).toBe(expectedKind);
      expect(result.planState).toBe('active');
    },
  );

  it.each([
    ['active scheduled', makeTask(), makeGoal(), '2026-07-30T12:00:00', 'active'],
    ['active rest day', makeTask(), makeGoal(), '2026-08-01T12:00:00', 'active'],
    [
      'upcoming',
      makeTask(),
      makeGoal({ started_at: '2026-08-03' }),
      '2026-07-30T12:00:00',
      'upcoming',
    ],
    [
      'paused',
      makeTask(),
      makeGoal({ status: 'paused' }),
      '2026-07-30T12:00:00',
      'paused',
    ],
    [
      'completed',
      makeTask(),
      makeGoal({ status: 'completed' }),
      '2026-07-30T12:00:00',
      'completed',
    ],
    [
      'expired',
      makeTask({ due_date: '2026-07-29' }),
      makeGoal(),
      '2026-07-30T12:00:00',
      'expired',
    ],
    [
      'unplanned',
      makeTask({ recurrence_days: [] }),
      makeGoal({ active_days: [] }),
      '2026-07-30T12:00:00',
      'unplanned',
    ],
    [
      'active skill',
      makeTask({ name: '鋼琴家之路', long_term_type: 'skill' }),
      makeGoal({ goal_type: 'skill' }),
      '2026-07-30T12:00:00',
      'active',
    ],
    [
      'active challenge',
      makeTask({ name: '自主閱讀挑戰', long_term_type: 'challenge' }),
      makeGoal({
        goal_type: 'challenge',
        current_value: 25,
        target_value: 100,
        value_unit: '頁',
      }),
      '2026-07-30T12:00:00',
      'active',
    ],
  ] as const)(
    'derives the stable plan state for %s',
    (_label, task, goal, currentTime, expectedState) => {
      const result = buildGoalPresentation(
        task,
        goal,
        [],
        dayjs.tz(currentTime, 'Asia/Taipei'),
      );

      expect(result.planState).toBe(expectedState);
    },
  );

  it('treats a reached target as completed before status synchronization', () => {
    const completions = makeScheduledCompletions(20);

    const result = buildGoalPresentation(
      makeTask(),
      makeGoal(),
      completions,
      dayjs.tz('2026-08-21T20:00:00', 'Asia/Taipei'),
    );

    expect(result.planState).toBe('completed');
  });

  it.each([
    [
      'paused',
      makeTask({ due_date: '2026-08-09' }),
      makeGoal({ status: 'paused' }),
    ],
    [
      'completed',
      makeTask({ due_date: '2026-08-09' }),
      makeGoal({ status: 'completed' }),
    ],
    [
      'upcoming',
      makeTask({ due_date: '2026-08-09' }),
      makeGoal({ started_at: '2026-08-03' }),
    ],
    ['expired', makeTask({ due_date: '2026-07-29' }), makeGoal()],
  ] as const)(
    'suppresses capacity notices for a %s plan',
    (_label, task, goal) => {
      const result = buildGoalPresentation(
        task,
        goal,
        [],
        dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
      );

      expect(result.planNotice).toBeNull();
    },
  );

  it('models the reading demo with week-first progress and a truthful seven-day schedule', () => {
    const result = buildGoalPresentation(
      makeTask(),
      makeGoal(),
      [
        makeCompletion('c1', '2026-07-27T19:00:00+08:00', 'reminded'),
        makeCompletion('c2', '2026-07-28T19:00:00+08:00', 'self_started'),
        makeCompletion('c3', '2026-07-29T19:00:00+08:00', 'self_started'),
      ],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.headerTitle).toBe('自主閱讀計畫');
    expect(result.overallLabel).toBe('3 / 20 次');
    expect(result.overallPercent).toBe(15);
    expect(result.planWeekLabel).toBe('第 1 週／共 4 週');
    expect(result.weekProgressLabel).toBe('本週完成 3／5 次');
    expect(result.weekCompleted).toBe(3);
    expect(result.weekTarget).toBe(5);
    expect(result.totalWeeks).toBe(4);
    expect(result.weekDays).toHaveLength(7);
    expect(result.weekDays.map((day) => day.state)).toEqual([
      'completed',
      'completed',
      'completed',
      'today',
      'upcoming',
      'unscheduled',
      'unscheduled',
    ]);
    expect(result.weekDays[0]).toEqual({
      day: 1,
      label: '一',
      isoDate: '2026-07-27',
      isScheduled: true,
      state: 'completed',
    });
    expect(result.todayAction).toBe('自己選一本喜歡的書，閱讀 15 分鐘');
    expect(result.weekSummary).toBe(
      '這週已閱讀 3 次。少一天沒有關係，找到適合自己的節奏更重要。',
    );
    expect(result.weekSummary).not.toContain('自己開始');
    expect(result.nextReward).toBeNull();
    expect(result.milestones).toEqual([]);
    expect(result.nextText).toBe('今天繼續就好，已完成的閱讀都會保留');
    expect(result.canCompleteToday).toBe(true);
    expect(result.todayStatusText).toBeNull();
    expect(result.planNotice).toBeNull();
    expect(result.isReadingPlan).toBe(true);
  });

  it('marks only the real recurrence days as scheduled', () => {
    const result = buildGoalPresentation(
      makeTask({ recurrence_days: [2, 4] }),
      makeGoal({ active_days: [2, 4], total_days: 8 }),
      [],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.weekDays.map((day) => [day.day, day.state])).toEqual([
      [1, 'unscheduled'],
      [2, 'missed'],
      [3, 'unscheduled'],
      [4, 'today'],
      [5, 'unscheduled'],
      [6, 'unscheduled'],
      [0, 'unscheduled'],
    ]);
    expect(result.weekDays.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.isoDate))).toBe(
      true,
    );
  });

  it('shows a real 3/4 weekly rhythm without hard-coded demo progress', () => {
    const result = buildGoalPresentation(
      makeTask({ recurrence_days: [1, 2, 4, 5] }),
      makeGoal({ active_days: [1, 2, 4, 5], total_days: 16 }),
      [
        makeCompletion('monday', '2026-08-03T19:00:00+08:00', null),
        makeCompletion('tuesday', '2026-08-04T19:00:00+08:00', null),
        makeCompletion('thursday', '2026-08-06T19:00:00+08:00', null),
      ],
      dayjs.tz('2026-08-07T12:00:00', 'Asia/Taipei'),
    );

    expect(result.weekCompleted).toBe(3);
    expect(result.weekTarget).toBe(4);
    expect(result.weekProgressLabel).toBe('本週完成 3／4 次');
    expect(result.overallLabel).toBe('3 / 16 次');
  });

  it('keeps completed progress when a scheduled day in the middle was missed', () => {
    const result = buildGoalPresentation(
      makeTask(),
      makeGoal(),
      [
        makeCompletion('monday', '2026-08-03T19:00:00+08:00', null),
        makeCompletion('wednesday', '2026-08-05T19:00:00+08:00', null),
        makeCompletion('thursday', '2026-08-06T19:00:00+08:00', null),
      ],
      dayjs.tz('2026-08-07T12:00:00', 'Asia/Taipei'),
    );

    expect(result.weekDays.find((day) => day.day === 2)?.state).toBe('missed');
    expect(result.weekCompleted).toBe(3);
    expect(result.overallLabel).toBe('3 / 20 次');
    expect(result.weekSummary).toContain('少一天沒有關係');
    expect(`${result.focusText} ${result.nextText} ${result.weekSummary}`)
      .not.toMatch(/失敗|歸零|重新開始|streak/i);
  });

  it('counts only unique scheduled Taipei dates inside inclusive plan boundaries', () => {
    const result = buildGoalPresentation(
      makeTask({ due_date: null }),
      makeGoal({
        started_at: '2026-07-28',
        end_date: '2026-07-30',
        total_days: 3,
      }),
      [
        makeCompletion('before-start', '2026-07-27T19:00:00+08:00', null),
        makeCompletion('start', '2026-07-28T00:30:00+08:00', null),
        makeCompletion('start-duplicate', '2026-07-27T17:30:00Z', null),
        makeCompletion('end', '2026-07-30T23:30:00+08:00', null),
        makeCompletion('after-end', '2026-07-31T00:30:00+08:00', null),
        makeCompletion('weekend', '2026-08-01T12:00:00+08:00', null),
      ],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.overallLabel).toBe('2 / 3 次');
    expect(result.weekCompleted).toBe(2);
    expect(result.weekTarget).toBe(3);
    expect(result.planPeriodLabel).toBe('2026-07-28 ～ 2026-07-30（共 1 週）');
    expect(result.weekDays.map((day) => day.state)).toEqual([
      'unscheduled',
      'completed',
      'missed',
      'completed',
      'unscheduled',
      'unscheduled',
      'unscheduled',
    ]);
  });

  it('keeps reading milestones hidden while retaining real records and plan details', () => {
    const result = buildGoalPresentation(
      makeTask(),
      makeGoal(),
      [
        makeCompletion('c1', '2026-07-27T19:00:00+08:00', 'reminded'),
        makeCompletion('c2', '2026-07-28T22:00:00+08:00', 'self_started', 'before_bed'),
        makeCompletion('c3', '2026-07-29T19:00:00+08:00', null),
        makeCompletion('older', '2026-07-20T19:00:00+08:00', null),
      ],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.milestones).toEqual([]);
    expect(result.nextReward).toBeNull();
    expect(result.recentRecords).toEqual([
      {
        id: 'c3',
        dateLabel: '2026/07/29',
        detail: '15 分鐘',
        timeWindowLabel: '晚餐後',
      },
      {
        id: 'c2',
        dateLabel: '2026/07/28',
        detail: '15 分鐘',
        timeWindowLabel: '睡前',
      },
      {
        id: 'c1',
        dateLabel: '2026/07/27',
        detail: '15 分鐘',
        timeWindowLabel: '晚餐後',
      },
    ]);
    expect(result.planPeriodLabel).toBe('2026-07-27 ～ 2026-08-23（共 4 週）');
    expect(result.completionConditionLabel).toBe('完成 20 次');
    expect(result.adjustableItemsLabel).toBe('閱讀時段、每週次數、閱讀方式或內容');
    expect(JSON.stringify(result.recentRecords)).not.toContain('self_started');
  });

  it('does not infer reading checkpoint completion from current_day or completion rows', () => {
    const result = buildGoalPresentation(
      makeTask(),
      makeGoal({ current_day: 5, checkpoint_rewards: { '1': 10, '5': 20 } }),
      [makeCompletion('c1', '2026-07-27T19:00:00+08:00', null)],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.milestones).toEqual([]);
    expect(result.nextReward).toBeNull();
    expect(result.nextText).not.toMatch(/里程碑|回饋已記下|成長幣/);
  });

  it('uses an honest reading fallback when no reliable next-step note exists', () => {
    const result = buildGoalPresentation(
      makeTask({ name: '親子閱讀時間' }),
      makeGoal({ motivation_note: '   ' }),
      [],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.todayAction).toBe('親子閱讀時間 15 分鐘，今天繼續就好');
    expect(result.todayAction).not.toMatch(/里程碑|第 \d+ 次/);
  });

  it('uses the same section structure for a skill goal', () => {
    const result = buildGoalPresentation(
      makeTask({
        id: 'task-piano',
        name: '閱讀技能進階',
        long_term_type: 'skill',
        base_time_min: 20,
        recurrence_days: null,
      }),
      makeGoal({
        id: 'goal-piano',
        task_id: 'task-piano',
        goal_type: 'skill',
        total_days: 120,
        current_day: 0,
        checkpoint_rewards: null,
        active_days: null,
        preferred_time_window: null,
        current_level: 2,
        level_count: 4,
        level_definitions: [
          { id: '1', name: '基礎指法', coin: 10 },
          { id: '2', name: '簡單曲目', coin: 20 },
          { id: '3', name: '雙手合奏', coin: 30 },
          { id: '4', name: '完整演奏', coin: 40 },
        ],
      }),
      [],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.headerTitle).toBe('閱讀技能進階');
    expect(result.overallLabel).toBe('第 2 / 4 階段');
    expect(result.focusText).toBe('目前階段：雙手合奏');
    expect(result.todayAction).toBe('這一階段先練習：雙手合奏');
    expect(result.weekTarget).toBe(0);
    expect(result.weekProgressLabel).toBe('依自己的節奏練習');
    expect(result.sectionOrder).toEqual(['hero', 'today', 'week', 'rewards', 'review']);
    expect(result.weekDays).toHaveLength(7);
    expect(result.weekDays.every((day) => day.state === 'unscheduled')).toBe(true);
    expect(result.weekSummary).not.toContain('0／7');
    expect(result.nextReward).toEqual({ threshold: 3, coin: 30 });
    expect(result.milestones).toEqual([
      {
        id: 'skill-level-1',
        title: '基礎指法',
        detail: '成長幣 +10',
        status: 'completed',
      },
      {
        id: 'skill-level-2',
        title: '簡單曲目',
        detail: '成長幣 +20',
        status: 'completed',
      },
      {
        id: 'skill-level-3',
        title: '雙手合奏',
        detail: '成長幣 +30',
        status: 'next',
      },
      {
        id: 'skill-level-4',
        title: '完整演奏',
        detail: '成長幣 +40',
        status: 'upcoming',
      },
      {
        id: 'final-review',
        title: '完成計畫後一起回顧',
        detail: '可以繼續、調整，或讓計畫先告一段落。',
        status: 'upcoming',
      },
    ]);
    expect(result.canCompleteToday).toBe(false);
    expect(result.todayTitle).toBe('目前階段');
    expect(result.todayStatusText).toBe('這個階段由家長確認完成');
    expect(result.isReadingPlan).toBe(false);
  });

  it('uses challenge values consistently for progress and completion meaning', () => {
    const result = buildGoalPresentation(
      makeTask({
        id: 'task-pages',
        name: '閱讀一百頁',
        long_term_type: 'challenge',
      }),
      makeGoal({
        id: 'goal-pages',
        task_id: 'task-pages',
        goal_type: 'challenge',
        target_value: 100,
        current_value: 25,
        value_unit: '頁',
        checkpoint_rewards: null,
      }),
      [makeCompletion('c1', '2026-07-27T19:00:00+08:00', null)],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.overallLabel).toBe('25 / 100 頁');
    expect(result.overallPercent).toBe(25);
    expect(result.completionConditionLabel).toBe('累積 100 頁');
    expect(result.focusText).toBe('目前已累積 25 頁');
    expect(result.todayTitle).toBe('目前的累積進度');
    expect(result.todayAction).toBe('已累積 25 頁，由家長確認後更新');
    expect(result.weekSummary).toBe('累積進度會在家長確認後更新。');
    expect(result.milestones[0].title).toBe('已累積 25 頁');
    expect(result.milestones[result.milestones.length - 1].title).toBe('達到 100 頁');
    expect(result.categoryLabel).toBe('自主挑戰');
    expect(result.canCompleteToday).toBe(false);
    expect(result.todayStatusText).toBe('累積進度由家長一起確認');
    expect(result.weekTarget).toBe(0);
    expect(result.weekDays.every((day) => day.state === 'unscheduled')).toBe(true);
    expect(result.isReadingPlan).toBe(false);
  });

  it('labels a non-reading challenge as an autonomous challenge', () => {
    const result = buildGoalPresentation(
      makeTask({
        id: 'task-steps',
        name: '累積走路里程',
        long_term_type: 'challenge',
      }),
      makeGoal({
        id: 'goal-steps',
        task_id: 'task-steps',
        goal_type: 'challenge',
        target_value: 20,
        current_value: 8,
        value_unit: '公里',
      }),
      [],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.categoryLabel).toBe('自主挑戰');
    expect(result.overallLabel).toBe('8 / 20 公里');
    expect(result.canCompleteToday).toBe(false);
    expect(result.weekTarget).toBe(0);
  });

  it('derives a challenge period and current week from total days without daily check-ins', () => {
    const result = buildGoalPresentation(
      makeTask({
        id: 'task-distance',
        name: '累積走路里程',
        long_term_type: 'challenge',
        due_date: null,
      }),
      makeGoal({
        id: 'goal-distance',
        task_id: 'task-distance',
        goal_type: 'challenge',
        total_days: 20,
        current_value: 8,
        target_value: 20,
        value_unit: '公里',
        active_days: [1, 3, 5],
      }),
      [],
      dayjs.tz('2026-08-04T12:00:00', 'Asia/Taipei'),
    );

    expect(result.totalWeeks).toBe(3);
    expect(result.planWeekLabel).toBe('第 2 週／共 3 週');
    expect(result.planPeriodLabel).toBe('2026-07-27 ～ 2026-08-15（共 3 週）');
    expect(result.weekProgressLabel).toBe('累積進度由家長確認');
    expect(result.weekTarget).toBe(0);
    expect(result.weekDays.every((day) => day.state === 'unscheduled')).toBe(true);
    expect(result.canCompleteToday).toBe(false);
  });

  it('falls back to completion counts when challenge values are incomplete', () => {
    const result = buildGoalPresentation(
      makeTask({
        id: 'task-pages',
        name: '閱讀挑戰',
        long_term_type: 'challenge',
      }),
      makeGoal({
        id: 'goal-pages',
        task_id: 'task-pages',
        goal_type: 'challenge',
        target_value: 100,
        current_value: null,
        value_unit: '頁',
        checkpoint_rewards: null,
      }),
      [
        makeCompletion('c1', '2026-07-27T19:00:00+08:00', null),
        makeCompletion('c2', '2026-07-28T19:00:00+08:00', null),
      ],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.overallLabel).toBe('2 / 20 次');
    expect(result.overallPercent).toBe(10);
    expect(result.completionConditionLabel).toBe('完成 20 次');
  });

  it('deduplicates weekly completions by Taipei date and excludes unscheduled days', () => {
    const result = buildGoalPresentation(
      makeTask({ recurrence_days: [1, 4] }),
      makeGoal({ active_days: [1, 4], total_days: 8 }),
      [
        makeCompletion('monday-early', '2026-07-26T16:30:00Z', null),
        makeCompletion('monday-late', '2026-07-27T12:00:00Z', null),
        makeCompletion('tuesday-off', '2026-07-28T12:00:00Z', null),
        makeCompletion('thursday', '2026-07-30T01:00:00Z', null),
      ],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.weekCompleted).toBe(2);
    expect(result.weekTarget).toBe(2);
    expect(result.weekProgressLabel).toBe('本週完成 2／2 次');
    expect(result.weekSummary).toBe(
      '這週已閱讀 2 次。少一天沒有關係，找到適合自己的節奏更重要。',
    );
    expect(result.weekDays.find((day) => day.day === 1)?.state).toBe('completed');
    expect(result.weekDays.find((day) => day.day === 2)?.state).toBe('unscheduled');
    expect(result.weekDays.find((day) => day.day === 4)?.state).toBe('completed');
    expect(result.recentRecords).toHaveLength(3);
  });

  it('uses the due date to derive one consistent covered-week count', () => {
    const result = buildGoalPresentation(
      makeTask({ due_date: '2026-08-09' }),
      makeGoal({ started_at: '2026-07-27', total_days: 20 }),
      [makeCompletion('c1', '2026-07-27T19:00:00+08:00', null)],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.totalWeeks).toBe(2);
    expect(result.planWeekLabel).toBe('第 1 週／共 2 週');
    expect(result.planPeriodLabel).toBe('2026-07-27 ～ 2026-08-09（共 2 週）');
    expect(result.planNotice).toBe(
      '目前期間最多安排 10 次，和 20 次目標不一致，可以和家人一起調整。',
    );
    expect(result.finalRewardText).toBe(
      '第 2 週結束後一起回顧，可以繼續、調整閱讀方式，或讓計畫先告一段落',
    );
  });

  it('ignores a due date earlier than the goal start date', () => {
    const result = buildGoalPresentation(
      makeTask({ due_date: '2026-07-20' }),
      makeGoal({ started_at: '2026-07-27', total_days: 20 }),
      [],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.totalWeeks).toBe(4);
    expect(result.planWeekLabel).toBe('第 1 週／共 4 週');
    expect(result.planPeriodLabel).toBe('2026-07-27 ～ 2026-08-23（共 4 週）');
  });

  it('keeps family goals on the shared presentation skeleton', () => {
    const result = buildGoalPresentation(
      makeTask({
        id: 'task-family',
        name: '一起整理餐桌',
        long_term_type: 'responsibility',
        recurrence_days: [6],
      }),
      makeGoal({
        id: 'goal-family',
        task_id: 'task-family',
        goal_type: 'responsibility',
        total_days: 4,
        active_days: [6],
        target_completions: 4,
        checkpoint_rewards: null,
      }),
      [],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.categoryLabel).toBe('家庭參與');
    expect(result.weekTarget).toBe(1);
    expect(result.totalWeeks).toBe(4);
    expect(result.weekDays).toHaveLength(7);
    expect(result.sectionOrder).toEqual(['hero', 'today', 'week', 'rewards', 'review']);
  });

  it('does not offer completion on a rest day', () => {
    const result = buildGoalPresentation(
      makeTask(),
      makeGoal(),
      [],
      dayjs.tz('2026-08-01T12:00:00', 'Asia/Taipei'),
    );

    expect(result.canCompleteToday).toBe(false);
    expect(result.todayTitle).toBe('今天不用記錄');
    expect(result.todayStatusText).toBe('今天不用記錄，照自己的節奏休息');
  });

  it('keeps habit checkpoint rewards as planned nodes without inferred completion state', () => {
    const completions = Array.from({ length: 5 }, (_, index) =>
      makeCompletion(
        `completion-${index + 1}`,
        `2026-07-${String(27 + index).padStart(2, '0')}T19:00:00+08:00`,
        null,
      ),
    );
    const beforeReward = buildGoalPresentation(
      makeTask({ name: '每天整理書包' }),
      makeGoal({ current_day: 3 }),
      completions,
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );
    const afterReward = buildGoalPresentation(
      makeTask({ name: '每天整理書包' }),
      makeGoal({ current_day: 5 }),
      completions.slice(0, 3),
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(beforeReward.overallLabel).toBe('5 / 20 次');
    expect(beforeReward.milestones.find((item) => item.id === 'checkpoint-5')).toEqual({
      id: 'checkpoint-5',
      title: '第 5 次的計畫節點',
      detail: '成長幣 +10（達成時一起確認）',
      status: 'planned',
    });
    expect(beforeReward.nextReward).toBeNull();
    expect(beforeReward.nextText).toBe('下一次繼續完成「每天整理書包」就好');
    expect(afterReward.overallLabel).toBe('3 / 20 次');
    expect(afterReward.milestones.find((item) => item.id === 'checkpoint-5')).toEqual({
      id: 'checkpoint-5',
      title: '第 5 次的計畫節點',
      detail: '成長幣 +10（達成時一起確認）',
      status: 'planned',
    });
    expect(afterReward.nextReward).toBeNull();
    expect(afterReward.milestones.some((item) => item.status === 'completed')).toBe(false);
  });

  it('keeps family checkpoint rewards visible as plans without using current_day', () => {
    const result = buildGoalPresentation(
      makeTask({
        id: 'task-family-checkpoint',
        name: '一起整理餐桌',
        long_term_type: 'responsibility',
        recurrence_days: [1],
      }),
      makeGoal({
        id: 'goal-family-checkpoint',
        task_id: 'task-family-checkpoint',
        goal_type: 'responsibility',
        current_day: 5,
        active_days: [1],
        target_completions: 4,
        checkpoint_rewards: { '1': 10, '5': 20 },
      }),
      [makeCompletion('first-effort', '2026-07-27T19:00:00+08:00', null)],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.milestones.filter((item) => item.id.startsWith('checkpoint-')))
      .toEqual([
        {
          id: 'checkpoint-1',
          title: '第 1 次的計畫節點',
          detail: '成長幣 +10（達成時一起確認）',
          status: 'planned',
        },
        {
          id: 'checkpoint-5',
          title: '第 5 次的計畫節點',
          detail: '成長幣 +20（達成時一起確認）',
          status: 'planned',
        },
      ]);
    expect(result.nextReward).toBeNull();
    expect(result.milestones.some((item) => item.status === 'completed')).toBe(false);
  });

  it.each([
    ['paused', makeGoal({ status: 'paused' }), [], '計畫暫停中', '這個計畫暫停中'],
    [
      'completed',
      makeGoal({ status: 'completed' }),
      [],
      '這段計畫已完成',
      '這段計畫已完成',
    ],
    ['future', makeGoal({ started_at: '2026-07-31' }), [], '計畫還沒開始', '計畫還沒開始'],
    [
      'expired',
      makeGoal(),
      [],
      '一起回顧這段計畫',
      '一起回顧這段計畫',
      makeTask({ due_date: '2026-07-29' }),
    ],
    [
      'target reached',
      makeGoal({ current_day: 20, started_at: '2026-06-29' }),
      makeScheduledCompletions(20, '2026-06-29T19:00:00'),
      '這段計畫已完成',
      '這段計畫已完成',
    ],
  ] as const)(
    'does not offer child completion when the goal is %s',
    (_label, goal, completions, expectedTitle, expectedStatus, task = makeTask()) => {
      const result = buildGoalPresentation(
        task,
        goal,
        [...completions],
        dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
      );

      expect(result.canCompleteToday).toBe(false);
      expect(result.todayTitle).toBe(expectedTitle);
      expect(result.todayStatusText).toBe(expectedStatus);
    },
  );

  it('counts only scheduled dates inside a partial first week', () => {
    const result = buildGoalPresentation(
      makeTask(),
      makeGoal({ started_at: '2026-07-30' }),
      [],
      dayjs.tz('2026-07-31T12:00:00', 'Asia/Taipei'),
    );

    expect(result.weekTarget).toBe(2);
    expect(result.weekProgressLabel).toBe('本週完成 0／2 次');
    expect(result.weekDays.map((day) => day.state)).toEqual([
      'unscheduled',
      'unscheduled',
      'unscheduled',
      'missed',
      'today',
      'unscheduled',
      'unscheduled',
    ]);
  });

  it('marks dates after the effective end date as unscheduled', () => {
    const result = buildGoalPresentation(
      makeTask({ due_date: '2026-07-29' }),
      makeGoal(),
      [],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.weekTarget).toBe(3);
    expect(result.weekDays.map((day) => day.state)).toEqual([
      'missed',
      'missed',
      'missed',
      'unscheduled',
      'unscheduled',
      'unscheduled',
      'unscheduled',
    ]);
    expect(result.canCompleteToday).toBe(false);
  });

  it('uses the current plan week in reading focus copy', () => {
    const result = buildGoalPresentation(
      makeTask(),
      makeGoal(),
      [makeCompletion('week-one', '2026-07-27T19:00:00+08:00', null)],
      dayjs.tz('2026-08-03T12:00:00', 'Asia/Taipei'),
    );

    expect(result.planWeekLabel).toBe('第 2 週／共 4 週');
    expect(result.weekLabel).toBe('第 2 週');
    expect(result.focusText).toBe('第 2 週：繼續找到適合自己的閱讀節奏');
  });

  it.each([
    ['habit', makeTask(), makeGoal()],
    [
      'family',
      makeTask({
        id: 'task-family-empty',
        name: '一起整理餐桌',
        long_term_type: 'responsibility',
      }),
      makeGoal({
        id: 'goal-family-empty',
        task_id: 'task-family-empty',
        goal_type: 'responsibility',
        target_completions: 20,
      }),
    ],
  ] as const)(
    'treats an explicit empty %s schedule as not arranged',
    (_type, task, goal) => {
      const result = buildGoalPresentation(
        task,
        { ...goal, active_days: [] },
        [],
        dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
      );

      expect(result.weekTarget).toBe(0);
      expect(result.weekProgressLabel).toBe('本週尚未安排日期');
      expect(result.totalWeeks).toBe(0);
      expect(result.planWeekLabel).toBe('尚未安排週期');
      expect(result.weekLabel).toBe('尚未安排週期');
      expect(result.planPeriodLabel).toBe('2026-07-27 ～ 尚未安排執行日期');
      expect(result.focusText).toBe('先和家人一起安排適合的執行日期');
      if (result.goalKind === 'reading_habit') {
        expect(result.milestones).toEqual([]);
      } else {
        expect(result.milestones.at(-1)?.title).toBe('安排好週期後一起回顧');
      }
      expect(result.finalRewardText).toBe('安排好週期後，再一起回顧這段計畫');
      expect(result.weekDays.every((day) => day.state === 'unscheduled')).toBe(true);
      expect(result.canCompleteToday).toBe(false);
      expect(result.todayTitle).toBe('尚未安排日期');
      expect(result.todayStatusText).toBe('這個計畫尚未安排日期');
    },
  );

  it('uses a valid due date to derive weeks for an otherwise empty schedule', () => {
    const result = buildGoalPresentation(
      makeTask({ due_date: '2026-08-09' }),
      makeGoal({ active_days: [] }),
      [],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.totalWeeks).toBe(2);
    expect(result.planWeekLabel).toBe('第 1 週／共 2 週');
    expect(result.planPeriodLabel).toBe('2026-07-27 ～ 2026-08-09（共 2 週）');
  });

  it('ignores configured daily recurrence for skill and challenge goals', () => {
    const skill = buildGoalPresentation(
      makeTask({
        id: 'skill-scheduled',
        name: '鋼琴階段',
        long_term_type: 'skill',
        recurrence_days: [1, 3, 5],
      }),
      makeGoal({
        id: 'skill-scheduled-goal',
        task_id: 'skill-scheduled',
        goal_type: 'skill',
        active_days: [2, 4],
        current_level: 1,
        level_count: 2,
        level_definitions: [{ id: '1', name: '第一階段' }, { id: '2', name: '第二階段' }],
      }),
      [],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );
    const challenge = buildGoalPresentation(
      makeTask({
        id: 'challenge-scheduled',
        name: '步行挑戰',
        long_term_type: 'challenge',
        recurrence_days: [1, 3, 5],
      }),
      makeGoal({
        id: 'challenge-scheduled-goal',
        task_id: 'challenge-scheduled',
        goal_type: 'challenge',
        active_days: [2, 4],
        current_value: 4,
        target_value: 20,
        value_unit: '公里',
      }),
      [],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    for (const result of [skill, challenge]) {
      expect(result.weekTarget).toBe(0);
      expect(result.weekDays.every((day) => day.state === 'unscheduled')).toBe(true);
      expect(result.canCompleteToday).toBe(false);
    }
  });

  it('uses exact total days for a skill plan without a due date', () => {
    const result = buildGoalPresentation(
      makeTask({
        id: 'skill-period',
        name: '鋼琴四階段',
        long_term_type: 'skill',
        recurrence_days: null,
      }),
      makeGoal({
        id: 'skill-period-goal',
        task_id: 'skill-period',
        goal_type: 'skill',
        total_days: 120,
        active_days: null,
        current_level: 1,
        level_count: 4,
      }),
      [],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.totalWeeks).toBe(18);
    expect(result.planPeriodLabel).toBe('2026-07-27 ～ 2026-11-23（共 18 週）');
  });

  it('uses Taipei calendar days for zoned start and end timestamps through 23:59', () => {
    const result = buildGoalPresentation(
      makeTask({ due_date: '2026-07-31T23:59:59+08:00' }),
      makeGoal({ started_at: '2026-07-27T23:30:00-04:00' }),
      [],
      dayjs.tz('2026-07-31T23:59:59', 'Asia/Taipei'),
    );

    expect(result.planPeriodLabel).toBe('2026-07-28 ～ 2026-07-31（共 1 週）');
    expect(result.weekTarget).toBe(4);
    expect(result.weekDays.map((day) => day.state)).toEqual([
      'unscheduled',
      'missed',
      'missed',
      'missed',
      'today',
      'unscheduled',
      'unscheduled',
    ]);
    expect(result.canCompleteToday).toBe(true);
  });

  it('falls back to created_at when plan dates are invalid', () => {
    const result = buildGoalPresentation(
      makeTask({ due_date: 'not-a-date' }),
      makeGoal({ started_at: 'not-a-date' }),
      [],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.planPeriodLabel).toBe('2026-07-27 ～ 2026-08-23（共 4 週）');
    expect(result.totalWeeks).toBe(4);
    expect(result.weekTarget).toBe(5);
    expect(result.canCompleteToday).toBe(true);
    expect(result.planNotice).toBeNull();
  });
});
