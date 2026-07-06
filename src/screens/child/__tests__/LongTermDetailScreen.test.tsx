import React from 'react';
import { render, screen } from '@testing-library/react-native';

const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({
    params: {
      goalId: 'goal-skill',
      taskId: 'task-skill',
      taskName: '鋼琴家之路',
    },
  }),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../lib/taskActions', () => ({
  completeTask: jest.fn(),
}));

const skillGoal = {
  id: 'goal-skill',
  child_id: 'child-1',
  task_id: 'task-skill',
  goal_type: 'skill',
  total_days: 180,
  current_day: 0,
  status: 'active',
  checkpoint_rewards: null,
  motivation_note: null,
  started_at: '2026-07-01',
  next_review_at: null,
  completed_at: null,
  created_at: '2026-07-01',
  min_age: 6,
  interrupt_count: 0,
  last_active_date: null,
  active_days: null,
  level_definitions: [
    { id: 'level-1', name: '認識琴鍵', coin: 10 },
    { id: 'level-2', name: '完成第一首歌', coin: 20 },
  ],
  current_level: 1,
  level_count: 2,
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

const skillTask = {
  id: 'task-skill',
  family_id: 'family-1',
  name: '鋼琴家之路',
  category: 'D',
  day_type: 'both',
  is_long_term: true,
  long_term_type: 'skill',
  base_time_min: 0,
  difficulty: 1,
  coin_override: null,
  time_saving_min: 0,
  is_active: true,
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
        single: jest.fn(async () => {
          if (table === 'long_term_goals') return { data: skillGoal, error: null };
          if (table === 'tasks') return { data: skillTask, error: null };
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
  it('renders skill goal details instead of a coming-soon placeholder', async () => {
    render(<LongTermDetailScreen />);

    expect(await screen.findByText('鋼琴家之路')).toBeTruthy();
    expect(screen.getByText('第 1 / 2 級')).toBeTruthy();
    expect(screen.getByText('認識琴鍵')).toBeTruthy();
    expect(screen.getByText('完成第一首歌')).toBeTruthy();
    expect(screen.queryByText('此類型長期目標詳情即將推出')).toBeNull();
  });
});
