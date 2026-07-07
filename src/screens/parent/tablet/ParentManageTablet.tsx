// Shadow Wallet · Parent Tablet — 管理頁
// 三塊內容：任務庫設定 / 獎勵設定 / 兌換歷史 — 全部接真資料
// Only renders when width >= 768.
// 孩子選擇跟首頁/週報共用 SelectedChildContext（共用側欄 ParentSidebar 才切得動）。

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  StyleSheet,
  useWindowDimensions,
  Alert,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../../App';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { useSelectedChild } from '../../../context/SelectedChildContext';
import { useParentTaskList, type TaskListItem } from '../../../hooks/useParentTaskList';
import {
  useParentLongTermGoals,
  type LongTermGoalItem,
} from '../../../hooks/useParentLongTermGoals';
import type { LongTermType } from '../../../types/database';
import {
  useParentRedemption,
  type ParentProposal,
  type RedemptionRequest,
  type RedemptionChildInfo,
} from '../../../hooks/useParentRedemption';
import {
  ParentColors,
  ParentSpacing,
  ParentRadii,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
} from '../../../constants/parentTheme';
import { webTabletScreen } from '../../../constants/webStyles';
import { ParentSidebar, type ManageSection } from './ParentSidebar';
import dayjs from 'dayjs';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  approved: { label: '已核准', bg: '#E8F2E6', fg: ParentColors.success },
  rejected: { label: '已退回', bg: '#FDEEE8', fg: ParentColors.error   },
  pending:  { label: '待審核', bg: '#FBF1DC', fg: ParentColors.warn    },
};

// Module-level cache so a card's collapse state survives tab switches / remounts
// within a session (resets on full app reload).
const expandCache: Record<string, boolean> = {};

function useExpandState(key: string, defaultValue: boolean): [boolean, () => void] {
  const [expanded, setExpanded] = useState<boolean>(expandCache[key] ?? defaultValue);
  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      expandCache[key] = next;
      return next;
    });
  }, [key]);
  return [expanded, toggle];
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG Icons
// ─────────────────────────────────────────────────────────────────────────────

function LibraryIcon({ size = 13, color = ParentColors.fgMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 21V6a2 2 0 012-2h14a2 2 0 012 2v15" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M3 21h18M9 9h6M9 13h4" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function GiftIcon({ size = 13, color = ParentColors.clay500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 12v10H4V12M22 7H2v5h20V7zM12 22V7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function HistoryIcon({ size = 13, color = ParentColors.info }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 3v6h6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3.05 13A9 9 0 103 9.5l.05-.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M12 7v5l4 2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CoinSmIcon({ size = 13, color = '#A87800' }: { size?: number; color?: string }) {
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

function ClockSmIcon({ size = 11, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Path d="M12 7v5l3 3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChevronRightIcon({ size = 18, color = ParentColors.fgMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function XIcon({ size = 20, color = ParentColors.fgPrimary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function PencilIcon({ size = 13, color = ParentColors.fgMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CheckCircleIcon({ size = 13, color = ParentColors.fgMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Path d="M8 12l3 3 5-5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function FlagIcon({ size = 13, color = ParentColors.fgMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4 22v-7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ManageHeader
// ─────────────────────────────────────────────────────────────────────────────

// 孩子切換已移到共用側欄（ParentSidebar），這裡只顯示目前孩子的標題資訊。
function ManageHeader({
  selectedChild,
  activeCount,
}: {
  selectedChild: RedemptionChildInfo | null;
  activeCount: number;
}) {
  return (
    <View style={s.header}>
      <View style={s.headerLeft}>
        <Text style={s.eyebrow}>家長設定</Text>
        <Text style={s.headerTitle}>
          {selectedChild ? `${selectedChild.nickname} · 設定面板` : '管理'}
        </Text>
        <Text style={s.headerMeta}>
          {'啟用中 '}
          <Text style={s.headerMetaNum}>{activeCount}</Text>
          {' 項任務'}
        </Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Task Library
// ─────────────────────────────────────────────────────────────────────────────

function TaskRow({ task, onPress }: { task: TaskListItem; onPress?: () => void }) {
  const inner = (
    <View style={[s.taskRow, !task.isActive && s.taskRowInactive]}>
      <View style={[s.activeDot, !task.isActive && s.inactiveDot]} />
      <View style={s.taskMid}>
        <View style={s.taskNameRow}>
          <Text style={[s.taskName, !task.isActive && s.taskNameInactive]}>{task.name}</Text>
          {task.isLongTerm && (
            <View style={s.longTermChip}>
              <Text style={s.longTermChipText}>長期</Text>
            </View>
          )}
        </View>
        <Text style={s.taskFreq}>{task.freqLabel}</Text>
      </View>
      <View style={s.taskRewardWrap}>
        {task.reward ? (
          task.reward.kind === 'coins' ? (
            <View style={s.coinInline}>
              <CoinSmIcon />
              <Text style={s.coinNum}>{task.reward.amount}</Text>
            </View>
          ) : (
            <View style={s.coinInline}>
              <ClockSmIcon />
              <Text style={[s.coinNum, s.coinNumTime]}>{task.reward.amount}分</Text>
            </View>
          )
        ) : (
          <Text style={s.rewardDash}>—</Text>
        )}
      </View>
      {onPress && <PencilIcon size={12} color={ParentColors.ink300} />}
    </View>
  );

  if (!onPress) return inner;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {inner}
    </TouchableOpacity>
  );
}

type RewardGroupKey = 'time' | 'coins' | 'none';

const REWARD_GROUP_LABEL: Record<RewardGroupKey, string> = {
  time:  '時間存款任務',
  coins: '成長幣任務',
  none:  '生活紀錄任務',
};

function RewardGroupIcon({ groupKey, size = 14 }: { groupKey: RewardGroupKey; size?: number }) {
  if (groupKey === 'time')  return <ClockSmIcon  size={size} color={ParentColors.teal500} />;
  if (groupKey === 'coins') return <CoinSmIcon   size={size} color="#A87800" />;
  return <CheckCircleIcon size={size} color={ParentColors.fgMuted} />;
}

function RewardGroup({
  groupKey,
  tasks,
  onTaskPress,
}: {
  groupKey: RewardGroupKey;
  tasks: TaskListItem[];
  onTaskPress?: (task: TaskListItem) => void;
}) {
  const [expanded, toggle] = useExpandState(`group-${groupKey}`, true);

  return (
    <View style={s.catGroup}>
      <TouchableOpacity
        style={s.catGroupHead}
        onPress={toggle}
        activeOpacity={0.7}
      >
        <View style={s.catGroupLeft}>
          <RewardGroupIcon groupKey={groupKey} />
          <Text style={s.catLabel}>{REWARD_GROUP_LABEL[groupKey]}</Text>
        </View>
        <View style={s.catGroupRight}>
          <Text style={s.catCount}>{tasks.length} 項</Text>
          <View style={[s.chevronMini, expanded && s.chevronMiniExpanded]}>
            <ChevronRightIcon size={14} />
          </View>
        </View>
      </TouchableOpacity>
      {expanded && (
        <View style={s.innerBorder}>
          {tasks.map((t, i) => (
            <React.Fragment key={t.id}>
              <TaskRow task={t} onPress={onTaskPress ? () => onTaskPress(t) : undefined} />
              {i < tasks.length - 1 && <View style={s.rowDivider} />}
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

function CollapsibleHeader({
  icon,
  eyebrow,
  title,
  summary,
  expanded,
  onToggle,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  summary?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity style={s.collapseHead} onPress={onToggle} activeOpacity={0.7}>
      <View style={s.collapseHeadLeft}>
        <View style={s.eyebrowRow}>
          {icon}
          <Text style={s.eyebrow}>{eyebrow}</Text>
        </View>
        <Text style={s.cardTitle}>{title}</Text>
      </View>
      <View style={s.collapseHeadRight}>
        {!!summary && <Text style={s.collapseSummary}>{summary}</Text>}
        <View style={[s.chevronBox, expanded && s.chevronBoxExpanded]}>
          <ChevronRightIcon size={18} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function TaskLibrarySection({
  tasks,
  inactiveTasks,
  loading,
  onTaskPress,
  forceExpanded,
}: {
  tasks: TaskListItem[];
  inactiveTasks: TaskListItem[];
  loading: boolean;
  onTaskPress?: (task: TaskListItem) => void;
  /** 首頁側欄「管理 > 任務管理」導來時強制展開一次 */
  forceExpanded?: boolean;
}) {
  const [expanded, toggle] = useExpandState('lib', false);
  useEffect(() => {
    if (forceExpanded && !expanded) toggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceExpanded]);

  // Exclude long-term tasks — they're managed via the long-term section
  const regularTasks = tasks.filter((t) => !t.isLongTerm);

  const allGroups: Array<{ key: RewardGroupKey; tasks: TaskListItem[] }> = [
    { key: 'time',  tasks: regularTasks.filter((t) => t.reward?.kind === 'time') },
    { key: 'coins', tasks: regularTasks.filter((t) => t.reward?.kind === 'coins') },
    { key: 'none',  tasks: regularTasks.filter((t) => t.reward == null) },
  ];
  const groups = allGroups.filter((g) => g.tasks.length > 0);

  const summary = loading
    ? ''
    : `啟用 ${regularTasks.length}${inactiveTasks.length > 0 ? ` · 停用 ${inactiveTasks.length}` : ''}`;

  return (
    <View style={s.card}>
      <CollapsibleHeader
        icon={<LibraryIcon />}
        eyebrow="Library"
        title="任務庫"
        summary={summary}
        expanded={expanded}
        onToggle={toggle}
      />
      {expanded && (
        <View style={s.cardBody}>
          <Text style={s.cardBodyHint}>點任務可編輯名稱、獎勵或停用</Text>
          {loading ? (
            <View style={s.loaderBox}>
              <ActivityIndicator size="small" color={ParentColors.accent} />
            </View>
          ) : (
            <View style={s.catList}>
              {groups.length === 0 ? (
                <View style={s.emptyBox}>
                  <Text style={s.emptyBoxText}>尚無啟用任務</Text>
                </View>
              ) : (
                groups.map(({ key, tasks: groupTasks }) => (
                  <RewardGroup
                    key={key}
                    groupKey={key}
                    tasks={groupTasks}
                    onTaskPress={onTaskPress}
                  />
                ))
              )}

              {inactiveTasks.length > 0 && (
                <View style={s.inactiveSection}>
                  <Text style={s.inactiveSectionLabel}>已停用 · {inactiveTasks.length} 項</Text>
                  <View style={s.innerBorder}>
                    {inactiveTasks.map((t, i) => (
                      <React.Fragment key={t.id}>
                        <TaskRow task={t} onPress={onTaskPress ? () => onTaskPress(t) : undefined} />
                        {i < inactiveTasks.length - 1 && <View style={s.rowDivider} />}
                      </React.Fragment>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reward List
// ─────────────────────────────────────────────────────────────────────────────

function RewardRow({ proposal, isLast }: { proposal: ParentProposal; isLast: boolean }) {
  return (
    <View style={[s.listRow, !isLast && s.rowDivider]}>
      <View style={s.rewardThumb}>
        <Text style={s.rewardThumbText}>{proposal.name.charAt(0)}</Text>
      </View>
      <Text style={s.listRowName} numberOfLines={1}>{proposal.name}</Text>
      <View style={s.coinInline}>
        <CoinSmIcon />
        <Text style={s.coinNum}>{proposal.coin_cost}</Text>
      </View>
    </View>
  );
}

function RewardListSection({
  proposals,
  loading,
  forceExpanded,
}: {
  proposals: ParentProposal[];
  loading: boolean;
  /** 首頁側欄「管理 > 獎勵管理」導來時強制展開一次 */
  forceExpanded?: boolean;
}) {
  const [expanded, toggle] = useExpandState('rewards', false);
  useEffect(() => {
    if (forceExpanded && !expanded) toggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceExpanded]);
  const summary = loading ? '' : `${proposals.length} 項`;

  return (
    <View style={s.card}>
      <CollapsibleHeader
        icon={<GiftIcon />}
        eyebrow="Rewards"
        title="獎勵清單"
        summary={summary}
        expanded={expanded}
        onToggle={toggle}
      />
      {expanded && (
        <View style={s.cardBody}>
          <Text style={s.cardBodyHint}>可兌換項目 · 家長提案</Text>
          {loading ? (
            <View style={s.loaderBox}>
              <ActivityIndicator size="small" color={ParentColors.accent} />
            </View>
          ) : proposals.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyBoxText}>尚無獎勵項目</Text>
            </View>
          ) : (
            <View style={s.innerBorder}>
              {proposals.map((p, i) => (
                <RewardRow key={p.id} proposal={p} isLast={i === proposals.length - 1} />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Long-term task management
// ─────────────────────────────────────────────────────────────────────────────

const GOAL_TYPE_META: Record<LongTermType, { emoji: string; label: string; tint: string; fg: string }> = {
  habit:     { emoji: '🌱', label: '習慣養成', tint: '#E8F2E6', fg: ParentColors.success },
  skill:     { emoji: '📚', label: '技能學習', tint: '#EAF0EE', fg: ParentColors.teal500 },
  family:    { emoji: '🏠', label: '家庭責任', tint: '#EAE4D7', fg: ParentColors.ink500 },
  challenge: { emoji: '🏆', label: '自我挑戰', tint: '#FAF1E7', fg: ParentColors.clay500 },
};

const GOAL_TYPE_FALLBACK = { emoji: '🎯', label: '長期任務', tint: '#EEE', fg: ParentColors.fgMuted };

function LongTermGoalRow({
  item,
  isLast,
  onPause,
  onResume,
  onDelete,
}: {
  item: LongTermGoalItem;
  isLast: boolean;
  onPause: (goalId: string) => Promise<void>;
  onResume: (goalId: string) => Promise<void>;
  onDelete: (goalId: string, taskId: string) => Promise<void>;
}) {
  const meta = GOAL_TYPE_META[item.goalType] ?? GOAL_TYPE_FALLBACK;
  const isPaused = item.status === 'paused';
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function run(fn: () => Promise<void>, failMsg: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      Alert.alert(failMsg, err instanceof Error ? err.message : '請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[s.ltRow, !isLast && s.rowDivider, isPaused && s.ltRowPaused]}>
      <View style={s.ltRowTop}>
        <View style={[s.ltTypeBadge, { backgroundColor: meta.tint }]}>
          <Text style={s.ltTypeEmoji}>{meta.emoji}</Text>
          <Text style={[s.ltTypeLabel, { color: meta.fg }]}>{meta.label}</Text>
        </View>
        <Text style={[s.ltName, isPaused && s.ltNamePaused]} numberOfLines={1}>{item.name}</Text>
        {isPaused && (
          <View style={s.ltPausedChip}>
            <Text style={s.ltPausedChipText}>已暫停</Text>
          </View>
        )}
      </View>

      <View style={s.ltProgressRow}>
        <View style={s.ltProgressTrack}>
          <View style={[s.ltProgressFill, { width: `${item.progressPct}%` as `${number}%` }]} />
        </View>
        <Text style={s.ltProgressLabel}>{item.progressLabel}</Text>
      </View>

      {confirmingDelete ? (
        <View style={s.ltActionRow}>
          <Text style={s.ltConfirmText}>確定刪除這個長期任務？</Text>
          <TouchableOpacity
            style={[s.ltActionBtn]}
            onPress={() => setConfirmingDelete(false)}
            disabled={busy}
            activeOpacity={0.7}
          >
            <Text style={s.ltActionBtnText}>取消</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.ltActionBtn, s.ltDeleteBtn]}
            onPress={() => run(() => onDelete(item.id, item.taskId), '刪除失敗')}
            disabled={busy}
            activeOpacity={0.7}
          >
            {busy
              ? <ActivityIndicator size="small" color={ParentColors.error} />
              : <Text style={[s.ltActionBtnText, s.ltDeleteBtnText]}>確定刪除</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.ltActionRow}>
          {isPaused ? (
            <TouchableOpacity
              style={[s.ltActionBtn, s.ltResumeBtn]}
              onPress={() => run(() => onResume(item.id), '恢復失敗')}
              disabled={busy}
              activeOpacity={0.7}
            >
              {busy
                ? <ActivityIndicator size="small" color={ParentColors.success} />
                : <Text style={[s.ltActionBtnText, s.ltResumeBtnText]}>恢復</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={s.ltActionBtn}
              onPress={() => run(() => onPause(item.id), '暫停失敗')}
              disabled={busy}
              activeOpacity={0.7}
            >
              {busy
                ? <ActivityIndicator size="small" color={ParentColors.fgMuted} />
                : <Text style={s.ltActionBtnText}>暫停</Text>}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={s.ltActionBtn}
            onPress={() => setConfirmingDelete(true)}
            disabled={busy}
            activeOpacity={0.7}
          >
            <Text style={[s.ltActionBtnText, s.ltDeleteBtnText]}>刪除</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function LongTermManageSection({
  items,
  loading,
  onPause,
  onResume,
  onDelete,
  forceExpanded,
}: {
  items: LongTermGoalItem[];
  loading: boolean;
  onPause: (goalId: string) => Promise<void>;
  onResume: (goalId: string) => Promise<void>;
  onDelete: (goalId: string, taskId: string) => Promise<void>;
  /** 首頁側欄「管理 > 任務管理」導來時強制展開一次 */
  forceExpanded?: boolean;
}) {
  const [expanded, toggle] = useExpandState('lt', false);
  useEffect(() => {
    if (forceExpanded && !expanded) toggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceExpanded]);

  const pausedCount = items.filter((it) => it.status === 'paused').length;
  const activeCount = items.length - pausedCount;
  const summary = loading
    ? ''
    : items.length === 0
    ? '0'
    : `進行中 ${activeCount}${pausedCount > 0 ? ` · 暫停 ${pausedCount}` : ''}`;

  const TYPE_ORDER: LongTermType[] = ['habit', 'skill', 'family', 'challenge'];
  const grouped = TYPE_ORDER
    .map((type) => ({ type, list: items.filter((it) => it.goalType === type) }))
    .filter((g) => g.list.length > 0);

  return (
    <View style={s.card}>
      <CollapsibleHeader
        icon={<FlagIcon color={ParentColors.clay500} />}
        eyebrow="Long-term"
        title="長期任務"
        summary={summary}
        expanded={expanded}
        onToggle={toggle}
      />
      {expanded && (
        <View style={s.cardBody}>
          <Text style={s.cardBodyHint}>習慣養成 · 技能學習 · 家庭責任 — 可暫停或刪除</Text>
          {loading ? (
            <View style={s.loaderBox}>
              <ActivityIndicator size="small" color={ParentColors.accent} />
            </View>
          ) : items.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyBoxText}>尚無長期任務</Text>
            </View>
          ) : (
            <View style={s.ltGroupList}>
              {grouped.map(({ type, list }) => {
                const meta = GOAL_TYPE_META[type];
                return (
                  <View key={type} style={s.ltGroup}>
                    <View style={s.ltGroupHead}>
                      <Text style={s.ltGroupEmoji}>{meta.emoji}</Text>
                      <Text style={s.ltGroupLabel}>{meta.label}</Text>
                      <Text style={s.ltGroupCount}>{list.length}</Text>
                    </View>
                    <View style={s.innerBorder}>
                      {list.map((item, i) => (
                        <LongTermGoalRow
                          key={item.id}
                          item={item}
                          isLast={i === list.length - 1}
                          onPause={onPause}
                          onResume={onResume}
                          onDelete={onDelete}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Redemption History — entry button + modal
// ─────────────────────────────────────────────────────────────────────────────

function HistoryModalRow({
  item,
  childNickname,
  isLast,
}: {
  item: RedemptionRequest;
  childNickname: string;
  isLast: boolean;
}) {
  const meta = STATUS_META[item.status] ?? STATUS_META.pending;
  const dateStr = item.reviewed_at
    ? dayjs(item.reviewed_at).format('MM/DD')
    : dayjs(item.created_at).format('MM/DD');

  return (
    <View style={[s.listRow, !isLast && s.rowDivider]}>
      <View style={s.historyMid}>
        <Text style={s.listRowName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.historyMeta}>{childNickname} · {dateStr}</Text>
        {item.parent_note ? (
          <Text style={s.historyNote}>{item.parent_note}</Text>
        ) : null}
      </View>
      <View style={s.coinInline}>
        <CoinSmIcon />
        <Text style={s.coinNum}>{item.coin_cost}</Text>
      </View>
      <View style={[s.statusChip, { backgroundColor: meta.bg }]}>
        <Text style={[s.statusChipText, { color: meta.fg }]}>{meta.label}</Text>
      </View>
    </View>
  );
}

function HistoryModal({
  visible,
  history,
  allChildren,
  loading,
  onClose,
}: {
  visible: boolean;
  history: RedemptionRequest[];
  allChildren: RedemptionChildInfo[];
  loading: boolean;
  onClose: () => void;
}) {
  const childMap: Record<string, string> = Object.fromEntries(
    allChildren.map((c) => [c.id, c.nickname]),
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={s.modalContainer}>
        <View style={s.modalHeader}>
          <View style={s.modalHeaderLeft}>
            <View style={s.eyebrowRow}>
              <HistoryIcon size={13} />
              <Text style={s.eyebrow}>History</Text>
            </View>
            <Text style={s.modalTitle}>兌換歷史</Text>
          </View>
          <TouchableOpacity
            style={s.modalCloseBtn}
            onPress={onClose}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <XIcon />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.loaderBox}>
            <ActivityIndicator size="small" color={ParentColors.accent} />
          </View>
        ) : history.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyBoxText}>尚無兌換紀錄</Text>
          </View>
        ) : (
          <ScrollView
            style={s.modalScroll}
            contentContainerStyle={s.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.innerBorder}>
              {history.map((item, i) => (
                <HistoryModalRow
                  key={item.id}
                  item={item}
                  childNickname={childMap[item.child_id] ?? '—'}
                  isLast={i === history.length - 1}
                />
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function HistoryEntry({
  history,
  loading,
  onOpen,
}: {
  history: RedemptionRequest[];
  loading: boolean;
  onOpen: () => void;
}) {
  const monthCount = history.filter((h) =>
    dayjs(h.created_at).isSame(dayjs(), 'month'),
  ).length;

  return (
    <TouchableOpacity style={s.historyEntryBtn} onPress={onOpen} activeOpacity={0.75}>
      <View style={s.historyEntryIcon}>
        <HistoryIcon size={18} color={ParentColors.info} />
      </View>
      <View style={s.historyEntryMid}>
        <View style={s.historyEntryRow}>
          <Text style={s.historyEntryTitle}>兌換歷史</Text>
          {!loading && (
            <Text style={s.historyEntryCount}>本月 {monthCount} 筆</Text>
          )}
        </View>
        <Text style={s.historyEntrySub}>含 AI 初審紀錄、家長確認與已退回項目</Text>
      </View>
      <ChevronRightIcon />
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ParentManageTablet() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const initialSection = (route.params as { initialSection?: ManageSection } | undefined)?.initialSection;

  const { childId: selectedChildId, allChildren, setSelectedChild } = useSelectedChild();
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);

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
    if (section) {
      (navigation.navigate as (name: string, params?: object) => void)('Manage', { initialSection: section });
      return;
    }
  }, [navigation]);

  const handleAddChild = useCallback(() => {
    navigation.navigate('AddChild');
  }, [navigation]);

  // 從首頁側欄「管理」子選單導來時，展開對應區塊一次（帳本紀錄＝開歷史彈窗）。
  useEffect(() => {
    if (initialSection === 'history') setHistoryVisible(true);
  }, [initialSection]);

  useEffect(() => {
    async function loadFamily() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('parents')
          .select('family_id')
          .eq('user_id', user.id)
          .single();
        if (data?.family_id) setFamilyId(data.family_id);
      } catch (err) {
        console.error('[ParentManageTablet] loadFamily error:', err);
      }
    }
    void loadFamily();
  }, []);

  const {
    parentProposals,
    history,
    loading: redemptionLoading,
    fetchAll: refreshRedemption,
  } = useParentRedemption(familyId);

  const {
    tasks,
    inactiveTasks,
    loading: taskLoading,
    refresh: refreshTasks,
  } = useParentTaskList(selectedChildId ?? '');

  const {
    items: longTermGoals,
    loading: longTermLoading,
    refresh: refreshLongTerm,
    pause: pauseGoal,
    resume: resumeGoal,
    remove: removeGoal,
  } = useParentLongTermGoals(selectedChildId ?? '');

  function handleTaskPress(task: TaskListItem) {
    const child = allChildren.find((c) => c.id === selectedChildId);
    if (!child) return;
    navigation.navigate('ParentTaskEdit', {
      taskId: task.id,
      childTaskId: task.childTaskId,
      childName: child.nickname,
      isActive: task.isActive,
    });
  }

  useFocusEffect(
    useCallback(() => {
      void refreshRedemption();
      if (selectedChildId) {
        void refreshTasks();
        void refreshLongTerm();
      }
    }, [refreshRedemption, refreshTasks, refreshLongTerm, selectedChildId]),
  );

  if (width < 768) return null;

  const selectedChild = allChildren.find((c) => c.id === selectedChildId) ?? null;
  const isTaskLoading = taskLoading || selectedChildId === '';

  return (
    <View style={webTabletScreen}>
    <View style={s.columns}>
      <ParentSidebar
        activeTab="manage"
        allChildren={allChildren}
        childId={selectedChildId}
        setSelectedChild={setSelectedChild}
        pendingCounts={{}}
        onNavigateHome={handleNavigateHome}
        onNavigateWeekly={handleNavigateWeekly}
        onNavigateManage={handleNavigateManage}
        onAddChild={handleAddChild}
      />
    <View style={[s.screen, s.mainAreaWrap, { paddingBottom: insets.bottom }]}>
      <HistoryModal
        visible={historyVisible}
        history={history}
        allChildren={allChildren}
        loading={redemptionLoading}
        onClose={() => setHistoryVisible(false)}
      />
      <ManageHeader
        selectedChild={selectedChild}
        activeCount={tasks.length}
      />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.grid}>
          {/* 左欄 — 任務庫 + 長期任務佔位 */}
          <View style={s.colLeft}>
            <TaskLibrarySection
              tasks={tasks}
              inactiveTasks={inactiveTasks}
              loading={isTaskLoading}
              onTaskPress={handleTaskPress}
              forceExpanded={initialSection === 'tasks'}
            />
            <View style={s.colGap} />
            <LongTermManageSection
              items={longTermGoals}
              loading={longTermLoading || selectedChildId === ''}
              onPause={pauseGoal}
              onResume={resumeGoal}
              onDelete={removeGoal}
              forceExpanded={initialSection === 'tasks'}
            />
          </View>
          {/* 右欄 — 獎勵清單 + 兌換歷史入口 */}
          <View style={s.colRight}>
            <RewardListSection
              proposals={parentProposals}
              loading={redemptionLoading}
              forceExpanded={initialSection === 'rewards'}
            />
            <View style={s.colGap} />
            <HistoryEntry
              history={history}
              loading={redemptionLoading}
              onOpen={() => setHistoryVisible(true)}
            />
          </View>
        </View>
      </ScrollView>
    </View>
    </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // 側欄 + 內容的橫向容器（共用 ParentSidebar，跟 ParentHomeTablet 同一套版面骨架）
  columns: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
  },
  mainAreaWrap: {
    minWidth: 0,
  },
  screen: {
    flex: 1,
    backgroundColor: ParentColors.bgCanvas,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: ParentSpacing[8],
    paddingTop: ParentSpacing[5],
    paddingBottom: ParentSpacing[10],
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ParentSpacing[8],
    paddingVertical: ParentSpacing[5],
    backgroundColor: ParentColors.bgCanvas,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  headerLeft: {
    gap: 3,
  },
  headerTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h1,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    letterSpacing: -0.5,
  },
  headerMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    marginTop: 2,
  },
  headerMetaNum: {
    fontFamily: ParentFonts.mono,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },

  // ── Child switcher pill ──
  childSwitcher: {
    flexDirection: 'row',
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.pill,
    padding: 3,
    gap: 2,
  },
  childChip: {
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[2],
    borderRadius: ParentRadii.pill,
  },
  childChipActive: {
    backgroundColor: ParentColors.bgSurface,
    shadowColor: ParentColors.shadowBase,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  childChipText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },
  childChipTextActive: {
    color: ParentColors.fgPrimary,
  },

  // ── Two-column grid ──
  grid: {
    flexDirection: 'row',
    gap: ParentSpacing[6],
    alignItems: 'flex-start',
  },
  colLeft: {
    flex: 5,   // ~55.5% (mirrors design-ref 1.25fr)
  },
  colRight: {
    flex: 4,   // ~44.5% (mirrors design-ref 1fr)
  },
  colGap: {
    height: ParentSpacing[5],
  },

  // ── Card ──
  card: {
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.xl,
    padding: ParentSpacing[6],
  },
  cardHead: {
    marginBottom: ParentSpacing[5],
  },
  cardTitle: {
    fontFamily: ParentFonts.display,
    fontSize: 21,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    marginTop: 2,
  },
  cardMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    marginTop: 3,
  },

  // ── Collapsible header ──
  collapseHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: ParentSpacing[3],
  },
  collapseHeadLeft: {
    flex: 1,
    gap: 2,
  },
  collapseHeadRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[3],
    flexShrink: 0,
  },
  collapseSummary: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  chevronBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronBoxExpanded: {
    transform: [{ rotate: '90deg' }],
  },
  cardBody: {
    marginTop: ParentSpacing[5],
    gap: ParentSpacing[3],
  },
  cardBodyHint: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },

  // ── Eyebrow ──
  eyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgMuted,
    letterSpacing: 0.14,
    textTransform: 'uppercase',
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },

  // ── Loader / empty ──
  loaderBox: {
    paddingVertical: ParentSpacing[6],
    alignItems: 'center',
  },
  emptyBox: {
    paddingVertical: ParentSpacing[5],
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderRadius: ParentRadii.md,
    alignItems: 'center',
  },
  emptyBoxText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },

  // ── Inner bordered list ──
  innerBorder: {
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    overflow: 'hidden',
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },

  // ── Reward group ──
  catList: {
    gap: ParentSpacing[5],
  },
  catGroup: {
    gap: ParentSpacing[2],
  },
  catGroupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: ParentSpacing[2],
  },
  catGroupLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
  },
  catLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  catGroupRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
  },
  catCount: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  chevronMini: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronMiniExpanded: {
    transform: [{ rotate: '90deg' }],
  },

  // ── Task row ──
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: ParentSpacing[3],
    paddingHorizontal: ParentSpacing[4],
    gap: ParentSpacing[3],
    backgroundColor: ParentColors.bgSurface,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ParentColors.success,
    flexShrink: 0,
  },
  taskMid: {
    flex: 1,
    gap: 2,
  },
  taskNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
    flexWrap: 'wrap',
  },
  taskName: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  taskFreq: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  taskRewardWrap: {
    width: 64,
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  longTermChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  longTermChipText: {
    fontFamily: ParentFonts.body,
    fontSize: 10,
    color: ParentColors.fgMuted,
  },
  emptyRow: {
    paddingVertical: ParentSpacing[3],
    alignItems: 'center',
    backgroundColor: ParentColors.bgSurface,
  },
  emptyRowText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },

  // ── Shared list row ──
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: ParentSpacing[3],
    paddingHorizontal: ParentSpacing[4],
    gap: ParentSpacing[3],
    backgroundColor: ParentColors.bgSurface,
  },
  listRowName: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },

  // ── Reward row ──
  rewardThumb: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rewardThumbText: {
    fontFamily: ParentFonts.display,
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },

  // ── History modal row ──
  historyMid: {
    flex: 1,
    gap: 2,
  },
  historyMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  historyNote: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    fontStyle: 'italic',
    marginTop: 1,
  },

  // ── History entry button ──
  historyEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[4],
    padding: ParentSpacing[5],
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.xl,
  },
  historyEntryIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EEF3FA',
    borderWidth: 1,
    borderColor: '#C5D6EF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  historyEntryMid: {
    flex: 1,
    gap: 3,
  },
  historyEntryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  historyEntryTitle: {
    fontFamily: ParentFonts.body,
    fontSize: 14.5,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  historyEntryCount: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  historyEntrySub: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    lineHeight: 16,
  },

  // ── History modal ──
  modalContainer: {
    flex: 1,
    backgroundColor: ParentColors.bgCanvas,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: ParentSpacing[8],
    paddingVertical: ParentSpacing[5],
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgCanvas,
  },
  modalHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  modalTitle: {
    fontFamily: ParentFonts.display,
    fontSize: 24,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: ParentSpacing[8],
    paddingBottom: ParentSpacing[10],
  },

  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: ParentRadii.pill,
    flexShrink: 0,
  },
  statusChipText: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
  },

  // ── Coin / reward inline ──
  coinInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  coinNum: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  coinNumTime: {
    color: ParentColors.teal500,
  },
  rewardDash: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },

  // ── Inactive task state ──
  taskRowInactive: {
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  inactiveDot: {
    backgroundColor: ParentColors.ink300,
    opacity: 0.5,
  },
  taskNameInactive: {
    color: ParentColors.fgMuted,
  },
  inactiveSection: {
    marginTop: ParentSpacing[3],
    gap: ParentSpacing[2],
  },
  inactiveSectionLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 2,
  },

  // ── Long-term task management ──
  ltGroupList: {
    gap: ParentSpacing[5],
  },
  ltGroup: {
    gap: ParentSpacing[2],
  },
  ltGroupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
    marginBottom: ParentSpacing[2],
  },
  ltGroupEmoji: {
    fontSize: 13,
  },
  ltGroupLabel: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  ltGroupCount: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  ltRow: {
    paddingVertical: ParentSpacing[4],
    paddingHorizontal: ParentSpacing[4],
    gap: ParentSpacing[3],
    backgroundColor: ParentColors.bgSurface,
  },
  ltRowPaused: {
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  ltRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
  },
  ltTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: ParentRadii.pill,
    flexShrink: 0,
  },
  ltTypeEmoji: {
    fontSize: 12,
  },
  ltTypeLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
  },
  ltName: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  ltNamePaused: {
    color: ParentColors.fgMuted,
  },
  ltPausedChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    flexShrink: 0,
  },
  ltPausedChipText: {
    fontFamily: ParentFonts.body,
    fontSize: 10,
    color: ParentColors.fgMuted,
  },
  ltProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[3],
  },
  ltProgressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: ParentColors.bgSurfaceWarm,
    overflow: 'hidden',
  },
  ltProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: ParentColors.clay500,
  },
  ltProgressLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    flexShrink: 0,
  },
  ltActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: ParentSpacing[2],
  },
  ltConfirmText: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.error,
  },
  ltActionBtn: {
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[2],
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ltActionBtnText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  ltResumeBtn: {
    borderColor: ParentColors.success,
    backgroundColor: '#E8F2E6',
  },
  ltResumeBtnText: {
    color: ParentColors.success,
  },
  ltDeleteBtn: {
    borderColor: ParentColors.error,
    backgroundColor: '#FDEEE8',
  },
  ltDeleteBtnText: {
    color: ParentColors.error,
  },

});
