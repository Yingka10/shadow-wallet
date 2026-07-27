import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { webMouseDraggableScroll } from '../../../constants/webStyles';

const mockGoBack = jest.fn();
const mockCompleteTask = jest.fn();
const mockRecordCompletionContext = jest.fn();
let mockMissingContextColumns = false;

let mockRouteParams = {
  goalId: 'goal-reading',
  taskId: 'task-reading',
  taskName: '自主閱讀計畫',
};

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: mockRouteParams }),
  useNavigation: () => ({
    goBack: mockGoBack,
    navigate: jest.fn(),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../lib/taskActions', () => ({
  completeTask: (...args: unknown[]) => mockCompleteTask(...args),
  recordCompletionContext: (...args: unknown[]) => mockRecordCompletionContext(...args),
}));

const mockBaseGoal = {
  id: 'goal-reading',
  child_id: 'child-1',
  task_id: 'task-reading',
  goal_type: 'habit',
  total_days: 20,
  current_day: 3,
  status: 'active',
  checkpoint_rewards: { '5': 10 },
  motivation_note: null,
  started_at: '2026-07-01',
  next_review_at: null,
  completed_at: null,
  created_at: '2026-07-01',
  min_age: 6,
  interrupt_count: 0,
  last_active_date: null,
  active_days: [1, 2, 3, 4, 5],
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
  preferred_time_window: 'after_dinner',
};

const mockSkillGoal = {
  ...mockBaseGoal,
  id: 'goal-skill',
  task_id: 'task-skill',
  goal_type: 'skill',
  total_days: 4,
  current_day: 0,
  checkpoint_rewards: null,
  active_days: null,
  preferred_time_window: null,
  level_definitions: [
    { id: 'level-1', name: '基礎指法', coin: 10 },
    { id: 'level-2', name: '簡單曲目', coin: 20 },
    { id: 'level-3', name: '雙手合奏', coin: 30 },
    { id: 'level-4', name: '完整演奏', coin: 40 },
  ],
  current_level: 2,
  level_count: 4,
};

const mockTasks = {
  'task-reading': {
    id: 'task-reading',
    family_id: 'family-1',
    name: '自主閱讀計畫',
    category: 'D',
    day_type: 'custom',
    is_long_term: true,
    long_term_type: 'habit',
    base_time_min: 15,
    difficulty: 1,
    coin_override: null,
    is_system_default: false,
    allow_repeat: true,
    min_age: 6,
    max_age: 9,
    time_saving_min: 0,
    recurrence_days: [1, 2, 3, 4, 5],
    due_date: null,
    created_at: '2026-07-01',
    is_active: true,
  },
  'task-skill': {
    id: 'task-skill',
    family_id: 'family-1',
    name: '鋼琴家之路',
    category: 'D',
    day_type: 'both',
    is_long_term: true,
    long_term_type: 'skill',
    base_time_min: 15,
    difficulty: 1,
    coin_override: null,
    is_system_default: false,
    allow_repeat: true,
    min_age: 6,
    max_age: 12,
    time_saving_min: 0,
    recurrence_days: null,
    due_date: null,
    created_at: '2026-07-01',
    is_active: true,
  },
};

const readingCompletions = [
  {
    id: 'completion-mon',
    completed_at: '2026-07-27T11:30:00.000Z',
    planned_time_window: 'after_dinner',
    start_mode: 'reminded',
  },
  {
    id: 'completion-tue',
    completed_at: '2026-07-28T11:20:00.000Z',
    planned_time_window: 'after_dinner',
    start_mode: 'self_started',
  },
  {
    id: 'completion-wed',
    completed_at: '2026-07-29T11:10:00.000Z',
    planned_time_window: 'after_dinner',
    start_mode: 'self_started',
  },
];

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      let selectedColumns = '*';
      const builder: any = {
        select: jest.fn((columns = '*') => {
          selectedColumns = columns;
          return builder;
        }),
        eq: jest.fn(() => builder),
        gte: jest.fn(() => builder),
        lt: jest.fn(() => builder),
        single: jest.fn(async () => {
          if (table === 'long_term_goals') {
            return {
              data: mockRouteParams.goalId === 'goal-skill' ? mockSkillGoal : mockBaseGoal,
              error: null,
            };
          }
          if (table === 'tasks') {
            return {
              data: mockTasks[mockRouteParams.taskId as keyof typeof mockTasks],
              error: null,
            };
          }
          return { data: null, error: null };
        }),
        order: jest.fn(async () => {
          if (
            table === 'task_completions'
            && mockMissingContextColumns
            && selectedColumns.includes('planned_time_window')
          ) {
            return {
              data: null,
              error: {
                code: '42703',
                message: 'column task_completions.planned_time_window does not exist',
              },
            };
          }

          const rows = mockRouteParams.goalId === 'goal-reading'
            ? readingCompletions
            : [];
          return {
            data: selectedColumns.includes('planned_time_window')
              ? rows
              : rows.map(({ id, completed_at }) => ({ id, completed_at })),
            error: null,
          };
        }),
      };
      return builder;
    }),
  },
}));

import LongTermDetailScreen from '../LongTermDetailScreen';

describe('LongTermDetailScreen', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-30T12:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {
      goalId: 'goal-reading',
      taskId: 'task-reading',
      taskName: '自主閱讀計畫',
    };
    mockMissingContextColumns = false;
    mockCompleteTask.mockResolvedValue({
      completionId: 'completion-thu',
      milestone: null,
    });
    mockRecordCompletionContext.mockResolvedValue(undefined);
  });

  it('renders the reading plan with total progress and meaningful weekly behavior', async () => {
    render(<LongTermDetailScreen />);

    expect(await screen.findByText('自主閱讀計畫')).toBeTruthy();
    expect(screen.getByText('3 / 20 次')).toBeTruthy();
    expect(screen.getByText('今天預計：晚餐後')).toBeTruthy();
    expect(screen.getByText(/這週已閱讀 3 次，其中 2 次是自己開始的。/)).toBeTruthy();
    expect(screen.getByTestId('goal-hero')).toBeTruthy();
    expect(screen.getByTestId('goal-rewards')).toBeTruthy();
  });

  it('keeps existing long-term tasks readable before context columns are migrated', async () => {
    mockMissingContextColumns = true;

    render(<LongTermDetailScreen />);

    expect(await screen.findByText('自主閱讀計畫')).toBeTruthy();
    expect(screen.getByText('3 / 20 次')).toBeTruthy();
    expect(screen.queryByText('讀取任務進度失敗，請稍後再試。')).toBeNull();
  });

  it('records the chosen schedule without asking how reading started', async () => {
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByText('完成今天閱讀'));

    await waitFor(() => {
      expect(mockRecordCompletionContext).toHaveBeenCalledWith(
        'completion-thu',
        'after_dinner',
        null,
      );
    });
    expect(screen.queryByText('開始閱讀前，有人提醒嗎？')).toBeNull();
    expect(screen.queryByText('我自己開始的')).toBeNull();
    expect(screen.queryByText('提醒後開始')).toBeNull();
  });

  it('keeps the bottom tab visible and applies mouse-friendly web scrolling', async () => {
    render(<LongTermDetailScreen />);

    expect(await screen.findByTestId('bottom-nav')).toBeTruthy();
    const scroll = screen.getByTestId('long-term-detail-scroll');
    expect(scroll.props.style).toEqual(expect.arrayContaining([webMouseDraggableScroll]));
  });

  it('renders skill goals with the same visual skeleton and no unsupported recording action', async () => {
    mockRouteParams = {
      goalId: 'goal-skill',
      taskId: 'task-skill',
      taskName: '鋼琴家之路',
    };

    render(<LongTermDetailScreen />);

    expect(await screen.findByText('鋼琴家之路')).toBeTruthy();
    expect(screen.getByText('第 2 / 4 階段')).toBeTruthy();
    expect(screen.getByTestId('goal-hero')).toBeTruthy();
    expect(screen.getByTestId('goal-today')).toBeTruthy();
    expect(screen.getByTestId('goal-week')).toBeTruthy();
    expect(screen.getByTestId('goal-rewards')).toBeTruthy();
    expect(screen.getByTestId('goal-review')).toBeTruthy();
    expect(screen.queryByText('錄一段給自己聽')).toBeNull();
  });
});
