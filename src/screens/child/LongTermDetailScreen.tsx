import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from '../../lib/supabase';
import { completeTask } from '../../lib/taskActions';
import { Colors } from '../../constants/colors';
import { webMouseDraggableScroll } from '../../constants/webStyles';
import BottomNav from '../../components/BottomNav';
import { CheckIcon } from '../../components/icons/TaskIcons';
import type { RootStackParamList } from '../../../App';
import type { LongTermGoal, Task } from '../../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

type LongTermDetailRoute = RouteProp<RootStackParamList, 'LongTermDetail'>;
type Nav = StackNavigationProp<RootStackParamList, 'LongTermDetail'>;
type CpStatus = 'done' | 'active' | 'pending';
type MilestoneIcon = 'moon' | 'lantern' | 'tree';
type ChildTabId = 'home' | 'wallet' | 'wish' | 'profile';

type JourneyMilestone = {
  day: number;
  title: string;
  reward: string;
  icon: MilestoneIcon;
};

const DEFAULT_MILESTONES: JourneyMilestone[] = [
  { day: 10, title: '小月亮徽章', reward: '成長幣 +20', icon: 'moon' },
  { day: 20, title: '星光小燈', reward: '解鎖晚安小燈', icon: 'lantern' },
  { day: 30, title: '晚安守護樹', reward: '和家人一起選一個慶祝時刻', icon: 'tree' },
];

const PATH_MARKERS = [
  { maxDay: 3, left: '17%', top: 94 },
  { maxDay: 7, left: '29%', top: 82 },
  { maxDay: 10, left: '39%', top: 58 },
  { maxDay: 15, left: '55%', top: 74 },
  { maxDay: 20, left: '69%', top: 52 },
  { maxDay: 25, left: '82%', top: 66 },
  { maxDay: 30, left: '91%', top: 40 },
];

const WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日'];

function ChevLeftIcon({ size = 22, color = Colors.ink700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function MoreIcon({ size = 24, color = Colors.ink700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={6} cy={12} r={1.6} fill={color} />
      <Circle cx={12} cy={12} r={1.6} fill={color} />
      <Circle cx={18} cy={12} r={1.6} fill={color} />
    </Svg>
  );
}

function getCpStatus(day: number, currentDay: number, days: number[]): CpStatus {
  if (currentDay >= day) return 'done';
  const firstUnreached = days.find(item => currentDay < item);
  return firstUnreached === day ? 'active' : 'pending';
}

function getProgressPosition(day: number) {
  return PATH_MARKERS.find(item => day <= item.maxDay) ?? PATH_MARKERS[PATH_MARKERS.length - 1];
}

function getMilestoneEmoji(icon: MilestoneIcon) {
  if (icon === 'lantern') return '🏮';
  if (icon === 'tree') return '🌳';
  return '🌙';
}

function buildMilestones(goal: LongTermGoal): JourneyMilestone[] {
  const rewards = goal.checkpoint_rewards;
  if (rewards == null || Object.keys(rewards).length === 0) return DEFAULT_MILESTONES;

  return Object.keys(rewards)
    .map(Number)
    .sort((a, b) => a - b)
    .map((day, index) => {
      const fallback = DEFAULT_MILESTONES[index] ?? DEFAULT_MILESTONES[DEFAULT_MILESTONES.length - 1];
      const coin = rewards[String(day)] ?? 0;
      return {
        day,
        title: fallback.title,
        reward: coin > 0 ? `成長幣 +${coin}` : fallback.reward,
        icon: fallback.icon,
      };
    });
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionIcon}>{icon}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function NightHero({
  taskName,
  currentDay,
  completedCount,
}: {
  taskName: string;
  currentDay: number;
  completedCount: number;
}) {
  return (
    <View style={styles.hero}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 360 178" preserveAspectRatio="none">
        <Path d="M0 0H360V178H0z" fill="#14284A" />
        <Path d="M0 110C70 78 128 88 188 116C250 146 298 116 360 92V178H0z" fill="#233D63" opacity={0.9} />
        <Path d="M0 140C80 118 124 126 180 146C244 169 306 138 360 124V178H0z" fill="#203C33" />
        <Circle cx={48} cy={46} r={23} fill="#F7D978" opacity={0.24} />
        <Path d="M58 27C45 33 39 47 44 60C50 73 64 80 77 75C66 72 58 62 58 50C58 40 63 32 72 27C67 25 62 25 58 27z" fill="#FFE48A" />
        {[94, 150, 214, 286, 318].map((cx, index) => (
          <Circle key={cx} cx={cx} cy={26 + (index % 3) * 26} r={2.4} fill="#FFE48A" opacity={0.9} />
        ))}
        {[216, 248, 304].map((cx, index) => (
          <Circle key={cx} cx={cx} cy={128 + index * 10} r={4} fill="#F7D978" opacity={0.75} />
        ))}
      </Svg>
      <View style={styles.heroCopy}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>🌙 習慣養成</Text>
        </View>
        <Text style={styles.heroTitle}>{taskName}</Text>
        <Text style={styles.heroDescription}>讓身體每天都有足夠的休息時間</Text>
        <Text style={styles.heroMeta}>第 {currentDay} 天 · 已完成 {completedCount} 次</Text>
        <View style={styles.streakPill}>
          <Text style={styles.streakPillText}>🔥 連續 3 天</Text>
        </View>
      </View>
      <View style={styles.treeHouse}>
        <Text style={styles.treeCrown}>✦ ✦</Text>
        <Text style={styles.treeHouseIcon}>🏡</Text>
      </View>
    </View>
  );
}

function TodayHabitCard({
  checked,
  checking,
  onCheckIn,
}: {
  checked: boolean;
  checking: boolean;
  onCheckIn: () => void;
}) {
  return (
    <View style={styles.todayCard}>
      <View style={styles.todayHeader}>
        <View style={styles.todayMoon}>
          <Text style={styles.todayMoonText}>🌙</Text>
        </View>
        <View style={styles.todayCopy}>
          <Text style={styles.todayTitle}>{checked ? '今晚的努力已記下' : '今晚打卡'}</Text>
          <Text style={styles.todayQuestion}>今晚有在 10 點前準備睡覺嗎？</Text>
        </View>
        <Text style={styles.sleepMascot}>☁️</Text>
      </View>

      {checked ? (
        <View style={styles.donePanel}>
          <CheckIcon size={18} color={Colors.success} />
          <Text style={styles.donePanelText}>你正在讓身體學會好好休息。</Text>
        </View>
      ) : (
        <View style={styles.todayActions}>
          <TouchableOpacity
            style={[styles.primaryChoice, checking && styles.disabledChoice]}
            onPress={onCheckIn}
            activeOpacity={0.82}
            disabled={checking}
          >
            {checking ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryChoiceText}>🌙 有，我做到了</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryChoice} activeOpacity={0.75}>
            <Text style={styles.secondaryChoiceText}>🫧 差一點，明天再試試</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.reflectionWrap}>
        <Text style={styles.reflectionLabel}>今天的準備情況如何？</Text>
        <View style={styles.reflectionChips}>
          {['🌱 今天很容易', '☁️ 有點困難', '👨‍👩‍👧 需要家人幫忙'].map(item => (
            <View key={item} style={styles.reflectionChip}>
              <Text style={styles.reflectionText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function GrowthPathCard({
  currentDay,
  total,
  milestones,
}: {
  currentDay: number;
  total: number;
  milestones: JourneyMilestone[];
}) {
  const marker = getProgressPosition(currentDay);
  const next = milestones.find(item => currentDay < item.day);
  const daysToNext = next ? Math.max(next.day - currentDay, 0) : 0;

  return (
    <View style={styles.card}>
      <SectionTitle icon="🌱" title="成長小徑" />
      <View style={styles.pathArea}>
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 340 150" preserveAspectRatio="none">
          <Path
            d="M18 112C70 112 82 84 122 92S178 128 214 78S278 98 326 42"
            stroke="#E9D7B4"
            strokeWidth={8}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M18 112C70 112 82 84 122 92"
            stroke="#B4D661"
            strokeWidth={8}
            fill="none"
            strokeLinecap="round"
          />
          {[42, 72, 102, 132, 188, 246, 296].map((cx, index) => (
            <Circle
              key={cx}
              cx={cx}
              cy={[109, 101, 94, 91, 112, 78, 70][index]}
              r={6}
              fill={index < 4 ? '#FFFFFF' : '#D8D0C2'}
              stroke={index < 4 ? '#A9CB4A' : '#C8BFAA'}
              strokeWidth={3}
            />
          ))}
        </Svg>
        <Text style={styles.startFlag}>🚩</Text>
        <View style={[styles.currentMarker, { left: marker.left as any, top: marker.top }]}>
          <View style={styles.currentAvatar}>
            <Text style={styles.currentAvatarText}>🌱</Text>
          </View>
          <Text style={styles.currentDayText}>第 {currentDay} 天</Text>
        </View>
        {milestones.slice(0, 3).map((milestone, index) => {
          const positions: Array<{ left: `${number}%`; top: number }> = [
            { left: '48%', top: 20 },
            { left: '69%', top: 48 },
            { left: '89%', top: 16 },
          ];
          const status = currentDay >= milestone.day ? 'done' : milestone.day - currentDay <= 3 ? 'active' : 'pending';
          return (
            <View key={milestone.day} style={[styles.pathMilestone, positions[index]]}>
              <View style={[styles.pathMilestoneIcon, status === 'active' && styles.pathMilestoneNear]}>
                <Text style={styles.pathMilestoneEmoji}>{getMilestoneEmoji(milestone.icon)}</Text>
              </View>
              <Text style={styles.pathMilestoneDay}>第 {milestone.day} 天</Text>
              <Text style={styles.pathMilestoneLabel}>{milestone.title}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.helperLine}>
        <Text style={styles.helperText}>
          {next ? `🌱 再 ${daysToNext} 天，就能解鎖第一個里程碑。` : `🌳 ${total} 天的旅程已完成。`}
        </Text>
      </View>
    </View>
  );
}

function WeeklyFootprint() {
  return (
    <View style={styles.card}>
      <SectionTitle icon="🍃" title="這週的足跡" />
      <View style={styles.weekRow}>
        {WEEK_DAYS.map((day, index) => {
          const done = index < 4;
          return (
            <View key={day} style={styles.weekCell}>
              <Text style={styles.weekDay}>{day}</Text>
              <View style={[styles.weekBubble, done && styles.weekBubbleDone]}>
                <Text style={styles.weekIcon}>{done ? '🌿' : '🌙'}</Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.weekInsight}>
        <Text style={styles.weekInsightText}>🌿 這週已完成 4 次，比上週多 1 次。週三最容易忘記，試試先把睡衣放在床邊。</Text>
      </View>
    </View>
  );
}

function MilestoneJourney({
  milestones,
  currentDay,
}: {
  milestones: JourneyMilestone[];
  currentDay: number;
}) {
  const days = milestones.map(item => item.day);
  return (
    <View style={styles.card}>
      <SectionTitle icon="⭐" title="旅程里程碑" />
      <View style={styles.milestoneList}>
        {milestones.map(milestone => {
          const status = getCpStatus(milestone.day, currentDay, days);
          const label = status === 'done' ? '已到達' : status === 'active' ? '快到了' : '未解鎖';
          return (
            <View key={milestone.day} style={[styles.milestoneItem, status === 'active' && styles.milestoneItemActive]}>
              <View style={styles.milestoneBadge}>
                <Text style={styles.milestoneEmoji}>{getMilestoneEmoji(milestone.icon)}</Text>
              </View>
              <View style={styles.milestoneCopy}>
                <Text style={styles.milestoneTitle}>第 {milestone.day} 天</Text>
                <Text style={styles.milestoneReward}>{milestone.reward}</Text>
              </View>
              <View style={[styles.statusBadge, status === 'active' && styles.statusBadgeActive]}>
                <Text style={[styles.statusBadgeText, status === 'active' && styles.statusBadgeTextActive]}>{label}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function AdjustGoalEntry() {
  return (
    <TouchableOpacity style={styles.adjustEntry} activeOpacity={0.75}>
      <Text style={styles.adjustCloud}>☁️</Text>
      <View style={styles.adjustCopy}>
        <Text style={styles.adjustTitle}>需要調整這個目標？</Text>
        <Text style={styles.adjustSub}>可以和家長一起討論</Text>
      </View>
      <Text style={styles.adjustArrow}>›</Text>
    </TouchableOpacity>
  );
}

function HabitGoalView({
  goal,
  task,
  taskName,
  isCheckedIn,
  checking,
  onCheckIn,
}: {
  goal: LongTermGoal;
  task: Task;
  taskName: string;
  isCheckedIn: boolean;
  checking: boolean;
  onCheckIn: () => void;
}) {
  const total = goal.total_days ?? 30;
  const currentDay = Math.min(Math.max(goal.current_day ?? 0, 0), total);
  const completedCount = Math.max(currentDay - 1 + (isCheckedIn ? 1 : 0), 0);
  const milestones = useMemo(() => buildMilestones(goal), [goal]);

  return (
    <ScrollView
      testID="long-term-detail-scroll"
      style={[styles.scroll, webMouseDraggableScroll]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <NightHero taskName={taskName} currentDay={currentDay} completedCount={completedCount} />
      <TodayHabitCard checked={isCheckedIn} checking={checking} onCheckIn={onCheckIn} />
      <GrowthPathCard currentDay={currentDay} total={total} milestones={milestones} />
      <WeeklyFootprint />
      <MilestoneJourney milestones={milestones} currentDay={currentDay} />
      {(goal.interrupt_count ?? 0) > 0 && (
        <View style={styles.softNote}>
          <Text style={styles.softNoteText}>這段旅程曾暫停 {goal.interrupt_count} 次，重新開始也算是成長的一部分。</Text>
        </View>
      )}
      <AdjustGoalEntry />
      <Text style={styles.hiddenDataHint}>{task.id}</Text>
    </ScrollView>
  );
}

function SkillGoalView({ goal, task, taskName }: { goal: LongTermGoal; task: Task | null; taskName: string }) {
  const levels = goal.level_definitions ?? [];
  const totalLevels = Math.max(goal.level_count ?? levels.length, 1);
  const currentLevel = Math.min(goal.current_level ?? 0, totalLevels);
  const progressPct = Math.min((currentLevel / totalLevels) * 100, 100);
  const currentStage = String(levels[currentLevel]?.name ?? levels[Math.max(currentLevel - 1, 0)]?.name ?? '下一個小練習');
  const practiceMinutes = Math.max(task?.base_time_min ?? 15, 15);

  return (
    <ScrollView
      testID="long-term-detail-scroll"
      style={[styles.scroll, webMouseDraggableScroll]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={skillStyles.hero}>
        <View style={skillStyles.heroIcon}>
          <Text style={skillStyles.heroIconText}>🎹</Text>
        </View>
        <View style={skillStyles.heroCopy}>
          <Text style={skillStyles.heroLabel}>鋼琴練習之路</Text>
          <Text style={skillStyles.heroTitle}>{taskName}</Text>
          <Text style={skillStyles.heroMeta}>第 {currentLevel} / {totalLevels} 階段</Text>
          <Text style={skillStyles.heroSub}>本階段任務：{currentStage}</Text>
        </View>
      </View>

      <View style={skillStyles.stageCard}>
        <View style={skillStyles.stageHeader}>
          <Text style={skillStyles.stageTitle}>今天練習 {practiceMinutes} 分鐘</Text>
          <Text style={skillStyles.stageMeta}>慢慢把手感留在今天</Text>
        </View>
        <View style={skillStyles.skillActions}>
          {['完成練習', '錄一段給自己聽', '今天卡在這裡'].map(label => (
            <TouchableOpacity key={label} style={skillStyles.skillAction} activeOpacity={0.76}>
              <Text style={skillStyles.skillActionText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <SectionTitle icon="🌱" title="成長階段" />
        <View style={skillStyles.track}>
          <View style={[skillStyles.trackFill, { width: `${progressPct}%` as any }]} />
        </View>
        <View style={skillStyles.levelList}>
          {levels.length > 0 ? levels.map((level, index) => {
            const isDone = index < currentLevel;
            const isCurrent = index === currentLevel;
            return (
              <View key={String(level.id ?? index)} style={skillStyles.levelRow}>
                <View style={[skillStyles.levelDot, isDone && skillStyles.levelDotDone, isCurrent && skillStyles.levelDotCurrent]}>
                  <Text style={[skillStyles.levelDotText, isDone && skillStyles.levelDotTextDone]}>
                    {isDone ? '✓' : index + 1}
                  </Text>
                </View>
                <View style={skillStyles.levelCopy}>
                  <Text style={skillStyles.levelName}>{String(level.name ?? `第 ${index + 1} 階段`)}</Text>
                  <Text style={skillStyles.levelReward}>完成後留下作品，也獲得成長幣 {Number(level.coin ?? 0)}</Text>
                </View>
              </View>
            );
          }) : (
            <Text style={skillStyles.emptyText}>這個技能還沒有設定階段。</Text>
          )}
        </View>
      </View>
      <AdjustGoalEntry />
    </ScrollView>
  );
}

function FamilyRoleView({
  goal,
  task,
  taskName,
  isCheckedIn,
  checking,
  onCheckIn,
}: {
  goal: LongTermGoal;
  task: Task;
  taskName: string;
  isCheckedIn: boolean;
  checking: boolean;
  onCheckIn: () => void;
}) {
  const target = goal.target_completions ?? 1;
  const current = Math.min(goal.current_day ?? 0, target);
  const pct = Math.round((current / target) * 100);

  return (
    <ScrollView
      testID="long-term-detail-scroll"
      style={[styles.scroll, webMouseDraggableScroll]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <SectionTitle icon="🏠" title="家庭任務" />
        <Text style={styles.familyTitle}>{taskName}</Text>
        <Text style={styles.familyMeta}>已完成 {current} / {target} 次 · {pct}%</Text>
        <View style={skillStyles.track}>
          <View style={[skillStyles.trackFill, { width: `${pct}%` as any }]} />
        </View>
        <Text style={styles.familySub}>每一次幫忙，都會讓家裡的節奏更穩一點。</Text>
      </View>
      <TodayHabitCard checked={isCheckedIn} checking={checking} onCheckIn={onCheckIn} />
      <Text style={styles.hiddenDataHint}>{task.id}</Text>
    </ScrollView>
  );
}

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
        setError('讀取長期目標失敗，請稍後再試。');
        setLoading(false);
        return;
      }

      if (taskRes.error || !taskRes.data) {
        setError('讀取任務資料失敗，請稍後再試。');
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
        Alert.alert('到達新的里程碑', `第 ${result.milestone.day} 天的努力被記下了。`);
      }
    } catch (err) {
      Alert.alert('打卡失敗', err instanceof Error ? err.message : '請稍後再試。');
    } finally {
      setChecking(false);
    }
  }, [checking, goal, goalId, isCheckedIn, task, taskId]);

  const handleTabPress = useCallback((tab: ChildTabId) => {
    const childId = goal?.child_id;
    if (!childId) return;

    if (tab === 'home') {
      navigation.navigate('Home', { childId });
    } else if (tab === 'wallet') {
      navigation.navigate('Wallet', { childId });
    } else if (tab === 'wish') {
      navigation.navigate('Wish', { childId });
    } else {
      navigation.navigate('Profile', { childId });
    }
  }, [goal?.child_id, navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.72}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevLeftIcon />
          <Text style={styles.backText}>返回</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>長期目標</Text>
        <TouchableOpacity style={styles.moreButton} activeOpacity={0.72}>
          <MoreIcon />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.gold500} style={styles.loader} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : goal?.goal_type === 'skill' ? (
        <SkillGoalView goal={goal} task={task} taskName={taskName} />
      ) : goal?.goal_type === 'family' && task ? (
        <FamilyRoleView
          goal={goal}
          task={task}
          taskName={taskName}
          isCheckedIn={isCheckedIn}
          checking={checking}
          onCheckIn={handleCheckIn}
        />
      ) : goal && task ? (
        <HabitGoalView
          goal={goal}
          task={task}
          taskName={taskName}
          isCheckedIn={isCheckedIn}
          checking={checking}
          onCheckIn={handleCheckIn}
        />
      ) : null}
      <BottomNav activeTab="wallet" onTabPress={handleTabPress} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgCanvas,
  },
  navBar: {
    minHeight: 74,
    paddingHorizontal: 24,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCanvas,
  },
  backButton: {
    minWidth: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.ink900,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    color: Colors.ink900,
  },
  moreButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(95, 60, 30, 0.06)',
  },
  loader: {
    marginTop: 80,
  },
  errorText: {
    marginTop: 80,
    paddingHorizontal: 28,
    color: Colors.error,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 112,
    gap: 14,
  },
  hero: {
    minHeight: 190,
    borderRadius: 26,
    overflow: 'hidden',
    padding: 22,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 232, 160, 0.18)',
  },
  heroCopy: {
    width: '68%',
    gap: 8,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  typeBadgeText: {
    color: '#FFF4C8',
    fontSize: 13,
    fontWeight: '800',
  },
  heroTitle: {
    color: '#FFFDF8',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
  },
  heroDescription: {
    color: '#E4EAF2',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  heroMeta: {
    color: '#F7D978',
    fontSize: 17,
    fontWeight: '900',
  },
  streakPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(23, 48, 43, 0.72)',
  },
  streakPillText: {
    color: '#FFE28A',
    fontSize: 14,
    fontWeight: '900',
  },
  treeHouse: {
    position: 'absolute',
    right: 12,
    bottom: 22,
    alignItems: 'center',
  },
  treeCrown: {
    color: '#FFE28A',
    fontSize: 18,
  },
  treeHouseIcon: {
    fontSize: 70,
  },
  todayCard: {
    marginHorizontal: 16,
    marginTop: -20,
    backgroundColor: 'rgba(255, 253, 248, 0.98)',
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 4,
    gap: 14,
  },
  todayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  todayMoon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gold100,
  },
  todayMoonText: {
    fontSize: 26,
  },
  todayCopy: {
    flex: 1,
    minWidth: 0,
  },
  todayTitle: {
    color: Colors.ink900,
    fontSize: 23,
    fontWeight: '900',
  },
  todayQuestion: {
    marginTop: 4,
    color: Colors.ink700,
    fontSize: 15,
    fontWeight: '700',
  },
  sleepMascot: {
    fontSize: 42,
  },
  todayActions: {
    flexDirection: 'column',
    gap: 12,
  },
  primaryChoice: {
    flex: 1,
    minHeight: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#47733C',
  },
  disabledChoice: {
    opacity: 0.72,
  },
  primaryChoiceText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  secondaryChoice: {
    flex: 1,
    minHeight: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cream50,
    borderWidth: 1,
    borderColor: Colors.cream300,
  },
  secondaryChoiceText: {
    color: Colors.ink700,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  reflectionWrap: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
    paddingTop: 12,
    gap: 10,
  },
  reflectionLabel: {
    color: Colors.ink700,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  reflectionChips: {
    flexDirection: 'column',
    gap: 8,
  },
  reflectionChip: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: Colors.cream50,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    paddingHorizontal: 8,
  },
  reflectionText: {
    color: Colors.ink700,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  donePanel: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: Colors.sage100,
    borderWidth: 1,
    borderColor: Colors.sage200,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  donePanelText: {
    color: Colors.success,
    fontSize: 16,
    fontWeight: '800',
  },
  card: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIcon: {
    fontSize: 21,
  },
  sectionTitle: {
    color: Colors.ink900,
    fontSize: 22,
    fontWeight: '900',
  },
  pathArea: {
    height: 184,
    marginTop: 12,
    position: 'relative',
  },
  startFlag: {
    position: 'absolute',
    left: 12,
    top: 98,
    fontSize: 28,
  },
  currentMarker: {
    position: 'absolute',
    width: 72,
    marginLeft: -36,
    alignItems: 'center',
  },
  currentAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8DD',
    borderWidth: 3,
    borderColor: '#5D8C4A',
  },
  currentAvatarText: {
    fontSize: 28,
  },
  currentDayText: {
    marginTop: 5,
    color: Colors.ink700,
    fontSize: 13,
    fontWeight: '800',
  },
  pathMilestone: {
    position: 'absolute',
    width: 82,
    marginLeft: -41,
    alignItems: 'center',
  },
  pathMilestoneIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cream50,
    borderWidth: 2,
    borderColor: Colors.cream300,
  },
  pathMilestoneNear: {
    backgroundColor: '#FFF7C8',
    borderColor: Colors.gold300,
  },
  pathMilestoneEmoji: {
    fontSize: 29,
  },
  pathMilestoneDay: {
    marginTop: 5,
    color: Colors.ink700,
    fontSize: 13,
    fontWeight: '800',
  },
  pathMilestoneLabel: {
    color: Colors.ink500,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  helperLine: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
    paddingTop: 13,
  },
  helperText: {
    color: Colors.ink700,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  weekRow: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekCell: {
    alignItems: 'center',
    gap: 8,
  },
  weekDay: {
    color: Colors.ink900,
    fontSize: 15,
    fontWeight: '900',
  },
  weekBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cream50,
    borderWidth: 1.5,
    borderColor: Colors.cream300,
  },
  weekBubbleDone: {
    backgroundColor: Colors.leaf50,
    borderColor: Colors.leaf300,
  },
  weekIcon: {
    fontSize: 22,
  },
  weekInsight: {
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#F6F7EA',
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },
  weekInsightText: {
    color: Colors.ink700,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  milestoneList: {
    marginTop: 14,
    gap: 8,
  },
  milestoneItem: {
    minHeight: 76,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    backgroundColor: Colors.cream50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 12,
  },
  milestoneItemActive: {
    backgroundColor: '#FFF8DA',
    borderColor: Colors.gold300,
  },
  milestoneBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  milestoneEmoji: {
    fontSize: 30,
  },
  milestoneCopy: {
    flex: 1,
    minWidth: 0,
  },
  milestoneTitle: {
    color: Colors.ink900,
    fontSize: 17,
    fontWeight: '900',
  },
  milestoneReward: {
    marginTop: 3,
    color: Colors.ink700,
    fontSize: 14,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.cream200,
  },
  statusBadgeActive: {
    backgroundColor: Colors.gold500,
  },
  statusBadgeText: {
    color: Colors.ink500,
    fontSize: 12,
    fontWeight: '800',
  },
  statusBadgeTextActive: {
    color: '#FFFFFF',
  },
  chevron: {
    color: Colors.ink300,
    fontSize: 34,
    lineHeight: 34,
  },
  adjustEntry: {
    minHeight: 78,
    borderRadius: 22,
    backgroundColor: '#EAF4FF',
    borderWidth: 1,
    borderColor: '#C9DDF3',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  adjustCloud: {
    fontSize: 44,
  },
  adjustCopy: {
    flex: 1,
  },
  adjustTitle: {
    color: '#315C8D',
    fontSize: 18,
    fontWeight: '900',
  },
  adjustSub: {
    color: '#315C8D',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  adjustArrow: {
    color: '#6B8CB2',
    fontSize: 38,
    lineHeight: 38,
  },
  softNote: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: Colors.gold100,
    borderWidth: 1,
    borderColor: Colors.gold300,
  },
  softNoteText: {
    color: Colors.gold700,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  hiddenDataHint: {
    height: 0,
    opacity: 0,
  },
  familyTitle: {
    marginTop: 14,
    color: Colors.ink900,
    fontSize: 24,
    fontWeight: '900',
  },
  familyMeta: {
    marginTop: 8,
    color: Colors.ink700,
    fontSize: 16,
    fontWeight: '800',
  },
  familySub: {
    marginTop: 12,
    color: Colors.ink500,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
});

const skillStyles = StyleSheet.create({
  hero: {
    borderRadius: 26,
    padding: 20,
    backgroundColor: '#F5F0FF',
    borderWidth: 1,
    borderColor: '#DCD0F3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  heroIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  heroIconText: {
    fontSize: 38,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroLabel: {
    color: '#6D5799',
    fontSize: 15,
    fontWeight: '900',
  },
  heroTitle: {
    marginTop: 5,
    color: Colors.ink900,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '900',
  },
  heroMeta: {
    marginTop: 6,
    color: '#6D5799',
    fontSize: 18,
    fontWeight: '900',
  },
  heroSub: {
    marginTop: 4,
    color: Colors.ink700,
    fontSize: 15,
    fontWeight: '800',
  },
  stageCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },
  stageHeader: {
    gap: 4,
  },
  stageTitle: {
    color: Colors.ink900,
    fontSize: 21,
    fontWeight: '900',
  },
  stageMeta: {
    color: Colors.ink500,
    fontSize: 14,
    fontWeight: '700',
  },
  skillActions: {
    marginTop: 14,
    gap: 8,
  },
  skillAction: {
    minHeight: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F4FE',
    borderWidth: 1,
    borderColor: '#E2D7F4',
  },
  skillActionText: {
    color: '#5D4A87',
    fontSize: 15,
    fontWeight: '900',
  },
  track: {
    marginTop: 16,
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: Colors.cream200,
  },
  trackFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.sage400,
  },
  levelList: {
    marginTop: 16,
    gap: 12,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  levelDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cream100,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },
  levelDotDone: {
    backgroundColor: Colors.sage400,
    borderColor: Colors.sage400,
  },
  levelDotCurrent: {
    backgroundColor: '#F5F0FF',
    borderColor: '#9B82C7',
  },
  levelDotText: {
    color: Colors.ink700,
    fontSize: 14,
    fontWeight: '900',
  },
  levelDotTextDone: {
    color: '#FFFFFF',
  },
  levelCopy: {
    flex: 1,
    minWidth: 0,
  },
  levelName: {
    color: Colors.ink900,
    fontSize: 17,
    fontWeight: '900',
  },
  levelReward: {
    marginTop: 3,
    color: Colors.ink500,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyText: {
    paddingVertical: 18,
    color: Colors.ink500,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
