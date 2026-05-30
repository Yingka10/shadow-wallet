import React, { useState, useCallback } from 'react';
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
import { supabase } from '../../lib/supabase';
import {
  ParentColors,
  ParentFontSizes,
  ParentFontWeights,
  ParentSpacing,
  ParentRadii,
  ParentShadows,
  ParentFonts,
} from '../../constants/parentTheme';
import { useParentTaskList, type TaskListItem } from '../../hooks/useParentTaskList';
import type { TaskCategory } from '../../types/database';

// ---------------------------------------------------------------------------
// Small SVG icons
// ---------------------------------------------------------------------------

function SunIcon({ size = 14, color = ParentColors.ink700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth={1.8} />
      <Path
        d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke={color} strokeWidth={1.8} strokeLinecap="round"
      />
    </Svg>
  );
}

function HourglassSmIcon({ size = 14, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 2h14M5 22h14M6 2c0 7 6 8 6 10s-6 3-6 10M18 2c0 7-6 8-6 10s6 3 6 10"
        stroke={color} strokeWidth={1.8} strokeLinecap="round"
      />
    </Svg>
  );
}

function SparkleIcon({ size = 14, color = ParentColors.clay500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z"
        stroke={color} strokeWidth={1.8} strokeLinejoin="round"
      />
    </Svg>
  );
}

function FlagIcon({ size = 14, color = ParentColors.plum500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 21V4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M5 4h11l-2 4 2 4H5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CheckSmIcon({ size = 10, color = ParentColors.success }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12l5 5L20 7" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChevronRightIcon({ size = 14, color = ParentColors.ink300 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CoinGlyph({ size = 13 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" fill="#F5B800" />
      <Circle cx="12" cy="12" r="7" fill="#D69A00" fillOpacity={0.3} />
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
  icon: (props: { size?: number; color?: string }) => React.ReactElement;
}> = {
  A: { label: '生活自理',  tint: '#EAE4D7', fg: ParentColors.ink700,  icon: (p) => <SunIcon {...p} /> },
  B: { label: '家庭本分',  tint: '#EAF0EE', fg: ParentColors.teal500, icon: (p) => <HourglassSmIcon {...p} /> },
  C: { label: '超出本分',  tint: '#FAF1E7', fg: ParentColors.clay500, icon: (p) => <SparkleIcon {...p} /> },
  D: { label: '成長里程碑', tint: '#F4EBF0', fg: ParentColors.plum500, icon: (p) => <FlagIcon {...p} /> },
};

const ALL_CATS: TaskCategory[] = ['A', 'B', 'C', 'D'];

// ---------------------------------------------------------------------------
// FilterChip
// ---------------------------------------------------------------------------

function FilterChip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
      <View style={[styles.chipBadge, active && styles.chipBadgeActive]}>
        <Text style={[styles.chipBadgeText, active && styles.chipBadgeTextActive]}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// DifficultyDots
// ---------------------------------------------------------------------------

function DifficultyDots({ level }: { level: number }) {
  const label = level === 1 ? '簡單' : level === 2 ? '中等' : '困難';
  return (
    <View style={styles.diffRow}>
      {[1, 2, 3].map(n => (
        <View
          key={n}
          style={[styles.diffDot, n <= level ? styles.diffDotFilled : styles.diffDotEmpty]}
        />
      ))}
      <Text style={styles.diffLabel}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// TaskCard
// ---------------------------------------------------------------------------

function TaskCard({ task, isTodayDone, onPress }: { task: TaskListItem; isTodayDone: boolean; onPress: () => void }) {
  const meta = TASK_CAT_META[task.cat];
  return (
    <TouchableOpacity style={styles.taskCard} activeOpacity={0.7} onPress={onPress}>
      <View style={[styles.taskCatIcon, { backgroundColor: meta.tint }]}>
        {meta.icon({ size: 18, color: meta.fg })}
      </View>

      <View style={styles.taskInfo}>
        <Text style={styles.taskName} numberOfLines={1}>{task.name}</Text>
        <View style={styles.taskMetaRow}>
          <Text style={styles.taskFreq}>{task.freqLabel}</Text>
          <Text style={styles.taskMetaDot}>·</Text>
          <DifficultyDots level={task.difficulty} />
          {isTodayDone && (
            <View style={styles.todayPill}>
              <CheckSmIcon />
              <Text style={styles.todayPillText}>今日</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.taskRight}>
        {task.reward?.kind === 'coins' && (
          <View style={styles.rewardRow}>
            <Text style={styles.rewardCoins}>+{task.reward.amount}</Text>
            <CoinGlyph size={12} />
          </View>
        )}
        {task.reward?.kind === 'time' && (
          <Text style={styles.rewardTime}>
            +{task.reward.amount}
            <Text style={styles.rewardTimeSuffix}> 分</Text>
          </Text>
        )}
        {!task.reward && task.isLongTerm && (
          <Text style={styles.rewardMilestone}>進度任務</Text>
        )}
        <ChevronRightIcon size={13} />
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// SectionHead
// ---------------------------------------------------------------------------

function SectionHead({ cat }: { cat: TaskCategory }) {
  const meta = TASK_CAT_META[cat];
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionEyebrow}>類別 {cat}</Text>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>{meta.label}</Text>
        {cat === 'B' && (
          <View style={styles.sectionPillTeal}>
            <HourglassSmIcon size={10} color={ParentColors.teal500} />
            <Text style={styles.sectionPillTealText}>獎勵：時間</Text>
          </View>
        )}
        {cat === 'D' && (
          <View style={styles.sectionPillPlum}>
            <Text style={styles.sectionPillPlumText}>獎勵：進度</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Long-term goal row data type
// ---------------------------------------------------------------------------

type LongTermGoalRow = {
  id: string;
  task_id: string;
  current_day: number;
  total_days: number | null;
  tasks: { id: string; name: string } | null;
};

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ParentTaskListScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { childId } = useSelectedChild();

  const { child, tasks, todayCompletedIds, loading, error, refresh } = useParentTaskList(childId);
  const [activeFilter, setActiveFilter] = useState<TaskCategory | 'all'>('all');

  const [longTermGoals, setLongTermGoals] = useState<LongTermGoalRow[]>([]);
  const [ltLoading, setLtLoading] = useState(true);

  const fetchLongTermGoals = useCallback(async () => {
    if (!childId) return;
    setLtLoading(true);
    try {
      const { data } = await supabase
        .from('long_term_goals')
        .select('id, task_id, current_day, total_days, tasks(id, name)')
        .eq('child_id', childId)
        .eq('status', 'active')
        .order('started_at', { ascending: false });
      setLongTermGoals((data ?? []) as unknown as LongTermGoalRow[]);
    } catch (err) {
      console.error('[ParentTaskListScreen] fetchLongTermGoals error:', err);
    } finally {
      setLtLoading(false);
    }
  }, [childId]);

  useFocusEffect(
    useCallback(() => {
      void fetchLongTermGoals();
      void refresh();
    }, [fetchLongTermGoals, refresh]),
  );

  // Separate long-term tasks from regular tasks
  const regularTasks = tasks.filter(t => !t.isLongTerm);
  const visibleCats = ALL_CATS.filter(cat => regularTasks.some(t => t.cat === cat));
  const filteredTasks = activeFilter === 'all' ? regularTasks : regularTasks.filter(t => t.cat === activeFilter);
  const groups = (activeFilter === 'all' ? visibleCats : [activeFilter as TaskCategory])
    .map(cat => ({ cat, items: filteredTasks.filter(t => t.cat === cat) }))
    .filter(g => g.items.length > 0);

  if (loading && child === null) {
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
      {/* ── 長期目標 section ──────────────────────────────────── */}
      <View style={styles.ltSection}>
        <View style={styles.ltSectionHeader}>
          <Text style={styles.ltSectionTitle}>長期目標</Text>
          <TouchableOpacity
            style={styles.ltAddBtn}
            onPress={() => navigation.navigate('ParentLongTermCreate', { childId })}
            activeOpacity={0.8}
          >
            <Text style={styles.ltAddBtnText}>＋ 新增</Text>
          </TouchableOpacity>
        </View>

        {ltLoading && longTermGoals.length === 0 ? (
          <ActivityIndicator color={ParentColors.teal500} style={styles.ltLoader} />
        ) : longTermGoals.length === 0 ? (
          <View style={styles.ltEmpty}>
            <Text style={styles.ltEmptyText}>
              還沒有長期目標，點右側「＋ 新增」建立第一個
            </Text>
          </View>
        ) : (
          longTermGoals.map((goal, idx) => {
            const taskName = goal.tasks?.name ?? '（已刪除任務）';
            const total = goal.total_days ?? 30;
            const pct = Math.min(Math.round((goal.current_day / total) * 100), 100);
            return (
              <TouchableOpacity
                key={goal.id}
                style={[styles.ltGoalRow, idx > 0 && styles.ltGoalRowBorder]}
                onPress={() =>
                  navigation.navigate('ParentTaskDetail', {
                    taskId: goal.task_id,
                    childId,
                    taskName,
                  })
                }
                activeOpacity={0.75}
              >
                <View style={styles.ltGoalBody}>
                  <View style={styles.ltGoalTopRow}>
                    <Text style={styles.ltGoalName} numberOfLines={1}>{taskName}</Text>
                    <Text style={styles.ltGoalDays}>
                      第 {goal.current_day} 天 / {total} 天
                    </Text>
                  </View>
                  <View style={styles.ltProgressTrack}>
                    <View style={[styles.ltProgressFill, { width: `${pct}%` as any }]} />
                  </View>
                </View>
                <ChevronRightIcon size={14} />
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* ── Header ────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>一般任務</Text>
        <Text style={styles.title}>{child?.nickname ?? ''}的任務清單</Text>
        <Text style={styles.meta}>
          共 <Text style={styles.metaNum}>{regularTasks.length}</Text> 項，按類別分組
        </Text>
      </View>

      {/* Filter chips — horizontal scroll, bleed to screen edges */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        <FilterChip
          label="全部"
          count={regularTasks.length}
          active={activeFilter === 'all'}
          onPress={() => setActiveFilter('all')}
        />
        {visibleCats.map(cat => (
          <FilterChip
            key={cat}
            label={TASK_CAT_META[cat].label}
            count={regularTasks.filter(t => t.cat === cat).length}
            active={activeFilter === cat}
            onPress={() => setActiveFilter(cat)}
          />
        ))}
      </ScrollView>

      {/* Task groups */}
      {groups.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>目前沒有任務</Text>
        </View>
      ) : (
        groups.map(g => (
          <View key={g.cat} style={styles.group}>
            <SectionHead cat={g.cat} />
            <View style={styles.taskList}>
              {g.items.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isTodayDone={todayCompletedIds.has(task.id)}
                  onPress={() => navigation.navigate('ParentTaskDetail', { taskId: task.id, childId, taskName: task.name })}
                />
              ))}
            </View>
          </View>
        ))
      )}
    </ScrollView>
    {/* Floating Action Button */}
    <TouchableOpacity
      style={styles.fab}
      onPress={() => navigation.navigate('ParentTaskCreate')}
      activeOpacity={0.8}
    >
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path d="M12 5v14M5 12h14" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" />
      </Svg>
    </TouchableOpacity>
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
    paddingBottom: 110,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.bgCanvas,
  },
  errorText: {
    fontSize: ParentFontSizes.pBody,
    color: ParentColors.error,
    textAlign: 'center',
    paddingHorizontal: 32,
  },

  // ── Long-term goals section ───────────────────────────────────────────────
  ltSection: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: ParentRadii.lg,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    marginTop: 14,
    marginBottom: 6,
    overflow: 'hidden',
    ...ParentShadows.card,
  },
  ltSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  ltSectionTitle: {
    fontSize: ParentFontSizes.pBody,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },
  ltAddBtn: {
    backgroundColor: ParentColors.teal50,
    borderRadius: ParentRadii.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  ltAddBtnText: {
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.teal500,
  },
  ltLoader: {
    marginVertical: 16,
  },
  ltEmpty: {
    padding: 16,
  },
  ltEmptyText: {
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
    lineHeight: 18,
  },
  ltGoalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  ltGoalRowBorder: {
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
  },
  ltGoalBody: {
    flex: 1,
    minWidth: 0,
  },
  ltGoalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  ltGoalName: {
    flex: 1,
    fontSize: ParentFontSizes.pBody,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    marginRight: 8,
  },
  ltGoalDays: {
    fontSize: 12,
    color: ParentColors.fgMuted,
    flexShrink: 0,
  },
  ltProgressTrack: {
    height: 6,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderRadius: ParentRadii.pill,
    overflow: 'hidden',
  },
  ltProgressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: ParentColors.teal400,
    borderRadius: ParentRadii.pill,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 4,
  },
  eyebrow: {
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: ParentFontSizes.display,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },
  meta: {
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
    marginTop: 6,
  },
  metaNum: {
    color: ParentColors.fgPrimary,
    fontWeight: ParentFontWeights.semi,
  },

  // ── Filter chips ──────────────────────────────────────────────────────────
  chipsScroll: {
    marginHorizontal: -ParentSpacing.gutter,
  },
  chipsContent: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: ParentSpacing.gutter,
    paddingTop: 6,
    paddingBottom: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  chipActive: {
    backgroundColor: ParentColors.ink900,
    borderWidth: 0,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.ink700,
  },
  chipLabelActive: {
    color: '#FFFFFF',
  },
  chipBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  chipBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  chipBadgeText: {
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.ink500,
  },
  chipBadgeTextActive: {
    color: '#FFFFFF',
  },

  // ── Groups ────────────────────────────────────────────────────────────────
  group: {
    marginBottom: 22,
  },
  sectionHead: {
    marginBottom: 12,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },
  sectionPillTeal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.teal50,
  },
  sectionPillTealText: {
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.teal500,
  },
  sectionPillPlum: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: ParentRadii.pill,
    backgroundColor: '#F4EBF0',
  },
  sectionPillPlumText: {
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.plum500,
  },
  taskList: {
    gap: 10,
  },

  // ── Task card ─────────────────────────────────────────────────────────────
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    ...ParentShadows.card,
  },
  taskCatIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  taskInfo: {
    flex: 1,
    minWidth: 0,
  },
  taskName: {
    fontSize: ParentFontSizes.pBody,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    marginBottom: 3,
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  taskFreq: {
    fontSize: 12,
    color: ParentColors.fgMuted,
  },
  taskMetaDot: {
    fontSize: 12,
    color: ParentColors.ink300,
  },

  // ── Difficulty dots ───────────────────────────────────────────────────────
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  diffDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  diffDotFilled: {
    backgroundColor: ParentColors.teal400,
  },
  diffDotEmpty: {
    backgroundColor: ParentColors.ivory300,
  },
  diffLabel: {
    fontSize: 11,
    color: ParentColors.fgMuted,
    marginLeft: 2,
  },

  // ── Today pill ────────────────────────────────────────────────────────────
  todayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: ParentRadii.pill,
    backgroundColor: '#E8F2E6',
    marginLeft: 4,
  },
  todayPillText: {
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.success,
  },

  // ── Reward + right col ────────────────────────────────────────────────────
  taskRight: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  rewardCoins: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: '#A87800',
  },
  rewardTime: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.teal500,
  },
  rewardTimeSuffix: {
    fontSize: 10,
    color: ParentColors.fgMuted,
    fontWeight: ParentFontWeights.regular,
  },
  rewardMilestone: {
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.plum500,
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: ParentFontSizes.pBody,
    color: ParentColors.fgMuted,
  },
  
  // ── FAB ───────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ParentColors.teal500,
    alignItems: 'center',
    justifyContent: 'center',
    ...ParentShadows.elev,
  },
});
