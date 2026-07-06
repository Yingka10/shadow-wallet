import { StyleSheet } from 'react-native';

jest.mock('../../../../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('@react-navigation/native', () => ({
  CommonActions: { navigate: jest.fn((name: string) => ({ type: 'NAVIGATE', payload: { name } })) },
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => {
    const React = require('react');
    return {
      Navigator: ({ children }: { children: React.ReactNode }) => children,
      Screen: () => null,
    };
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../ParentDashboardScreen', () => () => null);
jest.mock('../../ParentTaskListScreen', () => () => null);
jest.mock('../../ParentRedemptionScreen', () => () => null);
jest.mock('../../ParentWeeklyReportScreen', () => () => null);
jest.mock('../ParentWeeklyTablet', () => () => null);
jest.mock('../ParentManageTablet', () => () => null);

import { webMouseDraggableScroll, webTabletScreen } from '../../../../constants/webStyles';
import { ParentFontSizes, ParentFontWeights } from '../../../../constants/parentTheme';
import { parentHomeTabletStyles } from '../ParentHomeTablet';
import { parentTabletTabStyles } from '../../ParentTabNavigator';

describe('ParentHomeTablet layout tokens', () => {
  it('uses the full tablet viewport instead of a fixed preview width', () => {
    if (webTabletScreen.width != null) {
      expect(webTabletScreen.width).toBe('100%');
    }
    expect(webTabletScreen.maxWidth).toBeUndefined();
    expect(webTabletScreen.alignSelf).toBeUndefined();
  });

  it('keeps the AI rail wide enough for prompts without explicit context chips', () => {
    const rightColWrap = StyleSheet.flatten(parentHomeTabletStyles.rightColWrap) as Record<string, unknown>;

    expect(rightColWrap.width).toBeUndefined();
    expect(rightColWrap.flexBasis).toBe('24%');
    expect(rightColWrap.minWidth).toBeGreaterThanOrEqual(260);
    expect(parentHomeTabletStyles).not.toHaveProperty('advisorContextRow');
    expect(parentHomeTabletStyles).not.toHaveProperty('advisorContextChip');
  });

  it('improves reading hierarchy for support text and task rows', () => {
    const reqAiUrgent = StyleSheet.flatten(parentHomeTabletStyles.reqAiUrgent);
    const advisorSub = StyleSheet.flatten(parentHomeTabletStyles.advisorSub);
    const taskName = StyleSheet.flatten(parentHomeTabletStyles.tRowTask);
    const longTermName = StyleSheet.flatten(parentHomeTabletStyles.pLtName);
    const longTermMeta = StyleSheet.flatten(parentHomeTabletStyles.pLtMeta);

    expect(reqAiUrgent.fontSize).toBeGreaterThanOrEqual(ParentFontSizes.xs);
    expect(reqAiUrgent.lineHeight).toBeGreaterThanOrEqual(18);
    expect(advisorSub.fontSize).toBeGreaterThanOrEqual(ParentFontSizes.pMeta);
    expect(advisorSub.lineHeight).toBeGreaterThanOrEqual(20);
    expect(taskName.fontWeight).toBe(ParentFontWeights.bold);
    expect(taskName.fontSize).toBeGreaterThan(longTermMeta.fontSize);
    expect(longTermName.fontWeight).toBe(ParentFontWeights.bold);
  });

  it('balances proposal action buttons by proportion instead of height', () => {
    const approve = StyleSheet.flatten(parentHomeTabletStyles.proposalApproveBtn);
    const reject = StyleSheet.flatten(parentHomeTabletStyles.proposalRejectBtn);

    expect(approve.minHeight).toBe(reject.minHeight);
    expect(approve.flex).toBe(7);
    expect(reject.flex).toBe(3);
  });

  it('makes footer quick actions look tappable', () => {
    const quickLink = StyleSheet.flatten(parentHomeTabletStyles.quietLink);

    expect(quickLink.borderWidth).toBe(1);
    expect(quickLink.paddingHorizontal).toBeGreaterThanOrEqual(12);
    expect(quickLink.borderRadius).toBeGreaterThanOrEqual(8);
  });

  it('uses web styles that communicate mouse-driven scrolling', () => {
    const webScroll = webMouseDraggableScroll as Record<string, unknown>;

    if (webScroll.cursor != null) {
      expect(webScroll.cursor).toBe('grab');
      expect(webScroll.userSelect).toBe('none');
      expect(webScroll.touchAction).toBe('pan-y');
    }
  });

  it('renders the tablet tabs as a floating translucent pill', () => {
    const wrap = StyleSheet.flatten(parentTabletTabStyles.wrap);
    const bar = StyleSheet.flatten(parentTabletTabStyles.bar);

    expect(wrap.position).toBe('absolute');
    expect(wrap.left).toBe(0);
    expect(wrap.right).toBe(0);
    expect(bar.borderRadius).toBeGreaterThanOrEqual(32);
    expect(bar.backgroundColor).toMatch(/^rgba\(/);
    expect(bar.borderWidth).toBe(1);
    expect(bar.maxWidth).toBeLessThanOrEqual(640);
  });
});
