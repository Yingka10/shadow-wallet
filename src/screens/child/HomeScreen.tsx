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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../App';
import { useTodayTasks, type TodayTask } from '../../hooks/useTodayTasks';
import { useWallet } from '../../hooks/useWallet';
import DutyTaskCard from '../../components/DutyTaskCard';
import ContributionTaskCard from '../../components/ContributionTaskCard';
import GoalHeroCard from '../../components/GoalHeroCard';
import BottomNav from '../../components/BottomNav';
import TaskCompleteModal from '../../components/TaskCompleteModal';
import FeedbackAnimation, { type FeedbackType } from '../../components/FeedbackAnimation';
import { CoinIcon, WaveIcon } from '../../components/icons/TaskIcons';
import { completeTask, createChildTask } from '../../lib/taskActions';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
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

function getSubGreeting(remaining: number, total: number): string {
  if (total === 0 || remaining === 0) return '今天全部完成了！太厲害！';
  return `今天有 ${remaining} 件事等你開動`;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <WaveIcon />
    </View>
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

  const allCount = dutyTasks.length + contributionTasks.length + longTermTasks.length;
  const doneCount = [...dutyTasks, ...contributionTasks, ...longTermTasks].filter(t => t.isCompleted).length;
  const remaining = allCount - doneCount;

  const hasDiscountableTasks =
    !isPrerequisiteMet && contributionTasks.some(t => !t.isCompleted);

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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>{getGreeting()}，小探險家！</Text>
          <Text style={styles.greetSub}>{getSubGreeting(remaining, allCount)}</Text>
        </View>
        <TouchableOpacity
          style={styles.coinPill}
          onPress={() => navigation.navigate('Wallet', { childId })}
          accessibilityLabel={`前往撲滿，金幣餘額 ${coinBalance}`}
        >
          <CoinIcon size={28} />
          <Text style={styles.coinCount}>{coinBalance}</Text>
        </TouchableOpacity>
      </View>

      {/* Scroll content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={Colors.coral500} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Long-term goal hero card(s) */}
        {longTermTasks.map(task =>
          task.goal ? (
            <GoalHeroCard
              key={task.id}
              task={task}
              goal={task.goal}
              isCompleted={task.isCompleted}
              onCheckIn={() => openModal(task)}
              onOpen={() =>
                navigation.navigate('LongTermDetail', {
                  goalId: task.goal!.id,
                  taskId: task.id,
                  taskName: task.name,
                })
              }
            />
          ) : null,
        )}

        {/* Prerequisite nudge banner */}
        {hasDiscountableTasks && (
          <View style={styles.prereqBanner}>
            <View style={styles.nudgeDot} />
            <Text style={styles.prereqText}>先完成本分任務，解鎖完整金幣！</Text>
          </View>
        )}

        {/* Duty tasks (Task-A + Task-B) */}
        {dutyTasks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="本分任務" />
            {dutyTasks.map(task => (
              <DutyTaskCard
                key={task.id}
                task={task}
                isCompleted={task.isCompleted}
                onPress={() => openModal(task)}
              />
            ))}
          </View>
        )}

        {/* Contribution tasks (Task-C) */}
        {contributionTasks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="貢獻任務" />
            {contributionTasks.map(task => (
              <ContributionTaskCard
                key={task.id}
                task={task}
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
            <Text style={styles.emptySub}>你今天超棒的！</Text>
          </View>
        )}

        <View style={styles.addTaskCard}>
          <View style={styles.addTaskTextBlock}>
            <Text style={styles.addTaskTitle}>新增任務</Text>
            <Text style={styles.addTaskSub}>想多加一件今天的事？把它放進清單裡。</Text>
          </View>
          <TouchableOpacity style={styles.addTaskBtn} onPress={openAddTask} activeOpacity={0.85}>
            <Text style={styles.addTaskBtnText}>＋ 新增</Text>
          </TouchableOpacity>
        </View>

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
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgCanvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'rgba(255, 248, 238, 0.85)',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 14,
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 18,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontWeight: '800',
    fontSize: 22,
    color: Colors.ink900,
    lineHeight: 26,
  },
  greetSub: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink500,
    marginTop: 2,
  },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.bgSurface,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: 999,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 3,
  },
  coinCount: {
    fontWeight: '800',
    fontSize: 17,
    color: Colors.gold700,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  prereqBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.coral100,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  nudgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.coral500,
  },
  prereqText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.coral700,
  },
  section: {
    marginBottom: 24,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    marginTop: 6,
    marginLeft: 4,
  },
  sectionTitle: {
    fontWeight: '800',
    fontSize: 13,
    color: Colors.ink700,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 72,
  },
  emptyTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.ink900,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 16,
    color: Colors.ink500,
    fontWeight: '500',
  },
  addTaskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: Colors.bgSurface,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
  },
  addTaskTextBlock: {
    flex: 1,
  },
  addTaskTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.ink900,
    marginBottom: 4,
  },
  addTaskSub: {
    fontSize: 13,
    color: Colors.ink500,
    lineHeight: 18,
  },
  addTaskBtn: {
    backgroundColor: Colors.coral500,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 2,
  },
  addTaskBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
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
    backgroundColor: Colors.bgCanvas,
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
    backgroundColor: Colors.bgCanvas,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },
  segmentBtnActive: {
    backgroundColor: Colors.coral100,
    borderColor: Colors.coral300,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink700,
  },
  segmentTextActive: {
    color: Colors.coral700,
  },
  hintPill: {
    backgroundColor: Colors.bgCanvas,
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
    backgroundColor: Colors.bgCanvas,
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
    backgroundColor: Colors.coral500,
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
