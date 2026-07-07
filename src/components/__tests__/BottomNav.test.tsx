import React from 'react';
import { Platform } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import BottomNav from '../BottomNav';

const originalPlatformOS = Platform.OS;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('BottomNav', () => {
  it('renders all 4 tab labels', () => {
    render(<BottomNav />);
    expect(screen.getByText('首頁')).toBeTruthy();
    expect(screen.getByText('撲滿')).toBeTruthy();
    expect(screen.getByText('許願樹')).toBeTruthy();
    expect(screen.getByText('我的')).toBeTruthy();
  });

  it('calls onTabPress with correct tab id', () => {
    const onTabPress = jest.fn();
    render(<BottomNav onTabPress={onTabPress} />);
    fireEvent.press(screen.getByText('許願樹'));
    expect(onTabPress).toHaveBeenCalledWith('wish');
  });

  it('defaults active tab to home', () => {
    render(<BottomNav />);
    expect(screen.getByRole('tab', { selected: true })).toBeTruthy();
  });

  it('uses absolute positioning on web to stay pinned to the bottom', () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'web',
    });

    render(<BottomNav />);

    const tabList = screen.getByTestId('bottom-nav');
    expect(tabList.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ position: 'absolute' })]),
    );

    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatformOS,
    });
  });
});
