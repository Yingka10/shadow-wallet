import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../App';
import { useTodayTasks, type TodayTask } from '../../hooks/useTodayTasks';
import DutyTaskCard from '../../components/DutyTaskCard';
import ContributionTaskCard from '../../components/ContributionTaskCard';
import GoalHeroCard from '../../components/GoalHeroCard';
import BottomNav from '../../components/BottomNav';
import TaskCompleteModal from '../../components/TaskCompleteModal';
import FeedbackAnimation, { type FeedbackType } from '../../components/FeedbackAnimation';
import { CoinIcon, WaveIcon } from '../../components/icons/TaskIcons';
import { completeTask } from '../../lib/taskActions';
import { Colors } from '../../constants/colors';
import type { Task } from '../../types/database';

type HomeRoute = RouteProp<RootStackParamList, 'Home'>;
type Nav = StackNavigationProp<RootStackParamList, 'Home'>;

type ModalState = { task: TodayTask | null; visible: boolean };
type FeedbackState = { visible: boolean; type: FeedbackType; value: number };

// TODO: replace with useWallet(childId) once wallet hook is implemented
const MOCK_COIN_BALANCE = 128;

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

  const [modal, setModal] = useState<ModalState>({ task: null, visible: false });
  const [feedback, setFeedback] = useState<FeedbackState>({ visible: false, type: 'task-a', value: 0 });

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
          onPress={() => Alert.alert('撲滿', '即將推出！')}
          accessibilityLabel={`金幣餘額 ${MOCK_COIN_BALANCE}`}
        >
          <CoinIcon size={28} />
          <Text style={styles.coinCount}>{MOCK_COIN_BALANCE}</Text>
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

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Bottom nav */}
      <BottomNav
        activeTab="home"
        onTabPress={tab => {
          if (tab !== 'home') Alert.alert('功能開發中', '即將推出！');
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
  bottomPad: {
    height: 32,
  },
});
