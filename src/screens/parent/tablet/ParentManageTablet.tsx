// Shadow Wallet · Parent Tablet — 管理頁
// 三塊內容：任務庫設定 / 獎勵設定 / 兌換歷史 — 全部接真資料
// Only renders when width >= 768.
// selectedChildId 為本頁 local state，不依賴 SelectedChildContext。

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
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { useParentTaskList, type TaskListItem } from '../../../hooks/useParentTaskList';
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
import type { TaskCategory } from '../../../types/database';
import dayjs from 'dayjs';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CAT_META: Record<TaskCategory, { name: string; color: string }> = {
  A: { name: '生活自理', color: ParentColors.ink700  },
  B: { name: '家庭本分', color: ParentColors.teal500 },
  C: { name: '貢獻',     color: ParentColors.clay500 },
  D: { name: '里程碑',   color: ParentColors.plum500 },
};

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  approved: { label: '已核准', bg: '#E8F2E6', fg: ParentColors.success },
  rejected: { label: '已退回', bg: '#FDEEE8', fg: ParentColors.error   },
  pending:  { label: '待審核', bg: '#FBF1DC', fg: ParentColors.warn    },
};

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

// ─────────────────────────────────────────────────────────────────────────────
// ManageHeader
// ─────────────────────────────────────────────────────────────────────────────

function ManageHeader({
  selectedChild,
  allChildren,
  onPickChild,
  activeCount,
}: {
  selectedChild: RedemptionChildInfo | null;
  allChildren: RedemptionChildInfo[];
  onPickChild: (id: string) => void;
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
      {allChildren.length > 1 && (
        <View style={s.childSwitcher}>
          {allChildren.map((c) => {
            const active = c.id === selectedChild?.id;
            return (
              <TouchableOpacity
                key={c.id}
                onPress={() => onPickChild(c.id)}
                style={[s.childChip, active && s.childChipActive]}
              >
                <Text style={[s.childChipText, active && s.childChipTextActive]}>
                  {c.nickname}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Task Library
// ─────────────────────────────────────────────────────────────────────────────

function TaskRow({ task }: { task: TaskListItem }) {
  return (
    <View style={s.taskRow}>
      <View style={s.activeDot} />
      <View style={s.taskMid}>
        <View style={s.taskNameRow}>
          <Text style={s.taskName}>{task.name}</Text>
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
    </View>
  );
}

function CategoryGroup({ cat, tasks }: { cat: TaskCategory; tasks: TaskListItem[] }) {
  const meta = CAT_META[cat];
  return (
    <View style={s.catGroup}>
      <View style={s.catGroupHead}>
        <View style={s.catGroupLeft}>
          <View style={[s.catBadge, { backgroundColor: meta.color }]}>
            <Text style={s.catBadgeText}>{cat}</Text>
          </View>
          <Text style={s.catLabel}>{cat} 類</Text>
          <Text style={s.catName}>{meta.name}</Text>
        </View>
        <Text style={s.catCount}>{tasks.length} 項</Text>
      </View>
      <View style={s.innerBorder}>
        {tasks.length === 0 ? (
          <View style={s.emptyRow}>
            <Text style={s.emptyRowText}>本類別尚無任務</Text>
          </View>
        ) : (
          tasks.map((t, i) => (
            <React.Fragment key={t.id}>
              <TaskRow task={t} />
              {i < tasks.length - 1 && <View style={s.rowDivider} />}
            </React.Fragment>
          ))
        )}
      </View>
    </View>
  );
}

function TaskLibrarySection({
  tasks,
  loading,
}: {
  tasks: TaskListItem[];
  loading: boolean;
}) {
  const grouped = (['A', 'B', 'C', 'D'] as TaskCategory[]).map((cat) => ({
    cat,
    tasks: tasks.filter((t) => t.cat === cat),
  }));

  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <View style={s.eyebrowRow}>
          <LibraryIcon />
          <Text style={s.eyebrow}>Library</Text>
        </View>
        <Text style={s.cardTitle}>任務庫</Text>
        <Text style={s.cardMeta}>任務設定面 · 不顯示執行狀況</Text>
      </View>
      {loading ? (
        <View style={s.loaderBox}>
          <ActivityIndicator size="small" color={ParentColors.accent} />
        </View>
      ) : (
        <View style={s.catList}>
          {grouped.map(({ cat, tasks: catTasks }) => (
            <CategoryGroup key={cat} cat={cat} tasks={catTasks} />
          ))}
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
}: {
  proposals: ParentProposal[];
  loading: boolean;
}) {
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <View style={s.eyebrowRow}>
          <GiftIcon />
          <Text style={s.eyebrow}>Rewards</Text>
        </View>
        <Text style={s.cardTitle}>獎勵清單</Text>
        <Text style={s.cardMeta}>可兌換項目 · 家長提案</Text>
      </View>
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

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);

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
    children: allChildren,
    loading: redemptionLoading,
    fetchAll: refreshRedemption,
  } = useParentRedemption(familyId);

  // Set first child once children are available
  useEffect(() => {
    if (selectedChildId === null && allChildren.length > 0) {
      setSelectedChildId(allChildren[0].id);
    }
  }, [allChildren, selectedChildId]);

  const {
    tasks,
    loading: taskLoading,
    refresh: refreshTasks,
  } = useParentTaskList(selectedChildId ?? '');

  useFocusEffect(
    useCallback(() => {
      void refreshRedemption();
      if (selectedChildId) void refreshTasks();
    }, [refreshRedemption, refreshTasks, selectedChildId]),
  );

  if (width < 768) return null;

  const selectedChild = allChildren.find((c) => c.id === selectedChildId) ?? null;
  const isTaskLoading = taskLoading || selectedChildId === null;

  return (
    <View style={[s.screen, { paddingBottom: insets.bottom }]}>
      <HistoryModal
        visible={historyVisible}
        history={history}
        allChildren={allChildren}
        loading={redemptionLoading}
        onClose={() => setHistoryVisible(false)}
      />
      <ManageHeader
        selectedChild={selectedChild}
        allChildren={allChildren}
        onPickChild={setSelectedChildId}
        activeCount={tasks.length}
      />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.grid}>
          {/* 左欄 — 任務庫 */}
          <View style={s.colLeft}>
            <TaskLibrarySection tasks={tasks} loading={isTaskLoading} />
          </View>
          {/* 右欄 — 獎勵清單 + 兌換歷史入口 */}
          <View style={s.colRight}>
            <RewardListSection proposals={parentProposals} loading={redemptionLoading} />
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
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
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

  // ── Category group ──
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
  catBadge: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catBadgeText: {
    fontFamily: ParentFonts.mono,
    fontSize: 12,
    fontWeight: ParentFontWeights.bold,
    color: '#fff',
  },
  catLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  catName: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },
  catCount: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
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
});
