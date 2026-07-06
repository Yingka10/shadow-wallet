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
} from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
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
  type RedemptionRequest,
  type ChildWishItem,
  getAiResult,
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
// Left sidebar: child roster (each child shows today's progress + balance)
// ─────────────────────────────────────────────────────────────────────────────

type ChildOption = { id: string; nickname: string };

// 品牌小樹 icon —— 側欄品牌行用，鎖定樣式＝提案 artifact .p-brand svg
function BrandTreeIcon() {
  return (
    <Svg width={13} height={15} viewBox="0 0 16 18">
      <Path d="M7 11.5v5" stroke="#C9A05C" strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={8} cy={6.5} r={4.6} fill="#8FC65C" />
      <Circle cx={4.6} cy={8.6} r={3} fill="#7CB84A" />
      <Circle cx={11.4} cy={8.6} r={3} fill="#6BA63C" />
      <Circle cx={10.6} cy={5} r={1.5} fill="#F2A93B" />
    </Svg>
  );
}

const CHILD_AVATAR_TINTS = [ParentColors.clay500, ParentColors.sage500, ParentColors.plum500];

/**
 * 左側欄 —— 暖松品牌欄（鎖定樣式＝ .p-side）：GrowBook 品牌 + 孩子切換器。
 * 選中孩子＝白色 14% 疊色；徽章＝該孩子待處理事項數（申請審核用，不是分數/餘額)。
 */
function ChildSwitcherSidebar({
  allChildren,
  childId,
  setSelectedChild,
  pendingCounts,
}: {
  allChildren: ChildOption[];
  childId: string;
  setSelectedChild: (c: ChildOption) => void;
  pendingCounts: Record<string, number>;
}) {
  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarBrand}>
        <BrandTreeIcon />
        <Text style={styles.sidebarBrandText}>GrowBook</Text>
      </View>
      <Text style={styles.sidebarBrandSub}>成長帳本</Text>

      <ScrollView showsVerticalScrollIndicator={false}>
        {allChildren.map((c, i) => {
          const active = c.id === childId;
          const count = pendingCounts[c.id] ?? 0;
          return (
            <TouchableOpacity
              key={c.id}
              style={[styles.pick, active && styles.pickActive]}
              onPress={() => setSelectedChild(c)}
              activeOpacity={0.7}
            >
              <View style={[styles.pickAvatar, { backgroundColor: CHILD_AVATAR_TINTS[i % CHILD_AVATAR_TINTS.length] }]}>
                <Text style={styles.pickAvatarText}>{c.nickname.charAt(0)}</Text>
              </View>
              <Text style={[styles.pickName, active && styles.pickNameActive]} numberOfLines={1}>
                {c.nickname}
              </Text>
              {count > 0 && (
                <View style={styles.pickBadge}>
                  <Text style={styles.pickBadgeText}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.sidebarNote}>切換後，右邊只顯示這個孩子的事</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview strip (ChildHeaderStrip equivalent)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 單一孩子概覽 —— 安靜的一行（鎖定樣式＝ .p-oneline），不是卡片。
 * 只顯示真實資料：撲滿餘額+本週增減、今天完成度。不編造「本週狀態：整體穩定」這類假訊號。
 */
function POneline({
  doneToday,
  totalToday,
  spendingBalance,
  weekCoinDelta,
}: {
  doneToday: number;
  totalToday: number;
  spendingBalance: number;
  weekCoinDelta: number;
}) {
  const pct = totalToday > 0 ? Math.round((doneToday / totalToday) * 100) : 0;
  return (
    <View style={styles.oneline}>
      <Text style={styles.onelineItem}>
        <Text style={styles.onelineNum}>{spendingBalance}</Text> 幣
        {weekCoinDelta !== 0 ? `（本週 ${weekCoinDelta > 0 ? '+' : ''}${weekCoinDelta}）` : ''}
      </Text>
      <View style={styles.onelineSep} />
      <View style={styles.onelineMiniRow}>
        <Text style={styles.onelineItem}>今天 <Text style={styles.onelineNum}>{doneToday}/{totalToday}</Text></Text>
        <View style={styles.onelineMini}>
          <View style={[styles.onelineMiniFill, { width: `${pct}%` as `${number}%` }]} />
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Long-term task card
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 長期挑戰 —— 扁平清單（鎖定樣式＝ .t-grp + .p-lt），不是卡片、不用 emoji 分類徽章。
 * 每列：名稱 + 進度說明 + chevron，下面一條進度條。
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
    <View style={styles.ltSection}>
      <View style={styles.tGrp}>
        <Text style={styles.tGrpLabel}>長期挑戰</Text>
        <View style={styles.tGrpLine} />
        {totalActive > 0 && <Text style={styles.tGrpCount}>{totalActive} 項進行中</Text>}
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
              <Text style={styles.pLtName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.pLtMeta}>{item.progressLabel}</Text>
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
 * 今日做完的 —— 扁平清單（鎖定樣式＝ .t-grp + .t-row.done）。
 * 信任制：首頁只顯示「做完的」，還沒做的不上首頁（見「⋯」旁的說明）。
 * 家長介入＝事後 override：每列常駐「⋯」點開 MarkPanel（退回/調整），不用滑動也找得到。
 * 指派/建立任務移到清單尾的安靜連結，不再是主要 CTA（決策主場是申請審核）。
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

  return (
    <View>
      <View style={styles.tGrp}>
        <Text style={styles.tGrpLabel}>今天做完的</Text>
        <View style={styles.tGrpLine} />
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

      <Text style={styles.tMore}>還沒做的和過往紀錄，都在 <Text style={styles.tMoreLink} onPress={onViewRecords}>成長紀錄</Text> 裡</Text>

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

const WISH_REJECT_REASONS = [
  '幣值設定太高',
  '想再和孩子討論',
  '不符合家庭規則',
  '這個時間點不適合',
];

// ── 兌換待審 card ──

function WishApprovalCard({
  wish,
  onApprove,
}: {
  wish: ChildWishItem;
  onApprove: (id: string) => Promise<void>;
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
        .update({ is_active: false, parent_note: reason })
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
        <View style={[styles.reqIc, { backgroundColor: ParentColors.reqIconGold }]}>
          <GiftIcon size={17} color={ParentColors.amber700} />
        </View>
        <View style={styles.reqBody}>
          <Text style={[styles.reqType, { color: ParentColors.amber700 }]}>願望待審 · {waitLabel}前</Text>
          <Text style={styles.reqTitle} numberOfLines={1}>{wish.name}</Text>
          {isLongWait && (
            <Text style={styles.reqAiUrgent}>已等 {waitLabel}，孩子可能還在等回覆</Text>
          )}
        </View>
        <View style={styles.reqPrice}>
          <Text style={styles.reqPriceNum}>{wish.coin_cost}</Text>
          <Text style={styles.reqPriceUnit}>幣</Text>
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
            <Text style={styles.proposalApproveBtnText}>同意上架</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.proposalRejectBtn, submitting && { opacity: 0.5 }]}
            onPress={() => setState('confirming')}
            disabled={submitting}
            activeOpacity={0.8}
          >
            <Text style={styles.proposalRejectBtnText}>拒絕</Text>
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
    <View style={styles.reqCard}>
      <View style={styles.reqTopRow}>
        <View style={[styles.reqIc, { backgroundColor: ParentColors.reqIconGold }]}>
          <CoinSmIcon size={18} color={ParentColors.amber700} />
        </View>
        <View style={styles.reqBody}>
          <Text style={[styles.reqType, { color: ParentColors.amber700 }]}>
            兌換申請 · {dayjs(request.created_at).format('M/D HH:mm')}
          </Text>
          <Text style={styles.reqTitle} numberOfLines={1}>{request.name}</Text>
          <Text style={[styles.reqAi, ai.verdict === 'high' && styles.reqAiWarn]} numberOfLines={1}>
            ✦ AI：{ai.reason}
          </Text>
        </View>
        <View style={styles.reqPrice}>
          <Text style={styles.reqPriceNum}>{coinValue}</Text>
          <Text style={styles.reqPriceUnit}>幣</Text>
        </View>
      </View>

      {request.description ? (
        <View style={styles.proposalKidNote}>
          <Text style={styles.proposalKidNoteText}>「{request.description}」</Text>
        </View>
      ) : null}

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

/**
 * 申請審核 —— 家長的唯一決策主場（鎖定樣式＝提案 artifact「THE parent decision surface」）。
 * 呼叫端已把 pendingRequests/childWishes 過濾到目前選中的孩子；這裡純渲染 req-card 清單，
 * 不再有自己的大標題/子區塊 chrome（標題由呼叫端的「有 N 件申請等你」負責）。
 */
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

  if (pendingWishes.length === 0 && pendingRequests.length === 0) {
    return (
      <View style={styles.reqEmpty}>
        <Text style={styles.reqEmptyText}>目前沒有申請，孩子的兌換/願望申請會出現在這裡</Text>
      </View>
    );
  }

  return (
    <View>
      {pendingWishes.map(w => (
        <WishApprovalCard key={w.id} wish={w} onApprove={approveChildWish} />
      ))}
      {pendingRequests.map(req => (
        <RedemptionProposalCard
          key={req.id}
          request={req}
          onApprove={approveRequest}
          onReject={rejectRequest}
        />
      ))}
    </View>
  );
}

function SendIcon() {
  return (
    <Svg width={11} height={11} viewBox="0 0 12 12" fill="none">
      <Path d="M2 6h8M7 3l3 3-3 3" stroke="#FFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const ADVISOR_PROMPTS = [
  (name: string) => `${name}最近有什麼要注意的嗎？`,
  (name: string) => `${name}的任務量這週要調整嗎？`,
];

/**
 * AI 教養顧問 —— 右欄的主要內容（鎖定樣式＝ .t-ask），取代原本的「本週統計」。
 * 目前沒有開放式問答的後端端點（aiAgent.ts 只有分類/幣值建議等窄用途函式），
 * 所以先做視覺骨架＋誠實的「即將推出」提示，不假裝已經能對話。
 */
function AdvisorPanel({ childName, onOpenWeekly }: { childName: string; onOpenWeekly: () => void }) {
  const notReady = () => Alert.alert('AI 諮詢即將推出', '這裡之後會接上能看到任務與紀錄的教養顧問。');
  return (
    <View>
      <Text style={styles.advisorTitle}>AI 教養顧問</Text>
      <Text style={styles.advisorSub}>正看著{childName}的紀錄，問題會帶著脈絡回答</Text>

      <View style={styles.advisorPrompts}>
        {ADVISOR_PROMPTS.map((p, i) => (
          <TouchableOpacity key={i} style={styles.advisorPrompt} onPress={notReady} activeOpacity={0.7}>
            <Text style={styles.advisorPromptMark}>✦</Text>
            <Text style={styles.advisorPromptText}>{p(childName)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.advisorBox} onPress={notReady} activeOpacity={0.7}>
        <Text style={styles.advisorBoxText}>想問{childName}的什麼…</Text>
        <View style={styles.advisorSend}>
          <SendIcon />
        </View>
      </TouchableOpacity>

      <Text style={styles.railLink}>
        本週的數字，週日的 <Text style={styles.railLinkAction} onPress={onOpenWeekly}>週報</Text> 會整理好
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

export default function ParentHomeTablet() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { childId, childName, allChildren, setSelectedChild } = useSelectedChild();

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [rightMode, setRightMode] = useState<'pending' | 'assign' | 'newTask'>('pending');

  // Reset right panel when selected child changes to prevent cross-child confusion
  useEffect(() => {
    setRightMode('pending');
  }, [childId]);

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

  const handleViewRecords = useCallback(() => {
    navigation.navigate('Weekly' as never);
  }, [navigation]);

  const doneToday = todayTasks.filter(t => t.status === 'done').length;
  const totalToday = todayTasks.length;

  // 申請審核：過濾到目前選中的孩子（單一孩子視圖 — 全家彙總是之後的功能）
  const unapprovedWishes = childWishes.filter(w => !w.parent_approved);
  const childPendingWishes = unapprovedWishes.filter(w => w.child_id === childId);
  const childPendingRequests = pendingRequests.filter(r => r.child_id === childId);
  const childPendingCount = childPendingWishes.length + childPendingRequests.length;

  // 側欄徽章：每個孩子各自的待處理數量
  const pendingCounts: Record<string, number> = {};
  for (const c of allChildren) {
    pendingCounts[c.id] =
      unapprovedWishes.filter(w => w.child_id === c.id).length +
      pendingRequests.filter(r => r.child_id === c.id).length;
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
        <ChildSwitcherSidebar
          allChildren={allChildren}
          childId={childId}
          setSelectedChild={setSelectedChild}
          pendingCounts={pendingCounts}
        />

        {/* ── Main area —— 申請審核＝決策主場 ──
             外層固定 flex:1 的純 View 決定寬度，內層 ScrollView 只管捲動，
             不讓 ScrollView 自己參與 row 的寬度分配（react-native-web 不可靠）。 */}
        <View style={styles.mainAreaWrap}>
        <ScrollView
          style={[styles.mainArea, webMouseDraggableScroll]}
          contentContainerStyle={[styles.mainContent, { paddingTop: insets.top + 16 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.mainHeader}>
            <Text style={styles.mainHeaderDate}>
              {dayjs().format('M 月 D 日 dddd')} · {nickname}
            </Text>
            <Text style={styles.mainHeaderTitle}>
              {childPendingCount > 0 ? (
                <>有 <Text style={styles.mainHeaderTitleNum}>{childPendingCount}</Text> 件申請等你</>
              ) : (
                '目前沒有待審申請'
              )}
            </Text>
          </View>

          <PendingItemsPanel
            pendingRequests={childPendingRequests}
            childWishes={childPendingWishes}
            approveRequest={approveRequest}
            rejectRequest={rejectRequest}
            approveChildWish={approveChildWish}
          />

          <POneline
            doneToday={doneToday}
            totalToday={totalToday}
            spendingBalance={spendingBalance}
            weekCoinDelta={weekCoinDelta}
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
            <AdvisorPanel childName={nickname} onOpenWeekly={handleViewRecords} />
          )}
        </ScrollView>
        </View>

      </View>
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

  // ── Left sidebar ──
  sidebar: {
    flexBasis: '18%',
    minWidth: 156,
    maxWidth: 220,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: ParentColors.bgSidebar,
    paddingHorizontal: ParentSpacing[3],
    paddingTop: ParentSpacing[5],
    paddingBottom: ParentSpacing[4],
  },
  sidebarBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sidebarBrandText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.onSidebarMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sidebarBrandSub: {
    fontFamily: ParentFonts.display,
    fontSize: 16,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.onSidebar,
    marginTop: 5,
    marginBottom: 18,
  },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    marginBottom: 2,
  },
  pickActive: {
    backgroundColor: ParentColors.pickActiveBg,
  },
  pickAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pickAvatarText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.bold,
    color: '#fff',
  },
  pickName: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: 13.5,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.onSidebarMuted,
  },
  pickNameActive: {
    color: ParentColors.onSidebar,
  },
  pickBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: ParentColors.amber300,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pickBadgeText: {
    fontFamily: ParentFonts.body,
    fontSize: 10.5,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.bgSidebar,
  },
  sidebarNote: {
    marginTop: 'auto',
    fontFamily: ParentFonts.body,
    fontSize: 10,
    lineHeight: 15,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  // ── Main area ──
  // 外層純 View 決定寬度（flex:1, flexShrink:1）；ScrollView 只 flex:1 填滿，不參與寬度分配。
  mainAreaWrap: {
    flex: 1,
    flexBasis: '58%',
    flexShrink: 1,
    minWidth: 0,
    backgroundColor: ParentColors.bgCanvas,
  },
  mainArea: {
    flex: 1,
  },
  mainContent: {
    paddingHorizontal: ParentSpacing.cardPadLg,
    paddingBottom: ParentSpacing[8],
    gap: 16,
  },

  // ── Overview strip ──
  // ── 單一孩子概覽（p-oneline）：安靜的一行，不是卡片 ──
  oneline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: ParentColors.bgRail,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginVertical: 10,
  },
  onelineItem: {
    fontFamily: ParentFonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: ParentColors.fgSecondary,
    fontVariant: ['tabular-nums'],
  },
  onelineNum: {
    fontSize: 18,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.fgPrimary,
  },
  onelineSep: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: ParentColors.borderMedium,
  },
  onelineMiniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  onelineMini: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: ParentColors.borderMedium,
    overflow: 'hidden',
  },
  onelineMiniFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: ParentColors.done,
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

  // ── 扁平區塊標頭（t-grp）：長期挑戰／今天做完的 共用 ──
  tGrp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 2,
  },
  tGrpLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    fontWeight: ParentFontWeights.black,
    letterSpacing: 0.4,
    color: ParentColors.fgSecondary,
  },
  tGrpLine: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderMedium,
  },
  tGrpCount: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },

  // ── 長期挑戰列（p-lt）──
  pLt: {
    paddingVertical: 9,
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
    gap: 10,
    paddingVertical: 9,
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
  // 外層純 View 決定寬度（固定 208, flexGrow/Shrink:0）；ScrollView 只 flex:1 填滿。
  rightColWrap: {
    flexBasis: '24%',
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
  advisorTitle: {
    fontFamily: ParentFonts.body,
    fontSize: 16,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.fgPrimary,
    marginBottom: 6,
  },
  advisorSub: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 20,
    color: ParentColors.fgSecondary,
    marginBottom: 12,
  },
  advisorPrompts: {
    gap: 8,
    marginBottom: 12,
  },
  advisorPrompt: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#EFF3EE',
    borderWidth: 1,
    borderColor: 'rgba(44,74,61,0.16)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  advisorPromptMark: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    color: ParentColors.accent,
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
    backgroundColor: ParentColors.bgSurface,
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
  // ── 主欄標頭：日期 + 「有 N 件申請等你」 ──
  mainHeader: {
    marginBottom: 4,
  },
  mainHeaderDate: {
    fontFamily: ParentFonts.body,
    fontSize: 11,
    fontWeight: ParentFontWeights.bold,
    letterSpacing: 0.3,
    color: ParentColors.fgMuted,
    marginBottom: 2,
  },
  mainHeaderTitle: {
    fontFamily: ParentFonts.display,
    fontSize: 23,
    fontWeight: ParentFontWeights.black,
    letterSpacing: 0,
    color: ParentColors.fgPrimary,
  },
  mainHeaderTitleNum: {
    color: ParentColors.amber700,
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
  // ── req-card —— 申請審核卡（THE 家長決策主場，鎖定樣式＝提案 artifact .req-card）──
  reqCard: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    ...ParentShadows.card,
  },
  reqTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  reqIc: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  reqBody: {
    flex: 1,
    minWidth: 0,
  },
  reqType: {
    fontFamily: ParentFonts.body,
    fontSize: 9.5,
    fontWeight: ParentFontWeights.black,
    letterSpacing: 1,
  },
  reqTitle: {
    fontFamily: ParentFonts.body,
    fontSize: 15,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.fgPrimary,
    marginTop: 1,
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
    fontSize: ParentFontSizes.xs,
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
    flex: 7,
    minHeight: 44,
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
    minHeight: 44,
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
