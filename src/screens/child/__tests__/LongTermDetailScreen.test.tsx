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
const mockSupabaseInsert = jest.fn();
const mockSupabaseUpsert = jest.fn();
const mockSupabaseDelete = jest.fn();
const mockSupabaseRpc = jest.fn();
const mockSupabaseEqCalls: Array<{
  table: string;
  column: string;
  value: unknown;
}> = [];
const mockSupabaseGteCalls: Array<{
  table: string;
  column: string;
  value: unknown;
}> = [];
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
  // 這一組測試裡畫面永遠是 focused，所以 useFocusEffect 等同於一個
  // 依賴 callback 本身的 useEffect —— 和 react-navigation 的真實語意一致。
  useFocusEffect: (callback: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, react-hooks/exhaustive-deps
    (require('react') as typeof import('react')).useEffect(callback, [callback]);
  },
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
const mockTwoWeekDemoGoal = {
  ...mockBaseGoal,
  id: 'goal-two-week-demo',
  task_id: 'task-two-week-demo',
  total_days: 14,
  current_day: 0,
  checkpoint_rewards: null,
  started_at: '2026-07-20',
  end_date: '2026-08-02',
  active_days: null,
  preferred_time_window: null,
};
let mockReadingGoal = { ...mockBaseGoal };

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
  'task-two-week-demo': {
    id: 'task-two-week-demo',
    family_id: 'family-1',
    name: '兩週讀完這本書',
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
    recurrence_days: null,
    schedule_mode: 'weekly_frequency',
    weekly_frequency: 3,
    start_date: '2026-07-20',
    due_date: '2026-08-02',
    progress_model: 'weekly_rhythm',
    next_step: '今天先讀 15 分鐘',
    preferred_time: null,
    created_at: '2026-07-20',
    is_active: true,
  },
};

type MockCompletionRow = {
  id: string;
  completed_at: string;
  planned_time_window: string | null;
  start_mode: string | null;
  status: string;
};

const baseReadingCompletions: MockCompletionRow[] = [
  {
    id: 'completion-mon',
    completed_at: '2026-07-27T11:30:00.000Z',
    planned_time_window: 'after_dinner',
    start_mode: 'reminded',
    status: 'completed',
  },
  {
    id: 'completion-tue',
    completed_at: '2026-07-28T11:20:00.000Z',
    planned_time_window: 'after_dinner',
    start_mode: 'self_started',
    status: 'completed',
  },
  {
    id: 'completion-wed',
    completed_at: '2026-07-29T11:10:00.000Z',
    planned_time_window: 'after_dinner',
    start_mode: 'self_started',
    status: 'completed',
  },
];
let mockReadingCompletions: MockCompletionRow[] = [...baseReadingCompletions];

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockSupabaseRpc(...args),
    from: jest.fn((table: string) => {
      let selectedColumns = '*';
      const eqFilters: Array<{ column: string; value: unknown }> = [];
      const builder: any = {
        select: jest.fn((columns = '*') => {
          selectedColumns = columns;
          return builder;
        }),
        eq: jest.fn((column: string, value: unknown) => {
          mockSupabaseEqCalls.push({ table, column, value });
          eqFilters.push({ column, value });
          return builder;
        }),
        gte: jest.fn((column: string, value: unknown) => {
          mockSupabaseGteCalls.push({ table, column, value });
          return builder;
        }),
        lt: jest.fn(() => builder),
        update: mockSupabaseUpdate.mockImplementation(() => builder),
        insert: mockSupabaseInsert.mockImplementation(() => builder),
        upsert: mockSupabaseUpsert.mockImplementation(() => builder),
        delete: mockSupabaseDelete.mockImplementation(() => builder),
        single: jest.fn(async () => {
          if (table === 'long_term_goals') {
            return {
              data: mockRouteParams.goalId === 'goal-skill'
                ? mockSkillGoal
                : mockRouteParams.goalId === 'goal-two-week-demo'
                  ? mockTwoWeekDemoGoal
                  : mockReadingGoal,
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

          let rows = mockRouteParams.goalId === 'goal-reading'
            ? mockReadingCompletions
            : [];
          const statusFilter = eqFilters.find(({ column }) => column === 'status');
          if (statusFilter) {
            rows = rows.filter((row) => row.status === statusFilter.value);
          }
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function expectNoSupabaseWrites() {
  expect(mockSupabaseUpdate).not.toHaveBeenCalled();
  expect(mockSupabaseInsert).not.toHaveBeenCalled();
  expect(mockSupabaseUpsert).not.toHaveBeenCalled();
  expect(mockSupabaseDelete).not.toHaveBeenCalled();
  expect(mockSupabaseRpc).not.toHaveBeenCalled();
}

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
    mockReadingCompletions = [...baseReadingCompletions];
    mockReadingGoal = { ...mockBaseGoal };
    mockSupabaseEqCalls.length = 0;
    mockSupabaseGteCalls.length = 0;
    mockCompleteTask.mockResolvedValue({
      completionId: 'completion-thu',
      milestone: null,
    });
    mockRecordCompletionContext.mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('renders long-term progress and the scheduled week without self-start scoring', async () => {
    render(<LongTermDetailScreen />);

    expect(await screen.findByText('自主閱讀計畫')).toBeTruthy();
    expect(screen.getAllByText('第 1 週／共 4 週').length).toBeGreaterThan(0);
    expect(screen.queryByText('本週完成 3／5 次')).toBeNull();
    expect(screen.getByText('進度')).toBeTruthy();
    expect(screen.getByText('今天預計：晚餐後')).toBeTruthy();
    expect(screen.getByText(/這週已完成 3 次。/)).toBeTruthy();
    expect(screen.queryByText(/自己開始/)).toBeNull();
    expect(screen.queryByText('3 / 20 次')).toBeNull();
    expect(screen.getByTestId('goal-hero')).toBeTruthy();
    expect(screen.getByTestId('goal-milestones')).toBeTruthy();
    expect(screen.queryByText('成長里程碑')).toBeNull();
  });

  it('renders the structured two-week demo in the unified shell', async () => {
    mockRouteParams = {
      goalId: 'goal-two-week-demo',
      taskId: 'task-two-week-demo',
      taskName: '兩週讀完這本書',
    };

    render(<LongTermDetailScreen />);

    expect(await screen.findByText('兩週讀完這本書')).toBeTruthy();
    expect(screen.getByText('今天先讀 15 分鐘')).toBeTruthy();
    expect(screen.getByText('學習與技能')).toBeTruthy();
    expect(screen.getByText(/本週 \d+ \/ 3/)).toBeTruthy();
    expect(screen.queryByText(/完成 14/)).toBeNull();
    expect(screen.queryByText(/目前期間最多安排/)).toBeNull();
    expect(screen.getByTestId('goal-shell')).toBeTruthy();
    expect(screen.getByTestId('goal-current-position')).toBeTruthy();
    expect(screen.getByTestId('goal-today-section')).toBeTruthy();
    expect(screen.getByTestId('goal-progress-section')).toBeTruthy();
    expect(screen.getByTestId('goal-review-section')).toBeTruthy();
    expect(screen.getByTestId('goal-more')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('展開更多紀錄與計畫'));
    fireEvent.press(screen.getByLabelText('查看計畫詳情'));
    expect(screen.getByText('2 週計畫 · 每週 3 次')).toBeTruthy();
  });

  it('keeps existing long-term tasks readable before context columns are migrated', async () => {
    mockMissingContextColumns = true;
    mockReadingCompletions = [
      ...baseReadingCompletions,
      {
        id: 'completion-flagged',
        completed_at: '2026-07-30T13:00:00.000Z',
        planned_time_window: 'before_bed',
        start_mode: null,
        status: 'flagged',
      },
    ];

    render(<LongTermDetailScreen />);

    expect(await screen.findByText('自主閱讀計畫')).toBeTruthy();
    expect(screen.queryByText('本週完成 3／5 次')).toBeNull();
    expect(screen.getByText('進度')).toBeTruthy();
    expect(screen.queryByText('今天已完成 15 分鐘')).toBeNull();
    expect(
      mockSupabaseEqCalls.filter(({ table, column, value }) =>
        table === 'task_completions'
        && column === 'status'
        && value === 'completed'),
    ).toHaveLength(2);
    expect(
      mockSupabaseGteCalls.filter(({ table, column }) =>
        table === 'task_completions' && column === 'completed_at'),
    ).toEqual([
      {
        table: 'task_completions',
        column: 'completed_at',
        value: '2026-07-26T16:00:00.000Z',
      },
      {
        table: 'task_completions',
        column: 'completed_at',
        value: '2026-07-26T16:00:00.000Z',
      },
    ]);
    expect(screen.queryByText('讀取任務進度失敗，請稍後再試。')).toBeNull();
  });

  it('normalizes a date-only goal start to the start of that day in Taipei', async () => {
    mockReadingGoal = {
      ...mockBaseGoal,
      started_at: '2026-07-27',
    };

    render(<LongTermDetailScreen />);

    await screen.findByText('自主閱讀計畫');
    expect(mockSupabaseGteCalls).toContainEqual({
      table: 'task_completions',
      column: 'completed_at',
      value: '2026-07-26T16:00:00.000Z',
    });
  });

  it('normalizes an offset goal start through Taipei before taking start of day', async () => {
    mockReadingGoal = {
      ...mockBaseGoal,
      started_at: '2026-07-27T18:30:00-04:00',
    };

    render(<LongTermDetailScreen />);

    await screen.findByText('自主閱讀計畫');
    expect(mockSupabaseGteCalls).toContainEqual({
      table: 'task_completions',
      column: 'completed_at',
      value: '2026-07-27T16:00:00.000Z',
    });
  });

  it('falls back to the created date when the goal start is invalid', async () => {
    mockReadingGoal = {
      ...mockBaseGoal,
      started_at: 'not-a-date',
      created_at: '2026-07-01',
    };

    render(<LongTermDetailScreen />);

    await screen.findByText('自主閱讀計畫');
    expect(mockSupabaseGteCalls).toContainEqual({
      table: 'task_completions',
      column: 'completed_at',
      value: '2026-06-30T16:00:00.000Z',
    });
    expect(
      mockSupabaseGteCalls.some(({ value }) =>
        String(value).includes('Invalid Date')),
    ).toBe(false);
  });

  it.each([
    '2026-02-30',
    '2026-13-01',
  ])('rejects the impossible date-only goal start %s', async (startedAt) => {
    mockReadingGoal = {
      ...mockBaseGoal,
      started_at: startedAt,
      created_at: '2026-07-01',
    };

    render(<LongTermDetailScreen />);

    await screen.findByText('自主閱讀計畫');
    expect(mockSupabaseGteCalls).toContainEqual({
      table: 'task_completions',
      column: 'completed_at',
      value: '2026-06-30T16:00:00.000Z',
    });
  });

  it('uses today in Taipei when both goal dates are invalid', async () => {
    mockReadingGoal = {
      ...mockBaseGoal,
      started_at: 'not-a-start',
      created_at: 'not-a-created-date',
    };

    render(<LongTermDetailScreen />);

    await screen.findByText('自主閱讀計畫');
    expect(mockSupabaseGteCalls).toContainEqual({
      table: 'task_completions',
      column: 'completed_at',
      value: '2026-07-29T16:00:00.000Z',
    });
  });

  it('filters flagged completions from the normal context query', async () => {
    mockReadingCompletions = [
      ...baseReadingCompletions,
      {
        id: 'completion-flagged',
        completed_at: '2026-07-30T13:00:00.000Z',
        planned_time_window: 'before_bed',
        start_mode: null,
        status: 'flagged',
      },
    ];

    render(<LongTermDetailScreen />);

    expect(await screen.findByText('進度')).toBeTruthy();
    expect(screen.queryByText('本週完成 3／5 次')).toBeNull();
    expect(screen.queryByText('今天已完成 15 分鐘')).toBeNull();
    expect(mockSupabaseEqCalls).toContainEqual({
      table: 'task_completions',
      column: 'status',
      value: 'completed',
    });
  });

  it('records the chosen schedule without asking how reading started', async () => {
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('記下今天的完成'));

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
    expect(screen.getByText('執行時段、每週次數與做法')).toBeTruthy();
  });

  it('opens pause as a local adjustment without updating Supabase', async () => {
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('更多計畫選項'));
    fireEvent.press(screen.getByText('暫停一下'));

    expect(screen.getByText('提出調整')).toBeTruthy();
    expect(screen.getByLabelText('想先暫停一下').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByText('保留調整草稿'));
    expectNoSupabaseWrites();
  });

  it('keeps a weekend review as local draft state', async () => {
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('開始週末回顧'));
    fireEvent.press(screen.getByRole('button', { name: '睡前' }));
    fireEvent.press(screen.getByRole('button', { name: '改成睡前' }));
    fireEvent.press(screen.getByText('保留回顧草稿'));
    fireEvent.press(screen.getByLabelText('開始週末回顧'));

    expect(
      screen.getByRole('button', { name: '睡前' }).props.accessibilityState.selected,
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: '改成睡前' }).props.accessibilityState.selected,
    ).toBe(true);
    expectNoSupabaseWrites();
  });

  it('keeps a plan adjustment local without any Supabase write', async () => {
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('更多計畫選項'));
    fireEvent.press(screen.getByText('提出調整'));
    fireEvent.press(screen.getByLabelText('想換一個時段'));
    fireEvent.press(screen.getByText('保留調整草稿'));

    expectNoSupabaseWrites();
  });

  it('immediately controls the completed state after recording today', async () => {
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('記下今天的完成'));

    expect(await screen.findByText('今天已完成 15 分鐘')).toBeTruthy();
    expect(screen.queryByLabelText('記下今天的完成')).toBeNull();
  });

  it('keeps the completion but not an unsaved time when context recording fails', async () => {
    mockRecordCompletionContext.mockRejectedValueOnce(new Error('network'));
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('記下今天的完成'));

    expect(await screen.findByText('今天已完成 15 分鐘')).toBeTruthy();
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('完成時段尚未記下', 'network');
    });
    expect(screen.queryByText('晚餐後記錄')).toBeNull();

    fireEvent.press(screen.getByLabelText('查看紀錄'));
    expect(screen.getByText('尚未記錄時段')).toBeTruthy();
    expect(screen.queryByText('晚餐後記錄')).toBeNull();
  });

  it('shows the chosen time only after context recording succeeds', async () => {
    const contextRequest = deferred<void>();
    mockRecordCompletionContext.mockReturnValueOnce(contextRequest.promise);
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('記下今天的完成'));

    expect(await screen.findByText('今天已完成 15 分鐘')).toBeTruthy();
    expect(screen.queryByText('晚餐後記錄')).toBeNull();

    await act(async () => {
      contextRequest.resolve();
      await contextRequest.promise;
    });

    expect(await screen.findByText('晚餐後記錄')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('查看紀錄'));
    expect(screen.getByText('完成時段')).toBeTruthy();
    expect(screen.getAllByText('晚餐後').length).toBeGreaterThan(0);
  });

  it('serializes the initial context write before correcting the same completion', async () => {
    const initialContextRequest = deferred<void>();
    const correctionRequest = deferred<void>();
    mockRecordCompletionContext
      .mockReturnValueOnce(initialContextRequest.promise)
      .mockReturnValueOnce(correctionRequest.promise);
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('記下今天的完成'));
    expect(await screen.findByText('今天已完成 15 分鐘')).toBeTruthy();
    await waitFor(() => {
      expect(mockRecordCompletionContext).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(screen.getByLabelText('查看紀錄'));
    fireEvent.press(screen.getByText('改成睡前'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRecordCompletionContext).toHaveBeenCalledTimes(1);
    expect(mockRecordCompletionContext).toHaveBeenNthCalledWith(
      1,
      'completion-thu',
      'after_dinner',
      null,
    );

    await act(async () => {
      initialContextRequest.resolve();
      await initialContextRequest.promise;
    });
    await waitFor(() => {
      expect(mockRecordCompletionContext).toHaveBeenCalledTimes(2);
    });
    expect(mockRecordCompletionContext).toHaveBeenNthCalledWith(
      2,
      'completion-thu',
      'before_bed',
      null,
    );

    await act(async () => {
      correctionRequest.resolve();
      await correctionRequest.promise;
    });

    expect(await screen.findByText('睡前記錄')).toBeTruthy();
    expect(screen.getAllByText('睡前').length).toBeGreaterThan(0);
    expect(screen.queryByText('晚餐後記錄')).toBeNull();
  });

  it('preserves context write order across unmount and remount', async () => {
    const initialContextRequest = deferred<void>();
    const correctionRequest = deferred<void>();
    mockRecordCompletionContext
      .mockReturnValueOnce(initialContextRequest.promise)
      .mockReturnValueOnce(correctionRequest.promise);
    const initialRender = render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('記下今天的完成'));
    await waitFor(() => {
      expect(mockRecordCompletionContext).toHaveBeenCalledTimes(1);
    });
    initialRender.unmount();

    mockReadingCompletions = [
      ...baseReadingCompletions,
      {
        id: 'completion-thu',
        completed_at: '2026-07-30T12:00:00.000Z',
        planned_time_window: null,
        start_mode: null,
        status: 'completed',
      },
    ];
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('查看紀錄'));
    fireEvent.press(screen.getByText('改成睡前'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRecordCompletionContext).toHaveBeenCalledTimes(1);

    await act(async () => {
      initialContextRequest.resolve();
      await initialContextRequest.promise;
    });
    await waitFor(() => {
      expect(mockRecordCompletionContext).toHaveBeenCalledTimes(2);
    });
    expect(mockRecordCompletionContext).toHaveBeenNthCalledWith(
      1,
      'completion-thu',
      'after_dinner',
      null,
    );
    expect(mockRecordCompletionContext).toHaveBeenNthCalledWith(
      2,
      'completion-thu',
      'before_bed',
      null,
    );

    await act(async () => {
      correctionRequest.resolve();
      await correctionRequest.promise;
    });

    expect(await screen.findByText('睡前記錄')).toBeTruthy();
    expect(screen.getAllByText('睡前').length).toBeGreaterThan(0);
    expect(screen.queryByText('晚餐後記錄')).toBeNull();
  });

  it('keeps a returned reading checkpoint out of the child progress UI', async () => {
    mockReadingGoal = {
      ...mockBaseGoal,
      current_day: 4,
    };
    mockCompleteTask.mockResolvedValueOnce({
      completionId: 'completion-thu',
      milestone: { day: 5, reward: 10 },
    });
    render(<LongTermDetailScreen />);

    expect(await screen.findByText('進度')).toBeTruthy();
    expect(screen.queryByText('本週完成 3／5 次')).toBeNull();
    expect(screen.getByTestId('goal-milestones')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('記下今天的完成'));

    expect(await screen.findByText('今天已完成 15 分鐘')).toBeTruthy();
    expect(screen.getByTestId('goal-milestones')).toBeTruthy();
    expect(screen.getAllByText(/成長幣 \+10/)).toHaveLength(1);
  });

  it('keeps reading progress completion-based when the RPC returns no milestone', async () => {
    mockReadingGoal = {
      ...mockBaseGoal,
      current_day: 4,
    };
    mockCompleteTask.mockResolvedValueOnce({
      completionId: 'completion-thu',
      milestone: null,
    });
    render(<LongTermDetailScreen />);

    expect(await screen.findByText('進度')).toBeTruthy();
    expect(screen.queryByText('本週完成 3／5 次')).toBeNull();
    expect(screen.getByTestId('goal-milestones')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('記下今天的完成'));

    await screen.findByText('今天已完成 15 分鐘');
    expect(screen.getByTestId('goal-milestones')).toBeTruthy();
    expect(screen.getAllByText(/成長幣 \+10/)).toHaveLength(1);
  });

  it('does not apply a returned milestone to family current_day', async () => {
    mockReadingGoal = {
      ...mockBaseGoal,
      goal_type: 'responsibility',
      current_day: 4,
    };
    mockCompleteTask.mockResolvedValueOnce({
      completionId: 'completion-thu',
      milestone: { day: 5, reward: 10 },
    });
    render(<LongTermDetailScreen />);

    expect(await screen.findByText('成長幣 +10（達成時一起確認）')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('記下今天的完成'));

    await screen.findByText('今天已完成');
    expect(screen.getByText('成長幣 +10（達成時一起確認）')).toBeTruthy();
    expect(screen.queryByText(/已記下/)).toBeNull();
  });

  it('corrects the selected real completion and updates the record sheet', async () => {
    render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('展開更多紀錄與計畫'));
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

    fireEvent.press(await screen.findByLabelText('展開更多紀錄與計畫'));
    fireEvent.press(await screen.findByLabelText('查看2026/07/29的紀錄'));
    await act(async () => {
      fireEvent.press(screen.getByText('改成睡前'));
      await Promise.resolve();
    });

    expect(await screen.findByText('更正失敗，請再試一次。')).toBeTruthy();
    expect(Alert.alert).toHaveBeenCalledWith('更正失敗', 'network');
    expect(screen.getAllByText('晚餐後').length).toBeGreaterThan(0);
  });

  it('clears sheets and local drafts when route params change', async () => {
    const { rerender } = render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('更多計畫選項'));
    fireEvent.press(screen.getByText('暫停一下'));
    fireEvent.press(screen.getByText('保留調整草稿'));
    fireEvent.press(await screen.findByLabelText('開始週末回顧'));
    fireEvent.press(screen.getByRole('button', { name: '晚餐後' }));
    fireEvent.press(screen.getByRole('button', { name: '就照現在這樣' }));
    fireEvent.press(screen.getByText('保留回顧草稿'));
    fireEvent.press(screen.getByLabelText('開始週末回顧'));
    expect(
      screen.getByRole('button', { name: '晚餐後' }).props.accessibilityState.selected,
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: '就照現在這樣' }).props.accessibilityState.selected,
    ).toBe(true);

    mockRouteParams = {
      goalId: 'goal-skill',
      taskId: 'task-skill',
      taskName: '鋼琴家之路',
    };
    rerender(<LongTermDetailScreen />);

    expect(await screen.findByText('目前階段：雙手合奏')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '晚餐後' })).toBeNull();
    expect(screen.queryByRole('button', { name: '就照現在這樣' })).toBeNull();
    fireEvent.press(screen.getByLabelText('開始週末回顧'));
    expect(screen.getByText('這週哪一段練習最有感？')).toBeTruthy();
    expect(screen.getByLabelText('這週最有感的片段').props.value).toBe('');
    fireEvent.press(screen.getByLabelText('關閉週末回顧'));
    fireEvent.press(screen.getByLabelText('更多計畫選項'));
    fireEvent.press(screen.getByText('提出調整'));
    expect(
      screen.getByLabelText('想先暫停一下').props.accessibilityState.selected,
    ).toBe(false);

    fireEvent.press(screen.getByLabelText('關閉調整選單'));
    mockRouteParams = {
      goalId: 'goal-reading',
      taskId: 'task-reading',
      taskName: '自主閱讀計畫',
    };
    rerender(<LongTermDetailScreen />);

    await screen.findByText('安排 15 分鐘完成這一步');
    fireEvent.press(screen.getByLabelText('開始週末回顧'));
    expect(
      screen.getByRole('button', { name: '晚餐後' }).props.accessibilityState.selected,
    ).toBe(false);
    expect(screen.queryByText('下週想怎麼試？')).toBeNull();
  });

  it('does not let an A to B to A completion request update the new A generation', async () => {
    const completionRequest = deferred<{
      completionId: string;
      milestone: { day: number; reward: number };
    }>();
    mockCompleteTask.mockReturnValueOnce(completionRequest.promise);
    const { rerender } = render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('記下今天的完成'));
    mockRouteParams = {
      goalId: 'goal-skill',
      taskId: 'task-skill',
      taskName: '鋼琴家之路',
    };
    rerender(<LongTermDetailScreen />);
    await screen.findByText('目前階段：雙手合奏');

    mockRouteParams = {
      goalId: 'goal-reading',
      taskId: 'task-reading',
      taskName: '自主閱讀計畫',
    };
    rerender(<LongTermDetailScreen />);
    await screen.findByText('進度');

    await act(async () => {
      completionRequest.resolve({
        completionId: 'stale-reading-completion',
        milestone: { day: 5, reward: 10 },
      });
      await completionRequest.promise;
      await Promise.resolve();
    });

    expect(screen.queryByText('今天已完成 15 分鐘')).toBeNull();
    expect(mockRecordCompletionContext).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('does not let an A to B to A correction update the new A generation', async () => {
    const correctionRequest = deferred<void>();
    mockRecordCompletionContext.mockReturnValueOnce(correctionRequest.promise);
    const { rerender } = render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('展開更多紀錄與計畫'));
    fireEvent.press(await screen.findByLabelText('查看2026/07/29的紀錄'));
    fireEvent.press(screen.getByText('改成睡前'));
    mockRouteParams = {
      goalId: 'goal-skill',
      taskId: 'task-skill',
      taskName: '鋼琴家之路',
    };
    rerender(<LongTermDetailScreen />);
    await screen.findByText('目前階段：雙手合奏');

    mockRouteParams = {
      goalId: 'goal-reading',
      taskId: 'task-reading',
      taskName: '自主閱讀計畫',
    };
    rerender(<LongTermDetailScreen />);
    await screen.findByText('進度');

    await act(async () => {
      correctionRequest.resolve();
      await correctionRequest.promise;
      await Promise.resolve();
    });

    fireEvent.press(screen.getByLabelText('展開更多紀錄與計畫'));
    fireEvent.press(screen.getByLabelText('查看2026/07/29的紀錄'));
    expect(screen.getAllByText('晚餐後').length).toBeGreaterThan(0);
    expect(screen.queryByText('睡前')).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('does not continue completion context or alert after unmount', async () => {
    const completionRequest = deferred<{
      completionId: string;
      milestone: { day: number; reward: number };
    }>();
    mockCompleteTask.mockReturnValueOnce(completionRequest.promise);
    const { unmount } = render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('記下今天的完成'));
    unmount();

    await act(async () => {
      completionRequest.resolve({
        completionId: 'unmounted-completion',
        milestone: { day: 5, reward: 10 },
      });
      await completionRequest.promise;
      await Promise.resolve();
    });

    expect(mockRecordCompletionContext).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('does not alert when a correction rejects after unmount', async () => {
    const correctionRequest = deferred<void>();
    mockRecordCompletionContext.mockReturnValueOnce(correctionRequest.promise);
    const { unmount } = render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('展開更多紀錄與計畫'));
    fireEvent.press(await screen.findByLabelText('查看2026/07/29的紀錄'));
    fireEvent.press(screen.getByText('改成睡前'));
    unmount();

    await act(async () => {
      correctionRequest.reject(new Error('late correction failure'));
      await correctionRequest.promise.catch(() => undefined);
      await Promise.resolve();
    });

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('does not let an old completion request update the next route', async () => {
    const completionRequest = deferred<{
      completionId: string;
      milestone: null;
    }>();
    mockCompleteTask.mockReturnValueOnce(completionRequest.promise);
    const { rerender } = render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('記下今天的完成'));
    mockRouteParams = {
      goalId: 'goal-skill',
      taskId: 'task-skill',
      taskName: '鋼琴家之路',
    };
    rerender(<LongTermDetailScreen />);
    expect(
      await screen.findByText('這週可以依自己的節奏，繼續目前的練習階段。'),
    ).toBeTruthy();

    await act(async () => {
      completionRequest.resolve({
        completionId: 'stale-reading-completion',
        milestone: null,
      });
      await completionRequest.promise;
    });

    expect(
      screen.getByText('這週可以依自己的節奏，繼續目前的練習階段。'),
    ).toBeTruthy();
    expect(screen.queryByText('今天已完成')).toBeNull();
  });

  it('does not let an old correction request change the next route time', async () => {
    mockReadingCompletions = [
      ...baseReadingCompletions,
      {
        id: 'completion-thu',
        completed_at: '2026-07-30T11:10:00.000Z',
        planned_time_window: 'after_dinner',
        start_mode: null,
        status: 'completed',
      },
    ];
    const correctionRequest = deferred<void>();
    mockRecordCompletionContext.mockReturnValueOnce(correctionRequest.promise);
    const { rerender } = render(<LongTermDetailScreen />);

    fireEvent.press(await screen.findByLabelText('查看紀錄'));
    fireEvent.press(screen.getByText('改成睡前'));

    mockRouteParams = {
      goalId: 'goal-skill',
      taskId: 'task-skill',
      taskName: '鋼琴家之路',
    };
    rerender(<LongTermDetailScreen />);
    expect(await screen.findByText('目前階段：雙手合奏')).toBeTruthy();

    await act(async () => {
      correctionRequest.resolve();
      await correctionRequest.promise;
    });
    fireEvent.press(screen.getByLabelText('更多計畫選項'));
    fireEvent.press(screen.getByText('查看計畫詳情'));

    expect(screen.getByText('未設定固定時段')).toBeTruthy();
    expect(screen.queryByText('睡前')).toBeNull();
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
    expect(screen.getByTestId('goal-progress')).toBeTruthy();
    expect(screen.getByTestId('goal-milestones')).toBeTruthy();
    expect(screen.getByTestId('goal-review')).toBeTruthy();
    expect(screen.queryByText('錄一段給自己聽')).toBeNull();
  });
});
