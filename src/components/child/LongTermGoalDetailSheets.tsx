import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Colors } from '../../constants/colors';
import type { PreferredTimeWindow } from '../../types/database';
import type {
  GoalCompletionRecord,
  GoalPresentation,
} from '../../screens/child/longTermGoalPresentation';

export type LongTermSheet =
  | 'menu'
  | 'details'
  | 'record'
  | 'review'
  | 'adjustment'
  | null;

export type ReviewDraft = {
  favoriteNote: string;
  preferredWindow: PreferredTimeWindow | 'either' | 'unsure' | null;
  nextStep: 'keep' | 'time' | 'frequency' | 'method' | null;
};

export type AdjustmentDraft =
  | 'time'
  | 'frequency'
  | 'method'
  | 'content'
  | 'pause'
  | 'discuss';

/**
 * 共同計畫的換時段通道（P0-8M）。
 *
 * 只有在畫面確定「這是一份進行中的共同閱讀計畫」時才會傳進來。傳 undefined
 * 代表沒有這條通道 —— 一般家長建立的長期任務走的就是這條，回顧仍然只留草稿。
 */
export type SharedPlanTimeAdjustment = {
  /** 目前雙方談定的時段。用來判斷孩子選的是不是真的不一樣。 */
  currentPreferredTime: SharedPlanTimeWindow | null;
  /** 已經送出、等家長確認。此時不能再送第二次。 */
  pending: boolean;
  submitting: boolean;
  error: string | null;
  submitted: boolean;
  onSubmit: (preferredTime: SharedPlanTimeWindow) => Promise<boolean>;
};

type SharedPlanTimeWindow = PreferredTimeWindow;

const PENDING_COPY = '已送給爸媽，等一起確認。';
const SUBMITTED_COPY = '已經告訴爸媽了。一起確認後，計畫才會更新。';

type OpenSheet = Exclude<LongTermSheet, null>;

type Props = {
  activeSheet: LongTermSheet;
  onClose: () => void;
  onOpenSheet: (sheet: OpenSheet) => void;
  presentation: GoalPresentation;
  completion: GoalCompletionRecord | null;
  taskMinutes: number;
  reviewDraft: ReviewDraft;
  adjustmentDraft: AdjustmentDraft | null;
  onSaveReviewDraft: (draft: ReviewDraft) => void;
  onSaveAdjustmentDraft: (draft: AdjustmentDraft) => void;
  onCorrectTimeWindow: (
    timeWindow: PreferredTimeWindow,
  ) => void | Promise<void>;
  correctingTimeWindow?: boolean;
  sharedPlanTimeAdjustment?: SharedPlanTimeAdjustment;
};

type IconName = 'close' | 'details' | 'adjust' | 'pause' | 'record';

const TIME_WINDOW_LABELS: Record<PreferredTimeWindow, string> = {
  after_dinner: '晚餐後',
  before_bed: '睡前',
};

const REVIEW_TIME_OPTIONS: Array<{
  value: ReviewDraft['preferredWindow'];
  label: string;
}> = [
  { value: 'after_dinner', label: '晚餐後' },
  { value: 'before_bed', label: '睡前' },
  { value: 'either', label: '都適合' },
  { value: 'unsure', label: '還不確定' },
];

const READING_REVIEW_NEXT_OPTIONS: Array<{
  value: NonNullable<ReviewDraft['nextStep']>;
  label: string;
}> = [
  { value: 'keep', label: '維持現在安排' },
  { value: 'time', label: '調整時間' },
  { value: 'frequency', label: '調整次數' },
  { value: 'method', label: '調整方式' },
];

const GENERAL_REVIEW_NEXT_OPTIONS: Array<{
  value: NonNullable<ReviewDraft['nextStep']>;
  label: string;
}> = [
  { value: 'keep', label: '維持現在安排' },
  { value: 'time', label: '調整進行時間' },
  { value: 'frequency', label: '調整每週安排' },
  { value: 'method', label: '調整進行方式' },
];

const READING_ADJUSTMENT_OPTIONS: Array<{
  value: AdjustmentDraft;
  label: string;
}> = [
  { value: 'time', label: '想換一個閱讀時段' },
  { value: 'frequency', label: '想調整每週次數' },
  { value: 'method', label: '想換一種進行方式' },
  { value: 'content', label: '想調整閱讀內容' },
  { value: 'pause', label: '想先暫停一下' },
  { value: 'discuss', label: '想和家人討論' },
];

type PresentationKind = GoalPresentation['goalKind'];

function getReviewPrompt(kind: PresentationKind): string {
  if (kind === 'reading_habit') return '這週最喜歡哪一本書或哪一段？';
  if (kind === 'skill') return '這週哪一段練習最有感？';
  if (kind === 'family') return '這週哪一次一起做最有感？';
  if (kind === 'challenge') return '這週哪一步最有感？';
  return '這週哪一段最有感？';
}

function getAdjustmentOptions(
  kind: PresentationKind,
): Array<{ value: AdjustmentDraft; label: string }> {
  if (kind === 'reading_habit') return READING_ADJUSTMENT_OPTIONS;

  const contentLabel =
    kind === 'skill'
      ? '想調整練習內容'
      : kind === 'family'
        ? '想調整參與內容'
        : kind === 'challenge'
          ? '想調整挑戰內容'
          : '想調整進行內容';

  return [
    { value: 'time', label: '想調整進行時間' },
    { value: 'frequency', label: '想調整每週安排' },
    { value: 'method', label: '想換一種進行方式' },
    { value: 'content', label: contentLabel },
    { value: 'pause', label: '想先暫停一下' },
    { value: 'discuss', label: '想和家人討論' },
  ];
}

const SHEET_TITLES: Record<OpenSheet, string> = {
  menu: '計畫選單',
  details: '目標詳情',
  record: '今天的紀錄',
  review: '一起回顧',
  adjustment: '提出調整',
};

const CLOSE_LABELS: Record<OpenSheet, string> = {
  menu: '關閉長期任務選單',
  details: '關閉目標詳情',
  record: '關閉今天的紀錄',
  review: '關閉週末回顧',
  adjustment: '關閉調整選單',
};

function SheetIcon({ name, color = Colors.fgSecondary }: {
  name: IconName;
  color?: string;
}) {
  if (name === 'close') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path
          d="M6 6l12 12M18 6L6 18"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  if (name === 'pause') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
        <Path
          d="M9.5 8.5v7M14.5 8.5v7"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  if (name === 'adjust') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path
          d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  if (name === 'record') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path
          d="M6 4h9l3 3v13H6zM9 11h6M9 15h6"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    );
  }

  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function OptionButton({
  label,
  selected,
  disabled = false,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.76}
      style={[
        styles.optionButton,
        selected && styles.optionButtonSelected,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.optionMarker, selected && styles.optionMarkerSelected]}>
        {selected ? <View style={styles.optionMarkerDot} /> : null}
      </View>
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function MenuRow({
  label,
  detail,
  icon,
  onPress,
}: {
  label: string;
  detail: string;
  icon: IconName;
  onPress: () => void;
}) {
  return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={detail}
        onPress={onPress}
      activeOpacity={0.76}
      style={styles.menuRow}
    >
      <View style={styles.menuIcon}>
        <SheetIcon name={icon} color={Colors.accent} />
      </View>
      <View style={styles.menuCopy}>
        <Text style={styles.menuTitle}>{label}</Text>
        <Text accessible={false} style={styles.menuDetail}>{detail}</Text>
      </View>
      <Text style={styles.chevron} accessibilityElementsHidden>
        ›
      </Text>
    </TouchableOpacity>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  disabled = false,
  loading = false,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      activeOpacity={0.78}
      style={[styles.primaryButton, (disabled || loading) && styles.disabled]}
    >
      {loading ? (
        <ActivityIndicator color={Colors.bgSurface} />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

function formatCompletionDate(completedAt: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(completedAt));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${value('year')}/${value('month')}/${value('day')}`;
}

function formatCompletionTime(completedAt: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(completedAt));
}

function MenuSheet({
  onOpenSheet,
  onPause,
}: {
  onOpenSheet: (sheet: OpenSheet) => void;
  onPause: () => void;
}) {
  return (
    <View>
      <MenuRow
        label="查看計畫詳情"
        detail="查看期間、完成方式與可以調整的內容"
        icon="details"
        onPress={() => onOpenSheet('details')}
      />
      <MenuRow
        label="提出調整"
        detail="先把想改的地方保留在這個畫面"
        icon="adjust"
        onPress={() => onOpenSheet('adjustment')}
      />
      <MenuRow
        label="暫停一下"
        detail="先提出想暫停的想法，不會直接改變計畫"
        icon="pause"
        onPress={onPause}
      />
    </View>
  );
}

function DetailsSheet({
  presentation,
  onOpenSheet,
}: {
  presentation: GoalPresentation;
  onOpenSheet: (sheet: OpenSheet) => void;
}) {
  const preferredTime = presentation.preferredTimeWindow
    ? TIME_WINDOW_LABELS[presentation.preferredTimeWindow]
    : '未設定固定時段';

  return (
    <View>
      {presentation.planNotice ? (
        <View
          accessible
          accessibilityRole="summary"
          accessibilityLabel={`計畫提醒：${presentation.planNotice}`}
          style={styles.planNotice}
        >
          <Text style={styles.planNoticeText}>{presentation.planNotice}</Text>
        </View>
      ) : null}
      <View style={styles.detailList}>
        <DetailRow label="計畫期間" value={presentation.planPeriodLabel} />
        <DetailRow label="目標類型" value={presentation.categoryLabel} />
        <DetailRow label="完成條件" value={presentation.completionConditionLabel} />
        <DetailRow label="建議時段" value={preferredTime} />
        <DetailRow label="可調整項目" value={presentation.adjustableItemsLabel} />
      </View>
      <PrimaryButton
        label="提出調整"
        onPress={() => onOpenSheet('adjustment')}
      />
    </View>
  );
}

function RecordSheet({
  presentation,
  completion,
  taskMinutes,
  onCorrectTimeWindow,
  correctingTimeWindow = false,
}: Pick<
  Props,
  | 'presentation'
  | 'completion'
  | 'taskMinutes'
  | 'onCorrectTimeWindow'
  | 'correctingTimeWindow'
>) {
  const [lastConfirmedWindow, setLastConfirmedWindow] =
    useState<PreferredTimeWindow | null>(
      completion?.planned_time_window ?? null,
    );
  const [localLoading, setLocalLoading] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const correctionPendingRef = useRef(false);

  useEffect(() => {
    setLastConfirmedWindow(completion?.planned_time_window ?? null);
    setCorrectionError(null);
  }, [completion?.id, completion?.planned_time_window]);

  if (!completion) {
    return (
      <View style={styles.emptyState}>
        <SheetIcon name="record" color={Colors.fgMuted} />
        <Text style={styles.emptyText}>今天還沒有可查看的完成紀錄。</Text>
      </View>
    );
  }

  const handleCorrection = async (timeWindow: PreferredTimeWindow) => {
    if (correctionPendingRef.current || correctingTimeWindow) return;

    correctionPendingRef.current = true;
    setLocalLoading(true);
    setCorrectionError(null);
    try {
      await onCorrectTimeWindow(timeWindow);
      setLastConfirmedWindow(timeWindow);
    } catch {
      setCorrectionError('更正失敗，請再試一次。');
    } finally {
      correctionPendingRef.current = false;
      setLocalLoading(false);
    }
  };
  const loading = correctingTimeWindow || localLoading;
  const isReadingPlan = presentation.goalKind === 'reading_habit';

  return (
    <View>
      <View style={styles.recordSummary}>
        <DetailRow
          label="完成日期"
          value={formatCompletionDate(completion.completed_at)}
        />
        <DetailRow
          label="計畫時間"
          value={`${taskMinutes} 分鐘`}
        />
        <DetailRow
          label="完成時段"
          value={
            isReadingPlan
              ? lastConfirmedWindow
                ? TIME_WINDOW_LABELS[lastConfirmedWindow]
                : '尚未記錄時段'
              : formatCompletionTime(completion.completed_at)
          }
        />
      </View>

      {isReadingPlan ? (
        <>
          <Text style={styles.questionLabel}>需要更正時段嗎？</Text>
          <View style={styles.optionGrid}>
            {(
              Object.entries(TIME_WINDOW_LABELS) as Array<
                [PreferredTimeWindow, string]
              >
            ).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{
                  selected: lastConfirmedWindow === value,
                  disabled: loading,
                }}
                disabled={loading}
                onPress={() => handleCorrection(value)}
                activeOpacity={0.76}
                style={[
                  styles.compactOption,
                  lastConfirmedWindow === value && styles.compactOptionSelected,
                  loading && styles.disabled,
                ]}
              >
                <Text
                  style={[
                    styles.compactOptionText,
                    lastConfirmedWindow === value &&
                      styles.compactOptionTextSelected,
                  ]}
                >
                  改成{label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Colors.accent} />
              <Text style={styles.loadingText}>正在更正紀錄</Text>
            </View>
          ) : null}
          {correctionError ? (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={styles.errorText}
            >
              {correctionError}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/**
 * 孩子選的時段值 —— 只有 after_dinner / before_bed 送得出去。
 * 「都適合」「還不確定」是回顧用的答案，不是一個計畫可以寫進去的時段。
 */
function submittableWindow(
  value: ReviewDraft['preferredWindow'],
): PreferredTimeWindow | null {
  return value === 'after_dinner' || value === 'before_bed' ? value : null;
}

function ReviewSheet({
  presentation,
  draft,
  onChange,
  onSave,
  sharedPlan,
  onDismiss,
}: {
  presentation: GoalPresentation;
  draft: ReviewDraft;
  onChange: (draft: ReviewDraft) => void;
  onSave: () => void;
  sharedPlan?: SharedPlanTimeAdjustment;
  onDismiss: () => void;
}) {
  const kind = presentation.goalKind;
  const isReadingPlan = kind === 'reading_habit';
  const nextOptions = isReadingPlan
    ? READING_REVIEW_NEXT_OPTIONS
    : GENERAL_REVIEW_NEXT_OPTIONS;

  /*
    什麼情況才真的送出去 —— 五個條件全部成立才行：

      1. 這是共同計畫（sharedPlan 有值）
      2. 這是閱讀計畫
      3. 孩子選的下一步是「調整時間」
      4. 選到的是可送出的時段值
      5. 那個時段和目前談定的不一樣

    少一個就退回原本的 local draft 行為。特別是 (1)：一般家長建立的長期任務
    也有「調整時間」這個選項，但它沒有提案，不該進協商 RPC。
  */
  const chosenWindow = submittableWindow(draft.preferredWindow);
  const wantsTimeChange = isReadingPlan && draft.nextStep === 'time';
  const canSend = Boolean(sharedPlan)
    && wantsTimeChange
    && chosenWindow !== null
    && !sharedPlan!.pending
    && sharedPlan!.currentPreferredTime !== chosenWindow;

  // 送出失敗時**不**動 draft —— 孩子剛做完回顧，清掉等於要他從頭再選一次。
  const handleSend = () => { void sharedPlan?.onSubmit(chosenWindow!); };

  if (sharedPlan?.submitted) {
    return (
      <View>
        <Text style={styles.sheetIntro}>{SUBMITTED_COPY}</Text>
        <PrimaryButton label="知道了" onPress={onDismiss} />
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.questionLabel}>{getReviewPrompt(kind)}</Text>
      <TextInput
        accessibilityLabel={isReadingPlan ? '最喜歡的閱讀內容' : '這週最有感的片段'}
        placeholder={
          isReadingPlan
            ? '想記下哪一本書或哪一段？'
            : '想記下這週最有感的一段嗎？'
        }
        placeholderTextColor={Colors.fgMuted}
        value={draft.favoriteNote}
        onChangeText={(favoriteNote) => onChange({ ...draft, favoriteNote })}
        multiline
        maxLength={160}
        style={styles.textInput}
      />

      {isReadingPlan ? (
        <>
          <Text style={styles.questionLabel}>哪個時間比較適合？</Text>
          <View style={styles.optionGrid}>
            {REVIEW_TIME_OPTIONS.map((option) => (
              <OptionButton
                key={option.label}
                label={option.label}
                selected={draft.preferredWindow === option.value}
                onPress={() =>
                  onChange({ ...draft, preferredWindow: option.value })
                }
              />
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.questionLabel}>下週想維持還是調整？</Text>
      <View style={styles.optionGrid}>
        {nextOptions.map((option) => (
          <OptionButton
            key={option.value}
            label={option.label}
            selected={draft.nextStep === option.value}
            onPress={() => onChange({ ...draft, nextStep: option.value })}
          />
        ))}
      </View>

      {sharedPlan?.pending ? (
        <View style={styles.localNotice}>
          <Text style={styles.localNoticeText}>{PENDING_COPY}</Text>
        </View>
      ) : (
        <View style={styles.localNotice}>
          <Text style={styles.localNoticeText}>
            {canSend
              ? '送出之後爸媽會看到，一起確認後計畫才會更新。'
              : '這份回答目前只保留在這個畫面，尚未送出給家長。'}
          </Text>
        </View>
      )}

      {sharedPlan?.error ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.errorText}
        >
          {sharedPlan.error}
        </Text>
      ) : null}

      {canSend ? (
        <PrimaryButton
          label="送給爸媽一起確認"
          loading={sharedPlan?.submitting}
          onPress={handleSend}
        />
      ) : (
        <PrimaryButton label="保留回顧草稿" onPress={onSave} />
      )}
    </View>
  );
}

function AdjustmentSheet({
  presentation,
  selected,
  onSelect,
  onSave,
}: {
  presentation: GoalPresentation;
  selected: AdjustmentDraft | null;
  onSelect: (draft: AdjustmentDraft) => void;
  onSave: () => void;
}) {
  const options = getAdjustmentOptions(presentation.goalKind);

  return (
    <View>
      <Text style={styles.sheetIntro}>
        先選一個最想調整的地方，之後可以再和家人一起討論。
      </Text>
      <View style={styles.adjustmentList}>
        {options.map((option) => (
          <OptionButton
            key={option.value}
            label={option.label}
            selected={selected === option.value}
            onPress={() => onSelect(option.value)}
          />
        ))}
      </View>
      <View style={styles.localNotice}>
        <Text style={styles.localNoticeText}>
          這個選擇目前只保留在這個畫面，尚未送出給家長或套用到計畫。
        </Text>
      </View>
      <PrimaryButton
        label="保留調整草稿"
        disabled={!selected}
        onPress={onSave}
      />
    </View>
  );
}

export default function LongTermGoalDetailSheets({
  activeSheet,
  onClose,
  onOpenSheet,
  presentation,
  completion,
  taskMinutes,
  reviewDraft,
  adjustmentDraft,
  onSaveReviewDraft,
  onSaveAdjustmentDraft,
  onCorrectTimeWindow,
  correctingTimeWindow = false,
  sharedPlanTimeAdjustment,
}: Props) {
  const [localReviewDraft, setLocalReviewDraft] = useState(reviewDraft);
  const [localAdjustmentDraft, setLocalAdjustmentDraft] =
    useState<AdjustmentDraft | null>(adjustmentDraft);
  const pauseRequestRef = useRef(false);

  useEffect(() => {
    setLocalReviewDraft(reviewDraft);
  }, [
    activeSheet,
    reviewDraft.favoriteNote,
    reviewDraft.preferredWindow,
    reviewDraft.nextStep,
  ]);

  useEffect(() => {
    if (activeSheet === 'adjustment' && pauseRequestRef.current) {
      pauseRequestRef.current = false;
      setLocalAdjustmentDraft('pause');
      return;
    }

    setLocalAdjustmentDraft(adjustmentDraft);
  }, [activeSheet, adjustmentDraft]);

  if (!activeSheet) return null;

  const handlePause = () => {
    pauseRequestRef.current = true;
    setLocalAdjustmentDraft('pause');
    onOpenSheet('adjustment');
  };

  const handleSaveReview = () => {
    onSaveReviewDraft(localReviewDraft);
    onClose();
  };

  const handleSaveAdjustment = () => {
    if (!localAdjustmentDraft) return;
    onSaveAdjustmentDraft(localAdjustmentDraft);
    onClose();
  };

  let content: React.ReactNode;
  switch (activeSheet) {
    case 'menu':
      content = (
        <MenuSheet onOpenSheet={onOpenSheet} onPause={handlePause} />
      );
      break;
    case 'details':
      content = (
        <DetailsSheet
          presentation={presentation}
          onOpenSheet={onOpenSheet}
        />
      );
      break;
    case 'record':
      content = (
        <RecordSheet
          presentation={presentation}
          completion={completion}
          taskMinutes={taskMinutes}
          onCorrectTimeWindow={onCorrectTimeWindow}
          correctingTimeWindow={correctingTimeWindow}
        />
      );
      break;
    case 'review':
      content = (
        <ReviewSheet
          presentation={presentation}
          draft={localReviewDraft}
          onChange={setLocalReviewDraft}
          onSave={handleSaveReview}
          sharedPlan={sharedPlanTimeAdjustment}
          onDismiss={onClose}
        />
      );
      break;
    case 'adjustment':
      content = (
        <AdjustmentSheet
          presentation={presentation}
          selected={localAdjustmentDraft}
          onSelect={setLocalAdjustmentDraft}
          onSave={handleSaveAdjustment}
        />
      );
      break;
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View
          accessibilityViewIsModal
          style={styles.sheet}
        >
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{SHEET_TITLES[activeSheet]}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={CLOSE_LABELS[activeSheet]}
              onPress={onClose}
              activeOpacity={0.72}
              style={styles.closeButton}
            >
              <SheetIcon name="close" />
            </TouchableOpacity>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetContent}
          >
            {content}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.shadowWarm,
    opacity: 0.32,
  },
  sheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: Colors.bgSurface,
    shadowColor: Colors.shadowWarm,
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.13,
    shadowRadius: 16,
    elevation: 12,
  },
  sheetHeader: {
    minHeight: 64,
    paddingLeft: 20,
    paddingRight: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetTitle: {
    flex: 1,
    color: Colors.fgPrimary,
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '900',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 30,
  },
  menuRow: {
    minHeight: 68,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  menuIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: Colors.leaf50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCopy: {
    flex: 1,
    minWidth: 0,
  },
  menuTitle: {
    color: Colors.fgPrimary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
  },
  menuDetail: {
    marginTop: 3,
    color: Colors.fgMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  chevron: {
    color: Colors.fgMuted,
    fontSize: 28,
    lineHeight: 30,
  },
  detailList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.hairline,
  },
  planNotice: {
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
    backgroundColor: Colors.gold100,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  planNoticeText: {
    color: Colors.fgSecondary,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
  },
  detailRow: {
    minHeight: 50,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.hairline,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 12,
  },
  detailLabel: {
    width: 82,
    color: Colors.fgMuted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
  },
  detailValue: {
    flex: 1,
    color: Colors.fgPrimary,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    textAlign: 'right',
  },
  primaryButton: {
    minHeight: 48,
    marginTop: 18,
    borderRadius: 8,
    paddingHorizontal: 18,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: Colors.bgSurface,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '900',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.48,
  },
  optionButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: Colors.borderMedium,
    borderRadius: 8,
    backgroundColor: Colors.bgSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  optionButtonSelected: {
    borderColor: Colors.leaf400,
    backgroundColor: Colors.leaf50,
  },
  optionMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Colors.ink300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionMarkerSelected: {
    borderColor: Colors.accent,
  },
  optionMarkerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  optionText: {
    flex: 1,
    color: Colors.fgSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  optionTextSelected: {
    color: Colors.leaf700,
  },
  recordSummary: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.hairline,
  },
  questionLabel: {
    marginTop: 18,
    marginBottom: 9,
    color: Colors.fgPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
  },
  optionGrid: {
    gap: 8,
  },
  compactOption: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: Colors.borderMedium,
    borderRadius: 8,
    backgroundColor: Colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  compactOptionSelected: {
    borderColor: Colors.leaf400,
    backgroundColor: Colors.leaf50,
  },
  compactOptionText: {
    color: Colors.fgSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  compactOptionTextSelected: {
    color: Colors.leaf700,
  },
  loadingRow: {
    minHeight: 44,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    color: Colors.fgMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    minHeight: 44,
    marginTop: 8,
    color: Colors.error,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  emptyState: {
    minHeight: 110,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyText: {
    color: Colors.fgMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  textInput: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: Colors.borderMedium,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.fgPrimary,
    backgroundColor: Colors.cream50,
    fontSize: 14,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  sheetIntro: {
    marginBottom: 12,
    color: Colors.fgSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  adjustmentList: {
    gap: 8,
  },
  localNotice: {
    marginTop: 16,
    borderLeftWidth: 3,
    borderLeftColor: Colors.leaf300,
    backgroundColor: Colors.leaf50,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  localNoticeText: {
    color: Colors.fgSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
});
