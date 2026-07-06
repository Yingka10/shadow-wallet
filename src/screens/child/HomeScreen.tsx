import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../App';
import { useTodayTasks, type TodayTask } from '../../hooks/useTodayTasks';
import { useWallet } from '../../hooks/useWallet';
import TaskCard from '../../components/TaskCard';
import BottomNav from '../../components/BottomNav';
import TaskCompleteModal from '../../components/TaskCompleteModal';
import FeedbackAnimation, { type FeedbackType } from '../../components/FeedbackAnimation';
import GradientBackground from '../../components/child/GradientBackground';
import SectionHeader from '../../components/child/SectionHeader';
import GrowthScene from '../../components/child/GrowthScene';
import GroundWash from '../../components/child/GroundWash';
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

const TASK_DIFF_OPTIONS = [1, 1.5, 2, 2.5, 3];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return '早安';
  if (h < 18) return '午安';
  return '晚安';
}

// 太陽 —— hero 右上角，鎖定值＝提案 artifact（淡金，不是暖橘）
function Sun() {
  return (
    <Svg width={30} height={30} viewBox="0 0 30 30">
      <Circle cx={15} cy={15} r={12} fill={Colors.gold300} opacity={0.9} />
    </Svg>
  );
}

// 今天完成進度小環
function TodayRing({ done, total, size = 20 }: { done: number; total: number; size?: number }) {
  const pct = total > 0 ? done / total : 0;
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Circle cx={10} cy={10} r={r} fill="none" stroke={Colors.leaf100} strokeWidth={3} />
      <Circle
        cx={10} cy={10} r={r} fill="none"
        stroke={Colors.leaf500} strokeWidth={3}
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        strokeLinecap="round" transform="rotate(-90 10 10)"
      />
    </Svg>
  );
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

  const isWeekend = [0, 6].includes(new Date().getDay());
  const shortTermTasks = isWeekend ? weekendTasks : weekdayTasks;
  const dutyTasks = shortTermTasks.filter(t => t.category === 'A' || t.category === 'B');
  const contributionTasks = shortTermTasks.filter(t => t.category === 'C');

  const todayTasks = [...dutyTasks, ...contributionTasks];
  const todayDone = todayTasks.filter(t => t.isCompleted).length;
  const todayTotal = todayTasks.length;

  const allCount = todayTotal + longTermTasks.length;
  const isEmpty = allCount === 0 && !loading;

  useEffect(() => {
    void loadChildMeta();
  }, [childId]);

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
    [modal.task, childId, isPrerequisiteMet, closeModal],
  );

  const handleFeedbackComplete = useCallback(() => {
    setFeedback(prev => ({ ...prev, visible: false }));
    refresh();
  }, [refresh]);

  const nickname = childMeta?.nickname ?? '小朋友';

  return (
    <View style={webScreen}>
    <SafeAreaView style={styles.safe} edges={['top']}>
      <GradientBackground />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={Colors.accent} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero —— 一幅場景：地面貫穿全寬，樹和文字都站在上面 ─────── */}
        <View style={styles.hero}>
          <View style={styles.groundBand}>
            <GroundWash />
          </View>

          <View style={styles.heroLeft}>
            <Text style={styles.heroHello}>{getGreeting()}，</Text>
            <Text style={styles.heroName}>{nickname}！</Text>
            <TouchableOpacity
              style={styles.heroCoin}
              onPress={() => navigation.navigate('Wallet', { childId })}
              activeOpacity={0.8}
              accessibilityLabel={`前往撲滿，金幣餘額 ${coinBalance}`}
            >
              <CoinIcon size={34} />
              <Text style={styles.heroCoinNum}>{coinBalance}</Text>
              <Text style={styles.heroCoinUnit}>金幣</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.heroRight}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Wish', { childId })}
            accessibilityLabel="前往許願樹"
          >
            <View style={styles.sun}><Sun /></View>
            <GrowthScene size={150} />
          </TouchableOpacity>
        </View>

        {/* 今天進度膠囊 */}
        {todayTotal > 0 && (
          <View style={styles.todayPill}>
            <TodayRing done={todayDone} total={todayTotal} />
            <Text style={styles.todayPillText}>今天 {todayDone}/{todayTotal}</Text>
          </View>
        )}

        {/* ── 長期挑戰 —— 置頂，唯一有進度條 ──────────────────────────── */}
        {longTermTasks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="我的長期挑戰" />
            {loading ? (
              <ActivityIndicator color={Colors.accent} style={styles.sectionLoading} />
            ) : (
              longTermTasks.map(task => (
                task.goal ? (
                  <TaskCard
                    key={task.id}
                    task={task}
                    variant="longterm"
                    isCompleted={task.isCompleted}
                    onPress={() =>
                      navigation.navigate('LongTermDetail', {
                        goalId: task.goal!.id,
                        taskId: task.id,
                        taskName: task.name,
                      })
                    }
                  />
                ) : null
              ))
            )}
          </View>
        )}

        {/* ── 今天要做的 (Task-A + Task-B) ─────────────────────────────── */}
        {dutyTasks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="今天要做的" meta={`${dutyTasks.filter(t => !t.isCompleted).length} 件`} />
            {dutyTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                variant="weekly"
                isCompleted={task.isCompleted}
                onPress={() => openModal(task)}
              />
            ))}
          </View>
        )}

        {/* ── 多做加分 (Task-C) ────────────────────────────────────────── */}
        {contributionTasks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="多做加分" />
            {contributionTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                variant="instant"
                isCompleted={task.isCompleted}
                isPrerequisiteMet={isPrerequisiteMet}
                onPress={() => openModal(task)}
              />
            ))}
          </View>
        )}

        {/* Empty state */}
        {isEmpty && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>今天全部完成了！</Text>
            <Text style={styles.emptySub}>你今天超棒的</Text>
          </View>
        )}

        {/* 新增任務 —— 清單尾入口 */}
        <TouchableOpacity style={styles.addRow} onPress={openAddTask} activeOpacity={0.6}>
          <View style={styles.addPlus}>
            <Text style={styles.addPlusText}>＋</Text>
          </View>
          <Text style={styles.addRowText}>新增一件今天的事</Text>
        </TouchableOpacity>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Bottom nav */}
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

      {/* Modals — untouched logic */}
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
                placeholderTextColor={Colors.ink300}
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
                placeholderTextColor={Colors.ink300}
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
                  {creatingTask ? '建立中…' : '建立任務'}
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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.gradientPage[0],
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  // ── Hero ──────────────────────────────────────────────────────────────
  hero: {
    position: 'relative',
    flexDirection: 'row',
    minHeight: 168,
  },
  groundBand: {
    position: 'absolute',
    left: -20,
    right: -20,
    bottom: 0,
    height: 96,
    zIndex: 0,
  },
  heroLeft: {
    flex: 1,
    paddingTop: 6,
    zIndex: 1,
  },
  heroHello: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.bark700,
  },
  heroName: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.ink900,
    marginTop: -2,
  },
  heroCoin: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 14,
  },
  heroCoinNum: {
    fontSize: 40,
    fontWeight: '800',
    color: Colors.ink900,
    fontVariant: ['tabular-nums'],
    lineHeight: 44,
  },
  heroCoinUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.bark700,
  },
  heroRight: {
    width: 150,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 1,
  },
  sun: {
    position: 'absolute',
    top: 6,
    right: 4,
    zIndex: 2,
  },

  // 今天進度膠囊
  todayPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.bgSurface,
    borderRadius: 999,
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 16,
    marginTop: 2,
    marginBottom: 18,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  todayPillText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.ink900,
    fontVariant: ['tabular-nums'],
  },

  section: {
    marginBottom: 22,
  },
  sectionLoading: {
    paddingVertical: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.ink900,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 15,
    color: Colors.bark700,
    fontWeight: '500',
  },

  // 新增任務 —— 清單尾入口
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    marginTop: 4,
  },
  addPlus: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: Colors.leaf300,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPlusText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.leaf600,
    marginTop: -1,
  },
  addRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.leaf700,
  },

  // ── Add-task modal ──────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(59,42,30,0.35)',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    backgroundColor: Colors.bgSurface,
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
    backgroundColor: Colors.ink100,
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.ink900,
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: Colors.ink500,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.ink700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.cream50,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.ink900,
    fontSize: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
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
    backgroundColor: Colors.cream50,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },
  segmentBtnActive: {
    backgroundColor: Colors.leaf50,
    borderColor: Colors.leaf300,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink700,
  },
  segmentTextActive: {
    color: Colors.leaf700,
  },
  hintPill: {
    backgroundColor: Colors.cream50,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  hintText: {
    fontSize: 13,
    color: Colors.ink500,
    lineHeight: 18,
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
    backgroundColor: Colors.cream50,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },
  diffBtnActive: {
    backgroundColor: Colors.gold100,
    borderColor: Colors.gold300,
  },
  diffText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.ink700,
  },
  diffTextActive: {
    color: Colors.gold700,
  },
  submitBtn: {
    marginTop: 4,
    backgroundColor: Colors.accent,
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
    fontWeight: '800',
  },
  bottomPad: {
    height: 32,
  },
});
