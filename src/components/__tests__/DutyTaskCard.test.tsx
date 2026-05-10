import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import DutyTaskCard from '../DutyTaskCard';
import type { TodayTask } from '../../hooks/useTodayTasks';

const makeTask = (overrides: Partial<TodayTask> = {}): TodayTask => ({
  id: 'task-1',
  name: '刷牙',
  category: 'A',
  base_time_min: 5,
  difficulty: 1,
  coin_override: null,
  day_type: 'weekday',
  is_active: true,
  is_long_term: false,
  allow_repeat: false,
  time_saving_min: 0,
  isCompleted: false,
  ...overrides,
} as TodayTask);

describe('DutyTaskCard', () => {
  it('renders task name', () => {
    render(<DutyTaskCard task={makeTask()} isCompleted={false} onPress={() => {}} />);
    expect(screen.getByText('刷牙')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<DutyTaskCard task={makeTask()} isCompleted={false} onPress={onPress} />);
    fireEvent.press(screen.getByAccessibilityHint('刷牙，未完成'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows 省 X 分 pill for Task-B with time_saving_min', () => {
    render(<DutyTaskCard task={makeTask({ category: 'B', time_saving_min: 10 })} isCompleted={false} onPress={() => {}} />);
    expect(screen.getByText('省 10 分')).toBeTruthy();
  });

  it('does NOT show time-saving pill for Task-A', () => {
    render(<DutyTaskCard task={makeTask({ category: 'A' })} isCompleted={false} onPress={() => {}} />);
    expect(screen.queryByText(/省/)).toBeNull();
  });

  it('is disabled when completed and allow_repeat is false', () => {
    const onPress = jest.fn();
    const { getByAccessibilityHint } = render(
      <DutyTaskCard task={makeTask()} isCompleted={true} onPress={onPress} />
    );
    fireEvent.press(getByAccessibilityHint('刷牙，已完成'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
