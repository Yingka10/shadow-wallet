// GrowBook Child Long-Term Detail — Final Journey Visual Shell（LT-FINAL-2）
//
// ─────────────────────────────────────────────────────────────────────────
// 固定骨架（§2）：Header（screen 層）→ Hero → Today → Progress → Next Stop
// （有真實 checkpoint 才 render）→ Together Review → More。
//
// 所有 progression 共用同一份骨架，只有 Progress 內部換 renderer——
// 不再 rhythm / skill / challenge 各一套頁面。
//
// 這裡的每一個字都來自 GoalPresentation，這支元件不重算 progression、
// 不從 task.name 猜圖示、不自己編一句「正在找到節奏」。
// ─────────────────────────────────────────────────────────────────────────

import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { Colors } from '../../constants/colors';
import { webMouseDraggableScroll } from '../../constants/webStyles';
import type { PreferredTimeWindow } from '../../types/database';
import type {
  GoalDayStatus,
  GoalPresentation,
  GoalRecentRecord,
} from '../../screens/child/longTermGoalPresentation';

type Props = {
  presentation: GoalPresentation;
  isCompletedToday: boolean;
  checking: boolean;
  onComplete: () => void | boolean | Promise<void | boolean>;
  onSelectTimeWindow: (window: PreferredTimeWindow) => void;
  onOpenRecord?: (completionId?: string) => void;
  onOpenReview?: () => void;
  onOpenDetails?: () => void;
  /** 「更多紀錄與計畫」——開同一個選單（最近紀錄／計畫細節／可調整內容）。 */
  onOpenMore?: () => void;
  /**
   * 已經送出、還等家長確認的時段調整（P0-8M）。
   *
   * 有值時只顯示一句話，**不**改變目前的時段顯示 —— 計畫要等雙方確認才更新，
   * 提前把畫面改成新時段等於替家長答應了。
   */
  pendingTimeAdjustmentNotice?: string | null;
};

type IconName =
  | 'sprout'
  | 'book'
  | 'calendar'
  | 'milestone'
  | 'conversation'
  | 'document'
  | 'check'
  | 'chevron'
  | 'clock'
  | 'info';

const DAY_STATE_LABELS: Record<GoalDayStatus['state'], string> = {
  completed: '已完成',
  today: '今天待完成',
  upcoming: '尚未到',
  missed: '尚未記錄',
  unscheduled: '沒有安排',
};

const DAY_CAPTIONS: Record<GoalDayStatus['state'], string> = {
  completed: '完成',
  today: '今天',
  upcoming: '尚未到',
  missed: '尚未記錄',
  unscheduled: '未安排',
};

const WEEKDAY_NAMES: Record<number, string> = {
  0: '星期日',
  1: '星期一',
  2: '星期二',
  3: '星期三',
  4: '星期四',
  5: '星期五',
  6: '星期六',
};

function formatTimeWindow(window: PreferredTimeWindow): string {
  return window === 'after_dinner' ? '晚餐後' : '睡前';
}

function DetailIcon({
  name,
  size = 22,
  color = Colors.fgSecondary,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const common = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  if (name === 'sprout') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path d="M12 20V9" {...common} />
        <Path d="M12 13C8 13 5 11 5 7c4 0 7 2 7 6Z" {...common} />
        <Path d="M12 10c0-4 3-6 7-6 0 4-3 6-7 6Z" {...common} />
        <Path d="M6 20h12" {...common} />
      </Svg>
    );
  }

  if (name === 'book') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path d="M4 5.5c3.5-.7 6.2.2 8 2.1v11c-1.8-1.9-4.5-2.8-8-2.1v-11Z" {...common} />
        <Path d="M20 5.5c-3.5-.7-6.2.2-8 2.1v11c1.8-1.9 4.5-2.8 8-2.1v-11Z" {...common} />
      </Svg>
    );
  }

  if (name === 'calendar') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Rect x={4} y={5.5} width={16} height={14} rx={2} {...common} />
        <Path d="M8 3.5v4M16 3.5v4M4 10h16" {...common} />
        <Circle cx={9} cy={14} r={1} fill={color} />
        <Circle cx={15} cy={14} r={1} fill={color} />
      </Svg>
    );
  }

  if (name === 'milestone') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path d="M12 3.5 14.5 8l5 .8-3.6 3.6.8 5-4.7-2.3-4.7 2.3.8-5-3.6-3.6 5-.8L12 3.5Z" {...common} />
      </Svg>
    );
  }

  if (name === 'conversation') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path d="M5 5h14v10H9l-4 4V5Z" {...common} />
        <Path d="M8.5 9h7M8.5 12h4.5" {...common} />
      </Svg>
    );
  }

  if (name === 'document') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path d="M6 3.5h8l4 4v13H6v-17Z" {...common} />
        <Path d="M14 3.5v4h4M9 12h6M9 16h6" {...common} />
      </Svg>
    );
  }

  if (name === 'check') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path d="m5.5 12.5 4 4 9-9" {...common} />
      </Svg>
    );
  }

  if (name === 'chevron') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path d="m9 5 7 7-7 7" {...common} />
      </Svg>
    );
  }

  if (name === 'clock') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Circle cx={12} cy={12} r={8.5} {...common} />
        <Path d="M12 7.5V12l3 2" {...common} />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Circle cx={12} cy={12} r={9} {...common} />
      <Path d="M12 10.5v6M12 7.3v.2" {...common} />
    </Svg>
  );
}

function SectionHeading({ icon, title }: { icon: IconName; title: string }) {
  return (
    <View style={styles.sectionHeading}>
      <DetailIcon name={icon} size={20} color={Colors.leaf700} />
      <Text style={styles.sectionHeadingText}>{title}</Text>
    </View>
  );
}

/**
 * progression-neutral 的小夥伴 —— 不從任務名稱猜圖（§11）。純 SVG，沒有
 * asset 時 layout 仍然成立；只負責「有人在陪我走」，不做表情/對話框。
 */
function GrowSprite({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56" accessibilityElementsHidden>
      <Circle cx={28} cy={34} r={16} fill={Colors.leaf100} />
      <Circle cx={28} cy={34} r={16} fill="none" stroke={Colors.leaf300} strokeWidth={1.4} />
      <Circle cx={22} cy={31} r={2.1} fill={Colors.ink700} />
      <Circle cx={34} cy={31} r={2.1} fill={Colors.ink700} />
      <Path
        d="M23 38c2.2 2 7.8 2 10 0"
        stroke={Colors.ink700}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M28 18c-5 0-8 3-8 3s3-1 8-1 8 1 8 1-3-3-8-3Z"
        fill={Colors.leaf500}
      />
      <Path
        d="M28 19V9"
        stroke={Colors.leaf600}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── Journey Hero（§4、§5）───────────────────────────────────────────────

/** 路徑上三段折線的端點，marker 依 fraction 在其間線性內插。 */
const HERO_WAYPOINTS: { x: number; y: number }[] = [
  { x: 26, y: 166 },
  { x: 150, y: 130 },
  { x: 246, y: 96 },
  { x: 322, y: 73 },
];

function heroMarkerPosition(fraction: number): { x: number; y: number } {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const segments = HERO_WAYPOINTS.length - 1;
  const scaled = clamped * segments;
  const index = Math.min(Math.floor(scaled), segments - 1);
  const t = scaled - index;
  const a = HERO_WAYPOINTS[index];
  const b = HERO_WAYPOINTS[index + 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function GoalHero({ presentation }: { presentation: GoalPresentation }) {
  const marker = heroMarkerPosition(presentation.heroMarkerFraction);
  const pathD = HERO_WAYPOINTS
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
    .join(' ');
  const accessibleSummary = [
    presentation.heroPositionLabel,
    presentation.heroTotalLabel,
    presentation.heroPositionNote,
  ].filter(Boolean).join('，');

  return (
    <View
      testID="goal-hero"
      style={styles.hero}
      accessibilityLabel={accessibleSummary}
    >
      <Svg
        style={StyleSheet.absoluteFill}
        viewBox="0 0 380 220"
        preserveAspectRatio="none"
        accessibilityElementsHidden
      >
        {/*
          底色是深綠，不是夜空的藍灰 —— 之前用 nightHillBackBottom（帶藍霧的
          遠山色）當滿版底色，短版面裡遠山佔比又最大，整張 Hero 看起來偏藍灰、
          不夠綠。這裡改用兩段深綠垂直過渡，讓「綠底」在任何高度下都成立。
        */}
        <Path d="M0 0H380V220H0z" fill={Colors.grass.nightHillMidBottom} />
        <Path d="M0 0H380V96H0z" fill={Colors.grass.nightHillFrontBottom} opacity={0.55} />
        <Path
          d="M0 138c80-30 145-22 210 6 70 29 121 11 170-14v90H0V138Z"
          fill={Colors.grass.nightHillFrontBottom}
        />
        <Circle cx={40} cy={38} r={19} fill={Colors.gold100} opacity={0.2} />
        <Path
          d="M47 20c-10 5-14 15-10 25 4 10 14 15 24 11-8-2-13-10-13-17 0-8 4-14 10-18-4-2-7-2-11-1Z"
          fill={Colors.gold300}
        />
        <Circle cx={130} cy={28} r={1.9} fill={Colors.gold300} />
        <Circle cx={178} cy={50} r={1.6} fill={Colors.gold300} />
        <Circle cx={352} cy={30} r={2} fill={Colors.gold300} />

        {/*
          這段路的小徑——只是「我正在這段旅程裡」的意象，不是可數的進度條。
          唯一可數的東西是下面那顆 marker，就一顆（§4 絕對規則）。
        */}
        <Path
          d={pathD}
          stroke={Colors.grass.nightBladeTop}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray="1 9"
          fill="none"
          opacity={0.85}
        />
        <Circle cx={marker.x} cy={marker.y} r={7} fill={Colors.gold300} opacity={0.35} />
        <Circle
          cx={marker.x}
          cy={marker.y}
          r={4.5}
          fill={Colors.gold500}
          stroke={Colors.bgSurface}
          strokeWidth={1.6}
        />
      </Svg>

      <Image
        source={require('../../../assets/images/child/treehouse-night.png')}
        style={styles.treehouse}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />

      <View style={styles.heroCopy}>
        <View style={styles.categoryBadge}>
          <DetailIcon name="sprout" size={13} color={Colors.gold100} />
          <Text style={styles.categoryText} numberOfLines={1}>
            {presentation.categoryLabel}
          </Text>
        </View>
        <Text style={styles.heroPosition} numberOfLines={1}>
          {presentation.heroPositionLabel}
        </Text>
        {presentation.heroPositionNote ? (
          <Text style={styles.heroNote} numberOfLines={2}>
            {presentation.heroPositionNote}
          </Text>
        ) : null}
        {presentation.heroTotalLabel ? (
          <Text style={styles.heroTotal} numberOfLines={1}>
            {presentation.heroTotalLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Today（§6-§10）────────────────────────────────────────────────────

type TodayStepCardProps = Pick<
  Props,
  | 'presentation'
  | 'isCompletedToday'
  | 'checking'
  | 'onComplete'
  | 'onSelectTimeWindow'
  | 'onOpenRecord'
>;

function CompletedTodayState({
  presentation,
  completion,
  onOpenRecord,
}: {
  presentation: GoalPresentation;
  completion?: GoalRecentRecord;
  onOpenRecord?: Props['onOpenRecord'];
}) {
  const minutes = presentation.sessionMinutes;
  const completedLabel = minutes ? `今天已完成 ${minutes} 分鐘` : '今天已完成';
  const openRecord = () => onOpenRecord?.(completion?.id);

  return (
    <View style={styles.completedState}>
      <View style={styles.completedTitleRow}>
        <View style={styles.completedCheck}>
          <DetailIcon name="check" size={18} color={Colors.bgSurface} />
        </View>
        <View style={styles.completedCopy}>
          <Text style={styles.completedTitle}>{completedLabel}</Text>
          {completion?.timeWindowLabel ? (
            <Text style={styles.completedMeta}>{completion.timeWindowLabel}記錄</Text>
          ) : null}
        </View>
      </View>
      {onOpenRecord ? (
        <View style={styles.completedActions}>
          <TouchableOpacity
            style={styles.secondaryAction}
            onPress={openRecord}
            accessibilityRole="button"
            accessibilityLabel="查看紀錄"
            activeOpacity={0.72}
          >
            <Text style={styles.secondaryActionText}>查看紀錄</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryAction}
            onPress={openRecord}
            accessibilityRole="button"
            accessibilityLabel="需要更正"
            activeOpacity={0.72}
          >
            <Text style={styles.secondaryActionText}>需要更正</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

/** availability reason → Today 卡的非操作 state 文案（§10）。 */
function unavailableCopy(presentation: GoalPresentation): string {
  switch (presentation.completionReason) {
    case 'schedule_not_defined':
      return '這份計畫還沒安排練習時間';
    case 'not_scheduled_today':
      return '今天沒有安排這一步';
    case 'already_recorded_today':
      return '今天這一步已經記下來了 ✓';
    case 'claim_limit_reached':
      return '這一段時間的紀錄已經滿了';
    case 'before_plan':
      return '計畫還沒開始';
    case 'after_plan':
      return '一起回顧這段計畫';
    case 'paused':
      return '這個計畫暫停中';
    case 'unsupported_progression':
      // 中性描述，不重新導回「家長一起確認」那種 parent-confirmed 語意
      // （LT-FINAL Visual Integration Spec §9）。
      return '這個計畫還沒安排可以記錄的進度方式';
    default:
      return '今天先照自己的節奏前進，需要時再和家人一起確認。';
  }
}

function TodayStepCard({
  presentation,
  isCompletedToday,
  checking,
  onComplete,
  onSelectTimeWindow,
  onOpenRecord,
}: TodayStepCardProps) {
  const [showTimeOptions, setShowTimeOptions] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const completionPendingRef = useRef(false);
  const completed = isCompletedToday;
  const busy = checking || completing;
  const showReadingTimeControls =
    presentation.supportsTimeWindow && presentation.canCompleteToday;
  const todayCompletion = isCompletedToday ? presentation.recentRecords[0] : undefined;

  const handleComplete = async () => {
    if (checking || completionPendingRef.current) return;

    completionPendingRef.current = true;
    setCompleting(true);
    setCompletionError(null);
    try {
      await onComplete();
    } catch {
      setCompletionError('剛才沒有記錄成功，請再試一次。');
    } finally {
      completionPendingRef.current = false;
      setCompleting(false);
    }
  };

  const handleTimeSelect = (window: PreferredTimeWindow) => {
    onSelectTimeWindow(window);
    setShowTimeOptions(false);
  };

  return (
    <View>
      <View style={styles.sectionHeadingRow}>
        <SectionHeading icon="sprout" title={presentation.todayTitle} />
        <Text style={styles.sectionHeadingHint}>今天只走這一步</Text>
      </View>
      <View testID="goal-today" style={styles.card}>
        <View style={styles.todayAnatomy}>
          <View style={styles.actionIcon}>
            <DetailIcon name="sprout" size={22} color={Colors.leaf700} />
          </View>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>{presentation.todayAction}</Text>
            {!showReadingTimeControls && presentation.agreedTime ? (
              <View style={styles.scheduleLabel}>
                <DetailIcon name="clock" size={16} color={Colors.fgMuted} />
                <Text style={styles.scheduleText}>
                  {presentation.agreedTime.label}
                  {presentation.sessionMinutes ? `・約 ${presentation.sessionMinutes} 分鐘` : ''}
                </Text>
              </View>
            ) : null}
            {showReadingTimeControls ? (
              <View style={styles.scheduleRow}>
                <View style={styles.scheduleLabel}>
                  <DetailIcon name="clock" size={16} color={Colors.fgMuted} />
                  <Text style={styles.scheduleText}>
                    今天預計：
                    {presentation.preferredTimeWindow
                      ? formatTimeWindow(presentation.preferredTimeWindow)
                      : '尚未選擇時段'}
                  </Text>
                </View>
                {!completed && presentation.canCompleteToday ? (
                  <TouchableOpacity
                    style={styles.inlineAction}
                    accessibilityRole="button"
                    accessibilityLabel={
                      presentation.preferredTimeWindow ? '調整今天的預計時段' : '選擇今天的預計時段'
                    }
                    onPress={() => setShowTimeOptions((visible) => !visible)}
                    activeOpacity={0.72}
                  >
                    <Text style={styles.inlineActionText}>
                      {presentation.preferredTimeWindow ? '調整時段' : '選擇時段'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {completed ? (
              <CompletedTodayState
                presentation={presentation}
                completion={todayCompletion}
                onOpenRecord={onOpenRecord}
              />
            ) : presentation.canCompleteToday ? (
              <TouchableOpacity
                style={[styles.completeButton, busy && styles.buttonBusy]}
                disabled={busy}
                onPress={() => void handleComplete()}
                accessibilityRole="button"
                accessibilityLabel="記下今天的完成"
                accessibilityState={{ disabled: busy }}
                activeOpacity={0.78}
              >
                {busy ? (
                  <ActivityIndicator testID="completion-loading" size="small" color={Colors.bgSurface} />
                ) : (
                  <>
                    <DetailIcon name="check" size={19} color={Colors.bgSurface} />
                    <Text style={styles.completeButtonText}>記下今天的完成</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View
                testID="today-unavailable"
                style={styles.restNote}
                accessible
                accessibilityLabel={unavailableCopy(presentation)}
              >
                <Text style={styles.restNoteText}>{unavailableCopy(presentation)}</Text>
              </View>
            )}

            {showReadingTimeControls && showTimeOptions && !completed ? (
              <View testID="time-options" style={styles.timeOptions}>
                {([
                  ['after_dinner', '晚餐後'],
                  ['before_bed', '睡前'],
                ] as const).map(([value, label]) => {
                  const selected = presentation.preferredTimeWindow === value;
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[styles.timeOption, selected && styles.timeOptionSelected]}
                      onPress={() => handleTimeSelect(value)}
                      accessibilityRole="button"
                      accessibilityLabel={`改成${label}`}
                      accessibilityState={{ selected }}
                      activeOpacity={0.72}
                    >
                      <Text style={[styles.timeOptionText, selected && styles.timeOptionTextSelected]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            {completionError ? (
              <Text accessibilityRole="alert" style={styles.completionError}>
                {completionError}
              </Text>
            ) : null}
          </View>
          <View style={styles.mascotSlot} accessibilityElementsHidden>
            <GrowSprite size={52} />
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Progress（§13）────────────────────────────────────────────────────

function RhythmLeafRow({ done, target }: { done: number; target: number }) {
  if (target <= 0) return null;
  // ⚠️ 節點數量＝約定次數，是真資料不是裝飾；多做的次數只用文字表達，
  // 不畫第 target+1 顆葉子（§13 rhythm 超標規則）。
  const nodes = Array.from({ length: target }, (_, index) => index < Math.min(done, target));
  // 1–4 次：單排、節點稍大、平均拉開。5–7 次：仍單排，節點略縮小、間距跟著
  // 縮短——不要疊成兩排 habit grid（Visual Integration Spec §11）。
  const compact = target > 4;
  const nodeStyle = compact ? styles.leafNodeCompact : styles.leafNode;
  return (
    <View style={styles.leafRow} accessibilityElementsHidden>
      {nodes.map((filled, index) => (
        <React.Fragment key={index}>
          {index > 0 ? (
            <View
              style={[styles.leafConnector, nodes[index - 1] && filled && styles.leafConnectorFilled]}
            />
          ) : null}
          <View style={[nodeStyle, filled && styles.leafNodeFilled]}>
            {filled ? <DetailIcon name="sprout" size={compact ? 12 : 15} color={Colors.bgSurface} /> : null}
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function StageNodeRow({ current, target }: { current: number; target: number }) {
  const nodes = Array.from({ length: target }, (_, index) => {
    if (index < current) return 'completed' as const;
    if (index === current) return 'current' as const;
    return 'upcoming' as const;
  });
  return (
    <View style={styles.leafRow} accessibilityElementsHidden>
      {nodes.map((state, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <View style={styles.leafConnector} /> : null}
          <View
            style={[
              styles.stageNode,
              state === 'completed' && styles.stageNodeCompleted,
              state === 'current' && styles.stageNodeCurrent,
            ]}
          >
            {state === 'completed' ? (
              <DetailIcon name="check" size={13} color={Colors.bgSurface} />
            ) : null}
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function ProgressCard({ presentation }: { presentation: GoalPresentation }) {
  const { progression } = presentation;

  let title: string;
  let body: React.ReactNode;

  if (progression === 'rhythm') {
    title = '這週的節奏';
    body = (
      <>
        <Text style={styles.progressPrimary}>{presentation.weekProgressLabel}</Text>
        {presentation.weekProgressNote ? (
          <Text style={styles.progressNote}>{presentation.weekProgressNote}</Text>
        ) : null}
        <RhythmLeafRow done={presentation.weekCompletedActual} target={presentation.weekTarget} />
      </>
    );
  } else if (progression === 'fixed_days') {
    title = '這週的安排';
    body = (
      <>
        <Text style={styles.progressPrimary}>{presentation.weekProgressLabel}</Text>
        <View style={[styles.weekRow, styles.weekRowSpaced]}>
        {presentation.weekDays.map((day) => (
          <View
            key={day.isoDate}
            style={styles.dayCell}
            accessible
            accessibilityLabel={`${WEEKDAY_NAMES[day.day]}，${DAY_STATE_LABELS[day.state]}`}
          >
            <Text style={styles.dayLabel}>{day.label}</Text>
            <View
              style={[
                styles.dayCircle,
                day.state === 'completed' && styles.dayCircleCompleted,
                day.state === 'today' && styles.dayCircleToday,
                day.state === 'upcoming' && styles.dayCircleUpcoming,
                day.state === 'missed' && styles.dayCircleMissed,
                day.state === 'unscheduled' && styles.dayCircleUnscheduled,
              ]}
            >
              <Svg width={24} height={24} viewBox="0 0 24 24" accessibilityElementsHidden>
                <DayStatusGlyph state={day.state} />
              </Svg>
            </View>
            <Text testID={`goal-day-caption-${day.day}`} style={styles.dayCaption} numberOfLines={2}>
              {DAY_CAPTIONS[day.state]}
            </Text>
          </View>
        ))}
        </View>
      </>
    );
  } else if (progression === 'staged' && presentation.stagedProgress) {
    const { current, target } = presentation.stagedProgress;
    title = '成長進度';
    body = (
      <>
        <Text style={styles.progressPrimary}>已完成 {current} / {target} 階段</Text>
        <Text style={styles.progressNote}>{presentation.focusText}</Text>
        <StageNodeRow current={current} target={target} />
        <Text style={styles.progressNote}>{presentation.weekSummary}</Text>
      </>
    );
  } else if (progression === 'accumulation' && presentation.accumulationProgress) {
    const { current, target, unit } = presentation.accumulationProgress;
    const ratio = target > 0 ? Math.min(current / target, 1) : 0;
    title = '成長進度';
    body = (
      <>
        <Text style={styles.progressPrimary}>
          {current} / {target}{unit ? ` ${unit}` : ''}
        </Text>
        <View style={styles.ratioTrack}>
          <View style={[styles.ratioFill, { width: `${Math.round(ratio * 100)}%` as `${number}%` }]} />
        </View>
        <Text style={styles.progressNote}>{presentation.weekSummary}</Text>
      </>
    );
  } else {
    title = '成長進度';
    body = <Text style={styles.progressNote}>還沒安排這種進度</Text>;
  }

  return (
    <View>
      <SectionHeading icon="calendar" title={title} />
      <View testID="goal-week" style={styles.card}>
        {body}
      </View>
    </View>
  );
}

function DayStatusGlyph({ state }: { state: GoalDayStatus['state'] }) {
  if (state === 'completed') {
    return <DetailIcon name="check" size={18} color={Colors.bgSurface} />;
  }
  if (state === 'today') {
    return <Circle cx={12} cy={12} r={3.2} fill={Colors.leaf600} />;
  }
  if (state === 'missed') {
    return <Circle cx={12} cy={12} r={3} fill={Colors.fruit700} />;
  }
  if (state === 'unscheduled') {
    return (
      <Line x1={8} y1={12} x2={16} y2={12} stroke={Colors.ink300} strokeWidth={2} strokeLinecap="round" />
    );
  }
  return (
    <>
      <Circle cx={9} cy={12} r={1.2} fill={Colors.ink300} />
      <Circle cx={12} cy={12} r={1.2} fill={Colors.ink300} />
      <Circle cx={15} cy={12} r={1.2} fill={Colors.ink300} />
    </>
  );
}

// ── Next Stop（§14：只有真實 checkpoint 才 render）───────────────────────

function NextStopCard({ presentation }: { presentation: GoalPresentation }) {
  // staged 的 milestones 就是 level_definitions 逐階段列出來的——跟 Progress
  // 卡的 StageNodeRow／focusText 讀的是同一份資料。這裡再顯示一次「下一
  // 站：雙手合奏」只是把 Progress 已經講過的話重講一次，不是額外的
  // checkpoint（Visual Integration Spec §19）。除非之後有真的存在於
  // level_definitions 之外的 checkpoint，否則 staged 不顯示這一區。
  if (presentation.progression === 'staged') return null;

  // 「已累積 X」這種摘要節點不是真的 checkpoint（見 buildChallengeMilestones），
  // 且它永遠是 completed —— 用 status !== 'completed' 天然把它濾掉，
  // 不需要另外對 id 白名單。
  const next = presentation.milestones.find((milestone) => milestone.status === 'next')
    ?? presentation.milestones.find((milestone) => milestone.status === 'planned');
  if (!next) return null;

  return (
    <View>
      <SectionHeading icon="milestone" title="這段路上的下一站" />
      <View testID="goal-next-stop" style={[styles.card, styles.nextStopCard]}>
        <View style={styles.nextStopIcon}>
          <DetailIcon name="milestone" color={Colors.bgSurface} />
        </View>
        <View style={styles.nextStopCopy}>
          <View style={styles.nextStopCaptionPill}>
            <Text style={styles.nextStopCaption}>接下來的一站</Text>
          </View>
          <Text style={styles.nextStopTitle}>{next.title}</Text>
          <Text style={styles.nextStopNote}>到這裡時，可以再一起看看。</Text>
        </View>
        {next.coin !== null ? (
          <View style={styles.rewardBadge}>
            <Text style={styles.rewardBadgeText}>+{next.coin}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ── 說好的回饋（§15：輕量 supporting info，不是價目表）────────────────────

function AgreedRewardNote({ presentation }: { presentation: GoalPresentation }) {
  if (presentation.legacyReward || !presentation.agreedReward) return null;
  return (
    <View testID="goal-agreed-reward" style={styles.rewardNote} accessible>
      <DetailIcon name="sprout" size={15} color={Colors.leaf700} />
      <Text style={styles.rewardNoteText}>
        說好的回饋　{presentation.agreedReward.label}
      </Text>
    </View>
  );
}

// ── Together Review（§16：接真實現有能力）─────────────────────────────────

function TogetherReviewCard({
  presentation,
  onOpenReview,
  pendingTimeAdjustmentNotice,
}: {
  presentation: GoalPresentation;
  onOpenReview?: Props['onOpenReview'];
  pendingTimeAdjustmentNotice?: string | null;
}) {
  const content = (
    <>
      <View style={styles.reviewIcon}>
        <DetailIcon name="conversation" color={Colors.leaf700} />
      </View>
      <View style={styles.reviewCopy}>
        <Text style={styles.reviewPrompt}>{presentation.reviewPrompt}</Text>
      </View>
      {onOpenReview ? (
        <View style={styles.reviewActionPill}>
          <Text style={styles.reviewAction}>一起看看 →</Text>
        </View>
      ) : (
        <Text style={styles.reviewActionPlain}>週末可以和家人一起聊聊</Text>
      )}
    </>
  );

  return (
    <View>
      <SectionHeading icon="conversation" title={presentation.reviewTitle} />
      {onOpenReview ? (
        <TouchableOpacity
          testID="goal-review"
          style={[styles.card, styles.reviewCard]}
          onPress={onOpenReview}
          accessibilityRole="button"
          accessibilityLabel="開始週末回顧"
          activeOpacity={0.75}
        >
          {content}
        </TouchableOpacity>
      ) : (
        <View testID="goal-review" style={[styles.card, styles.reviewCard]}>
          {content}
        </View>
      )}
      {pendingTimeAdjustmentNotice ? (
        <Text testID="pending-time-adjustment" style={styles.pendingNoticeText}>
          {pendingTimeAdjustmentNotice}
        </Text>
      ) : null}
    </View>
  );
}

// ── 最近紀錄（§17：從 More 點進去的其中一項；緊貼在 More 之前，
//    保留孩子更正過去某一天紀錄的能力，不是拿掉再假裝路徑還在）─────────────

function RecentRecords({
  records,
  onOpenRecord,
}: {
  records: GoalRecentRecord[];
  onOpenRecord?: Props['onOpenRecord'];
}) {
  const visibleRecords = records.slice(0, 3);
  if (visibleRecords.length === 0) return null;

  return (
    <View>
      <SectionHeading icon="document" title="最近紀錄" />
      <View style={styles.recordList}>
        {visibleRecords.map((record, index) => (
          <TouchableOpacity
            key={record.id}
            style={[
              styles.recordRow,
              index < visibleRecords.length - 1 && styles.recordRowDivider,
            ]}
            onPress={() => onOpenRecord?.(record.id)}
            disabled={!onOpenRecord}
            accessibilityRole={onOpenRecord ? 'button' : undefined}
            accessibilityLabel={`查看${record.dateLabel}的紀錄`}
            activeOpacity={0.72}
          >
            <View style={styles.recordDateWrap}>
              <Text style={styles.recordDate}>{record.dateLabel}</Text>
            </View>
            <View style={styles.recordCopy}>
              <Text style={styles.recordDetail}>{record.detail}</Text>
              {record.timeWindowLabel ? (
                <Text style={styles.recordTime}>{record.timeWindowLabel}</Text>
              ) : null}
            </View>
            {onOpenRecord ? (
              <DetailIcon name="chevron" size={18} color={Colors.ink300} />
            ) : null}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── More（§17：安靜收斂，不一進頁全部攤開）─────────────────────────────────

function MoreCard({ onOpenMore }: { onOpenMore?: Props['onOpenMore'] }) {
  const content = (
    <>
      <View style={styles.detailsIcon}>
        <DetailIcon name="document" color={Colors.fgMuted} />
      </View>
      <Text style={styles.detailsTitle}>更多紀錄與計畫</Text>
      {onOpenMore ? <DetailIcon name="chevron" size={20} color={Colors.ink300} /> : null}
    </>
  );

  return onOpenMore ? (
    <TouchableOpacity
      testID="goal-more"
      style={styles.detailsRow}
      onPress={onOpenMore}
      accessibilityRole="button"
      accessibilityLabel="更多紀錄與計畫"
      activeOpacity={0.72}
    >
      {content}
    </TouchableOpacity>
  ) : (
    <View testID="goal-more" style={styles.detailsRow}>
      {content}
    </View>
  );
}

// ── Shell ────────────────────────────────────────────────────────────

export default function LongTermGoalDetailView({
  presentation,
  isCompletedToday,
  checking,
  onComplete,
  onSelectTimeWindow,
  onOpenRecord,
  onOpenReview,
  onOpenMore,
  pendingTimeAdjustmentNotice = null,
}: Props) {
  return (
    <ScrollView
      testID="long-term-detail-scroll"
      style={[styles.scroll, webMouseDraggableScroll]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <GoalHero presentation={presentation} />
      <TodayStepCard
        presentation={presentation}
        isCompletedToday={isCompletedToday}
        checking={checking}
        onComplete={onComplete}
        onSelectTimeWindow={onSelectTimeWindow}
        onOpenRecord={onOpenRecord}
      />
      <ProgressCard presentation={presentation} />
      <AgreedRewardNote presentation={presentation} />
      <NextStopCard presentation={presentation} />
      <TogetherReviewCard
        presentation={presentation}
        onOpenReview={onOpenReview}
        pendingTimeAdjustmentNotice={pendingTimeAdjustmentNotice}
      />
      <RecentRecords records={presentation.recentRecords} onOpenRecord={onOpenRecord} />
      <MoreCard onOpenMore={onOpenMore} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 14, paddingBottom: 44, gap: 14 },

  // Hero
  hero: {
    minHeight: 214,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.grass.nightHillFrontTop,
  },
  treehouse: {
    position: 'absolute',
    right: -14,
    bottom: -14,
    width: 168,
    height: 168,
  },
  heroCopy: {
    minHeight: 212,
    paddingTop: 18,
    paddingRight: 130,
    paddingBottom: 16,
    paddingLeft: 18,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 24,
    maxWidth: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.grass.nightHillBackTop,
    backgroundColor: Colors.grass.nightHillMidTop,
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  categoryText: {
    color: Colors.gold100,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
  },
  heroPosition: {
    marginTop: 12,
    color: Colors.bgSurface,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
  },
  heroNote: {
    marginTop: 5,
    color: Colors.cream100,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  heroTotal: {
    marginTop: 5,
    color: Colors.gold100,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },

  // Section heading
  sectionHeading: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
    marginBottom: 6,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeadingHint: {
    color: Colors.fgMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  sectionHeadingText: {
    flex: 1,
    color: Colors.fgPrimary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
  },

  card: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    backgroundColor: Colors.bgSurface,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 1,
  },

  // Today
  todayAnatomy: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.leaf200,
    backgroundColor: Colors.leaf100,
  },
  actionCopy: { flex: 1, minWidth: 0 },
  mascotSlot: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    color: Colors.fgPrimary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '900',
  },
  scheduleRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  scheduleLabel: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  scheduleText: {
    flexShrink: 1,
    color: Colors.fgMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  inlineAction: {
    minWidth: 70,
    minHeight: 44,
    paddingHorizontal: 6,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  inlineActionText: {
    color: Colors.leaf700,
    fontSize: 11,
    fontWeight: '900',
  },
  timeOptions: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  timeOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.borderMedium,
    backgroundColor: Colors.cream50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeOptionSelected: {
    borderColor: Colors.leaf400,
    backgroundColor: Colors.leaf50,
  },
  timeOptionText: {
    color: Colors.fgSecondary,
    fontSize: 12,
    fontWeight: '900',
  },
  timeOptionTextSelected: { color: Colors.leaf700 },
  completeButton: {
    minHeight: 50,
    marginTop: 12,
    borderRadius: 25,
    backgroundColor: Colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    shadowColor: Colors.shadowLeaf,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 2,
  },
  buttonBusy: { opacity: 0.65 },
  completeButtonText: {
    color: Colors.bgSurface,
    fontSize: 14,
    fontWeight: '900',
  },
  completionError: {
    marginTop: 7,
    color: Colors.error,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  completedState: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.leaf100,
    backgroundColor: Colors.leaf50,
    paddingHorizontal: 11,
    paddingTop: 10,
    paddingBottom: 7,
  },
  completedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  completedCheck: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
  },
  completedCopy: { flex: 1, minWidth: 0 },
  completedTitle: {
    color: Colors.leaf700,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
  },
  completedMeta: {
    marginTop: 1,
    color: Colors.fgMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  completedActions: {
    minHeight: 44,
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  secondaryAction: {
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    color: Colors.leaf700,
    fontSize: 11,
    fontWeight: '900',
  },
  restNote: {
    minHeight: 44,
    marginTop: 10,
    borderRadius: 16,
    backgroundColor: Colors.cream50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  restNoteText: {
    color: Colors.fgMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },

  // Progress
  progressPrimary: {
    color: Colors.fgPrimary,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '900',
  },
  progressNote: {
    marginTop: 3,
    color: Colors.fgMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  leafRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  // flex:1 讓 connector 平分剩下的寬度——1-4 次節點大、間距自然拉開；
  // 5-7 次節點縮小，同一條寬度切成更多段，間距自然跟著縮短（§11）。
  leafConnector: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 3,
    backgroundColor: Colors.leaf200,
  },
  leafConnectorFilled: {
    backgroundColor: Colors.leaf500,
  },
  leafNode: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: Colors.leaf200,
    backgroundColor: Colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leafNodeCompact: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: Colors.leaf200,
    backgroundColor: Colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leafNodeFilled: {
    borderColor: Colors.leaf600,
    backgroundColor: Colors.leaf600,
  },
  stageNode: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: Colors.ink100,
    backgroundColor: Colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageNodeCompleted: {
    borderColor: Colors.success,
    backgroundColor: Colors.success,
  },
  stageNodeCurrent: {
    borderWidth: 2.5,
    borderColor: Colors.gold500,
    backgroundColor: Colors.gold100,
  },
  ratioTrack: {
    marginTop: 10,
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: Colors.leaf50,
  },
  ratioFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.leaf500,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 2,
  },
  weekRowSpaced: { marginTop: 10 },
  dayCell: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4 },
  dayLabel: {
    color: Colors.fgSecondary,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleCompleted: { borderColor: Colors.success, backgroundColor: Colors.success },
  dayCircleToday: {
    borderWidth: 2,
    borderColor: Colors.leaf500,
    backgroundColor: Colors.leaf50,
  },
  dayCircleUpcoming: {
    borderStyle: 'dashed',
    borderColor: Colors.ink300,
    backgroundColor: Colors.bgSurface,
  },
  dayCircleMissed: { borderColor: Colors.fruit300, backgroundColor: Colors.fruit100 },
  dayCircleUnscheduled: { borderColor: Colors.ink100, backgroundColor: Colors.cream50 },
  dayCaption: {
    minHeight: 28,
    color: Colors.fgMuted,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },

  // Next Stop
  nextStopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nextStopIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.leaf500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextStopCopy: { flex: 1, minWidth: 0 },
  nextStopCaptionPill: {
    alignSelf: 'flex-start',
    borderRadius: 9,
    backgroundColor: Colors.fruit100,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  nextStopCaption: {
    color: Colors.fruit700,
    fontSize: 11,
    fontWeight: '900',
  },
  nextStopTitle: {
    marginTop: 2,
    color: Colors.fgPrimary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  nextStopNote: {
    marginTop: 2,
    color: Colors.fgMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  rewardBadge: {
    minHeight: 26,
    borderRadius: 13,
    backgroundColor: Colors.gold100,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardBadgeText: {
    color: Colors.gold700,
    fontSize: 12,
    fontWeight: '900',
  },

  // Agreed reward note
  rewardNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  rewardNoteText: {
    color: Colors.fgSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },

  // Together Review
  reviewCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderColor: Colors.cream300,
    backgroundColor: Colors.cream50,
  },
  reviewIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.leaf100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewCopy: { flex: 1, minWidth: 0 },
  reviewPrompt: {
    color: Colors.fgSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  reviewActionPill: {
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: Colors.leaf100,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewAction: {
    color: Colors.leaf700,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  reviewActionPlain: {
    maxWidth: 96,
    color: Colors.fgMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  pendingNoticeText: {
    marginTop: 8,
    paddingHorizontal: 2,
    color: Colors.fgMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },

  // More
  recordList: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.hairline,
  },
  recordRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 2,
    paddingVertical: 7,
  },
  recordRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
  },
  recordDateWrap: { width: 58 },
  recordDate: {
    color: Colors.fgSecondary,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '900',
  },
  recordCopy: { flex: 1, minWidth: 0 },
  recordDetail: {
    color: Colors.fgPrimary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  recordTime: {
    marginTop: 2,
    color: Colors.fgMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  detailsRow: {
    minHeight: 60,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.bgSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  detailsIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsTitle: {
    flex: 1,
    color: Colors.fgPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
});
