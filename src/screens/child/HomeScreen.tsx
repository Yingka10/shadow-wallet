import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../App';
import { useTodayTasks, type TodayTask } from '../../hooks/useTodayTasks';
import { useWallet } from '../../hooks/useWallet';
import { useChildProposalReview } from '../../hooks/useChildProposalReview';
import { isChildPlanningReviewCard } from '../../lib/childPlanning/childReview';
import { buildWeeklyProgress, resolveLongTermProgression } from '../../lib/longTerm';
import { buildGoalPresentation } from './longTermGoalPresentation';
import { ChildSharedTermsReviewCard } from '../../components/child/ChildSharedTermsReviewCard';
import BottomNav from '../../components/BottomNav';
import GrassGroundScene from '../../components/child/GrassGroundScene';
import { ChildPlanReviewCard } from '../../components/child/ChildPlanReviewCard';
import { Moon, Star, Firefly, NightHills } from '../../components/child/NightAssets';
import TaskCompleteModal from '../../components/TaskCompleteModal';
import FeedbackAnimation, { type FeedbackType } from '../../components/FeedbackAnimation';
import { decideCompletionFeedback } from './completionFeedback';
import { CoinIcon } from '../../components/icons/TaskIcons';
import { completeTask, createChildTask } from '../../lib/taskActions';
import { PROPOSAL_COPY } from './childProposal/copy';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { webMouseDraggableScroll, webScreen } from '../../constants/webStyles';
import type { AgeGroup, Task } from '../../types/database';

type HomeRoute = RouteProp<RootStackParamList, 'Home'>;
type Nav = StackNavigationProp<RootStackParamList, 'Home'>;

type ModalState = { task: TodayTask | null; visible: boolean };
type FeedbackState = {
  visible: boolean;
  type: FeedbackType;
  value: number;
  periodDone?: number;
  periodTarget?: number | null;
};
type ChildMeta = {
  familyId: string;
  ageGroup: AgeGroup;
  nickname: string;
};
type GoalTone = 'piano' | 'book' | 'sleep' | 'growth';

/**
 * 一筆長期目標「今天可以留紀錄的那一步」，掛進今天要做的清單。
 *
 * 只從 `buildGoalPresentation` 讀 canCompleteToday / todayAction ——
 * 不在這裡重新猜一次今天排不排得上（LT-FINAL-1R §A 的規則：progression
 * 與 availability 只問一次，各畫面各猜一次的結果就是首頁與詳情頁對不上）。
 */
type GoalTodayEntry = {
  id: string;
  taskId: string;
  goalId: string;
  goalName: string;
  actionText: string;
  isCompleted: boolean;
};

const TASK_DIFF_OPTIONS = [1, 1.5, 2, 2.5, 3];

/**
 * 舊的「孩子直接新增任務」入口（createChildTask → 直接 insert tasks/child_tasks）。
 *
 * **P0-2 起關閉。** 孩子端的入口改成提案流程（ChildProposalScreen），
 * 那條路徑走 P0-1 的 proposal 契約，不會建立正式任務、不會發幣。
 *
 * 為什麼是關掉而不是刪掉：這段程式與 taskActions.createChildTask 都還在，
 * 之後如果需要一個「家長在孩子裝置上直接補一筆」的路徑，這裡是現成的。
 * 直接刪掉會連同它踩過的坑（due date 換算、recurrence 映射）一起消失。
 *
 * ⚠️ 改成 true 之前先想清楚：Demo 使用者會因此看到兩個很像的入口，
 *    而其中一個會直接建立正式任務、繞過家長確認。
 */
const LEGACY_CHILD_TASK_ENTRY_ENABLED = false;

type AddTaskType = 'temp' | 'recurring';
type DueOption = 'today' | 'tomorrow' | 'dayAfter' | 'thisWeek';
const DUE_LABELS: Record<DueOption, string> = {
  today: '今天', tomorrow: '明天', dayAfter: '後天', thisWeek: '本週日',
};
const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const TZ = 'Asia/Taipei';

function getDueDateStr(option: DueOption): string {
  const today = dayjs().tz(TZ);
  if (option === 'tomorrow') return today.add(1, 'day').format('YYYY-MM-DD');
  if (option === 'dayAfter') return today.add(2, 'day').format('YYYY-MM-DD');
  if (option === 'thisWeek') {
    const dow = today.day();
    return today.add(dow === 0 ? 7 : 7 - dow, 'day').format('YYYY-MM-DD');
  }
  return today.format('YYYY-MM-DD');
}

function formatCountdown(dueDate: string | null): string {
  if (!dueDate) return '';
  const now = dayjs().tz(TZ);
  const due = dayjs.tz(dueDate, TZ).endOf('day');
  const diffH = due.diff(now, 'hour');
  if (diffH <= 0) return '今天截止';
  if (diffH < 24) return `剩 ${diffH} 小時`;
  return `剩 ${Math.ceil(diffH / 24)} 天`;
}
const HOME = {
  primaryGreen: '#A8C686',
  successGreen: '#8DC76A',
  honeyGold: '#F2C14E',
  background: '#F8F6F1',
  textPrimary: '#3B332A',
  textSecondary: '#8C7B6A',
  border: '#ECE5D8',
  card: '#FFFDF8',
  grass: '#CFE7A7',
};

// 晚安模式 —— 只有 hero 換成夜景（深藍天空＋月亮＋星星＋螢火＋月光草坡），
// 下方內容區維持亮色不動。觸發條件：問候語 = 晚安（見 getGreeting）。
const NIGHT = {
  sky: ['#132747', '#243D63', '#4C6079'] as const,   // hero 天空漸層（深藍 → 地平線偏灰藍）
  dayHero: ['#E7F5EC', '#F9F1C9', '#DDECB8'] as const,
  greeting: '#FDFBF4',
  tagline: '#D3DCEA',
  moonGlow: 'rgba(246,228,160,0.30)',   // 月亮外暈（補原檔被拿掉的 glow filter）
};

// 夜空星星（裝飾用，hero 座標系內的 px；size = 渲染大小）
const NIGHT_STARS: Array<{ top: number; left: number; size: number; opacity: number }> = [
  { top: 14, left: 66, size: 13, opacity: 0.75 },
  { top: 44, left: 150, size: 16, opacity: 0.9 },
  { top: 82, left: 214, size: 13, opacity: 0.7 },
  { top: 30, left: 250, size: 15, opacity: 0.8 },
  { top: 108, left: 60, size: 12, opacity: 0.65 },
  { top: 96, left: 128, size: 12, opacity: 0.6 },
  { top: 60, left: 300, size: 14, opacity: 0.7 },
];

// 螢火蟲暖光（近樹屋／草坡處，畫在樹前）
const NIGHT_FIREFLIES: Array<{ top: number; left: number; size: number; opacity: number }> = [
  { top: 150, left: 244, size: 30, opacity: 0.95 },
  { top: 188, left: 296, size: 24, opacity: 0.8 },
  { top: 168, left: 196, size: 22, opacity: 0.8 },
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return '早安';
  if (h < 18) return '午安';
  return '晚安';
}

function calcDisplayCoin(task: Task, isPrerequisiteMet: boolean): number {
  if (task.category !== 'C') return 0;
  const base = task.coin_override ?? Math.round(task.base_time_min * task.difficulty);
  return Math.round(base * (isPrerequisiteMet ? 1 : 0.7));
}

/**
 * 卡片的外觀。**名字由孩子決定，這裡只挑顏色。**
 *
 * ⚠️ 這一支以前會照名稱把「每天練琴 15 分鐘」改成「鋼琴家之路」、
 *    把孩子寫的閱讀計畫改成「小書蟲計畫」。那不是外觀，那是**替他的
 *    計畫重新命名** —— 而整條 P1 都在保證「你的做法沒有被改掉」，
 *    結果首頁第一眼就把標題換掉了。
 *
 *    色系改由 task.category 決定（結構化欄位，不是內容），
 *    標題一律 task.name。
 */
function getGoalTone(task: TodayTask): { tone: GoalTone; icon: string } {
  if (task.category === 'D') return { tone: 'book', icon: '📚' };
  if (task.category === 'B') return { tone: 'sleep', icon: '🤝' };
  if (task.category === 'A') return { tone: 'piano', icon: '☀️' };
  return { tone: 'growth', icon: '🌱' };
}

/**
 * 首頁那張卡上的進度。**與詳情頁共用同一個 progression resolver。**
 *
 * ⚠️ 之前這裡是 `goal_type === 'skill' ? 級 : current_day / total_days`。
 *    兩個判準都是錯的：`goal_type` 不決定進度（它由兩條路徑寫），
 *    而 `current_day` 建立後從來沒有被遞增過 —— 一份每天都有在做的
 *    共同計畫，首頁永遠顯示 0%。
 *
 *    真實進度只有一個來源：task_completions（由 useTodayTasks 批次查回）。
 */
function getGoalProgress(task: TodayTask): { label: string; pct: number } {
  const goal = task.goal;
  if (!goal) return { label: '還沒安排週期', pct: 0 };

  const progression = resolveLongTermProgression(task, goal);

  if (progression === 'staged') {
    const total = Math.max(goal.level_count ?? goal.level_definitions?.length ?? 1, 1);
    const current = Math.min(goal.current_level ?? 0, total);
    return { label: `第 ${current} / ${total} 階段`, pct: current / total };
  }

  if (progression === 'accumulation') {
    const total = Math.max(Number(goal.target_value ?? 0), 1);
    const current = Math.max(Number(goal.current_value ?? 0), 0);
    const unit = goal.value_unit?.trim() ?? '';
    return {
      label: `${current} / ${total}${unit ? ` ${unit}` : ''}`,
      pct: Math.min(current / total, 1),
    };
  }

  if (progression === 'rhythm' || progression === 'fixed_days') {
    const target = progression === 'rhythm'
      ? Number(task.weekly_frequency ?? 0)
      : (goal.active_days ?? task.recurrence_days ?? []).length;
    const weekly = buildWeeklyProgress(task.weekCompletions ?? [], target);
    return {
      // 超過約定次數時講「本週完成 4 次 · 原本約定 3 次」，不寫 4/3。
      label: weekly.weekExtra > 0
        ? `${weekly.label} · 約定 ${weekly.weekTarget} 次`
        : weekly.label,
      pct: weekly.weekTarget > 0
        ? Math.min(weekly.weekCompletedActual / weekly.weekTarget, 1)
        : 0,
    };
  }

  return { label: '還沒安排週期', pct: 0 };
}

/**
 * 任務圖示。**只看 category，不看名稱。**
 *
 * ⚠️ 之前會因為名字裡有「碗」「垃圾」「鋼琴」換圖示 —— 那是內容嗅探，
 *    而且會在孩子自己命名的計畫上猜錯。同一條規則已經在 getGoalTone
 *    上拔過一次（P1-FINAL）。
 */
function taskIcon(task: TodayTask): string {
  if (task.category === 'C') return '🤝';
  if (task.category === 'A') return '☀️';
  if (task.category === 'D') return '📚';
  return '🌿';
}

function taskRewardText(task: TodayTask, isPrerequisiteMet: boolean): string {
  if (task.category === 'C') return `+${calcDisplayCoin(task, isPrerequisiteMet)} 枚金幣`;
  // D 類的幣值是家長直接設定（coin_override），不是 calcDisplayCoin 那套
  // C 專用、看前置任務打折的公式 —— 兩條式子刻意不共用。
  if (task.category === 'D' && task.coin_override) return `+${task.coin_override} 枚金幣`;
  if (task.category === 'B' && task.time_saving_min > 0) return `省 ${task.time_saving_min} 分鐘`;
  return '完成打卡';
}

export default function HomeScreen() {
  const route = useRoute<HomeRoute>();
  const navigation = useNavigation<Nav>();
  const { childId } = route.params;

  const { weekdayTasks, weekendTasks, longTermTasks, tempTasks, isPrerequisiteMet, loading, refresh } =
    useTodayTasks(childId);
  const { spending } = useWallet(childId);
  const coinBalance = spending?.balance ?? 0;

  const [modal, setModal] = useState<ModalState>({ task: null, visible: false });
  const [feedback, setFeedback] = useState<FeedbackState>({ visible: false, type: 'task-a', value: 0 });
  const [childMeta, setChildMeta] = useState<ChildMeta | null>(null);
  const {
    reviews: proposalReviews,
    loading: proposalReviewLoading,
    error: proposalReviewError,
    refresh: refreshProposalReviews,
    accept: acceptProposalReview,
    requestChanges: requestProposalChanges,
    actingProposalId,
    actionError: proposalReviewActionError,
    successMessage: proposalReviewSuccess,
  } = useChildProposalReview(
    childId,
    childMeta?.familyId ?? null,
    childMeta?.ageGroup ?? null,
  );

  const [addTaskVisible, setAddTaskVisible] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState<'B' | 'C'>('B');
  const [newTaskTime, setNewTaskTime] = useState('');
  const [newTaskDifficulty, setNewTaskDifficulty] = useState(1);
  const [creatingTask, setCreatingTask] = useState(false);
  const [addTaskType, setAddTaskType] = useState<AddTaskType>('temp');
  const [dueOption, setDueOption] = useState<DueOption>('today');
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const coinPulse = useSharedValue(1);
  const treePulse = useSharedValue(1);
  const treeSway = useSharedValue(0);

  // 樹的微風搖擺（PNG 無法單獨動葉子，改讓整棵樹極輕微擺動 → 有生命感、不死板）
  useEffect(() => {
    treeSway.value = withRepeat(
      withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [treeSway]);

  const coinAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: coinPulse.value }],
  }));
  const treeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: treePulse.value },
      { rotate: `${(treeSway.value - 0.5) * 1.6}deg` },
    ],
  }));

  const isWeekend = [0, 6].includes(new Date().getDay());
  const shortTermTasks = isWeekend ? weekendTasks : weekdayTasks;
  const dutyTasks = shortTermTasks.filter(t => t.category === 'A' || t.category === 'B');
  const contributionTasks = shortTermTasks.filter(t => t.category === 'C');
  // 短期的 D 類（學習與技能，例如「練鋼琴 30 分鐘」）之前完全沒有進這個清單 ——
  // 不是設計選擇，是舊碼只挑了 A/B/C 三桶。CHILD-HOME-DEMO-POLISH 需要
  // 「學習/技能也有成長回饋」這個角色在今天要做的裡看得到，所以補上第四桶。
  const growthTasks = shortTermTasks.filter(t => t.category === 'D');
  const todayTasks = [...dutyTasks, ...contributionTasks, ...growthTasks];
  const todayDone = todayTasks.filter(t => t.isCompleted).length;
  const todayTotal = todayTasks.length;
  const allCount = todayTotal + longTermTasks.length;
  const isEmpty = allCount === 0 && !loading;
  const todayEarned = contributionTasks
    .filter(task => task.isCompleted)
    .reduce((sum, task) => sum + calcDisplayCoin(task, isPrerequisiteMet), 0);
  const visibleLongTermTasks = longTermTasks.filter(task => task.goal).slice(0, 6);
  const goalTodayEntries: GoalTodayEntry[] = useMemo(
    () => visibleLongTermTasks.reduce<GoalTodayEntry[]>((entries, task) => {
      if (!task.goal) return entries;
      const presentation = buildGoalPresentation(task, task.goal, task.weekCompletions ?? []);
      if (!presentation.canCompleteToday && !presentation.sessionEvidence.checkedInToday) {
        return entries;
      }
      entries.push({
        id: task.id,
        taskId: task.id,
        goalId: task.goal.id,
        goalName: presentation.headerTitle,
        actionText: presentation.todayAction,
        isCompleted: presentation.sessionEvidence.checkedInToday,
      });
      return entries;
    }, []),
    [visibleLongTermTasks],
  );
  const nickname = childMeta?.nickname ?? '小朋友';
  const greeting = getGreeting();
  const isNight = greeting === '晚安';   // 問候語變晚安 → hero 切夜景
  const remainingToday = Math.max(todayTotal - todayDone, 0);
  const treeStage = Math.min(5, Math.max(1, Math.ceil((coinBalance + todayDone * 12) / 80)));

  useEffect(() => {
    void loadChildMeta();
  }, [childId]);

  useEffect(() => {
    coinPulse.value = withSequence(
      withTiming(1.08, { duration: 420 }),
      withTiming(1, { duration: 420 }),
    );
  }, [coinBalance, coinPulse]);

  async function loadChildMeta() {
    try {
      const { data, error } = await supabase
        .from('children')
        .select('family_id, age_group, nickname')
        .eq('id', childId)
        .single();

      if (error) throw error;
      if (data) {
        setChildMeta({
          familyId: data.family_id,
          ageGroup: data.age_group,
          nickname: data.nickname,
        });
      }
    } catch (err) {
      console.error('[HomeScreen] loadChildMeta error:', err);
    }
  }

  const openAddTask = useCallback(() => {
    setNewTaskName('');
    setNewTaskCategory('B');
    setNewTaskTime('');
    setNewTaskDifficulty(1);
    setAddTaskType('temp');
    setDueOption('today');
    setRecurrenceDays([1, 2, 3, 4, 5]);
    setAddTaskVisible(true);
  }, []);

  const toggleDay = useCallback((dow: number) => {
    setRecurrenceDays(prev =>
      prev.includes(dow) ? prev.filter(d => d !== dow) : [...prev, dow],
    );
  }, []);

  const submitAddTask = useCallback(async () => {
    if (!childMeta) {
      Alert.alert('資料還在載入', '請稍後再試');
      return;
    }
    const trimmedName = newTaskName.trim();
    const timeMin = Number.parseInt(newTaskTime, 10);
    if (!trimmedName) {
      Alert.alert('請輸入任務名稱', '至少要有一個清楚的名字');
      return;
    }
    if (!Number.isFinite(timeMin) || timeMin < 1) {
      Alert.alert('時間不正確', '請輸入大於 0 的分鐘數');
      return;
    }
    if (addTaskType === 'recurring' && recurrenceDays.length === 0) {
      Alert.alert('請選擇出現日', '至少要選一天');
      return;
    }
    setCreatingTask(true);
    try {
      if (addTaskType === 'temp') {
        await createChildTask({
          familyId: childMeta.familyId,
          childId,
          ageGroup: childMeta.ageGroup,
          name: trimmedName,
          category: newTaskCategory,
          baseTimeMin: timeMin,
          difficulty: newTaskCategory === 'C' ? newTaskDifficulty : 1,
          dayType: 'once',
          dueDate: getDueDateStr(dueOption),
        });
      } else {
        await createChildTask({
          familyId: childMeta.familyId,
          childId,
          ageGroup: childMeta.ageGroup,
          name: trimmedName,
          category: newTaskCategory,
          baseTimeMin: timeMin,
          difficulty: newTaskCategory === 'C' ? newTaskDifficulty : 1,
          dayType: 'custom',
          recurrenceDays,
        });
      }
      setAddTaskVisible(false);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '建立失敗';
      Alert.alert('新增任務失敗', msg);
    } finally {
      setCreatingTask(false);
    }
  }, [childMeta, childId, addTaskType, newTaskCategory, newTaskDifficulty, newTaskName, newTaskTime, dueOption, recurrenceDays, refresh]);

  const openModal = useCallback((task: TodayTask) => {
    setModal({ task, visible: true });
  }, []);

  const closeModal = useCallback(() => {
    setModal(prev => ({ ...prev, visible: false }));
  }, []);

  const handleConfirm = useCallback(
    async (completedDate: string) => {
      if (!modal.task) return;
      const task: Task = modal.task;
      let result;
      try {
        result = await completeTask(
          task.id,
          childId,
          completedDate,
          isPrerequisiteMet,
          task,
          modal.task.goal?.id,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : '完成任務失敗';
        Alert.alert('無法完成任務', msg);
        return;
      }
      closeModal();
      treePulse.value = withSequence(
        withTiming(1.05, { duration: 220 }),
        withTiming(0.99, { duration: 140 }),
        withTiming(1, { duration: 180 }),
      );
      // 「這一次有沒有發幣」的判斷在 decideCompletionFeedback 裡，有自己的測試。
      // 規則只有一條：有 settlement 才出現幣值畫面。
      setFeedback({ visible: true, ...decideCompletionFeedback(result, task.category) });
    },
    [modal.task, childId, isPrerequisiteMet, closeModal, treePulse],
  );

  const handleFeedbackComplete = useCallback(() => {
    setFeedback(prev => ({ ...prev, visible: false }));
    refresh();
  }, [refresh]);

  const progressSummary = useMemo(
    () => `今天 ${todayDone}/${todayTotal}`,
    [todayDone, todayTotal],
  );

  return (
    <View style={webScreen}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <LinearGradient
          colors={[HOME.background, '#FFFDF8', '#FFF8EE']}
          locations={[0, 0.58, 1]}
          style={StyleSheet.absoluteFill}
        />

        <ScrollView
          style={[styles.scroll, webMouseDraggableScroll]}
          contentContainerStyle={[styles.scrollContent, styles.scrollContentWithNav]}
          refreshControl={
            <RefreshControl
              refreshing={loading || proposalReviewLoading}
              onRefresh={() => { refresh(); void refreshProposalReviews(); }}
              tintColor={HOME.primaryGreen}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={isNight ? NIGHT.sky : NIGHT.dayHero}
            locations={isNight ? [0, 0.5, 1] : [0, 0.62, 1]}
            style={[styles.hero, isNight && styles.heroNight]}
          >
            {isNight && <NightStars />}
            {isNight && (
              <View pointerEvents="none" style={styles.nightHillsLayer}>
                <NightHills height={120} />
              </View>
            )}

            <View style={styles.heroCopy}>
              <Text style={[styles.greeting, isNight && styles.greetingNight]}>{greeting}，{nickname}！</Text>
              <Text style={[styles.tagline, isNight && styles.taglineNight]}>今天也是成長的一天</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.86}
              onPress={() => navigation.navigate('Wallet', { childId })}
              accessibilityLabel={`前往撲滿，金幣餘額 ${coinBalance}`}
              style={[styles.coinCardTouch, isNight && styles.coinCardTouchNight]}
            >
              <Animated.View style={[styles.coinCard, coinAnimatedStyle]}>
                <View style={styles.coinGlow}>
                  <CoinIcon size={40} />
                </View>
                <View style={styles.coinTextWrap}>
                  <View style={styles.coinAmountRow}>
                    <Text style={styles.coinNumber}>{coinBalance}</Text>
                    <Text style={styles.coinUnit}>幣</Text>
                  </View>
                  <View style={styles.coinTodayPill}>
                    <Text style={styles.coinSparkle}>✨</Text>
                    <Text style={styles.coinToday}>今天 +{todayEarned}</Text>
                  </View>
                </View>
              </Animated.View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.diaryBadge}
              onPress={() => navigation.navigate('Wish', { childId })}
              accessibilityLabel="前往成長日記"
            >
              <CoinIcon size={20} />
              <Text style={styles.diaryText}>成長日記</Text>
            </TouchableOpacity>

            {isNight && <NightMoon />}

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => navigation.navigate('Wish', { childId })}
              style={[styles.treeTouch, isNight && styles.treeTouchNight]}
              accessibilityLabel={`前往許願樹，第 ${treeStage} 階段`}
            >
              <Animated.View style={[styles.treeWrap, isNight && styles.treeWrapNight, treeAnimatedStyle]}>
                {isNight ? (
                  <Image
                    source={require('../../../assets/images/child/treehouse-night.png')}
                    style={styles.treeHouseImg}
                    resizeMode="contain"
                  />
                ) : (
                  <GrowthTreeIllustration stage={treeStage} fruitCount={Math.min(5, Math.max(1, Math.ceil(coinBalance / 40)))} />
                )}
              </Animated.View>
            </TouchableOpacity>

            {isNight && <NightFireflies />}

            <View style={styles.ground} pointerEvents="none">
              <GrassGroundScene height={116} variant={isNight ? 'night' : 'day'} />
            </View>
          </LinearGradient>

          <View style={styles.progressPill}>
            <View style={styles.progressTitleRow}>
              <View style={styles.progressIconBubble}>
                <Text style={styles.progressLeaf}>🌿</Text>
              </View>
              <Text style={styles.progressText}>{progressSummary}</Text>
            </View>
            <ProgressDots done={todayDone} total={Math.max(todayTotal, 7)} />
          </View>

          <View style={styles.section}>
            <SectionTitle icon="🌱" title="我的成長目標" action="查看全部" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.goalList}
            >
              {visibleLongTermTasks.map(task => (
                <GoalCard
                  key={task.id}
                  task={task}
                  onPress={() =>
                    navigation.navigate('LongTermDetail', {
                      goalId: task.goal!.id,
                      taskId: task.id,
                      taskName: task.name,
                    })
                  }
                />
              ))}
              {/*
                孩子端唯一的「我有想做的事」入口，緊接在成長目標卡片後面。
                走提案流程 —— 不建立正式任務、不發幣，家長之後一起確認。
                舊的直接建立任務入口見 LEGACY_CHILD_TASK_ENTRY_ENABLED。
                這張卡是 UI 邀請，不是 visibleLongTermTasks 的一員 ——
                不讀 goal 資料，永遠顯示。
              */}
              <AddGoalCard onPress={() => navigation.navigate('ChildProposal', { childId })} />
            </ScrollView>
          </View>

          <View style={styles.section}>
            <SectionTitle icon="☀️" title="今天要做的" action={`${remainingToday} 件任務`} />
            {loading ? (
              <ActivityIndicator color={HOME.primaryGreen} style={styles.sectionLoading} />
            ) : todayTasks.length > 0 || goalTodayEntries.length > 0 ? (
              <View style={styles.taskList}>
                {goalTodayEntries.map(entry => (
                  <GoalActionRow
                    key={entry.id}
                    entry={entry}
                    onPress={() =>
                      navigation.navigate('LongTermDetail', {
                        goalId: entry.goalId,
                        taskId: entry.taskId,
                        taskName: entry.goalName,
                      })
                    }
                  />
                ))}
                {todayTasks.map(task => (
                  <TodayTaskRow
                    key={task.id}
                    task={task}
                    isPrerequisiteMet={isPrerequisiteMet}
                    onPress={() => openModal(task)}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <SproutMini />
                <Text style={styles.emptyTitle}>今天全部完成了！</Text>
                <Text style={styles.emptySub}>小樹正在安靜長高</Text>
              </View>
            )}
          </View>

          {tempTasks.length > 0 && (
            <View style={styles.section}>
              <SectionTitle icon="⏳" title="臨時任務" action={`${tempTasks.length} 件`} />
              <View style={styles.taskList}>
                {tempTasks.map(task => (
                  <TempTaskRow
                    key={task.id}
                    task={task}
                    isPrerequisiteMet={isPrerequisiteMet}
                    onPress={() => openModal(task)}
                  />
                ))}
              </View>
            </View>
          )}

          {isEmpty ? null : (
            <View style={styles.encourageLine}>
              <Text style={styles.encourageText}>🍃 完成任務讓小樹長得更茂盛吧！ 🍃</Text>
            </View>
          )}

          <View style={styles.feedbackGrid}>
            <LinearGradient
              testID="growth-feedback-card"
              colors={['#DFF1BF', '#F9F5D2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.growthFeedback}
            >
              <View style={styles.feedbackCopy}>
                <Text style={styles.feedbackSmall}>你已經累積了</Text>
                <Text style={styles.feedbackBig}>{coinBalance} 枚金幣！</Text>
                <Text style={styles.feedbackNote}>繼續努力，讓成長樹長出更多果實吧！</Text>
              </View>
              <WateringSprite />
            </LinearGradient>

            <TouchableOpacity
              testID="reward-card"
              activeOpacity={0.86}
              style={styles.rewardCard}
              onPress={() => navigation.navigate('Wallet', { childId })}
            >
              <View>
                <Text style={styles.rewardTitle}>兌換獎勵</Text>
                <Text style={styles.rewardSub}>去看看有什麼</Text>
              </View>
              <ChestIcon />
            </TouchableOpacity>
          </View>

          {proposalReviewSuccess && <Text style={styles.reviewSuccess}>{proposalReviewSuccess}</Text>}
          {/*
            P1 與 legacy 是兩張卡片，不是一張帶旗標的。
            P1 那張要說「你的做法沒有被改掉」，而那句話對 P0 的家長
            調整版不成立（那條路徑本來就可以改完成標準）。
            路由只看 authorship 與 lineage —— **不看它此刻能不能按**。
            一份現在按不了的 P1 草案還是 P1 的；拿「能不能按」當路由條件，
            它會掉進 legacy 那張卡片，而那條路的終點是一個永遠失敗的按鈕。
          */}
          {proposalReviews[0] && (
            isChildPlanningReviewCard(proposalReviews[0]) ? (
              <ChildSharedTermsReviewCard
                review={proposalReviews[0]}
                saving={actingProposalId === proposalReviews[0].proposal.id}
                error={proposalReviewActionError}
                onAccept={() => {
                  void acceptProposalReview(proposalReviews[0]).then(completed => {
                    if (completed) refresh();
                  });
                }}
                onRequestChanges={reason => {
                  void requestProposalChanges(proposalReviews[0], reason);
                }}
                onRetry={() => { void refreshProposalReviews(); }}
              />
            ) : (
              <ChildPlanReviewCard
                review={proposalReviews[0]}
                saving={actingProposalId === proposalReviews[0].proposal.id}
                error={proposalReviewActionError}
                onAccept={() => {
                  void acceptProposalReview(proposalReviews[0]).then(completed => {
                    if (completed) refresh();
                  });
                }}
                onRequestChanges={() => { void requestProposalChanges(proposalReviews[0]); }}
                onRetry={() => { void refreshProposalReviews(); }}
              />
            )
          )}
          {proposalReviewError && proposalReviews.length === 0 && (
            <View style={styles.reviewError}>
              <Text style={styles.reviewErrorText}>讀取要一起看的安排失敗</Text>
              <TouchableOpacity onPress={() => { void refreshProposalReviews(); }}>
                <Text style={styles.reviewRetry}>重新看看</Text>
              </TouchableOpacity>
            </View>
          )}

          {LEGACY_CHILD_TASK_ENTRY_ENABLED ? (
            <TouchableOpacity style={styles.addRow} onPress={openAddTask} activeOpacity={0.72}>
              <View style={styles.addPlus}>
                <Text style={styles.addPlusText}>＋</Text>
              </View>
              <Text style={styles.addRowText}>新增任務</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>

        <BottomNav
          activeTab="home"
          onTabPress={tab => {
            if (tab === 'wallet') {
              navigation.navigate('Wallet', { childId });
              return;
            }
            if (tab === 'wish') {
              navigation.navigate('Wish', { childId });
              return;
            }
            if (tab === 'profile') {
              navigation.navigate('Profile', { childId });
            } else if (tab !== 'home') {
              Alert.alert('功能開發中', '即將推出！');
            }
          }}
        />

        {feedback.visible && (
          <View pointerEvents="none" style={styles.inlineCelebration}>
            <MotiView
              from={{ opacity: 0, translateY: 20, scale: 0.8 }}
              animate={{ opacity: 1, translateY: -80, scale: 1 }}
              transition={{ type: 'timing', duration: 900 }}
              style={styles.flyingCoin}
            >
              <CoinIcon size={28} />
            </MotiView>
            <MotiView
              from={{ opacity: 0, translateY: 8, rotate: '-14deg' }}
              animate={{ opacity: 1, translateY: -52, rotate: '8deg' }}
              transition={{ type: 'timing', duration: 850, delay: 120 }}
              style={styles.flyingLeaf}
            >
              <LeafSvg />
            </MotiView>
          </View>
        )}

        <TaskCompleteModal
          visible={modal.visible}
          task={modal.task}
          isPrerequisiteMet={isPrerequisiteMet}
          goal={modal.task?.goal}
          onConfirm={handleConfirm}
          onClose={closeModal}
        />

        <FeedbackAnimation
          visible={feedback.visible}
          type={feedback.type}
          value={feedback.value}
          periodDone={feedback.periodDone}
          periodTarget={feedback.periodTarget}
          onComplete={handleFeedbackComplete}
        />

        {/* 舊的新增任務表單。LEGACY_CHILD_TASK_ENTRY_ENABLED = false 時不掛載。 */}
        <Modal
          visible={LEGACY_CHILD_TASK_ENTRY_ENABLED && addTaskVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setAddTaskVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setAddTaskVisible(false)}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.sheetWrap}
            >
              <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>新增任務</Text>

                {/* 任務種類切換 */}
                <View style={styles.taskTypeRow}>
                  {(['temp', 'recurring'] as AddTaskType[]).map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.taskTypeBtn, addTaskType === t && styles.taskTypeBtnActive]}
                      onPress={() => setAddTaskType(t)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.taskTypeText, addTaskType === t && styles.taskTypeTextActive]}>
                        {t === 'temp' ? '⏰ 臨時任務' : '🔁 週期任務'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 任務名稱 */}
                <Text style={styles.fieldLabel}>任務名稱</Text>
                <TextInput
                  style={styles.input}
                  value={newTaskName}
                  onChangeText={setNewTaskName}
                  placeholder="例如：整理書包"
                  placeholderTextColor={HOME.textSecondary}
                />

                {/* 任務分類 B / C */}
                <Text style={styles.fieldLabel}>任務分類</Text>
                <View style={styles.segmentRow}>
                  {(['B', 'C'] as const).map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.segmentBtn, newTaskCategory === cat && styles.segmentBtnActive]}
                      onPress={() => setNewTaskCategory(cat)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.segmentText, newTaskCategory === cat && styles.segmentTextActive]}>
                        {cat === 'B' ? '本分（不發幣）' : '貢獻（發幣）'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 臨時任務：截止日期 */}
                {addTaskType === 'temp' && (
                  <>
                    <Text style={styles.fieldLabel}>截止日期</Text>
                    <View style={styles.dueRow}>
                      {(Object.keys(DUE_LABELS) as DueOption[]).map(opt => (
                        <TouchableOpacity
                          key={opt}
                          style={[styles.dueBtn, dueOption === opt && styles.dueBtnActive]}
                          onPress={() => setDueOption(opt)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.dueBtnText, dueOption === opt && styles.dueBtnTextActive]}>
                            {DUE_LABELS[opt]}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* 週期任務：出現日 */}
                {addTaskType === 'recurring' && (
                  <>
                    <Text style={styles.fieldLabel}>出現在哪幾天</Text>
                    <View style={styles.dayRow}>
                      {DAY_LABELS.map((label, dow) => (
                        <TouchableOpacity
                          key={dow}
                          style={[styles.dayBtn, recurrenceDays.includes(dow) && styles.dayBtnActive]}
                          onPress={() => toggleDay(dow)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.dayBtnText, recurrenceDays.includes(dow) && styles.dayBtnTextActive]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* 預估時間 */}
                <Text style={styles.fieldLabel}>預估時間（分鐘）</Text>
                <TextInput
                  style={styles.input}
                  value={newTaskTime}
                  onChangeText={setNewTaskTime}
                  placeholder="例如：10"
                  placeholderTextColor={HOME.textSecondary}
                  keyboardType="number-pad"
                />

                {/* 難度（僅 C 類） */}
                {newTaskCategory === 'C' && (
                  <>
                    <Text style={styles.fieldLabel}>難度</Text>
                    <View style={styles.diffRow}>
                      {TASK_DIFF_OPTIONS.map(option => (
                        <TouchableOpacity
                          key={option}
                          style={[styles.diffBtn, newTaskDifficulty === option && styles.diffBtnActive]}
                          onPress={() => setNewTaskDifficulty(option)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.diffText, newTaskDifficulty === option && styles.diffTextActive]}>
                            {option}x
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={[styles.submitBtn, creatingTask && styles.submitBtnDisabled]}
                  onPress={submitAddTask}
                  disabled={creatingTask}
                  activeOpacity={0.85}
                >
                  <Text style={styles.submitBtnText}>
                    {creatingTask ? '建立中...' : '建立任務'}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

function SectionTitle({ icon, title, action }: { icon: string; title: string; action?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleWrap}>
        <Text style={styles.sectionIcon}>{icon}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action ? <Text style={styles.sectionAction}>{action}</Text> : null}
    </View>
  );
}

function ProgressDots({ done, total }: { done: number; total: number }) {
  const dots = Array.from({ length: Math.min(Math.max(total, 7), 9) });
  return (
    <View style={styles.dotRow}>
      {dots.map((_, index) => {
        const active = index < done;
        return (
          <MotiView
            key={index}
            from={{ scale: 0.85, opacity: 0.55 }}
            animate={{ scale: active ? 1 : 0.92, opacity: 1 }}
            transition={{ type: 'timing', duration: 260, delay: index * 35 }}
            style={[styles.progressDot, active && styles.progressDotActive]}
          />
        );
      })}
    </View>
  );
}

function GoalCard({ task, onPress }: { task: TodayTask; onPress: () => void }) {
  const info = getGoalTone(task);
  const progress = getGoalProgress(task);

  return (
    <TouchableOpacity activeOpacity={0.86} style={styles.goalCard} onPress={onPress}>
      <View style={[styles.goalArt, styles[`goalArt_${info.tone}`]]}>
        <Text style={styles.goalIcon}>{info.icon}</Text>
      </View>
      <Text style={styles.goalTitle} numberOfLines={1}>{task.name}</Text>
      <Text style={styles.goalDays}>{progress.label}</Text>
      <View style={styles.goalTrack}>
        <MotiView
          from={{ width: '0%' }}
          animate={{ width: `${progress.pct * 100}%` }}
          transition={{ type: 'timing', duration: 520 }}
          style={styles.goalFill}
        />
      </View>
    </TouchableOpacity>
  );
}

/**
 * 成長目標橫列最後一張卡：孩子端唯一的提案入口。
 *
 * 填色卡片（不是虛線佔位感）—— 跟真的 GoalCard 同一個圓角家族與陰影，
 * 用實心圖示圈與沒有進度條這兩件事，讓人一眼看出這張不是 goal 資料，
 * 是一個邀請。
 */
function AddGoalCard({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      testID="child-proposal-entry"
      activeOpacity={0.86}
      style={styles.addGoalCard}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={PROPOSAL_COPY.entry}
    >
      <View style={styles.addGoalPlus}>
        <Text style={styles.addGoalPlusText}>＋</Text>
      </View>
      <Text style={styles.addGoalTitle}>{PROPOSAL_COPY.entry}</Text>
      <Text style={styles.addGoalHint}>說說你想做到的事</Text>
    </TouchableOpacity>
  );
}

/**
 * 今天要做的清單裡，屬於某個長期目標的那一列。
 *
 * 跟 TodayTaskRow 共用同一組卡片樣式，但多一行成長目標標籤，
 * 讓人一眼看出這件事屬於哪個目標；點下去導去目標詳情，不是完成 modal ——
 * 長期任務的紀錄流程（時段等）只有詳情頁有。
 */
function GoalActionRow({ entry, onPress }: { entry: GoalTodayEntry; onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={onPress}
      style={[styles.taskRow, entry.isCompleted && styles.taskRowDone]}
    >
      <View style={[styles.checkbox, entry.isCompleted && styles.checkboxDone]}>
        {entry.isCompleted ? <Text style={styles.checkboxCheck}>✓</Text> : null}
      </View>
      <Text style={styles.taskEmoji}>🌱</Text>
      <View style={styles.taskCopy}>
        <Text style={styles.goalTagText} numberOfLines={1}>🌱 {entry.goalName}</Text>
        <Text
          style={[styles.taskName, entry.isCompleted && styles.taskNameDone]}
          numberOfLines={2}
        >
          {entry.actionText}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function TodayTaskRow({
  task,
  isPrerequisiteMet,
  onPress,
}: {
  task: TodayTask;
  isPrerequisiteMet: boolean;
  onPress: () => void;
}) {
  const disabled = task.isCompleted && !task.allow_repeat;
  return (
    <TouchableOpacity
      activeOpacity={0.78}
      disabled={disabled}
      onPress={onPress}
      style={[styles.taskRow, task.isCompleted && styles.taskRowDone]}
    >
      <View style={[styles.checkbox, task.isCompleted && styles.checkboxDone]}>
        {task.isCompleted ? <Text style={styles.checkboxCheck}>✓</Text> : null}
      </View>
      <Text style={styles.taskEmoji}>{taskIcon(task)}</Text>
      <View style={styles.taskCopy}>
        <Text style={[styles.taskName, task.isCompleted && styles.taskNameDone]} numberOfLines={2}>
          {task.name}
        </Text>
        <Text style={styles.taskReward}>🪙 {taskRewardText(task, isPrerequisiteMet)}</Text>
      </View>
      {task.category === 'C' || (task.category === 'D' && task.coin_override) ? (
        <View style={styles.taskRewardValue}>
          <Text style={styles.taskCoinText}>
            +{task.category === 'C' ? calcDisplayCoin(task, isPrerequisiteMet) : task.coin_override} 🪙
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function TempTaskRow({
  task,
  isPrerequisiteMet,
  onPress,
}: {
  task: TodayTask;
  isPrerequisiteMet: boolean;
  onPress: () => void;
}) {
  const disabled = task.isCompleted && !task.allow_repeat;
  const countdown = formatCountdown(task.due_date);
  return (
    <TouchableOpacity
      activeOpacity={0.78}
      disabled={disabled}
      onPress={onPress}
      style={[styles.taskRow, task.isCompleted && styles.taskRowDone]}
    >
      <View style={[styles.checkbox, task.isCompleted && styles.checkboxDone]}>
        {task.isCompleted ? <Text style={styles.checkboxCheck}>✓</Text> : null}
      </View>
      <Text style={styles.taskEmoji}>{taskIcon(task)}</Text>
      <View style={styles.taskCopy}>
        <Text style={[styles.taskName, task.isCompleted && styles.taskNameDone]} numberOfLines={2}>
          {task.name}
        </Text>
        <Text style={styles.taskReward}>🪙 {taskRewardText(task, isPrerequisiteMet)}</Text>
      </View>
      <View style={styles.countdownBadge}>
        <Text style={styles.countdownText}>{countdown}</Text>
      </View>
    </TouchableOpacity>
  );
}

function GrowthTreeIllustration({ stage, fruitCount }: { stage: number; fruitCount: number }) {
  // gradient id 用 useId() 產生（不要改回寫死字串）——stack navigator 在 web 上沒把上一頁
  // 樹的 <Svg> 卸載乾淨時，兩個同 id="trunk" 的 <LinearGradient> 會在 DOM 上打架，
  // url(#trunk) 解析到錯的一個，樹幹整片消失（2026-07-08 使用者回報：切頁再回來樹幹不見）。
  // GradientBackground.tsx 也是同一個根因，已經用這個模式修過。
  const gid = useId();
  const trunkId = `${gid}-trunk`;
  const leafId = `${gid}-leaf`;
  const fruitId = `${gid}-fruit`;
  const canopyScale = 0.84 + stage * 0.035;
  return (
    <Svg width={226} height={232} viewBox="0 0 230 236" fill="none">
      <Defs>
        <SvgLinearGradient id={trunkId} x1="112" y1="92" x2="116" y2="217" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#9B6334" />
          <Stop offset="1" stopColor="#6F4328" />
        </SvgLinearGradient>
        <SvgLinearGradient id={leafId} x1="76" y1="33" x2="164" y2="153" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#B7D95E" />
          <Stop offset="1" stopColor="#5EA33C" />
        </SvgLinearGradient>
        <SvgLinearGradient id={fruitId} x1="0" y1="0" x2="1" y2="1">
          <Stop stopColor="#FFD66D" />
          <Stop offset="1" stopColor="#F2997A" />
        </SvgLinearGradient>
      </Defs>
      <Ellipse cx="116" cy="217" rx="64" ry="13" fill="#A6C979" opacity="0.42" />
      <Path d="M96 215c14-42 14-74 10-107h27c-2 34 2 69 18 107H96z" fill={`url(#${trunkId})`} />
      <Path d="M111 132c-20-15-35-30-53-55" stroke="#7B4C2D" strokeWidth="12" strokeLinecap="round" />
      <Path d="M128 130c20-12 39-29 55-53" stroke="#7B4C2D" strokeWidth="12" strokeLinecap="round" />
      <Path d="M119 122c-1 28-2 56-10 85" stroke="#5A3322" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      <G transform={`translate(${116 - 116 * canopyScale} ${94 - 94 * canopyScale}) scale(${canopyScale})`}>
        <Circle cx="69" cy="93" r="45" fill={`url(#${leafId})`} />
        <Circle cx="101" cy="56" r="51" fill={`url(#${leafId})`} />
        <Circle cx="143" cy="75" r="48" fill={`url(#${leafId})`} />
        <Circle cx="168" cy="111" r="41" fill="#64AE3D" />
        <Circle cx="109" cy="111" r="52" fill="#79BD47" />
        <Circle cx="67" cy="122" r="34" fill="#73B946" />
        <Circle cx="140" cy="126" r="39" fill="#5EA33C" />
        <Circle cx="97" cy="77" r="6" fill="#D4EA81" opacity="0.55" />
        <Circle cx="152" cy="101" r="5" fill="#D4EA81" opacity="0.55" />
        <Circle cx="72" cy="121" r="4" fill="#D4EA81" opacity="0.55" />
        {Array.from({ length: fruitCount }).map((_, index) => {
          const points = [
            [142, 76],
            [106, 118],
            [168, 119],
            [80, 98],
            [132, 139],
          ][index];
          return (
            <G key={index}>
              <Circle cx={points[0]} cy={points[1]} r="12" fill={`url(#${fruitId})`} />
              <Circle cx={points[0] - 4} cy={points[1] - 4} r="3" fill="#FFF4B9" opacity="0.75" />
              <Path d={`M${points[0] - 1} ${points[1] - 13}c2-6 7-7 10-5`} stroke="#5EA33C" strokeWidth="3" strokeLinecap="round" />
            </G>
          );
        })}
      </G>
      <Rect x="104" y="126" width="39" height="34" rx="5" fill="#C78537" />
      <Path d="M104 136h39M113 126v34M134 126v34" stroke="#8E582F" strokeWidth="2" opacity="0.55" />
      <Path d="M123 148c-7-5-11-9-11-14 0-4 5-7 10-2 5-5 10-2 10 2 0 5-3 9-9 14z" fill="#51311F" />
    </Svg>
  );
}

// 星空層 —— 畫在最底（樹在其上），星星屬於遠方天空；每顆各自閃爍（明暗＋微縮放）
function NightStars() {
  return (
    <View pointerEvents="none" style={styles.starsLayer}>
      {NIGHT_STARS.map((s, i) => (
        <MotiView
          key={`star-${i}`}
          style={[styles.starPos, { top: s.top, left: s.left }]}
          from={{ opacity: s.opacity * 0.3, scale: 0.6 }}
          animate={{ opacity: s.opacity, scale: 1 }}
          transition={{ loop: true, repeatReverse: true, type: 'timing', duration: 900 + (i % 4) * 380, delay: i * 240 }}
        >
          <Star size={s.size} />
        </MotiView>
      ))}
    </View>
  );
}

// 月亮層 —— zIndex 高於樹，確保月亮不會被樹屋擋到；光暈會呼吸（明暗＋放大縮小）
function NightMoon() {
  return (
    <View pointerEvents="none" style={styles.moonLayer}>
      <MotiView
        style={styles.moonGlow}
        from={{ opacity: 0.45, scale: 0.82 }}
        animate={{ opacity: 1, scale: 1.18 }}
        transition={{ loop: true, repeatReverse: true, type: 'timing', duration: 2600 }}
      />
      <View style={styles.moonPos}>
        <Moon size={48} />
      </View>
    </View>
  );
}

// 螢火蟲層 —— 畫在樹前，一閃一閃並輕輕飄動
function NightFireflies() {
  return (
    <View pointerEvents="none" style={styles.firefliesLayer}>
      {NIGHT_FIREFLIES.map((f, i) => (
        <MotiView
          key={`fly-${i}`}
          style={[styles.fireflyPos, { top: f.top, left: f.left }]}
          from={{ opacity: 0.18, translateY: 3, translateX: -3 }}
          animate={{ opacity: f.opacity, translateY: -7, translateX: 4 }}
          transition={{ loop: true, repeatReverse: true, type: 'timing', duration: 1500 + i * 360, delay: i * 520 }}
        >
          <Firefly size={f.size} />
        </MotiView>
      ))}
    </View>
  );
}

function LeafSvg() {
  return (
    <Svg width={26} height={18} viewBox="0 0 26 18">
      <Path d="M2 10c8-11 18-8 22-4C18 18 8 17 2 10z" fill="#8DC76A" />
      <Path d="M4 10c6 0 12-1 18-5" stroke="#5EA33C" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  );
}

function SproutMini() {
  return (
    <Svg width={64} height={64} viewBox="0 0 64 64">
      <Ellipse cx="32" cy="52" rx="22" ry="6" fill="#E2D7C4" />
      <Path d="M32 51V26" stroke="#6BA63C" strokeWidth="4" strokeLinecap="round" />
      <Path d="M31 31C18 30 14 20 18 14c11 2 15 8 13 17z" fill="#8DC76A" />
      <Path d="M34 34c14 0 18-10 14-16-12 2-16 8-14 16z" fill="#A8C686" />
    </Svg>
  );
}

function WateringSprite() {
  return (
    <Svg testID="watering-sprite" width={96} height={74} viewBox="0 0 152 112" style={styles.wateringSprite}>
      <Ellipse cx="65" cy="98" rx="55" ry="8" fill="#A8C686" opacity="0.34" />
      <Path d="M82 96V70" stroke="#5E9A32" strokeWidth="4" strokeLinecap="round" />
      <Path d="M80 77c-11-2-15-11-10-17 10 1 14 7 10 17z" fill="#8DC76A" />
      <Path d="M86 80c12 1 18-7 15-14-11-1-16 5-15 14z" fill="#A8C686" />
      <Circle cx="44" cy="62" r="21" fill="#7CB84A" />
      <Circle cx="37" cy="56" r="3" fill="#3B332A" />
      <Circle cx="50" cy="56" r="3" fill="#3B332A" />
      <Path d="M38 66c5 5 11 5 16 0" stroke="#3B332A" strokeWidth="2.4" strokeLinecap="round" />
      <Path d="M68 60l35-10 6 18-34 12z" fill="#74AFC6" />
      <Path d="M102 49c9-7 18 3 12 11" stroke="#56889B" strokeWidth="5" strokeLinecap="round" />
      <Circle cx="116" cy="72" r="2" fill="#74AFC6" opacity="0.7" />
      <Circle cx="126" cy="80" r="2" fill="#74AFC6" opacity="0.55" />
      <Circle cx="135" cy="70" r="2" fill="#74AFC6" opacity="0.55" />
    </Svg>
  );
}

function ChestIcon() {
  return (
    <Svg width={76} height={64} viewBox="0 0 90 76">
      <Rect x="16" y="31" width="58" height="34" rx="8" fill="#D8912F" />
      <Path d="M19 35c6-21 46-21 52 0z" fill="#F2C14E" />
      <Rect x="22" y="39" width="46" height="20" rx="4" fill="#F6A63C" />
      <Path d="M18 48h56M45 30v35" stroke="#8A5B2B" strokeWidth="4" strokeLinecap="round" />
      <Rect x="38" y="45" width="14" height="13" rx="3" fill="#FFE7A3" stroke="#8A5B2B" strokeWidth="2" />
      <Circle cx="70" cy="21" r="8" fill="#F2C14E" />
      <Path d="M70 16l1.4 3.2 3.4.3-2.6 2.3.8 3.3-3-1.8-3 1.8.8-3.3-2.6-2.3 3.4-.3z" fill="#FFFFFF" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: HOME.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  scrollContentWithNav: {
    paddingBottom: 120,
  },
  hero: {
    minHeight: 220,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    marginHorizontal: -16,
    paddingHorizontal: 26,
    paddingTop: 28,   // 問候語往下，避免部分機型瀏海／動態島擋到（與成長日記按鈕同一高度）
    overflow: 'hidden',
  },
  // 晚安模式 hero 加高（但別太高），讓樹屋往下、樹冠避開「成長日記」按鈕，也留出夜空
  heroNight: {
    minHeight: 260,
  },
  heroCopy: {
    maxWidth: 218,
    zIndex: 6,
  },
  greeting: {
    color: HOME.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 36,
  },
  tagline: {
    color: HOME.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    lineHeight: 21,
  },
  greetingNight: {
    color: NIGHT.greeting,
  },
  taglineNight: {
    color: NIGHT.tagline,
  },
  // 星空層（最底，樹在其上）
  starsLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  // 遠景山坡層（星空之上、樹與草坡之下，鋪在中下段當背景層次）
  nightHillsLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 43,
    height: 120,
    zIndex: 0,
  },
  starPos: {
    position: 'absolute',
  },
  // 月亮層（zIndex 5 > 樹的 3，保證不被樹屋擋住）
  moonLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  moonGlow: {
    position: 'absolute',
    top: 11,
    right: 141,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: NIGHT.moonGlow,
  },
  moonPos: {
    position: 'absolute',
    top: 16,
    right: 146,
  },
  // 螢火蟲層（zIndex 4 > 樹，暖光在樹前）
  firefliesLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
  },
  fireflyPos: {
    position: 'absolute',
  },
  treeTouchNight: {
    right: -8,
    bottom: 0,
  },
  treeWrapNight: {
    width: 176,
    height: 176,
  },
  treeHouseImg: {
    width: '100%',
    height: '100%',
  },
  diaryBadge: {
    position: 'absolute',
    right: 22,
    top: 28,   // 與問候語同一高度（見 hero.paddingTop）
    zIndex: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(236,229,216,0.9)',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.13,
    shadowRadius: 12,
    elevation: 4,
  },
  diaryText: {
    color: HOME.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  treeTouch: {
    position: 'absolute',
    right: -36,
    bottom: -8,
    zIndex: 3,
  },
  treeWrap: {
    width: 226,
    height: 232,
  },
  ground: {
    position: 'absolute',
    left: -28,
    right: -28,
    bottom: -24,
    height: 116,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  coinCardTouch: {
    position: 'absolute',
    left: 30,
    top: 94,
    width: 172,
    zIndex: 7,
  },
  // 晚安模式：卡片往下、左緣對齊下方內容卡（scrollContent paddingHorizontal 16）
  coinCardTouchNight: {
    top: 150,
    left: 16,
  },
  coinCard: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,253,248,0.96)',
    borderRadius: 22,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderColor: HOME.border,
    borderWidth: 1,
    shadowColor: Colors.shadowGold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 4,
  },
  coinGlow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(242,193,78,0.18)',
  },
  coinTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  coinAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  coinNumber: {
    color: HOME.textPrimary,
    fontSize: 31,
    fontWeight: '900',
    lineHeight: 34,
    fontVariant: ['tabular-nums'],
  },
  coinUnit: {
    color: HOME.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 0,
  },
  coinTodayPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,244,201,0.82)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
    marginTop: 5,
  },
  coinSparkle: {
    fontSize: 11,
  },
  coinToday: {
    color: HOME.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 15,
  },
  progressPill: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
    backgroundColor: HOME.card,   // 實心不透明（使用者要求不要半透明）
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginTop: -18,
    marginBottom: 24,
    borderColor: HOME.border,
    borderWidth: 1,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  progressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  progressIconBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F3DF',
  },
  progressLeaf: {
    fontSize: 19,
  },
  progressText: {
    color: HOME.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  dotRow: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-between',
    gap: 7,
  },
  progressDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E7E0D6',
  },
  progressDotActive: {
    backgroundColor: HOME.successGreen,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionIcon: {
    fontSize: 24,
  },
  sectionTitle: {
    color: HOME.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionAction: {
    color: HOME.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionLoading: {
    paddingVertical: 24,
  },
  goalList: {
    gap: 14,
    paddingRight: 16,
  },
  goalCard: {
    width: 164,
    minHeight: 156,
    backgroundColor: HOME.card,
    borderRadius: 22,
    padding: 14,
    borderColor: HOME.border,
    borderWidth: 1,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
  },
  addGoalCard: {
    width: 164,
    minHeight: 156,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: HOME.primaryGreen,
    backgroundColor: '#E7F1D6',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
  },
  addGoalPlus: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HOME.primaryGreen,
  },
  addGoalPlusText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    marginTop: -1,
  },
  addGoalTitle: {
    color: Colors.leaf700,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  addGoalHint: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.fgMuted,
    textAlign: 'center',
    lineHeight: 15,
  },
  goalTagText: {
    color: Colors.leaf700,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 2,
  },
  goalArt: {
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  goalArt_piano: {
    backgroundColor: '#F3E9DC',
  },
  goalArt_book: {
    backgroundColor: '#F2E7C6',
  },
  goalArt_sleep: {
    backgroundColor: '#DCECF0',
  },
  goalArt_growth: {
    backgroundColor: '#E7F1D6',
  },
  goalIcon: {
    fontSize: 37,
  },
  goalTitle: {
    color: HOME.textPrimary,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 4,
  },
  goalDays: {
    color: HOME.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginBottom: 7,
  },
  goalTrack: {
    height: 9,
    borderRadius: 99,
    backgroundColor: '#EEE6D9',
    overflow: 'hidden',
  },
  goalFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: HOME.successGreen,
  },
  taskList: {
    backgroundColor: HOME.card,
    borderRadius: 22,
    borderColor: HOME.border,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  taskRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: HOME.border,
  },
  taskRowDone: {
    backgroundColor: 'rgba(168,198,134,0.12)',
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#A99580',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxDone: {
    borderColor: HOME.successGreen,
    backgroundColor: HOME.successGreen,
  },
  checkboxCheck: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  taskEmoji: {
    width: 28,
    fontSize: 20,
    textAlign: 'center',
  },
  taskCopy: {
    flex: 1,
    minWidth: 0,
  },
  taskName: {
    color: HOME.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 17,
  },
  taskNameDone: {
    color: HOME.textSecondary,
    textDecorationLine: 'line-through',
  },
  taskReward: {
    color: HOME.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  taskRewardValue: {
    minWidth: 48,
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  taskCoinText: {
    color: '#8B572A',
    fontSize: 14,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 26,
    backgroundColor: HOME.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: HOME.border,
  },
  emptyTitle: {
    color: HOME.textPrimary,
    fontSize: 21,
    fontWeight: '900',
    marginTop: 4,
  },
  emptySub: {
    color: HOME.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
  },
  encourageLine: {
    alignItems: 'center',
    marginTop: -4,
    marginBottom: 18,
  },
  encourageText: {
    color: HOME.textSecondary,
    fontSize: 15,
    fontWeight: '800',
  },
  feedbackGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  growthFeedback: {
    flex: 1.75,
    minHeight: 126,
    borderRadius: 22,
    padding: 14,
    paddingRight: 78,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(141,199,106,0.28)',
  },
  feedbackCopy: {
    maxWidth: 148,
    zIndex: 2,
  },
  feedbackSmall: {
    color: HOME.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  feedbackBig: {
    color: HOME.textPrimary,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
    marginTop: 4,
  },
  feedbackNote: {
    color: HOME.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: 5,
  },
  wateringSprite: {
    position: 'absolute',
    right: -12,
    bottom: -2,
    opacity: 0.96,
  },
  rewardCard: {
    flex: 0.95,
    minHeight: 126,
    borderRadius: 22,
    backgroundColor: '#FFF0CB',
    borderWidth: 1,
    borderColor: '#F4C471',
    padding: 13,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  rewardTitle: {
    color: HOME.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  rewardSub: {
    color: HOME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    marginBottom: 8,
  },
  reviewSuccess: {
    color: Colors.success,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  reviewError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    backgroundColor: Colors.bgSurface,
  },
  reviewErrorText: { flex: 1, color: Colors.fgSecondary, fontSize: 14 },
  reviewRetry: { color: Colors.accent, fontSize: 14, fontWeight: '800' },
  addPlus: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: HOME.primaryGreen,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  addPlusText: {
    color: Colors.leaf700,
    fontSize: 18,
    fontWeight: '900',
    marginTop: -1,
  },
  addRowText: {
    color: Colors.leaf700,
    fontSize: 15,
    fontWeight: '800',
  },
  inlineCelebration: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 8,
  },
  flyingCoin: {
    position: 'absolute',
    right: 82,
    top: 266,
  },
  flyingLeaf: {
    position: 'absolute',
    right: 128,
    top: 286,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(59,42,30,0.35)',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    backgroundColor: HOME.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: HOME.border,
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: HOME.textPrimary,
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: HOME.textSecondary,
    marginBottom: 16,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: HOME.textPrimary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFF8EE',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: HOME.textPrimary,
    fontSize: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: HOME.border,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFF8EE',
    borderWidth: 1,
    borderColor: HOME.border,
  },
  segmentBtnActive: {
    backgroundColor: '#EDF6E2',
    borderColor: HOME.primaryGreen,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '800',
    color: HOME.textSecondary,
  },
  segmentTextActive: {
    color: Colors.leaf700,
  },
  hintPill: {
    backgroundColor: '#FFF8EE',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  hintText: {
    fontSize: 13,
    color: HOME.textSecondary,
    lineHeight: 18,
    fontWeight: '600',
  },
  diffRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  diffBtn: {
    minWidth: 60,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    backgroundColor: '#FFF8EE',
    borderWidth: 1,
    borderColor: HOME.border,
  },
  diffBtnActive: {
    backgroundColor: '#FFF0BF',
    borderColor: HOME.honeyGold,
  },
  diffText: {
    fontSize: 13,
    fontWeight: '900',
    color: HOME.textSecondary,
  },
  diffTextActive: {
    color: Colors.gold700,
  },
  submitBtn: {
    marginTop: 4,
    backgroundColor: HOME.successGreen,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  taskTypeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  taskTypeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#FFF8EE',
    borderWidth: 1.5,
    borderColor: HOME.border,
  },
  taskTypeBtnActive: {
    backgroundColor: '#EDF6E2',
    borderColor: HOME.primaryGreen,
  },
  taskTypeText: {
    fontSize: 14,
    fontWeight: '800',
    color: HOME.textSecondary,
  },
  taskTypeTextActive: {
    color: Colors.leaf700,
  },
  dueRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  dueBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#FFF8EE',
    borderWidth: 1,
    borderColor: HOME.border,
  },
  dueBtnActive: {
    backgroundColor: '#FFF0CB',
    borderColor: HOME.honeyGold,
  },
  dueBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: HOME.textSecondary,
  },
  dueBtnTextActive: {
    color: '#8B572A',
  },
  dayRow: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 14,
  },
  dayBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#FFF8EE',
    borderWidth: 1,
    borderColor: HOME.border,
  },
  dayBtnActive: {
    backgroundColor: '#EDF6E2',
    borderColor: HOME.primaryGreen,
  },
  dayBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: HOME.textSecondary,
  },
  dayBtnTextActive: {
    color: Colors.leaf700,
  },
  countdownBadge: {
    backgroundColor: '#FFF0CB',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#F4C471',
    flexShrink: 0,
  },
  countdownText: {
    color: '#8B572A',
    fontSize: 11,
    fontWeight: '800',
  },
});
