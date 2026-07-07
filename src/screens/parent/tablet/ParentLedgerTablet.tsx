// Shadow Wallet · Parent Tablet — 帳本紀錄
// 「管理 > 帳本紀錄」整頁。只記錄會影響成長幣、時間儲蓄或兌換的事件，依日分組。
// 取代原本點側欄「帳本紀錄」開的兌換歷史彈窗。Only renders when width >= 768.

import React, { useCallback, useState } from 'react';
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
import Svg, { Circle, Path } from 'react-native-svg';
import type { RootStackParamList } from '../../../../App';
import { useSelectedChild } from '../../../context/SelectedChildContext';
import {
  useParentLedger,
  type LedgerEvent,
  type LedgerFilter,
  type LedgerKind,
} from '../../../hooks/useParentLedger';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentSpacing,
} from '../../../constants/parentTheme';
import { webTabletScreen } from '../../../constants/webStyles';
import { ParentSidebar, type ManageSection } from './ParentSidebar';

// ─────────────────────────────────────────────────────────────────────────────
// Per-kind visual language（一律走 token）
// ─────────────────────────────────────────────────────────────────────────────

const KIND_STYLE: Record<LedgerKind, { color: string; tint: string }> = {
  coin:   { color: ParentColors.done,    tint: ParentColors.tintLeaf },
  time:   { color: ParentColors.info,    tint: ParentColors.tintPine },
  redeem: { color: ParentColors.clay500, tint: ParentColors.tintClay },
  adjust: { color: ParentColors.fgMuted, tint: ParentColors.bgSurfaceWarm },
};

const FILTERS: Array<{ id: LedgerFilter; label: string }> = [
  { id: 'all',    label: '全部' },
  { id: 'coin',   label: '成長幣' },
  { id: 'time',   label: '時間儲蓄' },
  { id: 'redeem', label: '兌換紀錄' },
  { id: 'adjust', label: '調整／補記' },
];

const RANGES: Array<{ days: number | null; label: string }> = [
  { days: 30,   label: '最近 30 天' },
  { days: 90,   label: '最近 90 天' },
  { days: null, label: '全部紀錄' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────

function InfoIcon({ size = 14, color = ParentColors.fgMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Path d="M12 11v5M12 8h.01" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function CoinIcon({ size = 16, color = ParentColors.done }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Path
        d="M12 7.2l1.3 2.7 2.9.3-2.2 2 .6 2.9L12 15.7l-2.6 1.4.6-2.9-2.2-2 2.9-.3z"
        fill={color}
      />
    </Svg>
  );
}

function ClockIcon({ size = 16, color = ParentColors.info }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Path d="M12 7v5l3.2 1.8" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function GiftIcon({ size = 16, color = ParentColors.clay500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function PencilIcon({ size = 15, color = ParentColors.fgMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function FilterIcon({ size = 15, color = ParentColors.fgSecondary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 5h16l-6.5 8v5l-3 2v-7z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CalendarIcon({ size = 15, color = ParentColors.fgSecondary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM4 9h16M8 3v4M16 3v4" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChevronDownSmIcon({ size = 14, color = ParentColors.fgMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function KindIcon({ kind, size = 16 }: { kind: LedgerKind; size?: number }) {
  const color = KIND_STYLE[kind].color;
  if (kind === 'coin') return <CoinIcon size={size} color={color} />;
  if (kind === 'time') return <ClockIcon size={size} color={color} />;
  if (kind === 'redeem') return <GiftIcon size={size} color={color} />;
  return <PencilIcon size={size - 1} color={color} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────────────────

function SummaryBar({
  balance,
  monthNet,
  timeSaving,
}: {
  balance: number;
  monthNet: number;
  timeSaving: number;
}) {
  const monthStr = `${monthNet >= 0 ? '+' : ''}${monthNet}`;
  return (
    <View style={s.summaryBar}>
      <View style={s.summaryCell}>
        <CoinIcon size={18} color={ParentColors.gold700} />
        <Text style={s.summaryLabel}>目前成長幣</Text>
        <Text style={s.summaryNum}>{balance}</Text>
        <Text style={s.summaryUnit}>枚</Text>
      </View>
      <View style={s.summaryDivider} />
      <View style={s.summaryCell}>
        <View style={s.trendDot} />
        <Text style={s.summaryLabel}>本月</Text>
        <Text style={[s.summaryNum, { color: ParentColors.done }]}>{monthStr}</Text>
        <Text style={s.summaryUnit}>枚</Text>
      </View>
      <View style={s.summaryDivider} />
      <View style={s.summaryCell}>
        <ClockIcon size={18} color={ParentColors.info} />
        <Text style={s.summaryLabel}>時間儲蓄</Text>
        <Text style={[s.summaryNum, { color: ParentColors.info }]}>{timeSaving}</Text>
        <Text style={s.summaryUnit}>分鐘</Text>
      </View>
    </View>
  );
}

function FilterRow({
  filter,
  onFilter,
  rangeIndex,
  onCycleRange,
}: {
  filter: LedgerFilter;
  onFilter: (f: LedgerFilter) => void;
  rangeIndex: number;
  onCycleRange: () => void;
}) {
  return (
    <View style={s.filterRow}>
      <View style={s.filterChips}>
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              style={[s.chip, active && s.chipActive]}
              onPress={() => onFilter(f.id)}
              activeOpacity={0.8}
            >
              <Text style={[s.chipText, active && s.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={s.filterRight}>
        <TouchableOpacity style={s.rangePill} onPress={onCycleRange} activeOpacity={0.8}>
          <CalendarIcon size={14} />
          <Text style={s.rangePillText}>{RANGES[rangeIndex].label}</Text>
          <ChevronDownSmIcon size={13} />
        </TouchableOpacity>
        <View style={s.filterBtn}>
          <FilterIcon size={14} />
          <Text style={s.filterBtnText}>篩選</Text>
        </View>
      </View>
    </View>
  );
}

function LedgerRow({ event, isLast }: { event: LedgerEvent; isLast: boolean }) {
  const style = KIND_STYLE[event.kind];
  const sign = event.kind === 'redeem' ? '−' : '+';
  const unitLabel =
    event.unit === 'min'
      ? `分鐘${event.chipLabel === '時間儲蓄' ? '時間儲蓄' : ''}`
      : `枚${event.chipLabel === '成長幣' ? '成長幣' : ''}`;

  return (
    <View style={[s.row, !isLast && s.rowDivider]}>
      <View style={[s.rowIcon, { backgroundColor: style.tint }]}>
        <KindIcon kind={event.kind} size={16} />
      </View>
      <Text style={[s.rowAmount, { color: style.color }]} numberOfLines={1}>
        {sign}{event.amount} {unitLabel}
      </Text>
      <Text style={s.rowDesc} numberOfLines={1}>{event.desc}</Text>
      <Text style={s.rowMeta} numberOfLines={1}>{event.statusLabel} · {event.time}</Text>
      <View style={[s.rowChip, { backgroundColor: style.tint }]}>
        <Text style={[s.rowChipText, { color: style.color }]}>{event.chipLabel}</Text>
      </View>
      <Text style={s.rowDots}>⋯</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export default function ParentLedgerTablet() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

  const { childId, childName, allChildren, setSelectedChild } = useSelectedChild();
  const selectedChildName = childName || allChildren.find((c) => c.id === childId)?.nickname || '孩子';

  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [rangeIndex, setRangeIndex] = useState(0);

  const { balance, monthNet, timeSavingTotal, groups, loading, refresh } = useParentLedger(
    childId,
    filter,
    RANGES[rangeIndex].days,
  );

  useFocusEffect(
    useCallback(() => {
      if (childId) void refresh();
    }, [childId, refresh]),
  );

  const handleNavigateHome = useCallback(() => navigation.navigate('Dashboard' as never), [navigation]);
  const handleNavigateWeekly = useCallback(() => navigation.navigate('Weekly' as never), [navigation]);
  const handleNavigateManage = useCallback((section?: ManageSection | 'settings') => {
    if (section === 'settings') { navigation.navigate('ParentSettings'); return; }
    (navigation.navigate as (name: string, params?: object) => void)('Manage', {
      initialSection: section ?? 'history',
    });
  }, [navigation]);
  const handleAddChild = useCallback(() => navigation.navigate('AddChild'), [navigation]);

  if (width < 768) return null;

  return (
    <View style={webTabletScreen}>
      <View style={s.columns}>
        <ParentSidebar
          activeTab="manage"
          activeManageSection="history"
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
              <Text style={s.eyebrow}>帳本紀錄</Text>
              <Text style={s.title}>{selectedChildName}的成長帳本</Text>
              <Text style={s.subtitle}>清楚記錄每一份投入、回饋與兌換</Text>
            </View>
            <View style={s.headerNote}>
              <InfoIcon size={13} />
              <Text style={s.headerNoteText}>
                此頁僅記錄會影響成長幣、時間儲蓄或兌換的事件。
              </Text>
            </View>
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            <SummaryBar balance={balance} monthNet={monthNet} timeSaving={timeSavingTotal} />

            <FilterRow
              filter={filter}
              onFilter={setFilter}
              rangeIndex={rangeIndex}
              onCycleRange={() => setRangeIndex((i) => (i + 1) % RANGES.length)}
            />

            {loading ? (
              <View style={s.loaderBox}>
                <ActivityIndicator size="small" color={ParentColors.accent} />
              </View>
            ) : groups.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>這段期間沒有帳本紀錄</Text>
                <Text style={s.emptySub}>完成任務、兌換或家長調整後，事件會出現在這裡。</Text>
              </View>
            ) : (
              groups.map((g) => (
                <View key={g.dateKey} style={s.dayGroup}>
                  <View style={s.dayHead}>
                    <View style={s.dayDot} />
                    <Text style={s.dayDate}>{g.dateLabel}</Text>
                    <Text style={s.dayDow}>（{g.dowLabel}）</Text>
                    <View style={s.daySummary}>
                      {g.coinDelta !== 0 && (
                        <Text style={[s.daySummaryItem, { color: ParentColors.done }]}>
                          +{g.coinDelta} 枚
                        </Text>
                      )}
                      {g.minuteDelta !== 0 && (
                        <Text style={[s.daySummaryItem, { color: ParentColors.info }]}>
                          +{g.minuteDelta} 分鐘
                        </Text>
                      )}
                      <Text
                        style={[
                          s.daySummaryItem,
                          { color: g.redeemCount > 0 ? ParentColors.clay500 : ParentColors.fgMuted },
                        ]}
                      >
                        {g.redeemCount} 次兌換
                      </Text>
                    </View>
                  </View>

                  <View style={s.dayCard}>
                    {g.events.map((e, i) => (
                      <LedgerRow key={e.id} event={e} isLast={i === g.events.length - 1} />
                    ))}
                  </View>
                </View>
              ))
            )}

            <View style={s.footerNote}>
              <InfoIcon size={13} />
              <Text style={s.footerNoteText}>
                只記錄會影響成長幣、時間儲蓄或兌換的事件；生活紀錄保留在任務與週報中。
              </Text>
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: ParentSpacing[6],
    paddingHorizontal: ParentSpacing[8],
    paddingVertical: ParentSpacing[5],
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  headerText: {
    gap: 3,
    flexShrink: 1,
  },
  eyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgMuted,
    letterSpacing: 0.14,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h1,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  subtitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },
  headerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 280,
    paddingTop: 4,
    flexShrink: 0,
  },
  headerNoteText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    lineHeight: 17,
    flexShrink: 1,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    padding: ParentSpacing[8],
    paddingTop: ParentSpacing[5],
    paddingBottom: ParentSpacing[10],
    gap: ParentSpacing[5],
  },

  // Summary bar
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.lg,
    paddingVertical: ParentSpacing[4],
    paddingHorizontal: ParentSpacing[6],
  },
  summaryCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  summaryLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },
  summaryNum: {
    fontFamily: ParentFonts.display,
    fontSize: 24,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.fgPrimary,
    marginLeft: 'auto',
  },
  summaryUnit: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  summaryDivider: {
    width: 1,
    height: 30,
    backgroundColor: ParentColors.borderSoft,
    marginHorizontal: ParentSpacing[5],
  },
  trendDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: ParentColors.tintLeaf,
    alignSelf: 'center',
  },

  // Filter row
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: ParentSpacing[3],
    flexWrap: 'wrap',
  },
  filterChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[2],
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  chipActive: {
    backgroundColor: ParentColors.accent,
    borderColor: ParentColors.accent,
  },
  chipText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  chipTextActive: {
    color: ParentColors.onSidebar,
  },
  filterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
  },
  rangePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[2],
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  rangePillText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[2],
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  filterBtnText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },

  // Day group
  dayGroup: {
    gap: ParentSpacing[3],
  },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
    paddingLeft: 2,
  },
  dayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ParentColors.fgMuted,
  },
  dayDate: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.lg,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  dayDow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },
  daySummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[3],
    marginLeft: ParentSpacing[3],
  },
  daySummaryItem: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
  },
  dayCard: {
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.lg,
    overflow: 'hidden',
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[4],
    paddingHorizontal: ParentSpacing[5],
    paddingVertical: ParentSpacing[4],
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowAmount: {
    width: 128,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pBody,
    fontWeight: ParentFontWeights.bold,
    flexShrink: 0,
  },
  rowDesc: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pBody,
    color: ParentColors.fgPrimary,
    minWidth: 0,
  },
  rowMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
    flexShrink: 0,
  },
  rowChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: ParentRadii.pill,
    flexShrink: 0,
  },
  rowChipText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
  },
  rowDots: {
    fontFamily: ParentFonts.body,
    fontSize: 18,
    color: ParentColors.ink300,
    width: 20,
    textAlign: 'center',
    flexShrink: 0,
  },

  // Loader / empty
  loaderBox: {
    paddingVertical: ParentSpacing[10],
    alignItems: 'center',
  },
  emptyBox: {
    paddingVertical: ParentSpacing[10],
    alignItems: 'center',
    gap: 6,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.lg,
  },
  emptyText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pBody,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  emptySub: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },

  // Footer note
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: ParentSpacing[5],
    paddingVertical: ParentSpacing[4],
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderRadius: ParentRadii.md,
  },
  footerNoteText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    flexShrink: 1,
  },
});
