// Shadow Wallet · Parent Tablet — Tab 3 成長紀錄
// 週報 tab: live data from useParentWeeklyReport — no hook or query changes.
// 月報 / 紀錄 tabs: static "即將推出" placeholder + TODO.
// Only renders when width >= 768 (returns null otherwise).

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelectedChild } from '../../../context/SelectedChildContext';
import {
  useParentWeeklyReport,
  type WeeklyActivityBar,
  type WeeklySuggestion,
  type GrowthMoment,
  type LongTermGoalProgress,
} from '../../../hooks/useParentWeeklyReport';
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

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

type ReportView = 'weekly' | 'monthly' | 'history';

const VIEWS: { id: ReportView; label: string; sub: string }[] = [
  { id: 'weekly',  label: '週報', sub: '本週' },
  { id: 'monthly', label: '月報', sub: '本月' },
  { id: 'history', label: '紀錄', sub: '修改與提案' },
];

const CAT_META: Record<TaskCategory, { label: string; color: string; tint: string }> = {
  A: { label: '基本自理', color: ParentColors.ink700,  tint: '#EAE4D7' },
  B: { label: '家庭本分', color: ParentColors.teal500, tint: '#EAF0EE' },
  C: { label: '貢獻',     color: ParentColors.clay500, tint: '#FAF1E7' },
  D: { label: '成長',     color: ParentColors.plum500, tint: '#F4EBF0' },
};

const GOAL_TYPE_META: Record<string, { label: string; color: string; tint: string }> = {
  habit:          { label: '習慣', color: ParentColors.teal500,  tint: ParentColors.teal50 },
  skill:          { label: '技能', color: ParentColors.plum500,  tint: '#F4EBF0' },
  challenge:      { label: '挑戰', color: ParentColors.clay500,  tint: '#FAF1E7' },
  responsibility: { label: '責任', color: ParentColors.sage500,  tint: '#EFF4EC' },
};
const GOAL_TYPE_FALLBACK = { label: '長期', color: ParentColors.fgMuted, tint: ParentColors.bgSurfaceWarm };

// ─────────────────────────────────────────────────────────────────────────────
// SVG icons
// ─────────────────────────────────────────────────────────────────────────────

function ChevLeftIcon({ size = 14, color = ParentColors.fgPrimary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChevRightIcon({ size = 14, color = ParentColors.fgPrimary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function RefreshIcon({ size = 13, color = ParentColors.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M21 3v5h-5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function SparkleIcon({ size = 12, color = ParentColors.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z"
        stroke={color} strokeWidth={1.8} strokeLinejoin="round"
      />
    </Svg>
  );
}

function PlusIcon({ size = 11, color = ParentColors.success }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

function MinusIcon({ size = 11, color = ParentColors.error }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12h14" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function CompletionRing({ pct }: { pct: number }) {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - pct / 100);
  return (
    <Svg width={64} height={64} viewBox="0 0 64 64">
      <Circle
        cx={32} cy={32} r={r}
        fill="none"
        stroke={ParentColors.borderMedium}
        strokeWidth={5}
      />
      <Circle
        cx={32} cy={32} r={r}
        fill="none"
        stroke={ParentColors.accent}
        strokeWidth={5}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform="rotate(-90 32 32)"
      />
    </Svg>
  );
}

function CategoryProgressRow({ bar }: { bar: WeeklyActivityBar }) {
  const meta = CAT_META[bar.cat];
  const pct = bar.total > 0 ? Math.round((bar.done / bar.total) * 100) : 0;
  return (
    <View style={s.catRow}>
      <View style={s.catLabelRow}>
        <View style={[s.catBadge, { backgroundColor: meta.color }]}>
          <Text style={s.catBadgeLetter}>{bar.cat}</Text>
        </View>
        <Text style={s.catLabel}>{meta.label}</Text>
        <View style={s.spacer} />
        <Text style={s.catCount}>
          {bar.done}
          <Text style={s.catCountSub}> / {bar.total}</Text>
        </Text>
        <Text style={s.catPct}>{pct}%</Text>
      </View>
      <View style={[s.progressTrack, { backgroundColor: meta.tint }]}>
        <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: meta.color }]} />
      </View>
    </View>
  );
}

function CoinDeltaRow({ tone, label, amount, note }: {
  tone: 'in' | 'out';
  label: string;
  amount: number;
  note: string;
}) {
  const isIn = tone === 'in';
  return (
    <View style={[s.coinDeltaRow, isIn ? s.coinDeltaIn : s.coinDeltaOut]}>
      <View style={s.coinDeltaIconWrap}>
        {isIn ? <PlusIcon /> : <MinusIcon />}
      </View>
      <View style={s.spacer}>
        <Text style={s.coinDeltaLabel}>{label}</Text>
        <Text style={s.coinDeltaNote} numberOfLines={1}>{note}</Text>
      </View>
      <Text style={[s.coinDeltaAmount, { color: isIn ? ParentColors.success : ParentColors.error }]}>
        {isIn ? '+' : '-'}{amount}
      </Text>
    </View>
  );
}

function MomentItem({ moment }: { moment: GrowthMoment }) {
  return (
    <View style={s.momentItem}>
      <Text style={s.momentDate}>{moment.dateLabel}</Text>
      <Text style={s.momentTitle}>{moment.title}</Text>
      {moment.body ? <Text style={s.momentBody}>{moment.body}</Text> : null}
    </View>
  );
}

function ObservationCard({ sg }: { sg: WeeklySuggestion }) {
  return (
    <View style={s.obsCard}>
      <Text style={s.obsBody}>{sg.body}</Text>
      {sg.actionLabel ? (
        <View style={s.obsActionRow}>
          <SparkleIcon size={10} color={ParentColors.accent} />
          <Text style={s.obsActionLabel}>{sg.actionLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

function LongTermGoalCard({ goal }: { goal: LongTermGoalProgress }) {
  const meta = GOAL_TYPE_META[goal.goalType] ?? GOAL_TYPE_FALLBACK;
  const hasProgress = goal.target > 0;
  const pct = hasProgress ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;
  const diff = hasProgress ? goal.target - goal.current : 0;

  return (
    <View style={s.ltgGoalCard}>
      <View style={[s.ltgGoalAccent, { backgroundColor: meta.color }]} />
      <View style={s.ltgGoalInner}>
        {/* Header: type chip + task name + no-progress badge */}
        <View style={s.ltgGoalHeader}>
          <View style={[s.ltgTypePill, { backgroundColor: meta.tint }]}>
            <Text style={[s.ltgTypePillLabel, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={s.ltgTaskName} numberOfLines={1}>{goal.taskName}</Text>
          {goal.noProgressThisWeek && (
            <View style={s.ltgNoProgressBadge}>
              <Text style={s.ltgNoProgressBadgeText}>本週無進展</Text>
            </View>
          )}
        </View>

        {/* Progress section or responsibility placeholder */}
        {hasProgress ? (
          <View style={s.ltgProgressSection}>
            <View style={s.ltgScoreRow}>
              <Text style={s.ltgScore}>
                {goal.current}
                <Text style={s.ltgScoreSub}> / {goal.target} {goal.unit}</Text>
              </Text>
              <Text style={s.ltgPct}>{pct}%</Text>
              {diff > 0 && (
                <Text style={s.ltgScoreDiff}>差 {diff} {goal.unit}</Text>
              )}
            </View>
            <View style={[s.ltgProgressTrack, { backgroundColor: meta.tint }]}>
              <View style={[s.ltgProgressFill, { width: `${pct}%`, backgroundColor: meta.color }]} />
            </View>
          </View>
        ) : (
          <Text style={s.ltgResponsibilityText}>持續進行中</Text>
        )}

        {/* Milestone footer */}
        <View style={s.ltgMilestoneRow}>
          <Text style={s.ltgMilestoneLabel} numberOfLines={1}>
            {goal.nextMilestone != null ? `下一里程碑：${goal.nextMilestone}` : '無階段里程碑'}
          </Text>
          {goal.milestoneReward != null && (
            <View style={[s.ltgRewardBadge, { backgroundColor: meta.tint }]}>
              <Text style={[s.ltgRewardBadgeText, { color: meta.color }]}>+{goal.milestoneReward}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// TODO: implement 月報 view using monthly_reports data
// TODO: implement 紀錄 view (coin adjustments, parent marks, proposal audit log)
function PlaceholderView({ title }: { title: string }) {
  return (
    <View style={s.placeholder}>
      <Text style={s.placeholderTitle}>{title}</Text>
      <Text style={s.placeholderSub}>即將推出</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ParentWeeklyTablet() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { childId, allChildren, setSelectedChild, loadingChildren } = useSelectedChild();
  const [view, setView] = useState<ReportView>('weekly');
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [aiRefreshError, setAiRefreshError] = useState<string | null>(null);

  const {
    childName, weekLabel, weekRange,
    totalTasks, checkIns,
    aiInsight, aiReady,
    activity, coinFlow,
    suggestions, moments, affirmations, longTermGoals,
    loading, error,
    canGoBack, canGoForward,
    goBack, goForward,
    refresh, requestAiRefresh,
  } = useParentWeeklyReport(childId);

  useFocusEffect(
    useCallback(() => { refresh(); }, [refresh]),
  );

  const handleAiRefresh = useCallback(async () => {
    setAiRefreshing(true);
    setAiRefreshError(null);
    try {
      await requestAiRefresh();
    } catch (e) {
      console.error('[handleAiRefresh] error:', e);
      if (e != null && typeof e === 'object' && 'context' in e) {
        void (e as { context: Response }).context.json().then(
          (b: unknown) => console.error('[handleAiRefresh] body:', JSON.stringify(b)),
        );
      }
      setAiRefreshError('AI 生成失敗，請稍後再試');
    } finally {
      setAiRefreshing(false);
    }
  }, [requestAiRefresh]);

  if (width < 768) return null;
  if (loadingChildren || !childId) {
    return (
      <View style={s.screenLoadingBox}>
        <ActivityIndicator size="large" color={ParentColors.accent} />
      </View>
    );
  }

  const overallDone  = activity.reduce((sum, b) => sum + b.done, 0);
  const overallTotal = activity.reduce((sum, b) => sum + b.total, 0);
  const overallPct   = overallTotal > 0 ? Math.round((overallDone / overallTotal) * 100) : 0;
  const netCoin      = coinFlow.income - coinFlow.spend;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>Tab 3 · 成長紀錄</Text>
          <View style={s.titleRow}>
            <Text style={s.pageTitle}>觀察與長期紀錄</Text>
            {view === 'weekly' && (
              <Text style={s.titleMeta}>本週 · {weekRange}</Text>
            )}
          </View>
        </View>

        <View style={s.headerControls}>
          {allChildren.length > 1 && (
            <View style={s.segPill}>
              {allChildren.map(c => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setSelectedChild(c)}
                  style={[s.segItem, c.id === childId && s.segItemActive]}
                >
                  <Text style={[s.segLabel, c.id === childId && s.segLabelActive]}>
                    {c.nickname}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={s.segPill}>
            {VIEWS.map(v => (
              <TouchableOpacity
                key={v.id}
                onPress={() => setView(v.id)}
                style={[s.segItem, v.id === view && s.segItemPrimary]}
              >
                <Text style={[s.segLabel, v.id === view && s.segLabelPrimary]}>
                  {v.label}
                  <Text style={s.segSub}> {v.sub}</Text>
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* ── Weekly view ──────────────────────────────────────────────────── */}
      {view === 'weekly' && (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 28 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Week navigation */}
          <View style={s.weekNav}>
            <TouchableOpacity
              onPress={goBack}
              disabled={!canGoBack}
              style={[s.weekNavBtn, !canGoBack && s.weekNavBtnDisabled]}
            >
              <ChevLeftIcon color={canGoBack ? ParentColors.fgPrimary : ParentColors.ink300} />
            </TouchableOpacity>

            <Text style={s.weekNavLabel}>{weekLabel} · {weekRange}</Text>

            <TouchableOpacity
              onPress={goForward}
              disabled={!canGoForward}
              style={[s.weekNavBtn, !canGoForward && s.weekNavBtnDisabled]}
            >
              <ChevRightIcon color={canGoForward ? ParentColors.fgPrimary : ParentColors.ink300} />
            </TouchableOpacity>

            <View style={s.spacer} />

            <TouchableOpacity onPress={refresh} style={s.refreshBtn}>
              <RefreshIcon />
              <Text style={s.refreshLabel}>重新整理</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleAiRefresh}
              disabled={aiRefreshing}
              style={[s.aiRefreshNavBtn, aiRefreshing && s.aiRefreshNavBtnLoading]}
            >
              {aiRefreshing
                ? <ActivityIndicator size="small" color={ParentColors.accent} />
                : <SparkleIcon />}
              <Text style={s.aiRefreshNavLabel}>
                {aiRefreshing ? '生成中…' : '重新整理 AI'}
              </Text>
            </TouchableOpacity>
          </View>

          {aiRefreshError && (
            <View style={s.aiRefreshErrorRow}>
              <Text style={s.aiRefreshErrorText}>{aiRefreshError}</Text>
            </View>
          )}

          {/* Loading */}
          {loading && (
            <View style={s.centerBox}>
              <ActivityIndicator size="large" color={ParentColors.accent} />
            </View>
          )}

          {/* Error */}
          {!loading && error && (
            <View style={s.centerBox}>
              <Text style={s.errorText}>{error}</Text>
              <TouchableOpacity onPress={refresh} style={s.retryBtn}>
                <Text style={s.retryLabel}>重試</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Content */}
          {!loading && !error && (
            <>
              {/* AI 編輯室札記 */}
              <View style={s.card}>
                <View style={s.accentBar} />
                <View style={s.cardInner}>
                  <View style={s.aiEyebrowRow}>
                    <SparkleIcon />
                    <Text style={s.aiEyebrow}>AI · 編輯室札記</Text>
                    <TouchableOpacity
                      onPress={handleAiRefresh}
                      disabled={aiRefreshing}
                      style={[s.aiRefreshBtn, aiRefreshing && s.aiRefreshBtnLoading]}
                    >
                      {aiRefreshing
                        ? <ActivityIndicator size="small" color={ParentColors.accent} />
                        : <RefreshIcon size={11} />}
                      <Text style={s.aiRefreshBtnLabel}>
                        {aiRefreshing ? '生成中' : aiReady ? '重新生成' : '生成報告'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.aiBody}>{aiInsight}</Text>
                  <View style={s.aiFooter}>
                    <Text style={s.aiFooterText}>{childName} · 週報 · {weekRange}</Text>
                    <Text style={s.aiFooterText}>AI 觀察，供參考</Text>
                  </View>
                </View>
              </View>

              {/* 本週數據 */}
              <View style={s.card}>
                <View style={s.statsHeaderRow}>
                  <View>
                    <Text style={s.eyebrow}>本週數據</Text>
                    <Text style={s.sectionTitle}>任務與幣值</Text>
                  </View>
                  <Text style={s.statsMeta}>
                    完成 {overallDone} / {overallTotal} 件 · 結餘 {netCoin >= 0 ? '+' : ''}{netCoin} 幣
                  </Text>
                </View>

                <View style={s.statsGrid}>
                  {/* Col 1: overall completion */}
                  <View style={s.statsColLeft}>
                    <Text style={s.colEyebrow}>整體完成率</Text>
                    <View style={s.ringRow}>
                      <CompletionRing pct={overallPct} />
                      <View>
                        <Text style={s.ringPct}>{overallPct}%</Text>
                        <Text style={s.ringMeta}>{overallDone} / {overallTotal} 件</Text>
                      </View>
                    </View>
                    <View style={s.checkInsRow}>
                      <Text style={s.checkInsNum}>{checkIns}</Text>
                      <Text style={s.checkInsMeta}>次打卡 · {totalTasks} 個任務</Text>
                    </View>
                  </View>

                  {/* Col 2: ABCD breakdown */}
                  <View style={[s.statsCol, s.statsColBorder]}>
                    <Text style={s.colEyebrow}>ABCD 分類</Text>
                    <View style={s.catList}>
                      {activity.map(bar => (
                        <CategoryProgressRow key={bar.cat} bar={bar} />
                      ))}
                    </View>
                  </View>

                  {/* Col 3: coin flow */}
                  <View style={[s.statsCol, s.statsColBorder]}>
                    <Text style={s.colEyebrow}>幣值收支</Text>
                    <View style={s.coinNetRow}>
                      <Text style={[s.coinNet, { color: netCoin >= 0 ? ParentColors.success : ParentColors.error }]}>
                        {netCoin >= 0 ? '+' : ''}{netCoin}
                      </Text>
                      <Text style={s.coinNetMeta}>幣 · 本週結餘</Text>
                    </View>
                    <View style={s.coinRows}>
                      <CoinDeltaRow
                        tone="in"
                        label="收入"
                        amount={coinFlow.income}
                        note={`任務獎勵 × ${coinFlow.incomeFrom}`}
                      />
                      <CoinDeltaRow
                        tone="out"
                        label="支出"
                        amount={coinFlow.spend}
                        note={`兌換 × ${coinFlow.spendFrom}`}
                      />
                    </View>
                  </View>
                </View>
              </View>

              {/* 長期任務進展 */}
              <View style={s.card}>
                <View style={s.statsHeaderRow}>
                  <View>
                    <Text style={s.eyebrow}>持續進行</Text>
                    <Text style={s.sectionTitle}>長期任務進展</Text>
                  </View>
                  <Text style={s.statsMeta}>
                    {longTermGoals.length > 0 ? `${longTermGoals.length} 項進行中` : ''}
                  </Text>
                </View>
                {longTermGoals.length === 0 ? (
                  <View style={s.ltgEmpty}>
                    <Text style={s.ltgEmptyText}>目前沒有進行中的長期任務</Text>
                  </View>
                ) : (
                  <View style={s.ltgList}>
                    {longTermGoals.map(goal => (
                      <LongTermGoalCard key={goal.id} goal={goal} />
                    ))}
                  </View>
                )}
              </View>

              {/* 本週觀察 — always visible, pending state when AI not ready */}
              <View style={s.card}>
                <View style={s.statsHeaderRow}>
                  <View>
                    <Text style={s.eyebrow}>值得注意的模式</Text>
                    <Text style={s.sectionTitle}>本週觀察</Text>
                  </View>
                  <Text style={s.statsMeta}>
                    {aiReady && suggestions.length > 0
                      ? `${suggestions.length} 項 · 每項附建議行動`
                      : 'AI 生成中'}
                  </Text>
                </View>
                {!aiReady && (
                  <View style={s.obsPending}>
                    <Text style={s.obsPendingText}>
                      AI 觀察在週日深夜自動生成，或點擊「重新整理 AI」立即生成。
                    </Text>
                  </View>
                )}
                {aiReady && suggestions.length === 0 && (
                  <View style={s.obsPending}>
                    <Text style={s.obsPendingText}>本週節奏穩定，沒有需要特別關注的模式。</Text>
                  </View>
                )}
                {aiReady && suggestions.length > 0 && (
                  <View style={s.obsList}>
                    {suggestions.map((sg, i) => (
                      <ObservationCard key={i} sg={sg} />
                    ))}
                  </View>
                )}
              </View>

              {/* 鼓勵話語 — always shown (pending affirmations or AI-generated) */}
              {affirmations.length > 0 && (
                <View style={s.affirmCard}>
                  <View style={s.affirmHeader}>
                    <SparkleIcon color={ParentColors.teal400} />
                    <Text style={s.affirmEyebrow}>給孩子的話</Text>
                    {!aiReady && <Text style={s.affirmPendingBadge}>每週固定</Text>}
                  </View>
                  <View style={s.affirmList}>
                    {affirmations.map((a, i) => (
                      <View key={i} style={[s.affirmItem, i > 0 && s.affirmItemBorder]}>
                        <Text style={s.affirmText}>{a}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* 成長亮點 */}
              {moments.length > 0 && (
                <View style={s.card}>
                  <Text style={s.eyebrow}>成長紀錄</Text>
                  <Text style={s.sectionTitle}>本週亮點</Text>
                  <View style={s.momentList}>
                    {moments.map(m => (
                      <MomentItem key={m.id} moment={m} />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ── Monthly placeholder ───────────────────────────────────────── */}
      {view === 'monthly' && <PlaceholderView title="月報" />}

      {/* ── History placeholder ───────────────────────────────────────── */}
      {view === 'history' && <PlaceholderView title="紀錄" />}

    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ParentColors.bgCanvas,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 32,
    paddingTop: 20,
    gap: 16,
  },
  spacer: {
    flex: 1,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: ParentColors.bgCanvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ParentColors.borderMedium,
  },
  eyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.bold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: ParentColors.fgMuted,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  pageTitle: {
    fontFamily: ParentFonts.display,
    fontSize: 26,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  titleMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },

  // ── Segmented pill ────────────────────────────────────────────────────────
  segPill: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.pill,
  },
  segItem: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: ParentRadii.pill,
  },
  segItemActive: {
    backgroundColor: '#fff',
    shadowColor: ParentColors.fgPrimary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  segItemPrimary: {
    backgroundColor: ParentColors.accent,
  },
  segLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },
  segLabelActive: {
    color: ParentColors.fgPrimary,
  },
  segLabelPrimary: {
    color: '#fff',
  },
  segSub: {
    fontSize: 11,
    fontWeight: ParentFontWeights.medium,
    opacity: 0.65,
  },

  // ── Week navigation bar ───────────────────────────────────────────────────
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weekNavBtn: {
    width: 32,
    height: 32,
    borderRadius: ParentRadii.sm,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekNavBtnDisabled: {
    opacity: 0.35,
  },
  weekNavLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: ParentRadii.sm,
    borderWidth: 1,
    borderColor: ParentColors.teal100,
    backgroundColor: ParentColors.teal50,
  },
  refreshLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.accent,
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.xl,
    padding: 24,
    overflow: 'hidden',
    ...ParentShadows.card,
  },

  // ── AI note card ──────────────────────────────────────────────────────────
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 24,
    bottom: 24,
    width: 3,
    backgroundColor: ParentColors.accent,
    borderRadius: 2,
    opacity: 0.65,
  },
  cardInner: {
    marginLeft: 10,
  },
  aiEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  aiEyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.bold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: ParentColors.accent,
    flex: 1,
  },
  aiRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.teal100,
    backgroundColor: ParentColors.teal50,
  },
  aiRefreshBtnLoading: {
    opacity: 0.55,
  },
  aiRefreshBtnLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.accent,
  },

  // ── AI refresh nav button ─────────────────────────────────────────────────
  aiRefreshNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: ParentRadii.sm,
    borderWidth: 1,
    borderColor: ParentColors.teal100,
    backgroundColor: ParentColors.teal50,
  },
  aiRefreshNavBtnLoading: {
    opacity: 0.55,
  },
  aiRefreshNavLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.accent,
  },
  aiRefreshErrorRow: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  aiRefreshErrorText: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.error,
  },
  aiBody: {
    fontFamily: ParentFonts.display,
    fontSize: 16,
    lineHeight: 28,
    color: ParentColors.fgSecondary,
    letterSpacing: -0.1,
  },
  aiFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ParentColors.borderMedium,
  },
  aiFooterText: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.fgMuted,
  },

  // ── Stats card ────────────────────────────────────────────────────────────
  statsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: ParentFonts.display,
    fontSize: 19,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    marginTop: 2,
  },
  statsMeta: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.fgMuted,
  },
  statsGrid: {
    flexDirection: 'row',
  },
  statsColLeft: {
    flex: 1.3,
    paddingRight: 24,
  },
  statsCol: {
    flex: 1,
    paddingLeft: 24,
  },
  statsColBorder: {
    borderLeftWidth: 1,
    borderLeftColor: ParentColors.borderSoft,
  },
  colEyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: 10.5,
    fontWeight: ParentFontWeights.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: ParentColors.fgMuted,
    marginBottom: 12,
  },

  // Ring
  ringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  ringPct: {
    fontFamily: ParentFonts.display,
    fontSize: 24,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  ringMeta: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.fgMuted,
    marginTop: 2,
  },
  checkInsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  checkInsNum: {
    fontFamily: ParentFonts.display,
    fontSize: 20,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  checkInsMeta: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.fgMuted,
  },

  // ABCD category rows
  catList: {
    gap: 14,
  },
  catRow: {
    gap: 6,
  },
  catLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  catBadge: {
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  catBadgeLetter: {
    fontFamily: ParentFonts.body,
    fontSize: 10,
    fontWeight: ParentFontWeights.bold,
    color: '#fff',
  },
  catLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  catCount: {
    fontFamily: ParentFonts.display,
    fontSize: 17,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  catCountSub: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    fontWeight: ParentFontWeights.regular,
    color: ParentColors.fgMuted,
  },
  catPct: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    color: ParentColors.fgMuted,
    minWidth: 32,
    textAlign: 'right',
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Coin flow
  coinNetRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 12,
  },
  coinNet: {
    fontFamily: ParentFonts.display,
    fontSize: 28,
    fontWeight: ParentFontWeights.bold,
  },
  coinNetMeta: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.fgMuted,
  },
  coinRows: {
    gap: 8,
  },
  coinDeltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
  },
  coinDeltaIn: {
    backgroundColor: '#EFF7F2',
    borderColor: '#C9DDD0',
  },
  coinDeltaOut: {
    backgroundColor: '#FBF0EE',
    borderColor: '#F0CFC7',
  },
  coinDeltaIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  coinDeltaLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    color: ParentColors.fgMuted,
  },
  coinDeltaNote: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    color: ParentColors.fgMuted,
  },
  coinDeltaAmount: {
    fontFamily: ParentFonts.display,
    fontSize: 14,
    fontWeight: ParentFontWeights.bold,
    flexShrink: 0,
  },

  // Moments
  momentList: {
    gap: 10,
    marginTop: 12,
  },
  momentItem: {
    padding: 14,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    gap: 4,
  },
  momentDate: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    color: ParentColors.fgMuted,
  },
  momentTitle: {
    fontFamily: ParentFonts.body,
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  momentBody: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    lineHeight: 19,
    color: ParentColors.fgSecondary,
  },

  // States
  screenLoadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.bgCanvas,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 14,
  },
  errorText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.error,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: ParentColors.accent,
    borderRadius: ParentRadii.pill,
  },
  retryLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
    color: '#fff',
  },

  // Placeholder
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  placeholderTitle: {
    fontFamily: ParentFonts.display,
    fontSize: 22,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  placeholderSub: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },

  // ── Long-term goal cards ──────────────────────────────────────────────────
  ltgEmpty: {
    padding: 16,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    alignItems: 'center',
  },
  ltgEmptyText: {
    fontFamily: ParentFonts.body,
    fontSize: 13,
    color: ParentColors.fgMuted,
  },
  ltgList: {
    gap: 12,
  },
  ltgGoalCard: {
    flexDirection: 'row',
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    overflow: 'hidden',
  },
  ltgGoalAccent: {
    width: 3,
    alignSelf: 'stretch',
    flexShrink: 0,
  },
  ltgGoalInner: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  ltgGoalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ltgTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: ParentRadii.pill,
    flexShrink: 0,
  },
  ltgTypePillLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    fontWeight: ParentFontWeights.bold,
  },
  ltgTaskName: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  ltgNoProgressBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: '#FBF1DC',
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: '#EFCDA6',
    flexShrink: 0,
  },
  ltgNoProgressBadgeText: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.warn,
  },
  ltgProgressSection: {
    gap: 7,
  },
  ltgScoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  ltgScore: {
    fontFamily: ParentFonts.display,
    fontSize: 16,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  ltgScoreSub: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    fontWeight: ParentFontWeights.regular,
    color: ParentColors.fgMuted,
  },
  ltgPct: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.fgMuted,
  },
  ltgScoreDiff: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    color: ParentColors.fgMuted,
    marginLeft: 'auto' as unknown as number,
  },
  ltgProgressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  ltgProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  ltgResponsibilityText: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.fgMuted,
    fontStyle: 'italic',
  },
  ltgMilestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ParentColors.borderSoft,
  },
  ltgMilestoneLabel: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: 11,
    color: ParentColors.fgMuted,
  },
  ltgRewardBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: ParentRadii.pill,
    flexShrink: 0,
  },
  ltgRewardBadgeText: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    fontWeight: ParentFontWeights.bold,
  },

  // ── Observations (本週觀察) ────────────────────────────────────────────────
  obsPending: {
    padding: 16,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  obsPendingText: {
    fontFamily: ParentFonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: ParentColors.fgMuted,
  },
  obsList: {
    gap: 12,
  },
  obsCard: {
    padding: 16,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    gap: 10,
  },
  obsBody: {
    fontFamily: ParentFonts.body,
    fontSize: 13,
    lineHeight: 21,
    color: ParentColors.fgSecondary,
  },
  obsActionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ParentColors.borderMedium,
  },
  obsActionLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.accent,
    flex: 1,
  },

  // ── Affirmations ──────────────────────────────────────────────────────────
  affirmCard: {
    backgroundColor: ParentColors.teal50,
    borderWidth: 1,
    borderColor: ParentColors.teal100,
    borderRadius: ParentRadii.xl,
    padding: 24,
    ...ParentShadows.card,
  },
  affirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  affirmEyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.bold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: ParentColors.teal500,
    flex: 1,
  },
  affirmPendingBadge: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    color: ParentColors.teal500,
    opacity: 0.6,
  },
  affirmList: {
    gap: 0,
  },
  affirmItem: {
    paddingVertical: 10,
  },
  affirmItemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ParentColors.teal200,
  },
  affirmText: {
    fontFamily: ParentFonts.display,
    fontSize: 15,
    lineHeight: 24,
    color: ParentColors.teal600,
    letterSpacing: -0.1,
  },
});
