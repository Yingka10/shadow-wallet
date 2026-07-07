// Shadow Wallet · Parent Tab Navigator
//
// Adaptive strategy:
//   phone  (<768):  4 tabs — 面板 / 任務 / 兌換 / 週報  (original style)
//   tablet (≥768):  3 tabs — 首頁 / 週報 / 管理          (design-ref style)
//
// SelectedChildProvider is mounted here so all child screens can use
// useSelectedChild() without each screen fetching children independently.

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SelectedChildProvider } from '../../context/SelectedChildContext';

import ParentDashboardScreen from './ParentDashboardScreen';
import ParentHomeTablet from './tablet/ParentHomeTablet';
import ParentWeeklyTablet from './tablet/ParentWeeklyTablet';
import ParentManageTablet from './tablet/ParentManageTablet';
import ParentTaskListScreen from './ParentTaskListScreen';
import ParentRedemptionScreen from './ParentRedemptionScreen';
import ParentWeeklyReportScreen from './ParentWeeklyReportScreen';

import {
  ParentColors,
  ParentFontWeights,
  ParentFonts,
  ParentShadows,
} from '../../constants/parentTheme';

// ---------------------------------------------------------------------------
// Param list
// ---------------------------------------------------------------------------

export type ParentTabParamList = {
  Dashboard:  undefined;  // phone: 面板  | tablet: 首頁
  Tasks:      undefined;  // phone only
  Redemption: undefined;  // phone only
  Weekly:     undefined;  // phone: 週報 | tablet: 週報
  Manage:     undefined;  // tablet only: 管理
};

// ---------------------------------------------------------------------------
// Screen entry wrappers
// ---------------------------------------------------------------------------

function DashboardEntry() {
  const { width } = useWindowDimensions();
  return width >= 768 ? <ParentHomeTablet /> : <ParentDashboardScreen />;
}

function WeeklyEntry() {
  const { width } = useWindowDimensions();
  return width >= 768 ? <ParentWeeklyTablet /> : <ParentWeeklyReportScreen />;
}

// ---------------------------------------------------------------------------
// SVG icons — shared
// ---------------------------------------------------------------------------

function DashboardIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3"  y="3"  width="8" height="8" rx="2" stroke={color} strokeWidth={1.8} />
      <Rect x="13" y="3"  width="8" height="8" rx="2" stroke={color} strokeWidth={1.8} />
      <Rect x="3"  y="13" width="8" height="8" rx="2" stroke={color} strokeWidth={1.8} />
      <Rect x="13" y="13" width="8" height="8" rx="2" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function TasksIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 12l2 2 4-4" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 7a2 2 0 012-2h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V7z" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function RedemptionIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={1.8} />
      <Circle cx="12" cy="12" r="5" stroke={color} strokeWidth={1.8} />
      <Path d="M12 3v2M12 19v2M3 12h2M19 12h2" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function WeeklyIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 9h18M3 15h18" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M5 3v3M19 3v3" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Rect x="3" y="5" width="18" height="16" rx="2" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Tablet tab bar — 三個 tab 現在都自己渲染共用左側欄（ParentSidebar）來導航，
// 平板寬度下這個浮動底欄完全交給側欄取代，永遠不顯示。
// ---------------------------------------------------------------------------

function TabletTabBar(_props: BottomTabBarProps) {
  return <View style={ts.tabletHidden} />;
}

// ---------------------------------------------------------------------------
// Phone tab bar — existing style (4 tabs)
// ---------------------------------------------------------------------------

type PhoneTabDef = {
  routeName: keyof ParentTabParamList;
  label: string;
  renderIcon: (color: string, size: number) => React.ReactElement;
};

const PHONE_TABS: PhoneTabDef[] = [
  {
    routeName: 'Dashboard',
    label: '面板',
    renderIcon: (c, s) => <DashboardIcon color={c} size={s} />,
  },
  {
    routeName: 'Tasks',
    label: '任務',
    renderIcon: (c, s) => <TasksIcon color={c} size={s} />,
  },
  {
    routeName: 'Redemption',
    label: '兌換',
    renderIcon: (c, s) => <RedemptionIcon color={c} size={s} />,
  },
  {
    routeName: 'Weekly',
    label: '週報',
    renderIcon: (c, s) => <WeeklyIcon color={c} size={s} />,
  },
];

function PhoneTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[ps.bar, { height: 60 + (insets.bottom || 0), paddingBottom: insets.bottom || 8 }]}>
      {PHONE_TABS.map((tab) => {
        const routeIdx = state.routes.findIndex((r) => r.name === tab.routeName);
        const active = state.index === routeIdx;
        const color = active ? ParentColors.teal500 : ParentColors.ink400;

        return (
          <TouchableOpacity
            key={tab.routeName}
            style={ps.item}
            activeOpacity={0.8}
            onPress={() => navigation.dispatch(CommonActions.navigate(tab.routeName))}
          >
            {tab.renderIcon(color, 22)}
            <Text style={[ps.label, { color }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Adaptive tab bar
// ---------------------------------------------------------------------------

function AdaptiveTabBar(props: BottomTabBarProps) {
  const { width } = useWindowDimensions();
  return width >= 768 ? <TabletTabBar {...props} /> : <PhoneTabBar {...props} />;
}

// ---------------------------------------------------------------------------
// Navigator
// ---------------------------------------------------------------------------

const Tab = createBottomTabNavigator<ParentTabParamList>();

export default function ParentTabNavigator() {
  return (
    <SelectedChildProvider>
      <Tab.Navigator
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <AdaptiveTabBar {...props} />}
      >
        <Tab.Screen name="Dashboard"  component={DashboardEntry} />
        <Tab.Screen name="Tasks"      component={ParentTaskListScreen} />
        <Tab.Screen name="Redemption" component={ParentRedemptionScreen} />
        <Tab.Screen name="Weekly"     component={WeeklyEntry} />
        <Tab.Screen name="Manage"     component={ParentManageTablet} />
      </Tab.Navigator>
    </SelectedChildProvider>
  );
}

// ---------------------------------------------------------------------------
// Styles — Tablet tab bar
// ---------------------------------------------------------------------------

const ts = StyleSheet.create({
  tabletHidden: {
    display: 'none',
  },
});

export const parentTabletTabStyles = ts;

// ---------------------------------------------------------------------------
// Styles — Phone tab bar
// ---------------------------------------------------------------------------

const ps = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,27,23,0.08)',
    paddingTop: 6,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 4,
  },
  label: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    fontWeight: ParentFontWeights.medium,
    marginBottom: 4,
  },
});
