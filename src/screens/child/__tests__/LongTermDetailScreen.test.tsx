import React from 'react';
import { Alert } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { webMouseDraggableScroll } from '../../../constants/webStyles';

const mockGoBack = jest.fn();
const mockCompleteTask = jest.fn();
const mockRecordCompletionContext = jest.fn();
const mockSupabaseUpdate = jest.fn();
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
  started_at: '2026-07-27',
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
        update: mockSupabaseUpdate.mockImplementation(() => builder),
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
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('renders week-first progress without self-start scoring', async () => {
    render(<LongTermDetailScreen />);

    expect(await screen.findByText('自主閱讀計畫')).toBeTruthy();
    expect(screen.getAllByText('第 1 週／共 4 週').length).toBeGreaterThan(0);
    expect(screen.getByText('本週完成 3／5 次')).toBeTruthy();
    expect(screen.getByText('今天預計：晚餐後')).toBeTruthy();
    expect(screen.getByText(/這週已閱讀 3 次。/)).toBeTruthy();
    expect(screen.queryByText(/自己開始/)).toBeNull();
    expect(screen.queryByText('3 / 20 次')).toBeNull();
    expect(screen.getByTestId('goal-hero')).toBeTruthy();
    expect(screen.getByTestId('goal-rewards')).toBeTruthy();
  });

  it('keeps existing long-term tasks readable before context columns are migrated', async () => {
    mockMissingContextColumns = true;

    render(<LongTermDetailScreen />);

    expect(await screen.findByText('自主閱讀計畫')).toBeTruthy();
    expect(screen.getByText('本週完成 3／5 次')).toBeTruthy();
    expect(screen.queryByText('讀取任務進度失敗，請稍後再試。')).toBeNull();
  });

  it('records the chosen schedule without asking how reading started', async () => {
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('記錄今天的閱讀'));

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

  it('acts as a stack detail page while preserving mouse-friendly web scrolling', async () => {
    render(<LongTermDetailScreen />);

    await screen.findByText('自主閱讀計畫');
    expect(screen.queryByTestId('bottom-nav')).toBeNull();
    const scroll = screen.getByTestId('long-term-detail-scroll');
    expect(scroll.props.style).toEqual(expect.arrayContaining([webMouseDraggableScroll]));
  });

  it('opens the local plan menu and shows its three choices', async () => {
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('更多計畫選項'));

    expect(screen.getByText('查看計畫詳情')).toBeTruthy();
    expect(screen.getByText('提出調整')).toBeTruthy();
    expect(screen.getByText('暫停一下')).toBeTruthy();
  });

  it('shows truthful plan details from the presentation', async () => {
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('更多計畫選項'));
    fireEvent.press(screen.getByText('查看計畫詳情'));

    expect(screen.getByText('2026-07-27 ～ 2026-08-23（共 4 週）')).toBeTruthy();
    expect(screen.getByText('完成 20 次')).toBeTruthy();
    expect(screen.getByText('閱讀時段、每週次數、閱讀方式或內容')).toBeTruthy();
  });

  it('opens pause as a local adjustment without updating Supabase', async () => {
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('更多計畫選項'));
    fireEvent.press(screen.getByText('暫停一下'));

    expect(screen.getByText('提出調整')).toBeTruthy();
    expect(screen.getByLabelText('想先暫停一下').props.accessibilityState.selected).toBe(true);
    expect(mockSupabaseUpdate).not.toHaveBeenCalled();
  });

  it('keeps a weekend review as local draft state', async () => {
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('開始週末回顧'));
    fireEvent.changeText(screen.getByLabelText('最喜歡的閱讀內容'), '神奇樹屋');
    fireEvent.press(screen.getByText('保留回顧草稿'));
    fireEvent.press(screen.getByLabelText('開始週末回顧'));

    expect(screen.getByLabelText('最喜歡的閱讀內容').props.value).toBe('神奇樹屋');
    expect(mockSupabaseUpdate).not.toHaveBeenCalled();
  });

  it('immediately controls the completed state after recording today', async () => {
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('記錄今天的閱讀'));

    expect(await screen.findByText('今天已完成 15 分鐘')).toBeTruthy();
    expect(screen.queryByLabelText('記錄今天的閱讀')).toBeNull();
  });

  it('corrects the selected real completion and updates the record sheet', async () => {
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('查看2026/07/29的紀錄'));
    await act(async () => {
      fireEvent.press(screen.getByText('改成睡前'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockRecordCompletionContext).toHaveBeenCalledWith(
        'completion-wed',
        'before_bed',
        null,
      );
    });
    expect(screen.getAllByText('睡前').length).toBeGreaterThan(0);
  });

  it('shows both the alert and sheet error when correcting a record fails', async () => {
    mockRecordCompletionContext.mockRejectedValueOnce(new Error('network'));
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('查看2026/07/29的紀錄'));
    await act(async () => {
      fireEvent.press(screen.getByText('改成睡前'));
      await Promise.resolve();
    });

    expect(await screen.findByText('更正失敗，請再試一次。')).toBeTruthy();
    expect(Alert.alert).toHaveBeenCalledWith('更正失敗', 'network');
    expect(screen.getAllByText('晚餐後').length).toBeGreaterThan(0);
  });

  it('renders skill goals with the same visual skeleton and no unsupported recording action', async () => {
    mockRouteParams = {
      goalId: 'goal-skill',
      taskId: 'task-skill',
      taskName: '鋼琴家之路',
    };

    render(<LongTermDetailScreen />);

    expect(await screen.findByText('鋼琴家之路')).toBeTruthy();
    expect(screen.getByText('目前階段：雙手合奏')).toBeTruthy();
    expect(screen.getByTestId('goal-hero')).toBeTruthy();
    expect(screen.getByTestId('goal-today')).toBeTruthy();
    expect(screen.getByTestId('goal-week')).toBeTruthy();
    expect(screen.getByTestId('goal-rewards')).toBeTruthy();
    expect(screen.getByTestId('goal-review')).toBeTruthy();
    expect(screen.queryByText('錄一段給自己聽')).toBeNull();
  });
});
