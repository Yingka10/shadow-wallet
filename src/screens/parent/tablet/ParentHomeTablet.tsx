// Shadow Wallet · Parent Tablet — Tab 1 首頁 (Dashboard)
// Layout: left sidebar (child switcher + briefing) │ main area (overview strip + goal + tasks) │ right column (static placeholder)
// Data: useParentDashboard + useSelectedChild — no new hooks, no new Supabase queries.

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
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelectedChild } from '../../../context/SelectedChildContext';
import {
  useParentDashboard,
  type DashboardTask,
  type DashboardTaskStatus,
  type DashboardGoal,
} from '../../../hooks/useParentDashboard';
import {
  ParentColors,
  ParentSpacing,
  ParentRadii,
  ParentShadows,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
} from '../../../constants/parentTheme';
import type { TaskCategory } from '../../../types/database';
import dayjs from 'dayjs';

// ─────────────────────────────────────────────────────────────────────────────
// Inline SVG icons (same shapes as ParentDashboardScreen)
// ─────────────────────────────────────────────────────────────────────────────

function CheckSmIcon({ size = 12, color = ParentColors.success }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4 4L19 7" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CoinSmIcon({ size = 14, color = '#A87800' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Path
        d="M12 8v8M9.5 10.5c0-1 1-2 2.5-2s2.5 1 2.5 2-1 1.5-2.5 1.5-2.5.5-2.5 1.5 1 2 2.5 2 2.5-1 2.5-2"
        stroke={color} strokeWidth={1.6} strokeLinecap="round"
      />
    </Svg>
  );
}

function ClockSmIcon({ size = 11, color = ParentColors.fgMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Path d="M12 7v5l3 3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function FlagIcon({ size = 13, color = ParentColors.clay500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 21V4m0 0h13l-3 5 3 5H4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SunIcon({ size = 14, color = ParentColors.ink700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={2} />
      <Path
        d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke={color} strokeWidth={2} strokeLinecap="round"
      />
    </Svg>
  );
}

function HourglassSmIcon({ size = 14, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 3h14M5 21h14M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function SparkleSmIcon({ size = 14, color = ParentColors.clay500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 2l1.5 5 5 1.5-5 1.5L12 15l-1.5-5-5-1.5 5-1.5z" />
    </Svg>
  );
}

function GiftIcon({ size = 11, color = ParentColors.clay500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 12v10H4V12M22 7H2v5h20V7zM12 22V7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function AlertIcon({ size = 11, color = ParentColors.warn }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 9v5M12 17.5v.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M10.29 4.86L2.9 18a2 2 0 001.71 3h14.78a2 2 0 001.71-3L13.71 4.86a2 2 0 00-3.42 0z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Category metadata (mirrors ParentDashboardScreen)
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TASK_CAT_META: Record<TaskCategory, { label: string; tint: string; fg: string; icon: React.ReactElement<any> }> = {
  A: { label: '生活自理',   tint: '#EAE4D7', fg: ParentColors.ink700,  icon: <SunIcon /> },
  B: { label: '家庭本分',   tint: '#EAF0EE', fg: ParentColors.teal500, icon: <HourglassSmIcon /> },
  C: { label: '貢獻',       tint: '#FAF1E7', fg: ParentColors.clay500, icon: <SparkleSmIcon /> },
  D: { label: '成長',       tint: '#F4EBF0', fg: ParentColors.plum500, icon: <FlagIcon color={ParentColors.plum500} /> },
};

// ─────────────────────────────────────────────────────────────────────────────
// Status pill (mirrors ParentDashboardScreen)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function computeAge(birthDate: string): number {
  return dayjs().diff(dayjs(birthDate), 'year');
}

// ─────────────────────────────────────────────────────────────────────────────
// Left sidebar: child switcher + today's briefing
// ─────────────────────────────────────────────────────────────────────────────

type ChildOption = { id: string; nickname: string };

function ChildSwitcherSidebar({
  allChildren,
  childId,
  setSelectedChild,
  doneToday,
  totalToday,
  spendingBalance,
}: {
  allChildren: ChildOption[];
  childId: string;
  setSelectedChild: (c: ChildOption) => void;
  doneToday: number;
  totalToday: number;
  spendingBalance: number;
}) {
  const pct = totalToday > 0 ? Math.round((doneToday / totalToday) * 100) : 0;

  return (
    <View style={styles.sidebar}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── Child list ── */}
        <Text style={styles.sidebarEyebrow}>孩子</Text>
        <View style={styles.childList}>
          {allChildren.map((c) => {
            const active = c.id === childId;
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.childCard, active && styles.childCardActive]}
                onPress={() => setSelectedChild(c)}
                activeOpacity={0.7}
              >
                <View style={[styles.childAvatar, active && styles.childAvatarActive]}>
                  <Text style={[styles.childAvatarText, active && styles.childAvatarTextActive]}>
                    {c.nickname.charAt(0)}
                  </Text>
                </View>
                <View style={styles.childCardInfo}>
                  <Text style={[styles.childCardName, active && styles.childCardNameActive]} numberOfLines={1}>
                    {c.nickname}
                  </Text>
                  {active && (
                    <View style={styles.childProgressRow}>
                      <Text style={styles.childProgressText}>
                        {doneToday}/{totalToday}
                      </Text>
                      <View style={styles.childProgressTrack}>
                        <View style={[styles.childProgressFill, { width: `${pct}%` as `${number}%` }]} />
                      </View>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity style={styles.addChildBtn} activeOpacity={0.7}>
            <Text style={styles.addChildText}>＋ 新增孩子</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sidebarDivider} />

        {/* ── Today's briefing (derived from hook data) ── */}
        <Text style={styles.sidebarEyebrow}>今天的快訊</Text>
        <View style={styles.briefingCard}>
          <View style={styles.briefingRow}>
            <CoinSmIcon size={14} color="#A87800" />
            <Text style={styles.briefingText}>
              撲滿 <Text style={styles.briefingAccent}>{spendingBalance} 枚</Text>
            </Text>
          </View>
          <View style={[styles.briefingRow, { marginTop: 6 }]}>
            <CheckSmIcon size={11} color={ParentColors.success} />
            <Text style={styles.briefingText}>
              今日完成 <Text style={styles.briefingAccent}>{doneToday}/{totalToday}</Text> 件任務
            </Text>
          </View>
          {doneToday < totalToday && (
            <View style={[styles.briefingRow, { marginTop: 6 }]}>
              <AlertIcon size={11} color={ParentColors.warn} />
              <Text style={[styles.briefingText, { color: ParentColors.warn }]}>
                還有 {totalToday - doneToday} 件待完成
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview strip (ChildHeaderStrip equivalent)
// ─────────────────────────────────────────────────────────────────────────────

function OverviewStrip({
  nickname,
  birthDate,
  doneToday,
  totalToday,
  spendingBalance,
  weekCoinDelta,
}: {
  nickname: string;
  birthDate: string;
  doneToday: number;
  totalToday: number;
  spendingBalance: number;
  weekCoinDelta: number;
}) {
  const age = computeAge(birthDate);
  const pct = totalToday > 0 ? Math.round((doneToday / totalToday) * 100) : 0;

  return (
    <View style={styles.overviewStrip}>
      {/* Name + role */}
      <View style={styles.overviewNameBlock}>
        <View style={styles.overviewAvatar}>
          <Text style={styles.overviewAvatarText}>{nickname.charAt(0)}</Text>
        </View>
        <View style={{ marginLeft: 14 }}>
          <View style={styles.overviewNameRow}>
            <Text style={styles.overviewName}>{nickname}</Text>
            <Text style={styles.overviewAge}>{age} 歲</Text>
          </View>
          <Text style={styles.overviewSubtitle}>家長視角 · 今天</Text>
        </View>
      </View>

      <View style={styles.overviewDivider} />

      {/* Today progress */}
      <View style={styles.overviewStatBlock}>
        <Text style={styles.overviewEyebrow}>今日任務</Text>
        <View style={styles.overviewNumRow}>
          <Text style={styles.overviewNum}>{doneToday}</Text>
          <Text style={styles.overviewNumOf}> / {totalToday}</Text>
          <Text style={styles.overviewPct}> 完成{pct}%</Text>
        </View>
        <View style={styles.overviewProgressTrack}>
          <View style={[styles.overviewProgressFill, { width: `${pct}%` as `${number}%` }]} />
        </View>
      </View>

      <View style={styles.overviewDivider} />

      {/* Wallet */}
      <View style={styles.overviewStatBlock}>
        <Text style={styles.overviewEyebrow}>撲滿餘額</Text>
        <View style={styles.overviewNumRow}>
          <CoinSmIcon size={20} color="#A87800" />
          <Text style={[styles.overviewNum, { color: '#A87800', marginLeft: 6 }]}>{spendingBalance}</Text>
        </View>
        <Text style={styles.overviewDeltaText}>本週 +{weekCoinDelta} 幣</Text>
      </View>

      <View style={styles.overviewDivider} />

      {/* Weekly status — derived */}
      <View style={[styles.overviewStatBlock, { flex: 1 }]}>
        <Text style={styles.overviewEyebrow}>本週狀態</Text>
        <View style={styles.weekStatusPill}>
          <View style={styles.weekStatusDot} />
          <Text style={styles.weekStatusLabel}>整體穩定</Text>
        </View>
        <Text style={styles.overviewDeltaText}>完成率 {pct}%</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Goal card
// ─────────────────────────────────────────────────────────────────────────────

function GoalCard({ goal }: { goal: DashboardGoal }) {
  const pct = Math.min(100, Math.round((goal.current / goal.target) * 100));
  const remaining = Math.max(0, goal.target - goal.current);
  const met = goal.current >= goal.target;

  return (
    <View style={styles.goalCard}>
      <View style={styles.goalHeader}>
        <View style={styles.goalIcon}>
          <FlagIcon size={16} color={ParentColors.clay500} />
        </View>
        <View style={styles.goalMid}>
          <Text style={styles.goalEyebrow}>進行中 · 長期目標</Text>
          <Text style={styles.goalName}>{goal.name}</Text>
        </View>
        <View style={styles.goalRight}>
          {met ? (
            <Text style={styles.goalMetLabel}>已達標 🎉</Text>
          ) : (
            <>
              <Text style={styles.goalRemainingLabel}>下一個里程碑</Text>
              <Text style={styles.goalRemainingNum}>
                還差 <Text style={styles.goalRemainingAccent}>{remaining}</Text> 枚
              </Text>
            </>
          )}
          <Text style={styles.goalEta}>預估 {goal.etaLabel} 達成</Text>
        </View>
      </View>

      <View style={styles.goalProgressTrack}>
        <View style={[styles.goalProgressFill, { width: `${pct}%` as `${number}%` }]} />
      </View>

      <View style={styles.goalFooter}>
        <Text style={styles.goalProgress}>{goal.current} / {goal.target}</Text>
        <Text style={styles.goalPct}>{pct}%</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Task row
// ─────────────────────────────────────────────────────────────────────────────

function TaskRow({ task, isLast }: { task: DashboardTask; isLast: boolean }) {
  const cat = TASK_CAT_META[task.cat];

  const statusConfig: Record<DashboardTaskStatus, { tone: PillTone; label: string; icon?: React.ReactElement }> = {
    done:    { tone: 'sage',    label: '已完成', icon: <CheckSmIcon /> },
    pending: { tone: 'neutral', label: task.cat === 'D' ? '待孩子打卡' : '待完成' },
    missed:  { tone: 'warn',    label: '今日未做' },
    review:  { tone: 'clay',    label: '待審核' },
  };
  const st = statusConfig[task.status];
  const isDone = task.status === 'done';

  return (
    <View style={[styles.taskRow, !isLast && styles.taskRowDivider]}>
      {/* Completion circle */}
      <View style={[styles.taskCheckCircle, isDone && styles.taskCheckCircleDone]}>
        {isDone && <CheckSmIcon size={13} color="#fff" />}
      </View>

      {/* Name + chips */}
      <View style={styles.taskInfo}>
        <Text
          style={[styles.taskName, task.status === 'missed' && styles.taskNameMissed]}
          numberOfLines={1}
        >
          {task.name}
        </Text>
        <View style={styles.taskMeta}>
          <View style={[styles.taskCatChip, { backgroundColor: cat.tint }]}>
            {React.cloneElement(cat.icon as React.ReactElement<any>, { size: 11, color: cat.fg })}
            <Text style={[styles.taskCatLabel, { color: cat.fg }]}>{cat.label}</Text>
          </View>
          {task.completedAt != null && (
            <View style={styles.taskTimeChip}>
              <ClockSmIcon size={10} color={ParentColors.fgMuted} />
              <Text style={styles.taskTimeText}>{task.completedAt} 完成</Text>
            </View>
          )}
        </View>
      </View>

      {/* Reward */}
      <View style={styles.taskRewardWrap}>
        {task.reward != null ? (
          task.reward.kind === 'coins' ? (
            <View style={styles.taskCoinRow}>
              <CoinSmIcon size={14} color="#A87800" />
              <Text style={styles.taskCoinText}>{task.reward.amount}</Text>
            </View>
          ) : (
            <Text style={styles.taskTimeReward}>+{task.reward.amount}分</Text>
          )
        ) : (
          <Text style={styles.taskRewardDash}>—</Text>
        )}
      </View>

      {/* Status pill */}
      <StatusPill tone={st.tone} label={st.label} icon={st.icon} />

      {/* Action button */}
      <View style={styles.taskAction}>
        {isDone ? (
          <TouchableOpacity style={styles.taskActionBtn} activeOpacity={0.7}>
            <Text style={styles.taskActionText}>標記</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.taskRemindBtn} activeOpacity={0.7}>
            <Text style={styles.taskRemindText}>提醒</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Today's task panel
// ─────────────────────────────────────────────────────────────────────────────

function TodayTaskPanel({
  tasks,
  doneToday,
  totalToday,
}: {
  tasks: DashboardTask[];
  doneToday: number;
  totalToday: number;
}) {
  const todayLabel = dayjs().format('MM/DD dd');

  return (
    <View style={styles.taskPanel}>
      {/* Section header */}
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>任務清單</Text>
          <Text style={styles.sectionTitle}>今日任務</Text>
        </View>
        <View style={styles.sectionMeta}>
          <ClockSmIcon size={13} color={ParentColors.fgMuted} />
          <Text style={styles.sectionMetaText}>{todayLabel} · 共 {totalToday} 件 · {doneToday} 件已完成</Text>
        </View>
      </View>

      {/* Task list */}
      {tasks.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>今日沒有任務</Text>
        </View>
      ) : (
        tasks.map((t, i) => (
          <TaskRow key={t.id} task={t} isLast={i === tasks.length - 1} />
        ))
      )}

      {/* Footer buttons */}
      <View style={styles.taskFooter}>
        <TouchableOpacity style={styles.footerBtnBrass} activeOpacity={0.8}>
          <Text style={styles.footerBtnText}>＋ 指派臨時任務</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerBtnNavy} activeOpacity={0.8}>
          <Text style={styles.footerBtnText}>＋ 建立新任務</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Right column — static placeholder
// TODO: 接 proposals/redemption hook
// ─────────────────────────────────────────────────────────────────────────────

function PendingItemsPanel() {
  return (
    <View style={styles.pendingPanel}>
      {/* Section header */}
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>待處理事項</Text>
          <Text style={styles.sectionTitle}>需要你處理</Text>
        </View>
      </View>

      {/* 兌換待審 — static placeholder */}
      {/* TODO: 接 proposals/redemption hook */}
      <View style={styles.pendingSubSection}>
        <View style={styles.pendingSubHead}>
          <View style={[styles.pendingSubIcon, { backgroundColor: '#FAF1E7' }]}>
            <GiftIcon size={11} color={ParentColors.clay500} />
          </View>
          <Text style={styles.pendingSubLabel}>兌換待審</Text>
          <View style={styles.pendingSubLine} />
          <Text style={styles.pendingSubNote}>孩子許願 · 設定幣值後上架</Text>
        </View>
        <View style={styles.pendingEmpty}>
          <Text style={styles.pendingEmptyTitle}>目前沒有待審兌換</Text>
          <Text style={styles.pendingEmptyMeta}>孩子的兌換申請會出現在這裡。</Text>
        </View>
      </View>

      {/* 任務提案 — static placeholder */}
      {/* TODO: 接 proposals/redemption hook */}
      <View style={styles.pendingSubSection}>
        <View style={styles.pendingSubHead}>
          <View style={[styles.pendingSubIcon, { backgroundColor: '#F4EBF0' }]}>
            <SparkleSmIcon size={11} color={ParentColors.plum500} />
          </View>
          <Text style={styles.pendingSubLabel}>任務提案</Text>
          <View style={styles.pendingSubLine} />
          <Text style={styles.pendingSubNote}>孩子提案完成的事 · 同意後發幣</Text>
        </View>
        <View style={styles.pendingEmpty}>
          <Text style={styles.pendingEmptyTitle}>目前沒有待審提案</Text>
          <Text style={styles.pendingEmptyMeta}>孩子有新提案時，會在這裡出現。</Text>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

export default function ParentHomeTablet() {
  const insets = useSafeAreaInsets();
  const { childId, childName, allChildren, setSelectedChild } = useSelectedChild();

  const {
    child,
    spendingBalance,
    weekCoinDelta,
    goal,
    todayTasks,
    loading,
    error,
    refresh,
  } = useParentDashboard(childId);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const doneToday = todayTasks.filter(t => t.status === 'done').length;
  const totalToday = todayTasks.length;

  if (loading) {
    return (
      <View style={[styles.centeredFill, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={ParentColors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centeredFill, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={refresh} activeOpacity={0.8}>
          <Text style={styles.retryText}>重試</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const nickname  = child?.nickname  ?? childName;
  const birthDate = child?.birth_date ?? dayjs().subtract(8, 'year').toISOString();

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <View style={styles.columns}>

        {/* ── Left sidebar ── */}
        <ChildSwitcherSidebar
          allChildren={allChildren}
          childId={childId}
          setSelectedChild={setSelectedChild}
          doneToday={doneToday}
          totalToday={totalToday}
          spendingBalance={spendingBalance}
        />

        {/* ── Main area ── */}
        <ScrollView
          style={styles.mainArea}
          contentContainerStyle={[styles.mainContent, { paddingTop: insets.top + 16 }]}
          showsVerticalScrollIndicator={false}
        >
          <OverviewStrip
            nickname={nickname}
            birthDate={birthDate}
            doneToday={doneToday}
            totalToday={totalToday}
            spendingBalance={spendingBalance}
            weekCoinDelta={weekCoinDelta}
          />

          {goal != null && <GoalCard goal={goal} />}

          <TodayTaskPanel
            tasks={todayTasks}
            doneToday={doneToday}
            totalToday={totalToday}
          />
        </ScrollView>

        {/* ── Right column — static placeholder ── */}
        <ScrollView
          style={styles.rightCol}
          contentContainerStyle={[styles.rightColContent, { paddingTop: insets.top + 16 }]}
          showsVerticalScrollIndicator={false}
        >
          <PendingItemsPanel />
        </ScrollView>

      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Root & loading ──
  root: {
    flex: 1,
    backgroundColor: ParentColors.bgCanvas,
  },
  centeredFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.bgCanvas,
    gap: 12,
  },
  errorText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.error,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: ParentColors.accent,
    borderRadius: ParentRadii.md,
    marginTop: 4,
  },
  retryText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: '#fff',
  },

  // ── Three-column layout ──
  columns: {
    flex: 1,
    flexDirection: 'row',
  },

  // ── Left sidebar ──
  sidebar: {
    width: '22%',
    maxWidth: 240,
    backgroundColor: ParentColors.bgSurface,
    borderRightWidth: 1,
    borderRightColor: ParentColors.borderSoft,
    paddingHorizontal: ParentSpacing[4],
    paddingTop: ParentSpacing[5],
  },
  sidebarEyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: ParentColors.borderSoft,
    marginVertical: 16,
  },
  childList: {
    gap: 6,
  },
  childCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  childCardActive: {
    backgroundColor: ParentColors.teal50,
    borderColor: ParentColors.teal200,
  },
  childAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ParentColors.bgSurfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  childAvatarActive: {
    backgroundColor: ParentColors.accent,
  },
  childAvatarText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgMuted,
  },
  childAvatarTextActive: {
    color: '#fff',
  },
  childCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  childCardName: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },
  childCardNameActive: {
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.accent,
  },
  childProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  childProgressText: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    flexShrink: 0,
  },
  childProgressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: ParentColors.ivory200,
    borderRadius: ParentRadii.pill,
    overflow: 'hidden',
  },
  childProgressFill: {
    height: '100%',
    backgroundColor: ParentColors.accent,
    borderRadius: ParentRadii.pill,
  },
  addChildBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderStyle: 'dashed',
    alignItems: 'center',
    marginTop: 4,
  },
  addChildText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },

  // ── Today's briefing ──
  briefingCard: {
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderRadius: ParentRadii.md,
    padding: 12,
    gap: 0,
  },
  briefingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  briefingText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    flex: 1,
  },
  briefingAccent: {
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgSecondary,
  },

  // ── Main area ──
  mainArea: {
    flex: 1,
    backgroundColor: ParentColors.bgCanvas,
  },
  mainContent: {
    paddingHorizontal: ParentSpacing.cardPadLg,
    paddingBottom: ParentSpacing[8],
    gap: 16,
  },

  // ── Overview strip ──
  overviewStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: ParentColors.bgSurface,
    borderRadius: ParentRadii.lg,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    padding: ParentSpacing.cardPad,
    ...ParentShadows.card,
  },
  overviewNameBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  overviewAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: ParentColors.teal500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewAvatarText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xl,
    fontWeight: ParentFontWeights.bold,
    color: '#fff',
  },
  overviewNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  overviewName: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h2,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  overviewAge: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },
  overviewSubtitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    marginTop: 2,
  },
  overviewDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: ParentColors.borderSoft,
    marginHorizontal: 18,
  },
  overviewStatBlock: {
    justifyContent: 'center',
    minWidth: 120,
    flexShrink: 0,
  },
  overviewEyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  overviewNumRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  overviewNum: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.h1,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  overviewNumOf: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },
  overviewPct: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    marginLeft: 6,
  },
  overviewProgressTrack: {
    height: 5,
    backgroundColor: ParentColors.ivory200,
    borderRadius: ParentRadii.pill,
    overflow: 'hidden',
    marginTop: 8,
    width: '100%',
  },
  overviewProgressFill: {
    height: '100%',
    backgroundColor: ParentColors.accent,
    borderRadius: ParentRadii.pill,
  },
  overviewDeltaText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    marginTop: 4,
  },
  weekStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#E8F2E6',
    borderWidth: 1,
    borderColor: '#C9DDD0',
    borderRadius: ParentRadii.pill,
    marginBottom: 4,
  },
  weekStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: ParentColors.success,
  },
  weekStatusLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.success,
  },

  // ── Goal card ──
  goalCard: {
    backgroundColor: '#FBEFDF',
    borderWidth: 1,
    borderColor: '#F0D5AE',
    borderRadius: ParentRadii.lg,
    padding: ParentSpacing.cardPad,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  goalIcon: {
    width: 40,
    height: 40,
    borderRadius: ParentRadii.sm,
    backgroundColor: '#F0D5AE',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  goalMid: {
    flex: 1,
    minWidth: 0,
  },
  goalEyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.clay500,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  goalName: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  goalRight: {
    alignItems: 'flex-end',
    flexShrink: 0,
    paddingLeft: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(201,119,50,0.2)',
    borderRadius: ParentRadii.md,
  },
  goalRemainingLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    color: ParentColors.fgMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  goalRemainingNum: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.clay500,
  },
  goalRemainingAccent: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.clay500,
  },
  goalMetLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.success,
  },
  goalEta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    marginTop: 2,
  },
  goalProgressTrack: {
    height: 6,
    backgroundColor: 'rgba(201,119,50,0.2)',
    borderRadius: ParentRadii.pill,
    overflow: 'hidden',
  },
  goalProgressFill: {
    height: '100%',
    backgroundColor: ParentColors.clay500,
    borderRadius: ParentRadii.pill,
  },
  goalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  goalProgress: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  goalPct: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.clay500,
    fontWeight: ParentFontWeights.bold,
  },

  // ── Task panel ──
  taskPanel: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: ParentRadii.lg,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    padding: ParentSpacing.cardPadLg,
    ...ParentShadows.card,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionEyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  sectionTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  sectionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionMetaText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  emptyState: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },

  // ── Task row ──
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  taskRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  taskCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: ParentColors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  taskCheckCircleDone: {
    backgroundColor: ParentColors.success,
    borderWidth: 0,
    borderStyle: 'solid',
  },
  taskInfo: {
    flex: 1,
    minWidth: 0,
  },
  taskName: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pBody,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  taskNameMissed: {
    opacity: 0.4,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 5,
    flexWrap: 'wrap',
  },
  taskCatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: ParentRadii.pill,
  },
  taskCatLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
  },
  taskTimeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  taskTimeText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  taskRewardWrap: {
    width: 60,
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  taskCoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  taskCoinText: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.bold,
    color: '#A87800',
  },
  taskTimeReward: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.teal500,
    fontWeight: ParentFontWeights.bold,
  },
  taskRewardDash: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },
  taskAction: {
    width: 56,
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  taskActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: ParentRadii.sm,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  taskActionText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgSecondary,
    fontWeight: ParentFontWeights.medium,
  },
  taskRemindBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: ParentRadii.sm,
  },
  taskRemindText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },

  // ── Status pill ──
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: ParentRadii.pill,
    flexShrink: 0,
  },
  pillText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
  },

  // ── Task footer buttons ──
  taskFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
    borderStyle: 'dashed',
  },
  footerBtnBrass: {
    flex: 1,
    paddingVertical: 13,
    backgroundColor: '#C97735',
    borderRadius: ParentRadii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnNavy: {
    flex: 1,
    paddingVertical: 13,
    backgroundColor: ParentColors.teal500,
    borderRadius: ParentRadii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: '#fff',
  },

  // ── Right column ──
  rightCol: {
    width: '28%',
    maxWidth: 300,
    backgroundColor: ParentColors.bgSurface,
    borderLeftWidth: 1,
    borderLeftColor: ParentColors.borderSoft,
  },
  rightColContent: {
    padding: ParentSpacing.cardPad,
    gap: 16,
  },
  pendingPanel: {
    gap: 16,
  },
  pendingSubSection: {
    gap: 10,
  },
  pendingSubHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingSubIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pendingSubLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    flexShrink: 0,
  },
  pendingSubLine: {
    flex: 1,
    height: 1,
    backgroundColor: ParentColors.borderSoft,
  },
  pendingSubNote: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    flexShrink: 0,
  },
  pendingEmpty: {
    paddingVertical: 18,
    paddingHorizontal: 14,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderStyle: 'dashed',
    gap: 3,
  },
  pendingEmptyTitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },
  pendingEmptyMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.ink300,
  },
});
