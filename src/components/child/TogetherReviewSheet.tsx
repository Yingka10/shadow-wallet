// Shadow Wallet — CHILD-REVIEW-V2：「一起回顧」的畫面
//
// 順序是刻意的（§0）：
//
//   看見這段發生什麼 → 回想實際感受 → 決定下一段 → 只有真的改到共同約定
//   時，才重新找家長確認。
//
// 所以：
//   - 一開啟**不問問題**，先給 evidence。
//   - Step 2 選完之前不出現 CTA（§13）。
//   - 「和家人一起調整」那條 strip 只有在真的可能動到共同約定時才出現（§12）——
//     一進來就掛著會讓孩子以為回顧一定要家長參與。
//
// ⚠️ Review ≠ Renegotiation。整個回顧可以走完而完全不動任何共同約定。
// ⚠️ Review 本身 0 coin，這裡不碰任何結算。
//
// VISUAL-POLISH（本輪）：只動視覺，IA 與語意一字未改。
//   - hero band：標題＋evidence＋review 專屬插圖＋很淡的裝飾形狀（不加巢狀卡）
//     插圖來源只有 reviewHeroAsset.ts 一個地方，元件不自己 require 圖檔
//   - tile icon 收斂成**同一株芽的不同狀態**，不是八個通用 icon
//   - selected 是「淡綠底＋深綠框＋角落實心勾＋圖示變綠」，不是把整頁染綠
//   - Step 1 / Step 2 之間用很淡的虛線 ＋ 小芽當 journey cue，不做遊戲化進度條

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { Colors } from '../../constants/colors';
import {
  REVIEW_HERO_ART_WIDTH,
  REVIEW_HERO_ART_WIDTH_COMPACT,
  REVIEW_HERO_ASPECT,
  REVIEW_HERO_ASSET,
  REVIEW_HERO_COMPACT_BREAKPOINT,
} from './reviewHeroAsset';
import type { GoalPresentation } from '../../screens/child/longTermGoalPresentation';
import {
  buildAlternativeApproaches,
  buildFewerPerWeekDiff,
  buildLighterDimensions,
  buildPrimaryCta,
  buildReviewEvidence,
  buildSharedTermNotice,
  buildTimeWindowDiff,
  classifyAdjustment,
  DEFAULT_PARENT_LABEL,
  KEEP_CONFIRMATION_COPY,
  needsFamilyConfirmation,
  NO_ADJUSTMENT_CAPABILITIES,
  REVIEW_DIRECTION_OPTIONS,
  REVIEW_EXPERIENCE_OPTIONS,
  type LighterDimension,
  type ReviewAdjustmentCapabilities,
  type ReviewDirection,
  type ReviewEvidence,
  type ReviewExperience,
  type ReviewOption,
  type ReviewTileIcon,
  type ReviewTimeWindow,
  type SharedTermNoticeKind,
} from './togetherReviewModel';

/**
 * 每週次數的重新協商通道。undefined 代表這份計畫沒有這條通道
 * （例如一般家長建立的長期任務），此時「一週少一次」不會出現在選單上。
 */
export type ReviewCadenceChannel = {
  /** 已經送出、等家長確認。此時不能再送第二次。 */
  pending: boolean;
  submitting: boolean;
  error: string | null;
  submitted: boolean;
  onSubmit: (weeklyFrequency: number) => Promise<boolean>;
};

/**
 * 換時段的重新協商通道（P0-8M，既有）。形狀與 cadence 一致，但**是兩條
 * 各自獨立的通道** —— 一條 pending 不代表另一條也不能送。
 */
export type ReviewTimeChannel = {
  pending: boolean;
  submitting: boolean;
  error: string | null;
  submitted: boolean;
  onSubmit: (window: ReviewTimeWindow) => Promise<boolean>;
};

type Props = {
  presentation: GoalPresentation;
  onClose: () => void;
  /** canonical 家長稱謂。沒有就用既有畫面一直在用的中性集合稱呼。 */
  parentLabel?: string | null;
  cadenceChannel?: ReviewCadenceChannel;
  timeChannel?: ReviewTimeChannel;
};

type Phase =
  | 'review'
  | 'lighter'
  | 'different_way'
  | 'shared_term'
  | 'keep_done'
  | 'idea';

export default function TogetherReviewSheet({
  presentation,
  onClose,
  parentLabel,
  cadenceChannel,
  timeChannel,
}: Props) {
  const [experience, setExperience] = useState<ReviewExperience | null>(null);
  const [direction, setDirection] = useState<ReviewDirection | null>(null);
  const [dimension, setDimension] = useState<LighterDimension | null>(null);
  const [approach, setApproach] = useState<ReviewTimeWindow | null>(null);
  const [phase, setPhase] = useState<Phase>('review');
  const [idea, setIdea] = useState('');

  const family = (parentLabel ?? '').trim() || DEFAULT_PARENT_LABEL;

  const capabilities: ReviewAdjustmentCapabilities = useMemo(() => ({
    ...NO_ADJUSTMENT_CAPABILITIES,
    cadence: Boolean(cadenceChannel),
    preferredTime: Boolean(timeChannel),
  }), [cadenceChannel, timeChannel]);

  const evidence = useMemo(() => buildReviewEvidence(presentation), [presentation]);
  const dimensions = useMemo(
    () => buildLighterDimensions(presentation, capabilities),
    [capabilities, presentation],
  );
  const cadenceDiff = useMemo(
    () => buildFewerPerWeekDiff(presentation),
    [presentation],
  );
  const approaches = useMemo(
    () => buildAlternativeApproaches(presentation, capabilities),
    [capabilities, presentation],
  );

  const classification = classifyAdjustment(direction, dimension);
  const cta = buildPrimaryCta(experience, direction);

  // Step 1 換了答案不會清掉 Step 2 —— 那是兩個獨立的問題，孩子改了對這段的
  // 描述，不代表他對下一段的想法也變了。但方向換了，維度就不再成立。
  const handleDirection = (next: ReviewDirection) => {
    setDirection(next);
    setDimension(null);
    setApproach(null);
  };

  const handlePrimary = () => {
    if (direction === 'keep') {
      setPhase('keep_done');
      return;
    }
    if (direction === 'lighter') {
      setPhase('lighter');
      return;
    }
    // 沒有任何具體的替代做法可以送出時，「想換一種做法」和「我自己有想法」
    // 在這個 build 是同一件事 —— 假裝有一個選單反而更糟。
    if (direction === 'different_way' && approaches.length > 0) {
      setPhase('different_way');
      return;
    }
    setPhase('idea');
  };

  if (cadenceChannel?.submitted || timeChannel?.submitted) {
    return (
      <View testID="review-submitted">
        <ReviewHero />
        <Text style={styles.confirmationText}>
          {`已經告訴${family}了。一起確認後，計畫才會更新。`}
        </Text>
        <PrimaryCta label="知道了" onPress={onClose} />
      </View>
    );
  }

  if (phase === 'keep_done') {
    return (
      <View testID="review-keep-confirmation">
        <ReviewHero />
        <Text style={styles.confirmationText}>{KEEP_CONFIRMATION_COPY}</Text>
        <PrimaryCta label="繼續這樣走" onPress={onClose} />
      </View>
    );
  }

  if (phase === 'idea') {
    const heading = direction === 'different_way'
      ? '想換成什麼做法？'
      : '你想怎麼改？';
    return (
      <View testID="review-idea">
        <ReviewHero />
        <Text style={styles.stepQuestion}>{heading}</Text>
        <TextInput
          accessibilityLabel={heading}
          placeholder="說說你的想法"
          placeholderTextColor={Colors.fgMuted}
          value={idea}
          onChangeText={setIdea}
          multiline
          maxLength={160}
          style={styles.textInput}
        />
        {/* 沒有 child-owned 的保存通道，就**不要說已經記下來了**。 */}
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            {`這個想法還沒送出，可以直接和${family}說說看。`}
          </Text>
        </View>
        <PrimaryCta label="知道了" onPress={onClose} />
      </View>
    );
  }

  if (phase === 'lighter') {
    return (
      <View testID="review-lighter">
        <ReviewHero />
        <Text style={styles.stepQuestion}>你比較想從哪裡調整？</Text>
        {dimensions.length > 0 ? (
          <View style={styles.tileGrid}>
            {dimensions.map((option) => (
              <ChoiceTile
                key={option.value}
                testID={`review-dimension-${option.value}`}
                label={option.label}
                icon="sprout_light"
                selected={dimension === option.value}
                onPress={() => setDimension(option.value)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              {`這份計畫的安排要和${family}一起看才能改。`}
            </Text>
          </View>
        )}
        {dimension !== null && needsFamilyConfirmation(classification) ? (
          <SharedTermStrip family={family} />
        ) : null}
        {dimension !== null ? (
          <PrimaryCta
            label={buildSharedTermNotice(family).cta}
            onPress={() => setPhase('shared_term')}
          />
        ) : null}
      </View>
    );
  }

  if (phase === 'different_way') {
    return (
      <View testID="review-different-way">
        <ReviewHero />
        <Text style={styles.stepQuestion}>下一段想換成哪一種？</Text>
        {/* 這裡列的是**這份計畫真的換得動**的做法，不是 AI 生的可能性清單。 */}
        <View style={styles.tileGrid}>
          {approaches.map((option) => (
            <ChoiceTile
              key={option.value}
              testID={`review-approach-${option.value}`}
              label={option.label}
              icon="path_branch"
              selected={option.timeWindow !== null && approach === option.timeWindow}
              onPress={() => {
                if (option.timeWindow === null) {
                  setPhase('idea');
                  return;
                }
                setApproach(option.timeWindow);
              }}
            />
          ))}
        </View>
        {approach !== null ? (
          <>
            {/* 窄的說法：談的是這份計畫當初一起說好的那個時段，
                不是「任何跟時間有關的事都要家長同意」（§7）。 */}
            <SharedTermStrip family={family} kind="agreed_time" />
            <PrimaryCta
              label={buildSharedTermNotice(family, 'agreed_time').cta}
              onPress={() => setPhase('shared_term')}
            />
          </>
        ) : null}
      </View>
    );
  }

  if (phase === 'shared_term') {
    /*
      兩條各自獨立的通道，**不要合成一條**：
        每週次數  cadence lane
        換時段    P0-8M preferred_time lane
      一條 pending 只擋自己那一條 —— 送過換時段不該連帶把改次數也鎖住。
    */
    const isCadence = dimension === 'fewer_per_week' && cadenceDiff !== null;
    const timeDiff = approach !== null
      ? buildTimeWindowDiff(presentation, approach)
      : null;

    const channel = isCadence ? cadenceChannel : timeDiff ? timeChannel : undefined;
    const diff = isCadence
      ? { fromLabel: cadenceDiff!.fromLabel, toLabel: cadenceDiff!.toLabel }
      : timeDiff
        ? { fromLabel: timeDiff.fromLabel, toLabel: timeDiff.toLabel }
        : null;
    const noticeKind: SharedTermNoticeKind = isCadence ? 'shared_term' : 'agreed_time';

    const canSend = channel !== undefined && diff !== null && !channel.pending;

    const send = () => {
      if (isCadence && cadenceDiff) {
        void cadenceChannel?.onSubmit(cadenceDiff.toValue);
        return;
      }
      if (timeDiff) void timeChannel?.onSubmit(timeDiff.toValue);
    };

    return (
      <View testID="review-shared-term">
        <ReviewHero />
        <Text style={styles.stepQuestion}>這樣改可以嗎？</Text>

        {/* §6：訊息、差異、CTA 是同一片 sage/cream 的行動區，不是三塊零件。
            沒有紅色警示 —— 這是一次重新商量，不是一個錯誤。 */}
        <View testID="review-shared-term-panel" style={styles.actionPanel}>
          <View style={styles.actionPanelHead}>
            <View style={styles.actionPanelIcon}>
              <TileGlyph name="sprout_steady" selected size={26} />
            </View>
            <Text testID="review-shared-term-strip" style={styles.actionPanelText}>
              {buildSharedTermNotice(family, noticeKind).message}
            </Text>
          </View>

          {diff ? (
            <View testID="review-shared-term-diff" style={styles.diffCard}>
              <View style={styles.diffRow}>
                <Text style={styles.diffLabel}>原本</Text>
                <Text style={styles.diffFrom}>{diff.fromLabel}</Text>
              </View>
              <View style={styles.diffArrow}>
                <ArrowDown />
              </View>
              <View style={styles.diffRow}>
                <Text style={styles.diffLabel}>想改成</Text>
                <Text style={styles.diffTo}>{diff.toLabel}</Text>
              </View>
            </View>
          ) : null}

          {channel?.pending ? (
            <Text style={styles.actionPanelNote}>
              {`已送給${family}，等一起確認。`}
            </Text>
          ) : null}
        </View>

        {channel?.error ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={styles.errorText}
          >
            {channel.error}
          </Text>
        ) : null}

        {canSend ? (
          <PrimaryCta
            label={buildSharedTermNotice(family, noticeKind).cta}
            loading={channel?.submitting}
            onPress={send}
          />
        ) : (
          <PrimaryCta label="知道了" onPress={onClose} />
        )}
      </View>
    );
  }

  return (
    <View testID="review-main">
      {/* Evidence 在 hero 裡：先看見這段發生什麼，不是一開啟就被問問題。 */}
      <ReviewHero evidence={evidence} />

      <StepBlock
        step={1}
        question="這段做起來，哪個最像你？"
        options={REVIEW_EXPERIENCE_OPTIONS}
        selected={experience}
        onSelect={setExperience}
        testIdPrefix="review-experience"
      />

      {experience !== null ? (
        <>
          <JourneyCue />
          <StepBlock
            step={2}
            question="下一段，你想怎麼走？"
            options={REVIEW_DIRECTION_OPTIONS}
            selected={direction}
            onSelect={handleDirection}
            testIdPrefix="review-direction"
          />
        </>
      ) : null}

      {cta ? <PrimaryCta label={cta} onPress={handlePrimary} withArrow /> : null}
    </View>
  );
}

// ── Hero（§1）────────────────────────────────────────────────────────────
//
// 一條很輕的視覺帶，不是一張卡：標題、evidence、一株 review 專屬的小芽，
// 底下一塊很淡的 sage 形狀。**不重複 Today 的 mascot**。

function ReviewHero({ evidence }: { evidence?: ReviewEvidence }) {
  const { width } = useWindowDimensions();
  const heroWidth = width < REVIEW_HERO_COMPACT_BREAKPOINT
    ? REVIEW_HERO_ART_WIDTH_COMPACT
    : REVIEW_HERO_ART_WIDTH;
  // 字面數字的寬高，不交給 aspectRatio（見 reviewHeroAsset 的註解）。
  const heroHeight = Math.round(heroWidth * REVIEW_HERO_ASPECT);

  return (
    <View testID="review-hero" style={styles.hero}>
      <View style={styles.heroBackdrop} pointerEvents="none">
        <HeroShape />
      </View>

      <View style={styles.heroRow}>
        <View style={styles.heroCopy}>
          <Text style={styles.heading}>一起回顧</Text>
          {evidence ? (
            <>
              <View testID="review-evidence" style={styles.evidencePill}>
                <Text style={styles.evidenceText}>{evidence.contextSentence}</Text>
              </View>
              {evidence.agreedFact ? (
                <Text testID="review-evidence-fact" style={styles.evidenceFact}>
                  {evidence.agreedFact}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>

        {/* 包一層 pointerEvents="none"：插圖不吃任何點擊，也不擋 close 與
            拖曳區。pointerEvents 不是 Image 的 prop，要放在容器上。 */}
        <View
          testID="review-hero-art-wrap"
          pointerEvents="none"
          style={{ width: heroWidth, height: heroHeight }}
        >
          <Image
            testID="review-hero-art"
            source={REVIEW_HERO_ASSET}
            accessibilityIgnoresInvertColors
            accessible={false}
            importantForAccessibility="no"
            resizeMode="contain"
            style={{ width: heroWidth, height: heroHeight }}
          />
        </View>
      </View>
    </View>
  );
}

// ── Step ────────────────────────────────────────────────────────────────

function StepBlock<T extends string>({
  step,
  question,
  options,
  selected,
  onSelect,
  testIdPrefix,
}: {
  step: number;
  question: string;
  options: ReadonlyArray<ReviewOption<T>>;
  selected: T | null;
  onSelect: (value: T) => void;
  testIdPrefix: string;
}) {
  return (
    <View style={styles.stepBlock}>
      <View style={styles.stepHeader}>
        <View style={styles.stepMarker}>
          <Text style={styles.stepMarkerText}>{step}</Text>
        </View>
        <Text style={styles.stepQuestion}>{question}</Text>
      </View>
      <View style={styles.tileGrid}>
        {options.map((option) => (
          <ChoiceTile
            key={option.value}
            testID={`${testIdPrefix}-${option.value}`}
            label={option.label}
            icon={option.icon}
            selected={selected === option.value}
            onPress={() => onSelect(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Step 1 → Step 2 之間的過場。只是一條很淡的虛線加一株小芽 ——
 * 不是進度條、沒有百分比、沒有關卡感（§4）。
 */
function JourneyCue() {
  return (
    <View testID="review-journey-cue" style={styles.journeyCue} pointerEvents="none">
      <View style={styles.journeyDots}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={styles.journeyDot} />
        ))}
      </View>
      <View style={styles.journeySprout}>
        <TileGlyph name="sprout_emerging" selected={false} size={20} />
      </View>
      <View style={styles.journeyDots}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={styles.journeyDot} />
        ))}
      </View>
    </View>
  );
}

function ChoiceTile({
  testID,
  label,
  icon,
  selected,
  onPress,
}: {
  testID: string;
  label: string;
  icon: ReviewTileIcon;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      activeOpacity={0.86}
      style={[styles.tile, selected ? styles.tileSelected : styles.tileResting]}
    >
      {selected ? (
        <View style={styles.tileCheck}>
          <CheckMark />
        </View>
      ) : null}
      {/* 圖示直接站在 tile 上。原本包一圈圓底，等於把它壓成一個小色塊 ——
          辨識不出來是哪一株芽，四格看起來就都一樣。
          size=36：CHILD-REVIEW-V2-COMPACT-VIEWPORT 從預設 40 收到 34–38。 */}
      <TileGlyph name={icon} selected={selected} size={36} />
      <Text style={[styles.tileLabel, selected && styles.tileLabelSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SharedTermStrip({
  family,
  kind = 'shared_term',
}: {
  family: string;
  kind?: SharedTermNoticeKind;
}) {
  const notice = buildSharedTermNotice(family, kind);
  return (
    <View testID="review-shared-term-strip" style={styles.sharedStrip}>
      <View style={styles.sharedStripIcon}>
        <TileGlyph name="sprout_steady" selected size={22} />
      </View>
      <Text style={styles.sharedStripText}>{notice.message}</Text>
    </View>
  );
}

function PrimaryCta({
  label,
  onPress,
  loading = false,
  withArrow = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  withArrow?: boolean;
}) {
  return (
    <View style={styles.ctaDock}>
      <TouchableOpacity
        testID="review-cta"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ busy: loading, disabled: loading }}
        disabled={loading}
        onPress={onPress}
        activeOpacity={0.88}
        style={[styles.cta, loading && styles.ctaBusy]}
      >
        {loading ? (
          <ActivityIndicator color={Colors.bgSurface} />
        ) : (
          <View style={styles.ctaRow}>
            <Text style={styles.ctaText}>{label}</Text>
            {withArrow ? <ArrowRight /> : null}
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── 圖形：native SVG，不是 emoji、不是 raster 插畫（§12）─────────────────
//
// 八個圖示是**同一株芽的不同狀態**，共用同一組莖線與葉形，只有葉片數量、
// 角度、傾斜度不同。混用一堆來源不同的通用 icon 會讓四格看起來像四個 app。

/*
  八個圖示畫在同一個 40×40 grid 上，共用：

    莖      x = 20 的垂直線
    葉      同一條 teardrop 曲線，只換角度與長度
    筆畫    2.2（在 40px 的 tile 裡才有重量；原本 24 grid 上的 1.5 放大後像雜訊）
    配色    描邊 leaf600/700、填色 leaf100/200

  所以四格看起來是同一株植物的四種狀態，不是四個來源不同的 icon。
*/

const LEAF_RIGHT = 'M20 22c0-4.6 3.2-7.8 7.8-8.2-.4 4.8-3.4 7.8-7.8 8.2z';
const LEAF_LEFT = 'M20 27c0-4.6-3.2-7.8-7.8-8.2.4 4.8 3.4 7.8 7.8 8.2z';
const GROUND = 'M13 34h14';

function TileGlyph({
  name,
  selected,
  size = 40,
}: {
  name: ReviewTileIcon;
  selected: boolean;
  size?: number;
}) {
  const stroke = selected ? Colors.leaf700 : Colors.leaf600;
  const fill = selected ? Colors.leaf200 : Colors.leaf100;
  const line = {
    stroke,
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const leaf = { ...line, fill };
  const bare = { ...line, fill: 'none' };

  if (name === 'seed_thought') {
    return (
      <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden>
        <Ellipse cx={19} cy={30} rx={6} ry={4.6} {...leaf} />
        <Circle cx={27.5} cy={13} r={5.4} {...leaf} />
        <Circle cx={20.6} cy={21.4} r={1.9} fill={stroke} />
      </Svg>
    );
  }

  if (name === 'pencil_sprout') {
    return (
      <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden>
        <Path
          d="M9 32l1.8-6 14-14a2.6 2.6 0 013.7 0l1 1a2.6 2.6 0 010 3.7l-14 14z"
          {...leaf}
        />
        <Path d="M23 13.8l4.8 4.8" {...bare} />
        <Path d="M30 32c0-3.6 2.6-6.2 6.2-6.5-.3 3.8-2.8 6.2-6.2 6.5z" {...leaf} />
      </Svg>
    );
  }

  if (name === 'path_branch') {
    return (
      <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden>
        <Path d="M20 34v-7" {...bare} />
        <Path d="M20 27c0-6.6-4.2-11-10.4-11.8" {...bare} />
        <Path d="M20 27c0-6.6 4.2-11 10.4-11.8" {...bare} />
        <Circle cx={8.6} cy={13.4} r={3.2} {...leaf} />
        <Circle cx={31.4} cy={13.4} r={3.2} {...leaf} />
      </Svg>
    );
  }

  if (name === 'sprout_drooping') {
    // 葉子偏大、往下垂。是「重」，不是「枯」—— 兩片都還完整。
    return (
      <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden>
        <Path d="M20 34V16" {...bare} />
        <Path d="M20 19c4.8-1.6 9 .8 11.2 5.2-4.8 1.8-9-.6-11.2-5.2z" {...leaf} />
        <Path d="M20 25c-4.8-1.6-9 .8-11.2 5.2 4.8 1.8 9-.6 11.2-5.2z" {...leaf} />
      </Svg>
    );
  }

  if (name === 'sprout_emerging') {
    // 才剛冒出來：莖只有一半高，一片小葉，貼著地面。
    return (
      <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden>
        <Path d="M20 34v-9" {...bare} />
        <Path d="M20 25c0-3.8 2.6-6.4 6.4-6.8-.4 4-2.8 6.4-6.4 6.8z" {...leaf} />
        <Path d={GROUND} {...bare} />
      </Svg>
    );
  }

  if (name === 'sprout_light') {
    // 同一株，但只留一片葉、莖細一截 —— 輕鬆一點，不是做不好。
    return (
      <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden>
        <Path d="M20 34V18" {...bare} />
        <Path d={LEAF_RIGHT} {...leaf} />
      </Svg>
    );
  }

  if (name === 'sprout_check') {
    // steady ＋ 一個小勾。刻意畫在莖的右下、只有 8 個單位寬，
    // 不會和右上角那顆選取徽章搞混。
    return (
      <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden>
        <Path d="M20 34V16" {...bare} />
        <Path d={LEAF_RIGHT} {...leaf} />
        <Path d={LEAF_LEFT} {...leaf} />
        <Path d="M25.4 31.2l2.6 2.6 5-5" {...bare} />
      </Svg>
    );
  }

  // sprout_steady：兩片舒展對稱的葉 ＋ 站得住的地面。
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden>
      <Path d="M20 34V16" {...bare} />
      <Path d={LEAF_RIGHT} {...leaf} />
      <Path d={LEAF_LEFT} {...leaf} />
      <Path d={GROUND} {...bare} />
    </Svg>
  );
}

function CheckMark() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        d="M6 12.5l3.8 3.8L18 8"
        stroke={Colors.bgSurface}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function ArrowRight() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        d="M5 12h13M13 6.5l5.5 5.5L13 17.5"
        stroke={Colors.bgSurface}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function ArrowDown() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        d="M12 5v13M6.5 12.5L12 18l5.5-5.5"
        stroke={Colors.leaf500}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** hero 底下那塊很淡的形狀。純裝飾，不帶任何資訊。 */
function HeroShape() {
  return (
    <Svg width="100%" height={110} viewBox="0 0 320 110" accessibilityElementsHidden>
      <Ellipse cx={252} cy={44} rx={78} ry={62} fill={Colors.leaf50} opacity={0.9} />
      <Ellipse cx={196} cy={92} rx={96} ry={40} fill={Colors.cream100} opacity={0.75} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  // ── Hero ──────────────────────────────────────────────────────────────
  hero: {
    marginBottom: 2,
    paddingBottom: 2,
  },
  heroBackdrop: {
    position: 'absolute',
    top: -22,
    left: -24,
    right: -24,
    height: 110,
    overflow: 'hidden',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  heroCopy: { flex: 1, paddingTop: 2 },
  // 去背圖直接站在 hero 上：沒有圓形外框、沒有底色。固定寬高的 contain box ——
  // 換圖時不必回來調版面，任何比例都會被收進這個框裡。
  heroArt: {
    width: REVIEW_HERO_ART_WIDTH,
    height: REVIEW_HERO_ART_WIDTH,
  },
  heading: {
    color: Colors.fgPrimary,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '900',
    letterSpacing: 0.3,
    marginBottom: 6,
  },

  // CHILD-REVIEW-V2-COMPACT-VIEWPORT：evidence 區塊的垂直留白收緊，字級
  // 不動——收的是 padding／margin，不是正文可讀性。
  evidencePill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.cream100,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  evidenceText: {
    color: Colors.fgSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  evidenceFact: {
    marginTop: 5,
    marginLeft: 4,
    color: Colors.fgMuted,
    fontSize: 13,
    lineHeight: 19,
  },

  // ── Step ──────────────────────────────────────────────────────────────
  stepBlock: { marginTop: 13 },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginBottom: 9,
  },
  stepMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.leaf600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepMarkerText: {
    color: Colors.bgSurface,
    fontSize: 15,
    fontWeight: '900',
  },
  stepQuestion: {
    flex: 1,
    color: Colors.fgPrimary,
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '900',
    letterSpacing: 0.2,
  },

  journeyCue: {
    marginTop: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  journeyDots: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  journeyDot: {
    flex: 1,
    height: 1.5,
    marginHorizontal: 3,
    borderRadius: 1,
    backgroundColor: Colors.cream300,
  },
  journeySprout: { opacity: 0.85 },

  // ── Tile ──────────────────────────────────────────────────────────────
  // CHILD-REVIEW-V2-COMPACT-VIEWPORT：grid gap／tile 高度收緊，touch target
  // 仍然遠大於最小可點尺寸（44px）——minHeight 104–112 是給整顆 tile，不是
  // 卡在邊界。
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  tile: {
    // 兩欄。小裝置文字放不下時 flexWrap 會自然掉成一欄，不縮字。
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 150,
    minHeight: 108,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tileResting: {
    borderColor: Colors.cream200,
    // 非常輕的暖白。單一色調，不做多色遊戲化。
    backgroundColor: Colors.creamWish,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  tileSelected: {
    borderColor: Colors.leaf500,
    backgroundColor: Colors.leaf50,
    shadowColor: Colors.leaf700,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 9,
    elevation: 3,
  },
  // 內縮進卡片裡，不再咬出邊界。原本是一塊貼齊圓角的色塊，
  // 在小螢幕上會看起來像卡片破了一角。
  tileCheck: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: Colors.leaf600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    color: Colors.fgSecondary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    textAlign: 'center',
  },
  tileLabelSelected: { color: Colors.leaf700, fontWeight: '800' },

  // ── Shared term ───────────────────────────────────────────────────────
  sharedStrip: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: Colors.cream100,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  sharedStripIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.leaf50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedStripText: {
    flex: 1,
    color: Colors.fgSecondary,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },

  actionPanel: {
    marginTop: 4,
    borderRadius: 20,
    backgroundColor: Colors.cream50,
    borderWidth: 1,
    borderColor: Colors.cream200,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  actionPanelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionPanelIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.leaf50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPanelText: {
    flex: 1,
    color: Colors.fgSecondary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  actionPanelNote: {
    color: Colors.fgMuted,
    fontSize: 13,
    lineHeight: 20,
  },

  diffCard: {
    borderRadius: 16,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.cream200,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  diffLabel: { color: Colors.fgMuted, fontSize: 14, lineHeight: 20 },
  diffFrom: {
    color: Colors.fgMuted,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    textDecorationLine: 'line-through',
  },
  diffTo: {
    color: Colors.leaf700,
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '900',
  },
  diffArrow: { alignItems: 'center', paddingVertical: 6 },

  // ── 其他 ──────────────────────────────────────────────────────────────
  confirmationText: {
    marginTop: 6,
    color: Colors.fgSecondary,
    fontSize: 16,
    lineHeight: 24,
  },

  textInput: {
    marginTop: 6,
    minHeight: 104,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cream200,
    backgroundColor: Colors.bgSurface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.fgPrimary,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },

  notice: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: Colors.cream100,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeText: { color: Colors.fgMuted, fontSize: 13, lineHeight: 20 },

  errorText: {
    marginTop: 12,
    color: Colors.error,
    fontSize: 14,
    lineHeight: 20,
  },

  // ── CTA ───────────────────────────────────────────────────────────────
  // 底下留一塊暖底的安全區，讓按鈕不是直接貼著 sheet 邊緣。
  ctaDock: {
    marginTop: 26,
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: Colors.cream50,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  cta: {
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: Colors.leaf600,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    shadowColor: Colors.leaf700,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  ctaBusy: { opacity: 0.72 },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ctaText: {
    color: Colors.bgSurface,
    fontSize: 17.5,
    lineHeight: 25,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
