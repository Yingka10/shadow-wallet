import 'react-native-gesture-handler';
import React from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import EntryScreen from './src/screens/auth/EntryScreen';
import ParentLoginScreen from './src/screens/auth/ParentLoginScreen';
import ChildLoginScreen from './src/screens/auth/ChildLoginScreen';
import OnboardingScreen from './src/screens/onboarding/OnboardingScreen';
import HomeScreen from './src/screens/child/HomeScreen';
import ParentScreen from './src/screens/parent/ParentScreen';
import GoalSetupScreen from './src/screens/onboarding/GoalSetupScreen';
import TaskSelectionScreen from './src/screens/onboarding/TaskSelectionScreen';
import OverviewScreen from './src/screens/onboarding/OverviewScreen';
import LongTermDetailScreen from './src/screens/child/LongTermDetailScreen';
import ProfileScreen from './src/screens/child/ProfileScreen';
import type { AgeGroup, CustomTask } from './src/types/database';

export type RootStackParamList = {
  Entry: undefined;
  ParentLogin: undefined;
  ChildLogin: undefined;
  Onboarding: undefined;
  Home: { childId: string };
  Parent: undefined;
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
};

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  const { height } = useWindowDimensions();

  return (
    <SafeAreaProvider>
      <SelectedChildProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Entry"
            screenOptions={{
              headerShown: false,
              cardStyle: Platform.OS === 'web' ? { height } : { flex: 1 },
            }}
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
            <Stack.Screen name="ObservationHistory" component={ObservationHistoryScreen} />
            <Stack.Screen name="ParentTaskCreate" component={ParentTaskCreateScreen} />
            <Stack.Screen name="ParentLongTermCreate" component={ParentLongTermCreateScreen} />
            <Stack.Screen name="ParentSettings" component={ParentSettingsScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SelectedChildProvider>
    </SafeAreaProvider>
  );
}
