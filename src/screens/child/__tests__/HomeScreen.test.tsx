import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ChildProposalReviewData } from '../../../lib/childProposal';
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
const mockAcceptReview = jest.fn();
const mockRequestChanges = jest.fn();
const mockReviewRefresh = jest.fn();
let mockReviewState: any;

const proposalReview = {
  proposal: { id: 'proposal-1', status: 'needs_child_review', child_original_goal: '我想讀完這本書' },
  sourcePlanVersion: {
    id: 'version-ai', proposal_id: 'proposal-1', cadence_mode: 'weekly_frequency',
    cadence_weekly_frequency: 4, cadence_days: null, preferred_time: 'after_dinner',
    preferred_time_custom: null, completion_description: '完成一次閱讀時段',
  },
  currentPlanVersion: {
    id: 'version-parent', proposal_id: 'proposal-1', cadence_mode: 'weekly_frequency',
    cadence_weekly_frequency: 3, cadence_days: null, preferred_time: 'after_dinner',
    preferred_time_custom: null, completion_description: '完成一次閱讀時段',
  },
} as ChildProposalReviewData;

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

jest.mock('../../../hooks/useChildProposalReview', () => ({
  useChildProposalReview: () => mockReviewState,
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
    mockAcceptReview.mockReset();
    mockAcceptReview.mockResolvedValue(false);
    mockRequestChanges.mockReset();
    mockRequestChanges.mockResolvedValue(false);
    mockReviewRefresh.mockReset();
    mockReviewState = {
      reviews: [], loading: false, error: null, refresh: mockReviewRefresh,
      accept: mockAcceptReview, requestChanges: mockRequestChanges,
      actingProposalId: null, actionError: null, successMessage: null,
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

  it('在原本提案入口附近顯示孩子 review，兩個 action 走 typed hook', () => {
    mockReviewState = { ...mockReviewState, reviews: [proposalReview] };
    render(<HomeScreen />);
    expect(screen.getByTestId('child-plan-review-card')).toBeTruthy();
    expect(screen.getByTestId('child-proposal-entry')).toBeTruthy();
    fireEvent.press(screen.getByText('好，我也想這樣試試看'));
    fireEvent.press(screen.getByText('我想再聊聊'));
    expect(mockAcceptReview).toHaveBeenCalledWith(proposalReview);
    expect(mockRequestChanges).toHaveBeenCalledWith(proposalReview);
  });

  it('review loading/error 不會藏掉原本提案入口', () => {
    mockReviewState = { ...mockReviewState, loading: true, error: '讀取失敗' };
    const { rerender } = render(<HomeScreen />);
    expect(screen.getByTestId('child-proposal-entry')).toBeTruthy();
    rerender(<HomeScreen />);
    expect(screen.getByText('讀取要一起看的安排失敗')).toBeTruthy();
    fireEvent.press(screen.getByText('重新看看'));
    expect(mockReviewRefresh).toHaveBeenCalledTimes(1);
  });
});
