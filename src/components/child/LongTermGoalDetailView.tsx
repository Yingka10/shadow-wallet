import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Colors } from '../../constants/colors';
import { webMouseDraggableScroll } from '../../constants/webStyles';
import type { PreferredTimeWindow } from '../../types/database';
import type {
  GoalDayStatus,
  GoalPresentation,
} from '../../screens/child/longTermGoalPresentation';

type Props = {
  presentation: GoalPresentation;
  isCompletedToday: boolean;
  checking: boolean;
  onComplete: () => void | boolean | Promise<void | boolean>;
  onSelectTimeWindow: (window: PreferredTimeWindow) => void;
};

function formatTimeWindow(window: PreferredTimeWindow): string {
  return window === 'after_dinner' ? '晚餐後' : '睡前';
}

function SectionHeading({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionHeadingIcon}>{icon}</Text>
      <Text style={styles.sectionHeadingText}>{title}</Text>
    </View>
  );
}

function GoalHero({ presentation }: { presentation: GoalPresentation }) {
  return (
    <View testID="goal-hero" style={styles.hero}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 380 194" preserveAspectRatio="none">
        <Path d="M0 0H380V194H0z" fill="#172A4D" />
        <Path d="M0 122C76 86 145 98 211 128C278 158 330 124 380 101V194H0z" fill="#253D61" />
        <Path d="M0 154C86 126 151 139 218 164C290 191 337 156 380 142V194H0z" fill="#2E4B3B" />
        <Circle cx={45} cy={37} r={22} fill="#F8DE86" opacity={0.2} />
        <Path d="M51 19C39 25 34 37 39 48C44 59 56 65 67 61C58 58 51 49 51 39C51 31 55 24 63 20C59 18 55 18 51 19z" fill="#FFE48A" />
        <Circle cx={118} cy={25} r={2.2} fill="#FFE48A" />
        <Circle cx={151} cy={51} r={1.8} fill="#FFE48A" />
        <Circle cx={342} cy={28} r={2.2} fill="#FFE48A" />
      </Svg>

      <Image
        source={require('../../../assets/images/child/treehouse-night.png')}
        style={styles.treehouse}
        resizeMode="contain"
      />

      <View style={styles.heroCopy}>
        <View style={styles.categoryPill}>
          <Text style={styles.categoryText}>📚 {presentation.categoryLabel}</Text>
        </View>
        <Text style={styles.overallLabel}>{presentation.overallLabel}</Text>
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              testID="goal-progress-fill"
              style={[styles.progressFill, { width: `${presentation.overallPercent}%` as any }]}
            />
          </View>
          <Text style={styles.progressPercent}>{presentation.overallPercent}%</Text>
        </View>
        <Text style={styles.focusText}>{presentation.focusText}</Text>
        <Text style={styles.nextText}>{presentation.nextText}</Text>
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
>;

function TodayStepCard({
  presentation,
  isCompletedToday,
  checking,
  onComplete,
  onSelectTimeWindow,
}: TodayStepCardProps) {
  const [showTimeOptions, setShowTimeOptions] = useState(false);
  const [completedLocally, setCompletedLocally] = useState(isCompletedToday);
  const completed = isCompletedToday || completedLocally;

  useEffect(() => {
    if (isCompletedToday) setCompletedLocally(true);
  }, [isCompletedToday]);

  const handleComplete = async () => {
    const completedSuccessfully = await onComplete();
    if (completedSuccessfully !== false) setCompletedLocally(true);
  };

  const handleTimeSelect = (window: PreferredTimeWindow) => {
    onSelectTimeWindow(window);
    setShowTimeOptions(false);
  };

  return (
    <>
      <SectionHeading icon="🌱" title={presentation.todayTitle} />
      <View testID="goal-today" style={styles.card}>
        <View style={styles.actionHead}>
          <View style={styles.actionIcon}>
            <Text style={styles.actionIconText}>{presentation.isReadingPlan ? '📖' : '🌿'}</Text>
          </View>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>{presentation.todayAction}</Text>
            {presentation.preferredTimeWindow ? (
              <View style={styles.scheduleRow}>
                <Text style={styles.scheduleText}>
                  今天預計：{formatTimeWindow(presentation.preferredTimeWindow)}
                </Text>
                {!completed && presentation.canCompleteToday ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => setShowTimeOptions((visible) => !visible)}
                  >
                    <Text style={styles.adjustTimeText}>今天要調整</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {showTimeOptions ? (
          <View testID="time-options" style={styles.timeOptions}>
            {([
              ['after_dinner', '晚餐後'],
              ['before_bed', '睡前'],
            ] as const).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.timeOption,
                  presentation.preferredTimeWindow === value && styles.timeOptionSelected,
                ]}
                onPress={() => handleTimeSelect(value)}
              >
                <Text
                  style={[
                    styles.timeOptionText,
                    presentation.preferredTimeWindow === value && styles.timeOptionTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {presentation.canCompleteToday ? (
          <TouchableOpacity
            style={[styles.completeButton, (checking || completed) && styles.completeButtonDisabled]}
            disabled={checking || completed}
            onPress={() => void handleComplete()}
          >
            {checking ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.completeButtonText}>
                {completed
                  ? '今天的閱讀已記下'
                  : presentation.isReadingPlan
                    ? '完成今天閱讀'
                    : '記下今天的完成'}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.restNote}>
            <Text style={styles.restNoteText}>
              {presentation.todayTitle === '今天是休息日'
                ? '今天不用打卡，照自己的節奏休息。'
                : '這個階段由家長確認完成，今天可以照自己的節奏練習。'}
            </Text>
          </View>
        )}

      </View>
    </>
  );
}

function dayIcon(state: GoalDayStatus['state']): string {
  if (state === 'self_started') return '★';
  if (state === 'completed') return '✓';
  if (state === 'today') return '📖';
  if (state === 'future') return '···';
  return '○';
}

function dayCaption(state: GoalDayStatus['state']): string {
  if (state === 'self_started') return '自己開始';
  if (state === 'completed') return '完成';
  if (state === 'today') return '今天';
  if (state === 'future') return '還沒到';
  return '未記錄';
}

function WeekProgressCard({
  days,
  summary,
}: {
  days: GoalDayStatus[];
  summary: string;
}) {
  return (
    <>
      <SectionHeading icon="📊" title="本週進度" />
      <View testID="goal-week" style={[styles.card, styles.weekCard]}>
        <View style={styles.weekRow}>
          {days.map((day) => {
            const isDone = day.state === 'completed' || day.state === 'self_started';
            return (
              <View key={day.day} style={styles.dayCell}>
                <Text style={styles.dayLabel}>{day.label}</Text>
                <View
                  style={[
                    styles.dayCircle,
                    isDone && styles.dayCircleDone,
                    day.state === 'today' && styles.dayCircleToday,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayIcon,
                      isDone && styles.dayIconDone,
                      day.state === 'today' && styles.dayIconToday,
                    ]}
                  >
                    {dayIcon(day.state)}
                  </Text>
                </View>
                <Text style={styles.dayCaption} numberOfLines={2}>
                  {dayCaption(day.state)}
                </Text>
              </View>
            );
          })}
        </View>
        <View style={styles.weekInsight}>
          <Text style={styles.weekInsightText}>🌿 {summary}</Text>
        </View>
      </View>
    </>
  );
}

function JourneyRewardsCard({ presentation }: { presentation: GoalPresentation }) {
  return (
    <>
      <SectionHeading icon="⭐" title="旅程回饋" />
      <View testID="goal-rewards" style={[styles.card, styles.rewardsCard]}>
        {presentation.nextReward ? (
          <View style={styles.rewardRow}>
            <View style={styles.rewardIcon}>
              <Text style={styles.rewardIconText}>🌿</Text>
            </View>
            <View style={styles.rewardCopy}>
              <Text style={styles.rewardTitle}>
                {presentation.isReadingPlan
                  ? `完成第 ${presentation.nextReward.threshold} 次閱讀`
                  : `抵達第 ${presentation.nextReward.threshold} 個里程碑`}
              </Text>
              <Text style={styles.rewardSub}>
                成長被記下 · 成長幣 +{presentation.nextReward.coin}
              </Text>
            </View>
            <View style={styles.rewardStatus}>
              <Text style={styles.rewardStatusText}>下一站</Text>
            </View>
          </View>
        ) : null}
        <View style={[styles.rewardRow, styles.rewardRowFinal]}>
          <View style={styles.rewardIcon}>
            <Text style={styles.rewardIconText}>📚</Text>
          </View>
          <View style={styles.rewardCopy}>
            <Text style={styles.rewardTitle}>完成整段旅程</Text>
            <Text style={styles.rewardSub}>{presentation.finalRewardText}</Text>
          </View>
          <View style={[styles.rewardStatus, styles.rewardStatusFinal]}>
            <Text style={styles.rewardStatusText}>最終目標</Text>
          </View>
        </View>
      </View>
    </>
  );
}

function ReviewCard({ presentation }: { presentation: GoalPresentation }) {
  return (
    <>
      <SectionHeading icon="❤️" title={presentation.reviewTitle} />
      <View testID="goal-review" style={[styles.card, styles.reviewCard]}>
        <View style={styles.reviewIcon}>
          <Text style={styles.reviewIconText}>🌳</Text>
        </View>
        <View style={styles.reviewCopy}>
          <Text style={styles.reviewTitle}>一起聊聊</Text>
          <Text style={styles.reviewPrompt}>{presentation.reviewPrompt}</Text>
        </View>
        <Text style={styles.reviewArrow}>›</Text>
      </View>
    </>
  );
}

export default function LongTermGoalDetailView({
  presentation,
  isCompletedToday,
  checking,
  onComplete,
  onSelectTimeWindow,
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
      />
      <WeekProgressCard days={presentation.weekDays} summary={presentation.weekSummary} />
      <JourneyRewardsCard presentation={presentation} />
      <ReviewCard presentation={presentation} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 14,
    paddingBottom: 112,
    gap: 12,
  },
  hero: {
    minHeight: 194,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 236, 179, 0.2)',
  },
  treehouse: {
    position: 'absolute',
    left: -14,
    bottom: -12,
    width: 176,
    height: 176,
    zIndex: 3,
  },
  heroCopy: {
    width: '58%',
    marginLeft: '42%',
    paddingTop: 22,
    paddingRight: 15,
    paddingBottom: 14,
    zIndex: 5,
  },
  categoryPill: {
    alignSelf: 'flex-start',
    minHeight: 25,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  categoryText: {
    color: '#FFF0B5',
    fontSize: 11,
    fontWeight: '900',
  },
  overallLabel: {
    marginTop: 10,
    color: '#FFFFFF',
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '900',
  },
  progressRow: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#B3D564',
  },
  progressPercent: {
    color: '#D8EF9A',
    fontSize: 12,
    fontWeight: '900',
  },
  focusText: {
    marginTop: 10,
    color: '#FFF3C6',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  nextText: {
    marginTop: 8,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.16)',
    color: '#DFE7ED',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  sectionHeading: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  sectionHeadingIcon: {
    fontSize: 18,
  },
  sectionHeadingText: {
    color: Colors.ink900,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
  },
  card: {
    padding: 15,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    backgroundColor: Colors.bgSurface,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 2,
  },
  actionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D9CEE1',
    backgroundColor: '#F4EFF8',
  },
  actionIconText: {
    fontSize: 24,
  },
  actionCopy: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    color: Colors.ink900,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
  },
  scheduleRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  scheduleText: {
    flex: 1,
    color: Colors.ink500,
    fontSize: 12,
    fontWeight: '700',
  },
  adjustTimeText: {
    color: Colors.leaf700,
    fontSize: 11,
    fontWeight: '900',
  },
  timeOptions: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  timeOption: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    backgroundColor: Colors.cream50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeOptionSelected: {
    borderColor: Colors.leaf300,
    backgroundColor: Colors.leaf50,
  },
  timeOptionText: {
    color: Colors.ink700,
    fontSize: 12,
    fontWeight: '900',
  },
  timeOptionTextSelected: {
    color: Colors.leaf700,
  },
  completeButton: {
    minHeight: 47,
    marginTop: 13,
    borderRadius: 13,
    backgroundColor: '#5B7F3E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeButtonDisabled: {
    opacity: 0.58,
  },
  completeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  restNote: {
    marginTop: 12,
    minHeight: 42,
    borderRadius: 11,
    backgroundColor: Colors.cream50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  restNoteText: {
    color: Colors.ink500,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  weekCard: {
    paddingBottom: 13,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 3,
  },
  dayCell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 6,
  },
  dayLabel: {
    color: Colors.ink700,
    fontSize: 11,
    fontWeight: '900',
  },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.ink300,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleDone: {
    borderStyle: 'solid',
    borderColor: '#7FA94F',
    backgroundColor: '#7FA94F',
  },
  dayCircleToday: {
    borderStyle: 'solid',
    borderColor: '#D5BD85',
    backgroundColor: '#FFF4DC',
  },
  dayIcon: {
    color: Colors.ink300,
    fontSize: 15,
    fontWeight: '900',
  },
  dayIconDone: {
    color: '#FFFFFF',
  },
  dayIconToday: {
    fontSize: 16,
  },
  dayCaption: {
    minHeight: 25,
    color: Colors.ink500,
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center',
  },
  weekInsight: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F1F6E7',
  },
  weekInsightText: {
    color: Colors.ink700,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
  },
  rewardsCard: {
    gap: 8,
  },
  rewardRow: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAD8A8',
    backgroundColor: '#FFF9E8',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rewardRowFinal: {
    borderColor: '#D7DFC9',
    backgroundColor: '#F5F8EF',
  },
  rewardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardIconText: {
    fontSize: 20,
  },
  rewardCopy: {
    flex: 1,
    minWidth: 0,
  },
  rewardTitle: {
    color: Colors.ink900,
    fontSize: 12,
    fontWeight: '900',
  },
  rewardSub: {
    marginTop: 2,
    color: Colors.ink500,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  rewardStatus: {
    borderRadius: 9,
    backgroundColor: '#F0B63B',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  rewardStatusFinal: {
    backgroundColor: '#76925F',
  },
  rewardStatusText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  reviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderColor: '#ECD9B8',
    backgroundColor: '#FFF8ED',
  },
  reviewIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#EFF5DF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewIconText: {
    fontSize: 27,
  },
  reviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  reviewTitle: {
    color: Colors.ink900,
    fontSize: 13,
    fontWeight: '900',
  },
  reviewPrompt: {
    marginTop: 3,
    color: Colors.ink700,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700',
  },
  reviewArrow: {
    color: Colors.gold700,
    fontSize: 26,
    fontWeight: '700',
  },
});
