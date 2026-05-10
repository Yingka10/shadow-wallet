import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';
import type { Task, LongTermGoal } from '../types/database';

interface TaskItemProps {
  task: Task;
  isCompleted: boolean;
  isPrerequisiteMet: boolean;
  goal?: LongTermGoal;
  onPress: () => void;
}

function calcDisplayCoin(task: Task, isPrerequisiteMet: boolean): number {
  if (task.category === 'A' || task.category === 'B') return 0;
  const base = task.coin_override ?? Math.round(task.base_time_min * task.difficulty);
  const discount = isPrerequisiteMet ? 1.0 : 0.7;
  return Math.round(base * discount);
}

function CategoryBadge({ category }: { category: string }) {
  const labels: Record<string, string> = { A: '自理', B: '本分', C: '貢獻', D: '成長' };
  const bg: Record<string, string> = {
    A: Colors.textSecondary,
    B: Colors.primary,
    C: Colors.secondary,
    D: '#8B5CF6',
  };
  return (
    <View style={[styles.badge, { backgroundColor: bg[category] ?? Colors.textSecondary }]}>
      <Text style={styles.badgeText}>{labels[category] ?? category}</Text>
    </View>
  );
}

function LongTermProgress({ goal }: { goal: LongTermGoal }) {
  const total = goal.total_days ?? 30;
  const progress = Math.min(goal.current_day / total, 1);
  const label =
    goal.goal_type === 'habit'
      ? `第 ${goal.current_day} / ${total} 天`
      : `Level ${goal.current_day} / ${total}`;

  return (
    <View style={styles.progressContainer}>
      <Text style={styles.progressLabel}>{label}</Text>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
    </View>
  );
}

export default function TaskItem({
  task,
  isCompleted,
  isPrerequisiteMet,
  goal,
  onPress,
}: TaskItemProps) {
  const showCoinDiscount = (task.category === 'C' || task.category === 'D') && !isPrerequisiteMet;
  const displayCoin = calcDisplayCoin(task, isPrerequisiteMet);

  return (
    <TouchableOpacity
      style={[styles.card, isCompleted && styles.cardCompleted]}
      onPress={onPress}
      disabled={isCompleted && !task.allow_repeat}
      activeOpacity={0.7}
    >
      <View style={styles.row}>
        <View style={styles.leftCol}>
          {isCompleted ? (
            <View style={styles.checkCircle}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
          ) : (
            <CategoryBadge category={task.category} />
          )}
        </View>

        <View style={styles.centerCol}>
          <Text style={[styles.taskName, isCompleted && styles.taskNameCompleted]}>
            {task.name}
          </Text>
          {task.is_long_term && goal && <LongTermProgress goal={goal} />}
          {showCoinDiscount && (
            <Text style={styles.discountNote}>本分未完成，幣值打折中</Text>
          )}
        </View>

        <View style={styles.rightCol}>
          {task.category === 'A' && (
            <Text style={styles.rewardEmpty}>—</Text>
          )}
          {task.category === 'B' && (
            <View style={styles.timeSavingRow}>
              <Text style={styles.hourglassIcon}>⏳</Text>
              <Text style={styles.timeSavingText}>+{task.time_saving_min}分</Text>
            </View>
          )}
          {(task.category === 'C' || task.category === 'D') && !task.is_long_term && (
            <View style={styles.coinRow}>
              <Text style={[styles.coinText, showCoinDiscount && styles.coinTextDiscounted]}>
                +{displayCoin}
              </Text>
              <Text style={styles.coinUnit}>幣</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardCompleted: {
    opacity: 0.55,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftCol: {
    width: 44,
    alignItems: 'center',
    marginRight: 12,
  },
  centerCol: {
    flex: 1,
  },
  rightCol: {
    marginLeft: 12,
    alignItems: 'flex-end',
    minWidth: 56,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  taskName: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
  },
  taskNameCompleted: {
    textDecorationLine: 'line-through',
    color: Colors.textSecondary,
  },
  discountNote: {
    fontSize: 11,
    color: Colors.warning,
    marginTop: 3,
  },
  rewardEmpty: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  timeSavingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  hourglassIcon: {
    fontSize: 14,
  },
  timeSavingText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
  coinRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 1,
  },
  coinText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.coin,
  },
  coinTextDiscounted: {
    color: Colors.warning,
  },
  coinUnit: {
    fontSize: 12,
    color: Colors.coin,
  },
  progressContainer: {
    marginTop: 6,
  },
  progressLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 3,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
});
