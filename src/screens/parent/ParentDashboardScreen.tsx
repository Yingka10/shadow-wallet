import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../App';
import { useSelectedChild } from '../../context/SelectedChildContext';
import { ParentTopBar } from '../../components/ParentTopBar';
import { ParentColors, ParentSpacing, ParentRadii, ParentShadows } from '../../constants/parentTheme';
import { useParentDashboard, type DashboardTask, type DashboardGoal, type DashboardTaskStatus } from '../../hooks/useParentDashboard';
import type { TaskCategory } from '../../types/database';

// ---------------------------------------------------------------------------
// Small SVG icons
// ---------------------------------------------------------------------------

function PlusIcon({ size = 18, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

function ChevronRightIcon({ size = 14, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function FlagIcon({ size = 13, color = ParentColors.ink500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 21V4m0 0h13l-3 5 3 5H4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SparkleIcon({ size = 16, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 2l1.5 5 5 1.5-5 1.5L12 15l-1.5-5-5-1.5 5-1.5z" />
    </Svg>
  );
}

function SunIcon({ size = 14, color = ParentColors.ink700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={2} />
      <Path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function HourglassSmIcon({ size = 14, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 3h14M5 21h14M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CoinSmIcon({ size = 12, color = '#A87800' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Path d="M12 8v8M9.5 10.5c0-1 1-2 2.5-2s2.5 1 2.5 2-1 1.5-2.5 1.5-2.5.5-2.5 1.5 1 2 2.5 2 2.5-1 2.5-2" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

function CheckSmIcon({ size = 12, color = ParentColors.success }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4 4L19 7" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Task category metadata
// ---------------------------------------------------------------------------

const TASK_CAT_META: Record<TaskCategory, {
  label: string;
  tint: string;
  fg: string;
  icon: React.ReactElement<any>;
}> = {
  A: { label: '生活自理', tint: '#EAE4D7', fg: ParentColors.ink700, icon: <SunIcon size={14} color={ParentColors.ink700} /> },
  B: { label: '家庭本分', tint: '#EAF0EE', fg: ParentColors.teal500, icon: <HourglassSmIcon size={14} color={ParentColors.teal500} /> },
  C: { label: '超出本分', tint: '#FAF1E7', fg: ParentColors.clay500, icon: <SparkleIcon size={14} color={ParentColors.clay500} /> },
  D: { label: '成長里程碑', tint: '#F4EBF0', fg: ParentColors.plum500, icon: <FlagIcon size={14} color={ParentColors.plum500} /> },
};

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({
  eyebrow,
  icon,
  value,
  delta,
  deltaPositive = false,
}: {
  eyebrow: string;
  icon: React.ReactElement;
  value: string;
  delta: string;
  deltaPositive?: boolean;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statEyebrowRow}>
        {icon}
        <Text style={styles.statEyebrow}>{eyebrow}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={[styles.statDelta, deltaPositive && styles.statDeltaPos]}>
        {delta}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// GoalCard
// ---------------------------------------------------------------------------

function GoalCard({ goal }: { goal: DashboardGoal }) {
  const pct = Math.min(100, Math.round((goal.current / goal.target) * 100));
  const remaining = Math.max(0, goal.target - goal.current);
  const isGoalMet = goal.current >= goal.target;

  return (
    <View style={styles.goalCard}>
      <View style={styles.goalHeader}>
        <View>
          <View style={styles.goalEyebrowRow}>
            <FlagIcon size={12} color={ParentColors.ink500} />
            <Text style={styles.goalEyebrow}>當前目標</Text>
          </View>
          <Text style={styles.goalName}>{goal.name}</Text>
        </View>
        <View style={styles.goalRemaining}>
          {isGoalMet ? (
            <Text style={styles.goalMetLabel}>已達標 🎉</Text>
          ) : (
            <>
              <Text style={styles.goalRemainingLabel}>剩餘</Text>
              <Text style={styles.goalRemainingNum}>
                {remaining}
                <Text style={styles.goalRemainingUnit}> 枚金幣</Text>
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
      </View>

      <View style={styles.goalFooter}>
        {isGoalMet ? (
          <Text style={styles.goalMetHint}>金幣已存夠，可以跟孩子討論兌換囉！</Text>
        ) : (
          <>
            <Text style={styles.goalProgress}>{goal.current} / {goal.target}</Text>
            <Text style={styles.goalEta}>
              預估再 <Text style={styles.goalEtaAccent}>{goal.etaLabel}</Text> 達成
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// QuickActionCard
// ---------------------------------------------------------------------------

function QuickActionCard({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.quickActionIcon}>
        <PlusIcon size={18} color={ParentColors.teal500} />
      </View>
      <View style={styles.quickActionText}>
        <Text style={styles.quickActionTitle}>新增任務</Text>
        <Text style={styles.quickActionDesc}>替孩子安排新項目，或從建議清單挑一個</Text>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// SectionHeader
// ---------------------------------------------------------------------------

function SectionHeader({
  completed,
  total,
  onViewAll,
}: {
  completed: number;
  total: number;
  onViewAll: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={styles.sectionEyebrow}>今日</Text>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>已完成 </Text>
          <Text style={[styles.sectionTitle, { color: ParentColors.teal500 }]}>{completed}</Text>
          <Text style={styles.sectionTitleMuted}> / {total}</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.viewAllBtn} onPress={onViewAll}>
        <Text style={styles.viewAllText}>全部</Text>
        <ChevronRightIcon size={13} color={ParentColors.teal500} />
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

type PillTone = 'sage' | 'neutral' | 'warn' | 'clay';

const PILL_STYLE: Record<PillTone, { bg: string; text: string }> = {
  sage:    { bg: '#E8F2E6', text: ParentColors.success },
  neutral: { bg: ParentColors.ivory200, text: ParentColors.ink500 },
  warn:    { bg: '#FBF1DC', text: ParentColors.warn },
  clay:    { bg: '#FAF1E7', text: ParentColors.clay500 },
};

function StatusPill({ tone, label, icon }: { tone: PillTone; label: string; icon?: React.ReactElement }) {
  const s = PILL_STYLE[tone];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      {icon}
      <Text style={[styles.pillText, { color: s.text }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ActivityRow
// ---------------------------------------------------------------------------

function ActivityRow({ task, showDivider, onPress }: { task: DashboardTask; showDivider: boolean; onPress: () => void }) {
  const cat = TASK_CAT_META[task.cat];

  const statusConfig: Record<DashboardTaskStatus, { tone: PillTone; label: string; icon?: React.ReactElement }> = {
    done:    { tone: 'sage',    label: '已完成',   icon: <CheckSmIcon /> },
    pending: { tone: 'neutral', label: task.cat === 'D' ? '待孩子打卡' : '進行中' },
    missed:  { tone: 'warn',    label: '今日未做' },
    review:  { tone: 'clay',    label: '待審核' },
  };
  const status = statusConfig[task.status];

  return (
    <TouchableOpacity
      style={[styles.activityRow, showDivider && styles.activityRowDivider]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      {/* Category icon */}
      <View style={[styles.activityCatIcon, { backgroundColor: cat.tint }]}>
        {React.cloneElement(cat.icon, { size: 14, color: cat.fg })}
      </View>

      {/* Name + meta */}
      <View style={styles.activityInfo}>
        <Text style={styles.activityName} numberOfLines={1}>{task.name}</Text>
        <View style={styles.activityMeta}>
          <Text style={styles.activityCatLabel}>{cat.label}</Text>
          {task.completedAt && <Text style={styles.activityMetaDot}>· {task.completedAt}</Text>}
        </View>
      </View>

      {/* Reward + status */}
      <View style={styles.activityRight}>
        {task.reward && (
          <Text style={[
            styles.activityReward,
            { color: task.reward.kind === 'coins' ? '#A87800' : ParentColors.teal500 },
          ]}>
            {task.reward.kind === 'coins'
              ? `+${task.reward.amount} 枚`
              : `+${task.reward.amount}分鐘`}
          </Text>
        )}
        <StatusPill tone={status.tone} label={status.label} icon={status.icon} />
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// InsightCard
// ---------------------------------------------------------------------------

function InsightCard({ childName }: { childName: string }) {
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightIconWrap}>
        <SparkleIcon size={16} color="#FFFFFF" />
      </View>
      <View style={styles.insightBody}>
        <Text style={styles.insightTitle}>觀察筆記</Text>
        <Text style={styles.insightText}>
          {childName}本週本分任務 100% 完成，是連續第 2 週。可以考慮新增一個學習里程碑挑戰。
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ParentDashboardScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { childId } = useSelectedChild();
  const {
    child,
    spendingBalance,
    weekCoinDelta,
    timeSavedUnredeemedMin,
    timeSavedAllMin,
    goal,
    todayTasks,
    loading,
    error,
    refresh,
  } = useParentDashboard(childId);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const todayLabel = new Date().toLocaleDateString('zh-TW', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const unredeemedH = Math.floor(timeSavedUnredeemedMin / 60);
  const unredeemedM = timeSavedUnredeemedMin % 60;
  const allTimeH = Math.floor(timeSavedAllMin / 60);
  const completed = todayTasks.filter(t => t.status === 'done').length;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ParentColors.teal500} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ParentTopBar onSettingsPress={() => navigation.navigate('ParentSettings')} />
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Greeting */}
      <View style={styles.greeting}>
        <Text style={styles.greetingEyebrow}>{todayLabel}</Text>
        <Text style={styles.greetingDisplay}>早安</Text>
        <Text style={styles.greetingSubtitle}>
          來看看 {child?.nickname ?? ''} 的今天
        </Text>
      </View>

      {/* Stat cards */}
      <View style={styles.statRow}>
        <StatCard
          eyebrow="撲滿金幣"
          icon={<CoinSmIcon size={12} color={ParentColors.ink500} />}
          value={`${spendingBalance}`}
          delta={weekCoinDelta > 0 ? `+${weekCoinDelta} 本週` : '本週尚無記錄'}
          deltaPositive={weekCoinDelta > 0}
        />
        <StatCard
          eyebrow="時間儲蓄本"
          icon={<HourglassSmIcon size={12} color={ParentColors.ink500} />}
          value={`${unredeemedH}時 ${unredeemedM}分`}
          delta={`為家裡省下 · 累計 ${allTimeH}h`}
        />
      </View>

      {/* Goal card */}
      {goal && <GoalCard goal={goal} />}

      {/* Quick action */}
      <QuickActionCard onPress={() => navigation.navigate('ParentTaskCreate')} />

      {/* Today section */}
      {todayTasks.length > 0 && (
        <>
          <SectionHeader completed={completed} total={todayTasks.length} onViewAll={() => {}} />
          <View style={styles.taskList}>
            {todayTasks.map((task, i) => (
              <ActivityRow
                key={task.id}
                task={task}
                showDivider={i < todayTasks.length - 1}
                onPress={() => navigation.navigate('ParentTaskDetail', { taskId: task.id, childId, taskName: task.name })}
              />
            ))}
          </View>
        </>
      )}

      {/* AI insight */}
      {child && <InsightCard childName={child.nickname} />}
    </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: ParentColors.bgCanvas,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: ParentSpacing.gutter,
    paddingTop: 14,
    paddingBottom: 110,
  },

  // Greeting
  greeting: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  greetingEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: ParentColors.ink500,
    marginBottom: 6,
  },
  greetingDisplay: {
    fontSize: 30,
    fontWeight: '500',
    color: ParentColors.ink900,
    letterSpacing: -0.6,
    lineHeight: 35,
  },
  greetingSubtitle: {
    fontSize: 18,
    fontWeight: '400',
    fontStyle: 'italic',
    color: ParentColors.ink500,
    marginTop: 2,
  },

  // Stat cards
  statRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: ParentRadii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    ...ParentShadows.card,
  },
  statEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  statEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: ParentColors.ink500,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '500',
    lineHeight: 28,
    color: ParentColors.ink900,
    letterSpacing: -0.5,
  },
  statDelta: {
    marginTop: 4,
    fontSize: 11.5,
    fontWeight: '500',
    color: ParentColors.ink500,
  },
  statDeltaPos: {
    color: ParentColors.success,
  },

  // Goal card
  goalCard: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: ParentRadii.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    marginBottom: 14,
    ...ParentShadows.card,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  goalEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  goalEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: ParentColors.ink500,
  },
  goalName: {
    fontSize: 21,
    fontWeight: '500',
    color: ParentColors.ink900,
    letterSpacing: -0.3,
    maxWidth: 180,
  },
  goalRemaining: {
    alignItems: 'flex-end',
  },
  goalMetLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: ParentColors.teal500,
  },
  goalMetHint: {
    fontSize: 12,
    color: ParentColors.teal500,
    fontWeight: '500',
  },
  goalRemainingLabel: {
    fontSize: 12,
    color: ParentColors.ink500,
    letterSpacing: 0.2,
  },
  goalRemainingNum: {
    fontSize: 22,
    fontWeight: '500',
    color: ParentColors.teal500,
    letterSpacing: -0.4,
  },
  goalRemainingUnit: {
    fontSize: 12,
    fontWeight: '400',
    color: ParentColors.ink500,
  },
  progressTrack: {
    height: 8,
    backgroundColor: ParentColors.ivory200,
    borderRadius: ParentRadii.pill,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: ParentColors.teal400,
    borderRadius: ParentRadii.pill,
  },
  goalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalProgress: {
    fontSize: 13,
    color: ParentColors.ink500,
    fontVariant: ['tabular-nums'],
  },
  goalEta: {
    fontSize: 12,
    color: ParentColors.ink500,
  },
  goalEtaAccent: {
    color: ParentColors.ink900,
    fontWeight: '600',
  },

  // Quick action
  quickAction: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: ParentRadii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 22,
    ...ParentShadows.card,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: ParentColors.teal50,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  quickActionText: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: ParentColors.ink900,
  },
  quickActionDesc: {
    fontSize: 11.5,
    color: ParentColors.ink500,
    marginTop: 1,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: ParentColors.ink500,
    marginBottom: 2,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: ParentColors.ink900,
    letterSpacing: -0.3,
  },
  sectionTitleMuted: {
    fontSize: 14,
    fontWeight: '400',
    color: ParentColors.ink500,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingBottom: 2,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '500',
    color: ParentColors.teal500,
  },

  // Task list
  taskList: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    overflow: 'hidden',
    marginBottom: 18,
    ...ParentShadows.card,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  activityRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  activityCatIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  activityInfo: {
    flex: 1,
    minWidth: 0,
  },
  activityName: {
    fontSize: 14.5,
    fontWeight: '500',
    color: ParentColors.ink900,
  },
  activityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  activityCatLabel: {
    fontSize: 11.5,
    color: ParentColors.ink500,
  },
  activityMetaDot: {
    fontSize: 11.5,
    color: ParentColors.ink400,
  },
  activityRight: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  activityReward: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Status pill
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: ParentRadii.pill,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Insight card
  insightCard: {
    backgroundColor: ParentColors.teal50,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: ParentColors.teal100,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  insightIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: ParentColors.teal500,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  insightBody: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: ParentColors.teal700,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  insightText: {
    fontSize: 13.5,
    color: ParentColors.ink800,
    lineHeight: 20,
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.bgCanvas,
  },
  errorText: {
    fontSize: 15,
    color: ParentColors.error,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
