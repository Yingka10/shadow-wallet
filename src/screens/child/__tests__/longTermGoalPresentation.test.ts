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

describe('buildGoalPresentation', () => {
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
    expect(result.nextReward).toEqual({ threshold: 5, coin: 10 });
    expect(result.nextText).toBe('下一個里程碑：完成第 5 次');
    expect(result.nextText).not.toContain('下一站');
    expect(result.canCompleteToday).toBe(true);
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

  it('derives milestones, recent records, and plan details only from real data', () => {
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

    expect(result.milestones).toEqual([
      {
        id: 'start',
        title: '完成第 1 次',
        detail: null,
        status: 'completed',
      },
      {
        id: 'checkpoint-5',
        title: '完成第 5 次',
        detail: '成長幣 +10',
        status: 'next',
      },
      {
        id: 'final-review',
        title: '四週後一起回顧',
        detail: '可以繼續、調整，或讓計畫先告一段落。',
        status: 'upcoming',
      },
    ]);
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

  it('preserves a real first-completion checkpoint reward in the starting milestone', () => {
    const result = buildGoalPresentation(
      makeTask(),
      makeGoal({ checkpoint_rewards: { '1': 10, '5': 20 } }),
      [makeCompletion('c1', '2026-07-27T19:00:00+08:00', null)],
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(result.milestones[0]).toEqual({
      id: 'start',
      title: '完成第 1 次',
      detail: '成長幣 +10',
      status: 'completed',
    });
    expect(result.milestones.filter((milestone) => milestone.title === '完成第 1 次')).toHaveLength(
      1,
    );
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
        long_term_type: 'family',
        recurrence_days: [6],
      }),
      makeGoal({
        id: 'goal-family',
        task_id: 'task-family',
        goal_type: 'family',
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
    expect(result.todayTitle).toBe('今天是休息日');
  });

  it('uses the checkpoint counter instead of completion rows for reward status', () => {
    const completions = Array.from({ length: 5 }, (_, index) =>
      makeCompletion(
        `completion-${index + 1}`,
        `2026-07-${String(27 + index).padStart(2, '0')}T19:00:00+08:00`,
        null,
      ),
    );
    const beforeReward = buildGoalPresentation(
      makeTask(),
      makeGoal({ current_day: 3 }),
      completions,
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );
    const afterReward = buildGoalPresentation(
      makeTask(),
      makeGoal({ current_day: 5 }),
      completions.slice(0, 3),
      dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
    );

    expect(beforeReward.overallLabel).toBe('5 / 20 次');
    expect(beforeReward.milestones.find((item) => item.id === 'checkpoint-5')?.status).toBe(
      'next',
    );
    expect(beforeReward.nextReward).toEqual({ threshold: 5, coin: 10 });
    expect(afterReward.overallLabel).toBe('3 / 20 次');
    expect(afterReward.milestones.find((item) => item.id === 'checkpoint-5')?.status).toBe(
      'completed',
    );
    expect(afterReward.nextReward).toBeNull();
  });

  it.each([
    ['paused', makeGoal({ status: 'paused' }), []],
    ['completed', makeGoal({ status: 'completed' }), []],
    ['future', makeGoal({ started_at: '2026-07-31' }), []],
    ['expired', makeGoal(), [], makeTask({ due_date: '2026-07-29' })],
    [
      'target reached',
      makeGoal({ current_day: 20 }),
      Array.from({ length: 20 }, (_, index) =>
        makeCompletion(
          `done-${index}`,
          `2026-07-27T${String(index).padStart(2, '0')}:00:00+08:00`,
          null,
        ),
      ),
    ],
  ] as const)(
    'does not offer child completion when the goal is %s',
    (_label, goal, completions, task = makeTask()) => {
      const result = buildGoalPresentation(
        task,
        goal,
        [...completions],
        dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
      );

      expect(result.canCompleteToday).toBe(false);
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
});
