import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Colors } from '../constants/colors';
import CoinCheckbox from './child/CoinCheckbox';
import ProgressBar from './child/ProgressBar';
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

function getDueText(due: string | null): { text: string; urgency: Urgency } {
  if (!due) return { text: '', urgency: 'ok' };
  const today = dayjs().tz(TZ).startOf('day');
  const dueDay = dayjs(due).tz(TZ).startOf('day');
  const diff = dueDay.diff(today, 'day');
  if (diff < 0)   return { text: '已過截止', urgency: 'urgent' };
  if (diff === 0) return { text: '今天截止', urgency: 'urgent' };
  if (diff <= 2)  return { text: `還有 ${diff} 天`, urgency: 'warn' };
  return { text: `${dueDay.format('M/D')} 截止`, urgency: 'ok' };
}

export interface TaskCardProps {
  task: TodayTask;
  variant: Variant;
  isCompleted: boolean;
  isPrerequisiteMet?: boolean;
  onPress: () => void;
}

/**
 * 任務列 —— 方向A「家庭帳本」的正典列表行。
 * 狀態靠位置/字重/勾選承載，不用 chip、狀態字、行內 emoji。
 * weekly/instant：金幣勾圈 + 名稱 + 右對齊數字（+幣 / 省X分）。
 * longterm：唯一有進度條，標題+進度在一列、整列點進詳情（無勾圈），進度用暖橘。
 */
export default function TaskCard({
  task,
  variant,
  isCompleted,
  isPrerequisiteMet = true,
  onPress,
}: TaskCardProps) {
  const isLongterm   = variant === 'longterm';
  const isWeekly     = variant === 'weekly';
  const paysCoin     = task.category === 'C';
  const showTimeSave = task.category === 'B' && task.time_saving_min > 0;
  const displayCoin  = paysCoin ? calcDisplayCoin(task, isPrerequisiteMet) : 0;

  // ── 長期挑戰：唯一有進度條，整列點進詳情 ──────────────────────────
  if (isLongterm) {
    const goal    = task.goal;
    const total   = goal?.total_days ?? 30;
    const current = goal?.current_day ?? 0;
    const pct     = Math.min((current / total) * 100, 100);
    return (
      <TouchableOpacity style={styles.ltRow} onPress={onPress} activeOpacity={0.6}>
        <View style={styles.ltTopLine}>
          <Text style={styles.ltName} numberOfLines={1}>{task.name}</Text>
          <Text style={styles.ltMeta}>第 {current}/{total} 天</Text>
          <Chevron />
        </View>
        <ProgressBar pct={pct} height={6} />
      </TouchableOpacity>
    );
  }

  // ── 週期 / 即時任務：金幣勾圈完成 ────────────────────────────────
  const due = getDueText(task.due_date);
  const secondary = isWeekly ? (task.allow_repeat ? '每天' : '今天') : due.text;

  return (
    <View style={[styles.row, isCompleted && styles.rowDone]}>
      <CoinCheckbox
        completed={isCompleted}
        paysCoin={paysCoin}
        onPress={onPress}
        disabled={isCompleted && !task.allow_repeat}
      />
      <View style={styles.mid}>
        <Text style={[styles.name, isCompleted && styles.nameDone]} numberOfLines={1}>
          {task.name}
        </Text>
        {secondary ? (
          <Text
            style={[styles.secondary, due.urgency === 'urgent' && !isCompleted && styles.secondaryUrgent]}
            numberOfLines={1}
          >
            {secondary}
          </Text>
        ) : null}
      </View>

      {paysCoin ? (
        <Text style={[styles.coinAmount, isCompleted && styles.amountDone]}>+{displayCoin}</Text>
      ) : showTimeSave ? (
        <Text style={[styles.timeAmount, isCompleted && styles.amountDone]}>省 {task.time_saving_min} 分</Text>
      ) : null}
    </View>
  );
}

function Chevron() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={Colors.ink300} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
  },
  rowDone: {
    opacity: 0.5,
  },
  mid: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ink900,
  },
  nameDone: {
    color: Colors.ink300,
  },
  secondary: {
    fontSize: 12.5,
    color: Colors.fgMuted,
  },
  secondaryUrgent: {
    color: Colors.error,
    fontWeight: '600',
  },
  coinAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.gold700,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  timeAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.fgMuted,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  amountDone: {
    color: Colors.ink300,
  },

  // 長期挑戰
  ltRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
    gap: 9,
  },
  ltTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ltName: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ink900,
  },
  ltMeta: {
    fontSize: 12.5,
    color: Colors.fgMuted,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  ltTrack: {
    height: 6,
    borderRadius: 99,
    backgroundColor: Colors.fruit100,
    overflow: 'hidden',
  },
  ltFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: Colors.fruit500,
  },
});
