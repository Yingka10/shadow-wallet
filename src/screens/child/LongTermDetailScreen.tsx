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
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
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
import { useChildSharedPlanTimeAdjustment } from '../../hooks/useChildSharedPlanTimeAdjustment';
import {
  buildGoalPresentation,
  type GoalCompletionRecord,
} from './longTermGoalPresentation';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';
const completionContextWriteQueue = new Map<string, Promise<void>>();

type LongTermDetailRoute = RouteProp<RootStackParamList, 'LongTermDetail'>;
type Nav = StackNavigationProp<RootStackParamList, 'LongTermDetail'>;

const EMPTY_REVIEW_DRAFT: ReviewDraft = {
  favoriteNote: '',
  preferredWindow: null,
  nextStep: null,
};

function enqueueCompletionContextWrite(
  completionId: string,
  write: () => Promise<void>,
): Promise<void> {
  const previousWrite = completionContextWriteQueue.get(completionId);
  const queuedWrite = (
    previousWrite
      ? previousWrite.catch(() => undefined)
      : Promise.resolve()
  ).then(write);

  completionContextWriteQueue.set(completionId, queuedWrite);
  const removeSettledWrite = () => {
    if (completionContextWriteQueue.get(completionId) === queuedWrite) {
      completionContextWriteQueue.delete(completionId);
    }
  };
  void queuedWrite.then(removeSettledWrite, removeSettledWrite);

  return queuedWrite;
}

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

/**
 * 閱讀畫面要顯示的時段，決策順序：
 *
 *   1. 今天那筆完成紀錄實際填的 planned_time_window（發生過的事最權威）
 *   2. long_term_goals.preferred_time_window（閱讀畫面的 runtime mirror）
 *   3. tasks.preferred_time —— 只在它剛好是閱讀畫面認得的兩個值時
 *   4. null
 *
 * 第 3 步是 P0-8M 的窄相容修補。共同約定的權威一直是 Plan Version，
 * canonical task 也一直有正確的 mirror，但 `create_parent_task_v1` 建立
 * long-term goal 時**從來沒有**把時段同步到 goal 的 mirror（見
 * FOLLOW_UP_PREFERRED_TIME_WINDOW_CREATION_MIRROR）。少了這一段，一份
 * 正式談定「睡前」的共同計畫在孩子端會顯示成「尚未選擇時段」。
 *
 * 這不是新增第三個真相來源 —— 只是在既有 mirror 還沒補齊時，讀 canonical
 * task 已經有的值。task 上其他的 preferred_time enum（上學前、放學後…）
 * 刻意**不**接受：閱讀 UI 只認得這兩個時段，硬塞進來只會顯示錯的字。
 */
function preferredTimeWindowFromTask(
  preferredTime: string | null | undefined,
): PreferredTimeWindow | null {
  return preferredTime === 'after_dinner' || preferredTime === 'before_bed'
    ? preferredTime
    : null;
}

function resolvePreferredWindow(
  todayCompletion: GoalCompletionRecord | undefined,
  goal: LongTermGoal,
  task: Task,
): PreferredTimeWindow | null {
  return todayCompletion?.planned_time_window
    ?? goal.preferred_time_window
    ?? preferredTimeWindowFromTask(task.preferred_time)
    ?? null;
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

  /*
    孩子的身分來自已載入的 goal，不從 route params 猜。goal 還沒回來之前
    hook 拿到 null，什麼也不做 —— 共同計畫的判定晚一拍沒有副作用，
    但用錯 childId 去查別人家的提案有。
  */
  const {
    sharedPlan,
    currentPreferredTime: sharedPreferredTime,
    hasOpenRequest,
    submit: submitTimeAdjustment,
    submitting: submittingTimeAdjustment,
    submitError: timeAdjustmentError,
    justSubmitted: timeAdjustmentSubmitted,
    refresh: refreshSharedPlan,
  } = useChildSharedPlanTimeAdjustment(taskId, goal?.child_id ?? null);

  const load = useCallback(async () => {
    const loadGeneration = generationRef.current + 1;
    generationRef.current = loadGeneration;
    const isCurrentGeneration = () =>
      generationRef.current === loadGeneration;

    {
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
      // 重新載入時一律從伺服器資料重新推導時段 —— 家長剛確認完調整，
      // 孩子回到這個畫面看到的必須是新的共同時段，不是上一輪算出來的值。
      setSelectedTimeWindow(
        resolvePreferredWindow(todayCompletion, loadedGoal, loadedTask),
      );
      setError(null);
      setLoading(false);
    }
  }, [goalId, taskId]);

  // 換計畫時把畫面上屬於「上一個計畫」的東西全部清掉。載入本身交給下面的
  // focus effect —— load 的識別碼會跟著 goalId / taskId 變，所以它會跟著重跑。
  useEffect(() => {
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
  }, [goalId, taskId]);

  /*
    每次畫面重新取得焦點就重讀。

    這是 P0-8M 的關鍵一環：家長在自己的裝置上確認了換時段之後，孩子回到這個
    詳情頁必須看到新的時段，而不是要重開 App 或重跑 seed。stack screen 在
    push 別的畫面時不會 unmount，所以只靠 mount 時的載入是不夠的。

    卸載時把 generation 往前推一格，飛在路上的回應就不會再寫進已經走掉的畫面。
  */
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => { generationRef.current += 1; };
    }, [load]),
  );

  // 共同計畫的狀態（是不是可協商、有沒有還沒回應的請求）也要跟著 focus 更新，
  // 否則家長回應完之後孩子端還會停在「等一起確認」。
  useFocusEffect(
    useCallback(() => { void refreshSharedPlan(); }, [refreshSharedPlan]),
  );

  const isCompletedToday = useMemo(
    () => completions.some((completion) =>
      dayjs(completion.completed_at).tz(TZ).isSame(dayjs().tz(TZ), 'day'),
    ),
    [completions],
  );

  const presentation = useMemo(() => {
    if (!goal || !task) return null;
    return {
      ...buildGoalPresentation(task, goal, completions, undefined, {
        sharedPlanSupportsPreferredTimeWindow: sharedPlan !== null,
      }),
      preferredTimeWindow: selectedTimeWindow,
    };
  }, [completions, goal, selectedTimeWindow, sharedPlan, task]);

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
        try {
          await enqueueCompletionContextWrite(
            result.completionId,
            () => recordCompletionContext(
              result.completionId,
              selectedTimeWindow,
              null,
            ),
          );
          if (!isCurrentGeneration()) return false;
          setCompletions((current) => current.map((item) =>
            item.id === result.completionId
              ? { ...item, planned_time_window: selectedTimeWindow }
              : item));
        } catch (contextError) {
          if (!isCurrentGeneration()) return false;
          Alert.alert(
            '這次的時段尚未記下',
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
      await enqueueCompletionContextWrite(
        selectedCompletion.id,
        () => recordCompletionContext(selectedCompletion.id, nextWindow, null),
      );
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

  /*
    只有真的讀到一份進行中的共同計畫，才把這條通道交給回顧表單。
    sharedPlan 是 null（一般家長建立的長期任務）時整個 prop 是 undefined，
    回顧維持原本的 local draft 行為。
  */
  const sharedPlanTimeAdjustment = useMemo(() => {
    if (!sharedPlan) return undefined;
    return {
      currentPreferredTime: preferredTimeWindowFromTask(sharedPreferredTime),
      pending: hasOpenRequest,
      submitting: submittingTimeAdjustment,
      error: timeAdjustmentError,
      submitted: timeAdjustmentSubmitted,
      onSubmit: submitTimeAdjustment,
    };
  }, [
    hasOpenRequest,
    sharedPlan,
    sharedPreferredTime,
    submitTimeAdjustment,
    submittingTimeAdjustment,
    timeAdjustmentError,
    timeAdjustmentSubmitted,
  ]);

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
            pendingTimeAdjustmentNotice={
              hasOpenRequest ? '已送給爸媽，等一起確認。' : null
            }
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
            sharedPlanTimeAdjustment={sharedPlanTimeAdjustment}
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
