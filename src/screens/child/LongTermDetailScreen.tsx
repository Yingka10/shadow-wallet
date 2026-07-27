import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { RootStackParamList } from '../../../App';
import BottomNav from '../../components/BottomNav';
import LongTermGoalDetailView from '../../components/child/LongTermGoalDetailView';
import { Colors } from '../../constants/colors';
import { webScreen } from '../../constants/webStyles';
import { supabase } from '../../lib/supabase';
import { completeTask, recordCompletionContext } from '../../lib/taskActions';
import type {
  LongTermGoal,
  PreferredTimeWindow,
  Task,
} from '../../types/database';
import {
  buildGoalPresentation,
  type GoalCompletionRecord,
} from './longTermGoalPresentation';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

type LongTermDetailRoute = RouteProp<RootStackParamList, 'LongTermDetail'>;
type Nav = StackNavigationProp<RootStackParamList, 'LongTermDetail'>;
type ChildTabId = 'home' | 'wallet' | 'wish' | 'profile';

function isMissingCompletionContextColumn(error: {
  code?: string;
  message?: string;
} | null): boolean {
  return error?.code === '42703'
    || Boolean(
      error?.message?.includes('planned_time_window')
      || error?.message?.includes('start_mode'),
    );
}

function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 18l-6-6 6-6"
        stroke={Colors.ink900}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function LongTermDetailScreen() {
  const route = useRoute<LongTermDetailRoute>();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { goalId, taskId, taskName } = route.params;

  const [goal, setGoal] = useState<LongTermGoal | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [completions, setCompletions] = useState<GoalCompletionRecord[]>([]);
  const [selectedTimeWindow, setSelectedTimeWindow] =
    useState<PreferredTimeWindow | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const [goalRes, taskRes] = await Promise.all([
        supabase.from('long_term_goals').select('*').eq('id', goalId).single(),
        supabase.from('tasks').select('*').eq('id', taskId).single(),
      ]);

      if (cancelled) return;
      if (goalRes.error || !goalRes.data) {
        setError('讀取長期目標失敗，請稍後再試。');
        setLoading(false);
        return;
      }
      if (taskRes.error || !taskRes.data) {
        setError('讀取任務資料失敗，請稍後再試。');
        setLoading(false);
        return;
      }

      const loadedGoal = goalRes.data as LongTermGoal;
      const loadedTask = taskRes.data as Task;
      const tomorrow = dayjs().tz(TZ).add(1, 'day').startOf('day').toISOString();
      const contextCompletionRes = await supabase
        .from('task_completions')
        .select('id, completed_at, planned_time_window, start_mode')
        .eq('task_id', taskId)
        .eq('child_id', loadedGoal.child_id)
        .gte('completed_at', loadedGoal.started_at)
        .lt('completed_at', tomorrow)
        .order('completed_at', { ascending: true });

      if (cancelled) return;
      let loadedCompletions: GoalCompletionRecord[];

      if (contextCompletionRes.error) {
        if (!isMissingCompletionContextColumn(contextCompletionRes.error)) {
          setError('讀取任務進度失敗，請稍後再試。');
          setLoading(false);
          return;
        }

        const basicCompletionRes = await supabase
          .from('task_completions')
          .select('id, completed_at')
          .eq('task_id', taskId)
          .eq('child_id', loadedGoal.child_id)
          .gte('completed_at', loadedGoal.started_at)
          .lt('completed_at', tomorrow)
          .order('completed_at', { ascending: true });

        if (cancelled) return;
        if (basicCompletionRes.error) {
          setError('讀取任務進度失敗，請稍後再試。');
          setLoading(false);
          return;
        }

        loadedCompletions = (basicCompletionRes.data ?? []).map((completion) => ({
          id: completion.id,
          completed_at: completion.completed_at,
          planned_time_window: null,
          start_mode: null,
        }));
      } else {
        loadedCompletions =
          (contextCompletionRes.data as GoalCompletionRecord[] | null) ?? [];
      }
      const todayCompletion = loadedCompletions.find((completion) =>
        dayjs(completion.completed_at).tz(TZ).isSame(dayjs().tz(TZ), 'day'),
      );

      setGoal(loadedGoal);
      setTask(loadedTask);
      setCompletions(loadedCompletions);
      setSelectedTimeWindow(
        todayCompletion?.planned_time_window
          ?? loadedGoal.preferred_time_window
          ?? null,
      );
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [goalId, taskId]);

  const isCompletedToday = useMemo(
    () => completions.some((completion) =>
      dayjs(completion.completed_at).tz(TZ).isSame(dayjs().tz(TZ), 'day'),
    ),
    [completions],
  );

  const presentation = useMemo(() => {
    if (!goal || !task) return null;
    return {
      ...buildGoalPresentation(task, goal, completions),
      preferredTimeWindow: selectedTimeWindow,
    };
  }, [completions, goal, selectedTimeWindow, task]);

  const handleComplete = useCallback(async (): Promise<boolean> => {
    if (!goal || !task || isCompletedToday || checking) return false;

    setChecking(true);
    try {
      const now = dayjs().tz(TZ);
      const result = await completeTask(
        taskId,
        goal.child_id,
        now.format('YYYY-MM-DD'),
        true,
        task,
        goalId,
      );
      const completion: GoalCompletionRecord = {
        id: result.completionId,
        completed_at: now.toISOString(),
        planned_time_window: selectedTimeWindow,
        start_mode: null,
      };

      setCompletions((current) => [...current, completion]);

      if (selectedTimeWindow) {
        try {
          await recordCompletionContext(
            result.completionId,
            selectedTimeWindow,
            null,
          );
        } catch (contextError) {
          Alert.alert(
            '閱讀時段尚未記下',
            contextError instanceof Error ? contextError.message : '可以稍後再試。',
          );
        }
      }

      if (result.milestone) {
        Alert.alert(
          '抵達新的里程碑',
          `第 ${result.milestone.day} 次的努力被記下了。`,
        );
      }
      return true;
    } catch (caught) {
      Alert.alert(
        '記錄失敗',
        caught instanceof Error ? caught.message : '請稍後再試。',
      );
      return false;
    } finally {
      setChecking(false);
    }
  }, [
    checking,
    goal,
    goalId,
    isCompletedToday,
    selectedTimeWindow,
    task,
    taskId,
  ]);

  const handleTabPress = useCallback((tab: ChildTabId) => {
    const childId = goal?.child_id;
    if (!childId) return;

    if (tab === 'home') {
      navigation.navigate('Home', { childId });
    } else if (tab === 'wallet') {
      navigation.navigate('Wallet', { childId });
    } else if (tab === 'wish') {
      navigation.navigate('Wish', { childId });
    } else {
      navigation.navigate('Profile', { childId });
    }
  }, [goal?.child_id, navigation]);

  return (
    <View style={webScreen}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            accessibilityLabel="返回"
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.72}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <BackIcon />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {presentation?.headerTitle ?? taskName}
          </Text>
          <View style={styles.weekPill}>
            <View style={styles.weekDot} />
            <Text style={styles.weekText}>{presentation?.weekLabel ?? '成長旅程'}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.gold500} style={styles.loader} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : presentation ? (
          <LongTermGoalDetailView
            presentation={presentation}
            isCompletedToday={isCompletedToday}
            checking={checking}
            onComplete={handleComplete}
            onSelectTimeWindow={setSelectedTimeWindow}
          />
        ) : null}

        <BottomNav activeTab="wallet" onTabPress={handleTabPress} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgCanvas,
  },
  header: {
    minHeight: 74,
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.bgCanvas,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cream50,
  },
  headerTitle: {
    flex: 1,
    color: Colors.ink900,
    fontSize: 23,
    fontWeight: '900',
  },
  weekPill: {
    minHeight: 38,
    maxWidth: 112,
    paddingHorizontal: 12,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    backgroundColor: Colors.bgSurface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  weekDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.sage400,
  },
  weekText: {
    flexShrink: 1,
    color: Colors.ink700,
    fontSize: 13,
    fontWeight: '900',
  },
  loader: {
    marginTop: 80,
  },
  errorText: {
    marginTop: 80,
    paddingHorizontal: 28,
    color: Colors.error,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
