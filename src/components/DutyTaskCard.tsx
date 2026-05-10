import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';
import { HourglassIcon, CheckIcon } from './icons/TaskIcons';
import type { TodayTask } from '../hooks/useTodayTasks';

interface DutyTaskCardProps {
  task: TodayTask;
  isCompleted: boolean;
  onPress: () => void;
}

const CAT_LABEL: Record<string, string> = { A: '自理', B: '本分' };

export default function DutyTaskCard({ task, isCompleted, onPress }: DutyTaskCardProps) {
  const bg = task.category === 'B' ? Colors.bgDutyAlt : Colors.bgDuty;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: bg }, isCompleted && styles.cardDone]}
      onPress={onPress}
      disabled={isCompleted && !task.allow_repeat}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityHint={`${task.name}，${isCompleted ? '已完成' : '未完成'}`}
    >
      <View style={styles.iconWrap}>
        <HourglassIcon size={28} />
      </View>

      <View style={styles.mid}>
        <Text style={[styles.taskName, isCompleted && styles.taskNameDone]} numberOfLines={2}>
          {task.name}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.catLabel}>{CAT_LABEL[task.category] ?? task.category}</Text>
          {task.category === 'B' && task.time_saving_min > 0 && (
            <View style={styles.timePill}>
              <Text style={styles.timePillText}>省 {task.time_saving_min} 分</Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.checkBtn, isCompleted && styles.checkBtnDone]}>
        {isCompleted && <CheckIcon size={16} color="#FFFFFF" />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
  iconWrap: {
    width: 44,
    height: 44,
    backgroundColor: Colors.bgSurface,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  mid: {
    flex: 1,
    gap: 4,
  },
  taskName: {
    fontWeight: '700',
    fontSize: 17,
    color: Colors.ink900,
    lineHeight: 22,
  },
  taskNameDone: {
    textDecorationLine: 'line-through',
    color: Colors.ink500,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.ink700,
  },
  timePill: {
    backgroundColor: Colors.sage600,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  timePillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
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
    backgroundColor: Colors.sage600,
    borderColor: 'transparent',
  },
});
