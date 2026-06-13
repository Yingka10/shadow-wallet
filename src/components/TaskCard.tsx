import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Colors } from '../constants/colors';
import type { TodayTask } from '../hooks/useTodayTasks';
import type { Task } from '../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

type Urgency = 'ok' | 'warn' | 'urgent';
type Variant = 'weekly' | 'instant' | 'longterm';

function calcDisplayCoin(task: Task, isPrerequisiteMet: boolean): number {
  const base = task.coin_override ?? Math.round(task.base_time_min * task.difficulty);
  return Math.round(base * (isPrerequisiteMet ? 1.0 : 0.7));
}

function calcFullCoin(task: Task): number {
  return task.coin_override ?? Math.round(task.base_time_min * task.difficulty);
}

function getDueDateInfo(due: string | null): { text: string; tagText: string; urgency: Urgency } {
  if (!due) return { text: '隨時完成', tagText: '', urgency: 'ok' };
  const today = dayjs().tz(TZ).startOf('day');
  const dueDay = dayjs(due).tz(TZ).startOf('day');
  const diff = dueDay.diff(today, 'day');
  if (diff < 0)  return { text: '已過截止日',               tagText: '逾期',         urgency: 'urgent' };
  if (diff === 0) return { text: '今天截止，快去完成！',     tagText: '今天',         urgency: 'urgent' };
  if (diff <= 2)  return { text: `${dueDay.format('M月D日')}截止`, tagText: `還有 ${diff} 天`, urgency: 'warn' };
  return { text: `${dueDay.format('M月D日')}截止`, tagText: `還有 ${diff} 天`, urgency: 'ok' };
}

const CAT_EMOJI: Record<string, string> = { A: '🌅', B: '🏡', C: '⚡', D: '🎯' };

const VARIANT_ACCENT: Record<Variant, string> = {
  weekly:   Colors.sage600,
  instant:  Colors.coral500,
  longterm: Colors.lilac500,
};

const VARIANT_ICON_BG: Record<Variant, string> = {
  weekly:   'rgba(90,170,64,0.12)',
  instant:  'rgba(245,168,48,0.14)',
  longterm: 'rgba(155,130,199,0.12)',
};

export interface TaskCardProps {
  task: TodayTask;
  variant: Variant;
  isCompleted: boolean;
  isPrerequisiteMet?: boolean;
  onPress: () => void;
}

export default function TaskCard({
  task,
  variant,
  isCompleted,
  isPrerequisiteMet = true,
  onPress,
}: TaskCardProps) {
  const accentColor = VARIANT_ACCENT[variant];
  const iconBg      = VARIANT_ICON_BG[variant];
  const isWeekly    = variant === 'weekly';
  const isLongterm  = variant === 'longterm';

  const showCoin      = task.category === 'C';
  const showTimeSave  = task.category === 'B' && task.time_saving_min > 0;
  const showDiscount  = !isPrerequisiteMet && !isCompleted && showCoin;
  const displayCoin   = showCoin ? calcDisplayCoin(task, isPrerequisiteMet) : 0;
  const fullCoin      = showCoin ? calcFullCoin(task) : 0;
  const dueInfo       = getDueDateInfo(task.due_date);
  const emoji         = CAT_EMOJI[task.category] ?? '📋';
  const typeName      = isWeekly ? '週期任務' : isLongterm ? '長期目標' : '即時任務';

  // Long-term goal progress
  const goal      = task.goal;
  const ltTotal   = goal?.total_days ?? 30;
  const ltCurrent = goal?.current_day ?? 0;
  const ltPct     = Math.min((ltCurrent / ltTotal) * 100, 100);
  const isHabit   = goal?.goal_type === 'habit';

  return (
    <View style={[styles.card, isCompleted && styles.cardDone]}>
      {/* Left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

      {/* Card body */}
      <View style={styles.body}>

        {/* ── Top row ── */}
        <View style={styles.topRow}>
          <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
            <Text style={styles.iconEmoji}>{emoji}</Text>
          </View>

          <View style={styles.nameBlock}>
            <Text style={[styles.taskName, isCompleted && styles.taskNameDone]} numberOfLines={1}>
              {task.name}
            </Text>
            <View style={styles.typeRow}>
              <View style={[styles.typeDot, { backgroundColor: accentColor }]} />
              <Text style={[styles.typeLabel, { color: accentColor }]}>{typeName}</Text>
            </View>
          </View>

          {/* Coin / time chip */}
          {showCoin ? (
            <View style={[styles.chip, isWeekly ? styles.chipGreen : styles.chipOrange]}>
              <Text style={[styles.chipText, isWeekly ? styles.chipTextGreen : styles.chipTextOrange]}>
                🌟 {displayCoin}
              </Text>
            </View>
          ) : showTimeSave ? (
            <View style={[styles.chip, styles.chipGrey]}>
              <Text style={styles.chipTextGrey}>⏱ 省{task.time_saving_min}分</Text>
            </View>
          ) : isLongterm && goal ? (
            <View style={[styles.chip, isHabit ? styles.chipOrange : styles.chipGreen]}>
              <Text style={[styles.chipText, isHabit ? styles.chipTextOrange : styles.chipTextGreen]}>
                {isHabit ? '🔥 連打' : '⬆️ 解鎖'}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Divider ── */}
        <View style={styles.divider} />

        {/* ── Body row ── */}
        {isLongterm && goal ? (
          /* 長期任務：顯示進度條 */
          <View style={styles.ltBody}>
            <View style={styles.ltProgressRow}>
              <Text style={styles.ltDayText}>第 {ltCurrent} 天 / {ltTotal} 天</Text>
              <Text style={styles.ltPctText}>{Math.round(ltPct)}%</Text>
            </View>
            <View style={styles.ltTrack}>
              <View style={[styles.ltFill, { width: `${ltPct}%` as any, backgroundColor: accentColor }]} />
            </View>
          </View>
        ) : isWeekly ? (
          /* 週期任務：重複說明 */
          <View style={styles.cadenceRow}>
            <Text style={styles.cadenceIcon}>🔁</Text>
            <Text style={styles.cadenceText}>
              {task.allow_repeat ? '每天都可完成' : '今日任務'}
            </Text>
          </View>
        ) : (
          /* 即時任務：截止日 */
          <View style={styles.deadlineRow}>
            <Text style={[styles.deadlineIcon, dueInfo.urgency === 'urgent' && styles.urgentColor]}>
              {dueInfo.urgency === 'urgent' ? '⚠️' : '📅'}
            </Text>
            <Text style={[styles.deadlineText, dueInfo.urgency === 'urgent' && styles.urgentColor]}>
              {dueInfo.text}
            </Text>
            {dueInfo.tagText ? (
              <View
                style={[
                  styles.deadlineTag,
                  dueInfo.urgency === 'ok'     && styles.tagOk,
                  dueInfo.urgency === 'warn'   && styles.tagWarn,
                  dueInfo.urgency === 'urgent' && styles.tagUrgent,
                ]}
              >
                <Text
                  style={[
                    styles.deadlineTagText,
                    dueInfo.urgency === 'ok'     && styles.tagTextOk,
                    dueInfo.urgency === 'warn'   && styles.tagTextWarn,
                    dueInfo.urgency === 'urgent' && styles.tagTextUrgent,
                  ]}
                >
                  {dueInfo.tagText}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {/* 折扣提示 */}
        {showDiscount && (
          <View style={styles.discountNudge}>
            <Text style={styles.discountNudgeText}>
              先完成週期任務，解鎖完整 {fullCoin} 幣！
            </Text>
          </View>
        )}

        {/* ── 完成按鈕 ── */}
        {!isLongterm && (
          <TouchableOpacity
            style={[
              styles.completeBtn,
              isCompleted
                ? styles.completeBtnDone
                : { backgroundColor: accentColor },
            ]}
            onPress={onPress}
            disabled={isCompleted && !task.allow_repeat}
            activeOpacity={0.85}
          >
            <Text style={[styles.completeBtnText, isCompleted && styles.completeBtnTextDone]}>
              {isCompleted ? '✓ 完成！幣已入帳' : '完成了！✓'}
            </Text>
          </TouchableOpacity>
        )}

        {/* 長期任務：點擊查看詳情提示 */}
        {isLongterm && (
          <TouchableOpacity
            style={[styles.completeBtn, { backgroundColor: accentColor }]}
            onPress={onPress}
            activeOpacity={0.85}
          >
            <Text style={styles.completeBtnText}>查看詳情 →</Text>
          </TouchableOpacity>
        )}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCanvas,
    borderRadius: 18,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 4,
  },
  cardDone: {
    opacity: 0.55,
  },

  accentBar: {
    width: 5,
  },

  body: {
    flex: 1,
    padding: 14,
  },

  /* Top row */
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  iconEmoji: {
    fontSize: 22,
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  taskName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink900,
    marginBottom: 3,
  },
  taskNameDone: {
    textDecorationLine: 'line-through',
    color: Colors.ink500,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  typeLabel: {
    fontSize: 11,
  },

  /* Chips */
  chip: {
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 10,
    flexShrink: 0,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  chipOrange: {
    backgroundColor: '#fff0c8',
    borderWidth: 1,
    borderColor: '#f0cc70',
  },
  chipTextOrange: {
    color: Colors.gold700,
  },
  chipGreen: {
    backgroundColor: '#e8f8d8',
    borderWidth: 1,
    borderColor: '#90d870',
  },
  chipTextGreen: {
    color: '#3a8020',
  },
  chipGrey: {
    backgroundColor: Colors.cream100,
    borderWidth: 1,
    borderColor: Colors.ink100,
  },
  chipTextGrey: {
    fontSize: 11,
    color: Colors.ink500,
    fontWeight: '600',
  },

  /* Divider */
  divider: {
    height: 1,
    backgroundColor: '#f0e2b8',
    marginBottom: 10,
  },

  /* Cadence row (weekly) */
  cadenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 12,
  },
  cadenceIcon: {
    fontSize: 15,
  },
  cadenceText: {
    fontSize: 12,
    color: Colors.sage600,
  },

  /* Deadline row (instant) */
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 12,
  },
  deadlineIcon: {
    fontSize: 15,
  },
  deadlineText: {
    fontSize: 12,
    color: Colors.ink500,
    flex: 1,
  },
  urgentColor: {
    color: '#c84828',
  },
  deadlineTag: {
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 8,
    flexShrink: 0,
  },
  deadlineTagText: {
    fontSize: 10,
    fontWeight: '500',
  },
  tagOk: {
    backgroundColor: 'rgba(100,180,80,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(100,180,80,0.25)',
  },
  tagTextOk: { color: '#2d6b32' },
  tagWarn: {
    backgroundColor: '#fff0d0',
    borderWidth: 1,
    borderColor: '#f0cc70',
  },
  tagTextWarn: { color: Colors.gold700 },
  tagUrgent: {
    backgroundColor: 'rgba(240,140,106,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(240,140,106,0.30)',
  },
  tagTextUrgent: { color: Colors.coral600 },

  /* Long-term progress body */
  ltBody: {
    marginBottom: 12,
    gap: 6,
  },
  ltProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ltDayText: {
    fontSize: 12,
    color: Colors.ink500,
  },
  ltPctText: {
    fontSize: 11,
    color: Colors.ink300,
  },
  ltTrack: {
    height: 6,
    borderRadius: 99,
    backgroundColor: Colors.cream200,
    overflow: 'hidden',
  },
  ltFill: {
    height: '100%',
    borderRadius: 99,
  },

  /* Discount nudge */
  discountNudge: {
    backgroundColor: 'rgba(240,140,106,0.08)',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  discountNudgeText: {
    fontSize: 11,
    color: Colors.coral700,
    fontWeight: '500',
  },

  /* Complete button */
  completeBtn: {
    width: '100%',
    paddingVertical: 10,
    borderRadius: 13,
    alignItems: 'center',
  },
  completeBtnDone: {
    backgroundColor: '#edf8e0',
    borderWidth: 1.5,
    borderColor: '#b0da88',
  },
  completeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  completeBtnTextDone: {
    color: '#4a8a28',
  },
});
