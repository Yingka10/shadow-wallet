import React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('../../../hooks/useTodayTasks', () => ({
  useTodayTasks: () => ({
    weekdayTasks: [],
    weekendTasks: [],
    longTermTasks: [],
    isPrerequisiteMet: true,
    completedTodayIds: new Set(),
    loading: false,
    refresh: jest.fn(),
  }),
}));

jest.mock('../../../hooks/useWallet', () => ({
  useWallet: () => ({
    spending: { balance: 42 },
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
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import HomeScreen from '../HomeScreen';

describe('HomeScreen', () => {
  it('renders greeting', () => {
    render(<HomeScreen />);
    expect(
      screen.getByText(/早安|午安|晚安/)
    ).toBeTruthy();
  });

  it('renders coin pill with wallet balance', () => {
    render(<HomeScreen />);
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('renders bottom nav tabs', () => {
    render(<HomeScreen />);
    expect(screen.getByText('首頁')).toBeTruthy();
    expect(screen.getByText('撲滿')).toBeTruthy();
  });
});
