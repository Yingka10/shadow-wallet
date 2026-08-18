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

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Colors } from '../../constants/colors';
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
  type ReviewExperience,
  type ReviewOption,
  type ReviewTileIcon,
  type ReviewTimeWindow,
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
        <SheetHeading />
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
        <SheetHeading />
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
        <SheetHeading />
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
        <SheetHeading />
        <Text style={styles.stepQuestion}>你比較想從哪裡調整？</Text>
        {dimensions.length > 0 ? (
          <View style={styles.tileGrid}>
            {dimensions.map((option) => (
              <ChoiceTile
                key={option.value}
                testID={`review-dimension-${option.value}`}
                label={option.label}
                icon="sparkle"
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
        <SheetHeading />
        <Text style={styles.stepQuestion}>下一段想換成哪一種？</Text>
        {/* 這裡列的是**這份計畫真的換得動**的做法，不是 AI 生的可能性清單。 */}
        <View style={styles.tileGrid}>
          {approaches.map((option) => (
            <ChoiceTile
              key={option.value}
              testID={`review-approach-${option.value}`}
              label={option.label}
              icon="swap"
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
            <SharedTermStrip family={family} />
            <PrimaryCta
              label={buildSharedTermNotice(family).cta}
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
        <SheetHeading />
        <Text style={styles.stepQuestion}>這樣改可以嗎？</Text>
        {diff ? (
          <View testID="review-shared-term-diff" style={styles.diffCard}>
            <View style={styles.diffRow}>
              <Text style={styles.diffLabel}>原本</Text>
              <Text style={styles.diffFrom}>{diff.fromLabel}</Text>
            </View>
            <View style={styles.diffArrow}>
              <Text style={styles.diffArrowText}>↓</Text>
            </View>
            <View style={styles.diffRow}>
              <Text style={styles.diffLabel}>想改成</Text>
              <Text style={styles.diffTo}>{diff.toLabel}</Text>
            </View>
          </View>
        ) : null}
        <SharedTermStrip family={family} />
        {channel?.pending ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              {`已送給${family}，等一起確認。`}
            </Text>
          </View>
        ) : null}
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
            label={buildSharedTermNotice(family).cta}
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
      <SheetHeading />

      {/* Evidence：先看見這段發生什麼，不是一開啟就被問問題。 */}
      <View testID="review-evidence" style={styles.evidencePill}>
        <Text style={styles.evidenceText}>{evidence.contextSentence}</Text>
      </View>
      {evidence.agreedFact ? (
        <Text testID="review-evidence-fact" style={styles.evidenceFact}>
          {evidence.agreedFact}
        </Text>
      ) : null}

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
          <View style={styles.stepDivider} />
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

      {cta ? <PrimaryCta label={cta} onPress={handlePrimary} /> : null}
    </View>
  );
}

// ── 零件 ───────────────────────────────────────────────────────────────

function SheetHeading() {
  return (
    <View style={styles.headingRow}>
      <Text style={styles.heading}>一起回顧</Text>
      <SproutMark />
    </View>
  );
}

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
      activeOpacity={0.82}
      style={[styles.tile, selected && styles.tileSelected]}
    >
      {selected ? (
        <View style={styles.tileCheck}>
          <CheckMark />
        </View>
      ) : null}
      <View style={styles.tileIcon}>
        <TileGlyph name={icon} selected={selected} />
      </View>
      <Text style={[styles.tileLabel, selected && styles.tileLabelSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SharedTermStrip({ family }: { family: string }) {
  const notice = buildSharedTermNotice(family);
  return (
    <View testID="review-shared-term-strip" style={styles.sharedStrip}>
      <Text style={styles.sharedStripText}>{notice.message}</Text>
    </View>
  );
}

function PrimaryCta({
  label,
  onPress,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      testID="review-cta"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading, disabled: loading }}
      disabled={loading}
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.cta, loading && styles.ctaBusy]}
    >
      {loading ? (
        <ActivityIndicator color={Colors.bgSurface} />
      ) : (
        <Text style={styles.ctaText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

// ── 圖形：native SVG，不是 emoji、不是 raster 插畫（§12）─────────────────

function TileGlyph({ name, selected }: { name: ReviewTileIcon; selected: boolean }) {
  const color = selected ? Colors.leaf700 : Colors.leaf500;
  const size = 26;

  if (name === 'thought') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path
          d="M7.5 15.5a4 4 0 01-.4-7.98A4.5 4.5 0 0116 6.6a3.7 3.7 0 01.6 7.35z"
          stroke={color}
          strokeWidth={1.6}
          fill="none"
          strokeLinejoin="round"
        />
        <Circle cx={8} cy={19} r={1.5} fill={color} />
      </Svg>
    );
  }

  if (name === 'check') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Circle cx={12} cy={12} r={9} fill={color} />
        <Path
          d="M8 12.4l2.6 2.6L16 9.6"
          stroke={Colors.bgSurface}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    );
  }

  if (name === 'swap') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path
          d="M5 10a7 7 0 0111.6-3.3M19 14a7 7 0 01-11.6 3.3"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M16.8 3.6v3.2h-3.2M7.2 20.4v-3.2h3.2"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    );
  }

  if (name === 'pencil') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path
          d="M4.5 19.5l1-4L15.3 5.7a1.8 1.8 0 012.6 0l.4.4a1.8 1.8 0 010 2.6L8.5 18.5z"
          stroke={color}
          strokeWidth={1.6}
          fill="none"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (name === 'sparkle') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path
          d="M12 20V11M12 11c0-2.6 1.9-4.7 4.4-5-.2 2.8-2 4.7-4.4 5zM12 13c0-2.3-1.7-4.2-3.9-4.5.1 2.5 1.7 4.2 3.9 4.5z"
          stroke={color}
          strokeWidth={1.6}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M18.6 4.4l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z"
          fill={color}
        />
      </Svg>
    );
  }

  // sprout / seedling / branch —— 同一株芽的三個生長階段，不是三個不同的東西。
  const leaves = name === 'sprout'
    ? 'M12 18v-5M12 13c0-2.2 1.6-4 3.8-4.3-.2 2.4-1.7 4-3.8 4.3z'
    : name === 'branch'
      ? 'M12 19v-8M12 13c0-2.2 1.6-4 3.8-4.3-.2 2.4-1.7 4-3.8 4.3zM12 16c0-2-1.5-3.6-3.5-3.9.1 2.2 1.5 3.6 3.5 3.9z'
      : 'M12 19v-6M12 14c0-2.3 1.7-4.2 4-4.5-.2 2.5-1.8 4.2-4 4.5zM12 17c0-2.3-1.7-4.2-4-4.5.2 2.5 1.8 4.2 4 4.5zM12 11c0-2 1.4-3.6 3.4-3.9-.1 2.1-1.4 3.6-3.4 3.9z';

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        d={leaves}
        stroke={color}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CheckMark() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        d="M6 12.5l3.8 3.8L18 8"
        stroke={Colors.bgSurface}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function SproutMark() {
  return (
    <Svg width={54} height={54} viewBox="0 0 54 54" accessibilityElementsHidden>
      <Circle cx={27} cy={27} r={26} fill={Colors.leaf50} />
      <Path
        d="M27 40V22"
        stroke={Colors.leaf700}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <Path
        d="M27 26c0-4.4 3.2-8 7.6-8.6-.4 4.8-3.5 8-7.6 8.6zM27 31c0-4.4-3.2-8-7.6-8.6.4 4.8 3.5 8 7.6 8.6z"
        fill={Colors.leaf300}
        stroke={Colors.leaf600}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  heading: {
    flex: 1,
    color: Colors.fgPrimary,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '900',
  },

  evidencePill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.cream100,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  evidenceText: {
    color: Colors.fgSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  evidenceFact: {
    marginTop: 8,
    marginLeft: 4,
    color: Colors.fgMuted,
    fontSize: 13,
    lineHeight: 19,
  },

  stepBlock: { marginTop: 22 },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  stepMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.leaf600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepMarkerText: {
    color: Colors.bgSurface,
    fontSize: 14,
    fontWeight: '800',
  },
  stepQuestion: {
    flex: 1,
    color: Colors.fgPrimary,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '800',
  },
  stepDivider: {
    marginTop: 24,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.hairline,
  },

  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    // 兩欄。小裝置文字放不下時 flexWrap 會自然掉成一欄，不縮字。
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 150,
    minHeight: 108,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.cream200,
    backgroundColor: Colors.cream50,
    paddingHorizontal: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  tileSelected: {
    borderColor: Colors.leaf500,
    backgroundColor: Colors.leaf50,
  },
  tileCheck: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 30,
    height: 30,
    borderTopRightRadius: 15,
    borderBottomLeftRadius: 15,
    backgroundColor: Colors.leaf600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIcon: { height: 28, justifyContent: 'center' },
  tileLabel: {
    color: Colors.fgSecondary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    textAlign: 'center',
  },
  tileLabelSelected: { color: Colors.leaf700 },

  sharedStrip: {
    marginTop: 18,
    borderRadius: 14,
    backgroundColor: Colors.cream100,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sharedStripText: {
    color: Colors.fgSecondary,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },

  diffCard: {
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cream200,
    backgroundColor: Colors.cream50,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  diffLabel: { color: Colors.fgMuted, fontSize: 14, lineHeight: 20 },
  diffFrom: {
    color: Colors.fgSecondary,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  diffTo: {
    color: Colors.leaf700,
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '900',
  },
  diffArrow: { alignItems: 'center', paddingVertical: 4 },
  diffArrowText: { color: Colors.leaf500, fontSize: 16, fontWeight: '800' },

  confirmationText: {
    color: Colors.fgSecondary,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 8,
  },

  textInput: {
    marginTop: 4,
    minHeight: 96,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cream200,
    backgroundColor: Colors.cream50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.fgPrimary,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },

  notice: {
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: Colors.cream100,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  noticeText: { color: Colors.fgMuted, fontSize: 13, lineHeight: 20 },

  errorText: {
    marginTop: 12,
    color: Colors.error,
    fontSize: 14,
    lineHeight: 20,
  },

  cta: {
    marginTop: 22,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: Colors.leaf600,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  ctaBusy: { opacity: 0.72 },
  ctaText: {
    color: Colors.bgSurface,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
  },
});
