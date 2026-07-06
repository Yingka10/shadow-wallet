import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  useAnimatedStyle,
  useSharedValue,
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
import BottomNav from '../../components/BottomNav';
import TaskCompleteModal from '../../components/TaskCompleteModal';
import FeedbackAnimation, { type FeedbackType } from '../../components/FeedbackAnimation';
import { CoinIcon } from '../../components/icons/TaskIcons';
import { completeTask, createChildTask } from '../../lib/taskActions';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { webScreen } from '../../constants/webStyles';
import type { AgeGroup, Task } from '../../types/database';

type HomeRoute = RouteProp<RootStackParamList, 'Home'>;
type Nav = StackNavigationProp<RootStackParamList, 'Home'>;

type ModalState = { task: TodayTask | null; visible: boolean };
type FeedbackState = { visible: boolean; type: FeedbackType; value: number };
type ChildMeta = {
  familyId: string;
  ageGroup: AgeGroup;
  nickname: string;
};
type GoalTone = 'piano' | 'book' | 'sleep' | 'growth';

const TASK_DIFF_OPTIONS = [1, 1.5, 2, 2.5, 3];
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

function getGoalTone(name: string): { tone: GoalTone; icon: string; title: string } {
  const lower = name.toLowerCase();
  if (name.includes('鋼琴') || lower.includes('piano')) {
    return { tone: 'piano', icon: '🎹', title: '鋼琴家之路' };
  }
  if (name.includes('閱讀') || name.includes('書') || lower.includes('read')) {
    return { tone: 'book', icon: '📚', title: '小書蟲計畫' };
  }
  if (name.includes('睡') || lower.includes('sleep')) {
    return { tone: 'sleep', icon: '🌙', title: '早睡挑戰' };
  }
  return { tone: 'growth', icon: '🌱', title: name };
}

function getGoalProgress(goal: TodayTask['goal']): { label: string; pct: number } {
  if (!goal) return { label: '第 0/0 天', pct: 0 };

  if (goal.goal_type === 'skill') {
    const total = Math.max(goal.level_count ?? goal.level_definitions?.length ?? 0, 1);
    const current = Math.min(goal.current_level ?? 0, total);
    return { label: `第 ${current}/${total} 級`, pct: current / total };
  }

  const total = Math.max(goal.total_days ?? 30, 1);
  const current = Math.min(goal.current_day ?? 0, total);
  return { label: `第 ${current}/${total} 天`, pct: current / total };
}

function taskIcon(task: TodayTask): string {
  const name = task.name;
  if (name.includes('碗') || name.includes('盤') || name.includes('飯')) return '🍽️';
  if (name.includes('垃圾')) return '🗑️';
  if (name.includes('閱讀') || name.includes('書')) return '📚';
  if (name.includes('睡')) return '🌙';
  if (name.includes('鋼琴')) return '🎹';
  if (task.category === 'C') return '🤝';
  if (task.category === 'A') return '☀️';
  return '🌿';
}

function taskRewardText(task: TodayTask, isPrerequisiteMet: boolean): string {
  if (task.category === 'C') return `+${calcDisplayCoin(task, isPrerequisiteMet)} 枚金幣`;
  if (task.category === 'B' && task.time_saving_min > 0) return `省 ${task.time_saving_min} 分鐘`;
  return '完成打卡';
}

export default function HomeScreen() {
  const route = useRoute<HomeRoute>();
  const navigation = useNavigation<Nav>();
  const { childId } = route.params;

  const { weekdayTasks, weekendTasks, longTermTasks, isPrerequisiteMet, loading, refresh } =
    useTodayTasks(childId);
  const { spending } = useWallet(childId);
  const coinBalance = spending?.balance ?? 0;

  const [modal, setModal] = useState<ModalState>({ task: null, visible: false });
  const [feedback, setFeedback] = useState<FeedbackState>({ visible: false, type: 'task-a', value: 0 });
  const [childMeta, setChildMeta] = useState<ChildMeta | null>(null);

  const [addTaskVisible, setAddTaskVisible] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState<'B' | 'C'>('B');
  const [newTaskTime, setNewTaskTime] = useState('');
  const [newTaskDifficulty, setNewTaskDifficulty] = useState(1);
  const [creatingTask, setCreatingTask] = useState(false);

  const coinPulse = useSharedValue(1);
  const treePulse = useSharedValue(1);

  const coinAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: coinPulse.value }],
  }));
  const treeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: treePulse.value }],
  }));

  const isWeekend = [0, 6].includes(new Date().getDay());
  const shortTermTasks = isWeekend ? weekendTasks : weekdayTasks;
  const dutyTasks = shortTermTasks.filter(t => t.category === 'A' || t.category === 'B');
  const contributionTasks = shortTermTasks.filter(t => t.category === 'C');
  const todayTasks = [...dutyTasks, ...contributionTasks];
  const todayDone = todayTasks.filter(t => t.isCompleted).length;
  const todayTotal = todayTasks.length;
  const allCount = todayTotal + longTermTasks.length;
  const isEmpty = allCount === 0 && !loading;
  const todayEarned = contributionTasks
    .filter(task => task.isCompleted)
    .reduce((sum, task) => sum + calcDisplayCoin(task, isPrerequisiteMet), 0);
  const visibleLongTermTasks = longTermTasks.filter(task => task.goal).slice(0, 6);
  const nickname = childMeta?.nickname ?? '小朋友';
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
    setAddTaskVisible(true);
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

    setCreatingTask(true);
    try {
      await createChildTask({
        familyId: childMeta.familyId,
        childId,
        ageGroup: childMeta.ageGroup,
        name: trimmedName,
        category: newTaskCategory,
        baseTimeMin: timeMin,
        difficulty: newTaskCategory === 'C' ? newTaskDifficulty : 1,
      });
      setAddTaskVisible(false);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '建立失敗';
      Alert.alert('新增任務失敗', msg);
    } finally {
      setCreatingTask(false);
    }
  }, [childMeta, childId, newTaskCategory, newTaskDifficulty, newTaskName, newTaskTime, refresh]);

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
      const result = await completeTask(
        task.id,
        childId,
        completedDate,
        isPrerequisiteMet,
        task,
        modal.task.goal?.id,
      );
      closeModal();
      treePulse.value = withSequence(
        withTiming(1.05, { duration: 220 }),
        withTiming(0.99, { duration: 140 }),
        withTiming(1, { duration: 180 }),
      );
      if (result.milestone) {
        setFeedback({ visible: true, type: 'milestone', value: result.milestone.coinReward });
      } else if (task.category === 'A') {
        setFeedback({ visible: true, type: 'task-a', value: 0 });
      } else if (task.category === 'B') {
        setFeedback({ visible: true, type: 'task-b', value: result.timeSavedMin });
      } else {
        setFeedback({ visible: true, type: 'task-c', value: result.coinEarned });
      }
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
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={HOME.primaryGreen} />
          }
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={['#E7F5EC', '#F9F1C9', '#DDECB8']}
            locations={[0, 0.62, 1]}
            style={styles.hero}
          >
            <View style={styles.heroCopy}>
              <Text style={styles.greeting}>{getGreeting()}，{nickname}！</Text>
              <Text style={styles.tagline}>今天也是成長的一天</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.86}
              onPress={() => navigation.navigate('Wallet', { childId })}
              accessibilityLabel={`前往撲滿，金幣餘額 ${coinBalance}`}
              style={styles.coinCardTouch}
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

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => navigation.navigate('Wish', { childId })}
              style={styles.treeTouch}
              accessibilityLabel={`前往許願樹，第 ${treeStage} 階段`}
            >
              <Animated.View style={[styles.treeWrap, treeAnimatedStyle]}>
                <GrowthTreeIllustration stage={treeStage} fruitCount={Math.min(5, Math.max(1, Math.ceil(coinBalance / 40)))} />
              </Animated.View>
            </TouchableOpacity>

            <View style={styles.ground} />
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

          {visibleLongTermTasks.length > 0 && (
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
              </ScrollView>
            </View>
          )}

          <View style={styles.section}>
            <SectionTitle icon="☀️" title="今天要做的" action={`${remainingToday} 件任務`} />
            {loading ? (
              <ActivityIndicator color={HOME.primaryGreen} style={styles.sectionLoading} />
            ) : todayTasks.length > 0 ? (
              <View style={styles.taskList}>
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

          <TouchableOpacity style={styles.addRow} onPress={openAddTask} activeOpacity={0.72}>
            <View style={styles.addPlus}>
              <Text style={styles.addPlusText}>＋</Text>
            </View>
            <Text style={styles.addRowText}>新增一件今天的事</Text>
          </TouchableOpacity>

          <View style={styles.bottomPad} />
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
          onComplete={handleFeedbackComplete}
        />

        <Modal
          visible={addTaskVisible}
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
                <Text style={styles.sheetSubtitle}>
                  {childMeta ? `${childMeta.nickname} 的臨時任務` : '先幫今天加一件小事'}
                </Text>

                <Text style={styles.fieldLabel}>任務名稱</Text>
                <TextInput
                  style={styles.input}
                  value={newTaskName}
                  onChangeText={setNewTaskName}
                  placeholder="例如：整理書包"
                  placeholderTextColor={HOME.textSecondary}
                />

                <Text style={styles.fieldLabel}>任務類型</Text>
                <View style={styles.segmentRow}>
                  <TouchableOpacity
                    style={[styles.segmentBtn, newTaskCategory === 'B' && styles.segmentBtnActive]}
                    onPress={() => setNewTaskCategory('B')}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.segmentText, newTaskCategory === 'B' && styles.segmentTextActive]}>
                      本分
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segmentBtn, newTaskCategory === 'C' && styles.segmentBtnActive]}
                    onPress={() => setNewTaskCategory('C')}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.segmentText, newTaskCategory === 'C' && styles.segmentTextActive]}>
                      貢獻
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>預估時間（分鐘）</Text>
                <TextInput
                  style={styles.input}
                  value={newTaskTime}
                  onChangeText={setNewTaskTime}
                  placeholder="例如：10"
                  placeholderTextColor={HOME.textSecondary}
                  keyboardType="number-pad"
                />

                <View style={styles.hintPill}>
                  <Text style={styles.hintText}>
                    {newTaskCategory === 'B'
                      ? '本分任務不發幣，會以省下的時間計算。'
                      : '貢獻任務會依時間與難度換算成金幣。'}
                  </Text>
                </View>

                {newTaskCategory === 'C' && (
                  <>
                    <Text style={styles.fieldLabel}>難度</Text>
                    <View style={styles.diffRow}>
                      {TASK_DIFF_OPTIONS.map(option => (
                        <TouchableOpacity
                          key={option}
                          style={[
                            styles.diffBtn,
                            newTaskDifficulty === option && styles.diffBtnActive,
                          ]}
                          onPress={() => setNewTaskDifficulty(option)}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[
                              styles.diffText,
                              newTaskDifficulty === option && styles.diffTextActive,
                            ]}
                          >
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
  const info = getGoalTone(task.name);
  const progress = getGoalProgress(task.goal);

  return (
    <TouchableOpacity activeOpacity={0.86} style={styles.goalCard} onPress={onPress}>
      <View style={[styles.goalArt, styles[`goalArt_${info.tone}`]]}>
        <Text style={styles.goalIcon}>{info.icon}</Text>
      </View>
      <Text style={styles.goalTitle} numberOfLines={1}>{info.title}</Text>
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
      {task.category === 'C' ? (
        <View style={styles.taskRewardValue}>
          <Text style={styles.taskCoinText}>
            +{calcDisplayCoin(task, isPrerequisiteMet)} 🪙
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function GrowthTreeIllustration({ stage, fruitCount }: { stage: number; fruitCount: number }) {
  const canopyScale = 0.84 + stage * 0.035;
  return (
    <Svg width={226} height={232} viewBox="0 0 230 236" fill="none">
      <Defs>
        <SvgLinearGradient id="trunk" x1="112" y1="92" x2="116" y2="217" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#9B6334" />
          <Stop offset="1" stopColor="#6F4328" />
        </SvgLinearGradient>
        <SvgLinearGradient id="leaf" x1="76" y1="33" x2="164" y2="153" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#B7D95E" />
          <Stop offset="1" stopColor="#5EA33C" />
        </SvgLinearGradient>
        <SvgLinearGradient id="fruit" x1="0" y1="0" x2="1" y2="1">
          <Stop stopColor="#FFD66D" />
          <Stop offset="1" stopColor="#F2997A" />
        </SvgLinearGradient>
      </Defs>
      <Ellipse cx="116" cy="217" rx="64" ry="13" fill="#A6C979" opacity="0.42" />
      <Path d="M96 215c14-42 14-74 10-107h27c-2 34 2 69 18 107H96z" fill="url(#trunk)" />
      <Path d="M111 132c-20-15-35-30-53-55" stroke="#7B4C2D" strokeWidth="12" strokeLinecap="round" />
      <Path d="M128 130c20-12 39-29 55-53" stroke="#7B4C2D" strokeWidth="12" strokeLinecap="round" />
      <Path d="M119 122c-1 28-2 56-10 85" stroke="#5A3322" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      <G transform={`translate(${116 - 116 * canopyScale} ${94 - 94 * canopyScale}) scale(${canopyScale})`}>
        <Circle cx="69" cy="93" r="45" fill="url(#leaf)" />
        <Circle cx="101" cy="56" r="51" fill="url(#leaf)" />
        <Circle cx="143" cy="75" r="48" fill="url(#leaf)" />
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
              <Circle cx={points[0]} cy={points[1]} r="12" fill="url(#fruit)" />
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
  hero: {
    minHeight: 220,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    marginHorizontal: -16,
    paddingHorizontal: 26,
    paddingTop: 14,
    overflow: 'hidden',
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
  diaryBadge: {
    position: 'absolute',
    right: 22,
    top: 24,
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
    height: 92,
    borderTopLeftRadius: 100,
    borderTopRightRadius: 100,
    backgroundColor: HOME.grass,
    opacity: 0.9,
  },
  coinCardTouch: {
    position: 'absolute',
    left: 30,
    top: 94,
    width: 172,
    zIndex: 7,
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
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 13,
  },
  progressPill: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
    backgroundColor: 'rgba(255,253,248,0.92)',
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
  bottomPad: {
    height: 88,
  },
});
