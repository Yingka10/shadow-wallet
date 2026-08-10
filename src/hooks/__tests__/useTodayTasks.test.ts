import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockApplyHabitResume = jest.fn<Promise<void>, unknown[]>();
const mockRemoveChannel = jest.fn();

const mockChannel = {
  on: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
};
mockChannel.on.mockReturnValue(mockChannel);
mockChannel.subscribe.mockReturnValue(mockChannel);

const tableRows: Record<string, unknown[]> = {
  child_tasks: [{ task_id: 'task-reading' }],
  tasks: [
    {
      id: 'task-reading',
      family_id: 'family-1',
      name: '親子閱讀',
      category: 'D',
      is_long_term: true,
      is_active: true,
      allow_repeat: false,
    },
  ],
  task_completions: [],
  long_term_goals: [
    {
      id: 'goal-reading',
      child_id: 'child-1',
      task_id: 'task-reading',
      goal_type: 'habit',
      status: 'active',
      current_day: 3,
      checkpoint_rewards: { '5': 10 },
      active_days: [0, 1, 2, 3, 4, 5, 6],
    },
  ],
};

const mockFrom = jest.fn((table: string) => {
  const chain: Record<string, unknown> = {
    data: tableRows[table] ?? [],
    error: null,
  };

  for (const method of ['select', 'eq', 'in', 'gte', 'lt', 'limit']) {
    chain[method] = jest.fn(() => chain);
  }

  return chain;
});

jest.mock('../../lib/taskActions', () => ({
  applyHabitResume: (...args: unknown[]) => mockApplyHabitResume(...args),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    channel: () => mockChannel,
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

import { useTodayTasks } from '../useTodayTasks';

describe('useTodayTasks long-term progress integrity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChannel.on.mockReturnValue(mockChannel);
    mockChannel.subscribe.mockReturnValue(mockChannel);
    mockApplyHabitResume.mockResolvedValue(undefined);
  });

  it('does not roll back habit current_day when today tasks are loaded or refreshed', async () => {
    const { result } = renderHook(() => useTodayTasks('child-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.longTermTasks).toHaveLength(1);
    expect(mockApplyHabitResume).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockApplyHabitResume).not.toHaveBeenCalled();
  });
});
