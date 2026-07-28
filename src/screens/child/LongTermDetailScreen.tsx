import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { RootStackParamList } from '../../../App';
import LongTermGoalDetailSheets, {
  type AdjustmentDraft,
  type LongTermSheet,
  type ReviewDraft,
} from '../../components/child/LongTermGoalDetailSheets';
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

const EMPTY_REVIEW_DRAFT: ReviewDraft = {
  favoriteNote: '',
  preferredWindow: null,
  nextStep: null,
};

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

function taipeiDayStart(value: string | null | undefined) {
  if (!value) return null;

  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parsedDate = dayjs.tz(value, TZ);
      return parsedDate.isValid() && parsedDate.format('YYYY-MM-DD') === value
        ? parsedDate.startOf('day')
        : null;
    }

    const parsedTimestamp = dayjs(value);
    return parsedTimestamp.isValid()
      ? parsedTimestamp.tz(TZ).startOf('day')
      : null;
  } catch {
    return null;
  }
}

function normalizeGoalStartIso(
  goal: Pick<LongTermGoal, 'started_at' | 'created_at'>,
): string {
  return (
    taipeiDayStart(goal.started_at)
    ?? taipeiDayStart(goal.created_at)
    ?? dayjs().tz(TZ).startOf('day')
  ).toISOString();
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

function MoreIcon() {
  return (
    <Svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
    >
      <Circle cx={5} cy={12} r={1.6} fill={Colors.ink700} />
      <Circle cx={12} cy={12} r={1.6} fill={Colors.ink700} />
      <Circle cx={19} cy={12} r={1.6} fill={Colors.ink700} />
    </Svg>
  );
}

export default function LongTermDetailScreen() {
  const route = useRoute<LongTermDetailRoute>();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { goalId, taskId, taskName } = route.params;
  const generationRef = useRef(0);
  const pendingInitialContextWritesRef =
    useRef<Map<string, Promise<void>>>(new Map());

  const [goal, setGoal] = useState<LongTermGoal | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [completions, setCompletions] = useState<GoalCompletionRecord[]>([]);
  const [selectedTimeWindow, setSelectedTimeWindow] =
    useState<PreferredTimeWindow | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<LongTermSheet>(null);
  const [selectedCompletionId, setSelectedCompletionId] =
    useState<string | null>(null);
  const [reviewDraft, setReviewDraft] =
    useState<ReviewDraft>(EMPTY_REVIEW_DRAFT);
  const [adjustmentDraft, setAdjustmentDraft] =
    useState<AdjustmentDraft | null>(null);
  const [correctingTimeWindow, setCorrectingTimeWindow] = useState(false);

  useEffect(() => {
    const loadGeneration = generationRef.current + 1;
    generationRef.current = loadGeneration;
    const isCurrentGeneration = () =>
      generationRef.current === loadGeneration;

    setActiveSheet(null);
    setSelectedCompletionId(null);
    setReviewDraft(EMPTY_REVIEW_DRAFT);
    setAdjustmentDraft(null);
    setGoal(null);
    setTask(null);
    setCompletions([]);
    setSelectedTimeWindow(null);
    setChecking(false);
    setCorrectingTimeWindow(false);
    setLoading(true);
    setError(null);

    const load = async () => {
      const [goalRes, taskRes] = await Promise.all([
        supabase.from('long_term_goals').select('*').eq('id', goalId).single(),
        supabase.from('tasks').select('*').eq('id', taskId).single(),
      ]);

      if (!isCurrentGeneration()) return;
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
      const normalizedStartIso = normalizeGoalStartIso(loadedGoal);
      const tomorrow = dayjs().tz(TZ).add(1, 'day').startOf('day').toISOString();
      const contextCompletionRes = await supabase
        .from('task_completions')
        .select('id, completed_at, planned_time_window, start_mode')
        .eq('task_id', taskId)
        .eq('child_id', loadedGoal.child_id)
        .eq('status', 'completed')
        .gte('completed_at', normalizedStartIso)
        .lt('completed_at', tomorrow)
        .order('completed_at', { ascending: true });

      if (!isCurrentGeneration()) return;
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
          .eq('status', 'completed')
          .gte('completed_at', normalizedStartIso)
          .lt('completed_at', tomorrow)
          .order('completed_at', { ascending: true });

        if (!isCurrentGeneration()) return;
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
      pendingInitialContextWritesRef.current.clear();
      if (generationRef.current === loadGeneration) {
        generationRef.current += 1;
      }
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

  const todayCompletion = useMemo(
    () => completions.find((completion) =>
      dayjs(completion.completed_at).tz(TZ).isSame(dayjs().tz(TZ), 'day'),
    ) ?? null,
    [completions],
  );

  const selectedCompletion = useMemo(
    () => completions.find((completion) =>
      completion.id === selectedCompletionId) ?? null,
    [completions, selectedCompletionId],
  );

  const handleComplete = useCallback(async (): Promise<boolean> => {
    if (!goal || !task || isCompletedToday || checking) return false;

    const requestGeneration = generationRef.current;
    const isCurrentGeneration = () =>
      generationRef.current === requestGeneration;
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
      if (!isCurrentGeneration()) return false;

      const completion: GoalCompletionRecord = {
        id: result.completionId,
        completed_at: now.toISOString(),
        planned_time_window: null,
        start_mode: null,
      };

      setCompletions((current) => [...current, completion]);
      const milestoneDay = result.milestone?.day ?? null;
      if (goal.goal_type === 'habit' && milestoneDay !== null) {
        setGoal((current) => {
          if (
            !current
            || current.id !== goalId
            || current.goal_type !== 'habit'
          ) {
            return current;
          }

          return {
            ...current,
            current_day: Math.max(
              current.current_day ?? 0,
              milestoneDay,
            ),
          };
        });
      }

      if (selectedTimeWindow) {
        let initialContextWrite: Promise<void> | null = null;
        try {
          initialContextWrite = recordCompletionContext(
            result.completionId,
            selectedTimeWindow,
            null,
          );
          pendingInitialContextWritesRef.current.set(
            result.completionId,
            initialContextWrite,
          );
          await initialContextWrite;
          if (!isCurrentGeneration()) return false;
          setCompletions((current) => current.map((item) =>
            item.id === result.completionId
              ? { ...item, planned_time_window: selectedTimeWindow }
              : item));
        } catch (contextError) {
          if (!isCurrentGeneration()) return false;
          Alert.alert(
            '閱讀時段尚未記下',
            contextError instanceof Error ? contextError.message : '可以稍後再試。',
          );
        } finally {
          if (
            initialContextWrite
            && pendingInitialContextWritesRef.current.get(result.completionId)
              === initialContextWrite
          ) {
            pendingInitialContextWritesRef.current.delete(result.completionId);
          }
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
      if (!isCurrentGeneration()) return false;
      Alert.alert(
        '記錄失敗',
        caught instanceof Error ? caught.message : '請稍後再試。',
      );
      return false;
    } finally {
      if (isCurrentGeneration()) {
        setChecking(false);
      }
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

  const handleOpenRecord = useCallback((completionId?: string) => {
    const completion = completionId
      ? completions.find((item) => item.id === completionId)
      : todayCompletion;
    setSelectedCompletionId(completion?.id ?? null);
    setActiveSheet('record');
  }, [completions, todayCompletion]);

  const handleCorrectTimeWindow = useCallback(async (
    nextWindow: PreferredTimeWindow,
  ) => {
    if (!selectedCompletion || correctingTimeWindow) return;

    const requestGeneration = generationRef.current;
    const isCurrentGeneration = () =>
      generationRef.current === requestGeneration;
    setCorrectingTimeWindow(true);
    try {
      const pendingInitialWrite =
        pendingInitialContextWritesRef.current.get(selectedCompletion.id);
      if (pendingInitialWrite) {
        try {
          await pendingInitialWrite;
        } catch {
          // A failed initial context write must not block a newer correction.
        }
        if (!isCurrentGeneration()) return;
      }

      await recordCompletionContext(selectedCompletion.id, nextWindow, null);
      if (!isCurrentGeneration()) return;

      setCompletions((current) => current.map((completion) =>
        completion.id === selectedCompletion.id
          ? { ...completion, planned_time_window: nextWindow }
          : completion));
      if (
        dayjs(selectedCompletion.completed_at)
          .tz(TZ)
          .isSame(dayjs().tz(TZ), 'day')
      ) {
        setSelectedTimeWindow(nextWindow);
      }
    } catch (caught) {
      if (!isCurrentGeneration()) return;
      Alert.alert(
        '更正失敗',
        caught instanceof Error ? caught.message : '請稍後再試。',
      );
      throw caught;
    } finally {
      if (isCurrentGeneration()) {
        setCorrectingTimeWindow(false);
      }
    }
  }, [correctingTimeWindow, selectedCompletion]);

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
            <Text style={styles.weekText} numberOfLines={1}>
              {presentation?.weekLabel ?? '成長旅程'}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="更多計畫選項"
            style={styles.moreButton}
            onPress={() => setActiveSheet('menu')}
            activeOpacity={0.72}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <MoreIcon />
          </TouchableOpacity>
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
            onOpenRecord={handleOpenRecord}
            onOpenReview={() => setActiveSheet('review')}
            onOpenDetails={() => setActiveSheet('details')}
          />
        ) : null}

        {presentation && task ? (
          <LongTermGoalDetailSheets
            activeSheet={activeSheet}
            onClose={() => setActiveSheet(null)}
            onOpenSheet={setActiveSheet}
            presentation={presentation}
            completion={selectedCompletion}
            taskMinutes={task.base_time_min}
            reviewDraft={reviewDraft}
            adjustmentDraft={adjustmentDraft}
            onSaveReviewDraft={setReviewDraft}
            onSaveAdjustmentDraft={setAdjustmentDraft}
            onCorrectTimeWindow={handleCorrectTimeWindow}
            correctingTimeWindow={correctingTimeWindow}
          />
        ) : null}
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
    gap: 6,
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
    minWidth: 0,
    color: Colors.ink900,
    fontSize: 20,
    fontWeight: '900',
  },
  weekPill: {
    minHeight: 38,
    maxWidth: 78,
    paddingHorizontal: 9,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    backgroundColor: Colors.bgSurface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
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
  moreButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cream50,
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
