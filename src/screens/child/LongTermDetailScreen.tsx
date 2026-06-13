import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,  
  Alert,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from '../../lib/supabase';
import { completeTask } from '../../lib/taskActions';
import { Colors } from '../../constants/colors';
import { CheckIcon } from '../../components/icons/TaskIcons';
import type { RootStackParamList } from '../../../App';
import type { LongTermGoal, Task } from '../../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';
const DOT_SIZE = 22;
const TRACK_HEIGHT = 14;
const LABEL_WIDTH = 44;

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ChevLeftIcon({ size = 20, color = Colors.ink700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 18l-6-6 6-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

type CpStatus = 'done' | 'active' | 'pending';

function getCpStatus(cpDay: number, currentDay: number, sortedCpDays: number[]): CpStatus {
  if (currentDay >= cpDay) return 'done';
  const firstUnreached = sortedCpDays.find(d => currentDay < d);
  return firstUnreached === cpDay ? 'active' : 'pending';
}

// ---------------------------------------------------------------------------
// Progress bar with checkpoint dots
// ---------------------------------------------------------------------------

const pbStyles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 4,
  },
  barArea: {
    height: DOT_SIZE,
    position: 'relative',
  },
  track: {
    position: 'absolute',
    top: (DOT_SIZE - TRACK_HEIGHT) / 2,
    left: 0,
    right: 0,
    height: TRACK_HEIGHT,
    backgroundColor: Colors.cream200,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: Colors.gold500,
    borderRadius: 999,
  },
  dot: {
    position: 'absolute',
    top: 0,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: Colors.ink100,
    borderWidth: 2,
    borderColor: Colors.bgCanvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: {
    backgroundColor: Colors.gold500,
    borderColor: Colors.gold300,
  },
  dotActive: {
    backgroundColor: Colors.coral500,
    borderColor: Colors.coral300,
  },
  dotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.bgSurface,
  },
  labelsArea: {
    height: 20,
    position: 'relative',
    marginTop: 6,
  },
  labelPos: {
    position: 'absolute',
    width: LABEL_WIDTH,
    alignItems: 'center',
  },
  labelText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.ink300,
    textAlign: 'center',
  },
  labelDone: {
    color: Colors.gold600,
  },
  labelActive: {
    fontWeight: '800',
    color: Colors.coral600,
  },
});

function ProgressBarWithCheckpoints({
  current,
  total,
  checkpointRewards,
}: {
  current: number;
  total: number;
  checkpointRewards: Record<string, number> | null;
}) {
  const fillPct = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  const sortedCpDays = checkpointRewards
    ? Object.keys(checkpointRewards).map(Number).sort((a, b) => a - b)
    : [];

  return (
    <View style={pbStyles.wrapper}>
      <View style={pbStyles.barArea}>
        <View style={pbStyles.track}>
          <View style={[pbStyles.fill, { width: `${fillPct}%` as any }]} />
        </View>
        {sortedCpDays.map(cpDay => {
          const cpPct = total > 0 ? (cpDay / total) * 100 : 0;
          const status = getCpStatus(cpDay, current, sortedCpDays);
          return (
            <View
              key={cpDay}
              style={[
                pbStyles.dot,
                status === 'done' && pbStyles.dotDone,
                status === 'active' && pbStyles.dotActive,
                { left: `${cpPct}%` as any, marginLeft: -(DOT_SIZE / 2) },
              ]}
            >
              {status === 'done' && <CheckIcon size={10} color="#fff" />}
              {status === 'active' && <View style={pbStyles.dotInner} />}
            </View>
          );
        })}
      </View>
      <View style={pbStyles.labelsArea}>
        {sortedCpDays.map(cpDay => {
          const cpPct = total > 0 ? (cpDay / total) * 100 : 0;
          const status = getCpStatus(cpDay, current, sortedCpDays);
          return (
            <View
              key={cpDay}
              style={[
                pbStyles.labelPos,
                { left: `${cpPct}%` as any, marginLeft: -(LABEL_WIDTH / 2) },
              ]}
            >
              <Text
                style={[
                  pbStyles.labelText,
                  status === 'done' && pbStyles.labelDone,
                  status === 'active' && pbStyles.labelActive,
                ]}
              >
                Day {cpDay}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Milestone row
// ---------------------------------------------------------------------------

function MilestoneRow({ day, coins, status }: { day: number; coins: number; status: CpStatus }) {
  const label = status === 'done' ? '已領取' : status === 'active' ? '進行中' : '未達成';
  return (
    <View style={styles.milestoneRow}>
      <Text style={styles.milestoneDayText}>Day {day}</Text>
      <Text style={styles.milestoneCoinText}>🌟 {coins} 枚</Text>
      <View
        style={[
          styles.cpBadge,
          status === 'done' && styles.cpBadgeDone,
          status === 'active' && styles.cpBadgeActive,
        ]}
      >
        <Text
          style={[
            styles.cpBadgeText,
            status === 'done' && styles.cpBadgeTextDone,
            status === 'active' && styles.cpBadgeTextActive,
          ]}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type LongTermDetailRoute = RouteProp<RootStackParamList, 'LongTermDetail'>;
type Nav = StackNavigationProp<RootStackParamList, 'LongTermDetail'>;

export default function LongTermDetailScreen() {
  const route = useRoute<LongTermDetailRoute>();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { goalId, taskId, taskName } = route.params;

  const [goal, setGoal] = useState<LongTermGoal | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const [goalRes, taskRes] = await Promise.all([
        supabase.from('long_term_goals').select('*').eq('id', goalId).single(),
        supabase.from('tasks').select('*').eq('id', taskId).single(),
      ]);

      if (goalRes.error || !goalRes.data) {
        setError('載入目標資料失敗，請稍後再試');
        setLoading(false);
        return;
      }
      if (taskRes.error || !taskRes.data) {
        setError('載入任務資料失敗，請稍後再試');
        setLoading(false);
        return;
      }

      setGoal(goalRes.data);
      setTask(taskRes.data);

      const today = dayjs().tz(TZ).format('YYYY-MM-DD');
      const tomorrow = dayjs().tz(TZ).add(1, 'day').format('YYYY-MM-DD');
      const { data: todayComp } = await supabase
        .from('task_completions')
        .select('id')
        .eq('task_id', taskId)
        .eq('child_id', goalRes.data.child_id)
        .gte('completed_at', today)
        .lt('completed_at', tomorrow)
        .limit(1)
        .maybeSingle();

      setIsCheckedIn(!!todayComp);
      setLoading(false);
    };
    void load();
  }, [goalId, taskId]);

  const handleCheckIn = useCallback(async () => {
    if (!goal || !task || isCheckedIn || checking) return;
    setChecking(true);
    try {
      const completedDate = dayjs().tz(TZ).format('YYYY-MM-DD');
      const result = await completeTask(taskId, goal.child_id, completedDate, true, task, goalId);
      setIsCheckedIn(true);
      setGoal(prev => (prev ? { ...prev, current_day: prev.current_day + 1 } : prev));
      if (result.milestone) {
        Alert.alert(
          '🎉 里程碑達成！',
          `你到達了第 ${result.milestone.day} 天！\n獲得 ${result.milestone.coinReward} 枚硬幣！`,
          [{ text: '太棒了！' }],
        );
      }
    } catch (err) {
      Alert.alert('打卡失敗', err instanceof Error ? err.message : '請稍後再試');
    } finally {
      setChecking(false);
    }
  }, [goal, task, isCheckedIn, checking, taskId, goalId]);

  const total = goal?.total_days ?? 30;
  const currentDay = goal?.current_day ?? 0;
  const remaining = Math.max(total - currentDay, 0);
  const sortedCpDays = goal?.checkpoint_rewards
    ? Object.keys(goal.checkpoint_rewards).map(Number).sort((a, b) => a - b)
    : [];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Nav bar */}
      <View style={[styles.navBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevLeftIcon size={22} />
          <Text style={styles.backLabel}>返回</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>
          長期目標
        </Text>
        <View style={styles.navSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.gold500} style={styles.loader} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : !goal ? null : goal.goal_type !== 'habit' ? (
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonTitle}>{taskName}</Text>
          <Text style={styles.comingSoonBody}>此類型長期目標詳情即將推出</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero card */}
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <Text style={styles.heroLabel}>🔥 連續打卡挑戰</Text>
              <View style={styles.streakBadge}>
                <Text style={styles.streakText}>第 {currentDay} 天</Text>
              </View>
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {taskName}
            </Text>
            <Text style={styles.heroSub}>
              共 {total} 天
              {remaining > 0 ? `  ·  還剩 ${remaining} 天` : '  ·  目標完成！'}
            </Text>
          </View>

          {/* Progress section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>進度</Text>
            <View style={styles.card}>
              <View style={styles.progressDayRow}>
                <Text style={styles.progressDayNum}>第 {currentDay} 天</Text>
                <Text style={styles.progressDayOf}>/ 共 {total} 天</Text>
              </View>
              <ProgressBarWithCheckpoints
                current={currentDay}
                total={total}
                checkpointRewards={goal.checkpoint_rewards}
              />
            </View>
          </View>

          {/* Check-in section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>今日打卡</Text>
            {isCheckedIn ? (
              <View style={styles.checkedCard}>
                <CheckIcon size={20} color={Colors.success} />
                <Text style={styles.checkedText}>今天已打卡</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.checkInBtn, checking && styles.checkInBtnBusy]}
                onPress={handleCheckIn}
                activeOpacity={0.8}
                disabled={checking}
              >
                {checking ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.checkInBtnText}>今天打卡</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Milestones section */}
          {sortedCpDays.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>里程碑獎勵</Text>
              <View style={styles.milestonesCard}>
                {sortedCpDays.map((cpDay, idx) => (
                  <React.Fragment key={cpDay}>
                    {idx > 0 && <View style={styles.rowDivider} />}
                    <MilestoneRow
                      day={cpDay}
                      coins={goal.checkpoint_rewards![String(cpDay)]}
                      status={getCpStatus(cpDay, currentDay, sortedCpDays)}
                    />
                  </React.Fragment>
                ))}
              </View>
            </View>
          )}

          {/* Interrupt note */}
          {(goal.interrupt_count ?? 0) > 0 && (
            <View style={styles.interruptNote}>
              <Text style={styles.interruptText}>
                曾中斷 {goal.interrupt_count} 次，繼續加油！
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgCanvas,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: Colors.bgCanvas,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSoft,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    minWidth: 64,
  },
  backLabel: {
    fontSize: 15,
    color: Colors.ink700,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: Colors.fgPrimary,
  },
  navSpacer: {
    minWidth: 64,
  },
  loader: {
    marginTop: 64,
  },
  errorText: {
    textAlign: 'center',
    marginTop: 64,
    fontSize: 15,
    color: Colors.error,
    paddingHorizontal: 24,
  },
  comingSoon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  comingSoonTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.fgPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  comingSoonBody: {
    fontSize: 15,
    color: Colors.fgMuted,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
    gap: 16,
  },
  // ── Hero ──────────────────────────────────────────────────────────────────
  heroCard: {
    backgroundColor: Colors.gold100,
    borderRadius: 24,
    padding: 20,
    shadowColor: Colors.shadowGold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 4,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.coral600,
    letterSpacing: 0.5,
  },
  streakBadge: {
    backgroundColor: Colors.bgSurface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.gold700,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.ink900,
    lineHeight: 32,
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink700,
  },
  // ── Sections ──────────────────────────────────────────────────────────────
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.fgMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 16,
  },
  progressDayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 14,
  },
  progressDayNum: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.ink900,
  },
  progressDayOf: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.fgMuted,
  },
  // ── Check-in ──────────────────────────────────────────────────────────────
  checkedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.sage100,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.sage200,
  },
  checkedText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.success,
  },
  checkInBtn: {
    backgroundColor: Colors.coral500,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: Colors.coral700,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 0,
    elevation: 4,
  },
  checkInBtnBusy: {
    opacity: 0.7,
  },
  checkInBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  // ── Milestones ────────────────────────────────────────────────────────────
  milestonesCard: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    overflow: 'hidden',
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.borderSoft,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  milestoneDayText: {
    width: 56,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.fgPrimary,
  },
  milestoneCoinText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.gold700,
  },
  cpBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.cream200,
  },
  cpBadgeDone: {
    backgroundColor: Colors.sage100,
  },
  cpBadgeActive: {
    backgroundColor: Colors.coral100,
  },
  cpBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.fgMuted,
  },
  cpBadgeTextDone: {
    color: Colors.success,
  },
  cpBadgeTextActive: {
    color: Colors.coral600,
  },
  // ── Interrupt note ────────────────────────────────────────────────────────
  interruptNote: {
    backgroundColor: Colors.gold100,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.gold300,
  },
  interruptText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.gold700,
    textAlign: 'center',
  },
});
