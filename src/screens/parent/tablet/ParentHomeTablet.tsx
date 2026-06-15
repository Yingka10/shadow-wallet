// Shadow Wallet · Parent Tablet — Tab 1 首頁 (Dashboard)
// Layout: left sidebar (child switcher + briefing) │ main area (overview strip + goal + tasks) │ right column (static placeholder)
// Data: useParentDashboard + useSelectedChild — no new hooks, no new Supabase queries.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StyleSheet,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { useSelectedChild } from '../../../context/SelectedChildContext';
import {
  useParentDashboard,
  type DashboardTask,
  type DashboardTaskStatus,
  type DashboardGoal,
} from '../../../hooks/useParentDashboard';
import {
  useParentRedemption,
  type RedemptionRequest,
  type ChildWishItem,
  getAiResult,
} from '../../../hooks/useParentRedemption';
import {
  parentMarkTask,
  createLongTermGoal,
  createSkillGoal,
  calcSkillDefaultCoins,
  clampSkillCoin,
  skillCoinsAreValid,
  MAX_SKILL_MILESTONE_COIN,
  createFamilyGoal,
  MIN_FAMILY_TIME,
  MAX_FAMILY_TIME,
  type MarkOption,
} from '../../../lib/taskActions';
import {
  ParentColors,
  ParentSpacing,
  ParentRadii,
  ParentShadows,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
} from '../../../constants/parentTheme';
import type { TaskCategory, LongTermType } from '../../../types/database';
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

function TaskRow({
  task,
  isLast,
  childId,
  onMarked,
}: {
  task: DashboardTask;
  isLast: boolean;
  childId: string;
  onMarked: () => void;
}) {
  const cat = TASK_CAT_META[task.cat];

  const statusConfig: Record<DashboardTaskStatus, { tone: PillTone; label: string; icon?: React.ReactElement }> = {
    done:    { tone: 'sage',    label: '已完成', icon: <CheckSmIcon /> },
    pending: { tone: 'neutral', label: task.cat === 'D' ? '待孩子打卡' : '待完成' },
    missed:  { tone: 'warn',    label: '今日未做' },
    review:  { tone: 'clay',    label: '待審核' },
  };
  const st = statusConfig[task.status];
  const isDone = task.status === 'done';
  const [markOpen, setMarkOpen] = useState(false);

  return (
    <View style={!isLast ? styles.taskRowDivider : undefined}>
      <View style={styles.taskRow}>
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
            <TouchableOpacity
              style={[styles.taskActionBtn, markOpen && styles.taskActionBtnActive]}
              onPress={() => setMarkOpen(v => !v)}
              activeOpacity={0.7}
            >
              <Text style={[styles.taskActionText, markOpen && styles.taskActionTextActive]}>
                {markOpen ? '收起' : '標記'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.taskRemindBtn} activeOpacity={0.7}>
              <Text style={styles.taskRemindText}>提醒</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* MarkPanel expands below the row */}
      {markOpen && isDone && (
        <MarkPanel
          task={task}
          childId={childId}
          onSuccess={() => {
            setMarkOpen(false);
            onMarked();
          }}
          onCancel={() => setMarkOpen(false)}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MarkPanel — inline override UI rendered below a done TaskRow
// ─────────────────────────────────────────────────────────────────────────────

const MARK_OPTIONS: { opt: MarkOption; label: string }[] = [
  { opt: 'exceeded', label: '超出預期' },
  { opt: 'partial',  label: '部分完成' },
  { opt: 'none',     label: '今天沒做' },
  { opt: 'other',    label: '其他' },
];

function MarkPanel({
  task,
  childId,
  onSuccess,
  onCancel,
}: {
  task: DashboardTask;
  childId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const hasCoin      = task.reward?.kind === 'coins';
  const originalCoin = hasCoin
    ? (task.reward as { kind: 'coins'; amount: number }).amount
    : 0;

  const defaultCoin = (opt: MarkOption): number => {
    if (!hasCoin) return 0;
    if (opt === 'exceeded') return Math.round(originalCoin * 1.5);
    if (opt === 'partial')  return Math.round(originalCoin * 0.5);
    if (opt === 'none')     return 0;
    return originalCoin; // 'other'
  };

  const [selectedOption, setSelectedOption] = useState<MarkOption | null>(null);
  const [coinStr, setCoinStr]               = useState<string>('');
  const [note, setNote]                     = useState('');
  const [submitting, setSubmitting]         = useState(false);
  const [errorMsg, setErrorMsg]             = useState<string | null>(null);

  const handleOptionSelect = (opt: MarkOption) => {
    setSelectedOption(opt);
    setCoinStr(String(defaultCoin(opt)));
    setErrorMsg(null);
  };

  const isConfirmDisabled =
    selectedOption == null ||
    (selectedOption === 'other' && note.trim() === '') ||
    submitting;

  const handleConfirm = async () => {
    if (selectedOption == null) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await parentMarkTask(
        task.id,
        childId,
        selectedOption,
        Math.max(0, parseInt(coinStr || '0', 10)),
        note.trim() !== '' ? note.trim() : null,
      );
      onSuccess();
    } catch {
      setErrorMsg('標記失敗，請再試一次');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.markPanel}>
      {/* Option chips */}
      <View style={styles.markPanelOptions}>
        {MARK_OPTIONS.map(({ opt, label }) => (
          <TouchableOpacity
            key={opt}
            style={[
              styles.markOptionChip,
              selectedOption === opt && styles.markOptionChipSelected,
            ]}
            onPress={() => handleOptionSelect(opt)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.markOptionText,
                selectedOption === opt && styles.markOptionTextSelected,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Coin adjustment input — only when task has coins and an option is selected */}
      {hasCoin && selectedOption != null && (
        <View style={styles.markCoinRow}>
          <Text style={styles.markCoinLabel}>調整幣值：</Text>
          <TextInput
            style={styles.markCoinInput}
            value={coinStr}
            onChangeText={(v) => {
              if (/^\d*$/.test(v)) setCoinStr(v);
            }}
            keyboardType="number-pad"
            selectTextOnFocus
          />
        </View>
      )}

      {/* Note input — shown once option is selected */}
      {selectedOption != null && (
        <View style={styles.markNoteRow}>
          <Text style={styles.markNoteLabel}>
            {selectedOption === 'other' ? '備註（必填）：' : '備註（選填）：'}
          </Text>
          <TextInput
            style={styles.markNoteInput}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={100}
            placeholder="寫下你的觀察..."
            placeholderTextColor={ParentColors.fgMuted}
          />
        </View>
      )}

      {/* Inline error */}
      {errorMsg != null && (
        <Text style={styles.markErrorMsg}>{errorMsg}</Text>
      )}

      {/* Actions */}
      <View style={styles.markActions}>
        <TouchableOpacity
          style={styles.markCancelBtn}
          onPress={onCancel}
          activeOpacity={0.7}
        >
          <Text style={styles.markCancelText}>取消</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.markConfirmBtn,
            isConfirmDisabled && styles.markConfirmBtnDisabled,
          ]}
          onPress={() => { void handleConfirm(); }}
          disabled={isConfirmDisabled}
          activeOpacity={0.7}
        >
          <Text style={styles.markConfirmText}>
            {submitting ? '處理中...' : '確認標記 →'}
          </Text>
        </TouchableOpacity>
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
  onAssignTask,
  onNewTask,
  childId,
  onMarked,
}: {
  tasks: DashboardTask[];
  doneToday: number;
  totalToday: number;
  onAssignTask: () => void;
  onNewTask: () => void;
  childId: string;
  onMarked: () => void;
}) {
  const todayLabel = dayjs().format('MM/DD dd');

  return (
    <View style={styles.taskPanel}>
      {/* Action buttons (moved above 今日任務) */}
      <View style={styles.taskFooter}>
        <TouchableOpacity style={styles.footerBtnBrass} activeOpacity={0.8} onPress={onAssignTask}>
          <Text style={styles.footerBtnText}>＋ 指派任務</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerBtnNavy} activeOpacity={0.8} onPress={onNewTask}>
          <Text style={styles.footerBtnText}>＋ 建立新任務</Text>
        </TouchableOpacity>
      </View>

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
          <TaskRow
            key={t.id}
            task={t}
            isLast={i === tasks.length - 1}
            childId={childId}
            onMarked={onMarked}
          />
        ))
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Right column — assign task panel (指派任務 兩步驟表單)
// ─────────────────────────────────────────────────────────────────────────────

type RecentTaskEntry = { name: string; coin_override: number };

function AssignTaskPanel({
  allChildren,
  currentChildId,
  familyId,
  onDone,
}: {
  allChildren: ChildOption[];
  currentChildId: string;
  familyId: string | null;
  onDone: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [taskName, setTaskName] = useState('');
  const [coins, setCoins] = useState(8);
  const [targetChildId, setTargetChildId] = useState(currentChildId);
  const [childPickerOpen, setChildPickerOpen] = useState(false);
  const [recentTasks, setRecentTasks] = useState<RecentTaskEntry[]>([]);
  const [suggestedRange, setSuggestedRange] = useState<[number, number] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!familyId) return;
    async function loadRecent() {
      const { data } = await supabase
        .from('tasks')
        .select('name, coin_override')
        .eq('family_id', familyId!)
        .eq('is_system_default', false)
        .not('coin_override', 'is', null)
        .order('created_at', { ascending: false })
        .limit(30);
      if (!data) return;
      const seen = new Set<string>();
      const unique: RecentTaskEntry[] = [];
      for (const t of data) {
        if (t.coin_override != null && !seen.has(t.name)) {
          seen.add(t.name);
          unique.push({ name: t.name, coin_override: t.coin_override as number });
        }
        if (unique.length >= 6) break;
      }
      setRecentTasks(unique);
    }
    void loadRecent();
  }, [familyId]);

  function handleNext() {
    const trimmed = taskName.trim();
    if (!trimmed) return;
    const match = recentTasks.find(t => t.name === trimmed);
    setCoins(match?.coin_override ?? 8);
    setSuggestedRange(null);
    setStep(2);
    if (!match && familyId) {
      void supabase.functions.invoke('ai-proxy', {
        body: { type: 'suggestTaskCoin', payload: { taskName: trimmed } },
      }).then(({ data: aiData }) => {
        const suggested = (aiData as { coins?: number } | null)?.coins;
        if (typeof suggested === 'number' && Number.isFinite(suggested)) {
          setSuggestedRange([Math.max(1, suggested - 2), suggested + 3]);
        }
      }).catch(() => undefined);
    }
  }

  async function handleSubmit() {
    const trimmed = taskName.trim();
    if (submitting || !trimmed || !familyId) return;
    setSubmitting(true);
    try {
      const today = dayjs().format('YYYY-MM-DD');
      const { data: task, error: taskErr } = await supabase
        .from('tasks')
        .insert({
          family_id: familyId,
          name: trimmed,
          category: 'C' as const,
          day_type: 'both' as const,
          long_term_type: null,
          is_long_term: false,
          base_time_min: 15,
          difficulty: 1,
          coin_override: coins,
          is_system_default: false,
          allow_repeat: false,
          min_age: 0,
          max_age: 18,
          is_active: true,
          time_saving_min: 0,
          recurrence_days: null,
          due_date: today,
        })
        .select('id')
        .single();
      if (taskErr || !task) throw taskErr ?? new Error('建立任務失敗');
      const { error: ctErr } = await supabase.from('child_tasks').insert({
        child_id: targetChildId,
        task_id: task.id,
        is_active: true,
      });
      if (ctErr) {
        await supabase.from('tasks').delete().eq('id', task.id);
        throw ctErr;
      }
      const childName = allChildren.find(c => c.id === targetChildId)?.nickname ?? '孩子';
      setDoneMsg(`已指派給${childName}·「${trimmed}」· 完成可得 ${coins} 幣`);
      setTimeout(() => onDone(), 2200);
    } catch (err) {
      console.error('[AssignTaskPanel] submit error:', err);
      setSubmitting(false);
    }
  }

  const targetChild = allChildren.find(c => c.id === targetChildId);

  if (doneMsg) {
    return (
      <View style={styles.assignPanel}>
        <View style={styles.assignDoneCard}>
          <Text style={styles.assignDoneText}>✓ {doneMsg}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.assignPanel}>
      {/* Header */}
      <View style={styles.assignHeader}>
        <TouchableOpacity onPress={onDone} style={styles.assignBackBtn} activeOpacity={0.7}>
          <Text style={styles.assignBackText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.assignPanelTitle}>指派任務</Text>
      </View>

      {step === 1 ? (
        <>
          <Text style={styles.assignFieldLabel}>要請孩子做什麼？</Text>
          <TextInput
            style={styles.assignInput}
            value={taskName}
            onChangeText={setTaskName}
            placeholder="例如：洗碗、整理書桌、倒垃圾"
            placeholderTextColor={ParentColors.fgMuted}
            returnKeyType="next"
            onSubmitEditing={handleNext}
            autoFocus
          />

          {recentTasks.length > 0 ? (
            <>
              <Text style={styles.assignChipLabel}>最近指派過的</Text>
              <View style={styles.assignChipRow}>
                {recentTasks.map(t => (
                  <TouchableOpacity
                    key={t.name}
                    style={styles.assignChip}
                    onPress={() => setTaskName(t.name)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.assignChipText}>{t.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.assignChipEmpty}>
              之後你指派過的任務會出現在這裡，方便重複指派
            </Text>
          )}

          <TouchableOpacity
            style={[styles.assignPrimaryBtn, !taskName.trim() && styles.assignPrimaryBtnDisabled]}
            onPress={handleNext}
            disabled={!taskName.trim()}
            activeOpacity={0.8}
          >
            <Text style={styles.assignPrimaryBtnText}>下一步</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          {/* Task name row */}
          <View style={styles.assignStep2Row}>
            <Text style={styles.assignStep2Label}>任務</Text>
            <Text style={styles.assignStep2Name} numberOfLines={1}>{taskName}</Text>
            <TouchableOpacity
              onPress={() => { setStep(1); setSuggestedRange(null); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.assignEditLink}>修改</Text>
            </TouchableOpacity>
          </View>

          {/* Target child */}
          <Text style={styles.assignFieldLabel}>指派給</Text>
          <TouchableOpacity
            style={styles.assignTargetBtn}
            onPress={allChildren.length > 1 ? () => setChildPickerOpen(o => !o) : undefined}
            activeOpacity={allChildren.length > 1 ? 0.7 : 1}
          >
            <Text style={styles.assignTargetName}>{targetChild?.nickname ?? '孩子'}</Text>
            {allChildren.length > 1 && (
              <Text style={styles.assignTargetChevron}>{childPickerOpen ? '▲' : '▼'}</Text>
            )}
          </TouchableOpacity>
          {childPickerOpen && (
            <View style={styles.assignChildPicker}>
              {allChildren.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.assignChildOption, c.id === targetChildId && styles.assignChildOptionActive]}
                  onPress={() => { setTargetChildId(c.id); setChildPickerOpen(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.assignChildOptionText, c.id === targetChildId && styles.assignChildOptionTextActive]}>
                    {c.nickname}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Coin amount */}
          <Text style={styles.assignFieldLabel}>孩子完成後可以得到</Text>
          <View style={styles.assignCoinRow}>
            <TouchableOpacity
              style={styles.assignCoinStepBtn}
              onPress={() => setCoins(c => Math.max(1, c - 1))}
              activeOpacity={0.7}
            >
              <Text style={styles.assignCoinStepText}>－</Text>
            </TouchableOpacity>
            <View style={styles.assignCoinDisplay}>
              <CoinSmIcon size={20} color="#A87800" />
              <Text style={styles.assignCoinNum}>{coins}</Text>
              <Text style={styles.assignCoinUnit}>幣</Text>
            </View>
            <TouchableOpacity
              style={styles.assignCoinStepBtn}
              onPress={() => setCoins(c => Math.min(100, c + 1))}
              activeOpacity={0.7}
            >
              <Text style={styles.assignCoinStepText}>＋</Text>
            </TouchableOpacity>
          </View>
          {suggestedRange != null && (
            <Text style={styles.assignRangeHint}>建議 {suggestedRange[0]}–{suggestedRange[1]} 個</Text>
          )}

          <TouchableOpacity
            style={[styles.assignPrimaryBtn, submitting && styles.assignPrimaryBtnDisabled]}
            onPress={() => void handleSubmit()}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.assignPrimaryBtnText}>指派給孩子</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Right column — build new task panel
// ─────────────────────────────────────────────────────────────────────────────

function NewTaskPanel({
  currentChildId,
  familyId,
  onSuccess,
  onDone,
}: {
  currentChildId: string;
  familyId: string | null;
  onSuccess: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [taskKind, setTaskKind] = useState<'general' | 'longTerm' | null>(null);
  const [longTermType, setLongTermType] = useState<LongTermType | null>(null);
  const [taskName, setTaskName] = useState('');
  const [rewardMode, setRewardMode] = useState<'coin' | 'time'>('coin');
  const [coins, setCoins] = useState(5);
  const [aiBaseTime, setAiBaseTime] = useState<number | null>(null);
  const [aiCoinRange, setAiCoinRange] = useState<[number, number] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const isMounted = useRef(true);
  useEffect(() => () => { isMounted.current = false; }, []);

  // ── Habit task state ──────────────────────────────────────────────────────
  const [habitName, setHabitName] = useState('');
  const [totalDaysPreset, setTotalDaysPreset] = useState<21 | 30 | 60 | 'custom'>(30);
  const [customDaysStr, setCustomDaysStr] = useState('');

  const effectiveTotalDays: number | null = (() => {
    if (totalDaysPreset !== 'custom') return totalDaysPreset;
    const n = parseInt(customDaysStr, 10);
    return Number.isFinite(n) && n >= 7 && n <= 180 ? n : null;
  })();

  const MAX_CHECKPOINT_COIN = 25;
  const [checkpointCoins, setCheckpointCoins] = useState<[number, number, number]>([8, 15, 25]);
  const [activeDaysHabit, setActiveDaysHabit] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [habitSubmitting, setHabitSubmitting] = useState(false);

  // ── Skill task state ──────────────────────────────────────────────────────
  const SKILL_MILESTONE_NAME_MAX = 30;
  const [milestoneNames, setMilestoneNames] = useState<string[]>(['學習目標一', '學習目標二', '學習目標三']);
  const [skillCoins, setSkillCoins] = useState<number[]>(calcSkillDefaultCoins(3));
  const [skillMonthsPreset, setSkillMonthsPreset] = useState<1 | 3 | 6 | 'custom'>(3);
  const [skillCustomMonthsStr, setSkillCustomMonthsStr] = useState('');
  const [skillSubmitting, setSkillSubmitting] = useState(false);

  const skillNamesValid = milestoneNames.every(n => n.trim().length > 0);

  function addMilestone() {
    setMilestoneNames(prev => {
      if (prev.length >= 5) return prev;
      const next = [...prev, `學習目標${prev.length + 1}`];
      setSkillCoins(calcSkillDefaultCoins(next.length));
      return next;
    });
  }

  function removeMilestone(index: number) {
    setMilestoneNames(prev => {
      if (prev.length <= 2) return prev;
      const next = prev.filter((_, i) => i !== index);
      setSkillCoins(cur => {
        const trimmed = cur.filter((_, i) => i !== index);
        return skillCoinsAreValid(trimmed) ? trimmed : calcSkillDefaultCoins(next.length);
      });
      return next;
    });
  }

  function updateMilestoneName(index: number, value: string) {
    setMilestoneNames(prev => prev.map((n, i) => (i === index ? value.slice(0, SKILL_MILESTONE_NAME_MAX) : n)));
  }

  function stepSkillCoin(index: number, delta: number) {
    setSkillCoins(prev => prev.map((c, i) => (i === index ? clampSkillCoin(c + delta) : c)));
  }

  const effectiveTargetMonths: number | null = (() => {
    if (skillMonthsPreset !== 'custom') return skillMonthsPreset;
    const n = parseInt(skillCustomMonthsStr, 10);
    return Number.isFinite(n) && n >= 1 && n <= 24 ? n : null;
  })();

  // ── Family task state ─────────────────────────────────────────────────────
  const [familyTaskName, setFamilyTaskName] = useState('');
  const [activeDaysFamily, setActiveDaysFamily] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [familyTimePreset, setFamilyTimePreset] = useState<15 | 30 | 60 | 'custom'>(30);
  const [customFamilyTimeStr, setCustomFamilyTimeStr] = useState('');
  const [familyCommitPreset, setFamilyCommitPreset] = useState<4 | 8 | 12 | 'custom'>(8);
  const [customCommitWeeksStr, setCustomCommitWeeksStr] = useState('');
  const [familySubmitting, setFamilySubmitting] = useState(false);

  const effectiveFamilyTime: number | null = (() => {
    if (familyTimePreset !== 'custom') return familyTimePreset;
    const n = parseInt(customFamilyTimeStr, 10);
    return Number.isFinite(n) && n >= MIN_FAMILY_TIME && n <= MAX_FAMILY_TIME ? n : null;
  })();

  const effectiveCommitWeeks: number | null = (() => {
    if (familyCommitPreset !== 'custom') return familyCommitPreset;
    const n = parseInt(customCommitWeeksStr, 10);
    return Number.isFinite(n) && n >= 1 && n <= 24 ? n : null;
  })();

  function toggleActiveDayFamily(dow: number) {
    setActiveDaysFamily(prev => {
      if (prev.includes(dow)) {
        if (prev.length === 1) return prev;
        return prev.filter(d => d !== dow);
      }
      return [...prev, dow];
    });
  }

  function handleNext() {
    const trimmed = taskName.trim();
    if (!trimmed) return;
    setStep(2);
    setAiLoading(true);
    void supabase.functions
      .invoke('ai-proxy', {
        body: { type: 'classifyTask', payload: { taskName: trimmed } },
      })
      .then(({ data }) => {
        if (!isMounted.current) return;
        const ai = data as { base_time_min?: number; difficulty?: number } | null;
        if (ai?.base_time_min != null && ai?.difficulty != null) {
          const suggested = Math.max(
            1,
            Math.min(15, Math.round((ai.base_time_min as number) * (ai.difficulty as number))),
          );
          setAiBaseTime(ai.base_time_min as number);
          setAiCoinRange([Math.max(1, suggested - 2), suggested + 3]);
          setCoins(suggested);
        }
        setAiLoading(false);
      })
      .catch(() => { if (isMounted.current) setAiLoading(false); });
  }

  function toggleDay(d: number) {
    setSelectedDays(prev => {
      if (prev.includes(d)) {
        if (prev.length === 1) return prev;
        return prev.filter(x => x !== d);
      }
      return [...prev, d];
    });
  }

  function deriveDayInfo(): {
    day_type: 'weekday' | 'weekend' | 'both' | 'custom';
    recurrence_days: number[] | null;
  } {
    const sorted = [...selectedDays].sort((a, b) => a - b);
    if (sorted.length === 5 && JSON.stringify(sorted) === JSON.stringify([1, 2, 3, 4, 5]))
      return { day_type: 'weekday', recurrence_days: null };
    if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6)
      return { day_type: 'weekend', recurrence_days: null };
    if (sorted.length === 7) return { day_type: 'both', recurrence_days: null };
    return { day_type: 'custom', recurrence_days: sorted };
  }

  function formatPeriod(): string {
    const sorted = [...selectedDays].sort((a, b) => a - b);
    if (JSON.stringify(sorted) === JSON.stringify([1, 2, 3, 4, 5])) return '每週平日（一至五）';
    if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) return '每週六、日';
    if (sorted.length === 7) return '每天';
    const MAP: Record<number, string> = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };
    return '每週' + sorted.map(d => MAP[d]).join('、');
  }

  function calcCheckpointDays(total: number): [number, number, number] {
    return [
      Math.round(total / 3),
      Math.round((total * 2) / 3),
      total,
    ];
  }

  function clampCoin(v: number): number {
    return Math.max(1, Math.min(MAX_CHECKPOINT_COIN, v));
  }

  function coinsAreValid(): boolean {
    const [a, b, c] = checkpointCoins;
    return b >= a && c >= b;
  }

  function checkpointLabel(index: 0 | 1 | 2): string {
    if (!effectiveTotalDays) return '';
    const days = calcCheckpointDays(effectiveTotalDays);
    const isEveryDay = activeDaysHabit.length === 7;
    return isEveryDay ? `Day ${days[index]} 達成` : `第 ${days[index]} 次達成`;
  }

  function toggleActiveDayHabit(dow: number) {
    setActiveDaysHabit(prev => {
      if (prev.includes(dow)) {
        if (prev.length === 1) return prev; // keep at least 1
        return prev.filter(d => d !== dow);
      }
      return [...prev, dow];
    });
  }

  function formatActiveDays(days: number[]): string {
    const MAP: Record<number, string> = {
      0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六',
    };
    const sorted = [...days].sort((a, b) => a - b);
    if (sorted.length === 7) return '每天';
    if (JSON.stringify(sorted) === JSON.stringify([1,2,3,4,5])) return '週一至週五';
    if (JSON.stringify(sorted) === JSON.stringify([0,6])) return '週六、日';
    return '每週' + sorted.map(d => MAP[d]).join('、');
  }

  async function handleSubmit() {
    const trimmed = taskName.trim();
    if (submitting || !trimmed || !familyId) return;
    setSubmitting(true);
    const { day_type, recurrence_days } = deriveDayInfo();
    const baseTime = aiBaseTime ?? 5;
    try {
      const { data: task, error: taskErr } = await supabase
        .from('tasks')
        .insert({
          family_id: familyId,
          name: trimmed,
          category: rewardMode === 'coin' ? ('C' as const) : ('B' as const),
          day_type,
          recurrence_days,
          long_term_type: null,
          is_long_term: false,
          base_time_min: baseTime,
          difficulty: 1,
          coin_override: rewardMode === 'coin' ? coins : null,
          time_saving_min: rewardMode === 'time' ? baseTime : 0,
          is_system_default: false,
          allow_repeat: true,
          min_age: 0,
          max_age: 18,
          is_active: true,
          due_date: null,
        })
        .select('id')
        .single();
      if (taskErr || !task) throw taskErr ?? new Error('建立任務失敗');
      const { error: ctErr } = await supabase.from('child_tasks').insert({
        child_id: currentChildId,
        task_id: task.id,
        is_active: true,
      });
      if (ctErr) {
        const { error: delErr } = await supabase.from('tasks').delete().eq('id', task.id);
        if (delErr) console.error('[NewTaskPanel] rollback failed:', delErr);
        throw ctErr;
      }
      setSubmitting(false);
      setDone(true);
      onSuccess();
    } catch (err) {
      console.error('[NewTaskPanel] submit error:', err);
      setSubmitting(false);
    }
  }

  async function handleHabitSubmit() {
    if (habitSubmitting || !familyId || !effectiveTotalDays || !coinsAreValid()) return;
    setHabitSubmitting(true);
    try {
      const days = calcCheckpointDays(effectiveTotalDays);
      const [a, b, c] = checkpointCoins;
      await createLongTermGoal({
        familyId,
        childId: currentChildId,
        name: habitName.trim(),
        totalDays: effectiveTotalDays,
        checkpointRewards: {
          [String(days[0])]: clampCoin(a),
          [String(days[1])]: clampCoin(b),
          [String(days[2])]: clampCoin(c),
        },
        activeDays: activeDaysHabit.length === 7 ? undefined : activeDaysHabit,
      });
      setTaskName(habitName.trim()); // done screen shows the habit name
      setHabitSubmitting(false);
      setDone(true);
      onSuccess();
    } catch (err) {
      console.error('[NewTaskPanel] habit submit error:', err);
      setHabitSubmitting(false);
    }
  }

  async function handleSkillSubmit() {
    if (
      skillSubmitting || !familyId || !effectiveTargetMonths ||
      !skillNamesValid || !skillCoinsAreValid(skillCoins)
    ) return;
    setSkillSubmitting(true);
    try {
      await createSkillGoal({
        familyId,
        childId: currentChildId,
        name: taskName.trim(),
        milestones: milestoneNames.map((name, i) => ({
          name,                       // createSkillGoal 內部會 trim
          coin: skillCoins[i],
        })),
        targetMonths: effectiveTargetMonths,
      });
      setSkillSubmitting(false);
      setDone(true);
      onSuccess();
    } catch (err) {
      console.error('[NewTaskPanel] skill submit error:', err);
      setSkillSubmitting(false);
    }
  }

  function formatSkillMonths(): string {
    if (effectiveTargetMonths == null) return '';
    return `約 ${effectiveTargetMonths} 個月`;
  }

  async function handleFamilySubmit() {
    if (
      familySubmitting || !familyId ||
      !familyTaskName.trim() || activeDaysFamily.length === 0 ||
      effectiveFamilyTime == null || effectiveCommitWeeks == null
    ) return;
    setFamilySubmitting(true);
    try {
      await createFamilyGoal({
        familyId,
        childId: currentChildId,
        name: familyTaskName.trim(),
        activeDays: activeDaysFamily,
        timeMin: effectiveFamilyTime,
        commitWeeks: effectiveCommitWeeks,
      });
      setTaskName(familyTaskName.trim());
      setFamilySubmitting(false);
      setDone(true);
      onSuccess();
    } catch (err) {
      console.error('[NewTaskPanel] family submit error:', err);
      setFamilySubmitting(false);
    }
  }

  function formatFamilyCommitWeeks(): string {
    if (effectiveCommitWeeks == null) return '';
    const targetCompletions = activeDaysFamily.length * effectiveCommitWeeks;
    return `${effectiveCommitWeeks} 週（共 ${targetCompletions} 次）`;
  }

  const DAY_LABELS: { value: number; label: string }[] = [
    { value: 1, label: '一' },
    { value: 2, label: '二' },
    { value: 3, label: '三' },
    { value: 4, label: '四' },
    { value: 5, label: '五' },
    { value: 6, label: '六' },
    { value: 0, label: '日' },
  ];

  if (done) {
    return (
      <View style={styles.newTaskPanel}>
        <View style={styles.newTaskHeader}>
          <TouchableOpacity onPress={onDone} style={styles.newTaskBackBtn} activeOpacity={0.7}>
            <Text style={styles.newTaskBackText}>← 返回</Text>
          </TouchableOpacity>
          <Text style={styles.newTaskPanelTitle}>建立新任務</Text>
        </View>
        <View style={styles.newTaskDoneCard}>
          <Text style={styles.newTaskDoneIcon}>✓</Text>
          <Text style={styles.newTaskDoneTitle}>任務已建立</Text>
          <Text style={styles.newTaskDoneSub}>「{taskName}」已加入任務清單，可在左側看到。</Text>
          <TouchableOpacity style={styles.newTaskPrimaryBtn} onPress={onDone} activeOpacity={0.8}>
            <Text style={styles.newTaskPrimaryBtnText}>完成</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.newTaskPanel}>
      {/* Header */}
      <View style={styles.newTaskHeader}>
        <TouchableOpacity
          onPress={() => {
            if (step === 0) {
              if (taskKind === 'longTerm') setTaskKind(null); // 0b → 0a
              else onDone();                                   // 0a → exit
            } else if (step === 1) {
              setStep(0);
              if (taskKind === 'general') setTaskKind(null);  // back to 0a
              // habit: stays step=0 + taskKind='longTerm' → shows 0b
            } else {
              setStep(s => (s - 1) as 1 | 2 | 3 | 4);
            }
          }}
          style={styles.newTaskBackBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.newTaskBackText}>
            {step === 0 && taskKind !== 'longTerm' ? '← 返回' : '← 上一步'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.newTaskPanelTitle}>
            {longTermType != null ? '建立長期任務' : '建立新任務'}
          </Text>
      </View>

      {/* Step 0a — task kind picker */}
      {step === 0 && taskKind === null && (
        <>
          <Text style={styles.newTaskFieldLabel}>要建立哪種任務？</Text>
          <View style={styles.habitTypeGrid}>
            <TouchableOpacity
              style={styles.habitTypeCard}
              onPress={() => { setTaskKind('general'); setStep(1); }}
              activeOpacity={0.8}
            >
              <Text style={styles.habitTypeIcon}>⚡</Text>
              <Text style={styles.habitTypeTitle}>一般任務</Text>
              <Text style={styles.habitTypeSub}>{'單次完成\n即時回饋'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.habitTypeCard}
              onPress={() => setTaskKind('longTerm')}
              activeOpacity={0.8}
            >
              <Text style={styles.habitTypeIcon}>🏁</Text>
              <Text style={styles.habitTypeTitle}>長期任務</Text>
              <Text style={styles.habitTypeSub}>{'習慣養成\n階段獎勵'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Step 0b — long-term type picker */}
      {step === 0 && taskKind === 'longTerm' && (
        <>
          <Text style={styles.newTaskFieldLabel}>是哪種長期任務？</Text>
          <View style={styles.habitTypeGrid}>
            <TouchableOpacity
              style={styles.habitTypeCard}
              onPress={() => { setLongTermType('habit'); setStep(1); }}
              activeOpacity={0.8}
            >
              <Text style={styles.habitTypeIcon}>🌱</Text>
              <Text style={styles.habitTypeTitle}>習慣養成</Text>
              <Text style={styles.habitTypeSub}>{'每日打卡\n節點獎勵'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.habitTypeCard}
              onPress={() => { setLongTermType('skill'); setStep(1); }}
              activeOpacity={0.8}
            >
              <Text style={styles.habitTypeIcon}>📚</Text>
              <Text style={styles.habitTypeTitle}>技能學習</Text>
              <Text style={styles.habitTypeSub}>{'階段里程碑\n完成發幣'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.habitTypeCard}
              onPress={() => { setLongTermType('family'); setStep(1); }}
              activeOpacity={0.8}
            >
              <Text style={styles.habitTypeIcon}>🏠</Text>
              <Text style={styles.habitTypeTitle}>家庭責任</Text>
              <Text style={styles.habitTypeSub}>{'職位託付\n時間存摺'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {step === 1 && taskKind === 'general' && (
        <>
          <Text style={styles.newTaskFieldLabel}>要孩子做什麼？</Text>
          <TextInput
            style={styles.newTaskInput}
            value={taskName}
            onChangeText={setTaskName}
            placeholder="例如：倒垃圾、整理書桌、幫忙澆花"
            placeholderTextColor={ParentColors.fgMuted}
            returnKeyType="next"
            onSubmitEditing={handleNext}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.newTaskPrimaryBtn, !taskName.trim() && styles.newTaskPrimaryBtnDisabled]}
            onPress={handleNext}
            disabled={!taskName.trim()}
            activeOpacity={0.8}
          >
            <Text style={styles.newTaskPrimaryBtnText}>下一步</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 2 && taskKind === 'general' && (
        <>
          <Text style={styles.newTaskFieldLabel}>怎麼回饋？</Text>

          {/* Card A — 給影子幣 */}
          <TouchableOpacity
            style={[styles.newTaskRewardCard, rewardMode === 'coin' && styles.newTaskRewardCardActive]}
            onPress={() => setRewardMode('coin')}
            activeOpacity={0.85}
          >
            <Text style={styles.newTaskRewardTitle}>給影子幣</Text>
            {aiLoading ? (
              <Text style={styles.newTaskAiHintLoading}>AI 計算中…</Text>
            ) : aiCoinRange != null ? (
              <Text style={styles.newTaskAiHint}>
                AI 建議：約 {aiBaseTime} 分鐘，可給 {aiCoinRange[0]}–{aiCoinRange[1]} 幣
              </Text>
            ) : null}
            {rewardMode === 'coin' && (
              <View style={styles.newTaskCoinRow}>
                <TouchableOpacity
                  style={styles.newTaskCoinStepBtn}
                  onPress={() => setCoins(c => Math.max(1, c - 1))}
                  activeOpacity={0.7}
                >
                  <Text style={styles.newTaskCoinStepText}>－</Text>
                </TouchableOpacity>
                <View style={styles.newTaskCoinDisplay}>
                  <CoinSmIcon size={18} color="#A87800" />
                  <Text style={styles.newTaskCoinNum}>{coins}</Text>
                  <Text style={styles.newTaskCoinUnit}>幣</Text>
                </View>
                <TouchableOpacity
                  style={styles.newTaskCoinStepBtn}
                  onPress={() => setCoins(c => Math.min(20, c + 1))}
                  activeOpacity={0.7}
                >
                  <Text style={styles.newTaskCoinStepText}>＋</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>

          {/* Card B — 只記錄時間 */}
          <TouchableOpacity
            style={[styles.newTaskRewardCard, rewardMode === 'time' && styles.newTaskRewardCardActive]}
            onPress={() => setRewardMode('time')}
            activeOpacity={0.85}
          >
            <Text style={styles.newTaskRewardTitle}>只記錄時間</Text>
            <Text style={styles.newTaskRewardSub}>完成後計入時間存摺</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.newTaskPrimaryBtn}
            onPress={() => setStep(3)}
            activeOpacity={0.8}
          >
            <Text style={styles.newTaskPrimaryBtnText}>下一步</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 3 && taskKind === 'general' && (
        <>
          <Text style={styles.newTaskFieldLabel}>哪幾天做？</Text>
          <View style={styles.newTaskDayRow}>
            {DAY_LABELS.map(({ value, label }) => {
              const active = selectedDays.includes(value);
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.newTaskDayBtn, active && styles.newTaskDayBtnActive]}
                  onPress={() => toggleDay(value)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.newTaskDayBtnText, active && styles.newTaskDayBtnTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.newTaskSummaryCard}>
            <View style={styles.newTaskSummaryRow}>
              <Text style={styles.newTaskSummaryLabel}>任務</Text>
              <Text style={styles.newTaskSummaryValue} numberOfLines={1}>{taskName}</Text>
            </View>
            <View style={styles.newTaskSummaryRow}>
              <Text style={styles.newTaskSummaryLabel}>回饋</Text>
              <Text style={styles.newTaskSummaryValue} numberOfLines={1}>
                {rewardMode === 'coin' ? `${coins} 幣 / 次` : '計入時間存摺'}
              </Text>
            </View>
            <View style={styles.newTaskSummaryRow}>
              <Text style={styles.newTaskSummaryLabel}>週期</Text>
              <Text style={styles.newTaskSummaryValue} numberOfLines={1}>{formatPeriod()}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.newTaskPrimaryBtn, (submitting || !familyId) && styles.newTaskPrimaryBtnDisabled]}
            onPress={() => void handleSubmit()}
            disabled={submitting || !familyId}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.newTaskPrimaryBtnText}>建立任務</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {/* Habit Step 1 — task name */}
      {step === 1 && longTermType === 'habit' && (
        <>
          <Text style={styles.newTaskFieldLabel}>習慣目標名稱</Text>
          <TextInput
            style={styles.newTaskInput}
            value={habitName}
            onChangeText={setHabitName}
            placeholder="例如：每天練鋼琴、每週運動三次"
            placeholderTextColor={ParentColors.fgMuted}
            returnKeyType="next"
          />
          <TouchableOpacity
            style={[styles.newTaskPrimaryBtn, !habitName.trim() && styles.newTaskPrimaryBtnDisabled]}
            onPress={() => { if (habitName.trim()) setStep(2); }}
            disabled={!habitName.trim()}
            activeOpacity={0.8}
          >
            <Text style={styles.newTaskPrimaryBtnText}>下一步</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Habit Step 2 — total days picker */}
      {step === 2 && longTermType === 'habit' && (
        <>
          <Text style={styles.newTaskFieldLabel}>目標天數</Text>
          <View style={styles.habitDayGrid}>
            {([21, 30, 60] as const).map(n => (
              <TouchableOpacity
                key={n}
                style={[
                  styles.habitDayCard,
                  totalDaysPreset === n && styles.habitDayCardActive,
                ]}
                onPress={() => setTotalDaysPreset(n)}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.habitDayCardNum,
                  totalDaysPreset === n && styles.habitDayCardNumActive,
                ]}>
                  {n} 天
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[
                styles.habitDayCard,
                totalDaysPreset === 'custom' && styles.habitDayCardActive,
              ]}
              onPress={() => setTotalDaysPreset('custom')}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.habitDayCardNum,
                totalDaysPreset === 'custom' && styles.habitDayCardNumActive,
              ]}>
                自訂
              </Text>
            </TouchableOpacity>
          </View>

          {totalDaysPreset === 'custom' && (
            <TextInput
              style={styles.newTaskInput}
              value={customDaysStr}
              onChangeText={setCustomDaysStr}
              placeholder="7–180 天"
              placeholderTextColor={ParentColors.fgMuted}
              keyboardType="number-pad"
            />
          )}

          <TouchableOpacity
            style={[
              styles.newTaskPrimaryBtn,
              effectiveTotalDays == null && styles.newTaskPrimaryBtnDisabled,
            ]}
            onPress={() => { if (effectiveTotalDays != null) setStep(3); }}
            disabled={effectiveTotalDays == null}
            activeOpacity={0.8}
          >
            <Text style={styles.newTaskPrimaryBtnText}>下一步</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Habit Step 3 — checkpoint coin steppers */}
      {step === 3 && longTermType === 'habit' && effectiveTotalDays != null && (
        <>
          <Text style={styles.newTaskFieldLabel}>各節點獎勵</Text>
          {([0, 1, 2] as const).map(idx => (
            <View key={idx} style={styles.habitCoinRow}>
              <View style={styles.habitCoinLabel}>
                <Text style={styles.habitCoinLabelText}>{checkpointLabel(idx)}</Text>
              </View>
              <View style={styles.habitCoinStepper}>
                <TouchableOpacity
                  style={styles.habitCoinStepBtn}
                  onPress={() =>
                    setCheckpointCoins(prev => {
                      const next = [...prev] as [number, number, number];
                      next[idx] = clampCoin(next[idx] - 1);
                      return next;
                    })
                  }
                  activeOpacity={0.7}
                >
                  <Text style={styles.habitCoinStepText}>－</Text>
                </TouchableOpacity>
                <Text style={styles.habitCoinValue}>{checkpointCoins[idx]} 幣</Text>
                <TouchableOpacity
                  style={styles.habitCoinStepBtn}
                  onPress={() =>
                    setCheckpointCoins(prev => {
                      const next = [...prev] as [number, number, number];
                      next[idx] = clampCoin(next[idx] + 1);
                      return next;
                    })
                  }
                  activeOpacity={0.7}
                >
                  <Text style={styles.habitCoinStepText}>＋</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {!coinsAreValid() && (
            <Text style={styles.habitCoinError}>節點幣值必須遞增</Text>
          )}

          <TouchableOpacity
            style={[
              styles.newTaskPrimaryBtn,
              !coinsAreValid() && styles.newTaskPrimaryBtnDisabled,
            ]}
            onPress={() => { if (coinsAreValid()) setStep(4); }}
            disabled={!coinsAreValid()}
            activeOpacity={0.8}
          >
            <Text style={styles.newTaskPrimaryBtnText}>下一步</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Habit Step 4 — active days + summary + confirm */}
      {step === 4 && longTermType === 'habit' && effectiveTotalDays != null && (
        <>
          <Text style={styles.newTaskFieldLabel}>有效打卡日</Text>
          <View style={styles.newTaskDayRow}>
            {([
              { value: 1, label: '一' }, { value: 2, label: '二' },
              { value: 3, label: '三' }, { value: 4, label: '四' },
              { value: 5, label: '五' }, { value: 6, label: '六' },
              { value: 0, label: '日' },
            ]).map(({ value, label }) => {
              const active = activeDaysHabit.includes(value);
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.newTaskDayBtn, active && styles.newTaskDayBtnActive]}
                  onPress={() => toggleActiveDayHabit(value)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.newTaskDayBtnText, active && styles.newTaskDayBtnTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.newTaskSummaryCard}>
            <View style={styles.newTaskSummaryRow}>
              <Text style={styles.newTaskSummaryLabel}>習慣</Text>
              <Text style={styles.newTaskSummaryValue} numberOfLines={1}>{habitName}</Text>
            </View>
            <View style={styles.newTaskSummaryRow}>
              <Text style={styles.newTaskSummaryLabel}>目標</Text>
              <Text style={styles.newTaskSummaryValue}>{effectiveTotalDays} 天</Text>
            </View>
            <View style={styles.newTaskSummaryRow}>
              <Text style={styles.newTaskSummaryLabel}>節點</Text>
              <Text style={styles.newTaskSummaryValue}>
                {(() => {
                  const days = calcCheckpointDays(effectiveTotalDays);
                  const [a, b, c] = checkpointCoins;
                  const isEveryDay = activeDaysHabit.length === 7;
                  const u = isEveryDay ? 'Day' : '第';
                  const s = isEveryDay ? '' : '次';
                  return `${u}${days[0]}${s} ${a}幣 · ${u}${days[1]}${s} ${b}幣 · ${u}${days[2]}${s} ${c}幣`;
                })()}
              </Text>
            </View>
            <View style={styles.newTaskSummaryRow}>
              <Text style={styles.newTaskSummaryLabel}>週期</Text>
              <Text style={styles.newTaskSummaryValue}>{formatActiveDays(activeDaysHabit)}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.newTaskPrimaryBtn,
              (habitSubmitting || activeDaysHabit.length === 0) && styles.newTaskPrimaryBtnDisabled,
            ]}
            onPress={() => void handleHabitSubmit()}
            disabled={habitSubmitting || activeDaysHabit.length === 0}
            activeOpacity={0.8}
          >
            {habitSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.newTaskPrimaryBtnText}>建立任務</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {/* Skill Step 1 — skill name */}
      {step === 1 && longTermType === 'skill' && (
        <>
          <Text style={styles.newTaskFieldLabel}>技能名稱</Text>
          <TextInput
            style={styles.newTaskInput}
            value={taskName}
            onChangeText={setTaskName}
            placeholder="例如：鋼琴、游泳、英文會話"
            placeholderTextColor={ParentColors.fgMuted}
            returnKeyType="next"
            onSubmitEditing={() => { if (taskName.trim()) setStep(2); }}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.newTaskPrimaryBtn, !taskName.trim() && styles.newTaskPrimaryBtnDisabled]}
            onPress={() => { if (taskName.trim()) setStep(2); }}
            disabled={!taskName.trim()}
            activeOpacity={0.8}
          >
            <Text style={styles.newTaskPrimaryBtnText}>下一步</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Skill Step 2 — milestone list editor */}
      {step === 2 && longTermType === 'skill' && (
        <>
          <Text style={styles.newTaskFieldLabel}>設定學習階段</Text>
          {milestoneNames.map((name, idx) => (
            <View key={idx} style={styles.skillMilestoneRow}>
              <Text style={styles.skillMilestoneIndex}>{idx + 1}</Text>
              <TextInput
                style={styles.skillMilestoneInput}
                value={name}
                onChangeText={v => updateMilestoneName(idx, v)}
                placeholder={`學習目標${idx + 1}`}
                placeholderTextColor={ParentColors.fgMuted}
                maxLength={SKILL_MILESTONE_NAME_MAX}
              />
              <TouchableOpacity
                style={[styles.skillDeleteBtn, milestoneNames.length <= 2 && styles.skillDeleteBtnDisabled]}
                onPress={() => removeMilestone(idx)}
                disabled={milestoneNames.length <= 2}
                activeOpacity={0.7}
              >
                <Text style={styles.skillDeleteText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {milestoneNames.length < 5 && (
            <TouchableOpacity style={styles.skillAddBtn} onPress={addMilestone} activeOpacity={0.75}>
              <Text style={styles.skillAddText}>＋ 新增階段</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.newTaskPrimaryBtn, !skillNamesValid && styles.newTaskPrimaryBtnDisabled]}
            onPress={() => { if (skillNamesValid) setStep(3); }}
            disabled={!skillNamesValid}
            activeOpacity={0.8}
          >
            <Text style={styles.newTaskPrimaryBtnText}>下一步</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Skill Step 3 — per-milestone coin steppers */}
      {step === 3 && longTermType === 'skill' && (
        <>
          <Text style={styles.newTaskFieldLabel}>各階段獎勵</Text>
          {milestoneNames.map((name, idx) => (
            <View key={idx} style={styles.habitCoinRow}>
              <View style={styles.habitCoinLabel}>
                <Text style={styles.habitCoinLabelText} numberOfLines={1}>
                  第 {idx + 1} 階段：{name.trim() || `學習目標${idx + 1}`}
                </Text>
              </View>
              <View style={styles.habitCoinStepper}>
                <TouchableOpacity
                  style={styles.habitCoinStepBtn}
                  onPress={() => stepSkillCoin(idx, -1)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.habitCoinStepText}>－</Text>
                </TouchableOpacity>
                <Text style={styles.habitCoinValue}>{skillCoins[idx]} 幣</Text>
                <TouchableOpacity
                  style={styles.habitCoinStepBtn}
                  onPress={() => stepSkillCoin(idx, 1)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.habitCoinStepText}>＋</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {!skillCoinsAreValid(skillCoins) && (
            <Text style={styles.habitCoinError}>各階段幣值需逐階非遞減（上限 {MAX_SKILL_MILESTONE_COIN} 幣）</Text>
          )}

          <TouchableOpacity
            style={[styles.newTaskPrimaryBtn, !skillCoinsAreValid(skillCoins) && styles.newTaskPrimaryBtnDisabled]}
            onPress={() => { if (skillCoinsAreValid(skillCoins)) setStep(4); }}
            disabled={!skillCoinsAreValid(skillCoins)}
            activeOpacity={0.8}
          >
            <Text style={styles.newTaskPrimaryBtnText}>下一步</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Skill Step 4 — target months + summary + confirm */}
      {step === 4 && longTermType === 'skill' && (
        <>
          <Text style={styles.newTaskFieldLabel}>預計學習時長</Text>
          <View style={styles.habitDayGrid}>
            {([1, 3, 6] as const).map(n => (
              <TouchableOpacity
                key={n}
                style={[styles.habitDayCard, skillMonthsPreset === n && styles.habitDayCardActive]}
                onPress={() => setSkillMonthsPreset(n)}
                activeOpacity={0.8}
              >
                <Text style={[styles.habitDayCardNum, skillMonthsPreset === n && styles.habitDayCardNumActive]}>
                  {n} 個月
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.habitDayCard, skillMonthsPreset === 'custom' && styles.habitDayCardActive]}
              onPress={() => setSkillMonthsPreset('custom')}
              activeOpacity={0.8}
            >
              <Text style={[styles.habitDayCardNum, skillMonthsPreset === 'custom' && styles.habitDayCardNumActive]}>
                自訂
              </Text>
            </TouchableOpacity>
          </View>

          {skillMonthsPreset === 'custom' && (
            <TextInput
              style={styles.newTaskInput}
              value={skillCustomMonthsStr}
              onChangeText={setSkillCustomMonthsStr}
              placeholder="1–24 個月"
              placeholderTextColor={ParentColors.fgMuted}
              keyboardType="number-pad"
            />
          )}

          <View style={styles.newTaskSummaryCard}>
            <View style={styles.newTaskSummaryRow}>
              <Text style={styles.newTaskSummaryLabel}>技能</Text>
              <Text style={styles.newTaskSummaryValue} numberOfLines={1}>{taskName.trim()}</Text>
            </View>
            <View style={styles.newTaskSummaryRow}>
              <Text style={styles.newTaskSummaryLabel}>階段</Text>
              <Text style={styles.newTaskSummaryValue} numberOfLines={2}>
                {milestoneNames
                  .map((n, i) => `第${i + 1}階段 ${skillCoins[i]}幣`)
                  .join(' · ')}
              </Text>
            </View>
            <View style={styles.newTaskSummaryRow}>
              <Text style={styles.newTaskSummaryLabel}>時長</Text>
              <Text style={styles.newTaskSummaryValue}>{formatSkillMonths()}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.newTaskPrimaryBtn,
              (skillSubmitting || effectiveTargetMonths == null) && styles.newTaskPrimaryBtnDisabled,
            ]}
            onPress={() => void handleSkillSubmit()}
            disabled={skillSubmitting || effectiveTargetMonths == null}
            activeOpacity={0.8}
          >
            {skillSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.newTaskPrimaryBtnText}>建立任務</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {/* Family Step 1 — responsibility name */}
      {step === 1 && longTermType === 'family' && (
        <>
          <Text style={styles.newTaskFieldLabel}>這個孩子要負責什麼？</Text>
          <TextInput
            style={styles.newTaskInput}
            value={familyTaskName}
            onChangeText={setFamilyTaskName}
            placeholder="例如：每週洗碗、每天倒垃圾、照顧植物"
            placeholderTextColor={ParentColors.fgMuted}
            returnKeyType="next"
            onSubmitEditing={() => { if (familyTaskName.trim()) setStep(2); }}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.newTaskPrimaryBtn, !familyTaskName.trim() && styles.newTaskPrimaryBtnDisabled]}
            onPress={() => { if (familyTaskName.trim()) setStep(2); }}
            disabled={!familyTaskName.trim()}
            activeOpacity={0.8}
          >
            <Text style={styles.newTaskPrimaryBtnText}>下一步</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Family Step 2 — active completion days */}
      {step === 2 && longTermType === 'family' && (
        <>
          <Text style={styles.newTaskFieldLabel}>哪幾天需要完成？</Text>
          <View style={styles.newTaskDayRow}>
            {([
              { value: 1, label: '一' }, { value: 2, label: '二' },
              { value: 3, label: '三' }, { value: 4, label: '四' },
              { value: 5, label: '五' }, { value: 6, label: '六' },
              { value: 0, label: '日' },
            ]).map(({ value, label }) => {
              const active = activeDaysFamily.includes(value);
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.newTaskDayBtn, active && styles.newTaskDayBtnActive]}
                  onPress={() => toggleActiveDayFamily(value)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.newTaskDayBtnText, active && styles.newTaskDayBtnTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.newTaskPrimaryBtn, activeDaysFamily.length === 0 && styles.newTaskPrimaryBtnDisabled]}
            onPress={() => { if (activeDaysFamily.length > 0) setStep(3); }}
            disabled={activeDaysFamily.length === 0}
            activeOpacity={0.8}
          >
            <Text style={styles.newTaskPrimaryBtnText}>下一步</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Family Step 3 — time saving per completion */}
      {step === 3 && longTermType === 'family' && (
        <>
          <Text style={styles.newTaskFieldLabel}>每次時間存摺</Text>
          <Text style={styles.habitCoinError /* reuse small text style */}>
            {'每次完成後，計入孩子的時間存摺'}
          </Text>
          <View style={[styles.habitDayGrid, { marginTop: 10 }]}>
            {([15, 30, 60] as const).map(n => (
              <TouchableOpacity
                key={n}
                style={[styles.habitDayCard, familyTimePreset === n && styles.habitDayCardActive]}
                onPress={() => setFamilyTimePreset(n)}
                activeOpacity={0.8}
              >
                <Text style={[styles.habitDayCardNum, familyTimePreset === n && styles.habitDayCardNumActive]}>
                  {n} 分
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.habitDayCard, familyTimePreset === 'custom' && styles.habitDayCardActive]}
              onPress={() => setFamilyTimePreset('custom')}
              activeOpacity={0.8}
            >
              <Text style={[styles.habitDayCardNum, familyTimePreset === 'custom' && styles.habitDayCardNumActive]}>
                自訂
              </Text>
            </TouchableOpacity>
          </View>

          {familyTimePreset === 'custom' && (
            <TextInput
              style={styles.newTaskInput}
              value={customFamilyTimeStr}
              onChangeText={setCustomFamilyTimeStr}
              placeholder={`${MIN_FAMILY_TIME}–${MAX_FAMILY_TIME} 分鐘`}
              placeholderTextColor={ParentColors.fgMuted}
              keyboardType="number-pad"
            />
          )}

          <TouchableOpacity
            style={[styles.newTaskPrimaryBtn, effectiveFamilyTime == null && styles.newTaskPrimaryBtnDisabled]}
            onPress={() => { if (effectiveFamilyTime != null) setStep(4); }}
            disabled={effectiveFamilyTime == null}
            activeOpacity={0.8}
          >
            <Text style={styles.newTaskPrimaryBtnText}>下一步</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Family Step 4 — commit weeks + summary + confirm */}
      {step === 4 && longTermType === 'family' && effectiveFamilyTime != null && (
        <>
          <Text style={styles.newTaskFieldLabel}>承諾期間</Text>
          <View style={styles.habitDayGrid}>
            {([4, 8, 12] as const).map(n => (
              <TouchableOpacity
                key={n}
                style={[styles.habitDayCard, familyCommitPreset === n && styles.habitDayCardActive]}
                onPress={() => setFamilyCommitPreset(n)}
                activeOpacity={0.8}
              >
                <Text style={[styles.habitDayCardNum, familyCommitPreset === n && styles.habitDayCardNumActive]}>
                  {n} 週
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.habitDayCard, familyCommitPreset === 'custom' && styles.habitDayCardActive]}
              onPress={() => setFamilyCommitPreset('custom')}
              activeOpacity={0.8}
            >
              <Text style={[styles.habitDayCardNum, familyCommitPreset === 'custom' && styles.habitDayCardNumActive]}>
                自訂
              </Text>
            </TouchableOpacity>
          </View>

          {familyCommitPreset === 'custom' && (
            <TextInput
              style={styles.newTaskInput}
              value={customCommitWeeksStr}
              onChangeText={setCustomCommitWeeksStr}
              placeholder="1–24 週"
              placeholderTextColor={ParentColors.fgMuted}
              keyboardType="number-pad"
            />
          )}

          <View style={styles.newTaskSummaryCard}>
            <View style={[styles.newTaskSummaryRow, { marginBottom: 4 }]}>
              <Text style={styles.newTaskSummaryLabel}>🏠</Text>
              <Text style={[styles.newTaskSummaryValue, { fontWeight: '700' }]}>家庭職位</Text>
            </View>
            <View style={styles.newTaskSummaryRow}>
              <Text style={styles.newTaskSummaryLabel}>職責</Text>
              <Text style={styles.newTaskSummaryValue} numberOfLines={1}>{familyTaskName.trim()}</Text>
            </View>
            <View style={styles.newTaskSummaryRow}>
              <Text style={styles.newTaskSummaryLabel}>負責天數</Text>
              <Text style={styles.newTaskSummaryValue}>{formatActiveDays(activeDaysFamily)}</Text>
            </View>
            <View style={styles.newTaskSummaryRow}>
              <Text style={styles.newTaskSummaryLabel}>時間存摺</Text>
              <Text style={styles.newTaskSummaryValue}>每次完成 {effectiveFamilyTime} 分鐘</Text>
            </View>
            <View style={styles.newTaskSummaryRow}>
              <Text style={styles.newTaskSummaryLabel}>承諾期間</Text>
              <Text style={styles.newTaskSummaryValue}>{formatFamilyCommitWeeks()}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.newTaskPrimaryBtn,
              (familySubmitting || effectiveCommitWeeks == null) && styles.newTaskPrimaryBtnDisabled,
            ]}
            onPress={() => void handleFamilySubmit()}
            disabled={familySubmitting || effectiveCommitWeeks == null}
            activeOpacity={0.8}
          >
            {familySubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.newTaskPrimaryBtnText}>建立任務</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Right column — pending items (兌換待審 + 任務提案)
// ─────────────────────────────────────────────────────────────────────────────

function XIcon({ size = 14, color = ParentColors.error }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const PROPOSAL_REJECT_REASONS = [
  '已經包含在原本任務裡',
  '不符合家庭規則',
  '想再和孩子討論',
  '幣值建議不合理',
];

// ── 兌換待審 card ──

function WishApprovalCard({
  wish,
  onApprove,
}: {
  wish: ChildWishItem;
  onApprove: (id: string) => Promise<void>;
}) {
  const [state, setState] = useState<'idle' | 'approved' | 'rejected'>('idle');
  const [submitting, setSubmitting] = useState(false);

  const waitedHours = dayjs().diff(dayjs(wish.created_at), 'hour');
  const isLongWait = waitedHours >= 24;
  const waitLabel = waitedHours < 24 ? `${waitedHours} 小時` : `${Math.floor(waitedHours / 24)} 天`;

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await onApprove(wish.id);
      setState('approved');
    } catch {
      // stay idle on error
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    try {
      await supabase.from('reward_items').update({ is_active: false }).eq('id', wish.id);
      setState('rejected');
    } catch {
      // stay idle on error
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'approved') {
    return (
      <View style={[styles.proposalDoneCard, styles.proposalDoneApproved]}>
        <CheckSmIcon size={16} color={ParentColors.success} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.proposalDoneTitle, { color: ParentColors.success }]}>
            已上架 · 「{wish.name}」
          </Text>
          <Text style={styles.proposalDoneMeta}>{wish.coin_cost} 幣，孩子可以前往撲滿兌換。</Text>
        </View>
      </View>
    );
  }

  if (state === 'rejected') {
    return (
      <View style={[styles.proposalDoneCard, styles.proposalDoneRejected]}>
        <XIcon size={16} color={ParentColors.error} />
        <Text style={[styles.proposalDoneTitle, { color: ParentColors.error }]}>
          已拒絕 · 「{wish.name}」
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wishCard}>
      <View style={styles.wishCardHeader}>
        <View style={[styles.waitPill, isLongWait ? styles.waitPillUrgent : styles.waitPillNormal]}>
          <ClockSmIcon size={10} color={isLongWait ? ParentColors.error : ParentColors.fgMuted} />
          <Text style={[styles.waitPillText, isLongWait && { color: ParentColors.error }]}>
            已等 {waitLabel}
          </Text>
        </View>
        <Text style={styles.wishDateText}>{dayjs(wish.created_at).format('M/D HH:mm')}</Text>
      </View>
      <Text style={styles.wishName}>{wish.name}</Text>
      <View style={styles.wishCoinRow}>
        <CoinSmIcon size={14} />
        <Text style={styles.wishCoinText}>{wish.coin_cost} 幣</Text>
      </View>
      <View style={styles.proposalActions}>
        <TouchableOpacity
          style={[styles.proposalApproveBtn, submitting && { opacity: 0.5 }]}
          onPress={() => void handleApprove()}
          disabled={submitting}
          activeOpacity={0.8}
        >
          <CheckSmIcon size={13} color="#fff" />
          <Text style={styles.proposalApproveBtnText}>同意上架</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.proposalRejectBtn, submitting && { opacity: 0.5 }]}
          onPress={() => void handleReject()}
          disabled={submitting}
          activeOpacity={0.8}
        >
          <Text style={styles.proposalRejectBtnText}>拒絕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── 任務提案 card ──

function RedemptionProposalCard({
  request,
  onApprove,
  onReject,
}: {
  request: RedemptionRequest;
  onApprove: (id: string, adjustedCoins?: number) => Promise<void>;
  onReject: (id: string, note: string) => Promise<void>;
}) {
  const ai = getAiResult(request);
  const [coinValue, setCoinValue] = useState(ai.suggestedCoins ?? request.coin_cost);
  const [state, setState] = useState<'idle' | 'rejecting' | 'approved' | 'rejected'>('idle');
  const [submitting, setSubmitting] = useState(false);

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await onApprove(request.id, coinValue);
      setState('approved');
    } catch {
      // stay idle on error
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (reason: string) => {
    setSubmitting(true);
    try {
      await onReject(request.id, reason);
      setState('rejected');
    } catch {
      // stay idle on error
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'approved') {
    return (
      <View style={[styles.proposalDoneCard, styles.proposalDoneApproved]}>
        <CheckSmIcon size={18} color={ParentColors.success} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.proposalDoneTitle, { color: ParentColors.success }]}>
            已同意 · 「{request.name}」
          </Text>
          <Text style={styles.proposalDoneMeta}>+{coinValue} 幣已入帳。</Text>
        </View>
      </View>
    );
  }

  if (state === 'rejected') {
    return (
      <View style={[styles.proposalDoneCard, styles.proposalDoneRejected]}>
        <XIcon size={18} color={ParentColors.error} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.proposalDoneTitle, { color: ParentColors.error }]}>
            已拒絕 · 「{request.name}」
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.proposalCard}>
      <Text style={styles.proposalCardName}>{request.name}</Text>
      <Text style={styles.proposalCardMeta}>
        {dayjs(request.created_at).format('M/D HH:mm')} · 孩子提案
      </Text>

      {request.description ? (
        <View style={styles.proposalKidNote}>
          <Text style={styles.proposalKidNoteText}>「{request.description}」</Text>
        </View>
      ) : null}

      <View style={[styles.proposalAiBanner, ai.verdict === 'high' ? styles.proposalAiBannerHigh : styles.proposalAiBannerOk]}>
        <SparkleSmIcon size={11} color={ai.verdict === 'high' ? ParentColors.warn : ParentColors.teal500} />
        <Text style={[styles.proposalAiText, { color: ai.verdict === 'high' ? '#B87A00' : ParentColors.teal500 }]} numberOfLines={3}>
          {ai.reason}{ai.suggestedCoins != null ? ` 建議 ${ai.suggestedCoins} 幣` : ''}
        </Text>
      </View>

      <View style={styles.proposalCoinRow}>
        <Text style={styles.proposalCoinLabel}>核准幣值</Text>
        <View style={styles.proposalCoinInputWrap}>
          <CoinSmIcon size={14} />
          <TextInput
            style={styles.proposalCoinInput}
            value={String(coinValue)}
            onChangeText={v => {
              const n = parseInt(v, 10);
              if (!isNaN(n) && n >= 0) setCoinValue(n);
              else if (v === '') setCoinValue(0);
            }}
            keyboardType="number-pad"
            maxLength={4}
          />
          <Text style={styles.proposalCoinUnit}>幣</Text>
        </View>
      </View>

      {state === 'idle' && (
        <View style={styles.proposalActions}>
          <TouchableOpacity
            style={[styles.proposalApproveBtn, submitting && { opacity: 0.5 }]}
            onPress={() => void handleApprove()}
            disabled={submitting}
            activeOpacity={0.8}
          >
            <CheckSmIcon size={13} color="#fff" />
            <Text style={styles.proposalApproveBtnText}>同意並發放</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.proposalRejectBtn, submitting && { opacity: 0.5 }]}
            onPress={() => setState('rejecting')}
            disabled={submitting}
            activeOpacity={0.8}
          >
            <Text style={styles.proposalRejectBtnText}>拒絕</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === 'rejecting' && (
        <View style={styles.rejectPanel}>
          <Text style={styles.rejectPanelTitle}>選擇拒絕原因</Text>
          <View style={styles.rejectReasonList}>
            {PROPOSAL_REJECT_REASONS.map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.rejectReasonBtn, submitting && { opacity: 0.5 }]}
                onPress={() => void handleReject(r)}
                disabled={submitting}
                activeOpacity={0.8}
              >
                <Text style={styles.rejectReasonText}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => setState('idle')} style={styles.rejectCancelBtn}>
            <Text style={styles.rejectCancelText}>取消</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Right column panel ──

function PendingItemsPanel({
  pendingRequests,
  childWishes,
  approveRequest,
  rejectRequest,
  approveChildWish,
}: {
  pendingRequests: RedemptionRequest[];
  childWishes: ChildWishItem[];
  approveRequest: (id: string, adjustedCoins?: number) => Promise<void>;
  rejectRequest: (id: string, note: string) => Promise<void>;
  approveChildWish: (id: string) => Promise<void>;
}) {
  const pendingWishes = childWishes.filter(w => !w.parent_approved);

  return (
    <View style={styles.pendingPanel}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>待處理事項</Text>
          <Text style={styles.sectionTitle}>需要你處理</Text>
        </View>
      </View>

      {/* 兌換待審 */}
      <View style={styles.pendingSubSection}>
        <View style={styles.pendingSubHead}>
          <View style={[styles.pendingSubIcon, { backgroundColor: '#FAF1E7' }]}>
            <GiftIcon size={11} color={ParentColors.clay500} />
          </View>
          <Text style={styles.pendingSubLabel}>兌換待審</Text>
          <View style={styles.pendingSubLine} />
          <Text style={styles.pendingSubNote}>孩子許願 · 設定幣值後上架</Text>
        </View>
        {pendingWishes.length === 0 ? (
          <View style={styles.pendingEmpty}>
            <Text style={styles.pendingEmptyTitle}>目前沒有待審兌換</Text>
            <Text style={styles.pendingEmptyMeta}>孩子的兌換申請會出現在這裡。</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {pendingWishes.map(w => (
              <WishApprovalCard key={w.id} wish={w} onApprove={approveChildWish} />
            ))}
          </View>
        )}
      </View>

      {/* 任務提案 */}
      <View style={styles.pendingSubSection}>
        <View style={styles.pendingSubHead}>
          <View style={[styles.pendingSubIcon, { backgroundColor: '#F4EBF0' }]}>
            <SparkleSmIcon size={11} color={ParentColors.plum500} />
          </View>
          <Text style={styles.pendingSubLabel}>任務提案</Text>
          <View style={styles.pendingSubLine} />
          <Text style={styles.pendingSubNote}>孩子提案完成的事 · 同意後發幣</Text>
        </View>
        {pendingRequests.length === 0 ? (
          <View style={styles.pendingEmpty}>
            <Text style={styles.pendingEmptyTitle}>目前沒有待審提案</Text>
            <Text style={styles.pendingEmptyMeta}>孩子有新提案時，會在這裡出現。</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {pendingRequests.map(req => (
              <RedemptionProposalCard
                key={req.id}
                request={req}
                onApprove={approveRequest}
                onReject={rejectRequest}
              />
            ))}
          </View>
        )}
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

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [rightMode, setRightMode] = useState<'pending' | 'assign' | 'newTask'>('pending');
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
        if (data?.family_id) setFamilyId(data.family_id as string);
      } catch (err) {
        console.error('[ParentHomeTablet] loadFamily error:', err);
      }
    }
    void loadFamily();
  }, []);

  const {
    pendingRequests,
    childWishes,
    approveRequest,
    rejectRequest,
    approveChildWish,
    fetchAll: refreshRedemption,
  } = useParentRedemption(familyId);

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
      void refreshRedemption();
    }, [refresh, refreshRedemption]),
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
            onAssignTask={() => setRightMode('assign')}
            onNewTask={() => setRightMode('newTask')}
            childId={childId}
            onMarked={refresh}
          />
        </ScrollView>

        {/* ── Right column ── */}
        <ScrollView
          style={styles.rightCol}
          contentContainerStyle={[styles.rightColContent, { paddingTop: insets.top + 16 }]}
          showsVerticalScrollIndicator={false}
        >
          {rightMode === 'newTask' ? (
            <NewTaskPanel
              currentChildId={childId}
              familyId={familyId}
              onSuccess={() => refresh()}
              onDone={() => setRightMode('pending')}
            />
          ) : rightMode === 'assign' ? (
            <AssignTaskPanel
              allChildren={allChildren}
              currentChildId={childId}
              familyId={familyId}
              onDone={() => { setRightMode('pending'); refresh(); }}
            />
          ) : (
            <PendingItemsPanel
              pendingRequests={pendingRequests}
              childWishes={childWishes}
              approveRequest={approveRequest}
              rejectRequest={rejectRequest}
              approveChildWish={approveChildWish}
            />
          )}
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

  // ── Mark panel ──
  markPanel: {
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderRadius: ParentRadii.sm,
    padding: 14,
    gap: 12,
    marginBottom: 14,
  },
  markPanelOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  markOptionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  markOptionChipSelected: {
    backgroundColor: ParentColors.ink900,
    borderColor: ParentColors.ink900,
  },
  markOptionText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  markOptionTextSelected: {
    color: '#fff',
    fontWeight: ParentFontWeights.semi,
  },
  markCoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  markCoinLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  markCoinInput: {
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.base,
    color: ParentColors.fgPrimary,
    minWidth: 64,
    textAlign: 'center',
  },
  markNoteRow: {
    gap: 6,
  },
  markNoteLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  markNoteInput: {
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgPrimary,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  markErrorMsg: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.error,
  },
  markActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  markCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: ParentRadii.sm,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  markCancelText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },
  markConfirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: ParentRadii.sm,
    backgroundColor: ParentColors.teal500,
  },
  markConfirmBtnDisabled: {
    opacity: 0.4,
  },
  markConfirmText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: '#fff',
  },
  taskActionBtnActive: {
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderColor: ParentColors.ink900,
  },
  taskActionTextActive: {
    color: ParentColors.ink900,
    fontWeight: ParentFontWeights.semi,
  },

  // ── Task footer buttons ──
  taskFooter: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
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

  // ── Wish approval card ──
  wishCard: {
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.lg,
    padding: 14,
    gap: 8,
  },
  wishCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  waitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
  },
  waitPillNormal: {
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderColor: ParentColors.borderSoft,
  },
  waitPillUrgent: {
    backgroundColor: '#FBE8E4',
    borderColor: '#F0CFC7',
  },
  waitPillText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },
  wishDateText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  wishName: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.pBody,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  wishCoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  wishCoinText: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.bold,
    color: '#A87800',
  },

  // ── Redemption proposal card ──
  proposalCard: {
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.lg,
    padding: 14,
    gap: 8,
  },
  proposalCardName: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    lineHeight: 22,
  },
  proposalCardMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    marginTop: -4,
  },
  proposalKidNote: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderLeftWidth: 2,
    borderLeftColor: '#C97735',
    borderRadius: 2,
  },
  proposalKidNoteText: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.sm,
    fontStyle: 'italic',
    color: ParentColors.fgSecondary,
    lineHeight: 20,
  },
  proposalAiBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 10,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
  },
  proposalAiBannerOk: {
    backgroundColor: ParentColors.teal50,
    borderColor: ParentColors.teal200,
  },
  proposalAiBannerHigh: {
    backgroundColor: '#FBF1DC',
    borderColor: '#E8D0A0',
  },
  proposalAiText: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 17,
  },
  proposalCoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
  },
  proposalCoinLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  proposalCoinInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FAF1E7',
    borderWidth: 1,
    borderColor: '#E8D0A0',
    borderRadius: ParentRadii.pill,
  },
  proposalCoinInput: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.pBody,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    width: 44,
    textAlign: 'center',
    padding: 0,
  },
  proposalCoinUnit: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },

  // ── Shared action buttons ──
  proposalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  proposalApproveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    backgroundColor: ParentColors.teal500,
    borderRadius: ParentRadii.md,
  },
  proposalApproveBtnText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: '#fff',
  },
  proposalRejectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  proposalRejectBtnText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },

  // ── Done / result cards ──
  proposalDoneCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: ParentRadii.lg,
    borderWidth: 1,
  },
  proposalDoneApproved: {
    backgroundColor: '#E8F2E6',
    borderColor: '#C9DDD0',
  },
  proposalDoneRejected: {
    backgroundColor: '#FBE8E4',
    borderColor: '#F0CFC7',
  },
  proposalDoneTitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
  },
  proposalDoneMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    marginTop: 2,
  },

  // ── Reject reason panel ──
  rejectPanel: {
    padding: 12,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderRadius: ParentRadii.md,
    gap: 8,
  },
  rejectPanelTitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rejectReasonList: {
    gap: 6,
  },
  rejectReasonBtn: {
    padding: 10,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.sm,
  },
  rejectReasonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  rejectCancelBtn: {
    alignSelf: 'flex-start',
  },
  rejectCancelText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },

  // ── Assign task panel ──
  assignPanel: {
    gap: 14,
  },
  assignHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  assignBackBtn: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  assignBackText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.accent,
  },
  assignPanelTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  assignFieldLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
  },
  assignInput: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgPrimary,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  assignChipLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    marginTop: 2,
  },
  assignChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  assignChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: ParentColors.ivory200,
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  assignChipText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.ink700,
  },
  assignChipEmpty: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  assignPrimaryBtn: {
    marginTop: 4,
    paddingVertical: 14,
    backgroundColor: '#C97735',
    borderRadius: ParentRadii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignPrimaryBtnDisabled: {
    opacity: 0.4,
  },
  assignPrimaryBtnText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: '#fff',
  },
  assignStep2Row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: ParentColors.ivory200,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  assignStep2Label: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    flexShrink: 0,
  },
  assignStep2Name: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  assignEditLink: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.accent,
    flexShrink: 0,
  },
  assignTargetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    backgroundColor: '#fff',
  },
  assignTargetName: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  assignTargetChevron: {
    fontFamily: ParentFonts.body,
    fontSize: 10,
    color: ParentColors.fgMuted,
  },
  assignChildPicker: {
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    overflow: 'hidden',
    marginTop: -8,
  },
  assignChildOption: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  assignChildOptionActive: {
    backgroundColor: '#FAF1E7',
  },
  assignChildOptionText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgPrimary,
  },
  assignChildOptionTextActive: {
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.clay500,
  },
  assignCoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 8,
  },
  assignCoinStepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  assignCoinStepText: {
    fontFamily: ParentFonts.body,
    fontSize: 18,
    color: ParentColors.fgPrimary,
    lineHeight: 22,
  },
  assignCoinDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  assignCoinNum: {
    fontFamily: ParentFonts.mono,
    fontSize: 36,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    lineHeight: 42,
  },
  assignCoinUnit: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },
  assignRangeHint: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    textAlign: 'center',
    marginTop: -6,
  },
  assignDoneCard: {
    padding: 20,
    backgroundColor: '#E8F2E6',
    borderWidth: 1,
    borderColor: '#C9DDD0',
    borderRadius: ParentRadii.lg,
    alignItems: 'center',
  },
  assignDoneText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.success,
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── New task panel ──
  newTaskPanel: {
    gap: 14,
  },
  newTaskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  newTaskBackBtn: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  newTaskBackText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.accent,
  },
  newTaskPanelTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  newTaskFieldLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
  },
  newTaskInput: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgPrimary,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  newTaskRewardCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    backgroundColor: '#fff',
    gap: 8,
  },
  newTaskRewardCardActive: {
    borderColor: ParentColors.teal500,
    borderWidth: 2,
  },
  newTaskRewardTitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  newTaskRewardSub: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  newTaskAiHint: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.teal500,
  },
  newTaskAiHintLoading: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    fontStyle: 'italic',
  },
  newTaskCoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 4,
  },
  newTaskCoinStepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  newTaskCoinStepText: {
    fontFamily: ParentFonts.body,
    fontSize: 16,
    color: ParentColors.fgPrimary,
    lineHeight: 20,
  },
  newTaskCoinDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  newTaskCoinNum: {
    fontFamily: ParentFonts.mono,
    fontSize: 28,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    lineHeight: 34,
  },
  newTaskCoinUnit: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },
  newTaskDayRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  newTaskDayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  newTaskDayBtnActive: {
    backgroundColor: ParentColors.teal500,
    borderColor: ParentColors.teal500,
  },
  newTaskDayBtnText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },
  newTaskDayBtnTextActive: {
    color: '#fff',
  },
  newTaskSummaryCard: {
    padding: 14,
    backgroundColor: ParentColors.ivory200,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    gap: 8,
  },
  newTaskSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  newTaskSummaryLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  newTaskSummaryValue: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    flex: 1,
    textAlign: 'right',
  },
  newTaskPrimaryBtn: {
    marginTop: 4,
    paddingVertical: 14,
    backgroundColor: ParentColors.teal500,
    borderRadius: ParentRadii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newTaskPrimaryBtnDisabled: {
    opacity: 0.4,
  },
  newTaskPrimaryBtnText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: '#fff',
  },
  newTaskDoneCard: {
    padding: 24,
    backgroundColor: '#E8F2E6',
    borderWidth: 1,
    borderColor: '#C9DDD0',
    borderRadius: ParentRadii.lg,
    gap: 12,
    alignItems: 'center',
  },
  newTaskDoneIcon: {
    fontSize: 32,
    color: ParentColors.success,
  },
  newTaskDoneTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.success,
  },
  newTaskDoneSub: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  habitTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  habitTypeCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: ParentRadii.md,
    borderWidth: 1.5,
    borderColor: ParentColors.borderSoft,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  habitTypeCardDisabled: {
    backgroundColor: ParentColors.stone100,
    borderColor: ParentColors.borderSoft,
    opacity: 0.55,
  },
  habitTypeIcon: {
    fontSize: 22,
  },
  habitTypeTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgPrimary,
    textAlign: 'center',
  },
  habitTypeTitleDisabled: {
    color: ParentColors.fgMuted,
  },
  habitTypeSub: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  habitTypeSubDisabled: {
    color: ParentColors.fgMuted,
  },
  habitDayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  habitDayCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: ParentRadii.md,
    borderWidth: 1.5,
    borderColor: ParentColors.borderSoft,
    paddingVertical: 16,
    alignItems: 'center',
  },
  habitDayCardActive: {
    borderColor: ParentColors.teal500,
    backgroundColor: ParentColors.teal50,
  },
  habitDayCardNum: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgPrimary,
  },
  habitDayCardNumActive: {
    color: ParentColors.teal500,
  },
  habitCoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  habitCoinLabel: {
    flex: 1,
  },
  habitCoinLabelText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  habitCoinStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  habitCoinStepBtn: {
    width: 28,
    height: 28,
    borderRadius: ParentRadii.sm,
    backgroundColor: ParentColors.stone100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitCoinStepText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.base,
    color: ParentColors.fgPrimary,
    lineHeight: 20,
  },
  habitCoinValue: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgPrimary,
    minWidth: 48,
    textAlign: 'center',
  },
  habitCoinError: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.error,
  },

  // ── Skill milestone editor ──
  skillMilestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  skillMilestoneIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ParentColors.stone100,
    textAlign: 'center',
    lineHeight: 24,
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgSecondary,
  },
  skillMilestoneInput: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgPrimary,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  skillDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: ParentRadii.sm,
    backgroundColor: ParentColors.stone100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skillDeleteBtnDisabled: {
    opacity: 0.35,
  },
  skillDeleteText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
    lineHeight: 18,
  },
  skillAddBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 2,
    marginBottom: 6,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderStyle: 'dashed',
  },
  skillAddText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.teal500,
  },
});
