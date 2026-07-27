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
): GoalCompletionRecord {
  return {
    id,
    completed_at: completedAt,
    planned_time_window: 'after_dinner',
    start_mode: startMode,
  };
}

describe('buildGoalPresentation', () => {
  it('models the reading demo as 20 sessions across four weeks', () => {
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
    expect(result.todayAction).toBe('自己選一本喜歡的書，閱讀 15 分鐘');
    expect(result.weekSummary).toBe('這週已閱讀 3 次，其中 2 次是自己開始的。');
    expect(result.nextReward).toEqual({ threshold: 5, coin: 10 });
    expect(result.canCompleteToday).toBe(true);
  });

  it('uses the same section structure for a skill goal', () => {
    const result = buildGoalPresentation(
      makeTask({
        id: 'task-piano',
        name: '鋼琴家之路',
        long_term_type: 'skill',
        base_time_min: 20,
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

    expect(result.headerTitle).toBe('鋼琴家之路');
    expect(result.overallLabel).toBe('第 2 / 4 階段');
    expect(result.focusText).toBe('目前階段：雙手合奏');
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
});
