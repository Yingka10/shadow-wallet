import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ParentDashboardScreen from './ParentDashboardScreen';
import ParentTaskListScreen from './ParentTaskListScreen';
import ParentRedemptionScreen from './ParentRedemptionScreen';
import ParentWeeklyReportScreen from './ParentWeeklyReportScreen';

import {
  ParentColors,
  ParentFontSizes,
  ParentFontWeights,
  ParentFonts,
} from '../../constants/parentTheme';

// ---------------------------------------------------------------------------
// Param list — screens in this tab navigator take no route params
// (child identity is provided via SelectedChildContext)
// ---------------------------------------------------------------------------

export type ParentTabParamList = {
  Dashboard: undefined;
  Tasks: undefined;
  Redemption: undefined;
  Weekly: undefined;
};

// ---------------------------------------------------------------------------
// Tab icons
// ---------------------------------------------------------------------------

function DashboardIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="8" height="8" rx="2" stroke={color} strokeWidth={1.8} />
      <Rect x="13" y="3" width="8" height="8" rx="2" stroke={color} strokeWidth={1.8} />
      <Rect x="3" y="13" width="8" height="8" rx="2" stroke={color} strokeWidth={1.8} />
      <Rect x="13" y="13" width="8" height="8" rx="2" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function TasksIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 12l2 2 4-4" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="M5 7a2 2 0 012-2h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V7z"
        stroke={color} strokeWidth={1.8}
      />
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
      <Path
        d="M3 9h18M3 15h18"
        stroke={color} strokeWidth={1.8} strokeLinecap="round"
      />
      <Path
        d="M5 3v3M19 3v3"
        stroke={color} strokeWidth={1.8} strokeLinecap="round"
      />
      <Rect x="3" y="5" width="18" height="16" rx="2" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Navigator
// ---------------------------------------------------------------------------

const Tab = createBottomTabNavigator<ParentTabParamList>();

export default function ParentTabNavigator() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { height: 60 + insets.bottom, paddingBottom: insets.bottom || 8 }],
        tabBarActiveTintColor: ParentColors.teal500,
        tabBarInactiveTintColor: ParentColors.ink400,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={ParentDashboardScreen}
        options={{
          tabBarLabel: '面板',
          tabBarIcon: ({ color, size }) => <DashboardIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Tasks"
        component={ParentTaskListScreen}
        options={{
          tabBarLabel: '任務',
          tabBarIcon: ({ color, size }) => <TasksIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Redemption"
        component={ParentRedemptionScreen}
        options={{
          tabBarLabel: '兌換',
          tabBarIcon: ({ color, size }) => <RedemptionIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Weekly"
        component={ParentWeeklyReportScreen}
        options={{
          tabBarLabel: '週報',
          tabBarIcon: ({ color, size }) => <WeeklyIcon color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopColor: 'rgba(28,27,23,0.08)',
    borderTopWidth: 1,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: ParentFontWeights.medium,
    fontFamily: ParentFonts.body,
    marginBottom: 4,
  },
  tabItem: {
    paddingTop: 4,
  },
});
