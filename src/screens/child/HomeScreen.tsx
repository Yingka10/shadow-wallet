import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Colors } from '../../constants/colors';
import type { RootStackParamList } from '../../../App';
import { useTodayTasks, type TodayTask } from '../../hooks/useTodayTasks';
import TaskItem from '../../components/TaskItem';
import TaskCompleteModal from '../../components/TaskCompleteModal';
import FeedbackAnimation, { type FeedbackType } from '../../components/FeedbackAnimation';
import { completeTask } from '../../lib/taskActions';
import type { Task } from '../../types/database';

type HomeRoute = RouteProp<RootStackParamList, 'Home'>;
type Nav = StackNavigationProp<RootStackParamList, 'Home'>;

type ModalState = {
  task: TodayTask | null;
  visible: boolean;
};

type FeedbackState = {
  visible: boolean;
  type: FeedbackType;
  value: number;
};

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCount}>{count} 個任務</Text>
    </View>
  );
}

function PrereqBanner() {
  return (
    <View style={styles.prereqBanner}>
      <Text style={styles.prereqBannerText}>
        ⚠️ 完成自理和本分任務後，貢獻任務的幣值會恢復全額！
      </Text>
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
  const [feedback, setFeedback] = useState<FeedbackState>({
    visible: false,
    type: 'task-a',
    value: 0,
  });

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

  const hasDiscountableTasks =
    !isPrerequisiteMet &&
    [...weekdayTasks, ...weekendTasks].some(
      t => (t.category === 'C' || t.category === 'D') && !t.isCompleted,
    );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>今天的任務</Text>
          <TouchableOpacity
            onPress={() => navigation.replace('Entry')}
            style={styles.logoutBtn}
          >
            <Text style={styles.logoutText}>登出</Text>
          </TouchableOpacity>
        </View>

        {hasDiscountableTasks && <PrereqBanner />}

        {weekdayTasks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="平日任務" count={weekdayTasks.length} />
            {weekdayTasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                isCompleted={task.isCompleted}
                isPrerequisiteMet={isPrerequisiteMet}
                onPress={() => openModal(task)}
              />
            ))}
          </View>
        )}

        {weekendTasks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="週末任務" count={weekendTasks.length} />
            {weekendTasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                isCompleted={task.isCompleted}
                isPrerequisiteMet={isPrerequisiteMet}
                onPress={() => openModal(task)}
              />
            ))}
          </View>
        )}

        {longTermTasks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="長期任務" count={longTermTasks.length} />
            {longTermTasks.map(task => (
              <TouchableOpacity
                key={task.id}
                onPress={() => {
                  if (task.goal) {
                    navigation.navigate('LongTermDetail', {
                      goalId: task.goal.id,
                      taskId: task.id,
                      taskName: task.name,
                    });
                  }
                }}
                activeOpacity={0.75}
              >
                <TaskItem
                  task={task}
                  isCompleted={task.isCompleted}
                  isPrerequisiteMet={isPrerequisiteMet}
                  goal={task.goal}
                  onPress={() => openModal(task)}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {weekdayTasks.length === 0 &&
          weekendTasks.length === 0 &&
          longTermTasks.length === 0 &&
          !loading && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🎉</Text>
              <Text style={styles.emptyText}>今天的任務都完成了！</Text>
            </View>
          )}
      </ScrollView>

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
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: Colors.text,
  },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: Colors.border,
  },
  logoutText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  prereqBanner: {
    backgroundColor: Colors.warning + '22',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  prereqBannerText: {
    fontSize: 13,
    color: Colors.text,
    lineHeight: 18,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  sectionCount: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 20,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
});
