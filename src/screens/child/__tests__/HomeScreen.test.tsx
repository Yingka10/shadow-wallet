import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

let mockTodayTasksResult = {
  weekdayTasks: [],
  weekendTasks: [],
  longTermTasks: [],
  isPrerequisiteMet: true,
  completedTodayIds: new Set(),
  loading: false,
  refresh: jest.fn(),
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
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: (factory: () => object) => factory(),
    withTiming: (value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
  };
});

import HomeScreen from '../HomeScreen';

describe('HomeScreen', () => {
  beforeEach(() => {
    mockWalletBalance = 42;
    mockTodayTasksResult = {
      weekdayTasks: [],
      weekendTasks: [],
      longTermTasks: [],
      isPrerequisiteMet: true,
      completedTodayIds: new Set(),
      loading: false,
      refresh: jest.fn(),
    };
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
      ...mockTodayTasksResult,
      longTermTasks: [
        {
          id: 'task-skill',
          name: '練鋼琴四個等級',
          category: 'D',
          base_time_min: 0,
          difficulty: 1,
          coin_override: null,
          day_type: 'both',
          is_active: true,
          is_long_term: true,
          allow_repeat: false,
          time_saving_min: 0,
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
          },
        },
      ],
    } as any;

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
