import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import BottomNav from '../BottomNav';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('BottomNav', () => {
  it('renders all 4 tab labels', () => {
    render(<BottomNav />);
    expect(screen.getByText('首頁')).toBeTruthy();
    expect(screen.getByText('回顧')).toBeTruthy();
    expect(screen.getByText('撲滿')).toBeTruthy();
    expect(screen.getByText('願望')).toBeTruthy();
  });

  it('calls onTabPress with correct tab id', () => {
    const onTabPress = jest.fn();
    render(<BottomNav onTabPress={onTabPress} />);
    fireEvent.press(screen.getByText('回顧'));
    expect(onTabPress).toHaveBeenCalledWith('reports');
  });

  it('defaults active tab to home', () => {
    render(<BottomNav />);
    // home tab should have selected state
    expect(screen.getByRole('tab', { selected: true })).toBeTruthy();
  });
});
