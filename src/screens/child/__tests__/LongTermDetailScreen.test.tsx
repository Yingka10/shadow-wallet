import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { webMouseDraggableScroll } from '../../../constants/webStyles';

const mockGoBack = jest.fn();

let mockRouteParams = {
  goalId: 'goal-habit',
  taskId: 'task-habit',
  taskName: '每天十點前睡',
};

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: mockRouteParams }),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../lib/taskActions', () => ({
  completeTask: jest.fn(async () => ({ milestone: null })),
}));

const mockBaseGoal = {
  id: 'goal-habit',
  child_id: 'child-1',
  task_id: 'task-habit',
  goal_type: 'habit',
  total_days: 30,
  current_day: 8,
  status: 'active',
  checkpoint_rewards: { '10': 20, '20': 0, '30': 0 },
  motivation_note: null,
  started_at: '2026-07-01',
  next_review_at: null,
  completed_at: null,
  created_at: '2026-07-01',
  min_age: 6,
  interrupt_count: 0,
  last_active_date: null,
  active_days: null,
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
};

const mockSkillGoal = {
  ...mockBaseGoal,
  id: 'goal-skill',
  task_id: 'task-skill',
  goal_type: 'skill',
  total_days: 120,
  current_day: 0,
  checkpoint_rewards: null,
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
  'task-habit': {
    id: 'task-habit',
    family_id: 'family-1',
    name: '每天十點前睡',
    category: 'D',
    day_type: 'both',
    is_long_term: true,
    long_term_type: 'habit',
    base_time_min: 0,
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
  'task-skill': {
    id: 'task-skill',
    family_id: 'family-1',
    name: '學鋼琴四個等級',
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

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      const builder: any = {
        select: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        gte: jest.fn(() => builder),
        lt: jest.fn(() => builder),
        limit: jest.fn(() => builder),
        update: jest.fn(() => builder),
        single: jest.fn(async () => {
          if (table === 'long_term_goals') {
            return {
              data: mockRouteParams.goalId === 'goal-skill' ? mockSkillGoal : mockBaseGoal,
              error: null,
            };
          }
          if (table === 'tasks') {
            return { data: mockTasks[mockRouteParams.taskId as keyof typeof mockTasks], error: null };
          }
          return { data: null, error: null };
        }),
        maybeSingle: jest.fn(async () => ({ data: null, error: null })),
      };
      return builder;
    }),
  },
}));

import LongTermDetailScreen from '../LongTermDetailScreen';

describe('LongTermDetailScreen', () => {
  beforeEach(() => {
    mockRouteParams = {
      goalId: 'goal-habit',
      taskId: 'task-habit',
      taskName: '每天十點前睡',
    };
  });

  it('renders the habit detail as a gentle growth journey instead of a form-like progress page', async () => {
    render(<LongTermDetailScreen />);

    expect(await screen.findByText('長期目標')).toBeTruthy();
    expect(screen.getByText('每天十點前睡')).toBeTruthy();
    expect(screen.getByText('讓身體每天都有足夠的休息時間')).toBeTruthy();
    expect(screen.getByText('第 8 天 · 已完成 7 次')).toBeTruthy();
    expect(screen.getByText('今晚有在 10 點前準備睡覺嗎？')).toBeTruthy();
    expect(screen.getByText('成長小徑')).toBeTruthy();
    expect(screen.getByText('這週的足跡')).toBeTruthy();
    expect(screen.getByText('旅程里程碑')).toBeTruthy();
    expect(screen.getByText('需要調整這個目標？')).toBeTruthy();
  });

  it('keeps the bottom tab visible and applies mouse-friendly web scrolling to the detail body', async () => {
    render(<LongTermDetailScreen />);

    expect(await screen.findByTestId('bottom-nav')).toBeTruthy();
    const scroll = screen.getByTestId('long-term-detail-scroll');

    expect(scroll.props.style).toEqual(expect.arrayContaining([webMouseDraggableScroll]));
  });

  it('renders skill goals with stage language and practice actions', async () => {
    mockRouteParams = {
      goalId: 'goal-skill',
      taskId: 'task-skill',
      taskName: '學鋼琴四個等級',
    };

    render(<LongTermDetailScreen />);

    expect(await screen.findByText('鋼琴練習之路')).toBeTruthy();
    expect(screen.getByText('第 2 / 4 階段')).toBeTruthy();
    expect(screen.getByText('本階段任務：雙手合奏')).toBeTruthy();
    expect(screen.getByText('今天練習 15 分鐘')).toBeTruthy();
    expect(screen.getByText('基礎指法')).toBeTruthy();
    expect(screen.queryByText('今晚有在 10 點前準備睡覺嗎？')).toBeNull();
  });
});
