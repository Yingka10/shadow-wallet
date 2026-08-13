import React, { useMemo, useRef, useState } from 'react';
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
  GoalMilestone,
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

function minutesFromAction(action: string): string | null {
  return action.match(/(\d+)\s*分鐘/)?.[1] ?? null;
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
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        accessibilityElementsHidden
      >
        <Path d="M12 20V9" {...common} />
        <Path d="M12 13C8 13 5 11 5 7c4 0 7 2 7 6Z" {...common} />
        <Path d="M12 10c0-4 3-6 7-6 0 4-3 6-7 6Z" {...common} />
        <Path d="M6 20h12" {...common} />
      </Svg>
    );
  }

  if (name === 'book') {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        accessibilityElementsHidden
      >
        <Path d="M4 5.5c3.5-.7 6.2.2 8 2.1v11c-1.8-1.9-4.5-2.8-8-2.1v-11Z" {...common} />
        <Path d="M20 5.5c-3.5-.7-6.2.2-8 2.1v11c1.8-1.9 4.5-2.8 8-2.1v-11Z" {...common} />
      </Svg>
    );
  }

  if (name === 'calendar') {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        accessibilityElementsHidden
      >
        <Rect x={4} y={5.5} width={16} height={14} rx={2} {...common} />
        <Path d="M8 3.5v4M16 3.5v4M4 10h16" {...common} />
        <Circle cx={9} cy={14} r={1} fill={color} />
        <Circle cx={15} cy={14} r={1} fill={color} />
      </Svg>
    );
  }

  if (name === 'milestone') {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        accessibilityElementsHidden
      >
        <Path d="M12 3.5 14.5 8l5 .8-3.6 3.6.8 5-4.7-2.3-4.7 2.3.8-5-3.6-3.6 5-.8L12 3.5Z" {...common} />
      </Svg>
    );
  }

  if (name === 'conversation') {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        accessibilityElementsHidden
      >
        <Path d="M5 5h14v10H9l-4 4V5Z" {...common} />
        <Path d="M8.5 9h7M8.5 12h4.5" {...common} />
      </Svg>
    );
  }

  if (name === 'document') {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        accessibilityElementsHidden
      >
        <Path d="M6 3.5h8l4 4v13H6v-17Z" {...common} />
        <Path d="M14 3.5v4h4M9 12h6M9 16h6" {...common} />
      </Svg>
    );
  }

  if (name === 'check') {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        accessibilityElementsHidden
      >
        <Path d="m5.5 12.5 4 4 9-9" {...common} />
      </Svg>
    );
  }

  if (name === 'chevron') {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        accessibilityElementsHidden
      >
        <Path d="m9 5 7 7-7 7" {...common} />
      </Svg>
    );
  }

  if (name === 'clock') {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        accessibilityElementsHidden
      >
        <Circle cx={12} cy={12} r={8.5} {...common} />
        <Path d="M12 7.5V12l3 2" {...common} />
      </Svg>
    );
  }

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
    >
      <Circle cx={12} cy={12} r={9} {...common} />
      <Path d="M12 10.5v6M12 7.3v.2" {...common} />
    </Svg>
  );
}

function SectionHeading({
  icon,
  title,
}: {
  icon: IconName;
  title: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <DetailIcon name={icon} size={20} color={Colors.leaf700} />
      <Text style={styles.sectionHeadingText}>{title}</Text>
    </View>
  );
}

function GoalHero({ presentation }: { presentation: GoalPresentation }) {
  return (
    <View
      testID="goal-hero"
      style={styles.hero}
    >
      <Svg
        style={StyleSheet.absoluteFill}
        viewBox="0 0 380 156"
        preserveAspectRatio="none"
        accessibilityElementsHidden
      >
        <Path d="M0 0H380V156H0z" fill={Colors.grass.nightHillBackBottom} />
        <Path
          d="M0 98c80-28 145-20 210 5 70 27 121 10 170-13v66H0V98Z"
          fill={Colors.grass.nightHillMidBottom}
        />
        <Path
          d="M0 125c81-22 151-10 219 12 68 22 117 5 161-12v31H0v-31Z"
          fill={Colors.grass.nightHillFrontBottom}
        />
        <Circle cx={34} cy={29} r={15} fill={Colors.gold100} opacity={0.2} />
        <Path
          d="M39 16c-8 4-11 12-8 20 3 8 11 12 19 9-6-2-10-8-10-14 0-6 3-11 8-14-3-2-6-2-9-1Z"
          fill={Colors.gold300}
        />
        <Circle cx={115} cy={21} r={1.7} fill={Colors.gold300} />
        <Circle cx={158} cy={38} r={1.4} fill={Colors.gold300} />
        <Circle cx={337} cy={23} r={1.8} fill={Colors.gold300} />
      </Svg>

      <Image
        source={require('../../../assets/images/child/treehouse-night.png')}
        style={styles.treehouse}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />

      <View style={styles.heroCopy}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText} numberOfLines={1}>
            {presentation.categoryLabel}
          </Text>
        </View>
        <Text style={styles.planWeekLabel} numberOfLines={2}>
          {presentation.planWeekLabel}
        </Text>
        <View
          style={styles.progressTrack}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="整體計畫進度"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: presentation.overallPercent,
          }}
        >
          <View
            testID="goal-progress-fill"
            style={[
              styles.progressFill,
              { width: `${presentation.overallPercent}%` as `${number}%` },
            ]}
          />
        </View>
        <Text style={styles.focusText}>
          {presentation.focusText}
        </Text>
      </View>
    </View>
  );
}

type TodayStepCardProps = Pick<
  Props,
  | 'presentation'
  | 'isCompletedToday'
  | 'checking'
  | 'onComplete'
  | 'onSelectTimeWindow'
  | 'onOpenRecord'
>;

function isFlexibleReadingRhythm(presentation: GoalPresentation): boolean {
  return presentation.goalKind === 'reading_habit'
    && presentation.weekTarget > 0
    && !presentation.weekDays.some((day) => day.isScheduled);
}

function TodayWeekRhythm({
  completed,
  target,
}: {
  completed: number;
  target: number;
}) {
  const remaining = Math.max(target - completed, 0);

  return (
    <View style={styles.todayWeekRhythm}>
      <Text style={styles.todayWeekRhythmLabel}>
        本週 {completed} / {target}
      </Text>
      <Text style={styles.todayWeekRhythmCopy}>
        {remaining > 0
          ? `再 ${remaining} 次，就完成這週的節奏。`
          : '這週的節奏完成了。'}
      </Text>
    </View>
  );
}

function CompletedTodayState({
  presentation,
  completion,
  onOpenRecord,
}: {
  presentation: GoalPresentation;
  completion?: GoalRecentRecord;
  onOpenRecord?: Props['onOpenRecord'];
}) {
  const minutes = minutesFromAction(presentation.todayAction);
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
            <Text style={styles.completedMeta}>
              {completion.timeWindowLabel}記錄
            </Text>
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

function TodayStepCard({
  presentation,
  isCompletedToday,
  checking,
  onComplete,
  onSelectTimeWindow,
  onOpenRecord,
}: TodayStepCardProps) {
  const [showTimeOptions, setShowTimeOptions] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const completionPendingRef = useRef(false);
  const completed = isCompletedToday;
  const busy = checking || completing;
  const isReadingPlan = presentation.goalKind === 'reading_habit';
  const showReadingTimeControls =
    isReadingPlan && presentation.canCompleteToday;
  const showTodayWeekRhythm =
    presentation.planState === 'active'
    && isFlexibleReadingRhythm(presentation);
  const todayCompletion = isCompletedToday
    ? presentation.recentRecords[0]
    : undefined;

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

  const explanationLabel = showExplanation
    ? '收合小步驟說明'
    : '展開小步驟說明';

  return (
    <View>
      <SectionHeading icon="sprout" title={presentation.todayTitle} />
      <View testID="goal-today" style={[styles.card, styles.todayCard]}>
        <View style={styles.actionHead}>
          <View style={styles.actionIcon}>
            <DetailIcon
              name={isReadingPlan ? 'book' : 'sprout'}
              color={Colors.leaf700}
            />
          </View>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>{presentation.todayAction}</Text>
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
                      presentation.preferredTimeWindow
                        ? '調整今天的預計時段'
                        : '選擇今天的預計時段'
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
          </View>
        </View>

        <TouchableOpacity
          style={styles.explanationToggle}
          accessibilityRole="button"
          accessibilityLabel={explanationLabel}
          accessibilityState={{ expanded: showExplanation }}
          onPress={() => setShowExplanation((visible) => !visible)}
          activeOpacity={0.72}
        >
          <View style={styles.explanationToggleText}>
            <DetailIcon name="info" size={17} color={Colors.fgMuted} />
            <Text style={styles.explanationLabel}>小步驟說明</Text>
          </View>
          <View
            style={[
              styles.explanationChevron,
              showExplanation && styles.explanationChevronExpanded,
            ]}
          >
            <DetailIcon name="chevron" size={18} color={Colors.fgMuted} />
          </View>
        </TouchableOpacity>

        {showExplanation ? (
          <View style={styles.explanationBody}>
            <Text style={styles.explanationText}>{presentation.focusText}</Text>
            <Text style={styles.explanationHint}>
              {isReadingPlan
                ? '不知道選哪一本時，可以先從最想翻開的那一本開始。'
                : '先完成今天最小的一步，覺得不合適時再和家人一起調整。'}
            </Text>
          </View>
        ) : null}

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
                  style={[
                    styles.timeOption,
                    selected && styles.timeOptionSelected,
                  ]}
                  onPress={() => handleTimeSelect(value)}
                  accessibilityRole="button"
                  accessibilityLabel={`改成${label}`}
                  accessibilityState={{ selected }}
                  activeOpacity={0.72}
                >
                  <Text
                    style={[
                      styles.timeOptionText,
                      selected && styles.timeOptionTextSelected,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
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
            accessibilityLabel={
              isReadingPlan
                ? '記錄今天的閱讀'
                : '記下今天的完成'
            }
            accessibilityState={{ disabled: busy }}
            activeOpacity={0.78}
          >
            {busy ? (
              <ActivityIndicator
                testID="completion-loading"
                size="small"
                color={Colors.bgSurface}
              />
            ) : (
              <>
                <DetailIcon name="check" size={19} color={Colors.bgSurface} />
                <Text style={styles.completeButtonText}>
                  {isReadingPlan
                    ? '記錄今天的閱讀'
                    : '記下今天的完成'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.restNote}>
            <Text style={styles.restNoteText}>
              {presentation.todayStatusText
                ?? (presentation.todayTitle === '今天是休息日'
                  ? '今天沒有安排，照自己的節奏休息就好。'
                  : '今天先照自己的節奏前進，需要時再和家人一起確認。')}
            </Text>
          </View>
        )}
        {completionError ? (
          <Text accessibilityRole="alert" style={styles.completionError}>
            {completionError}
          </Text>
        ) : null}
        {showTodayWeekRhythm ? (
          <TodayWeekRhythm
            completed={presentation.weekCompleted}
            target={presentation.weekTarget}
          />
        ) : null}
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
      <Line
        x1={8}
        y1={12}
        x2={16}
        y2={12}
        stroke={Colors.ink300}
        strokeWidth={2}
        strokeLinecap="round"
      />
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

function WeekProgressCard({
  presentation,
}: {
  presentation: GoalPresentation;
}) {
  if (isFlexibleReadingRhythm(presentation)) return null;

  const showsDailySchedule =
    presentation.planState === 'active'
    && presentation.weekTarget > 0
    && presentation.weekDays.some((day) => day.isScheduled)
    && (
      presentation.goalKind === 'reading_habit'
      || presentation.goalKind === 'habit'
      || presentation.goalKind === 'family'
    );
  const showsOverallProgress =
    presentation.planState === 'active'
    && (
      presentation.goalKind === 'skill'
      || presentation.goalKind === 'challenge'
    );
  const compactPrimaryText = showsOverallProgress
    ? presentation.overallLabel
    : presentation.todayStatusText ?? presentation.weekProgressLabel;

  return (
    <View>
      <SectionHeading
        icon="calendar"
        title={showsDailySchedule ? '本週安排' : '本週進度'}
      />
      <View testID="goal-week" style={styles.card}>
        {showsDailySchedule ? (
          <View style={styles.weekRow}>
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
                  <Svg
                    width={24}
                    height={24}
                    viewBox="0 0 24 24"
                    accessibilityElementsHidden
                  >
                    <DayStatusGlyph state={day.state} />
                  </Svg>
                </View>
                <Text
                  testID={`goal-day-caption-${day.day}`}
                  style={styles.dayCaption}
                  numberOfLines={2}
                >
                  {DAY_CAPTIONS[day.state]}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.compactWeekProgress}>
            <Text style={styles.compactWeekLabel}>
              {compactPrimaryText}
            </Text>
            {showsOverallProgress ? (
              <Text style={styles.compactWeekMeta}>
                {presentation.weekProgressLabel}
              </Text>
            ) : null}
          </View>
        )}
        <View style={styles.weekInsight}>
          <DetailIcon name="sprout" size={16} color={Colors.leaf700} />
          <Text style={styles.weekInsightText}>{presentation.weekSummary}</Text>
        </View>
      </View>
    </View>
  );
}

function milestoneStatusLabel(milestone: GoalMilestone): string {
  if (milestone.status === 'completed') return '已完成';
  if (milestone.status === 'next') return '下一個里程碑';
  if (milestone.status === 'planned') return '計畫節點';
  return '尚未到';
}

function PlanNotice({ notice }: { notice: string }) {
  return (
    <View
      style={styles.planNotice}
      accessible
      accessibilityLabel={`計畫提醒：${notice}`}
    >
      <DetailIcon name="info" size={17} color={Colors.gold700} />
      <Text style={styles.planNoticeText}>{notice}</Text>
    </View>
  );
}

function MilestoneTimeline({
  milestones,
}: {
  milestones: GoalMilestone[];
}) {
  return (
    <View>
      <SectionHeading icon="milestone" title="成長里程碑" />
      <View testID="goal-rewards" style={styles.timeline}>
        {milestones.map((milestone, index) => (
          <View key={milestone.id} style={styles.timelineRow}>
            <View style={styles.timelineRail}>
              <View
                style={[
                  styles.timelineNode,
                  milestone.status === 'completed' && styles.timelineNodeCompleted,
                  milestone.status === 'next' && styles.timelineNodeNext,
                ]}
              >
                {milestone.status === 'completed' ? (
                  <DetailIcon name="check" size={15} color={Colors.bgSurface} />
                ) : (
                  <DetailIcon
                    name="milestone"
                    size={14}
                    color={
                      milestone.status === 'next'
                        ? Colors.gold700
                        : Colors.ink300
                    }
                  />
                )}
              </View>
              {index < milestones.length - 1 ? (
                <View style={styles.timelineLine} />
              ) : null}
            </View>
            <View
              style={[
                styles.timelineContent,
                index < milestones.length - 1 && styles.timelineContentDivider,
              ]}
            >
              <View style={styles.timelineTitleRow}>
                <Text style={styles.timelineTitle}>{milestone.title}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    milestone.status === 'completed' && styles.statusBadgeCompleted,
                    milestone.status === 'next' && styles.statusBadgeNext,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      milestone.status === 'completed' && styles.statusBadgeTextCompleted,
                      milestone.status === 'next' && styles.statusBadgeTextNext,
                    ]}
                  >
                    {milestoneStatusLabel(milestone)}
                  </Text>
                </View>
              </View>
              {milestone.detail ? (
                <Text style={styles.timelineDetail}>{milestone.detail}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function ReviewCard({
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
        <Text style={styles.reviewAction}>
          {onOpenReview ? '開始週末回顧' : '週末可以和家人一起聊聊'}
        </Text>
      </View>
      {onOpenReview ? (
        <DetailIcon name="chevron" size={20} color={Colors.gold700} />
      ) : null}
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

function PlanDetailsEntry({
  presentation,
  onOpenDetails,
}: {
  presentation: GoalPresentation;
  onOpenDetails?: Props['onOpenDetails'];
}) {
  const content = (
    <>
      <View style={styles.detailsIcon}>
        <DetailIcon name="document" color={Colors.fgMuted} />
      </View>
      <View style={styles.detailsCopy}>
        <Text style={styles.detailsTitle}>
          {onOpenDetails ? '查看計畫安排' : '計畫安排'}
        </Text>
        <Text style={styles.detailsMeta} numberOfLines={2}>
          {presentation.planPeriodLabel} · {presentation.completionConditionLabel}
        </Text>
      </View>
      {onOpenDetails ? (
        <DetailIcon name="chevron" size={20} color={Colors.ink300} />
      ) : null}
    </>
  );

  return (
    <View>
      <SectionHeading icon="document" title="計畫詳情" />
      {onOpenDetails ? (
        <TouchableOpacity
          testID="goal-details"
          style={styles.detailsRow}
          onPress={onOpenDetails}
          accessibilityRole="button"
          accessibilityLabel="查看計畫詳情"
          activeOpacity={0.72}
        >
          {content}
        </TouchableOpacity>
      ) : (
        <View testID="goal-details" style={styles.detailsRow}>
          {content}
        </View>
      )}
    </View>
  );
}

export default function LongTermGoalDetailView({
  presentation,
  isCompletedToday,
  checking,
  onComplete,
  onSelectTimeWindow,
  onOpenRecord,
  onOpenReview,
  onOpenDetails,
  pendingTimeAdjustmentNotice = null,
}: Props) {
  const [showSupportingDetails, setShowSupportingDetails] = useState(false);
  const recentRecords = useMemo(
    () => presentation.recentRecords.slice(0, 3),
    [presentation.recentRecords],
  );
  const visiblePlanNotice =
    presentation.planState === 'active'
    || presentation.planState === 'unplanned'
      ? presentation.planNotice
      : null;

  return (
    <ScrollView
      testID="long-term-detail-scroll"
      style={[styles.scroll, webMouseDraggableScroll]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <GoalHero presentation={presentation} />
      {visiblePlanNotice ? (
        <PlanNotice notice={visiblePlanNotice} />
      ) : null}
      <TodayStepCard
        presentation={presentation}
        isCompletedToday={isCompletedToday}
        checking={checking}
        onComplete={onComplete}
        onSelectTimeWindow={onSelectTimeWindow}
        onOpenRecord={onOpenRecord}
      />
      <WeekProgressCard presentation={presentation} />
      {presentation.milestones.length > 0 ? (
        <MilestoneTimeline milestones={presentation.milestones} />
      ) : null}
      <ReviewCard
        presentation={presentation}
        onOpenReview={onOpenReview}
        pendingTimeAdjustmentNotice={pendingTimeAdjustmentNotice}
      />
      <TouchableOpacity
        style={styles.supportingDetailsToggle}
        accessibilityRole="button"
        accessibilityLabel={
          showSupportingDetails
            ? '收合更多紀錄與計畫'
            : '展開更多紀錄與計畫'
        }
        accessibilityState={{ expanded: showSupportingDetails }}
        onPress={() => setShowSupportingDetails((visible) => !visible)}
        activeOpacity={0.72}
      >
        <Text style={styles.supportingDetailsLabel}>更多紀錄與計畫</Text>
        <View
          style={[
            styles.supportingDetailsChevron,
            showSupportingDetails && styles.supportingDetailsChevronExpanded,
          ]}
        >
          <DetailIcon name="chevron" size={18} color={Colors.fgMuted} />
        </View>
      </TouchableOpacity>
      {showSupportingDetails ? (
        <>
          <RecentRecords
            records={recentRecords}
            onOpenRecord={onOpenRecord}
          />
          <PlanDetailsEntry
            presentation={presentation}
            onOpenDetails={onOpenDetails}
          />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 14,
    paddingBottom: 44,
    gap: 14,
  },
  hero: {
    minHeight: 156,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.grass.nightHillBackTop,
  },
  treehouse: {
    position: 'absolute',
    right: -8,
    bottom: -10,
    width: 116,
    height: 116,
  },
  heroCopy: {
    minHeight: 154,
    paddingTop: 12,
    paddingRight: 108,
    paddingBottom: 10,
    paddingLeft: 14,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    minHeight: 22,
    maxWidth: '100%',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.grass.nightHillBackTop,
    backgroundColor: Colors.grass.nightHillMidTop,
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  categoryText: {
    color: Colors.gold100,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
  },
  planWeekLabel: {
    marginTop: 5,
    color: Colors.bgSurface,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    marginTop: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: Colors.grass.nightHillBackTop,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.leaf300,
  },
  focusText: {
    marginTop: 6,
    color: Colors.cream100,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  planNotice: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.gold300,
    backgroundColor: Colors.gold100,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  planNoticeText: {
    flex: 1,
    color: Colors.fgSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  sectionHeading: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
    marginBottom: 6,
  },
  sectionHeadingText: {
    flex: 1,
    color: Colors.fgPrimary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
  },
  card: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    backgroundColor: Colors.bgSurface,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  todayCard: {
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.leaf100,
    shadowOpacity: 0.08,
    elevation: 2,
  },
  actionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.leaf100,
    backgroundColor: Colors.leaf50,
  },
  actionCopy: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    color: Colors.fgPrimary,
    fontSize: 22,
    lineHeight: 30,
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
  explanationToggle: {
    minHeight: 44,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  explanationToggleText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  explanationLabel: {
    color: Colors.fgSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  explanationChevron: {
    transform: [{ rotate: '90deg' }],
  },
  explanationChevronExpanded: {
    transform: [{ rotate: '-90deg' }],
  },
  explanationBody: {
    borderTopWidth: 1,
    borderTopColor: Colors.hairline,
    paddingTop: 9,
    paddingBottom: 3,
  },
  explanationText: {
    color: Colors.fgSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  explanationHint: {
    marginTop: 5,
    color: Colors.fgMuted,
    fontSize: 11,
    lineHeight: 17,
  },
  timeOptions: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  timeOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
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
  timeOptionTextSelected: {
    color: Colors.leaf700,
  },
  completeButton: {
    minHeight: 56,
    marginTop: 10,
    borderRadius: 8,
    backgroundColor: Colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
  },
  buttonBusy: {
    opacity: 0.65,
  },
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.leaf100,
    backgroundColor: Colors.leaf50,
    paddingHorizontal: 11,
    paddingTop: 10,
    paddingBottom: 7,
  },
  completedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  completedCheck: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
  },
  completedCopy: {
    flex: 1,
    minWidth: 0,
  },
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
    borderRadius: 8,
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
  todayWeekRhythm: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.leaf100,
    paddingTop: 11,
  },
  todayWeekRhythmLabel: {
    color: Colors.leaf700,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '900',
  },
  todayWeekRhythmCopy: {
    marginTop: 2,
    color: Colors.fgSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 2,
  },
  dayCell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
  },
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
  dayCircleCompleted: {
    borderColor: Colors.success,
    backgroundColor: Colors.success,
  },
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
  dayCircleMissed: {
    borderColor: Colors.fruit300,
    backgroundColor: Colors.fruit100,
  },
  dayCircleUnscheduled: {
    borderColor: Colors.ink100,
    backgroundColor: Colors.cream50,
  },
  dayCaption: {
    minHeight: 28,
    color: Colors.fgMuted,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  compactWeekProgress: {
    gap: 3,
  },
  compactWeekLabel: {
    color: Colors.fgPrimary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '900',
  },
  compactWeekMeta: {
    color: Colors.fgMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  weekInsight: {
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: Colors.leaf50,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  weekInsightText: {
    flex: 1,
    color: Colors.fgSecondary,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  timeline: {
    paddingHorizontal: 2,
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 62,
  },
  timelineRail: {
    width: 36,
    alignItems: 'center',
  },
  timelineNode: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.ink100,
    backgroundColor: Colors.cream50,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  timelineNodeCompleted: {
    borderColor: Colors.success,
    backgroundColor: Colors.success,
  },
  timelineNodeNext: {
    borderColor: Colors.gold500,
    backgroundColor: Colors.gold100,
  },
  timelineLine: {
    flex: 1,
    width: 1,
    backgroundColor: Colors.hairline,
  },
  timelineContent: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 6,
    paddingBottom: 12,
  },
  timelineContentDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
    marginBottom: 10,
  },
  timelineTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  timelineTitle: {
    flex: 1,
    minWidth: 0,
    color: Colors.fgPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  timelineDetail: {
    marginTop: 3,
    color: Colors.fgMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  statusBadge: {
    minHeight: 26,
    maxWidth: 112,
    borderRadius: 7,
    backgroundColor: Colors.cream100,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  statusBadgeCompleted: {
    backgroundColor: Colors.leaf50,
  },
  statusBadgeNext: {
    backgroundColor: Colors.gold100,
  },
  statusBadgeText: {
    color: Colors.fgMuted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  statusBadgeTextCompleted: {
    color: Colors.leaf700,
  },
  statusBadgeTextNext: {
    color: Colors.gold700,
  },
  reviewCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderColor: Colors.cream300,
    backgroundColor: Colors.cream50,
  },
  reviewIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.leaf50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  reviewPrompt: {
    color: Colors.fgSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  reviewAction: {
    marginTop: 4,
    color: Colors.leaf700,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  pendingNoticeText: {
    marginTop: 8,
    paddingHorizontal: 2,
    color: Colors.fgMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  supportingDetailsToggle: {
    minHeight: 48,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  supportingDetailsLabel: {
    color: Colors.fgSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  supportingDetailsChevron: {
    transform: [{ rotate: '90deg' }],
  },
  supportingDetailsChevronExpanded: {
    transform: [{ rotate: '-90deg' }],
  },
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
  recordDateWrap: {
    width: 58,
  },
  recordDate: {
    color: Colors.fgSecondary,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '900',
  },
  recordCopy: {
    flex: 1,
    minWidth: 0,
  },
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
    minHeight: 64,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 2,
    paddingVertical: 8,
  },
  detailsIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: Colors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsCopy: {
    flex: 1,
    minWidth: 0,
  },
  detailsTitle: {
    color: Colors.fgPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  detailsMeta: {
    marginTop: 2,
    color: Colors.fgMuted,
    fontSize: 11,
    lineHeight: 16,
  },
});
