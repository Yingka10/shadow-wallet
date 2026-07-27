// Shadow Wallet · Parent Tablet — Tab 1 首頁 (Dashboard)
// Layout (v13 IA)：暖松側欄(GrowBook 品牌 + 孩子切換器) │ 白中欄(申請審核=決策主場 + 今天做完的 + 長期挑戰)
//   │ 石色右欄(AI 教養顧問 + 週報連結)。申請審核用 useParentRedemption 過濾到目前選中的孩子。
// Data: useParentDashboard + useParentRedemption + useSelectedChild。

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  Alert,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useFocusEffect, useNavigation, CommonActions } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../../../../App';
import { supabase } from '../../../lib/supabase';
import { useSelectedChild } from '../../../context/SelectedChildContext';
import {
  useParentDashboard,
  type DashboardTask,
} from '../../../hooks/useParentDashboard';
import {
  useLongTermTasks,
  type LongTermTaskItem,
} from '../../../hooks/useLongTermTasks';
import {
  useParentRedemption,
  type ChildWishItem,
} from '../../../hooks/useParentRedemption';
import {
  parentMarkTask,
  parentCompleteTaskForChild,
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
import { webMouseDraggableScroll, webTabletScreen } from '../../../constants/webStyles';
import type { TaskCategory, LongTermType, AgeGroup } from '../../../types/database';
import { calcAgeGroup } from '../../../lib/onboarding';
import { analyzeTask, type AnalyzeTaskResult, chatWithAdvisor } from '../../../lib/aiAgent';
import {
  SunIcon,
  BellIcon,
  ChevronDownIcon,
  ChartNavIcon,
  RobotIcon,
  StarIcon,
  SlidersIcon,
  SendArrowIcon,
  TaskIconBubble,
  Illustration,
  GiftIcon as GiftLineIcon,
  UserCircleIcon,
  LogoutIcon,
} from './home/homeIcons';
import { WeekSummary } from './home/WeekSummary';
import { TipCard, WeekDigestCard, buildWeekDigestLines, TaskPackCard } from './home/RightRailCards';
import { ParentSidebar, type ChildOption, type ManageSection } from './ParentSidebar';
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

function HourglassSmIcon({ size = 14, color = ParentColors.pine500 }: { size?: number; color?: string }) {
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

// 任務提案 —— req-ic.green 用的「方框＋加號」圖示
function TaskPlusIcon({ size = 17, color = ParentColors.leaf700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Rect x={3.5} y={3} width={13} height={14} rx={2} stroke={color} strokeWidth={1.7} />
      <Path d="M10 7v6M7 10h6" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Long-term task card
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 長期挑戰 —— 白卡清單（v14 理想圖）：任務 icon（關鍵字對應、柔色圓底）＋名稱＋
 * 進度說明＋「進度 N%」＋chevron，下方進度條。標題列右側「查看全部」→ 管理 Tab。
 */
function LongTermTaskCard({
  items,
  totalActive,
  loading,
  onViewAll,
}: {
  items: LongTermTaskItem[];
  totalActive: number;
  loading: boolean;
  onViewAll: () => void;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>長期挑戰</Text>
        {totalActive > 0 && <Text style={styles.sectionCount}>{totalActive} 項進行中</Text>}
        <TouchableOpacity style={styles.sectionLink} onPress={onViewAll} activeOpacity={0.7}>
          <Text style={styles.sectionLinkText}>查看全部</Text>
          <Chevron color={ParentColors.fgMuted} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={ParentColors.fgMuted} style={{ marginVertical: 12 }} />
      ) : items.length === 0 ? (
        <View style={styles.ltEmpty}>
          <Text style={styles.ltEmptyText}>尚未設定長期任務</Text>
          <Text style={styles.ltEmptyMeta}>在「管理」Tab 建立習慣養成或技能學習任務</Text>
        </View>
      ) : (
        items.map((item, i) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.pLt, i > 0 && styles.pLtDivider]}
            onPress={onViewAll}
            activeOpacity={0.6}
          >
            <View style={styles.pLtTop}>
              <TaskIconBubble name={item.name} size={36} />
              <Text style={styles.pLtName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.pLtMeta}>{item.progressLabel}</Text>
              <Text style={styles.pLtPct}>進度 {item.progressPct}%</Text>
              <Chevron />
            </View>
            <View style={styles.pLtTrack}>
              <View style={[styles.pLtFill, { width: `${item.progressPct}%` as `${number}%` }]} />
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

function Chevron({ color = ParentColors.ink300 }: { color?: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MarkPanel — inline override UI rendered below a done task row
// ─────────────────────────────────────────────────────────────────────────────

type ExtendedOpt = MarkOption | 'complete';

// Options shown when the child has already self-reported the task as done
const DONE_MARK_OPTIONS: { opt: ExtendedOpt; label: string }[] = [
  { opt: 'exceeded', label: '超出預期' },
  { opt: 'partial',  label: '部分完成' },
  { opt: 'none',     label: '今天沒做' },
  { opt: 'other',    label: '其他' },
];

// Options shown when the task is still pending / missed (child hasn't reported yet)
const PENDING_MARK_OPTIONS: { opt: ExtendedOpt; label: string }[] = [
  { opt: 'complete', label: '幫他標記完成' },
  { opt: 'none',     label: '今天沒做' },
  { opt: 'other',    label: '其他' },
];

function MarkPanel({
  task,
  childId,
  isDone,
  onSuccess,
  onCancel,
}: {
  task: DashboardTask;
  childId: string;
  isDone: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const hasCoin      = task.reward?.kind === 'coins';
  const taskCoin     = hasCoin ? (task.reward as { kind: 'coins'; amount: number }).amount : 0;
  const timeSavedMin = task.reward?.kind === 'time' ? (task.reward as { kind: 'time'; amount: number }).amount : 0;

  const defaultCoin = (opt: ExtendedOpt): number => {
    if (!hasCoin) return 0;
    if (!isDone) return opt === 'complete' ? taskCoin : 0;
    if (opt === 'exceeded') return Math.round(taskCoin * 1.5);
    if (opt === 'partial')  return Math.round(taskCoin * 0.5);
    if (opt === 'none')     return 0;
    return taskCoin; // 'other'
  };

  const [selectedOption, setSelectedOption] = useState<ExtendedOpt | null>(null);
  const [coinStr, setCoinStr]               = useState<string>('');
  const [note, setNote]                     = useState('');
  const [submitting, setSubmitting]         = useState(false);
  const [errorMsg, setErrorMsg]             = useState<string | null>(null);

  const handleOptionSelect = (opt: ExtendedOpt) => {
    setSelectedOption(opt);
    setCoinStr(String(defaultCoin(opt)));
    setErrorMsg(null);
  };

  // For pending tasks, only show coin stepper when "幫他標記完成" is selected
  const showCoin = hasCoin && selectedOption != null &&
    (isDone ? true : selectedOption === 'complete');

  const isConfirmDisabled =
    selectedOption == null ||
    (selectedOption === 'other' && note.trim() === '') ||
    submitting;

  const handleConfirm = async () => {
    if (selectedOption == null) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const coin    = Math.max(0, parseInt(coinStr || '0', 10));
      const noteVal = note.trim() !== '' ? note.trim() : null;
      if (selectedOption === 'complete') {
        await parentCompleteTaskForChild(task.id, childId, coin, timeSavedMin);
      } else {
        await parentMarkTask(task.id, childId, selectedOption, coin, noteVal);
      }
      onSuccess();
    } catch {
      setErrorMsg('標記失敗，請再試一次');
    } finally {
      setSubmitting(false);
    }
  };

  const options = isDone ? DONE_MARK_OPTIONS : PENDING_MARK_OPTIONS;

  return (
    <View style={styles.markPanel}>
      {/* Option chips */}
      <View style={styles.markPanelOptions}>
        {options.map(({ opt, label }) => {
          const isSelected = selectedOption === opt;
          const isComplete = opt === 'complete';
          return (
            <TouchableOpacity
              key={opt}
              style={[
                styles.markOptionChip,
                isSelected && (isComplete ? styles.markOptionChipComplete : styles.markOptionChipSelected),
              ]}
              onPress={() => handleOptionSelect(opt)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.markOptionText,
                  isSelected && (isComplete ? styles.markOptionTextComplete : styles.markOptionTextSelected),
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Coin adjustment input */}
      {showCoin && (
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
            {submitting ? '處理中...' : selectedOption === 'complete' ? '確認完成 →' : '確認標記 →'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Today's task panel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 今天做完的 —— 白卡清單（v14 理想圖）。
 * 信任制：預設只顯示「做完的」；未完成的收在底部「還有 N 項未完成任務」，點了原地展開。
 * 家長介入＝事後 override：每列常駐「⋯」點開 MarkPanel（退回/調整/幫他標記完成）。
 * 指派/建立任務維持清單尾的安靜連結（決策主場是申請審核）。
 */
function TodayTaskPanel({
  tasks,
  onAssignTask,
  onNewTask,
  childId,
  onMarked,
  onViewRecords,
}: {
  tasks: DashboardTask[];
  onAssignTask: () => void;
  onNewTask: () => void;
  childId: string;
  onMarked: () => void;
  onViewRecords: () => void;
}) {
  const doneTasks = tasks.filter(t => t.status === 'done');
  const undoneTasks = tasks.filter(t => t.status === 'pending' || t.status === 'missed');
  const [undoneOpen, setUndoneOpen] = useState(false);

  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>今天做完的</Text>
        <TouchableOpacity style={styles.sectionLink} onPress={onViewRecords} activeOpacity={0.7}>
          <Text style={styles.sectionLinkText}>查看全部 ({doneTasks.length}/{tasks.length})</Text>
          <Chevron color={ParentColors.fgMuted} />
        </TouchableOpacity>
      </View>

      {doneTasks.length === 0 ? (
        <View style={styles.ltEmpty}>
          <Text style={styles.ltEmptyText}>今天還沒有完成紀錄</Text>
        </View>
      ) : (
        doneTasks.map((t, i) => (
          <DoneTaskRow
            key={t.id}
            task={t}
            isLast={i === doneTasks.length - 1}
            childId={childId}
            onMarked={onMarked}
          />
        ))
      )}

      {undoneTasks.length > 0 && (
        <>
          <TouchableOpacity
            style={styles.undoneToggle}
            onPress={() => setUndoneOpen(o => !o)}
            activeOpacity={0.7}
          >
            <Text style={styles.undoneToggleText}>
              {undoneOpen ? '收合未完成任務' : `還有 ${undoneTasks.length} 項未完成任務`}
            </Text>
            <View style={undoneOpen ? styles.undoneChevronOpen : undefined}>
              <Chevron color={ParentColors.fgMuted} />
            </View>
          </TouchableOpacity>

          {undoneOpen &&
            undoneTasks.map((t, i) => (
              <UndoneTaskRow
                key={t.id}
                task={t}
                isLast={i === undoneTasks.length - 1}
                childId={childId}
                onMarked={onMarked}
              />
            ))}
        </>
      )}

      <View style={styles.quietLinkRow}>
        <TouchableOpacity style={styles.quietLink} onPress={onAssignTask} activeOpacity={0.75}>
          <Text style={styles.quietLinkText}>＋ 指派任務</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quietLink} onPress={onNewTask} activeOpacity={0.75}>
          <Text style={styles.quietLinkText}>＋ 建立新任務</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** 未完成任務列（原地展開）——灰空圈＋淡色名稱；「⋯」開 MarkPanel（幫他標記完成/今天沒做）。 */
function UndoneTaskRow({
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
  const [markOpen, setMarkOpen] = useState(false);

  return (
    <View style={!isLast ? styles.tRowDivider : undefined}>
      <View style={styles.tRow}>
        <View style={styles.tRowCkpEmpty} />
        <TaskIconBubble name={task.name} size={34} />
        <Text style={styles.tRowTaskUndone} numberOfLines={1}>{task.name}</Text>
        {task.reward != null && (
          task.reward.kind === 'coins' ? (
            <Text style={styles.tRowAmtTs}>可得 {task.reward.amount} 幣</Text>
          ) : (
            <Text style={styles.tRowAmtTs}>省 {task.reward.amount} 分</Text>
          )
        )}
        <TouchableOpacity
          onPress={() => setMarkOpen(v => !v)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.tRowMore}>{markOpen ? '×' : '⋯'}</Text>
        </TouchableOpacity>
      </View>

      {markOpen && (
        <MarkPanel
          task={task}
          childId={childId}
          isDone={false}
          onSuccess={() => { setMarkOpen(false); onMarked(); }}
          onCancel={() => setMarkOpen(false)}
        />
      )}
    </View>
  );
}

/** 今日做完的單列——勾圈＋名稱＋金額/時間＋完成時間＋「⋯」（點開下方 MarkPanel 可退回/調整）。 */
function DoneTaskRow({
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
  const [markOpen, setMarkOpen] = useState(false);

  return (
    <View style={!isLast ? styles.tRowDivider : undefined}>
      <View style={styles.tRow}>
        <View style={styles.tRowCkp}>
          <CheckSmIcon size={11} color="#fff" />
        </View>
        <TaskIconBubble name={task.name} size={34} />
        <Text style={styles.tRowTask} numberOfLines={1}>{task.name}</Text>
        {task.reward != null && (
          task.reward.kind === 'coins' ? (
            <Text style={styles.tRowAmt}>＋{task.reward.amount}</Text>
          ) : (
            <Text style={styles.tRowAmtTs}>省{task.reward.amount}分</Text>
          )
        )}
        {task.completedAt != null && (
          <Text style={styles.tRowAmtTs}>{task.completedAt}</Text>
        )}
        <TouchableOpacity
          onPress={() => setMarkOpen(v => !v)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.tRowMore}>{markOpen ? '×' : '⋯'}</Text>
        </TouchableOpacity>
      </View>

      {markOpen && (
        <MarkPanel
          task={task}
          childId={childId}
          isDone
          onSuccess={() => { setMarkOpen(false); onMarked(); }}
          onCancel={() => setMarkOpen(false)}
        />
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
  const [aiAnalysis, setAiAnalysis] = useState<AnalyzeTaskResult | null>(null);
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
    void (async () => {
      let ageGroup: AgeGroup = '6-9';
      try {
        const { data: child } = await supabase
          .from('children')
          .select('birth_date')
          .eq('id', currentChildId)
          .single();
        if (child?.birth_date) ageGroup = calcAgeGroup(child.birth_date);
      } catch {
        // 查不到出生日期就用預設年齡段，不擋 AI 分析。
      }

      const result = await analyzeTask({
        taskName: trimmed,
        childAgeGroup: ageGroup,
        taskSource: 'parent',
        durationType: 'recurring',
      });
      if (!isMounted.current) return;

      setAiAnalysis(result);
      if (result.pricing.status === 'priced') {
        setAiBaseTime(result.estimatedMinutes ?? null);
        setCoins(result.pricing.coins);
        setRewardMode('coin');
      } else if (!result.coinEnabled && result.rewardMode === 'family_contribution') {
        setRewardMode('time');
      }
      setAiLoading(false);
    })();
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
          claim_period: 'day',
          max_claims_per_period: 5,
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
      Alert.alert('建立失敗', err instanceof Error ? err.message : '請稍後再試');
      setSubmitting(false);
    }
  }

  async function handleHabitSubmit() {
    if (!familyId) { Alert.alert('載入中', '家庭資料尚未載入，請稍後再試'); return; }
    if (habitSubmitting || !effectiveTotalDays || !coinsAreValid()) return;
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
      Alert.alert('建立失敗', err instanceof Error ? err.message : '請稍後再試');
      setHabitSubmitting(false);
    }
  }

  async function handleSkillSubmit() {
    if (!familyId) { Alert.alert('載入中', '家庭資料尚未載入，請稍後再試'); return; }
    if (
      skillSubmitting || !effectiveTargetMonths ||
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
      Alert.alert('建立失敗', err instanceof Error ? err.message : '請稍後再試');
      setSkillSubmitting(false);
    }
  }

  function formatSkillMonths(): string {
    if (effectiveTargetMonths == null) return '';
    return `約 ${effectiveTargetMonths} 個月`;
  }

  async function handleFamilySubmit() {
    if (!familyId) { Alert.alert('載入中', '家庭資料尚未載入，請稍後再試'); return; }
    if (
      familySubmitting ||
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
      Alert.alert('建立失敗', err instanceof Error ? err.message : '請稍後再試');
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
            ) : aiAnalysis?.pricing.status === 'priced' ? (
              <Text style={styles.newTaskAiHint}>
                AI 建議：{aiBaseTime != null ? `約 ${aiBaseTime} 分鐘，` : ''}給 {aiAnalysis.pricing.coins} 幣（{aiAnalysis.reason}）
              </Text>
            ) : aiAnalysis && !aiAnalysis.coinEnabled ? (
              <Text style={styles.newTaskAiHint}>
                AI 判斷這比較像{aiAnalysis.rewardMode === 'family_contribution' ? '家庭本分（不建議發幣）' : '生活常規'}：{aiAnalysis.reason}
              </Text>
            ) : null}
            {aiAnalysis && (aiAnalysis.blockingIssues.length > 0 || aiAnalysis.requiresConfirmation.length > 0) && (
              <Text style={styles.newTaskAiWarn}>
                {[...aiAnalysis.blockingIssues.map(s => `⛔ ${s}`), ...aiAnalysis.requiresConfirmation.map(s => `❓ ${s}`)].join('\n')}
              </Text>
            )}
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

const WISH_REJECT_REASONS = [
  '幣值設定太高',
  '想再和孩子討論',
  '不符合家庭規則',
  '這個時間點不適合',
];

// ── 願望核准 card ──

function WishApprovalCard({
  wish,
  onApprove,
  childName,
}: {
  wish: ChildWishItem;
  onApprove: (id: string) => Promise<void>;
  childName: string;
}) {
  const [state, setState] = useState<'idle' | 'confirming' | 'approved' | 'rejected'>('idle');
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

  const handleReject = async (reason: string) => {
    setSubmitting(true);
    try {
      await supabase
        .from('reward_items')
        .update({ is_active: false, parent_note: reason } as any)
        .eq('id', wish.id);
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
    <View style={styles.reqCard}>
      <View style={styles.reqTopRow}>
        <View style={styles.reqIllust}>
          <Illustration kind="rewardChest" size={52} />
        </View>
        <View style={styles.reqBody}>
          <Text style={styles.reqTitle} numberOfLines={1}>{wish.name}</Text>
          <Text style={styles.reqMeta}>
            {childName}申請加入兌換清單，已等待 {waitLabel}
          </Text>
          <View style={styles.reqSuggestRow}>
            <CoinSmIcon size={13} />
            <Text style={styles.reqSuggestText}>建議兌換條件：{wish.coin_cost} 枚成長幣</Text>
          </View>
          {isLongWait && (
            <Text style={styles.reqAiUrgent}>已等 {waitLabel}，孩子可能還在等回覆</Text>
          )}
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
            <Text style={styles.proposalApproveBtnText}>加入獎勵清單</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.proposalRejectBtn, submitting && { opacity: 0.5 }]}
            onPress={() => setState('confirming')}
            disabled={submitting}
            activeOpacity={0.8}
          >
            <Text style={styles.proposalRejectBtnText}>婉拒／調整</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === 'confirming' && (
        <View style={styles.rejectPanel}>
          <Text style={styles.rejectPanelTitle}>選擇拒絕原因</Text>
          <View style={styles.rejectReasonList}>
            {WISH_REJECT_REASONS.map(r => (
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

/**
 * 申請審核 —— 家長的唯一決策主場（鎖定樣式＝提案 artifact「THE parent decision surface」）。
 * 呼叫端已把 childWishes 過濾到目前選中的孩子；這裡純渲染 req-card 清單，
 * 不再有自己的大標題/子區塊 chrome（標題由呼叫端的「有 N 件申請等你」負責）。
 */
function PendingItemsPanel({
  childWishes,
  approveChildWish,
  childName,
}: {
  childWishes: ChildWishItem[];
  approveChildWish: (id: string) => Promise<void>;
  childName: string;
}) {
  const pendingWishes = childWishes.filter(w => !w.parent_approved);

  if (pendingWishes.length === 0) {
    return (
      <View style={styles.reqEmpty}>
        <Text style={styles.reqEmptyText}>目前沒有申請，孩子的願望申請會出現在這裡</Text>
      </View>
    );
  }

  return (
    <View>
      {pendingWishes.map(w => (
        <WishApprovalCard key={w.id} wish={w} onApprove={approveChildWish} childName={childName} />
      ))}
    </View>
  );
}

const ADVISOR_PROMPTS: { icon: React.ReactElement; text: (name: string) => string }[] = [
  { icon: <StarIcon size={14} color={ParentColors.gold500} />,     text: n => `${n}最近有哪些事值得先肯定？` },
  { icon: <SlidersIcon size={14} color={ParentColors.pine400} />,  text: () => '這週任務節奏怎麼安排比較舒服？' },
  { icon: <GiftLineIcon size={14} color={ParentColors.clay500} />, text: () => '這個獎勵目標適合設定多少幣？' },
];

function InfoDotIcon({ size = 13, color = ParentColors.fgMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Path d="M12 11v5.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={12} cy={7.6} r={1.1} fill={color} />
    </Svg>
  );
}

function BanIcon({ size = 15, color = ParentColors.fgSecondary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Path d="M6.5 6.5l11 11" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * AI 教養顧問 —— 右欄的主要內容（鎖定樣式＝ .t-ask），取代原本的「本週統計」。
 * 點快捷提問／輸入框會帶著問題文字打開 AdvisorSideSheet 展開對話。
 */
function AdvisorPanel({
  childName,
  onOpenWeekly,
  onOpenAdvisor,
}: {
  childName: string;
  onOpenWeekly: () => void;
  onOpenAdvisor: (prompt?: string) => void;
}) {
  return (
    <View style={styles.advisorCard}>
      <View style={styles.advisorHead}>
        <View style={styles.advisorAvatar}>
          <RobotIcon size={19} color={ParentColors.pine500} />
        </View>
        <View style={styles.advisorHeadText}>
          <Text style={styles.advisorTitle}>AI 教養顧問</Text>
          <Text style={styles.advisorSub}>依你和{childName}的紀錄，陪你一起想下一步。</Text>
        </View>
      </View>

      <View style={styles.advisorPrompts}>
        {ADVISOR_PROMPTS.map((p, i) => (
          <TouchableOpacity
            key={i}
            style={styles.advisorPrompt}
            onPress={() => onOpenAdvisor(p.text(childName))}
            activeOpacity={0.7}
          >
            {p.icon}
            <Text style={styles.advisorPromptText}>{p.text(childName)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.advisorBox} onPress={() => onOpenAdvisor()} activeOpacity={0.7}>
        <Text style={styles.advisorBoxText}>想問{childName}的什麼…</Text>
        <View style={styles.advisorSend}>
          <SendArrowIcon size={12} />
        </View>
      </TouchableOpacity>

      <Text style={styles.railLink}>
        本週的數字，週日的 <Text style={styles.railLinkAction} onPress={onOpenWeekly}>週報</Text> 會整理好
      </Text>
    </View>
  );
}

type AdvisorChatMessage = { role: 'parent' | 'ai'; text: string; at: string };

/**
 * 展開後的 AI 諮詢對話面板：頭像式訊息串＋快捷後續動作＋輸入框。
 * 快捷提問與自由輸入都真的呼叫 Gemini（見 chatWithAdvisor），只餵入畫面上
 * 本來就會顯示的彙總資料（今日完成數、長期任務進度），不額外查詢逐筆紀錄。
 */
function AdvisorSideSheet({
  childName,
  parentName,
  initialPrompt,
  ltItems,
  doneToday,
  totalToday,
  onClose,
  onOpenWeekly,
}: {
  childName: string;
  parentName: string;
  initialPrompt?: string;
  ltItems: LongTermTaskItem[];
  doneToday: number;
  totalToday: number;
  onClose: () => void;
  onOpenWeekly: () => void;
}) {
  const [messages, setMessages] = useState<AdvisorChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const askedInitial = useRef(false);

  const ask = useCallback(
    async (question: string, historyBefore: AdvisorChatMessage[]) => {
      setSending(true);
      const reply = await chatWithAdvisor({
        childName,
        question,
        doneToday,
        totalToday,
        longTermSummary: ltItems.map(i => ({ name: i.name, progressPct: i.progressPct })),
        history: historyBefore.map(m => ({ role: m.role, text: m.text })),
      });
      setMessages(prev => [...prev, { role: 'ai', text: reply, at: dayjs().format('HH:mm') }]);
      setSending(false);
    },
    [childName, doneToday, totalToday, ltItems],
  );

  useEffect(() => {
    if (initialPrompt && !askedInitial.current) {
      askedInitial.current = true;
      setMessages([{ role: 'parent', text: initialPrompt, at: dayjs().format('HH:mm') }]);
      void ask(initialPrompt, []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMessages(prev => {
      const historyBefore = prev;
      void ask(text, historyBefore);
      return [...prev, { role: 'parent', text, at: dayjs().format('HH:mm') }];
    });
  };

  const notReady = () => Alert.alert('即將推出', '這個功能還在準備中。');

  return (
    <View style={styles.advisorSheetLayer} pointerEvents="box-none">
      <TouchableOpacity style={styles.advisorSheetScrim} onPress={onClose} activeOpacity={1} />
      <View style={styles.advisorSideSheet}>
        <View style={styles.chatHeader}>
          <View style={styles.chatHeaderAvatar}>
            <RobotIcon size={18} color={ParentColors.pine500} />
          </View>
          <View style={styles.chatHeaderText}>
            <Text style={styles.chatHeaderTitle}>AI 教養顧問</Text>
            <View style={styles.chatHeaderSubRow}>
              <Text style={styles.chatHeaderSub} numberOfLines={1}>正在參考：{childName}｜本週任務與紀錄</Text>
              <InfoDotIcon size={12} />
            </View>
          </View>
          <TouchableOpacity style={styles.advisorSheetClose} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <XIcon size={13} color={ParentColors.fgSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.chatScroll} contentContainerStyle={styles.chatScrollContent}>
          {messages.length === 0 ? (
            <Text style={styles.chatEmptyText}>想問{childName}的什麼都可以，我會依目前的紀錄幫你整理重點。</Text>
          ) : (
            messages.map((m, i) =>
              m.role === 'parent' ? (
                <View key={i} style={styles.chatParentRow}>
                  <View style={styles.chatParentBubble}>
                    <Text style={styles.chatParentText}>{m.text}</Text>
                  </View>
                  <View style={styles.chatParentAvatar}>
                    <Text style={styles.chatParentAvatarText}>{(parentName || '家').charAt(0)}</Text>
                  </View>
                </View>
              ) : (
                <View key={i} style={styles.chatAiRow}>
                  <View style={styles.chatAiAvatar}>
                    <RobotIcon size={14} color={ParentColors.pine500} />
                  </View>
                  <View style={styles.chatAiBubble}>
                    <Text style={styles.chatAiText}>{m.text}</Text>
                  </View>
                </View>
              ),
            )
          )}
          {sending && (
            <View style={styles.chatAiRow}>
              <View style={styles.chatAiAvatar}>
                <RobotIcon size={14} color={ParentColors.pine500} />
              </View>
              <View style={styles.chatAiBubble}>
                <ActivityIndicator size="small" color={ParentColors.pine500} />
              </View>
            </View>
          )}
        </ScrollView>

        {messages.length > 0 && (
          <View style={styles.chatActionList}>
            <TouchableOpacity style={styles.chatActionRow} onPress={onOpenWeekly} activeOpacity={0.7}>
              <ChartNavIcon size={15} color={ParentColors.fgSecondary} />
              <Text style={styles.chatActionText}>查看相關紀錄</Text>
              <Chevron color={ParentColors.ink300} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.chatActionRow} onPress={notReady} activeOpacity={0.7}>
              <SlidersIcon size={15} color={ParentColors.fgSecondary} />
              <Text style={styles.chatActionText}>調整任務建議</Text>
              <Chevron color={ParentColors.ink300} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.chatActionRow} onPress={onClose} activeOpacity={0.7}>
              <BanIcon size={15} color={ParentColors.fgSecondary} />
              <Text style={styles.chatActionText}>忽略這則建議</Text>
              <Chevron color={ParentColors.ink300} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.chatInputRow}>
          <TextInput
            style={styles.chatInput}
            placeholder={`輸入想問${childName}的問題…`}
            placeholderTextColor={ParentColors.fgMuted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.chatSendBtn, sending && styles.chatSendBtnDisabled]}
            onPress={handleSend}
            disabled={sending}
            activeOpacity={0.8}
          >
            <SendArrowIcon size={14} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={styles.chatDisclaimer}>AI 建議僅供參考，實際教養請依孩子狀況調整。</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Account menu — 家長頭像下拉選單（帳號設定／登出）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 頭像下拉選單 —— scrim 跟選單卡一起渲染在畫面最外層（跟 AdvisorSideSheet 同一層級），
 * 避免選單卡巢狀在 columns 深處、被後渲染的 scrim 蓋到上面的疊層問題。
 * 選單卡位置用 anchor（頭像實際量測到的螢幕座標）算出來，不猜固定像素，
 * 不管裝置寬度、字級大小怎麼變，都會準確貼在頭像正下方。
 */
function AccountMenu({
  anchor,
  onClose,
  onOpenSettings,
  onLogout,
}: {
  anchor: { top: number; right: number };
  onClose: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}) {
  return (
    <View style={styles.accountMenuLayer} pointerEvents="box-none">
      <TouchableOpacity style={styles.accountMenuScrim} onPress={onClose} activeOpacity={1} />
      <View style={[styles.accountMenu, { top: anchor.top, right: anchor.right }]}>
        <TouchableOpacity style={styles.accountMenuItem} onPress={onOpenSettings} activeOpacity={0.7}>
          <UserCircleIcon size={16} color={ParentColors.fgSecondary} />
          <Text style={styles.accountMenuItemText}>帳號設定</Text>
        </TouchableOpacity>
        <View style={styles.accountMenuDivider} />
        <TouchableOpacity style={styles.accountMenuItem} onPress={onLogout} activeOpacity={0.7}>
          <LogoutIcon size={16} color={ParentColors.error} />
          <Text style={[styles.accountMenuItemText, styles.accountMenuDangerText]}>登出</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

/** 依時段的問候語（頂部問候列用） */
function greetingLabel(): string {
  const h = dayjs().hour();
  if (h < 5) return '晚安';
  if (h < 11) return '早安';
  if (h < 18) return '午安';
  return '晚安';
}

export function buildParentGreeting({
  parentName,
  pendingCount,
  doneToday,
  totalToday,
  missedToday,
  longTermActive,
}: {
  parentName: string | null;
  pendingCount: number;
  doneToday: number;
  totalToday: number;
  missedToday: number;
  longTermActive: number;
}): string {
  const name = parentName?.trim() || '家長';

  if (pendingCount > 0) {
    return `${name}，今天先看 ${pendingCount} 件需要決定的事。`;
  }

  if (totalToday === 0) {
    return `${name}，今天先整理一下家裡的成長節奏。`;
  }

  if (doneToday >= totalToday) {
    return `${name}，今天的紀錄很完整，可以晚點一起回顧。`;
  }

  if (missedToday > 0) {
    return `${name}，今天先回頭看幾件還沒完成的事。`;
  }

  if (doneToday > 0) {
    return `${name}，今天已有 ${doneToday} 件完成，可以看下一步。`;
  }

  if (longTermActive > 0) {
    return `${name}，今天先看看長期任務的節奏。`;
  }

  return `${name}，今天先看最需要決定的事。`;
}

export default function ParentHomeTablet() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { childId, childName, allChildren, setSelectedChild } = useSelectedChild();

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [parentName, setParentName] = useState<string | null>(null);
  const [rightMode, setRightMode] = useState<'pending' | 'assign' | 'newTask'>('pending');
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisorInitialPrompt, setAdvisorInitialPrompt] = useState<string | undefined>(undefined);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountMenuAnchor, setAccountMenuAnchor] = useState<{ top: number; right: number } | null>(null);
  const avatarRef = useRef<View>(null);
  const { width: windowWidth } = useWindowDimensions();

  // Reset right panel when selected child changes to prevent cross-child confusion
  useEffect(() => {
    setRightMode('pending');
    setAdvisorOpen(false);
    setAccountMenuOpen(false);
  }, [childId]);

  const handleToggleAccountMenu = useCallback(() => {
    if (accountMenuOpen) {
      setAccountMenuOpen(false);
      return;
    }
    // 量測頭像實際的螢幕座標，選單卡才會精準貼在頭像下方 —— 不管裝置寬度、
    // 字級大小怎麼變（響應式排版下標頭高度會跟著變），都不會跑版。
    avatarRef.current?.measureInWindow((x, y, width, height) => {
      setAccountMenuAnchor({ top: y + height + 8, right: Math.max(16, windowWidth - (x + width)) });
      setAccountMenuOpen(true);
    });
  }, [accountMenuOpen, windowWidth]);

  useEffect(() => {
    async function loadFamily() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('parents')
          .select('family_id, name')
          .eq('user_id', user.id)
          .single();
        if (data?.family_id) setFamilyId(data.family_id as string);
        if (data?.name) setParentName(data.name as string);
      } catch (err) {
        console.error('[ParentHomeTablet] loadFamily error:', err);
      }
    }
    void loadFamily();
  }, []);

  const {
    childWishes,
    approveChildWish,
    fetchAll: refreshRedemption,
  } = useParentRedemption(familyId);

  const {
    child,
    spendingBalance,
    weekCoinDelta,
    weekTimeSavedMin,
    todayTasks,
    loading,
    error,
    refresh,
  } = useParentDashboard(childId);

  const {
    items: ltItems,
    totalActive: ltTotalActive,
    loading: ltLoading,
    refresh: ltRefresh,
  } = useLongTermTasks(childId);

  useFocusEffect(
    useCallback(() => {
      refresh();
      ltRefresh();
      void refreshRedemption();
    }, [refresh, ltRefresh, refreshRedemption]),
  );

  const handleViewAllLongTerm = useCallback(() => {
    // ParentHomeTablet renders inside the bottom-tab navigator, so navigating
    // directly switches to the sibling "Manage" tab. getParent() would target
    // the outer Stack (which has no "Manage" screen) and silently fail.
    navigation.navigate('Manage' as never);
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

  const handleBellPress = useCallback(() => {
    // 通知中心尚未實作（docs/parent-home-next-phase.md）
    Alert.alert('通知中心即將推出', '孩子的申請會先出現在首頁的「待你確認」。');
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      const { error: signOutErr } = await supabase.auth.signOut();
      if (signOutErr) throw signOutErr;
      // Entry 畫面 mount 時會檢查 session、有 session 就導回 ParentTab，
      // 所以一定要先確定 signOut 成功，再做 reset，順序反了會登出後又被彈回去。
      // navigation 這裡是 Tab Navigator 的，Entry 在 Root Stack，要用 getParent() 才能到得了。
      navigation.getParent()?.dispatch(
        CommonActions.reset({ index: 0, routes: [{ name: 'Entry' }] }),
      );
    } catch (err) {
      console.error('[ParentHomeTablet] logout error:', err);
      Alert.alert('登出失敗', '請確認網路連線後再試一次');
    }
  }, [navigation]);

  const handleLogoutPress = useCallback(() => {
    setAccountMenuOpen(false);
    Alert.alert(
      '登出帳號？',
      '登出後需要重新登入才能回來',
      [
        { text: '取消', style: 'cancel' },
        { text: '登出', style: 'destructive', onPress: () => { void handleLogout(); } },
      ],
    );
  }, [handleLogout]);

  const handleTaskPack = useCallback(() => {
    // 一鍵任務包尚未實作（docs/parent-home-next-phase.md）
    Alert.alert('一鍵任務包即將推出', '之後 AI 會依孩子年齡與紀錄，幫你組一組合適的任務。');
  }, []);

  const handleViewRecords = useCallback(() => {
    navigation.navigate('Weekly' as never);
  }, [navigation]);

  const handleViewHome = useCallback(() => {
    navigation.navigate('Dashboard' as never);
  }, [navigation]);

  const doneToday = todayTasks.filter(t => t.status === 'done').length;
  const totalToday = todayTasks.length;
  const attentionCount = todayTasks.filter(t => t.status === 'missed').length;

  // 申請審核：過濾到目前選中的孩子（單一孩子視圖 — 全家彙總是之後的功能）
  const unapprovedWishes = childWishes.filter(w => !w.parent_approved);
  const childPendingWishes = unapprovedWishes.filter(w => w.child_id === childId);
  const childPendingCount = childPendingWishes.length;
  const parentGreeting = buildParentGreeting({
    parentName,
    pendingCount: childPendingCount,
    doneToday,
    totalToday,
    missedToday: attentionCount,
    longTermActive: ltTotalActive,
  });

  // 側欄徽章：每個孩子各自的待處理數量
  const pendingCounts: Record<string, number> = {};
  for (const c of allChildren) {
    pendingCounts[c.id] = unapprovedWishes.filter(w => w.child_id === c.id).length;
  }

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

  const nickname = child?.nickname ?? childName;

  return (
    <View style={webTabletScreen}>
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <View style={styles.columns}>

        {/* ── Left sidebar ── */}
        <ParentSidebar
          activeTab="home"
          allChildren={allChildren}
          childId={childId}
          setSelectedChild={setSelectedChild}
          pendingCounts={pendingCounts}
          onNavigateHome={handleViewHome}
          onNavigateWeekly={handleViewRecords}
          onNavigateManage={handleNavigateManage}
          onAddChild={handleAddChild}
        />

        {/* ── 側欄之後的整個內容區 ── */}
        <View style={styles.contentArea}>

        {/* ── 頂部問候列：跨中欄＋右欄整個寬度，通知鈴鐺／家長頭像才會貼齊整個頁面的右邊界
             （理想圖裡鈴鐺＋頭像在最外側，不是卡在中欄跟右欄中間）。 ── */}
        <View style={[styles.pageHeader, { paddingTop: insets.top + 16 }]}>
          <View style={styles.mainHeaderLeft}>
            <View style={styles.mainHeaderDateRow}>
              <Text style={styles.mainHeaderDate}>
                {dayjs().format('M 月 D 日 dddd')} · {greetingLabel()}
              </Text>
              <SunIcon size={14} />
            </View>
            <Text style={styles.mainHeaderTitle}>{parentGreeting}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.bellBtn} onPress={handleBellPress} activeOpacity={0.7}>
              <BellIcon size={20} color={ParentColors.fgSecondary} />
              {childPendingCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{childPendingCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              ref={avatarRef}
              style={styles.avatarPill}
              onPress={handleToggleAccountMenu}
              activeOpacity={0.7}
            >
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarCircleText}>{(parentName ?? '家長').charAt(0)}</Text>
              </View>
              <Text style={styles.avatarName}>{parentName ?? '家長'}</Text>
              <View style={accountMenuOpen ? styles.avatarChevronOpen : undefined}>
                <ChevronDownIcon size={13} color={ParentColors.fgMuted} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 中欄＋右欄的共同容器 ──
             mainAreaWrap 設 maxWidth，螢幕比設計寬很多（大平板/桌機瀏覽器）時不會無限撐開；
             justifyContent:'center' 讓兩欄一起在側欄之後的剩餘空間置中，
             不會變成中欄無止盡拉寬、字級和留白看起來越來越稀疏。 */}
        <View style={styles.contentCluster}>

        {/* ── Main area —— 申請審核＝決策主場 ──
             外層固定 flex:1 的純 View 決定寬度，內層 ScrollView 只管捲動，
             不讓 ScrollView 自己參與 row 的寬度分配（react-native-web 不可靠）。 */}
        <View style={styles.mainAreaWrap}>
        <ScrollView
          style={[styles.mainArea, webMouseDraggableScroll]}
          contentContainerStyle={[styles.mainContent, { paddingTop: 4, paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── 待你確認 hero 卡（沒有待審就安靜帶過） ── */}
          {childPendingCount > 0 ? (
            <View style={styles.heroCard}>
              <View style={styles.heroHead}>
                <Text style={styles.heroEyebrow}>待你確認 {childPendingCount} 件</Text>
                <View style={styles.heroBalance}>
                  <Text style={styles.heroBalanceNum}>{spendingBalance}</Text>
                  <Text style={styles.heroBalanceUnit}>幣</Text>
                </View>
              </View>
              <PendingItemsPanel
                childWishes={childPendingWishes}
                approveChildWish={approveChildWish}
                childName={nickname}
              />
              <View style={styles.heroTipRow}>
                <StarIcon size={12} color={ParentColors.gold500} />
                <Text style={styles.heroTipText}>把獎勵變成目標，和{nickname}一起討論完成的方式吧！</Text>
              </View>
            </View>
          ) : (
            <View style={styles.reqEmpty}>
              <Text style={styles.reqEmptyText}>目前沒有申請，孩子的願望申請會出現在這裡</Text>
            </View>
          )}

          <WeekSummary
            spendingBalance={spendingBalance}
            weekCoinDelta={weekCoinDelta}
            doneToday={doneToday}
            totalToday={totalToday}
            weekTimeSavedMin={weekTimeSavedMin}
          />

          <LongTermTaskCard
            items={ltItems}
            totalActive={ltTotalActive}
            loading={ltLoading}
            onViewAll={handleViewAllLongTerm}
          />

          <TodayTaskPanel
            tasks={todayTasks}
            onAssignTask={() => setRightMode('assign')}
            onNewTask={() => setRightMode('newTask')}
            childId={childId}
            onMarked={refresh}
            onViewRecords={handleViewRecords}
          />
        </ScrollView>
        </View>

        {/* ── Right column —— AI 教養顧問（純參考，不是決策） ──
             同理：外層固定寬 208 的純 View，內層 ScrollView 只管捲動。 */}
        <View style={styles.rightColWrap}>
        <ScrollView
          style={[styles.rightCol, webMouseDraggableScroll]}
          contentContainerStyle={[styles.rightColContent, { paddingTop: 4, paddingBottom: 40 }]}
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
            <>
              <AdvisorPanel
                childName={nickname}
                onOpenWeekly={handleViewRecords}
                onOpenAdvisor={(prompt) => { setAdvisorInitialPrompt(prompt); setAdvisorOpen(true); }}
              />
              <TipCard />
              <WeekDigestCard
                lines={buildWeekDigestLines({ doneToday, totalToday, longTermItems: ltItems })}
                onOpenWeekly={handleViewRecords}
              />
              <TaskPackCard onPress={handleTaskPack} />
            </>
          )}
        </ScrollView>
        </View>

        </View>
        </View>
      </View>
      {advisorOpen && (
        <AdvisorSideSheet
          childName={nickname}
          parentName={parentName ?? '家長'}
          initialPrompt={advisorInitialPrompt}
          ltItems={ltItems}
          doneToday={doneToday}
          totalToday={totalToday}
          onClose={() => { setAdvisorOpen(false); setAdvisorInitialPrompt(undefined); }}
          onOpenWeekly={handleViewRecords}
        />
      )}
      {accountMenuOpen && accountMenuAnchor && (
        <AccountMenu
          anchor={accountMenuAnchor}
          onClose={() => setAccountMenuOpen(false)}
          onOpenSettings={() => { setAccountMenuOpen(false); navigation.navigate('ParentSettings'); }}
          onLogout={handleLogoutPress}
        />
      )}
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
    width: '100%',
  },
  // 側欄之後的整個內容區：頂部問候列（跨滿寬）＋ 下面中欄/右欄的 contentCluster。
  contentArea: {
    flex: 1,
    minWidth: 0,
  },
  // 中欄＋右欄的共同容器：側欄之後的剩餘空間；寬螢幕時讓兩欄一起置中，不無限拉寬中欄。
  contentCluster: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minWidth: 0,
  },

  // 左側欄樣式已搬到共用元件 ParentSidebar.tsx（parentSidebarStyles）
  // ── Main area ──
  // 外層純 View 決定寬度；ScrollView 只 flex:1 填滿，不參與寬度分配。
  // maxWidth 頂住：螢幕比設計寬很多時，中欄不會無限撐開變得又寬又稀疏
  // （在 contentCluster 裡跟右欄一起置中，見上方 columns 附近的說明）。
  mainAreaWrap: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    maxWidth: 880,
    minWidth: 0,
    backgroundColor: ParentColors.bgCanvas,
  },
  mainArea: {
    flex: 1,
  },
  mainContent: {
    paddingHorizontal: ParentSpacing.cardPadLg,
    paddingBottom: ParentSpacing[6],
    gap: 16,
  },

  // ── Long-term task card ──
  ltSection: {
    marginBottom: 6,
  },
  ltEmpty: {
    paddingVertical: 16,
    alignItems: 'center',
    gap: 4,
  },
  ltEmptyText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },
  ltEmptyMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.ink400,
    textAlign: 'center',
  },

  // ── 白卡區塊（長期挑戰／今天做完的 共用）──
  sectionCard: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    paddingVertical: 18,
    paddingHorizontal: 20,
    ...ParentShadows.card,
    shadowOpacity: 0.06,
    shadowRadius: 18,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  sectionCount: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },
  sectionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
  },
  sectionLinkText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },

  // ── 長期挑戰列（p-lt）──
  pLt: {
    paddingVertical: 11,
    gap: 6,
  },
  pLtDivider: {
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
  },
  pLtTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pLtName: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: 15,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  pLtMeta: {
    fontFamily: ParentFonts.mono,
    fontSize: 11,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgMuted,
    flexShrink: 0,
  },
  pLtPct: {
    fontFamily: ParentFonts.mono,
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
    flexShrink: 0,
  },
  pLtTrack: {
    height: 5,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.borderMedium,
    overflow: 'hidden',
  },
  pLtFill: {
    height: '100%',
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.done,
  },

  // ── Task panel ──
  // ── 今天做完的（t-row done） ──
  tRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
  },
  tRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  tRowCkp: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ParentColors.done,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tRowCkpEmpty: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.6,
    borderColor: ParentColors.borderMedium,
    flexShrink: 0,
  },
  tRowTaskUndone: {
    flex: 1,
    minWidth: 0,
    fontFamily: ParentFonts.body,
    fontSize: 15,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },
  undoneToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
    marginTop: 8,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  undoneToggleText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  undoneChevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  tRowTask: {
    flex: 1,
    minWidth: 0,
    fontFamily: ParentFonts.body,
    fontSize: 15,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  tRowAmt: {
    fontFamily: ParentFonts.mono,
    fontSize: 13,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgMuted,
    flexShrink: 0,
  },
  tRowAmtTs: {
    fontFamily: ParentFonts.mono,
    fontSize: 12,
    color: ParentColors.fgMuted,
    flexShrink: 0,
  },
  tRowMore: {
    fontSize: 15,
    color: ParentColors.fgMuted,
    paddingHorizontal: 2,
  },
  tMore: {
    marginTop: 10,
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.fgSecondary,
  },
  tMoreLink: {
    color: ParentColors.accent,
    fontWeight: ParentFontWeights.semi,
    textDecorationLine: 'underline',
  },
  quietLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  quietLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ParentColors.borderMedium,
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  quietLinkText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.accent,
  },
  quietLinkSep: {
    fontSize: 12,
    color: ParentColors.ink300,
  },

  // ── 申請審核空狀態 ──
  reqEmpty: {
    paddingVertical: 20,
    paddingHorizontal: 4,
  },
  reqEmptyText: {
    fontFamily: ParentFonts.body,
    fontSize: 13,
    color: ParentColors.fgMuted,
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
  markOptionChipComplete: {
    backgroundColor: ParentColors.success,
    borderColor: ParentColors.success,
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
  markOptionTextComplete: {
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
    backgroundColor: ParentColors.pine500,
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
  // ── Right column ──
  // 外層純 View 決定寬度；ScrollView 只 flex:1 填滿。
  // flexBasis 固定值（不用 % ）：父層改成 contentCluster 之後，% 是相對於它算，
  // 用固定值比較好推算，min/maxWidth 還是照舊夾住範圍。
  rightColWrap: {
    flexBasis: 300,
    minWidth: 260,
    maxWidth: 340,
    flexGrow: 0,
    flexShrink: 1,
    backgroundColor: ParentColors.bgRail,
    borderLeftWidth: 1,
    borderLeftColor: ParentColors.borderMedium,
  },
  rightCol: {
    flex: 1,
  },
  rightColContent: {
    padding: 16,
    gap: 16,
  },
  // ── AI 教養顧問（t-ask） ──
  advisorCard: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    padding: 16,
    ...ParentShadows.card,
    shadowOpacity: 0.06,
    shadowRadius: 18,
  },
  advisorHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  advisorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: ParentColors.tintPine,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  advisorHeadText: {
    flex: 1,
    minWidth: 0,
  },
  advisorTitle: {
    fontFamily: ParentFonts.body,
    fontSize: 16,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.fgPrimary,
    marginBottom: 3,
  },
  advisorSub: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 20,
    color: ParentColors.fgSecondary,
  },
  advisorPrompts: {
    gap: 8,
    marginBottom: 12,
  },
  advisorPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  advisorPromptText: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.bgSidebar,
    lineHeight: 18,
  },
  advisorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderWidth: 1,
    borderColor: ParentColors.borderMedium,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  advisorBoxText: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },
  advisorSend: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: ParentColors.bgSidebar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railLink: {
    marginTop: 12,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 18,
    color: ParentColors.fgSecondary,
  },
  railLinkAction: {
    color: ParentColors.accent,
    fontWeight: ParentFontWeights.semi,
    textDecorationLine: 'underline',
  },
  advisorSheetLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  // 理想圖裡展開後主欄／側欄都維持全亮，不像一般 modal 蓋一層暗色——
  // scrim 只負責「點外面關閉」，不做視覺變暗。
  advisorSheetScrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'transparent',
  },
  advisorSideSheet: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 420,
    maxWidth: '46%',
    minWidth: 380,
    backgroundColor: ParentColors.bgSurface,
    borderLeftWidth: 1,
    borderLeftColor: ParentColors.borderMedium,
    flexDirection: 'column',
    ...ParentShadows.card,
  },
  // ── 對話面板頭：機器人頭像＋標題／副標｜關閉鈕 ──
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  chatHeaderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: ParentColors.tintPine,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chatHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  chatHeaderTitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.fgPrimary,
  },
  chatHeaderSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  chatHeaderSub: {
    flexShrink: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  advisorSheetClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.bgCanvas,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    flexShrink: 0,
  },
  // ── 對話串 ──
  chatScroll: {
    flex: 1,
  },
  chatScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
  },
  chatEmptyText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 20,
    color: ParentColors.fgMuted,
  },
  chatParentRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    gap: 8,
  },
  chatParentBubble: {
    maxWidth: '78%',
    backgroundColor: ParentColors.pine500,
    borderRadius: 14,
    borderBottomRightRadius: 4,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  chatParentText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 20,
    color: '#fff',
  },
  chatParentAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ParentColors.pine100,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chatParentAvatarText: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
  },
  chatAiRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  chatAiAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ParentColors.tintPine,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  chatAiBubble: {
    flex: 1,
  },
  chatAiText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 21,
    color: ParentColors.fgPrimary,
  },
  // ── 後續動作清單 ──
  chatActionList: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  chatActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgCanvas,
  },
  chatActionText: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  // ── 輸入框 ──
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
  },
  chatInput: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgPrimary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgCanvas,
  },
  chatSendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.pine500,
    flexShrink: 0,
  },
  chatSendBtnDisabled: {
    opacity: 0.5,
  },
  chatDisclaimer: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    color: ParentColors.fgMuted,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  // ── 主欄標頭：日期問候＋大標｜鈴鐺＋家長頭像 ──
  // 跨中欄＋右欄整個寬度的問候列：左邊對齊中欄左緣，右邊（鈴鐺／頭像）對齊右欄右緣。
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    paddingLeft: ParentSpacing.cardPadLg,
    paddingRight: 16,
    paddingBottom: 16,
  },
  mainHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  mainHeaderDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  mainHeaderDate: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    letterSpacing: 0.2,
    color: ParentColors.fgMuted,
  },
  mainHeaderTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h1,
    fontWeight: ParentFontWeights.bold,
    letterSpacing: -0.5,
    color: ParentColors.fgPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
    paddingTop: 2,
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    ...ParentShadows.card,
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  bellBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: ParentColors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: {
    fontFamily: ParentFonts.body,
    fontSize: 10,
    fontWeight: ParentFontWeights.bold,
    color: '#fff',
  },
  avatarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    ...ParentShadows.card,
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.pine100,
  },
  avatarCircleText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
  },
  avatarName: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  avatarChevronOpen: {
    transform: [{ rotate: '180deg' }],
  },

  // ── 帳號下拉選單（頭像 ▼ 點開） ──
  accountMenuLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 30,
  },
  accountMenuScrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  accountMenu: {
    position: 'absolute',
    width: 200,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    paddingVertical: 6,
    ...ParentShadows.card,
  },
  accountMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  accountMenuItemText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
  },
  accountMenuDangerText: {
    color: ParentColors.error,
  },
  accountMenuDivider: {
    height: 1,
    marginHorizontal: 8,
    backgroundColor: ParentColors.borderSoft,
  },

  // ── 待你確認 hero 卡 ──
  heroCard: {
    backgroundColor: ParentColors.bgHero,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ParentColors.borderMedium,
    padding: 14,
    ...ParentShadows.card,
    shadowOpacity: 0.055,
    shadowRadius: 18,
  },
  heroHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  heroEyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.amber700,
  },
  heroBalance: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  heroBalanceNum: {
    fontFamily: ParentFonts.display,
    fontSize: 17,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.gold700,
    fontVariant: ['tabular-nums'],
  },
  heroBalanceUnit: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  heroTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  heroTipText: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 17,
    color: ParentColors.fgSecondary,
  },
  // ── Wish approval card ──
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
  // ── req-card —— 申請審核內容直接鋪在米黃 hero 裡，避免雙層卡片感 ──
  reqCard: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    padding: 0,
    marginBottom: 8,
    ...ParentShadows.card,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  reqTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reqIllust: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  reqBody: {
    flex: 1,
    minWidth: 0,
  },
  reqTitle: {
    fontFamily: ParentFonts.body,
    fontSize: 15,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.fgPrimary,
  },
  reqMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgSecondary,
    marginTop: 3,
  },
  reqSuggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  reqSuggestText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.gold700,
  },
  reqAi: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 18,
    color: ParentColors.pine400,
    marginTop: 1,
  },
  reqAiWarn: {
    color: ParentColors.amber700,
  },
  reqAiUrgent: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 18,
    color: ParentColors.error,
    marginTop: 3,
  },
  reqPrice: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  reqPriceNum: {
    fontFamily: ParentFonts.display,
    fontSize: 18,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.amber700,
    fontVariant: ['tabular-nums'],
  },
  reqPriceUnit: {
    fontFamily: ParentFonts.body,
    fontSize: 10,
    color: ParentColors.fgMuted,
  },
  proposalCoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
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
  proposalCoinStatic: {
    fontFamily: ParentFonts.mono,
    fontSize: ParentFontSizes.pBody,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  proposalCoinUnit: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },

  // ── Shared action buttons ──
  proposalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  proposalApproveBtn: {
    flex: 7,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 0,
    backgroundColor: ParentColors.pine500,
    borderRadius: ParentRadii.md,
  },
  proposalApproveBtnText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: '#fff',
  },
  proposalRejectBtn: {
    flex: 3,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 0,
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
    borderColor: ParentColors.pine500,
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
    color: ParentColors.pine500,
  },
  newTaskAiHintLoading: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    fontStyle: 'italic',
  },
  newTaskAiWarn: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.clay500,
    marginTop: 4,
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
    backgroundColor: ParentColors.pine500,
    borderColor: ParentColors.pine500,
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
    backgroundColor: ParentColors.pine500,
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
    borderColor: ParentColors.pine500,
    backgroundColor: ParentColors.pine50,
  },
  habitDayCardNum: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgPrimary,
  },
  habitDayCardNumActive: {
    color: ParentColors.pine500,
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
    color: ParentColors.pine500,
  },
});

export const parentHomeTabletStyles = styles;
