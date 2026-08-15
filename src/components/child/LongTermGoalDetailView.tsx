import React, { useId, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
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
  hint,
}: {
  icon: IconName;
  title: string;
  /** 標題旁那一句很輕的補充。只有 Today 用得上，其他 section 不傳。 */
  hint?: string | null;
}) {
  return (
    <View style={styles.sectionHeading}>
      <DetailIcon name={icon} size={20} color={Colors.leaf700} />
      <Text style={styles.sectionHeadingText}>{title}</Text>
      {hint ? (
        <Text style={styles.sectionHeadingHint} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/*
  ── Journey Hero ──────────────────────────────────────────────────────────

  Hero 只回答一個問題：「我現在走到哪裡？」

  三層資訊，就這三層：類別 → 目前位置 → 一句目前狀態（再加一行安靜的期間）。
  今天做什麼是 Today 的事，本週完成幾次是 Progress 的事，Hero 不再各講一次。

  這裡**刻意沒有進度條**。原本那條 overallPercent 對節奏型計畫是假的終點進度：
  「一週三次」沒有「走完幾成」這回事，那個百分比只是「這段期間排得下幾次」。
  小徑取代它——小徑講位置，不講完成度。
*/
/*
  場景色階（warm forest evening）。

  一條規則貫穿整組：**天空最亮，愈靠近觀者的地面愈暗。** 之前的版本反過來，
  遠坡比天空亮，於是那層坡讀起來不是山，是一條淺綠色的裝飾波浪。剪影對著有光
  的天空，才會被看成「傍晚的森林」而不是「圖案」。
*/
const HERO_SCENE = {
  skyTop: '#254632',
  skyMid: '#2C5439',
  skyHorizon: '#3A6A48',
  ridgeFar: '#33603F',
  hillMid: '#2A5138',
  ground: '#1F3E2A',
  groundShade: '#15291B',
  trail: '#A7BF87',
  trailEdge: '#D2E2B4',
  grassFar: '#39684A',
  grassNear: '#4C8055',
} as const;

/*
  地形線：遠脊 → 中坡 → 前景地面，一層比一層暗、一層比一層低。

  三條稜線的位置是算過的，不是隨手畫的：中坡與地面的稜線在左半邊都壓在
  「共 N 週」那一行**以下**至少 7px，字才不會被一條線橫穿。遠脊會經過
  focusText 後面，所以它的對比壓到最低（opacity 0.4、顏色貼近天空）——
  那一層只負責空氣感，不負責輪廓。
*/
const RIDGE_FAR_D = 'M0 104C70 92 138 95 206 102 268 108 326 98 380 86V164H0V104Z';
const HILL_MID_D = 'M0 138C78 130 146 131 214 134 276 137 330 129 380 118V164H0V138Z';
const GROUND_D = 'M0 148C88 141 154 142 222 145 284 141 334 138 380 130V164H0V148Z';

/**
 * 小徑：起點 →（目前位置）→ 樹屋。座標在 380 × 64 的前景帶裡。
 *
 * 兩件事讓它讀起來是「地上的路」而不是「浮在空中的線」：
 *
 *   1. 整條曲線都壓在前景地面的稜線**以下**，不再往天空翹上去。
 *   2. 它是一塊**近寬遠窄**的填色帶，不是等寬描邊。透視收窄本身就在說
 *      「這是躺在地上的東西」；等寬的發光描邊只會說「這是一條線」。
 *
 * 中途一顆圓點都沒有。North Star 示意圖上那些圓點只是在表達 journey mood；
 * 照著放會變成畫面自己發明的「四個階段」。
 */
const JOURNEY_START = { x: 12, y: 56 };
const JOURNEY_C1 = { x: 100, y: 60 };
const JOURNEY_C2 = { x: 200, y: 50 };
const JOURNEY_END = { x: 302, y: 48 };

/** 小徑的半寬：近端 5.5 → 遠端 1.6。上下兩條邊就是這個寬度的外擴。 */
const TRAIL_D =
  'M12 61.5C100 64.8 200 52.4 302 49.6'
  + 'L302 46.4C200 47.6 100 55.2 12 50.5Z';
const TRAIL_EDGE_D = 'M12 50.5C100 55.2 200 47.6 302 46.4';

function pointOnJourneyPath(t: number): { x: number; y: number } {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  const points = [JOURNEY_START, JOURNEY_C1, JOURNEY_C2, JOURNEY_END];

  return {
    x: points.reduce((sum, point, index) => sum + w[index] * point.x, 0),
    y: points.reduce((sum, point, index) => sum + w[index] * point.y, 0),
  };
}

/**
 * 目前位置落在小徑的哪一段。
 *
 * **只看 planState 這一個既有欄位，三個粗略錨點**：還沒出發 / 在路上 / 到了。
 *
 * 刻意不吃 overallPercent。對節奏型計畫那個數字是「排得下幾次」，綁上去等於
 * 把 rhythm capacity 畫成終點進度——正是這一輪要拆掉的東西。小徑是視覺語言，
 * 不是資料結構。
 */
function journeyMarkerPosition(planState: GoalPresentation['planState']): number {
  if (planState === 'upcoming') return 0.08;
  if (planState === 'completed' || planState === 'expired') return 0.92;
  return 0.44;
}

/**
 * planWeekLabel 尾巴的「共 N 週 / 共 N 階段」。
 *
 * 大字已經是「第 3 階段」，整串 planWeekLabel 會把同一件事講兩次。取不到就
 * 不顯示——**不自己合成一句期間**。
 */
function planTotalLabel(planWeekLabel: string): string | null {
  return planWeekLabel.match(/共\s*\d+\s*\S+/)?.[0] ?? null;
}

/** 三片草葉。散在地面上讓前景長出東西來，不是可數的節點。 */
function GrassTuft({
  x,
  y,
  size = 1,
  color,
  opacity = 1,
}: {
  x: number;
  y: number;
  size?: number;
  color: string;
  opacity?: number;
}) {
  const blade = (tipX: number, tipY: number, bendX: number, bendY: number) =>
    `M${x} ${y}Q${x + bendX * size} ${y - bendY * size} `
    + `${x + tipX * size} ${y - tipY * size}`;

  return (
    <Path
      d={[
        blade(-3.6, 5.8, -0.6, 3.4),
        blade(0.5, 7.2, 0.2, 3.9),
        blade(3.4, 5.4, 0.9, 3.2),
      ].join(' ')}
      stroke={color}
      strokeWidth={1.25 * size}
      strokeLinecap="round"
      fill="none"
      opacity={opacity}
    />
  );
}

/**
 * 前景帶：地上的小徑、草叢、目前位置。
 *
 * 這一層畫在樹屋圖片**之後**——草葉壓過樹屋底緣，樹才會是長在地上的，而不是
 * 貼在右下角的貼圖。
 */
function JourneyPath({ position }: { position: number }) {
  const marker = pointOnJourneyPath(position);

  return (
    <Svg
      testID="goal-journey-path"
      style={styles.journeyPath}
      viewBox="0 0 380 64"
      preserveAspectRatio="none"
      accessibilityElementsHidden
      pointerEvents="none"
    >
      {/* 小徑：一塊近寬遠窄的地面。整條同色——分前後段就是進度條。 */}
      <Path d={TRAIL_D} fill={HERO_SCENE.trail} opacity={0.3} />
      <Path
        d={TRAIL_EDGE_D}
        stroke={HERO_SCENE.trailEdge}
        strokeWidth={0.9}
        strokeLinecap="round"
        fill="none"
        opacity={0.2}
      />

      {/* 路邊的草：長在小徑上緣那道窄窄的地面上 */}
      <GrassTuft x={58} y={50} size={1} color={HERO_SCENE.grassNear} opacity={0.75} />
      <GrassTuft x={152} y={48} size={0.8} color={HERO_SCENE.grassFar} opacity={0.6} />
      {/* 這一叢刻意壓在樹屋底緣上——有東西擋住底邊，樹才不像貼上去的 */}
      <GrassTuft x={292} y={56} size={0.95} color={HERO_SCENE.grassNear} opacity={0.7} />

      {/* 起點的嫩芽，站在小徑起點的旁邊 */}
      <Path
        d="M26 50v-8"
        stroke={Colors.leaf300}
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
        opacity={0.9}
      />
      <Path
        d="M26 45c-4.2 0-6.6-2.2-6.6-6 4.2 0 6.6 2.2 6.6 6Z"
        fill={Colors.leaf300}
        opacity={0.85}
      />
      <Path
        d="M26 43c0-3.8 2.4-6 6.6-6 0 3.8-2.4 6-6.6 6Z"
        fill={Colors.leaf200}
        opacity={0.7}
      />

      {/* 目前位置：一顆，只有一顆。腳下有影子，才像停在路上而不是浮著。 */}
      <Ellipse
        cx={marker.x}
        cy={marker.y + 3.6}
        rx={6.5}
        ry={2.2}
        fill={HERO_SCENE.groundShade}
        opacity={0.38}
      />
      <Circle cx={marker.x} cy={marker.y} r={8.5} fill={Colors.gold300} opacity={0.15} />
      <Circle
        testID="goal-journey-marker"
        cx={marker.x}
        cy={marker.y}
        r={4.6}
        fill={Colors.gold300}
      />
      <Circle cx={marker.x} cy={marker.y} r={1.8} fill={HERO_SCENE.ground} />
    </Svg>
  );
}

function GoalHero({ presentation }: { presentation: GoalPresentation }) {
  const gradientId = useId();
  const totalLabel = planTotalLabel(presentation.planWeekLabel);

  return (
    <View
      testID="goal-hero"
      style={styles.hero}
    >
      <Svg
        style={StyleSheet.absoluteFill}
        viewBox="0 0 380 164"
        preserveAspectRatio="none"
        accessibilityElementsHidden
      >
        <Defs>
          <LinearGradient id={`${gradientId}-sky`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset={0} stopColor={HERO_SCENE.skyTop} />
            <Stop offset={0.52} stopColor={HERO_SCENE.skyMid} />
            <Stop offset={1} stopColor={HERO_SCENE.skyHorizon} />
          </LinearGradient>
          {/* 樹屋那一側的傍晚餘光。0.16 是「有點暖」，再高就變成發光特效了。 */}
          <RadialGradient id={`${gradientId}-dusk`} cx="84%" cy="64%" r="46%">
            <Stop offset={0} stopColor={Colors.gold300} stopOpacity={0.16} />
            <Stop offset={1} stopColor={Colors.gold300} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={380} height={164} fill={`url(#${gradientId}-sky)`} />
        <Rect x={0} y={0} width={380} height={164} fill={`url(#${gradientId}-dusk)`} />

        {/* 遠脊 → 中坡 → 前景地面。三層就夠，而且愈近愈暗。 */}
        <Path d={RIDGE_FAR_D} fill={HERO_SCENE.ridgeFar} opacity={0.4} />
        <Path d={HILL_MID_D} fill={HERO_SCENE.hillMid} opacity={0.88} />
        <Path d={GROUND_D} fill={HERO_SCENE.ground} />

        {/* 樹屋腳下的影子。少了它，樹就是浮在地面上的一張圖。 */}
        <Ellipse
          cx={326}
          cy={155}
          rx={38}
          ry={7}
          fill={HERO_SCENE.groundShade}
          opacity={0.34}
        />
      </Svg>

      <Image
        source={require('../../../assets/images/child/treehouse-night.png')}
        style={styles.treehouse}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />

      <JourneyPath position={journeyMarkerPosition(presentation.planState)} />

      <View style={styles.heroCopy}>
        <Text style={styles.categoryText} numberOfLines={1}>
          {presentation.categoryLabel}
        </Text>
        <Text style={styles.heroPosition} numberOfLines={2}>
          {presentation.weekLabel}
        </Text>
        <Text style={styles.focusText} numberOfLines={2}>
          {presentation.focusText}
        </Text>
        {totalLabel ? (
          <Text style={styles.heroTotalLabel} numberOfLines={1}>
            {totalLabel}
          </Text>
        ) : null}
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

/**
 * 卡面：頂端一層很淡的葉綠暈。
 *
 * Today 不該長得跟其他 section 一樣是白色 dashboard card——但也不該變成插畫。
 * 一層 wash 就夠把它從「另一張卡」推成「旅途中的這一站」。
 */
function TodayCardWash({ gradientId }: { gradientId: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" accessibilityElementsHidden>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset={0} stopColor={Colors.leaf50} stopOpacity={0.95} />
            <Stop offset={0.6} stopColor={Colors.leaf50} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

/**
 * 之後放 mascot 的位置。
 *
 * 現在放一株很淡的嫩芽當佔位。三條規則寫在版面裡而不是註解裡：
 *   - 絕對定位 → 沒有 mascot 時版面照樣成立，也永遠不會吃掉 todayAction 的寬度
 *   - pointerEvents none → 蓋在說明列上也不會攔到點擊
 *   - 對讀屏隱藏 → 它不是資訊，只是氣氛
 */
function MascotSlot() {
  return (
    <View
      testID="today-mascot-slot"
      style={styles.mascotSlot}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={56} height={56} viewBox="0 0 56 56" accessibilityElementsHidden>
        <Path
          d="M28 46V26"
          stroke={Colors.leaf300}
          strokeWidth={2.4}
          strokeLinecap="round"
          fill="none"
          opacity={0.42}
        />
        <Path
          d="M28 32c-9 0-14-5-14-13 9 0 14 5 14 13Z"
          fill={Colors.leaf200}
          opacity={0.5}
        />
        <Path
          d="M28 28c0-8 5-13 14-13 0 8-5 13-14 13Z"
          fill={Colors.leaf100}
          opacity={0.75}
        />
      </Svg>
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

  /*
    「今天這一步已經被記下來了」，不是「恭喜過關」。所以勾勾從實心綠圓章
    改成淡底細框、勾用葉綠而不是白色——是一則紀錄，不是一枚獎章。
  */
  return (
    <View style={styles.completedState}>
      <View style={styles.completedTitleRow}>
        <View style={styles.completedCheck}>
          <DetailIcon name="check" size={17} color={Colors.leaf700} />
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
  const washId = useId();
  const [showTimeOptions, setShowTimeOptions] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const completionPendingRef = useRef(false);
  const completed = isCompletedToday;
  const busy = checking || completing;
  const showTimeControls =
    presentation.supportsPreferredTimeWindow && presentation.canCompleteToday;
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
  /*
    「今天只走這一步」只有在今天真的有一步可走時才說得通。計畫暫停、已完成、
    或這一步要家長確認（技能階段）時，標題本身就不是「今天的小步驟」，補這句
    只會變成不知道在講誰的口號。
  */
  const stepHint =
    presentation.canCompleteToday && !completed ? '今天只走這一步' : null;

  return (
    <View>
      <SectionHeading
        icon="sprout"
        title={presentation.todayTitle}
        hint={stepHint}
      />
      <View testID="goal-today" style={[styles.card, styles.todayCard]}>
        <TodayCardWash gradientId={washId} />
        <View style={styles.actionHead}>
          <View style={styles.actionIcon}>
            <DetailIcon
              name="sprout"
              color={Colors.leaf700}
            />
          </View>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>{presentation.todayAction}</Text>
          </View>
        </View>

        {/*
          時段是次要資訊，所以搬到主要文案**下面**自成一列，而不是擠在
          todayAction 旁邊跟它搶視線。行為、文案、a11y label 一個字都沒動。
        */}
        {showTimeControls ? (
          <View style={styles.scheduleRow}>
            <View style={styles.scheduleLabel}>
              <DetailIcon name="clock" size={15} color={Colors.fgMuted} />
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

        <View style={styles.explanationRow}>
          <TouchableOpacity
            style={styles.explanationToggle}
            accessibilityRole="button"
            accessibilityLabel={explanationLabel}
            accessibilityState={{ expanded: showExplanation }}
            onPress={() => setShowExplanation((visible) => !visible)}
            activeOpacity={0.72}
          >
            <View style={styles.explanationToggleText}>
              <DetailIcon name="info" size={16} color={Colors.fgMuted} />
              <Text style={styles.explanationLabel}>小步驟說明</Text>
            </View>
            <View
              style={[
                styles.explanationChevron,
                showExplanation && styles.explanationChevronExpanded,
              ]}
            >
              <DetailIcon name="chevron" size={17} color={Colors.fgMuted} />
            </View>
          </TouchableOpacity>
          <MascotSlot />
        </View>

        {showExplanation ? (
          <View style={styles.explanationBody}>
            <Text style={styles.explanationText}>{presentation.focusText}</Text>
            <Text style={styles.explanationHint}>
              先完成今天最小的一步，覺得不合適時再和家人一起調整。
            </Text>
          </View>
        ) : null}

        {showTimeControls && showTimeOptions && !completed ? (
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
            accessibilityLabel="記下今天的完成"
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
              /*
                刻意不放勾勾。打勾是「把待辦劃掉」的手勢，這裡要的是「把今天
                做的事寫下來」。留文字一句就好。
              */
              <Text style={styles.completeButtonText}>
                記下今天的完成
              </Text>
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

function ProgressCard({
  presentation,
}: {
  presentation: GoalPresentation;
}) {
  const progression = presentation.progression;
  const showsDailySchedule =
    progression === 'fixed_days' && presentation.planState === 'active';
  const showsWeeklyRhythm = progression === 'weekly_rhythm';
  const showsStage = progression === 'staged_skill';
  const showsAccumulation = progression === 'accumulation';
  const showsChallenge = progression === 'challenge';

  return (
    <View>
      <SectionHeading icon="calendar" title="進度" />
      <View testID="goal-progress" style={styles.card}>
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
        ) : progression === 'fixed_days' ? (
          <View style={styles.compactWeekProgress}>
            <Text style={styles.compactWeekLabel}>
              {presentation.todayStatusText ?? presentation.weekSummary}
            </Text>
          </View>
        ) : showsWeeklyRhythm ? (
          <View style={styles.compactWeekProgress}>
            <Text style={styles.compactWeekLabel}>
              本週 {presentation.weekCompleted} / {presentation.weekTarget}
            </Text>
          </View>
        ) : showsStage || showsAccumulation || showsChallenge ? (
          <View style={styles.compactWeekProgress}>
            <Text style={styles.compactWeekLabel}>{presentation.overallLabel}</Text>
            <Text style={styles.compactWeekMeta}>{presentation.nextText}</Text>
            {showsChallenge ? (
              <Text style={styles.compactWeekMeta}>
                {presentation.weekProgressLabel}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.compactWeekProgress}>
            <Text style={styles.compactWeekLabel}>尚未安排</Text>
          </View>
        )}
        <View style={styles.weekInsight}>
          <DetailIcon name="sprout" size={16} color={Colors.leaf700} />
          <Text style={styles.weekInsightText}>{presentation.weekSummary}</Text>
        </View>
        {presentation.milestones.length > 0 ? (
          <MilestoneTimeline milestones={presentation.milestones} />
        ) : null}
      </View>
    </View>
  );
}

function milestoneStatusLabel(milestone: GoalMilestone): string {
  if (milestone.status === 'completed') return '已完成';
  // 階段型：孩子現在就在練這一階段，講「下一個」會和 Hero 打架。
  if (milestone.status === 'in_progress') return '進行中';
  if (milestone.status === 'next_stage') return '下一階段';
  if (milestone.status === 'next') return '下一個里程碑';
  if (milestone.status === 'planned') return '計畫節點';
  return '尚未到';
}

/** 時間軸上被標示出來的那一列：進行中的階段，或還沒開始的下一個節點。 */
function isMilestoneHighlighted(milestone: GoalMilestone): boolean {
  return milestone.status === 'in_progress' || milestone.status === 'next';
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
    <View testID="goal-milestones" style={styles.timeline}>
        {milestones.map((milestone, index) => (
          <View key={milestone.id} style={styles.timelineRow}>
            <View style={styles.timelineRail}>
              <View
                style={[
                  styles.timelineNode,
                  milestone.status === 'completed' && styles.timelineNodeCompleted,
                  isMilestoneHighlighted(milestone) && styles.timelineNodeNext,
                ]}
              >
                {milestone.status === 'completed' ? (
                  <DetailIcon name="check" size={15} color={Colors.bgSurface} />
                ) : (
                  <DetailIcon
                    name="milestone"
                    size={14}
                    color={
                      isMilestoneHighlighted(milestone)
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
                    isMilestoneHighlighted(milestone) && styles.statusBadgeNext,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      milestone.status === 'completed' && styles.statusBadgeTextCompleted,
                      isMilestoneHighlighted(milestone) && styles.statusBadgeTextNext,
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
    <View testID="goal-shell" style={styles.shell}>
      <View testID="goal-current-position" style={styles.currentPosition}>
        <GoalHero presentation={presentation} />
        {visiblePlanNotice ? (
          <PlanNotice notice={visiblePlanNotice} />
        ) : null}
      </View>
      <View testID="goal-today-section">
        <TodayStepCard
          presentation={presentation}
          isCompletedToday={isCompletedToday}
          checking={checking}
          onComplete={onComplete}
          onSelectTimeWindow={onSelectTimeWindow}
          onOpenRecord={onOpenRecord}
        />
      </View>
      <View testID="goal-progress-section">
        <ProgressCard presentation={presentation} />
      </View>
      <View testID="goal-review-section">
        <ReviewCard
          presentation={presentation}
          onOpenReview={onOpenReview}
          pendingTimeAdjustmentNotice={pendingTimeAdjustmentNotice}
        />
      </View>
      <View testID="goal-more" style={styles.more}>
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
      </View>
    </View>
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
  },
  shell: {
    gap: 14,
  },
  currentPosition: {
    gap: 14,
  },
  more: {
    gap: 14,
  },
  hero: {
    // 比 North Star 示意圖再收斂一截，讓第一屏留得住「今天的小步驟」。
    minHeight: 164,
    borderRadius: 16,
    overflow: 'hidden',
  },
  treehouse: {
    position: 'absolute',
    right: -6,
    bottom: -4,
    width: 112,
    height: 112,
  },
  /** 前景帶固定 64 高，貼著底邊；Hero 長高時它不跟著拉長，marker 才不會被壓扁。 */
  journeyPath: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
  },
  heroCopy: {
    paddingTop: 16,
    paddingRight: 106,
    paddingBottom: 40,
    paddingLeft: 18,
  },
  categoryText: {
    color: Colors.gold100,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 1.4,
    opacity: 0.82,
  },
  heroPosition: {
    marginTop: 9,
    color: Colors.bgSurface,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  focusText: {
    marginTop: 4,
    color: Colors.cream100,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    opacity: 0.92,
  },
  heroTotalLabel: {
    marginTop: 8,
    color: Colors.cream200,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '700',
    // 天空提亮之後 0.62 掉到 4.2:1，讀不太動；0.72 回到 5.2:1。
    opacity: 0.72,
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
    flexShrink: 1,
    color: Colors.fgPrimary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
  },
  sectionHeadingHint: {
    flex: 1,
    minWidth: 0,
    color: Colors.fgMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
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
  /*
    Today 是整頁的功能焦點，但情緒不該是「待辦卡」。所以：圓角比一般卡大得多、
    邊框比一般卡更輕（2px 葉綠 → 1px），留白加大，卡面頂端一層淡葉綠 wash。
  */
  todayCard: {
    padding: 18,
    paddingBottom: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.leaf100,
    shadowOpacity: 0.07,
    elevation: 2,
    overflow: 'hidden',
  },
  actionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.leaf200,
    backgroundColor: Colors.bgSurface,
  },
  actionCopy: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    color: Colors.fgPrimary,
    fontSize: 22,
    lineHeight: 31,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  scheduleRow: {
    marginTop: 12,
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
  /** 說明列的定位容器；mascot slot 靠它決定右下角在哪。 */
  explanationRow: {
    position: 'relative',
    marginTop: 10,
  },
  /*
    拿掉上方那條分隔線。「一條線 + 標籤 + chevron」正是設定頁的長相，
    是這張卡最像工具的一處；改用留白分段就夠了。
  */
  explanationToggle: {
    minHeight: 44,
    paddingRight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  /*
    Mascot 之後放這裡。絕對定位：沒有 mascot 時版面照樣成立，有了也不會
    從 todayAction 身上拿走任何寬度。
  */
  mascotSlot: {
    position: 'absolute',
    right: -4,
    bottom: -10,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
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
  /** 展開後是一小塊柔和的說明區，不是設定頁被拉開的一格。 */
  explanationBody: {
    marginTop: 2,
    borderRadius: 12,
    backgroundColor: Colors.cream50,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 11,
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
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  timeOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
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
  /*
    CTA 維持葉綠（Colors.accent），不用金色——金色會把「留下紀錄」讀成
    「按下去領獎勵」。圓角跟著卡片放軟，高度不動（可點擊尺寸不縮）。
  */
  completeButton: {
    minHeight: 56,
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
  },
  buttonBusy: {
    opacity: 0.6,
  },
  completeButtonText: {
    color: Colors.bgSurface,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3,
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
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.leaf100,
    backgroundColor: Colors.leaf50,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 7,
  },
  completedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  completedCheck: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.leaf200,
    backgroundColor: Colors.bgSurface,
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
    marginTop: 14,
    borderRadius: 14,
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
