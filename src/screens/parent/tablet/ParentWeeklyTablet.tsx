// Shadow Wallet · Parent Tablet — Tab 3 成長紀錄
// 週報 tab: live data from useParentWeeklyReport.
// 月報 tab: live data from useParentMonthlyReport.
// 紀錄 tab: skipped (future).
// Only renders when width >= 768 (returns null otherwise).

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../../../../App';
import { useSelectedChild } from '../../../context/SelectedChildContext';
import { supabase } from '../../../lib/supabase';
import {
  useParentWeeklyReport,
  type WeeklyActivityBar,
  type GrowthMoment,
  type LongTermGoalProgress,
  type ScheduleClaimPeriod,
  type SuggestionAction,
} from '../../../hooks/useParentWeeklyReport';
import {
  useParentMonthlyReport,
  type MonthlyAbcdCount,
} from '../../../hooks/useParentMonthlyReport';
import {
  ParentColors,
  ParentSpacing,
  ParentRadii,
  ParentShadows,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
} from '../../../constants/parentTheme';
import { webTabletScreen } from '../../../constants/webStyles';
import type { TaskCategory } from '../../../types/database';
import { ParentSidebar, type ManageSection } from './ParentSidebar';
import {
  IconBubble,
  TaskIconBubble,
  CoinIcon,
  CheckSquareIcon,
  ClockIcon,
  BellIcon,
} from './home/homeIcons';
import { WeekdayPicker } from './taskDrawer/editors';
import { WEEKDAYS } from './taskDrawer/taskDraft';

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

function MetricTile({ label, value, note, tone = 'neutral', icon, compact = false }: {
  label: string;
  value: string;
  note: string;
  tone?: 'neutral' | 'green' | 'orange';
  icon?: React.ReactNode;
  /** 給「主動 1・提醒 0」這種比純數字長的文字用——字級跟大數字的卡片不一樣，擠在一起才不會爆版。 */
  compact?: boolean;
}) {
  const toneStyle =
    tone === 'green' ? s.metricValueGreen :
    tone === 'orange' ? s.metricValueOrange :
    null;

  return (
    <View style={s.metricTile}>
      {icon != null && <View style={s.metricIconWrap}>{icon}</View>}
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={[s.metricValue, compact && s.metricValueCompact, toneStyle]}>{value}</Text>
      <Text style={s.metricNote}>{note}</Text>
    </View>
  );
}

function formatWeeklyChange(goal: LongTermGoalProgress) {
  if (goal.weeklyCompleted === 0) {
    // 「查看調整建議」以前只是純文字、沒接任何功能。現在「這週值得一起回顧」
    // 底下真的會出現一張拆小目標建議卡片（見 break_down_goal），這裡不用再
    // 重複喊一次同樣的話。
    return '本週尚未開始';
  }
  const unit = goal.unit || '次';
  const delta = goal.weeklyCompleted - goal.previousWeeklyCompleted;
  const compare =
    delta > 0 ? `比上週多 ${delta} ${unit}` :
    delta < 0 ? '和上週的節奏不同' :
    '與上週差不多';
  return `本週完成 ${goal.weeklyCompleted} ${unit}｜${compare}`;
}

function LongTermGoalCard({ goal }: { goal: LongTermGoalProgress }) {
  const hasProgress = goal.target > 0;
  const pct = hasProgress ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;
  const progressText = hasProgress
    ? `累積第 ${goal.current} / ${goal.target} ${goal.unit}`
    : '持續進行中';
  const weeklyText = formatWeeklyChange(goal);
  const isQuiet = goal.weeklyCompleted === 0;

  return (
    <View style={s.ltgGoalCard}>
      <TaskIconBubble name={goal.taskName} size={38} />
      <View style={s.ltgGoalMain}>
        <Text style={s.ltgTaskName} numberOfLines={1}>{goal.taskName}</Text>
        <Text style={s.ltgMetaLine}>
          {progressText}｜<Text style={isQuiet ? s.ltgAdjustText : s.ltgStableText}>{weeklyText}</Text>
        </Text>
      </View>
      <View style={s.ltgProgressArea}>
        <View style={s.ltgProgressTrack}>
          <View style={[s.ltgProgressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={s.ltgPct}>{pct}%</Text>
      </View>
      <ChevRightIcon size={14} color={ParentColors.fgMuted} />
    </View>
  );
}

type ReviewPrompt = {
  title: string;
  prompt: string;
  tone: 'green' | 'orange';
  taskId?: string;
  action?: SuggestionAction;
  actionLabel?: string;
  currentClaimPeriod?: ScheduleClaimPeriod;
  currentMaxClaimsPerPeriod?: number;
  suggestedClaimPeriod?: ScheduleClaimPeriod;
  suggestedMaxClaimsPerPeriod?: number;
  currentRecurrenceDays?: number[];
  suggestedRecurrenceDays?: number[];
  adopted?: boolean;
  deferred?: boolean;
  decidedAt?: string;
};

const CLAIM_PERIOD_LABEL: Record<ScheduleClaimPeriod, string> = {
  day: '每天', week: '每週', once: '整個任務期間',
};

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 週一 ~ 週日
const WEEKDAY_LABEL: Record<number, string> = Object.fromEntries(
  WEEKDAYS.map(d => [d.value, d.label]),
);

/** 「週二、三、五」這種顯示字串，固定週一排到週日的順序。 */
function formatDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b));
  return `週${sorted.map(d => WEEKDAY_LABEL[d]).join('、')}`;
}

/** 「8/10 14:30」這種顯示字串，給「已套用」badge 標記決定時間。 */
function formatDecidedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-TW', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// 'once'（整個任務期間、次數上限永不重置）不放進這個編輯器：這個功能只處理
// 週期性任務的頻率上限調整，混進「一輩子只能做幾次」的單次任務語意會誤導家長。
const CLAIM_PERIOD_OPTIONS: ScheduleClaimPeriod[] = ['day', 'week'];

type ScheduleAdoptOverride =
  | { claimPeriod: ScheduleClaimPeriod; maxClaimsPerPeriod: number }
  | { recurrenceDays: number[] };

function ReviewPromptCard({ item, onAdopt, onDefer, onRevert, onAcknowledge }: {
  item: ReviewPrompt;
  onAdopt: (item: ReviewPrompt, override?: ScheduleAdoptOverride) => Promise<void>;
  onDefer: (item: ReviewPrompt) => Promise<void>;
  onRevert: (item: ReviewPrompt) => Promise<void>;
  onAcknowledge: (item: ReviewPrompt) => Promise<void>;
}) {
  const [adopting, setAdopting] = useState(false);
  const [deferring, setDeferring] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [adoptError, setAdoptError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editClaimPeriod, setEditClaimPeriod] = useState<ScheduleClaimPeriod>(item.suggestedClaimPeriod ?? 'week');
  const [editMaxClaims, setEditMaxClaims] = useState(item.suggestedMaxClaimsPerPeriod ?? 1);
  const [editRecurrenceDays, setEditRecurrenceDays] = useState<number[]>(item.suggestedRecurrenceDays ?? []);
  const isScheduleSuggestion = item.taskId != null
    && item.suggestedClaimPeriod != null
    && item.suggestedMaxClaimsPerPeriod != null;
  const isRecurrenceSuggestion = item.taskId != null
    && item.suggestedRecurrenceDays != null;
  // 這種建議「採用」不是自動改資料庫，是帶家長去對應畫面自己處理——沒有
  // current/suggested 數值可以顯示 diff，也沒有東西可以「取消套用」。
  const isAcknowledgeSuggestion = item.taskId != null
    && (item.action === 'pause_or_renegotiate' || item.action === 'break_down_goal')
    && !isScheduleSuggestion && !isRecurrenceSuggestion;
  const isActionable = isScheduleSuggestion || isRecurrenceSuggestion || isAcknowledgeSuggestion;

  const startEditing = () => {
    setEditClaimPeriod(item.suggestedClaimPeriod ?? 'week');
    setEditMaxClaims(item.suggestedMaxClaimsPerPeriod ?? 1);
    setEditRecurrenceDays(item.suggestedRecurrenceDays ?? []);
    setAdoptError(null);
    setEditing(true);
  };

  const handleAdopt = async (override?: ScheduleAdoptOverride) => {
    setAdopting(true);
    setAdoptError(null);
    try {
      await onAdopt(item, override);
      setEditing(false);
    } catch (e) {
      console.error('[ReviewPromptCard] adopt error:', e);
      setAdoptError(e instanceof Error ? e.message : '採用失敗，請稍後再試');
    } finally {
      setAdopting(false);
    }
  };

  const handleDefer = async () => {
    setDeferring(true);
    setAdoptError(null);
    try {
      await onDefer(item);
    } catch (e) {
      console.error('[ReviewPromptCard] defer error:', e);
      setAdoptError(e instanceof Error ? e.message : '操作失敗，請稍後再試');
    } finally {
      setDeferring(false);
    }
  };

  const handleAcknowledge = async () => {
    setAdopting(true);
    setAdoptError(null);
    try {
      await onAcknowledge(item);
    } catch (e) {
      console.error('[ReviewPromptCard] acknowledge error:', e);
      setAdoptError(e instanceof Error ? e.message : '操作失敗，請稍後再試');
    } finally {
      setAdopting(false);
    }
  };

  const handleRevert = async () => {
    setReverting(true);
    setAdoptError(null);
    try {
      await onRevert(item);
    } catch (e) {
      console.error('[ReviewPromptCard] revert error:', e);
      setAdoptError(e instanceof Error ? e.message : '取消套用失敗，請稍後再試');
    } finally {
      setReverting(false);
    }
  };

  return (
    <View style={s.reviewPromptRow}>
      <View style={[s.reviewPromptDot, item.tone === 'orange' && s.reviewPromptDotOrange]}>
        {item.tone === 'orange'
          ? <BellIcon size={18} color={ParentColors.warn} />
          : <CheckSquareIcon size={18} color={ParentColors.teal500} />}
      </View>
      <View style={s.reviewPromptBody}>
        <Text style={s.reviewPromptTitle}>{item.title}</Text>
        <Text style={s.reviewPromptText}>{item.prompt}</Text>
        {isScheduleSuggestion && !editing && (
          <Text style={s.scheduleDiffText}>
            {item.currentClaimPeriod != null && item.currentMaxClaimsPerPeriod != null
              ? `目前：${CLAIM_PERIOD_LABEL[item.currentClaimPeriod]}最多 ${item.currentMaxClaimsPerPeriod} 次　→　`
              : ''}
            建議：{CLAIM_PERIOD_LABEL[item.suggestedClaimPeriod!]}最多 {item.suggestedMaxClaimsPerPeriod} 次
          </Text>
        )}
        {isRecurrenceSuggestion && !editing && (
          <Text style={s.scheduleDiffText}>
            {item.currentRecurrenceDays != null
              ? `目前：${formatDays(item.currentRecurrenceDays)}　→　`
              : ''}
            建議：{formatDays(item.suggestedRecurrenceDays!)}
          </Text>
        )}

        {isScheduleSuggestion && editing && (
          <View style={s.editBox}>
            <Text style={s.editLabel}>調整為</Text>
            <View style={s.editPeriodRow}>
              {CLAIM_PERIOD_OPTIONS.map(p => (
                <TouchableOpacity
                  key={p}
                  style={[s.editPeriodChip, editClaimPeriod === p && s.editPeriodChipActive]}
                  onPress={() => setEditClaimPeriod(p)}
                >
                  <Text style={[s.editPeriodChipText, editClaimPeriod === p && s.editPeriodChipTextActive]}>
                    {CLAIM_PERIOD_LABEL[p]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.editStepperRow}>
              <Text style={s.editLabel}>最多完成次數</Text>
              <View style={s.editStepper}>
                <TouchableOpacity
                  style={s.editStepperBtn}
                  onPress={() => setEditMaxClaims(v => Math.max(1, v - 1))}
                >
                  <Text style={s.editStepperBtnText}>－</Text>
                </TouchableOpacity>
                <Text style={s.editStepperValue}>{editMaxClaims}</Text>
                <TouchableOpacity
                  style={s.editStepperBtn}
                  onPress={() => setEditMaxClaims(v => v + 1)}
                >
                  <Text style={s.editStepperBtnText}>＋</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        {isRecurrenceSuggestion && editing && (
          <View style={s.editBox}>
            <Text style={s.editLabel}>調整為</Text>
            <WeekdayPicker value={editRecurrenceDays} onChange={setEditRecurrenceDays} />
          </View>
        )}

        {isActionable && (
          <View style={s.reviewPromptActions}>
            {item.adopted ? (
              <>
                <View style={s.adoptedBadge}>
                  <CheckSquareIcon size={13} color={ParentColors.teal500} />
                  <Text style={s.adoptedBadgeText}>
                    已套用{item.decidedAt ? `・${formatDecidedAt(item.decidedAt)}` : ''}
                  </Text>
                </View>
                {/* 帶去別的畫面處理的建議沒有「套用的數值」可以復原，不給取消按鈕。 */}
                {!isAcknowledgeSuggestion && (
                  <TouchableOpacity style={s.deferBtn} onPress={handleRevert} disabled={reverting}>
                    {reverting
                      ? <ActivityIndicator size="small" color={ParentColors.fgSecondary} />
                      : <Text style={s.deferBtnText}>取消套用</Text>}
                  </TouchableOpacity>
                )}
              </>
            ) : isAcknowledgeSuggestion ? (
              <>
                <TouchableOpacity
                  style={s.adoptBtn}
                  onPress={handleAcknowledge}
                  disabled={adopting || deferring}
                >
                  {adopting
                    ? <ActivityIndicator size="small" color={ParentColors.accent} />
                    : <Text style={s.adoptBtnText}>{item.actionLabel || '前往處理'}</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={s.deferBtn} onPress={handleDefer} disabled={adopting || deferring}>
                  {deferring
                    ? <ActivityIndicator size="small" color={ParentColors.fgSecondary} />
                    : <Text style={s.deferBtnText}>再觀察一週</Text>}
                </TouchableOpacity>
              </>
            ) : editing ? (
              <>
                <TouchableOpacity
                  style={s.adoptBtn}
                  onPress={() => handleAdopt(
                    isRecurrenceSuggestion
                      ? { recurrenceDays: editRecurrenceDays }
                      : { claimPeriod: editClaimPeriod, maxClaimsPerPeriod: editMaxClaims },
                  )}
                  disabled={adopting || (isRecurrenceSuggestion && editRecurrenceDays.length === 0)}
                >
                  {adopting
                    ? <ActivityIndicator size="small" color={ParentColors.accent} />
                    : <Text style={s.adoptBtnText}>確認採用</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={s.deferBtn} onPress={() => setEditing(false)} disabled={adopting}>
                  <Text style={s.deferBtnText}>取消</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={s.adoptBtn}
                  onPress={() => handleAdopt()}
                  disabled={adopting || deferring}
                >
                  {adopting
                    ? <ActivityIndicator size="small" color={ParentColors.accent} />
                    : <Text style={s.adoptBtnText}>採用建議</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={s.deferBtn} onPress={startEditing} disabled={adopting || deferring}>
                  <Text style={s.deferBtnText}>修改建議</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.deferBtn} onPress={handleDefer} disabled={adopting || deferring}>
                  {deferring
                    ? <ActivityIndicator size="small" color={ParentColors.fgSecondary} />
                    : <Text style={s.deferBtnText}>再觀察一週</Text>}
                </TouchableOpacity>
              </>
            )}
            {adoptError && <Text style={s.adoptErrorText}>{adoptError}</Text>}
          </View>
        )}
      </View>
    </View>
  );
}

function AffirmationsCard({ affirmations, aiReady }: { affirmations: string[]; aiReady: boolean }) {
  if (affirmations.length === 0) return null;
  return (
    <View style={s.dialogueCard}>
      <View style={s.dialogueHeader}>
        <View style={[s.dialogueIcon, { backgroundColor: ParentColors.amber300 + '33' }]}>
          <SparkleIcon size={13} color={ParentColors.warn} />
        </View>
        <Text style={s.sectionTitle}>這週值得肯定的地方</Text>
      </View>
      {affirmations.map((line, i) => (
        <Text key={i} style={[s.dialogueText, s.affirmationLine]}>・{line}</Text>
      ))}
      <Text style={s.dialogueFootnote}>
        {aiReady ? 'AI 依本週紀錄整理，家長可自行調整說法' : '通用鼓勵語句，AI 洞察生成後會換成貼合本週紀錄的版本'}
      </Text>
    </View>
  );
}

function DialogueCard({ childName, dialoguePrompt, aiReady }: {
  childName: string;
  dialoguePrompt: string;
  aiReady: boolean;
}) {
  const isAi = aiReady && dialoguePrompt.trim().length > 0;
  const text = isAi
    ? dialoguePrompt
    : `這週我看到${childName || '你'}有持續累積，也有把一些事情慢慢做完，這點很棒。\n\n至於還沒有開始的目標，我想聽聽看，\n你覺得現在最難開始的是哪一段？`;
  return (
    <View style={s.dialogueCard}>
      <View style={s.dialogueHeader}>
        <View style={s.dialogueIcon}>
          <SparkleIcon size={13} color={ParentColors.success} />
        </View>
        <Text style={s.sectionTitle}>和孩子聊聊</Text>
      </View>
      <Text style={s.dialogueLabel}>{isAi ? 'AI 建議的對話起頭：' : '可以這樣開場：'}</Text>
      <Text style={s.dialogueText}>{text}</Text>
      <Text style={s.dialogueFootnote}>
        {isAi ? 'AI 依本週紀錄提供的對話起點，家長可自行調整' : '依本週紀錄整理的對話起點，家長可自行調整'}
      </Text>
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

function WeeklyRecordRow({ title, meta, right, rightTone }: {
  title: string;
  meta?: string;
  right?: string;
  rightTone?: 'in' | 'out' | 'muted';
}) {
  const rightColor =
    rightTone === 'in' ? ParentColors.success :
    rightTone === 'out' ? ParentColors.error :
    ParentColors.fgSecondary;
  return (
    <View style={s.recRow}>
      <View style={s.recMain}>
        <Text style={s.recTitle} numberOfLines={1}>{title}</Text>
        {meta ? <Text style={s.recMeta}>{meta}</Text> : null}
      </View>
      {right ? <Text style={[s.recRight, { color: rightColor }]}>{right}</Text> : null}
    </View>
  );
}

function RecordEmpty({ text }: { text: string }) {
  return (
    <View style={s.obsPending}>
      <Text style={s.obsPendingText}>{text}</Text>
    </View>
  );
}

type InterventionLogRow = {
  id: string;
  event_type: string;
  task_name_snapshot: string | null;
  parent_decision: unknown;
  created_at: string;
};

/**
 * 把 intervention_log 那筆寫死給機器看的 JSON（parent_decision）翻成家長看得懂的一句話。
 * 目前只有這兩種 event_type 會被寫入（見 update_task_schedule / update_task_recurrence_days
 * 兩支 RPC），其他型別一律用通用文字兜底，不讓畫面因為未知格式而空白或壞掉。
 *
 * 不帶任務名稱——這支只負責「改了什麼」，任務名稱由外層的分組標題負責，
 * 不然按任務分組之後每一行還要重複講一次任務名字，反而更亂。
 */
function describeInterventionChange(row: InterventionLogRow): string {
  if (row.event_type === 'task_schedule_adjusted') {
    const d = row.parent_decision as {
      old_claim_period?: ScheduleClaimPeriod; new_claim_period?: ScheduleClaimPeriod;
      old_max_claims_per_period?: number; new_max_claims_per_period?: number;
    } | null;
    if (d?.old_claim_period && d.new_claim_period && d.old_max_claims_per_period != null && d.new_max_claims_per_period != null) {
      return `${CLAIM_PERIOD_LABEL[d.old_claim_period]}最多 ${d.old_max_claims_per_period} 次　→　${CLAIM_PERIOD_LABEL[d.new_claim_period]}最多 ${d.new_max_claims_per_period} 次`;
    }
    return '調整了完成次數上限';
  }
  if (row.event_type === 'task_recurrence_updated') {
    const d = row.parent_decision as { old_recurrence_days?: number[]; new_recurrence_days?: number[] } | null;
    if (Array.isArray(d?.old_recurrence_days) && Array.isArray(d?.new_recurrence_days)) {
      return `${formatDays(d!.old_recurrence_days!)}　→　${formatDays(d!.new_recurrence_days!)}`;
    }
    return '調整了排定的星期';
  }
  return '有一筆調整紀錄';
}

type InterventionGroup = {
  taskName: string;
  entries: InterventionLogRow[];
};

const INTERVENTION_EVENT_LABEL: Record<string, string> = {
  task_schedule_adjusted: '次數上限',
  task_recurrence_updated: '排定星期',
};

/** 同一個任務底下，次數上限跟排定星期是兩件不同的事，混在一起看很難比對前後變化。 */
function splitByEventType(entries: InterventionLogRow[]): { label: string; entries: InterventionLogRow[] }[] {
  const order = ['task_schedule_adjusted', 'task_recurrence_updated'];
  return order
    .map(eventType => ({
      label: INTERVENTION_EVENT_LABEL[eventType],
      entries: entries.filter(row => row.event_type === eventType),
    }))
    .filter(group => group.entries.length > 0);
}

/** 依任務分組，每組內維持新到舊；組跟組之間依「該組最新一筆」排序，最近有動作的任務排最前面。 */
function groupInterventionRows(rows: InterventionLogRow[]): InterventionGroup[] {
  const order: string[] = [];
  const byTask = new Map<string, InterventionLogRow[]>();
  for (const row of rows) {
    const key = row.task_name_snapshot?.trim() || '其他調整';
    if (!byTask.has(key)) {
      byTask.set(key, []);
      order.push(key);
    }
    byTask.get(key)!.push(row);
  }
  // rows 本來就是 created_at desc 撈出來的，所以 order 的插入順序天然就是
  // 「每個任務最近一次出現的順序」，不用再另外排序。
  return order.map(taskName => ({ taskName, entries: byTask.get(taskName)! }));
}

/** 紀錄 tab——讀 intervention_log，依任務分組顯示「上次調整了什麼」，取代原本的佔位畫面。 */
function HistoryView({ childId }: { childId: string }) {
  const [rows, setRows] = useState<InterventionLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const { data, error: err } = await supabase
          .from('intervention_log')
          .select('id, event_type, task_name_snapshot, parent_decision, created_at')
          .eq('child_id', childId)
          .in('event_type', ['task_schedule_adjusted', 'task_recurrence_updated'])
          .order('created_at', { ascending: false })
          .limit(50);
        if (cancelled) return;
        if (err) throw err;
        setRows((data ?? []) as InterventionLogRow[]);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : '載入失敗，請稍後再試');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [childId]);

  const groups = useMemo(() => groupInterventionRows(rows), [rows]);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const didSetDefaultExpanded = useRef(false);

  // 預設展開最近有動作的那個任務（groups[0]），其餘收合——一次只看一個
  // 任務的變化，不用在一長串裡自己找。只做這一次：家長收合第一個任務時
  // expandedTask 也會變 null，不能拿「是不是 null」來判斷要不要重新展開，
  // 不然永遠收不掉最上面那個。
  useEffect(() => {
    if (groups.length > 0 && !didSetDefaultExpanded.current) {
      didSetDefaultExpanded.current = true;
      setExpandedTask(groups[0].taskName);
    }
  }, [groups]);

  if (loading) {
    return (
      <View style={s.placeholder}>
        <ActivityIndicator size="small" color={ParentColors.accent} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={s.placeholder}>
        <Text style={s.placeholderSub}>{loadError}</Text>
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <View style={s.placeholder}>
        <Text style={s.placeholderTitle}>紀錄</Text>
        <Text style={s.placeholderSub}>目前還沒有調整紀錄</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.historyScroll} contentContainerStyle={s.historyScrollContent}>
      <Text style={s.sectionTitle}>調整紀錄</Text>
      {groups.map(group => {
        const isExpanded = expandedTask === group.taskName;
        return (
          <View key={group.taskName} style={s.historyGroup}>
            <TouchableOpacity
              style={s.historyGroupHeader}
              onPress={() => setExpandedTask(isExpanded ? null : group.taskName)}
              activeOpacity={0.7}
            >
              <Text style={s.historyGroupTitle}>{group.taskName}</Text>
              <Text style={s.historyGroupChevron}>{isExpanded ? '▾' : '▸'}</Text>
            </TouchableOpacity>
            {isExpanded && splitByEventType(group.entries).map(sub => (
              <View key={sub.label} style={s.historySubGroup}>
                <Text style={s.historySubGroupTitle}>{sub.label}</Text>
                <View style={s.historyList}>
                  {sub.entries.map(row => (
                    <View key={row.id} style={s.historyRow}>
                      <Text style={s.historyRowText}>{describeInterventionChange(row)}</Text>
                      <Text style={s.historyRowMeta}>{formatDecidedAt(row.created_at)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly view sub-components
// ─────────────────────────────────────────────────────────────────────────────

function MonthlyCatRow({ row }: { row: MonthlyAbcdCount }) {
  const meta = CAT_META[row.cat];
  return (
    <View style={s.catRow}>
      <View style={s.catLabelRow}>
        <View style={[s.catBadge, { backgroundColor: meta.color }]}>
          <Text style={s.catBadgeLetter}>{row.cat}</Text>
        </View>
        <Text style={s.catLabel}>{meta.label}</Text>
        <View style={s.spacer} />
        <Text style={s.catCount}>{row.done}</Text>
        <Text style={[s.catPct, { minWidth: 20 }]}> 次</Text>
      </View>
    </View>
  );
}

function MonthlyView({ childId }: { childId: string }) {
  const { bottom } = useSafeAreaInsets();
  const {
    monthLabel, totalCompleted, activeDays, coinIncome, coinSpend, abcd,
    longTermGoals, reflection, saveReflection, saving,
    loading, error, canGoBack, canGoForward, goBack, goForward, refresh,
  } = useParentMonthlyReport(childId);

  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Sync draft when reflection loads or month changes
  useEffect(() => {
    setDraft(reflection);
    setDirty(false);
    setSaveError(false);
  }, [reflection]);

  const netCoin = coinIncome - coinSpend;

  const handleSave = useCallback(async () => {
    setSaveError(false);
    try {
      await saveReflection(draft);
      setDirty(false);
    } catch {
      setSaveError(true);
    }
  }, [draft, saveReflection]);

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={[s.scrollContent, { paddingBottom: bottom + 28 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Month navigation */}
      <View style={s.weekNav}>
        <TouchableOpacity
          onPress={goBack}
          disabled={!canGoBack}
          style={[s.weekNavBtn, !canGoBack && s.weekNavBtnDisabled]}
        >
          <ChevLeftIcon color={canGoBack ? ParentColors.fgPrimary : ParentColors.ink300} />
        </TouchableOpacity>
        <Text style={s.weekNavLabel}>{monthLabel}</Text>
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
      </View>

      {loading && (
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={ParentColors.accent} />
        </View>
      )}

      {!loading && error && (
        <View style={s.centerBox}>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={refresh} style={s.retryBtn}>
            <Text style={s.retryLabel}>重試</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && (
        <>
          {/* 家長備忘 — 置頂，與週報 AI 札記對應 */}
          <View style={s.card}>
            <View style={s.statsHeaderRow}>
              <View>
                <Text style={s.eyebrow}>家長備忘</Text>
                <Text style={s.sectionTitle}>本月觀察記錄</Text>
              </View>
              {dirty && (
                <TouchableOpacity
                  onPress={handleSave}
                  disabled={saving}
                  style={[s.refreshBtn, saving && s.weekNavBtnDisabled]}
                >
                  <Text style={s.refreshLabel}>{saving ? '儲存中…' : '儲存'}</Text>
                </TouchableOpacity>
              )}
            </View>
            {saveError && (
              <Text style={[s.errorText, { marginBottom: 8 }]}>儲存失敗，請再試一次</Text>
            )}
            <TextInput
              style={s.reflectionInput}
              multiline
              placeholder="記錄這個月觀察到的孩子狀態、行為改變、親子互動…"
              placeholderTextColor={ParentColors.fgMuted}
              value={draft}
              onChangeText={text => {
                setDraft(text);
                setDirty(text !== reflection);
              }}
              textAlignVertical="top"
            />
          </View>

          {/* 本月數據 */}
          <View style={s.card}>
            <View style={s.statsHeaderRow}>
              <View>
                <Text style={s.eyebrow}>本月數據</Text>
                <Text style={s.sectionTitle}>任務與幣值</Text>
              </View>
              <Text style={s.statsMeta}>
                完成 {totalCompleted} 件 · 活躍 {activeDays} 天
              </Text>
            </View>

            <View style={s.statsGrid}>
              {/* Col 1: summary */}
              <View style={s.statsColLeft}>
                <Text style={s.colEyebrow}>整體數量</Text>
                <View style={s.checkInsRow}>
                  <Text style={s.checkInsNum}>{totalCompleted}</Text>
                  <Text style={s.checkInsMeta}> 次完成</Text>
                </View>
                <View style={[s.checkInsRow, { marginTop: 10 }]}>
                  <Text style={s.checkInsNum}>{activeDays}</Text>
                  <Text style={s.checkInsMeta}> 活躍天數</Text>
                </View>
              </View>

              {/* Col 2: ABCD breakdown */}
              <View style={[s.statsCol, s.statsColBorder]}>
                <Text style={s.colEyebrow}>ABCD 分類</Text>
                <View style={s.catList}>
                  {abcd.map(row => <MonthlyCatRow key={row.cat} row={row} />)}
                </View>
              </View>

              {/* Col 3: coin flow */}
              <View style={[s.statsCol, s.statsColBorder]}>
                <Text style={s.colEyebrow}>幣值收支</Text>
                <View style={s.coinNetRow}>
                  <Text style={[s.coinNet, { color: netCoin >= 0 ? ParentColors.success : ParentColors.error }]}>
                    {netCoin >= 0 ? '+' : ''}{netCoin}
                  </Text>
                  <Text style={s.coinNetMeta}>幣 · 本月結餘</Text>
                </View>
                <View style={s.coinRows}>
                  <CoinDeltaRow tone="in" label="收入" amount={coinIncome} note="任務獎勵" />
                  <CoinDeltaRow tone="out" label="支出" amount={coinSpend} note="兌換支出" />
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
        </>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ParentWeeklyTablet() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { childId, allChildren, setSelectedChild, loadingChildren } = useSelectedChild();
  const [view, setView] = useState<ReportView>('weekly');
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [aiRefreshError, setAiRefreshError] = useState<string | null>(null);

  const handleNavigateHome = useCallback(() => {
    navigation.navigate('Dashboard' as never);
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
    navigation.navigate('Manage' as never);
  }, [navigation]);

  const handleAddChild = useCallback(() => {
    navigation.navigate('AddChild');
  }, [navigation]);

  const {
    childName, weekLabel, weekRange,
    timeSavedMin, selfStartedCount, remindedCount, afterDinnerCount, beforeBedCount,
    aiInsight, aiReady, dialoguePrompt, affirmations,
    activity, coinFlow, suggestions,
    moments, longTermGoals,
    taskRecords, coinRecords, timeSavingRecords, redemptionRecords,
    loading, error,
    canGoBack, canGoForward,
    goBack, goForward,
    refresh, requestAiRefresh, adoptScheduleSuggestion, adoptRecurrenceSuggestion,
    deferSuggestion, revertSuggestion, acknowledgeSuggestion,
  } = useParentWeeklyReport(childId);

  const [recordTab, setRecordTab] = useState(0);

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

  const recordedTasks = activity.reduce((sum, b) => sum + b.done, 0);
  const netCoin = coinFlow.income - coinFlow.spend;
  const topActivity = [...activity].sort((a, b) => b.done - a.done)[0];
  const topActivityLabel = topActivity != null && topActivity.done > 0
    ? CAT_META[topActivity.cat].label
    : '日常任務';
  const quietGoal = longTermGoals.find(goal => goal.weeklyCompleted === 0);
  const steadyGoals = longTermGoals.filter(goal => goal.weeklyCompleted > 0);
  const summaryText = aiReady
    ? aiInsight
    : `${childName || '孩子'}這週完成了 ${recordedTasks} 件任務，${topActivityLabel}有持續累積。\n${quietGoal ? `${quietGoal.taskName}這週尚未開始，週末可以一起看看，這個目標現在是否還適合。` : '可以挑一件孩子覺得順利的事，一起回顧是什麼讓它比較容易開始。'}`;
  const reviewPrompts: ReviewPrompt[] = [
    ...steadyGoals.slice(0, 2).map(goal => ({
      title: `${goal.taskName}持續累積`,
      prompt: `可以一起看看，下一個小里程碑想怎麼慶祝。`,
      tone: 'green' as const,
    })),
    quietGoal != null ? {
      title: `${quietGoal.taskName}還沒有開始`,
      prompt: '可以一起確認：要不要先從比較容易的一步開始？',
      tone: 'orange' as const,
    } : null,
    moments[0] != null ? {
      title: moments[0].title,
      prompt: moments[0].body ?? '可以問問他：這週什麼地方讓這件事變得比較容易？',
      tone: 'green' as const,
    } : null,
  ].filter((item): item is ReviewPrompt => item != null).slice(0, 3);
  const safeReviewPrompts = reviewPrompts.length > 0
    ? reviewPrompts
    : [{
        title: `${childName || '孩子'}這週完成了 ${recordedTasks} 件任務`,
        prompt: '可以問問他：這週哪一件事做起來最順？',
        tone: 'green' as const,
      }];
  // AI 產生的回顧建議（後端 weekly_reports.ai_suggestions）優先；沒有才落回上面的模板。
  // deferred 是家長按過「再觀察一週」的真實決定（寫回 DB），不是本地狀態——
  // 下週重新產生報告會是全新一列，不需要在同一週裡再顯示回來。
  const aiReviewPrompts: ReviewPrompt[] = suggestions
    .filter(sg => !sg.deferred)
    .map(sg => ({
      title: sg.taskName?.trim() || sg.actionLabel || '本週建議',
      prompt: sg.body,
      tone: (sg.action === 'adjust_reminder' ? 'orange' : 'green') as ReviewPrompt['tone'],
      taskId: sg.taskId,
      action: sg.action,
      actionLabel: sg.actionLabel,
      currentClaimPeriod: sg.currentClaimPeriod,
      currentMaxClaimsPerPeriod: sg.currentMaxClaimsPerPeriod,
      suggestedClaimPeriod: sg.suggestedClaimPeriod,
      suggestedMaxClaimsPerPeriod: sg.suggestedMaxClaimsPerPeriod,
      currentRecurrenceDays: sg.currentRecurrenceDays,
      suggestedRecurrenceDays: sg.suggestedRecurrenceDays,
      adopted: sg.adopted,
      decidedAt: sg.decidedAt,
    }))
    // 可以實際採用的排程建議優先顯示。
    .sort((a, b) => Number(b.taskId != null) - Number(a.taskId != null));
  const displayReviewPrompts = aiReady && aiReviewPrompts.length > 0
    ? aiReviewPrompts
    : safeReviewPrompts;

  return (
    <View style={webTabletScreen}>
    <View style={s.columns}>
      <ParentSidebar
        activeTab="weekly"
        allChildren={allChildren}
        childId={childId}
        setSelectedChild={setSelectedChild}
        pendingCounts={{}}
        onNavigateHome={handleNavigateHome}
        onNavigateWeekly={() => {}}
        onNavigateManage={handleNavigateManage}
        onAddChild={handleAddChild}
      />
    <View style={[s.root, s.mainAreaWrap, { paddingTop: insets.top }]}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>成長紀錄</Text>
          <View style={s.titleRow}>
            <Text style={s.pageTitle}>觀察與長期紀錄</Text>
            {view === 'weekly' && (
              <Text style={s.titleMeta}>本週 · {weekRange}</Text>
            )}
          </View>
        </View>

        <View style={s.headerControls}>
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
              <View style={s.summaryCard}>
                <View style={s.statsHeaderRow}>
                  <View>
                    <Text style={s.eyebrow}>週報 · {weekRange}</Text>
                    <Text style={s.sectionTitle}>本週整理</Text>
                  </View>
                  <TouchableOpacity
                    onPress={handleAiRefresh}
                    disabled={aiRefreshing}
                    style={[s.aiRefreshBtn, aiRefreshing && s.aiRefreshBtnLoading]}
                  >
                    {aiRefreshing
                      ? <ActivityIndicator size="small" color={ParentColors.accent} />
                      : <RefreshIcon size={11} />}
                    <Text style={s.aiRefreshBtnLabel}>
                      {aiRefreshing ? '生成中' : '重新產生摘要'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.summaryText}>{summaryText}</Text>
                <View style={s.summaryFooter}>
                  <Text style={s.aiFooterText}>{childName || '孩子'} · {weekLabel}</Text>
                  <Text style={s.aiFooterText}>AI 整理 · 供參考</Text>
                </View>
              </View>

              <View style={s.card}>
                <Text style={s.sectionTitle}>本週紀錄概覽</Text>
                {/* 本週投入分布 */}
                <View style={s.metricGrid}>
                  <MetricTile
                    label="已記錄任務"
                    value={`${recordedTasks} 件`}
                    note="本週完成紀錄"
                    icon={
                      <IconBubble bg={ParentColors.tintLeaf}>
                        <CheckSquareIcon size={18} color={ParentColors.leaf700} />
                      </IconBubble>
                    }
                  />
                  <MetricTile
                    label="成長幣變化"
                    value={`${netCoin >= 0 ? '+' : ''}${netCoin} 枚`}
                    note="本週變化"
                    tone={netCoin >= 0 ? 'green' : 'neutral'}
                    icon={
                      <IconBubble bg={ParentColors.tintGold}>
                        <CoinIcon size={18} color={ParentColors.gold700} />
                      </IconBubble>
                    }
                  />
                  {timeSavedMin > 0 && (
                    <MetricTile
                      label="時間儲蓄"
                      value={`+${timeSavedMin} 分鐘`}
                      note="本週累積"
                      tone="green"
                      icon={
                        <IconBubble bg={ParentColors.tintPine}>
                          <ClockIcon size={18} color={ParentColors.pine400} />
                        </IconBubble>
                      }
                    />
                  )}
                  {(selfStartedCount > 0 || remindedCount > 0) && (
                    <MetricTile
                      compact
                      label="開始方式"
                      value={`主動 ${selfStartedCount}・提醒 ${remindedCount}`}
                      note="本週完成次數"
                      icon={
                        <IconBubble bg={ParentColors.tintGold}>
                          <BellIcon size={18} color={ParentColors.gold700} />
                        </IconBubble>
                      }
                    />
                  )}
                  {(afterDinnerCount > 0 || beforeBedCount > 0) && (
                    <MetricTile
                      compact
                      label="完成時段"
                      value={`晚餐後 ${afterDinnerCount}・睡前 ${beforeBedCount}`}
                      note="本週分布，僅供參考"
                      icon={
                        <IconBubble bg={ParentColors.tintPine}>
                          <ClockIcon size={18} color={ParentColors.pine400} />
                        </IconBubble>
                      }
                    />
                  )}
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

              <View style={s.card}>
                <View style={s.statsHeaderRow}>
                  <View>
                    <Text style={s.eyebrow}>親子回顧</Text>
                    <Text style={s.sectionTitle}>這週值得一起回顧</Text>
                  </View>
                </View>
                <View style={s.reviewPromptList}>
                  {displayReviewPrompts.map((item, i) => (
                    <ReviewPromptCard
                      key={`${item.title}-${i}`}
                      item={item}
                      onAdopt={async (i2, override) => {
                        if (i2.taskId == null) return;
                        const isRecurrence = (override && 'recurrenceDays' in override)
                          || (!override && i2.suggestedRecurrenceDays != null);
                        if (isRecurrence) {
                          const recurrenceDays = override && 'recurrenceDays' in override
                            ? override.recurrenceDays
                            : i2.suggestedRecurrenceDays;
                          if (recurrenceDays == null) return;
                          await adoptRecurrenceSuggestion(i2.taskId, recurrenceDays);
                          return;
                        }
                        const claimPeriod = override && 'claimPeriod' in override ? override.claimPeriod : i2.suggestedClaimPeriod;
                        const maxClaimsPerPeriod = override && 'maxClaimsPerPeriod' in override ? override.maxClaimsPerPeriod : i2.suggestedMaxClaimsPerPeriod;
                        if (claimPeriod == null || maxClaimsPerPeriod == null) return;
                        await adoptScheduleSuggestion(i2.taskId, claimPeriod, maxClaimsPerPeriod);
                      }}
                      onDefer={async (i2) => {
                        if (i2.taskId == null || i2.action == null) return;
                        await deferSuggestion(i2.taskId, i2.action, {
                          body: i2.prompt, actionLabel: i2.actionLabel ?? '', taskName: i2.title,
                        });
                      }}
                      onRevert={async (i2) => {
                        if (i2.taskId == null || i2.action == null) return;
                        await revertSuggestion(i2.taskId, i2.action);
                      }}
                      onAcknowledge={async (i2) => {
                        if (i2.taskId == null || i2.action == null) return;
                        await acknowledgeSuggestion(i2.taskId, i2.action, {
                          body: i2.prompt, actionLabel: i2.actionLabel ?? '', taskName: i2.title,
                        });
                        handleNavigateManage('tasks');
                      }}
                    />
                  ))}
                </View>
              </View>

              <AffirmationsCard affirmations={affirmations} aiReady={aiReady} />

              <DialogueCard childName={childName} dialoguePrompt={dialoguePrompt} aiReady={aiReady} />

              <View style={s.card}>
                <View style={s.statsHeaderRow}>
                  <View>
                    <Text style={s.eyebrow}>完整紀錄</Text>
                    <Text style={s.sectionTitle}>查看完整紀錄</Text>
                  </View>
                </View>
                <View style={s.recordTabs}>
                  {['任務紀錄', '成長幣', '時間儲蓄', '獎勵兌換'].map((tab, i) => (
                    <TouchableOpacity
                      key={tab}
                      onPress={() => setRecordTab(i)}
                      style={[s.recordTab, i === recordTab && s.recordTabActive]}
                    >
                      <Text style={[s.recordTabText, i === recordTab && s.recordTabTextActive]}>{tab}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={s.recordList}>
                  {recordTab === 0 && (
                    taskRecords.length > 0
                      ? taskRecords.map(r => (
                          <WeeklyRecordRow
                            key={r.id}
                            title={r.taskName}
                            meta={r.status === 'flagged' ? `${r.dateLabel} · 待確認` : r.dateLabel}
                            right={r.coinEarned > 0 ? `+${r.coinEarned} 枚` : undefined}
                            rightTone="in"
                          />
                        ))
                      : <RecordEmpty text="本週還沒有任務完成紀錄。" />
                  )}
                  {recordTab === 1 && (
                    coinRecords.length > 0
                      ? coinRecords.map(r => (
                          <WeeklyRecordRow
                            key={r.id}
                            title={r.label}
                            meta={r.dateLabel}
                            right={`${r.isIncome ? '+' : '-'}${r.amount} 枚`}
                            rightTone={r.isIncome ? 'in' : 'out'}
                          />
                        ))
                      : <RecordEmpty text="本週沒有成長幣異動。" />
                  )}
                  {recordTab === 2 && (
                    timeSavingRecords.length > 0
                      ? timeSavingRecords.map(r => (
                          <WeeklyRecordRow
                            key={r.id}
                            title={r.taskName}
                            meta={`${r.dateLabel} · ${r.poolLabel}`}
                            right={`+${r.minutes} 分鐘`}
                            rightTone="in"
                          />
                        ))
                      : <RecordEmpty text="本週沒有時間儲蓄紀錄。" />
                  )}
                  {recordTab === 3 && (
                    redemptionRecords.length > 0
                      ? redemptionRecords.map(r => (
                          <WeeklyRecordRow
                            key={r.id}
                            title={r.name}
                            meta={`${r.dateLabel} · ${r.status}`}
                            right={`-${r.coinCost} 枚`}
                            rightTone="out"
                          />
                        ))
                      : <RecordEmpty text="本週沒有獎勵兌換紀錄。" />
                  )}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* ── Monthly view ─────────────────────────────────────────────── */}
      {view === 'monthly' && <MonthlyView childId={childId} />}

      {/* ── History placeholder ───────────────────────────────────────── */}
      {view === 'history' && <HistoryView childId={childId} />}

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
    fontSize: ParentFontSizes.h1,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    letterSpacing: -0.5,
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
  summaryCard: {
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.xl,
    padding: 24,
    overflow: 'hidden',
    ...ParentShadows.card,
  },
  summaryText: {
    fontFamily: ParentFonts.display,
    fontSize: 18,
    lineHeight: 31,
    color: ParentColors.fgSecondary,
  },
  summaryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ParentColors.borderMedium,
  },
  weeklyOverviewGrid: {
    flexDirection: 'row',
    gap: 24,
  },
  weeklyMetricsCol: {
    flex: 1.75,
    minWidth: 0,
  },
  distributionCol: {
    flex: 1,
    minWidth: 260,
    paddingLeft: 24,
    borderLeftWidth: 1,
    borderLeftColor: ParentColors.borderSoft,
    gap: 16,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  metricTile: {
    flex: 1,
    minWidth: 128,
    padding: 14,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
  },
  metricIconWrap: {
    marginBottom: 12,
  },
  metricLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },
  metricValue: {
    fontFamily: ParentFonts.display,
    fontSize: 25,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    marginTop: 9,
  },
  metricValueCompact: {
    fontSize: 16,
    marginTop: 8,
  },
  metricValueGreen: {
    color: ParentColors.success,
  },
  metricValueOrange: {
    color: ParentColors.warn,
  },
  metricNote: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.fgMuted,
    marginTop: 5,
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
    color: ParentColors.fgSecondary,
  },
  catLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  catCount: {
    fontFamily: ParentFonts.display,
    fontSize: 15,
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
    height: 5,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.bgSurfaceWarm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: ParentRadii.pill,
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

  // ── 紀錄 tab：調整歷史 ──
  historyScroll: {
    flex: 1,
  },
  historyScrollContent: {
    padding: ParentSpacing.cardPad,
    gap: 12,
  },
  historyGroup: {
    gap: 8,
  },
  historyGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  historyGroupTitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  historyGroupChevron: {
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },
  historySubGroup: {
    gap: 6,
    marginTop: 4,
    marginLeft: 8,
  },
  historySubGroupTitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  historyList: {
    gap: 8,
  },
  historyRow: {
    backgroundColor: ParentColors.bgCanvas,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    padding: 14,
    gap: 4,
  },
  historyRowText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgPrimary,
    lineHeight: 20,
  },
  historyRowMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },

  // ── Monthly reflection input ──────────────────────────────────────────────
  reflectionInput: {
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    padding: 14,
    fontFamily: ParentFonts.body,
    fontSize: 14,
    lineHeight: 22,
    color: ParentColors.fgPrimary,
    minHeight: 120,
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
    alignItems: 'center',
    gap: 14,
    backgroundColor: ParentColors.bgSurface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ParentColors.borderSoft,
    paddingVertical: 14,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  ltgGoalIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ltgGoalIconText: {
    fontFamily: ParentFonts.body,
    fontSize: 15,
    fontWeight: ParentFontWeights.bold,
  },
  ltgGoalMain: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  ltgMetaLine: {
    fontFamily: ParentFonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: ParentColors.fgMuted,
  },
  ltgStableText: {
    color: ParentColors.success,
  },
  ltgAdjustText: {
    color: ParentColors.warn,
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
    fontFamily: ParentFonts.body,
    fontSize: 15,
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
    color: ParentColors.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: ParentRadii.sm,
    backgroundColor: ParentColors.teal50,
    overflow: 'hidden',
  },
  ltgScoreDiff: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    color: ParentColors.fgMuted,
    marginLeft: 'auto' as unknown as number,
  },
  ltgProgressTrack: {
    width: 180,
    height: 6,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.bgSurfaceWarm,
    overflow: 'hidden',
  },
  ltgProgressFill: {
    height: '100%',
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.success,
  },
  ltgProgressArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
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
  reviewPromptList: {
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    overflow: 'hidden',
  },
  reviewPromptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  reviewPromptDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: ParentColors.teal50,
    borderWidth: 1,
    borderColor: ParentColors.teal100,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewPromptDotOrange: {
    backgroundColor: '#FBF1DC',
    borderColor: '#EFCDA6',
  },
  reviewPromptBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  reviewPromptTitle: {
    fontFamily: ParentFonts.body,
    fontSize: 15,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  reviewPromptText: {
    fontFamily: ParentFonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: ParentColors.fgSecondary,
  },
  scheduleDiffText: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.accent,
    marginTop: 6,
  },
  editBox: {
    marginTop: 8,
    gap: 8,
  },
  editLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  editPeriodRow: {
    flexDirection: 'row',
    gap: 6,
  },
  editPeriodChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  editPeriodChipActive: {
    borderColor: ParentColors.teal100,
    backgroundColor: ParentColors.teal50,
  },
  editPeriodChipText: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.fgSecondary,
  },
  editPeriodChipTextActive: {
    color: ParentColors.accent,
    fontWeight: ParentFontWeights.semi,
  },
  editStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  editStepperBtn: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editStepperBtnText: {
    fontFamily: ParentFonts.body,
    fontSize: 15,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.accent,
  },
  editStepperValue: {
    fontFamily: ParentFonts.body,
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    minWidth: 16,
    textAlign: 'center',
  },
  reviewPromptActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  adoptBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.teal100,
    backgroundColor: ParentColors.teal50,
    minWidth: 76,
    alignItems: 'center',
  },
  adoptBtnText: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.accent,
  },
  deferBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: 'transparent',
  },
  deferBtnText: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  adoptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.teal50,
  },
  adoptedBadgeText: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.teal500,
  },
  adoptErrorText: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.warn,
    width: '100%',
  },
  dialogueCard: {
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.xl,
    padding: 24,
    ...ParentShadows.card,
  },
  dialogueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  dialogueIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: ParentColors.teal50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogueLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.fgMuted,
    marginBottom: 8,
  },
  dialogueText: {
    fontFamily: ParentFonts.display,
    fontSize: 16,
    lineHeight: 28,
    color: ParentColors.fgSecondary,
  },
  dialogueFootnote: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.fgMuted,
    marginTop: 14,
  },
  affirmationLine: {
    marginBottom: 8,
  },
  recordTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.pill,
    overflow: 'hidden',
    backgroundColor: ParentColors.bgSurfaceWarm,
    marginBottom: 12,
  },
  recordTab: {
    minWidth: 128,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  recordTabActive: {
    backgroundColor: ParentColors.accent,
  },
  recordTabText: {
    fontFamily: ParentFonts.body,
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },
  recordTabTextActive: {
    color: '#fff',
  },
  recordList: {
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    overflow: 'hidden',
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  recMain: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  recTitle: {
    fontFamily: ParentFonts.body,
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  recMeta: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.fgMuted,
  },
  recRight: {
    fontFamily: ParentFonts.display,
    fontSize: 14,
    fontWeight: ParentFontWeights.bold,
    flexShrink: 0,
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
