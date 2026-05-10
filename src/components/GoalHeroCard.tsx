import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';
import { TargetIcon, CheckIcon } from './icons/TaskIcons';
import type { TodayTask } from '../hooks/useTodayTasks';
import type { LongTermGoal } from '../types/database';

interface GoalHeroCardProps {
  task: TodayTask;
  goal: LongTermGoal;
  isCompleted: boolean;
  onCheckIn: () => void;
  onOpen: () => void;
}

function ProgressPips({ current, total }: { current: number; total: number }) {
  const visible = Math.min(total, 8);
  return (
    <View style={styles.pips}>
      {Array.from({ length: visible }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.pip,
            {
              backgroundColor:
                i < current - 1
                  ? Colors.sage400
                  : i === current - 1
                  ? Colors.sage600
                  : Colors.cream200,
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function GoalHeroCard({
  task,
  goal,
  isCompleted,
  onCheckIn,
  onOpen,
}: GoalHeroCardProps) {
  const isStreak = goal.goal_type === 'habit';
  const total = goal.total_days ?? 30;
  const progressPct = Math.min(Math.round((goal.current_day / total) * 100), 100);
  const remaining = total - goal.current_day;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: isStreak ? Colors.gold100 : Colors.sage100 }]}
      onPress={onOpen}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`長期目標：${task.name}`}
    >
      {/* Radial spotlight tint */}
      <View
        pointerEvents="none"
        style={[
          styles.tintOverlay,
          {
            backgroundColor: isStreak
              ? 'rgba(255,216,107,0.35)'
              : 'rgba(168,213,186,0.35)',
          },
        ]}
      />

      {/* Icon square */}
      <View style={styles.iconWrap}>
        <TargetIcon size={44} />
        {!isStreak && (
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>{goal.current_day}</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.labelRow}>
          <Text
            style={[
              styles.typeLabel,
              { color: isStreak ? Colors.coral600 : Colors.sage600 },
            ]}
          >
            長期目標 · {isStreak ? '連續打卡' : '等級解鎖'}
          </Text>
          {isStreak && (
            <View style={styles.streakRibbon}>
              <Text>🔥 </Text>
              <Text style={styles.streakRibbonText}>第 {goal.current_day} 天</Text>
            </View>
          )}
        </View>

        <Text style={styles.goalTitle} numberOfLines={2}>
          {task.name}
        </Text>

        {isStreak ? (
          <>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
              <Text style={styles.progressLabel}>
                {goal.current_day} / {total}
              </Text>
            </View>
            <Text style={styles.goalSub}>
              {remaining > 0
                ? `再 ${remaining} 天就完成這一輪挑戰！`
                : '這一輪完成了，繼續保持！'}
            </Text>
          </>
        ) : (
          <>
            <ProgressPips current={goal.current_day} total={total} />
            <Text style={styles.goalSub}>Level {goal.current_day} / {total}</Text>
          </>
        )}
      </View>

      {/* 打卡 button (streak only) */}
      {isStreak && (
        <TouchableOpacity
          style={[styles.stampBtn, isCompleted && styles.stampBtnDone]}
          onPress={onCheckIn}
          accessibilityLabel="今天打卡"
          accessibilityRole="button"
        >
          <CheckIcon size={24} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    marginBottom: 18,
    overflow: 'hidden',
    shadowColor: Colors.shadowGold,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 32,
    elevation: 6,
  },
  tintOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  iconWrap: {
    width: 68,
    height: 68,
    backgroundColor: Colors.bgSurface,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 3,
  },
  levelBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    backgroundColor: Colors.sage600,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  streakRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgSurface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  streakRibbonText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.ink700,
  },
  goalTitle: {
    fontWeight: '800',
    fontSize: 20,
    color: Colors.ink900,
    lineHeight: 24,
    marginBottom: 10,
  },
  progressTrack: {
    height: 12,
    backgroundColor: Colors.bgSurface,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 8,
    justifyContent: 'center',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.gold500,
    borderRadius: 999,
  },
  progressLabel: {
    position: 'absolute',
    right: 8,
    fontSize: 10,
    fontWeight: '800',
    color: Colors.gold700,
    lineHeight: 12,
    top: 0,
    bottom: 0,
    textAlignVertical: 'center',
  },
  goalSub: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink700,
  },
  pips: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  pip: {
    flex: 1,
    height: 8,
    borderRadius: 999,
  },
  stampBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.coral500,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: Colors.coral700,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  stampBtnDone: {
    backgroundColor: Colors.sage600,
  },
});
