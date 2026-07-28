import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import type { RootStackParamList } from '../../../../App';
import { useSelectedChild } from '../../../context/SelectedChildContext';
import { supabase } from '../../../lib/supabase';
import { useParentTaskList, type TaskListItem } from '../../../hooks/useParentTaskList';
import {
  useParentLongTermGoals,
  type LongTermGoalItem,
} from '../../../hooks/useParentLongTermGoals';
import { useParentRedemption } from '../../../hooks/useParentRedemption';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentShadows,
  ParentSpacing,
} from '../../../constants/parentTheme';
import { webTabletScreen } from '../../../constants/webStyles';
import type { TaskCategory } from '../../../types/database';
import {
  DISPLAY_GROUP_LABEL,
  DISPLAY_GROUP_SUBTITLE,
  displayGroupShowsCoins,
  type ParentTaskDisplayGroup,
} from '../../../lib/parentTaskDisplayGroup';
import { ParentSidebar, type ManageSection } from './ParentSidebar';
import { ManageTabBar } from './ManageTabBar';
import {
  PresetTaskDrawer,
  type PresetTaskDrawerChild,
} from './taskDrawer/PresetTaskDrawer';
import type { CreatedTaskTab } from './taskDrawer/taskPersistence';
import { SupabaseParentTaskCreationService } from '../../../lib/parentTaskCreationService';
import {
  BellIcon,
  CheckSquareIcon,
  ChevronRightIcon,
  ClockIcon,
  CoinIcon,
  Illustration,
  PlusIcon,
  TaskIconBubble,
} from './home/homeIcons';

type TaskManageTab = 'daily' | 'longTerm' | 'paused' | 'archive';

/**
 * 日常分區直接就是 ParentTaskDisplayGroup。
 *
 * 第七階段 C 把六個分區壓成三個（life / time / coins），代價是
 * 家庭參與與進度回饋都被叫成「生活紀錄」—— 那是三件不同的事。
 * 現在一對一，空的區塊本來就不渲染，所以頁面不會因此變碎：
 * 一個家庭實際上只會同時有兩三種。
 */
type DailyGroupKey = ParentTaskDisplayGroup;

const TABS: Array<{ id: TaskManageTab; label: string }> = [
  { id: 'daily', label: '日常任務' },
  { id: 'longTerm', label: '長期挑戰' },
  { id: 'paused', label: '暫停中' },
  { id: 'archive', label: '封存紀錄' },
];

/** 標題與副標只有一份來源（parentTaskDisplayGroup），這裡只補顏色。 */
const DAILY_GROUP_TINT: Record<DailyGroupKey, { tint: string; color: string }> = {
  family_contribution: { tint: ParentColors.tintPine, color: ParentColors.pine400 },
  progress:            { tint: ParentColors.tintLeaf, color: ParentColors.leaf700 },
  coin_reward:         { tint: ParentColors.tintAmber, color: ParentColors.amber700 },
  record_only:         { tint: ParentColors.tintLeaf, color: ParentColors.leaf700 },
  legacy_time_saving:  { tint: ParentColors.tintPine, color: ParentColors.pine400 },
  legacy_life_record:  { tint: ParentColors.tintLeaf, color: ParentColors.leaf700 },
};

/** 區塊的顯示順序。可發幣的放最後 —— 它不是任務清單的主角。 */
const DAILY_GROUP_ORDER: DailyGroupKey[] = [
  'legacy_life_record', 'record_only', 'family_contribution',
  'progress', 'legacy_time_saving', 'coin_reward',
];

const CAT_DOT: Record<TaskCategory, string> = {
  A: ParentColors.leaf500,
  B: ParentColors.pine300,
  C: ParentColors.amber500,
  D: ParentColors.amber500,
};

function dailyGroupForTask(task: TaskListItem): DailyGroupKey {
  return task.displayGroup;
}

function formatDate(value?: string | null) {
  if (!value) return '最近';
  return dayjs(value).format('M/DD');
}

/**
 * 每一列右邊那句話。
 *
 * 只有可發幣的任務講得出數字；其餘一律用該分區的說法。
 * 「不兌換成長幣」對家庭參與是錯的重點 —— 那項任務的意義不是「沒有幣」。
 */
function formatReward(task: TaskListItem) {
  if (task.reward?.kind === 'coins' && displayGroupShowsCoins(task.displayGroup)) {
    return `完成後記錄 ${task.reward.amount} 枚成長幣`;
  }
  if (task.reward?.kind === 'time') return `完成後累積 ${task.reward.amount} 分鐘`;
  return DISPLAY_GROUP_SUBTITLE[task.displayGroup];
}

function formatWeeklyChange(goal: LongTermGoalItem) {
  if (goal.weeklyCompleted <= 0) return '本週尚未開始';
  const delta = goal.weeklyCompleted - goal.previousWeeklyCompleted;
  const compare = delta > 0
    ? `比上週多 ${delta} 天`
    : delta === 0
      ? '與上週差不多'
      : '本週節奏有調整';
  return `本週完成 ${goal.weeklyCompleted} 天｜${compare}`;
}

/**
 * 「下一個里程碑」。
 *
 * 只有算得出百分比的任務才講得出下一步 —— 期間型的家庭角色與生活小計畫
 * 沒有里程碑，它們的下一件事是「一起回顧」，而那句話已經在 progressLabel 裡。
 * 回 null 時整塊不渲染，不要編一個「第 10 天」出來。
 */
function nextMilestone(goal: LongTermGoalItem): string | null {
  if (goal.progressPct === null) return null;
  if (goal.progressPct < 50) return '第 10 天';
  if (goal.progressPct < 80) return '下一個階段';
  return '接近完成';
}

function SectionCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={s.taskSectionCard}>
      <View style={s.sectionHead}>
        {icon}
        <View style={s.sectionTitleCol}>
          <Text style={s.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function TaskStatusChip({ label = '啟用中' }: { label?: string }) {
  return (
    <View style={s.statusChip}>
      <Text style={s.statusChipText}>{label}</Text>
    </View>
  );
}

function TaskRow({
  task,
  onEdit,
}: {
  task: TaskListItem;
  onEdit: (task: TaskListItem) => void;
}) {
  return (
    <View style={s.taskRow}>
      <View style={[s.taskDot, { backgroundColor: CAT_DOT[task.cat] }]} />
      <View style={s.rowMain}>
        <Text style={s.taskName}>{task.name}</Text>
        <Text style={s.taskMeta}>{task.freqLabel}｜{formatReward(task)}</Text>
      </View>
      <TaskStatusChip />
      <TouchableOpacity style={s.rowTextButton} onPress={() => onEdit(task)} activeOpacity={0.7}>
        <Text style={s.rowTextButtonLabel}>編輯</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.moreButton} activeOpacity={0.7}>
        <Text style={s.moreButtonText}>•••</Text>
      </TouchableOpacity>
    </View>
  );
}

function DailyGroup({
  groupKey,
  tasks,
  onEdit,
}: {
  groupKey: DailyGroupKey;
  tasks: TaskListItem[];
  onEdit: (task: TaskListItem) => void;
}) {
  if (tasks.length === 0) return null;
  const tint = DAILY_GROUP_TINT[groupKey];
  return (
    <SectionCard
      title={DISPLAY_GROUP_LABEL[groupKey]}
      subtitle={DISPLAY_GROUP_SUBTITLE[groupKey]}
      icon={
        <View style={[s.groupIcon, { backgroundColor: tint.tint }]}>
          {groupKey === 'coin_reward'
            ? <CoinIcon size={21} color={tint.color} />
            : groupKey === 'legacy_time_saving'
              ? <ClockIcon size={21} color={tint.color} />
              : <CheckSquareIcon size={21} color={tint.color} />}
        </View>
      }
    >
      <View style={s.innerList}>
        {tasks.map((task, index) => (
          <React.Fragment key={task.id}>
            <TaskRow task={task} onEdit={onEdit} />
            {index < tasks.length - 1 ? <View style={s.divider} /> : null}
          </React.Fragment>
        ))}
      </View>
    </SectionCard>
  );
}

function LongTermCard({
  goal,
  onEdit,
}: {
  goal: LongTermGoalItem;
  onEdit: (goal: LongTermGoalItem) => void;
}) {
  const weeklyText = formatWeeklyChange(goal);
  const quiet = goal.weeklyCompleted <= 0;
  return (
    <View style={s.longTermCard}>
      <TaskIconBubble name={goal.name} size={72} />
      <View style={s.longTermMain}>
        <View style={s.longTermTitleRow}>
          <Text style={s.longTermTitle}>{goal.name}</Text>
          <TaskStatusChip label="進行中" />
        </View>
        <Text style={s.longTermProgressLabel}>{goal.progressLabel}</Text>
        {/*
          算不出比例就不畫進度條。空的進度條看起來是「一點都沒做」，
          而家庭角色與生活小計畫本來就沒有可以填滿的分母。
        */}
        {goal.progressPct !== null ? (
          <View style={s.bigProgressTrack}>
            <View style={[s.bigProgressFill, { width: `${Math.min(100, goal.progressPct)}%` }]} />
          </View>
        ) : null}
        <Text style={[s.weeklyChangeText, quiet && s.adjustText]}>
          {weeklyText}{quiet ? '　查看調整建議 ›' : ''}
        </Text>
      </View>
      {nextMilestone(goal) ? (
        <View style={s.longTermSide}>
          <Text style={s.milestoneLabel}>下一個里程碑：</Text>
          <Text style={s.milestoneValue}>{nextMilestone(goal)}</Text>
        </View>
      ) : null}
      <View style={s.longTermActions}>
        <TouchableOpacity style={s.secondaryButton} onPress={() => onEdit(goal)} activeOpacity={0.7}>
          <Text style={s.secondaryButtonText}>編輯挑戰</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.moreLargeButton} activeOpacity={0.7}>
          <Text style={s.moreButtonText}>•••</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PausedTaskCard({
  task,
  onResume,
  onEdit,
}: {
  task: TaskListItem;
  onResume: (task: TaskListItem) => void;
  onEdit: (task: TaskListItem) => void;
}) {
  return (
    <View style={s.pausedCard}>
      <TaskIconBubble name={task.name} size={58} />
      <View style={s.pausedMain}>
        <View style={s.pausedTypeRow}>
          <Text style={s.typeBadge}>{task.isLongTerm ? '長期挑戰' : '日常任務'}</Text>
          <Text style={s.pausedTypeText}>{DISPLAY_GROUP_LABEL[dailyGroupForTask(task)]}</Text>
        </View>
        <Text style={s.pausedTitle}>{task.name}</Text>
        <Text style={s.pausedMeta}>原本：{task.freqLabel}｜{formatReward(task)}</Text>
        <View style={s.pausedInfoRow}>
          <Text style={s.pausedInfo}>暫停日期　{formatDate(task.childTaskCreatedAt)}</Text>
          <Text style={s.pausedInfo}>暫停原因　最近較少在清單中使用</Text>
        </View>
      </View>
      <View style={s.pausedActions}>
        <TouchableOpacity style={s.resumeButton} onPress={() => onResume(task)} activeOpacity={0.7}>
          <Text style={s.resumeButtonText}>重新啟用</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.secondaryButton} onPress={() => onEdit(task)} activeOpacity={0.7}>
          <Text style={s.secondaryButtonText}>編輯</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.moreLargeButton} activeOpacity={0.7}>
          <Text style={s.moreButtonText}>•••</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PausedGoalCard({
  goal,
  onResume,
  onEdit,
}: {
  goal: LongTermGoalItem;
  onResume: (goal: LongTermGoalItem) => void;
  onEdit: (goal: LongTermGoalItem) => void;
}) {
  return (
    <View style={s.pausedCard}>
      <TaskIconBubble name={goal.name} size={58} />
      <View style={s.pausedMain}>
        <View style={s.pausedTypeRow}>
          <Text style={[s.typeBadge, s.typeBadgeOrange]}>長期挑戰</Text>
          <Text style={s.pausedTypeText}>成長幣任務</Text>
        </View>
        <Text style={s.pausedTitle}>{goal.name}</Text>
        <Text style={s.pausedMeta}>原本：{goal.progressLabel}</Text>
        <View style={s.pausedInfoRow}>
          <Text style={s.pausedInfo}>暫停日期　最近</Text>
          <Text style={s.pausedInfo}>暫停原因　暫時改由日常安排取代</Text>
        </View>
      </View>
      <View style={s.pausedActions}>
        <TouchableOpacity style={s.resumeButton} onPress={() => onResume(goal)} activeOpacity={0.7}>
          <Text style={s.resumeButtonText}>重新啟用</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.secondaryButton} onPress={() => onEdit(goal)} activeOpacity={0.7}>
          <Text style={s.secondaryButtonText}>編輯</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.moreLargeButton} activeOpacity={0.7}>
          <Text style={s.moreButtonText}>•••</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function RailCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={s.railCard}>
      <View style={s.railHead}>
        <View style={s.railIcon}>{icon}</View>
        <Text style={s.railTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function RailText({ children }: { children: React.ReactNode }) {
  return <Text style={s.railText}>{children}</Text>;
}

function RecentAdjustmentList({ rows }: { rows: Array<{ id: string; date: string; label: string; color: string }> }) {
  return (
    <View style={s.adjustList}>
      {rows.length === 0 ? (
        <Text style={s.railMuted}>最近沒有新的任務調整</Text>
      ) : rows.slice(0, 3).map(row => (
        <View key={row.id} style={s.adjustRow}>
          <View style={[s.adjustDot, { backgroundColor: row.color }]} />
          <Text style={s.adjustDate}>{row.date}</Text>
          <Text style={s.adjustLabel} numberOfLines={1}>{row.label}</Text>
        </View>
      ))}
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={s.emptyState}>
      <Text style={s.emptyStateText}>{text}</Text>
    </View>
  );
}

export default function ParentTaskManagementTablet() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { childId, childName, allChildren, setSelectedChild } = useSelectedChild();
  const [activeTab, setActiveTab] = useState<TaskManageTab>('daily');
  const [resumeMessage, setResumeMessage] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const {
    child,
    tasks,
    inactiveTasks,
    loading: taskLoading,
    error: taskError,
    refresh: refreshTasks,
  } = useParentTaskList(childId);
  const {
    items: longTermGoals,
    loading: longTermLoading,
    error: longTermError,
    refresh: refreshLongTerm,
    resume: resumeGoal,
  } = useParentLongTermGoals(childId);
  const {
    parentProposals,
    loading: redemptionLoading,
    fetchAll: refreshRedemption,
  } = useParentRedemption(child?.family_id ?? null);

  useFocusEffect(
    useCallback(() => {
      if (!childId) return;
      void refreshTasks();
      void refreshLongTerm();
      void refreshRedemption();
    }, [childId, refreshLongTerm, refreshRedemption, refreshTasks]),
  );

  const regularTasks = useMemo(
    () => tasks.filter(task => !task.isLongTerm),
    [tasks],
  );
  /** 每個分區各自的任務。空的區塊在 DailyGroup 裡直接不渲染。 */
  const dailyGroups = useMemo(() => {
    const grouped = {} as Record<DailyGroupKey, TaskListItem[]>;
    for (const key of DAILY_GROUP_ORDER) grouped[key] = [];
    for (const task of regularTasks) grouped[dailyGroupForTask(task)].push(task);
    return grouped;
  }, [regularTasks]);
  const activeLongTerm = useMemo(
    () => longTermGoals.filter(goal => goal.status === 'active'),
    [longTermGoals],
  );
  const pausedLongTerm = useMemo(
    () => longTermGoals.filter(goal => goal.status === 'paused'),
    [longTermGoals],
  );
  const pausedRegularTasks = useMemo(
    () => inactiveTasks.filter(task => !task.isLongTerm),
    [inactiveTasks],
  );
  const tabCounts: Record<TaskManageTab, number> = {
    daily: regularTasks.length,
    longTerm: activeLongTerm.length,
    paused: pausedRegularTasks.length + pausedLongTerm.length,
    archive: inactiveTasks.length,
  };
  const recentAdjustments = useMemo(() => {
    const activeRows = regularTasks.map(task => ({
      id: `active-${task.childTaskId}`,
      date: formatDate(task.childTaskCreatedAt),
      label: `新增：${task.name}`,
      color: CAT_DOT[task.cat],
    }));
    const pausedRows = inactiveTasks.map(task => ({
      id: `paused-${task.childTaskId}`,
      date: formatDate(task.childTaskCreatedAt),
      label: `暫停：${task.name}`,
      color: CAT_DOT[task.cat],
    }));
    return [...activeRows, ...pausedRows]
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [inactiveTasks, regularTasks]);
  const strongestRewardTask = useMemo(() => {
    return regularTasks
      .filter(task => task.reward?.kind === 'coins')
      .sort((a, b) => {
        const aAmount = a.reward?.kind === 'coins' ? a.reward.amount : 0;
        const bAmount = b.reward?.kind === 'coins' ? b.reward.amount : 0;
        return bAmount - aAmount;
      })[0];
  }, [regularTasks]);

  const selectedChild = allChildren.find(c => c.id === childId) ?? null;
  const loading = taskLoading || longTermLoading || childId === '';
  const error = taskError ?? longTermError;

  const handleNavigateHome = useCallback(() => {
    navigation.navigate('Dashboard' as never);
  }, [navigation]);

  const handleNavigateWeekly = useCallback(() => {
    navigation.navigate('Weekly' as never);
  }, [navigation]);

  const handleNavigateManage = useCallback((section?: ManageSection | 'settings') => {
    if (section === 'settings') {
      navigation.navigate('ParentSettings');
      return;
    }
    (navigation.navigate as (name: string, params?: object) => void)('Manage', {
      initialSection: section ?? 'tasks',
    });
  }, [navigation]);

  const handleAddChild = useCallback(() => {
    navigation.navigate('AddChild');
  }, [navigation]);

  // 平板端改開抽屜 overlay（不是新 route）；ParentTaskCreate route 保留給手機版流程。
  const handleNewTask = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  // 抽屜只吃它需要的四個欄位，年齡由 birth_date 即時算（不改 SelectedChildContext、不另查 DB）。
  const drawerChild: PresetTaskDrawerChild | null = useMemo(() => {
    if (!child) return null;
    return {
      id: child.id,
      nickname: child.nickname,
      birthDate: child.birth_date,
      familyId: child.family_id,
    };
  }, [child]);

  /**
   * 建立 service。整頁一份，不在 render 裡 new ——
   * 每次 render 產生一個新實例會讓抽屜的 useCallback 依賴每次都變。
   */
  const taskCreationService = useMemo(() => new SupabaseParentTaskCreationService(), []);

  /**
   * 建立成功後的列表更新。
   *
   * 用既有 hook 的 refresh，不在抽屜裡自己查 Supabase，也不手動把新任務塞進
   * state —— 那會變成 server state 與 local state 兩個來源，下一次 refresh
   * 就會出現「剛剛看到的那筆不見了」。
   *
   * 長期任務由 useParentLongTermGoals 提供，所以兩個都要更新：只更新其中一個，
   * 家長建立成長計畫後切到長期分頁會看不到它。
   */
  const handleRefreshAfterCreate = useCallback(async () => {
    await Promise.all([refreshTasks(), refreshLongTerm()]);
  }, [refreshLongTerm, refreshTasks]);

  const handleSwitchTabAfterCreate = useCallback((tab: CreatedTaskTab) => {
    setActiveTab(tab);
  }, []);

  const handleEditTask = useCallback((task: TaskListItem) => {
    navigation.navigate('ParentTaskEdit', {
      taskId: task.id,
      childTaskId: task.childTaskId,
      childName: selectedChild?.nickname ?? childName,
      isActive: task.isActive,
    });
  }, [childName, navigation, selectedChild?.nickname]);

  const handleEditGoal = useCallback((goal: LongTermGoalItem) => {
    navigation.navigate('ParentTaskDetail', {
      taskId: goal.taskId,
      childId,
      taskName: goal.name,
    });
  }, [childId, navigation]);

  const handleResumeTask = useCallback(async (task: TaskListItem) => {
    setResumeMessage(null);
    const { error: resumeError } = await supabase
      .from('child_tasks')
      .update({ is_active: true })
      .eq('id', task.childTaskId);
    if (resumeError) {
      setResumeMessage('目前無法重新啟用，請稍後再試');
      return;
    }
    await refreshTasks();
    setResumeMessage(`${task.name} 已重新啟用`);
  }, [refreshTasks]);

  const handleResumeGoal = useCallback(async (goal: LongTermGoalItem) => {
    setResumeMessage(null);
    try {
      await resumeGoal(goal.id);
      setResumeMessage(`${goal.name} 已重新啟用`);
    } catch {
      setResumeMessage('目前無法重新啟用，請稍後再試');
    }
  }, [resumeGoal]);

  if (width < 768) return null;

  return (
    <View style={webTabletScreen}>
      <View style={s.columns}>
        <ParentSidebar
          activeTab="manage"
          activeManageSection="tasks"
          allChildren={allChildren}
          childId={childId}
          setSelectedChild={setSelectedChild}
          pendingCounts={{}}
          onNavigateHome={handleNavigateHome}
          onNavigateWeekly={handleNavigateWeekly}
          onNavigateManage={handleNavigateManage}
          onAddChild={handleAddChild}
        />
        <View style={[s.screen, { paddingBottom: insets.bottom }]}>
          <View style={s.header}>
            <View style={s.headerText}>
              <Text style={s.title}>{childName || selectedChild?.nickname || '孩子'}的任務管理</Text>
              <Text style={s.subtitle}>
                目前啟用 {regularTasks.length} 項日常任務、{activeLongTerm.length} 項長期挑戰
              </Text>
            </View>
            <TouchableOpacity style={s.primaryButton} onPress={handleNewTask} activeOpacity={0.8}>
              <PlusIcon size={18} color="#fff" />
              <Text style={s.primaryButtonText}>新增任務</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <ManageTabBar
              tabs={TABS}
              activeTab={activeTab}
              counts={tabCounts}
              onChange={setActiveTab}
            />

            {loading ? (
              <View style={s.centerBox}>
                <ActivityIndicator size="large" color={ParentColors.accent} />
              </View>
            ) : error ? (
              <View style={s.centerBox}>
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : (
              <View style={s.contentGrid}>
                <View style={s.mainCol}>
                  {activeTab === 'daily' && (
                    <View style={s.stack}>
                      {DAILY_GROUP_ORDER.map(key => (
                        <DailyGroup
                          key={key}
                          groupKey={key}
                          tasks={dailyGroups[key]}
                          onEdit={handleEditTask}
                        />
                      ))}
                      {regularTasks.length === 0 ? <EmptyState text="目前還沒有啟用中的日常任務" /> : null}
                    </View>
                  )}

                  {activeTab === 'longTerm' && (
                    <View style={s.stack}>
                      {activeLongTerm.map(goal => (
                        <LongTermCard key={goal.id} goal={goal} onEdit={handleEditGoal} />
                      ))}
                      {activeLongTerm.length === 0 ? <EmptyState text="目前還沒有進行中的長期挑戰" /> : null}
                    </View>
                  )}

                  {activeTab === 'paused' && (
                    <View style={s.stack}>
                      <View style={s.pageIntro}>
                        <Text style={s.pageIntroTitle}>暫停中的任務與挑戰</Text>
                        <Text style={s.pageIntroText}>這些項目目前不會出現在孩子的每日任務清單中。</Text>
                      </View>
                      {resumeMessage ? <Text style={s.resumeMessage}>{resumeMessage}</Text> : null}
                      {pausedRegularTasks.map(task => (
                        <PausedTaskCard
                          key={task.childTaskId}
                          task={task}
                          onResume={handleResumeTask}
                          onEdit={handleEditTask}
                        />
                      ))}
                      {pausedLongTerm.map(goal => (
                        <PausedGoalCard
                          key={goal.id}
                          goal={goal}
                          onResume={handleResumeGoal}
                          onEdit={handleEditGoal}
                        />
                      ))}
                      {pausedRegularTasks.length + pausedLongTerm.length === 0 ? (
                        <EmptyState text="目前沒有暫停中的任務" />
                      ) : null}
                    </View>
                  )}

                  {activeTab === 'archive' && (
                    <View style={s.stack}>
                      <View style={s.pageIntro}>
                        <Text style={s.pageIntroTitle}>封存紀錄</Text>
                        <Text style={s.pageIntroText}>先保留停用過的任務資料，方便之後回看設定脈絡。</Text>
                      </View>
                      {inactiveTasks.map(task => (
                        <View key={task.childTaskId} style={s.archiveRow}>
                          <TaskIconBubble name={task.name} size={40} />
                          <View style={s.rowMain}>
                            <Text style={s.taskName}>{task.name}</Text>
                            <Text style={s.taskMeta}>{formatDate(task.childTaskCreatedAt)}｜{task.freqLabel}｜{formatReward(task)}</Text>
                          </View>
                          <ChevronRightIcon size={16} color={ParentColors.fgMuted} />
                        </View>
                      ))}
                      {inactiveTasks.length === 0 ? <EmptyState text="目前沒有封存紀錄" /> : null}
                    </View>
                  )}
                </View>

                <View style={s.railCol}>
                  {activeTab === 'daily' && (
                    <>
                      <RailCard title="幣值參考" icon={<CoinIcon size={18} color={ParentColors.amber700} />}>
                        <View style={s.referenceBox}>
                          <Text style={s.referenceTitle}>目前有 {parentProposals.length} 個進行中的兌換目標</Text>
                          <Text style={s.referenceText}>
                            最近可兌換：{parentProposals[0]?.name ?? '可到獎勵管理新增目標'}
                            {parentProposals[0] ? `｜${parentProposals[0].coin_cost} 枚` : ''}
                          </Text>
                        </View>
                        {/*
                          不寫「AI 建議幣值」：幣值是規則引擎依年齡段、任務類型與
                          時間分級算出來的（taskReward/coinPolicy），LLM 沒有參與。
                          說成 AI 決定，家長對數字的疑問會沒有著落。
                        */}
                        <RailText>
                          設定成長幣任務時，系統會依孩子年齡、任務類型與投入時間提供建議幣值。
                        </RailText>
                      </RailCard>
                      <RailCard title="管理提醒" icon={<BellIcon size={18} color={ParentColors.pine500} />}>
                        <View style={s.reminderList}>
                          <Text style={s.reminderItem}>生活紀錄不會累積成長幣</Text>
                          <Text style={s.reminderItem}>時間儲蓄可兌換親子陪伴時間</Text>
                        </View>
                      </RailCard>
                      <RailCard title="最近調整" icon={<ClockIcon size={18} color={ParentColors.pine500} />}>
                        <RecentAdjustmentList rows={recentAdjustments} />
                      </RailCard>
                    </>
                  )}

                  {activeTab === 'longTerm' && (
                    <>
                      <RailCard title="長期挑戰提醒" icon={<BellIcon size={18} color="#fff" />}>
                        <RailText>
                          長期挑戰是跨數週的習慣與技能目標，透過持續累積達成里程碑，幫助孩子穩定成長。
                        </RailText>
                        <View style={s.illustrationWrap}>
                          <Illustration kind="tipPlant" size={96} />
                        </View>
                      </RailCard>
                      <RailCard title="本週變化" icon={<CheckSquareIcon size={18} color="#fff" />}>
                        {activeLongTerm.slice(0, 2).map(goal => (
                          <View key={goal.id} style={s.changeRow}>
                            <TaskIconBubble name={goal.name} size={36} />
                            <Text style={s.changeText}>{goal.name}　{formatWeeklyChange(goal)}</Text>
                          </View>
                        ))}
                        {activeLongTerm.length === 0 ? <Text style={s.railMuted}>目前沒有本週變化</Text> : null}
                      </RailCard>
                      <RailCard title="里程碑設定" icon={<CoinIcon size={18} color="#fff" />}>
                        <RailText>
                          里程碑將在達成關鍵進度時獎勵孩子，建立成就感與動力。
                        </RailText>
                        <TouchableOpacity style={s.railLink} activeOpacity={0.7}>
                          <Text style={s.railLinkText}>檢視里程碑設定</Text>
                          <ChevronRightIcon size={14} color={ParentColors.pine500} />
                        </TouchableOpacity>
                      </RailCard>
                    </>
                  )}

                  {activeTab === 'paused' && (
                    <>
                      <RailCard title="暫停提醒" icon={<BellIcon size={18} color={ParentColors.pine500} />}>
                        <RailText>
                          暫停中的任務與挑戰將不會出現在孩子的每日清單中。
                        </RailText>
                        <View style={s.illustrationWrap}>
                          <Illustration kind="taskPackWand" size={92} />
                        </View>
                      </RailCard>
                      <RailCard title="最近調整" icon={<ClockIcon size={18} color={ParentColors.pine500} />}>
                        <RecentAdjustmentList rows={recentAdjustments.filter(row => row.label.startsWith('暫停'))} />
                      </RailCard>
                      <RailCard title="管理建議" icon={<CheckSquareIcon size={18} color={ParentColors.leaf700} />}>
                        <RailText>
                          任務與挑戰可以隨時重新啟用，彈性調整更符合孩子的日常。
                        </RailText>
                      </RailCard>
                    </>
                  )}

                  {activeTab === 'archive' && (
                    <>
                      <RailCard title="管理提醒" icon={<BellIcon size={18} color={ParentColors.pine500} />}>
                        <RailText>
                          封存紀錄保留設定脈絡，重新安排任務時可以拿來參考。
                        </RailText>
                      </RailCard>
                      <RailCard title="最近調整" icon={<ClockIcon size={18} color={ParentColors.pine500} />}>
                        <RecentAdjustmentList rows={recentAdjustments} />
                      </RailCard>
                    </>
                  )}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>

      <PresetTaskDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        child={drawerChild}
        childLoading={taskLoading}
        taskCreationService={taskCreationService}
        onRefreshTaskList={handleRefreshAfterCreate}
        onSwitchTab={handleSwitchTabAfterCreate}
      />
    </View>
  );
}

const s = StyleSheet.create({
  columns: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
  },
  screen: {
    flex: 1,
    minWidth: 0,
    backgroundColor: ParentColors.bgCanvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: ParentSpacing[6],
    paddingHorizontal: ParentSpacing[8],
    paddingTop: ParentSpacing[8],
    paddingBottom: ParentSpacing[4],
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  title: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h1,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pBody,
    color: ParentColors.fgSecondary,
  },
  primaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.pine500,
    ...ParentShadows.pop,
  },
  primaryButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: '#fff',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: ParentSpacing[8],
    paddingBottom: ParentSpacing[10],
  },
  contentGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 24,
  },
  mainCol: {
    flex: 7,
    minWidth: 0,
  },
  railCol: {
    flex: 3,
    minWidth: 270,
    gap: 18,
  },
  stack: {
    gap: 18,
  },
  taskSectionCard: {
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.lg,
    padding: 18,
    ...ParentShadows.card,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  sectionTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontFamily: ParentFonts.display,
    fontSize: 20,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  sectionSub: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
    marginTop: 3,
  },
  groupIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  innerList: {
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ParentColors.borderSoft,
  },
  taskRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: ParentColors.bgSurface,
  },
  taskDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  taskName: {
    fontFamily: ParentFonts.body,
    fontSize: 16,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  taskMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 20,
    color: ParentColors.fgSecondary,
  },
  statusChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: ParentRadii.sm,
    backgroundColor: ParentColors.tintLeaf,
    flexShrink: 0,
  },
  statusChipText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.leaf700,
  },
  rowTextButton: {
    minWidth: 64,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: ParentColors.borderSoft,
    flexShrink: 0,
  },
  rowTextButtonLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  moreButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  moreButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: 18,
    color: ParentColors.fgPrimary,
    letterSpacing: 0,
  },
  longTermCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    padding: 24,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.lg,
    ...ParentShadows.card,
  },
  longTermMain: {
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  longTermTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
  },
  longTermTitle: {
    fontFamily: ParentFonts.display,
    fontSize: 23,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  longTermProgressLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 21,
    color: ParentColors.fgPrimary,
  },
  bigProgressTrack: {
    width: '100%',
    maxWidth: 360,
    height: 16,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.bgSurfaceWarm,
    overflow: 'hidden',
  },
  bigProgressFill: {
    height: '100%',
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.pine500,
  },
  weeklyChangeText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.pine500,
  },
  adjustText: {
    color: ParentColors.warn,
  },
  longTermSide: {
    width: 150,
    gap: 6,
    flexShrink: 0,
  },
  milestoneLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  milestoneValue: {
    fontFamily: ParentFonts.display,
    fontSize: 18,
    color: ParentColors.fgPrimary,
  },
  longTermActions: {
    width: 118,
    gap: 14,
    flexShrink: 0,
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  secondaryButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  moreLargeButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  pausedCard: {
    flexDirection: 'row',
    gap: 24,
    padding: 24,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.lg,
    ...ParentShadows.card,
  },
  pausedMain: {
    flex: 1,
    minWidth: 0,
    gap: 10,
  },
  pausedTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typeBadge: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: ParentRadii.sm,
    backgroundColor: ParentColors.tintLeaf,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.leaf700,
  },
  typeBadgeOrange: {
    backgroundColor: ParentColors.tintAmber,
    color: ParentColors.amber700,
  },
  pausedTypeText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  pausedTitle: {
    fontFamily: ParentFonts.display,
    fontSize: 22,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  pausedMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  pausedInfoRow: {
    flexDirection: 'row',
    gap: 28,
    paddingTop: 18,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
    flexWrap: 'wrap',
  },
  pausedInfo: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  pausedActions: {
    width: 140,
    gap: 12,
    flexShrink: 0,
  },
  resumeButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.pine200,
  },
  resumeButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
  },
  pageIntro: {
    gap: 6,
    marginBottom: 4,
  },
  pageIntroTitle: {
    fontFamily: ParentFonts.display,
    fontSize: 22,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  pageIntroText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  resumeMessage: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.pine500,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: ParentColors.tintLeaf,
    borderRadius: ParentRadii.md,
    overflow: 'hidden',
  },
  archiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
  },
  railCard: {
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.lg,
    padding: 22,
    gap: 16,
    ...ParentShadows.card,
  },
  railHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  railIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ParentColors.tintLeaf,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railTitle: {
    flex: 1,
    fontFamily: ParentFonts.display,
    fontSize: 19,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  railText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 24,
    color: ParentColors.fgSecondary,
  },
  railMuted: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },
  referenceBox: {
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    overflow: 'hidden',
  },
  referenceTitle: {
    padding: 14,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  referenceText: {
    padding: 14,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 22,
    color: ParentColors.fgSecondary,
  },
  reminderList: {
    gap: 14,
  },
  reminderItem: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  adjustList: {
    gap: 12,
  },
  adjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  adjustDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  adjustDate: {
    width: 42,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  adjustLabel: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  illustrationWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  changeText: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 21,
    color: ParentColors.fgSecondary,
  },
  railLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
  },
  railLinkText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
  },
  emptyState: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.lg,
  },
  emptyStateText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },
  centerBox: {
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
});

export const parentTaskManagementTabletStyles = s;
