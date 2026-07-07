import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import BottomNav, { bottomNavStyles } from '../BottomNav';
import { Colors } from '../../constants/colors';

const originalPlatformOS = Platform.OS;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('BottomNav', () => {
  it('renders the child-facing 4 tab labels', () => {
    render(<BottomNav />);

    expect(screen.getByText('首頁')).toBeTruthy();
    expect(screen.getByText('成長幣')).toBeTruthy();
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

  it('uses a fixed bottom bar instead of a floating tray', () => {
    const nav = StyleSheet.flatten(bottomNavStyles.nav);

    expect(nav.backgroundColor).toBe(Colors.navBg);
    expect(nav.borderRadius).toBeUndefined();
    expect(nav.marginHorizontal).toBeUndefined();
    expect(nav.marginBottom).toBeUndefined();
    expect(nav.shadowOpacity).toBeUndefined();
    expect(nav.elevation).toBeUndefined();
    expect(nav.borderTopWidth).toBe(1);
  });

  it('keeps the fixed tab proportions smaller on phones', () => {
    const tab = StyleSheet.flatten(bottomNavStyles.tab);
    const iconSlot = StyleSheet.flatten(bottomNavStyles.iconSlot);
    const label = StyleSheet.flatten(bottomNavStyles.label);

    expect(tab.minHeight).toBeLessThanOrEqual(48);
    expect(iconSlot.width).toBeLessThanOrEqual(32);
    expect(iconSlot.height).toBeLessThanOrEqual(28);
    expect(label.fontSize).toBeLessThanOrEqual(11);
  });

  it('uses growth green for active home and gold for active growth coin', () => {
    render(<BottomNav activeTab="wallet" />);

    const walletLabel = screen.getByText('成長幣');
    expect(StyleSheet.flatten(walletLabel.props.style)).toEqual(
      expect.objectContaining({ color: Colors.gold700, fontWeight: '800' }),
    );
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
