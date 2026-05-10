import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import GoalHeroCard from '../GoalHeroCard';
import type { TodayTask } from '../../hooks/useTodayTasks';
import type { LongTermGoal } from '../../types/database';

const makeTask = (): TodayTask => ({
  id: 'task-d1',
  name: '每天練習鋼琴',
  category: 'D',
  base_time_min: 30,
  difficulty: 1,
  coin_override: null,
  day_type: 'both',
  is_active: true,
  is_long_term: true,
  allow_repeat: true,
  time_saving_min: 0,
  isCompleted: false,
} as TodayTask);

const makeGoal = (overrides: Partial<LongTermGoal> = {}): LongTermGoal => ({
  id: 'goal-1',
  child_id: 'child-1',
  task_id: 'task-d1',
  goal_type: 'habit',
  current_day: 7,
  total_days: 30,
  status: 'active',
  checkpoint_rewards: {},
  created_at: '2024-01-01',
  ...overrides,
} as LongTermGoal);

describe('GoalHeroCard — streak variant', () => {
  it('renders goal title', () => {
    render(<GoalHeroCard task={makeTask()} goal={makeGoal()} isCompleted={false} onCheckIn={() => {}} onOpen={() => {}} />);
    expect(screen.getByText('每天練習鋼琴')).toBeTruthy();
  });

  it('shows streak progress label', () => {
    render(<GoalHeroCard task={makeTask()} goal={makeGoal()} isCompleted={false} onCheckIn={() => {}} onOpen={() => {}} />);
    expect(screen.getByText('第 7 天')).toBeTruthy();
    expect(screen.getByText('再 23 天就完成這一輪挑戰！')).toBeTruthy();
  });

  it('calls onCheckIn when 打卡 button pressed', () => {
    const onCheckIn = jest.fn();
    render(<GoalHeroCard task={makeTask()} goal={makeGoal()} isCompleted={false} onCheckIn={onCheckIn} onOpen={() => {}} />);
    fireEvent.press(screen.getByLabelText('今天打卡'));
    expect(onCheckIn).toHaveBeenCalledTimes(1);
  });

  it('calls onOpen when card body pressed', () => {
    const onOpen = jest.fn();
    render(<GoalHeroCard task={makeTask()} goal={makeGoal()} isCompleted={false} onCheckIn={() => {}} onOpen={onOpen} />);
    fireEvent.press(screen.getByLabelText('長期目標：每天練習鋼琴'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('GoalHeroCard — level variant', () => {
  it('shows level sub-text for non-habit goal', () => {
    const levelGoal = makeGoal({ goal_type: 'skill', current_day: 2, total_days: 5 });
    render(<GoalHeroCard task={makeTask()} goal={levelGoal} isCompleted={false} onCheckIn={() => {}} onOpen={() => {}} />);
    expect(screen.getByText('Level 2 / 5')).toBeTruthy();
  });

  it('does not render 打卡 button for level variant', () => {
    const levelGoal = makeGoal({ goal_type: 'skill' });
    render(<GoalHeroCard task={makeTask()} goal={levelGoal} isCompleted={false} onCheckIn={() => {}} onOpen={() => {}} />);
    expect(screen.queryByLabelText('今天打卡')).toBeNull();
  });
});
