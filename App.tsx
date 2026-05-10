import 'react-native-gesture-handler';
import React from 'react';
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
import type { AgeGroup, CustomTask } from './src/types/database';

export type RootStackParamList = {
  Entry: undefined;
  ParentLogin: undefined;
  ChildLogin: undefined;
  Onboarding: undefined;
  Home: { childId: string };
  Parent: undefined;
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
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Entry"
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="Entry" component={EntryScreen} />
          <Stack.Screen name="ParentLogin" component={ParentLoginScreen} />
          <Stack.Screen name="ChildLogin" component={ChildLoginScreen} />
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Parent" component={ParentScreen} />
          <Stack.Screen name="GoalSetup" component={GoalSetupScreen} />
          <Stack.Screen name="TaskSelection" component={TaskSelectionScreen} />
          <Stack.Screen name="Overview" component={OverviewScreen} />
          <Stack.Screen name="LongTermDetail" component={LongTermDetailScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
