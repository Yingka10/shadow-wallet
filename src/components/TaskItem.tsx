import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
  return Math.round(base * (isPrerequisiteMet ? 1.0 : 0.7));
}

const CAT_EMOJI: Record<string, string> = { A: '🌅', B: '🏡', C: '⭐', D: '🚀' };
const CAT_LABEL: Record<string, string> = { A: '自理', B: '本分', C: '貢獻', D: '成長' };

const ACCENT_BAR = StyleSheet.create({
  A: { backgroundColor: '#3B82F6' },
  B: { backgroundColor: '#10B981' },
  C: { backgroundColor: '#F97316' },
  D: { backgroundColor: '#8B5CF6' },
});

const ICON_BG = StyleSheet.create({
  A: { backgroundColor: '#DBEAFE' },
  B: { backgroundColor: '#D1FAE5' },
  C: { backgroundColor: '#FFEDD5' },
  D: { backgroundColor: '#EDE9FE' },
});

const CAT_TEXT = StyleSheet.create({
  A: { color: '#2563EB' },
  B: { color: '#059669' },
  C: { color: '#EA580C' },
  D: { color: '#7C3AED' },
});

const PROGRESS_BAR = StyleSheet.create({
  A: { backgroundColor: '#3B82F6' },
  B: { backgroundColor: '#10B981' },
  C: { backgroundColor: '#F97316' },
  D: { backgroundColor: '#8B5CF6' },
});

type TaskCategory = 'A' | 'B' | 'C' | 'D';

function toCategory(cat: string): TaskCategory {
  if (cat === 'A' || cat === 'B' || cat === 'C' || cat === 'D') return cat;
  return 'B';
}

function LongTermProgress({ goal, category }: { goal: LongTermGoal; category: TaskCategory }) {
  const total = goal.total_days ?? 30;
  const pct = Math.min(Math.round((goal.current_day / total) * 100), 100);
  const label =
    goal.goal_type === 'habit'
      ? `第 ${goal.current_day} / ${total} 天`
      : `Level ${goal.current_day} / ${total}`;

  return (
    <View style={styles.ltWrap}>
      <View style={styles.ltTrack}>
        <View style={[styles.ltFill, PROGRESS_BAR[category], { width: `${pct}%` }]} />
      </View>
      <Text style={styles.ltLabel}>{label}</Text>
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
  const cat = toCategory(task.category);
  const showDiscount = (task.category === 'C' || task.category === 'D') && !isPrerequisiteMet;
  const displayCoin = calcDisplayCoin(task, isPrerequisiteMet);

  return (
    <TouchableOpacity
      style={[styles.card, isCompleted && styles.cardDone]}
      onPress={onPress}
      disabled={isCompleted && !task.allow_repeat}
      activeOpacity={0.75}
    >
      <View style={[styles.accentBar, ACCENT_BAR[cat]]} />

      <View style={styles.inner}>
        <View style={styles.row}>
          <View style={[styles.iconCircle, ICON_BG[cat]]}>
            {isCompleted ? (
              <Text style={styles.doneCheck}>✓</Text>
            ) : (
              <Text style={styles.catEmoji}>{CAT_EMOJI[task.category] ?? '📋'}</Text>
            )}
          </View>

          <View style={styles.mid}>
            <Text style={[styles.taskName, isCompleted && styles.taskNameDone]} numberOfLines={2}>
              {task.name}
            </Text>
            <Text style={[styles.catLabel, isCompleted ? styles.catLabelDone : CAT_TEXT[cat]]}>
              {CAT_LABEL[task.category] ?? task.category}
              {showDiscount ? ' · 打折中 🔓' : ''}
            </Text>
          </View>

          <View style={styles.rewardCol}>
            {task.category === 'A' && <Text style={styles.noCoin}>—</Text>}
            {task.category === 'B' && (
              <View style={styles.timePill}>
                <Text style={styles.timePillText}>⏱ +{task.time_saving_min}分</Text>
              </View>
            )}
            {(task.category === 'C' || task.category === 'D') && !task.is_long_term && (
              <View style={[styles.coinPill, showDiscount && styles.coinPillDiscount]}>
                <Text style={[styles.coinAmt, showDiscount && styles.coinAmtDiscount]}>
                  +{displayCoin}幣
                </Text>
              </View>
            )}
          </View>
        </View>

        {task.is_long_term && goal && <LongTermProgress goal={goal} category={cat} />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginBottom: 10,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#1E1B4B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  cardDone: {
    opacity: 0.5,
  },
  accentBar: {
    width: 6,
  },
  inner: {
    flex: 1,
    padding: 14,
    paddingLeft: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  doneCheck: {
    fontSize: 20,
    color: '#22C55E',
    fontWeight: '900',
  },
  catEmoji: {
    fontSize: 20,
  },
  mid: {
    flex: 1,
    gap: 4,
  },
  taskName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  taskNameDone: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  catLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  catLabelDone: {
    color: '#D1D5DB',
  },
  rewardCol: {
    marginLeft: 10,
    alignItems: 'flex-end',
  },
  noCoin: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
  },
  timePill: {
    backgroundColor: '#D1FAE5',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  timePillText: {
    color: '#065F46',
    fontSize: 12,
    fontWeight: '800',
  },
  coinPill: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  coinPillDiscount: {
    backgroundColor: '#FEE2E2',
  },
  coinAmt: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '800',
  },
  coinAmtDiscount: {
    color: '#DC2626',
  },
  ltWrap: {
    marginTop: 12,
    gap: 5,
  },
  ltTrack: {
    height: 7,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  ltFill: {
    height: 7,
    borderRadius: 4,
  },
  ltLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
  },
});
