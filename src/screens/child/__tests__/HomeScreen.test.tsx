import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import type { TodayTask, UseTodayTasksResult } from '../../../hooks/useTodayTasks';

function buildTodayTasksResult(overrides: Partial<UseTodayTasksResult> = {}): UseTodayTasksResult {
  return {
    weekdayTasks: [],
    weekendTasks: [],
    longTermTasks: [],
    tempTasks: [],
    isPrerequisiteMet: true,
    completedTodayIds: new Set<string>(),
    loading: false,
    refresh: jest.fn(),
    ...overrides,
  };
}

let mockTodayTasksResult: UseTodayTasksResult = buildTodayTasksResult();

const skillLongTermTask: TodayTask = {
  id: 'task-skill',
  family_id: 'family-1',
  name: '練鋼琴四個等級',
  category: 'D',
  day_type: 'both',
  long_term_type: 'skill',
  is_long_term: true,
  base_time_min: 0,
  difficulty: 1,
  coin_override: null,
  is_system_default: false,
  allow_repeat: false,
  min_age: 6,
  max_age: 12,
  is_active: true,
  time_saving_min: 0,
  recurrence_days: null,
  due_date: null,
  created_at: '2026-07-01T00:00:00.000Z',
  isCompleted: false,
  goal: {
    id: 'goal-skill',
    child_id: 'child-1',
    task_id: 'task-skill',
    goal_type: 'skill',
    current_day: 0,
    total_days: 180,
    current_level: 2,
    level_count: 4,
    status: 'active',
    checkpoint_rewards: null,
    motivation_note: null,
    started_at: '2026-07-01',
    next_review_at: null,
    completed_at: null,
    created_at: '2026-07-01T00:00:00.000Z',
    min_age: 6,
    interrupt_count: 0,
    last_active_date: null,
    active_days: null,
    preferred_time_window: null,
    level_definitions: null,
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
  },
};

let mockWalletBalance = 42;

jest.mock('../../../hooks/useTodayTasks', () => ({
  useTodayTasks: () => mockTodayTasksResult,
}));

jest.mock('../../../hooks/useWallet', () => ({
  useWallet: () => ({
    spending: { balance: mockWalletBalance },
    saving: null,
    loading: false,
    refresh: jest.fn(),
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: { childId: 'child-1' } }),
  useNavigation: () => ({ replace: jest.fn(), navigate: jest.fn() }),
}));

jest.mock('../../../lib/taskActions', () => ({
  completeTask: jest.fn().mockResolvedValue({ coinEarned: 0, timeSavedMin: 0, milestone: null }),
  createChildTask: jest.fn(),
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        })),
      })),
    })),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('moti', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    MotiView: ({ children, ...props }: { children?: React.ReactNode }) => (
      <View {...props}>{children}</View>
    ),
  };
});

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: {
      ease: 'ease',
      inOut: <T,>(value: T) => value,
    },
    useSharedValue: <T,>(value: T) => ({ value }),
    useAnimatedStyle: (factory: () => object) => factory(),
    withRepeat: <T,>(value: T) => value,
    withTiming: <T,>(value: T) => value,
    withSequence: <T,>(...values: T[]) => values[values.length - 1],
  };
});

import HomeScreen from '../HomeScreen';

describe('HomeScreen', () => {
  beforeEach(() => {
    mockWalletBalance = 42;
    mockTodayTasksResult = buildTodayTasksResult();
  });

  it('renders greeting', () => {
    render(<HomeScreen />);
    expect(
      screen.getByText(/早安|午安|晚安/)
    ).toBeTruthy();
  });

  it('renders coin pill with wallet balance', () => {
    render(<HomeScreen />);
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('今天也是成長的一天')).toBeTruthy();
    expect(screen.getByText('今天 +0')).toBeTruthy();
    expect(screen.getByText('幣')).toBeTruthy();
  });

  it('uses level progress for skill long-term goals', () => {
    mockTodayTasksResult = {
      ...buildTodayTasksResult(),
      longTermTasks: [skillLongTermTask],
    };

    render(<HomeScreen />);
    expect(screen.getByText('第 2/4 級')).toBeTruthy();
  });

  it('renders bottom nav tabs', () => {
    render(<HomeScreen />);
    expect(screen.getByText('首頁')).toBeTruthy();
    expect(screen.getByText('成長幣')).toBeTruthy();
    expect(screen.getByText('許願樹')).toBeTruthy();
    expect(screen.getByText('我的')).toBeTruthy();
  });

  it('keeps bottom feedback cards in a clear primary-secondary ratio', () => {
    render(<HomeScreen />);

    const growthCardStyle = StyleSheet.flatten(screen.getByTestId('growth-feedback-card').props.style);
    const rewardCardStyle = StyleSheet.flatten(screen.getByTestId('reward-card').props.style);
    const wateringStyle = StyleSheet.flatten(screen.getByTestId('watering-sprite').props.style);

    expect(growthCardStyle.flex).toBeGreaterThan(rewardCardStyle.flex);
    expect(growthCardStyle.paddingRight).toBeGreaterThanOrEqual(72);
    expect(wateringStyle.position).toBe('absolute');
    expect(wateringStyle.right).toBeLessThanOrEqual(0);
  });
});
