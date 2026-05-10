import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ContributionTaskCard from '../ContributionTaskCard';
import type { TodayTask } from '../../hooks/useTodayTasks';

const makeTask = (overrides: Partial<TodayTask> = {}): TodayTask => ({
  id: 'task-c1',
  name: '幫忙洗碗',
  category: 'C',
  base_time_min: 10,
  difficulty: 1.5,
  coin_override: null,
  day_type: 'weekday',
  is_active: true,
  is_long_term: false,
  allow_repeat: false,
  time_saving_min: 0,
  isCompleted: false,
  ...overrides,
} as TodayTask);

// base = round(10 * 1.5) = 15
describe('ContributionTaskCard', () => {
  it('renders task name', () => {
    render(<ContributionTaskCard task={makeTask()} isCompleted={false} isPrerequisiteMet={true} onPress={() => {}} />);
    expect(screen.getByText('幫忙洗碗')).toBeTruthy();
  });

  it('shows full coin when prerequisite met (15 幣)', () => {
    render(<ContributionTaskCard task={makeTask()} isCompleted={false} isPrerequisiteMet={true} onPress={() => {}} />);
    expect(screen.getByText('+15 幣')).toBeTruthy();
  });

  it('shows discounted coin when prerequisite not met (round(15 * 0.7) = 11 幣)', () => {
    render(<ContributionTaskCard task={makeTask()} isCompleted={false} isPrerequisiteMet={false} onPress={() => {}} />);
    expect(screen.getByText('+11 幣')).toBeTruthy();
  });

  it('shows discount nudge when prerequisite not met and not completed', () => {
    render(<ContributionTaskCard task={makeTask()} isCompleted={false} isPrerequisiteMet={false} onPress={() => {}} />);
    expect(screen.getByText('先完成本分，解鎖完整金幣！')).toBeTruthy();
  });

  it('hides discount nudge when task is completed', () => {
    render(<ContributionTaskCard task={makeTask()} isCompleted={true} isPrerequisiteMet={false} onPress={() => {}} />);
    expect(screen.queryByText('先完成本分，解鎖完整金幣！')).toBeNull();
  });

  it('uses coin_override when set', () => {
    render(
      <ContributionTaskCard task={makeTask({ coin_override: 20 })} isCompleted={false} isPrerequisiteMet={true} onPress={() => {}} />
    );
    expect(screen.getByText('+20 幣')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<ContributionTaskCard task={makeTask()} isCompleted={false} isPrerequisiteMet={true} onPress={onPress} />);
    fireEvent.press(screen.getByText('幫忙洗碗'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
