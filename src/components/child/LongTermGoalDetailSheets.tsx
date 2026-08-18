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
  GoalRecentRecord,
} from '../../screens/child/longTermGoalPresentation';
import TogetherReviewSheet, {
  type ReviewCadenceChannel,
  type ReviewTimeChannel,
} from './TogetherReviewSheet';

export type LongTermSheet =
  | 'menu'
  | 'details'
  | 'record'
  | 'review'
  | 'adjustment'
  | null;

export type AdjustmentDraft =
  | 'time'
  | 'frequency'
  | 'method'
  | 'content'
  | 'pause'
  | 'discuss';

type OpenSheet = Exclude<LongTermSheet, null>;

type Props = {
  activeSheet: LongTermSheet;
  onClose: () => void;
  onOpenSheet: (sheet: OpenSheet) => void;
  /** 選一筆最近紀錄去更正——menu 選單裡「最近紀錄」那段用的。 */
  onOpenRecord?: (completionId?: string) => void;
  presentation: GoalPresentation;
  completion: GoalCompletionRecord | null;
  taskMinutes: number;
  adjustmentDraft: AdjustmentDraft | null;
  onSaveAdjustmentDraft: (draft: AdjustmentDraft) => void;
  /** canonical 家長稱謂。沒有就沿用畫面既有的中性集合稱呼。 */
  parentLabel?: string | null;
  /** 每週次數的重新協商通道（P1 cadence lane）。 */
  reviewCadenceChannel?: ReviewCadenceChannel;
  /** 換時段的重新協商通道（P0-8M）。 */
  reviewTimeChannel?: ReviewTimeChannel;
  onCorrectTimeWindow: (
    timeWindow: PreferredTimeWindow,
  ) => void | Promise<void>;
  correctingTimeWindow?: boolean;
};

type IconName = 'close' | 'details' | 'adjust' | 'pause' | 'record';

const TIME_WINDOW_LABELS: Record<PreferredTimeWindow, string> = {
  after_dinner: '晚餐後',
  before_bed: '睡前',
};

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

// LT-FINAL-1R：問句依 progression，不依名稱猜出來的「閱讀計畫」。
type PresentationKind = GoalPresentation['progression'];

function getAdjustmentOptions(
  kind: PresentationKind,
): Array<{ value: AdjustmentDraft; label: string }> {
  const contentLabel =
    kind === 'staged'
      ? '想調整練習內容'
      : kind === 'accumulation'
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

/**
 * review 走 CHILD-REVIEW-V2 的大標題排版（「一起回顧」在內容區，不是標題列），
 * 所以那一頁不畫 sheetHeader，改成一條 drag handle。
 */
const BARE_HEADER_SHEETS: ReadonlyArray<OpenSheet> = ['review'];

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
  recentRecords,
  onOpenSheet,
  onOpenRecord,
  onPause,
}: {
  recentRecords: GoalRecentRecord[];
  onOpenSheet: (sheet: OpenSheet) => void;
  onOpenRecord?: (completionId?: string) => void;
  onPause: () => void;
}) {
  const visibleRecords = recentRecords.slice(0, 3);
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
      {onOpenRecord && visibleRecords.length > 0 ? (
        <View style={styles.recordSection}>
          <Text style={styles.recordSectionTitle}>最近紀錄</Text>
          {visibleRecords.map((record) => (
            <TouchableOpacity
              key={record.id}
              style={styles.recordRow}
              onPress={() => onOpenRecord(record.id)}
              accessibilityRole="button"
              accessibilityLabel={`查看${record.dateLabel}的紀錄`}
              activeOpacity={0.72}
            >
              <Text style={styles.recordDate}>{record.dateLabel}</Text>
              <View style={styles.recordCopy}>
                <Text style={styles.recordDetail}>{record.detail}</Text>
                {record.timeWindowLabel ? (
                  <Text style={styles.recordTime}>{record.timeWindowLabel}</Text>
                ) : null}
              </View>
              <Text style={styles.chevron} accessibilityElementsHidden>
                ›
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
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
  const supportsTimeWindow = presentation.supportsTimeWindow;

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
            supportsTimeWindow
              ? lastConfirmedWindow
                ? TIME_WINDOW_LABELS[lastConfirmedWindow]
                : '尚未記錄時段'
              : formatCompletionTime(completion.completed_at)
          }
        />
      </View>

      {supportsTimeWindow ? (
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
  const options = getAdjustmentOptions(presentation.progression);

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
  onOpenRecord,
  presentation,
  completion,
  taskMinutes,
  adjustmentDraft,
  onSaveAdjustmentDraft,
  onCorrectTimeWindow,
  correctingTimeWindow = false,
  parentLabel,
  reviewCadenceChannel,
  reviewTimeChannel,
}: Props) {
  const [localAdjustmentDraft, setLocalAdjustmentDraft] =
    useState<AdjustmentDraft | null>(adjustmentDraft);
  const pauseRequestRef = useRef(false);

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

  const handleSaveAdjustment = () => {
    if (!localAdjustmentDraft) return;
    onSaveAdjustmentDraft(localAdjustmentDraft);
    onClose();
  };

  let content: React.ReactNode;
  switch (activeSheet) {
    case 'menu':
      content = (
        <MenuSheet
          recentRecords={presentation.recentRecords}
          onOpenSheet={onOpenSheet}
          onOpenRecord={onOpenRecord}
          onPause={handlePause}
        />
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
        <TogetherReviewSheet
          presentation={presentation}
          onClose={onClose}
          parentLabel={parentLabel}
          cadenceChannel={reviewCadenceChannel}
          timeChannel={reviewTimeChannel}
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
          {BARE_HEADER_SHEETS.includes(activeSheet) ? (
            /*
              回顧那一頁的標題是內容區那個大字，不是這條標題列 —— 兩個都畫
              會出現兩次「一起回顧」。改成一條 drag handle。
              關閉鈕仍然留著：backdrop 對讀螢幕的人是點不到的。
            */
            <View style={styles.bareHeader}>
              <View style={styles.dragHandle} />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={CLOSE_LABELS[activeSheet]}
                onPress={onClose}
                activeOpacity={0.72}
                style={styles.bareCloseButton}
              >
                <SheetIcon name="close" color={Colors.ink300} />
              </TouchableOpacity>
            </View>
          ) : (
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
          )}
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
  bareHeader: {
    paddingTop: 10,
    paddingBottom: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.cream300,
  },
  bareCloseButton: {
    position: 'absolute',
    top: 0,
    right: 4,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  recordSection: {
    marginTop: 18,
  },
  recordSectionTitle: {
    marginBottom: 6,
    color: Colors.fgMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  recordRow: {
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  recordDate: {
    width: 58,
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
