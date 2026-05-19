import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SelectedChildProvider } from './src/context/SelectedChildContext';

import EntryScreen from './src/screens/auth/EntryScreen';
import ParentLoginScreen from './src/screens/auth/ParentLoginScreen';
import ChildLoginScreen from './src/screens/auth/ChildLoginScreen';
import OnboardingScreen from './src/screens/onboarding/OnboardingScreen';
import HomeScreen from './src/screens/child/HomeScreen';
import ParentTabNavigator from './src/screens/parent/ParentTabNavigator';
import ParentTaskDetailScreen from './src/screens/parent/ParentTaskDetailScreen';
import ParentTaskCreateScreen from './src/screens/parent/ParentTaskCreateScreen';
import ParentSettingsScreen from './src/screens/parent/ParentSettingsScreen';
import GoalSetupScreen from './src/screens/onboarding/GoalSetupScreen';
import TaskSelectionScreen from './src/screens/onboarding/TaskSelectionScreen';
import OverviewScreen from './src/screens/onboarding/OverviewScreen';
import LongTermDetailScreen from './src/screens/child/LongTermDetailScreen';
import ProfileScreen from './src/screens/child/ProfileScreen';
import WalletScreen from './src/screens/child/WalletScreen';
import WishScreen from './src/screens/child/WishScreen';
import type { AgeGroup, CustomTask } from './src/types/database';

// ---------------------------------------------------------------------------
// Navigation param list
// ---------------------------------------------------------------------------
// Parent tab screens (Dashboard, Tasks, Redemption, Weekly) live inside
// ParentTabNavigator and use SelectedChildContext — they don't need route params.
// Screens pushed on top of the tab (TaskDetail, GoalSetup, etc.) keep their params.

export type RootStackParamList = {
  Entry: undefined;
  ParentLogin: undefined;
  ChildLogin: undefined;
  Onboarding: undefined;
  Home: { childId: string };
  Wallet: { childId: string };
  Wish: { childId: string };
  Parent: undefined;            // legacy; redirect via EntryScreen
  ParentTab: undefined;         // parent tab navigator
  Profile: { childId: string };
  GoalSetup: {
    childId: string;
    childNickname: string;
    familyId: string;
    ageGroup: AgeGroup;
    isOnboarding: boolean;
  };
  TaskSelection: {
    childId: string;
    childNickname: string;
    familyId: string;
    ageGroup: AgeGroup;
    rewardName: string;
    goalCoinCost: number;
    isOnboarding: boolean;
  };
  Overview: {
    childId: string;
    childNickname: string;
    familyId: string;
    selectedTemplateIds: string[];
    customTasks: CustomTask[];
    rewardName: string;
    goalCoinCost: number;
    isOnboarding: boolean;
  };
  LongTermDetail: {
    goalId: string;
    taskId: string;
    taskName: string;
  };
  ParentTaskDetail: {
    taskId: string;
    childId: string;
    taskName: string;
  };
  ParentTaskCreate: undefined;
  ParentSettings: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <SelectedChildProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Entry"
            screenOptions={{ headerShown: false }}
          >
            {/* ── Auth ──────────────────────────────────────── */}
            <Stack.Screen name="Entry" component={EntryScreen} />
            <Stack.Screen name="ParentLogin" component={ParentLoginScreen} />
            <Stack.Screen name="ChildLogin" component={ChildLoginScreen} />

            {/* ── Onboarding ────────────────────────────────── */}
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="GoalSetup" component={GoalSetupScreen} />
            <Stack.Screen name="TaskSelection" component={TaskSelectionScreen} />
            <Stack.Screen name="Overview" component={OverviewScreen} />

            {/* ── Child side ────────────────────────────────── */}
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Wallet" component={WalletScreen} />
            <Stack.Screen name="Wish" component={WishScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="LongTermDetail" component={LongTermDetailScreen} />

            {/* ── Parent side ───────────────────────────────── */}
            <Stack.Screen name="ParentTab" component={ParentTabNavigator} />
            <Stack.Screen name="ParentTaskDetail" component={ParentTaskDetailScreen} />
            <Stack.Screen name="ParentTaskCreate" component={ParentTaskCreateScreen} />
            <Stack.Screen name="ParentSettings" component={ParentSettingsScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SelectedChildProvider>
    </SafeAreaProvider>
  );
}
