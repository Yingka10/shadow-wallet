import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';
import { CoinIcon, CheckIcon } from './icons/TaskIcons';
import type { TodayTask } from '../hooks/useTodayTasks';
import type { Task } from '../types/database';

interface ContributionTaskCardProps {
  task: TodayTask;
  isCompleted: boolean;
  isPrerequisiteMet: boolean;
  onPress: () => void;
}

function calcDisplayCoin(task: Task, isPrerequisiteMet: boolean): number {
  const base = task.coin_override ?? Math.round(task.base_time_min * task.difficulty);
  return Math.round(base * (isPrerequisiteMet ? 1.0 : 0.7));
}

export default function ContributionTaskCard({
  task,
  isCompleted,
  isPrerequisiteMet,
  onPress,
}: ContributionTaskCardProps) {
  const showDiscount = !isPrerequisiteMet && !isCompleted;
  const displayCoin = calcDisplayCoin(task, isPrerequisiteMet);
  const fullCoin = calcDisplayCoin(task, true);

  return (
    <TouchableOpacity
      style={[styles.card, isCompleted && styles.cardDone]}
      onPress={onPress}
      disabled={isCompleted && !task.allow_repeat}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${task.name}，貢獻任務，${displayCoin} 金幣`}
    >
      <View style={styles.topRow}>
        <View style={isCompleted ? styles.coinOpaque : undefined}>
          <CoinIcon size={48} />
        </View>

        <View style={styles.mid}>
          <Text style={[styles.taskName, isCompleted && styles.taskNameDone]} numberOfLines={2}>
            {task.name}
          </Text>
          <Text style={styles.catLabel}>貢獻任務</Text>
        </View>

        <View style={styles.rewardPill}>
          <CoinIcon size={18} />
          {showDiscount && (
            <Text style={[styles.rewardText, styles.strikeText]}>+{fullCoin} 幣</Text>
          )}
          <Text style={styles.rewardText}>+{displayCoin} 幣</Text>
        </View>

        <View style={[styles.checkBtn, isCompleted && styles.checkBtnDone]}>
          {isCompleted && <CheckIcon size={16} color="#FFFFFF" />}
        </View>
      </View>

      {showDiscount && (
        <View style={styles.nudge}>
          <View style={styles.nudgeDot} />
          <Text style={styles.nudgeText}>先完成本分，解鎖完整金幣！</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgContribution,
    borderRadius: 20,
    padding: 16,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
    marginBottom: 10,
  },
  cardDone: {
    opacity: 0.55,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  coinOpaque: {
    opacity: 0.55,
  },
  mid: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  taskName: {
    fontWeight: '800',
    fontSize: 18,
    color: Colors.ink900,
    lineHeight: 23,
  },
  taskNameDone: {
    textDecorationLine: 'line-through',
    color: Colors.ink500,
  },
  catLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink700,
  },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bgSurface,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 10,
    borderRadius: 999,
    flexShrink: 0,
  },
  rewardText: {
    fontWeight: '800',
    fontSize: 14,
    color: Colors.gold700,
  },
  strikeText: {
    textDecorationLine: 'line-through',
    opacity: 0.55,
  },
  checkBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: Colors.ink300,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkBtnDone: {
    backgroundColor: Colors.gold600,
    borderColor: 'transparent',
  },
  nudge: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  nudgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.coral500,
  },
  nudgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.coral700,
  },
});
