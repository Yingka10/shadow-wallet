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

function HomeIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M9 21V12h6v9" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChartIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 20h18" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Rect x="5"  y="13" width="3" height="7" rx="1" stroke={color} strokeWidth={1.8} />
      <Rect x="10" y="9"  width="3" height="11" rx="1" stroke={color} strokeWidth={1.8} />
      <Rect x="16" y="5"  width="3" height="15" rx="1" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function SettingsIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={1.8} />
      <Path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round"
      />
    </Svg>
  );
}

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
// Tablet tab bar — design-ref style (3 tabs)
// ---------------------------------------------------------------------------

type TabletTabDef = {
  routeName: keyof ParentTabParamList;
  label: string;
  sub: string;
  renderIcon: (color: string, size: number) => React.ReactElement;
};

const TABLET_TABS: TabletTabDef[] = [
  {
    routeName: 'Dashboard',
    label: '首頁',
    sub: '今日任務 · 待處理',
    renderIcon: (c, s) => <HomeIcon color={c} size={s} />,
  },
  {
    routeName: 'Weekly',
    label: '週報',
    sub: '本週觀察與紀錄',
    renderIcon: (c, s) => <ChartIcon color={c} size={s} />,
  },
  {
    routeName: 'Manage',
    label: '管理',
    sub: '任務 · 獎勵 · 設定',
    renderIcon: (c, s) => <SettingsIcon color={c} size={s} />,
  },
];

function TabletTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[ts.wrap, { bottom: 16 + (insets.bottom || 0) }]}>
      <View style={ts.bar}>
        {TABLET_TABS.map((tab) => {
          const routeIdx = state.routes.findIndex((r) => r.name === tab.routeName);
          const active = state.index === routeIdx;
          const iconColor = active ? '#fff' : ParentColors.ink400;

          return (
            <TouchableOpacity
              key={tab.routeName}
              style={[ts.item, active && ts.itemActive]}
              activeOpacity={0.75}
              onPress={() => navigation.dispatch(CommonActions.navigate(tab.routeName))}
            >
              <View style={[ts.iconBox, active && ts.iconBoxActive]}>
                {tab.renderIcon(iconColor, 20)}
              </View>

              <View style={ts.labelCol}>
                <Text style={[ts.label, active && ts.labelActive]}>{tab.label}</Text>
                <Text style={ts.sub}>{tab.sub}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
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
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  bar: {
    width: '56%',
    minWidth: 520,
    maxWidth: 600,
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    backgroundColor: 'rgba(250,248,245,0.86)',
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(28,27,23,0.08)',
    padding: 8,
    ...ParentShadows.card,
  },
  item: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderRadius: 28,
    position: 'relative',
  },
  itemActive: {
    backgroundColor: 'rgba(44,74,61,0.08)',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  iconBoxActive: {
    backgroundColor: ParentColors.accent,
    borderWidth: 0,
  },
  labelCol: {
    alignItems: 'flex-start',
  },
  label: {
    fontFamily: ParentFonts.body,
    fontSize: 14.5,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.ink400,
  },
  labelActive: {
    color: ParentColors.fgPrimary,
  },
  sub: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    color: ParentColors.fgMuted,
    marginTop: 2,
    letterSpacing: 0,
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
