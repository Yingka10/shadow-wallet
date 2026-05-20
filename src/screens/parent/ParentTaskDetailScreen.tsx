// NOTE: This screen writes observations to a `parent_observations` table.
// Create it in Supabase before using that feature:
//
//   create table parent_observations (
//     id         uuid primary key default gen_random_uuid(),
//     task_id    uuid not null references tasks(id),
//     child_id   uuid not null references children(id),
//     obs_type   text not null,
//     note       text,
//     reward_adj text,
//     created_at timestamptz not null default now()
//   );

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
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
import type { RootStackParamList } from '../../../App';
import type { Task, TaskCompletion, TaskCategory, DayType } from '../../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------

function ChevLeftIcon({ size = 20, color = ParentColors.ink700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

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

function CheckIcon({ size = 16, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12l5 5L20 7" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function TrashIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M10 11v6M14 11v6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function PencilIcon({ size = 16, color = ParentColors.ink700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
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
// AdjustChip + RewardAdjust (used in ObserveModal)
// ---------------------------------------------------------------------------

function AdjustChip({
  active,
  label,
  amount,
  unit,
  tone,
  onPress,
}: {
  active: boolean;
  label: string;
  amount: number;
  unit: 'coin' | 'min';
  tone: 'neutral' | 'positive';
  onPress: () => void;
}) {
  const activeBg = tone === 'positive' ? '#A87800' : ParentColors.fgPrimary;
  return (
    <TouchableOpacity
      style={[
        styles.adjustChip,
        active && { backgroundColor: activeBg, borderColor: activeBg },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.adjustChipLabel, active && styles.adjustChipActive]}>{label}</Text>
      <View style={styles.adjustChipAmountRow}>
        <Text style={[
          styles.adjustChipNum,
          active && styles.adjustChipActive,
          !active && tone === 'positive' && { color: '#A87800' },
        ]}>
          {amount === 0 ? '0' : `+${amount}`}
        </Text>
        {amount > 0 && unit === 'coin' && <CoinGlyph size={10} />}
        {amount > 0 && unit === 'min' && (
          <Text style={[styles.adjustChipUnit, active && styles.adjustChipActive]}>分</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function RewardAdjust({
  type,
  task,
  value,
  onChange,
}: {
  type: ObsTypeId;
  task: Task;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const hasReward = task.category !== 'A' && !task.is_long_term;
  const isCoins = task.category !== 'B';
  const base = hasReward
    ? (isCoins
      ? (task.coin_override ?? Math.round(task.base_time_min * task.difficulty))
      : task.time_saving_min)
    : 5;
  const unit: 'coin' | 'min' = isCoins ? 'coin' : 'min';

  const isNegative = type === 'noaction' || type === 'quality';
  const isPositive = type === 'bonus';
  const isBoth = type === 'other';

  const showReduce = (isNegative || isBoth) && hasReward;
  const showPlus = isPositive || isBoth || !hasReward;

  if (!showReduce && !showPlus) return null;

  const reduceOpts = [
    { id: 'full', label: '全額', amount: base },
    { id: 'half', label: '一半', amount: Math.round(base / 2) },
    { id: 'none', label: '不給', amount: 0 },
  ];
  const plusOpts = [
    { id: 'full', label: '標準', amount: base },
    { id: 'plus50', label: '加碼 1.5×', amount: Math.round(base * 1.5) },
    { id: 'plus100', label: '加碼 2×', amount: base * 2 },
  ];

  const hintText =
    value === 'none' ? '今天這項任務不給獎勵，但不影響整體紀錄。' :
      value === 'half' ? '會以一半的數量入帳。' :
        value === 'plus50' ? '會以 1.5 倍入帳。' :
          value === 'plus100' ? '會以雙倍入帳，做為特別肯定。' : '';

  return (
    <View style={styles.rewardAdjustBox}>
      <View style={styles.rewardAdjustHeader}>
        <Text style={styles.rewardAdjustTitle}>這次給多少獎勵？</Text>
        <Text style={styles.rewardAdjustOpt}>選填</Text>
      </View>

      {!hasReward && (
        <Text style={styles.rewardAdjustNoRewardNote}>
          這項任務原本沒有獎勵。如果想手動加碼一次作為肯定，可以選一個選項。
        </Text>
      )}

      {showReduce && (
        <>
          {isBoth && <Text style={styles.rewardAdjustGroup}>調整</Text>}
          <View style={styles.adjustChipRow}>
            {reduceOpts.map(o => (
              <AdjustChip
                key={o.id}
                active={value === o.id}
                label={o.label}
                amount={o.amount}
                unit={unit}
                tone="neutral"
                onPress={() => onChange(value === o.id ? null : o.id)}
              />
            ))}
          </View>
        </>
      )}

      {showPlus && (
        <>
          {isBoth && (
            <Text style={[styles.rewardAdjustGroup, { marginTop: 10 }]}>加碼</Text>
          )}
          <View style={[styles.adjustChipRow, showReduce && { marginTop: 10 }]}>
            {plusOpts.map(o => (
              <AdjustChip
                key={o.id}
                active={value === o.id}
                label={o.label}
                amount={o.amount}
                unit={unit}
                tone="positive"
                onPress={() => onChange(value === o.id ? null : o.id)}
              />
            ))}
          </View>
        </>
      )}

      {value && value !== 'full' && hintText.length > 0 && (
        <View style={styles.rewardAdjustHint}>
          <SparkleIcon size={10} color={ParentColors.fgMuted} />
          <Text style={styles.rewardAdjustHintText}>{hintText}</Text>
        </View>
      )}
    </View>
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
  A: { label: '生活自理', tint: '#EAE4D7', fg: ParentColors.ink700, icon: (p) => <SunIcon {...p} /> },
  B: { label: '家庭本分', tint: '#EAF0EE', fg: ParentColors.teal500, icon: (p) => <HourglassSmIcon {...p} /> },
  C: { label: '超出本分', tint: '#FAF1E7', fg: ParentColors.clay500, icon: (p) => <SparkleIcon {...p} /> },
  D: { label: '成長里程碑', tint: '#F4EBF0', fg: ParentColors.plum500, icon: (p) => <FlagIcon {...p} /> },
};

const DAY_TYPE_LABEL: Record<string, string> = {
  weekday: '平日',
  weekend: '假日',
  both: '每日',
};

const OBSERVE_TYPES = [
  { id: 'noaction', label: '今天情緒不好，沒有完成', desc: '' },
  { id: 'quality', label: '完成了但品質不佳', desc: '已完成，但希望下次更專心' },
  { id: 'bonus', label: '主動多做了額外的事', desc: '會在週報中看到「值得肯定」' },
  { id: 'other', label: '其他狀況', desc: '自由描述' },
] as const;

type ObsTypeId = typeof OBSERVE_TYPES[number]['id'];

// ---------------------------------------------------------------------------
// Derived types
// ---------------------------------------------------------------------------

type DayRecord = {
  dateStr: string;
  dayLabel: string;
  completion: TaskCompletion | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDayRecords(completions: TaskCompletion[]): DayRecord[] {
  const today = dayjs().tz(TZ);
  const completionsByDate = new Map<string, TaskCompletion>();
  for (const c of completions) {
    const d = dayjs(c.completed_at).tz(TZ).format('YYYY-MM-DD');
    completionsByDate.set(d, c);
  }

  return Array.from({ length: 7 }, (_, i) => {
    const day = today.subtract(i, 'day');
    const dateStr = day.format('YYYY-MM-DD');
    let dayLabel: string;
    if (i === 0) dayLabel = '今天';
    else if (i === 1) dayLabel = '昨天';
    else dayLabel = day.format('M/D');
    return { dateStr, dayLabel, completion: completionsByDate.get(dateStr) ?? null };
  });
}

function rewardLabel(task: Task): string {
  if (task.category === 'A') return '無';
  if (task.category === 'B') return `${task.time_saving_min} 分鐘`;
  if (task.is_long_term) return '進度任務';
  const coins = task.coin_override ?? Math.round(task.base_time_min * task.difficulty);
  return `${coins} 金幣`;
}

// ---------------------------------------------------------------------------
// InfoCell
// ---------------------------------------------------------------------------

function InfoCell({
  label,
  value,
  borderL,
  borderT,
}: {
  label: string;
  value: React.ReactNode;
  borderL?: boolean;
  borderT?: boolean;
}) {
  return (
    <View style={[
      styles.infoCell,
      borderL && styles.infoCellBorderL,
      borderT && styles.infoCellBorderT,
    ]}>
      <Text style={styles.infoCellLabel}>{label}</Text>
      {typeof value === 'string' ? (
        <Text style={styles.infoCellValue}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// RecordRow
// ---------------------------------------------------------------------------

type DayStatus = 'done' | 'review' | 'pending' | 'missed';

function dayStatus(record: DayRecord, isToday: boolean): DayStatus {
  if (!record.completion) return isToday ? 'pending' : 'missed';
  if (record.completion.status === 'flagged') return 'review';
  return 'done';
}

const STATUS_META: Record<DayStatus, { label: string; bg: string; fg: string }> = {
  done: { label: '已完成', bg: '#E8F2E6', fg: ParentColors.success },
  review: { label: '待確認', bg: '#EAF0EE', fg: ParentColors.teal500 },
  pending: { label: '今日進行中', bg: ParentColors.bgSurfaceWarm, fg: ParentColors.fgMuted },
  missed: { label: '未完成', bg: '#FDF2E7', fg: ParentColors.warn },
};

function RecordRow({ record, isToday, divider }: { record: DayRecord; isToday: boolean; divider: boolean }) {
  const status = dayStatus(record, isToday);
  const meta = STATUS_META[status];
  const time = record.completion
    ? dayjs(record.completion.completed_at).tz(TZ).format('HH:mm')
    : null;

  return (
    <View style={[styles.recordRow, divider && styles.recordRowDivider]}>
      <Text style={styles.recordDate}>{record.dayLabel}</Text>
      <View style={styles.recordMain}>
        <View style={styles.recordPillRow}>
          <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
            <Text style={[styles.statusPillText, { color: meta.fg }]}>{meta.label}</Text>
          </View>
          {time && <Text style={styles.recordTime}>{time}</Text>}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ObservePanel — inline (no Modal)
// ---------------------------------------------------------------------------

function ObservePanel({
  onClose,
  onSave,
  task,
}: {
  onClose: () => void;
  onSave: (obsType: ObsTypeId, note: string, rewardAdj: string | null) => Promise<void>;
  task: Task;
}) {
  const [obsType, setObsType] = useState<ObsTypeId | null>(null);
  const [obsNote, setObsNote] = useState('');
  const [obsReward, setObsReward] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleObsTypeChange = (id: ObsTypeId) => {
    setObsType(id);
    setObsReward(null);
  };

  const handleSave = async () => {
    if (!obsType) return;
    setSaving(true);
    try {
      await onSave(obsType, obsNote.trim(), obsReward);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.inlinePanel}>
      {/* Header */}
      <View style={styles.observeHeader}>
        <View style={styles.observeIconBox}>
          <FlagIcon size={16} color={ParentColors.clay500} />
        </View>
        <View style={styles.observeHeaderText}>
          <Text style={styles.observeTitle}>記錄觀察</Text>
          <Text style={styles.observeSubtitle}>
            只記錄今天的小狀況，不會影響獎勵或扣分。
          </Text>
        </View>
      </View>

      <Text style={styles.observeSectionLabel}>選擇狀況類型</Text>

      {OBSERVE_TYPES.map(o => {
        const active = obsType === o.id;
        return (
          <TouchableOpacity
            key={o.id}
            style={[styles.obsOption, active && styles.obsOptionActive]}
            onPress={() => handleObsTypeChange(o.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.obsRadio, active && styles.obsRadioActive]}>
              {active && <View style={styles.obsRadioDot} />}
            </View>
            <View style={styles.obsOptionText}>
              <Text style={styles.obsOptionLabel}>{o.label}</Text>
              <Text style={styles.obsOptionDesc}>{o.desc}</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {obsType && (
        <RewardAdjust
          type={obsType}
          task={task}
          value={obsReward}
          onChange={setObsReward}
        />
      )}

      <View style={styles.noteHeader}>
        <Text style={styles.observeSectionLabel}>備註</Text>
        <Text style={styles.noteOptional}>選填</Text>
      </View>
      <TextInput
        style={styles.noteInput}
        value={obsNote}
        onChangeText={setObsNote}
        placeholder="可以多寫一兩句，幫助你日後回顧。"
        placeholderTextColor={ParentColors.ink300}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />

      <View style={styles.modalActions}>
        <TouchableOpacity style={styles.btnSecondary} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.btnSecondaryText}>取消</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnPrimary, (!obsType || saving) && styles.btnDisabled]}
          onPress={handleSave}
          activeOpacity={0.7}
          disabled={!obsType || saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <Text style={styles.btnPrimaryText}>儲存觀察</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// EditPanel — inline (no Modal)
// ---------------------------------------------------------------------------

function EditPanel({
  task,
  onClose,
  onSave,
}: {
  task: Task;
  onClose: () => void;
  onSave: (name: string, dayType: DayType, difficulty: number) => Promise<void>;
}) {
  const [name, setName] = useState(task.name);
  const [dayType, setDayType] = useState<DayType>(task.day_type);
  const [difficulty, setDifficulty] = useState(task.difficulty);
  const [saving, setSaving] = useState(false);

  const DAY_OPTIONS: { value: DayType; label: string }[] = [
    { value: 'both', label: '每日' },
    { value: 'weekday', label: '平日' },
    { value: 'weekend', label: '假日' },
  ];

  const DIFF_OPTIONS = [
    { value: 1, label: '簡單' },
    { value: 2, label: '中等' },
    { value: 3, label: '困難' },
  ];

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave(name.trim(), dayType, difficulty);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.inlinePanel, styles.inlinePanelEdit]}>
      {/* Header */}
      <View style={styles.observeHeader}>
        <View style={styles.editIconBox}>
          <PencilIcon size={15} color={ParentColors.ink700} />
        </View>
        <View style={styles.observeHeaderText}>
          <Text style={styles.observeTitle}>編輯任務</Text>
          <Text style={styles.observeSubtitle}>修改這項任務的設定</Text>
        </View>
      </View>

      {/* Name */}
      <Text style={styles.editFormLabel}>任務名稱</Text>
      <TextInput
        style={styles.editInput}
        value={name}
        onChangeText={setName}
        placeholderTextColor={ParentColors.ink300}
      />

      {/* Frequency */}
      <Text style={styles.editFormLabel}>執行頻率</Text>
      <View style={styles.editToggleRow}>
        {DAY_OPTIONS.map(opt => {
          const on = dayType === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.editToggleBtn, on && styles.editToggleBtnActive]}
              onPress={() => setDayType(opt.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.editToggleText, on && styles.editToggleTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Difficulty */}
      <Text style={styles.editFormLabel}>難度</Text>
      <View style={styles.editToggleRow}>
        {DIFF_OPTIONS.map(opt => {
          const on = difficulty === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.editToggleBtn, on && styles.editToggleBtnActive]}
              onPress={() => setDifficulty(opt.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.editToggleText, on && styles.editToggleTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.modalActions}>
        <TouchableOpacity style={styles.btnSecondary} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.btnSecondaryText}>取消</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnPrimary, (!name.trim() || saving) && styles.btnDisabled]}
          onPress={handleSave}
          activeOpacity={0.7}
          disabled={!name.trim() || saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <><CheckIcon size={14} color="#FFFFFF" /><Text style={styles.btnPrimaryText}>儲存變更</Text></>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// DeleteModal
// ---------------------------------------------------------------------------

function DeleteModal({
  visible,
  taskName,
  deleting,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  taskName: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.deleteOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onCancel} />
        <View style={styles.deleteCard}>
          <View style={styles.deleteIconBox}>
            <TrashIcon size={20} color="#B5483A" />
          </View>
          <Text style={styles.deleteTitle}>刪除這項任務？</Text>
          <Text style={styles.deleteBody}>
            「{taskName}」會從清單中移除，過去的紀錄保留在週報中以便回顧。
          </Text>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.btnSecondary} onPress={onCancel} activeOpacity={0.7}>
              <Text style={styles.btnSecondaryText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnDanger, deleting && styles.btnDisabled]}
              onPress={onConfirm}
              activeOpacity={0.7}
              disabled={deleting}
            >
              {deleting
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={styles.btnPrimaryText}>確認刪除</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

type Nav = StackNavigationProp<RootStackParamList, 'ParentTaskDetail'>;

export default function ParentTaskDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ParentTaskDetail'>>();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { taskId, childId } = route.params;

  const [task, setTask] = useState<Task | null>(null);
  const [childName, setChildName] = useState<string>('');
  const [dayRecords, setDayRecords] = useState<DayRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [observeVisible, setObserveVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = dayjs().tz(TZ).format('YYYY-MM-DD');
      const weekAgo = dayjs().tz(TZ).subtract(6, 'day').format('YYYY-MM-DD');

      const [taskRes, completionsRes, childRes] = await Promise.all([
        supabase.from('tasks').select('*').eq('id', taskId).single(),
        supabase.from('task_completions')
          .select('*')
          .eq('task_id', taskId)
          .eq('child_id', childId)
          .gte('completed_at', weekAgo)
          .lte('completed_at', today + 'T23:59:59'),
        supabase.from('children').select('nickname').eq('id', childId).single(),
      ]);

      if (taskRes.error) throw taskRes.error;
      setTask(taskRes.data);
      if (childRes.data) setChildName(childRes.data.nickname);
      setDayRecords(buildDayRecords(completionsRes.data ?? []));
    } catch (err) {
      console.error('[ParentTaskDetailScreen] fetch error:', err);
      setError('資料載入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, [taskId, childId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMarkDone = async () => {
    if (!task) return;
    try {
      setLoading(true);
      const hasReward = task.category !== 'A' && !task.is_long_term;
      const isCoins = task.category !== 'B';
      const coin_earned = hasReward ? (isCoins ? (task.coin_override ?? Math.round(task.base_time_min * task.difficulty)) : 0) : 0;
      const time_saved_min = hasReward && !isCoins ? task.time_saving_min : 0;

      const { error: err } = await supabase.from('task_completions').insert({
        task_id: taskId,
        child_id: childId,
        reported_by: 'parent',
        status: 'completed',
        coin_earned,
        time_saved_min,
      });

      if (err) throw err;
      await fetchData();
    } catch (err) {
      console.error('[ParentTaskDetailScreen] mark done error:', err);
      Alert.alert('錯誤', '標記失敗，請稍後再試');
      setLoading(false);
    }
  };

  const handleCancelDone = async () => {
    if (!task) return;
    const todayRecord = dayRecords[0];
    if (!todayRecord?.completion) return;
    
    try {
      setLoading(true);
      const { error: err } = await supabase
        .from('task_completions')
        .delete()
        .eq('id', todayRecord.completion.id);

      if (err) throw err;
      await fetchData();
    } catch (err) {
      console.error('[ParentTaskDetailScreen] cancel done error:', err);
      Alert.alert('錯誤', '取消失敗，請稍後再試');
      setLoading(false);
    }
  };

  const saveObservation = async (obsType: ObsTypeId, note: string, rewardAdj: string | null) => {
    const { error: err } = await supabase
      .from('parent_observations' as any)
      .insert({
        task_id: taskId,
        child_id: childId,
        obs_type: obsType,
        note: note || null,
        reward_adj: rewardAdj || null,
      });
    if (err) {
      console.error('[ParentTaskDetailScreen] observation save error:', err);
      throw err;
    }
  };

  const handleEditSave = async (name: string, dayType: DayType, difficulty: number) => {
    const { error: err } = await supabase
      .from('tasks')
      .update({ name, day_type: dayType, difficulty })
      .eq('id', taskId);
    if (err) {
      console.error('[ParentTaskDetailScreen] edit save error:', err);
      throw err;
    }
    await fetchData();
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error: err } = await supabase
        .from('child_tasks')
        .update({ is_active: false })
        .eq('task_id', taskId)
        .eq('child_id', childId);
      if (err) throw err;
      navigation.goBack();
    } catch (err) {
      console.error('[ParentTaskDetailScreen] delete error:', err);
      setDeleting(false);
      setDeleteVisible(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ParentColors.teal500} />
      </View>
    );
  }

  if (error || !task) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? '找不到這項任務'}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const meta = TASK_CAT_META[task.category];
  const doneCount = dayRecords.filter(r => r.completion?.status === 'completed').length;
  const ratePct = Math.round((doneCount / 7) * 100);

  const todayRecord = dayRecords[0];
  const isTodayDone = todayRecord?.completion?.status === 'completed';
  const todayDoneTime = isTodayDone ? dayjs(todayRecord.completion!.completed_at).tz(TZ).format('HH:mm') : null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* ── Back nav bar ─────────────────────────────────────── */}
      <View style={[styles.navBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          style={styles.backNavBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevLeftIcon size={22} color={ParentColors.ink700} />
          <Text style={styles.backNavLabel}>返回</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{task.name}</Text>
        <View style={styles.navSpacer} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
        {/* ── Hero ─────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={[styles.catBadge, { backgroundColor: meta.tint }]}>
            {meta.icon({ size: 11, color: meta.fg })}
            <Text style={[styles.catBadgeText, { color: meta.fg }]}>{meta.label}</Text>
          </View>
          <Text style={styles.heroTitle}>{task.name}</Text>
        </View>

        {/* ── Info grid ────────────────────────────────────────── */}
        <View style={styles.infoCard}>
          <View style={styles.infoGrid}>
            <InfoCell label="類別" value={meta.label} />
            <InfoCell
              label="難度"
              borderL
              value={task.difficulty === 1 ? '簡單' : task.difficulty === 2 ? '中等' : '困難'}
            />
            <InfoCell
              label="獎勵"
              borderT
              value={
                task.category === 'B' ? (
                  <Text style={[styles.infoCellValue, { color: ParentColors.teal500 }]}>
                    {task.time_saving_min} 分鐘
                  </Text>
                ) : task.category !== 'A' && !task.is_long_term ? (
                  <View style={styles.infoCellRewardRow}>
                    <Text style={[styles.infoCellValue, { color: '#A87800' }]}>
                      {task.coin_override ?? Math.round(task.base_time_min * task.difficulty)}
                    </Text>
                    <CoinGlyph size={12} />
                  </View>
                ) : (
                  rewardLabel(task)
                )
              }
            />
            <InfoCell
              label="頻率"
              borderL
              borderT
              value={DAY_TYPE_LABEL[task.day_type] ?? task.day_type}
            />
          </View>
        </View>

        {/* ── Today Status Bar ─────────────────────────────────────────────── */}
        <View style={styles.todayStatusBar}>
          <Text style={styles.todayStatusTitle}>今日狀態 · {childName}</Text>
          <View style={styles.todayStatusBodyRow}>
            {isTodayDone ? (
              <View style={styles.doneRow}>
                <Text style={[styles.todayStatusText, styles.todayStatusTextDone]}>
                  已完成 · {todayDoneTime}
                </Text>
                <TouchableOpacity onPress={handleCancelDone} activeOpacity={0.6}>
                  <Text style={styles.cancelText}>取消</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.todayStatusText}>今日尚未開始</Text>
                <TouchableOpacity style={styles.markDoneBtn} onPress={handleMarkDone}>
                  <Text style={styles.markDoneBtnText}>幫孩子標記完成</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* ── 7-day stats ───────────────────────────────────────── */}
        <View style={styles.statsCard}>
          <View style={styles.statsLeft}>
            <Text style={styles.statsEyebrow}>過去 7 天完成率</Text>
            <View style={styles.statsCount}>
              <Text style={styles.statsNum}>{doneCount}</Text>
              <Text style={styles.statsDenom}>/ 7 天</Text>
              <Text style={[styles.statsRate, { color: ratePct >= 70 ? ParentColors.success : ParentColors.fgMuted }]}>
                {ratePct}%
              </Text>
            </View>
          </View>
          <View style={styles.dotStrip}>
            {[...dayRecords].reverse().map((r, i) => {
              const isToday = i === 6;
              const status = dayStatus(r, isToday);
              const dotColor =
                status === 'done' ? ParentColors.success :
                  status === 'review' ? ParentColors.teal500 :
                    status === 'missed' ? ParentColors.warn :
                      ParentColors.ivory300;
              return (
                <View
                  key={r.dateStr}
                  style={[styles.dot, { backgroundColor: dotColor, opacity: status === 'pending' ? 0.45 : 1 }]}
                />
              );
            })}
          </View>
        </View>

        {/* ── Inline panels ─────────────────────────────────────── */}
        {observeVisible && (
          <ObservePanel
            onClose={() => setObserveVisible(false)}
            onSave={saveObservation}
            task={task}
          />
        )}
        {editVisible && (
          <EditPanel
            task={task}
            onClose={() => setEditVisible(false)}
            onSave={handleEditSave}
          />
        )}

        {/* ── Recent records ────────────────────────────────────── */}
        <Text style={styles.sectionEyebrow}>近期紀錄</Text>
        <Text style={styles.sectionTitle}>這項任務的歷史</Text>
        <View style={styles.recordsCard}>
          {dayRecords.map((r, i) => (
            <RecordRow
              key={r.dateStr}
              record={r}
              isToday={i === 0}
              divider={i < dayRecords.length - 1}
            />
          ))}
        </View>
      </ScrollView>

        {/* ── Bottom action bar — flex row, always visible ──────── */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              observeVisible
                ? { backgroundColor: ParentColors.clay500, borderColor: ParentColors.clay500 }
                : styles.actionBtnClay,
            ]}
            onPress={() => { setEditVisible(false); setObserveVisible(v => !v); }}
            activeOpacity={0.7}
          >
            <FlagIcon size={15} color={observeVisible ? '#FFFFFF' : ParentColors.clay500} />
            <Text style={[styles.actionBtnText, { color: observeVisible ? '#FFFFFF' : ParentColors.clay500 }]}>
              記錄觀察
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionBtn,
              editVisible
                ? { backgroundColor: ParentColors.ink700, borderColor: ParentColors.ink700 }
                : styles.actionBtnInk,
            ]}
            onPress={() => { setObserveVisible(false); setEditVisible(v => !v); }}
            activeOpacity={0.7}
          >
            <PencilIcon size={15} color={editVisible ? '#FFFFFF' : ParentColors.ink700} />
            <Text style={[styles.actionBtnText, { color: editVisible ? '#FFFFFF' : ParentColors.ink700 }]}>
              修改任務
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger]}
            onPress={() => setDeleteVisible(true)}
            activeOpacity={0.7}
          >
            <TrashIcon size={15} color="#B5483A" />
            <Text style={[styles.actionBtnText, { color: '#B5483A' }]}>刪除</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <DeleteModal
        visible={deleteVisible}
        taskName={task.name}
        deleting={deleting}
        onCancel={() => setDeleteVisible(false)}
        onConfirm={handleDelete}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: ParentColors.bgCanvas,
  },
  root: {
    flex: 1,
    backgroundColor: ParentColors.bgCanvas,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ParentSpacing.gutter,
    paddingBottom: 10,
    backgroundColor: ParentColors.bgCanvas,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  backNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    minWidth: 64,
  },
  backNavLabel: {
    fontSize: 15,
    color: ParentColors.ink700,
    fontFamily: ParentFonts.body,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },
  navSpacer: {
    minWidth: 64,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: ParentSpacing.gutter,
    paddingTop: 6,
    paddingBottom: 24,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.bgCanvas,
    padding: 24,
  },
  errorText: {
    fontSize: ParentFontSizes.pBody,
    color: ParentColors.error,
    textAlign: 'center',
    marginBottom: 16,
  },
  backBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  backBtnText: {
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgPrimary,
    fontWeight: ParentFontWeights.semi,
  },

  // ── Today Status Bar ──────────────────────────────────────────────────────
  todayStatusBar: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    padding: 16,
    marginBottom: 12,
  },
  todayStatusTitle: {
    fontSize: 12,
    color: ParentColors.fgMuted,
    fontWeight: ParentFontWeights.medium,
    marginBottom: 6,
  },
  todayStatusBodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  todayStatusText: {
    fontSize: 16,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  todayStatusTextDone: {
    color: ParentColors.success,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
    textDecorationLine: 'underline',
  },
  markDoneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.teal50,
  },
  markDoneBtnText: {
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.teal500,
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 4,
  },
  catBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: ParentRadii.pill,
    marginBottom: 10,
  },
  catBadgeText: {
    fontSize: 10.5,
    fontWeight: ParentFontWeights.semi,
    letterSpacing: 0.6,
  },
  heroTitle: {
    fontSize: ParentFontSizes.display,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
    lineHeight: ParentFontSizes.display * 1.22,
  },

  // ── Info card ─────────────────────────────────────────────────────────────
  infoCard: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    marginBottom: 12,
    overflow: 'hidden',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  infoCell: {
    width: '50%',
    padding: 12,
  },
  infoCellBorderL: {
    borderLeftWidth: 1,
    borderLeftColor: ParentColors.borderSoft,
  },
  infoCellBorderT: {
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
  },
  infoCellLabel: {
    fontSize: 10.5,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  infoCellValue: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  infoCellRewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },

  // ── 7-day stats ───────────────────────────────────────────────────────────
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    padding: 14,
    marginBottom: 22,
  },
  statsLeft: {
    flex: 1,
  },
  statsEyebrow: {
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  statsCount: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  statsNum: {
    fontSize: 22,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },
  statsDenom: {
    fontSize: 13,
    color: ParentColors.fgMuted,
  },
  statsRate: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
  },
  dotStrip: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 10,
    height: 22,
    borderRadius: 4,
  },

  // ── Recent records ────────────────────────────────────────────────────────
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
    marginBottom: 10,
  },
  recordsCard: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    overflow: 'hidden',
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
  },
  recordRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  recordDate: {
    width: 36,
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
    fontFamily: ParentFonts.display,
    paddingTop: 2,
    flexShrink: 0,
  },
  recordMain: {
    flex: 1,
  },
  recordPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: ParentRadii.pill,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
  },
  recordTime: {
    fontSize: 11,
    color: ParentColors.ink400,
  },

  // ── Bottom action bar ─────────────────────────────────────────────────────
  bottomBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: ParentSpacing.gutter,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: ParentColors.bgCanvas,
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 11,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
  },
  actionBtnClay: {
    backgroundColor: '#FAF1E7',
    borderColor: 'rgba(176,120,87,0.25)',
  },
  actionBtnInk: {
    backgroundColor: ParentColors.bgSurface,
    borderColor: ParentColors.borderSoft,
  },
  actionBtnDanger: {
    backgroundColor: 'rgba(181,72,58,0.06)',
    borderColor: 'rgba(181,72,58,0.22)',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
  },

  // ── Inline panels ─────────────────────────────────────────────────────────
  inlinePanel: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECDFD0',
    padding: 16,
    marginBottom: 18,
    ...ParentShadows.card,
  },
  inlinePanelEdit: {
    borderColor: ParentColors.borderSoft,
  },
  editIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: ParentColors.bgSurfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  editFormLabel: {
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    letterSpacing: 0.2,
    marginBottom: 6,
    marginTop: 12,
  },
  editInput: {
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    padding: 12,
    fontSize: 14,
    color: ParentColors.fgPrimary,
    backgroundColor: ParentColors.bgSurface,
  },
  editToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  editToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
    alignItems: 'center',
  },
  editToggleBtnActive: {
    backgroundColor: ParentColors.ink900,
    borderColor: ParentColors.ink900,
  },
  editToggleText: {
    fontSize: 13,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.ink700,
  },
  editToggleTextActive: {
    color: '#FFFFFF',
  },

  // ── Modals (shared) ───────────────────────────────────────────────────────
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,27,23,0.42)',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: ParentColors.teal500,
    borderRadius: ParentRadii.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: '#FFFFFF',
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: ParentRadii.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  btnDanger: {
    flex: 1,
    backgroundColor: '#B5483A',
    borderRadius: ParentRadii.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.45,
  },

  // ── Observe modal ─────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: ParentColors.bgSurface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 28,
    maxHeight: '88%',
    ...ParentShadows.elev,
  },
  modalDragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: ParentColors.ivory300,
    alignSelf: 'center',
    marginBottom: 16,
  },
  observeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 16,
  },
  observeIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FAF1E7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  observeHeaderText: {
    flex: 1,
  },
  observeTitle: {
    fontSize: 17,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },
  observeSubtitle: {
    fontSize: 12,
    color: ParentColors.fgMuted,
    marginTop: 2,
    lineHeight: 17,
  },
  observeSectionLabel: {
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  obsOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: ParentRadii.md,
    borderWidth: 1.5,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
    marginBottom: 6,
  },
  obsOptionActive: {
    borderColor: ParentColors.teal500,
    backgroundColor: ParentColors.teal50,
  },
  obsRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: ParentColors.ivory300,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  obsRadioActive: {
    borderColor: ParentColors.teal500,
    backgroundColor: ParentColors.teal500,
  },
  obsRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  obsOptionText: {
    flex: 1,
  },
  obsOptionLabel: {
    fontSize: 13.5,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  obsOptionDesc: {
    fontSize: 11,
    color: ParentColors.fgMuted,
    marginTop: 1,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 10,
    marginBottom: 6,
  },
  noteOptional: {
    fontSize: 11,
    color: ParentColors.ink400,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    padding: 12,
    fontSize: 14,
    color: ParentColors.fgPrimary,
    backgroundColor: ParentColors.bgSurface,
    minHeight: 80,
    marginBottom: 4,
  },

  // ── Reward adjust ─────────────────────────────────────────────────────────
  rewardAdjustBox: {
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  rewardAdjustHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rewardAdjustTitle: {
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    letterSpacing: 0.2,
  },
  rewardAdjustOpt: {
    fontSize: 10.5,
    color: ParentColors.ink400,
  },
  rewardAdjustNoRewardNote: {
    fontSize: 11,
    color: ParentColors.fgMuted,
    lineHeight: 17,
    marginBottom: 8,
  },
  rewardAdjustGroup: {
    fontSize: 10.5,
    color: ParentColors.fgMuted,
    fontWeight: ParentFontWeights.semi,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  adjustChipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  adjustChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    backgroundColor: ParentColors.bgSurface,
    gap: 2,
  },
  adjustChipLabel: {
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  adjustChipActive: {
    color: '#FFFFFF',
  },
  adjustChipAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  adjustChipNum: {
    fontSize: 13,
    fontWeight: ParentFontWeights.bold,
    fontFamily: ParentFonts.display,
    color: ParentColors.fgPrimary,
  },
  adjustChipUnit: {
    fontSize: 10,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgMuted,
    marginLeft: 1,
  },
  rewardAdjustHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  rewardAdjustHintText: {
    fontSize: 11,
    color: ParentColors.fgMuted,
    flex: 1,
  },

  // ── Delete modal ──────────────────────────────────────────────────────────
  deleteOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  deleteCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: ParentColors.bgCanvas,
    borderRadius: 18,
    padding: 20,
    ...ParentShadows.elev,
  },
  deleteIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(181,72,58,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  deleteTitle: {
    fontSize: 18,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
    marginBottom: 8,
    lineHeight: 24,
  },
  deleteBody: {
    fontSize: 13,
    color: ParentColors.fgMuted,
    lineHeight: 20,
    marginBottom: 4,
  },
});
