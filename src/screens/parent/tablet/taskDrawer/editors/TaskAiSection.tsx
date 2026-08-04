// Shadow Wallet · Parent Tablet — 規則檢查與 AI 協作建議
//
// 兩個區塊刻意分開、長得也不一樣：
//
//   規則檢查   系統說了算。blocking 的那幾條會擋住建立，沒有「保留原設定」
//              這個選項 —— 因為那不是建議。
//
//   AI 建議    逐項採用。**沒有「全部採用」按鈕**，這是刻意的：
//              一鍵套用四項等於沒有人讀過那四項，
//              而這個功能的整個價值就在家長讀過並且做了決定。
//
// 這一支只負責畫。「現在是什麼狀態」由 TaskAiReviewState 決定，
// 「這一項還套不套得上去」由 refreshItemStates 算 —— 兩者都是純函式，
// 在這裡再判斷一次就會有兩份答案。

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ParentColors,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentSpacing,
} from '../../../../../constants/parentTheme';
import { useShowsImplementationNotes } from '../displayMode';
import {
  canApplyItem,
  canUndoItem,
  retryAfterText,
  TASK_AI_COPY,
  type TaskAiReviewState,
  type TaskAiSuggestionItem,
  type TaskRuleFinding,
} from '../taskAi';

// ---------------------------------------------------------------------------
// 規則檢查
// ---------------------------------------------------------------------------

export function RuleFindingsSection({ findings }: { findings: readonly TaskRuleFinding[] }) {
  if (findings.length === 0) return null;

  return (
    <View style={s.block}>
      <Text style={s.blockTitle}>規則檢查</Text>
      {findings.map(f => (
        <View
          key={f.id}
          style={[s.finding, f.severity === 'blocking' ? s.findingBlocking : s.findingWarning]}
        >
          {/* 用文字說明嚴重度，不只靠顏色 —— 灰階與色盲一樣讀得到。 */}
          <Text style={s.findingSeverity}>
            {f.severity === 'blocking' ? '需要先調整' : '提醒'}
          </Text>
          <Text style={s.findingMessage}>{f.message}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// AI 建議
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<TaskAiSuggestionItem['suggestion']['kind'], string> = {
  clarify_title: '把任務名稱寫清楚',
  clarify_completion: '把完成標準寫清楚',
  reduce_scope: '縮小範圍',
  adjust_duration: '調整期間',
  adjust_frequency: '調整頻率',
  adjust_session_time: '調整每次時間',
  add_support_step: '補一個支援步驟',
  adjust_review_timing: '調整回顧時機',
  preserve_child_choice: '保留孩子的選擇',
  split_milestone: '把里程碑拆開',
  improve_feedback_language: '調整回饋說法',
};

function valueText(value: string | number | string[] | null): string {
  if (value === null) return '尚未設定';
  if (Array.isArray(value)) return value.join('、');
  if (typeof value === 'number') return String(value);
  return value;
}

export type TaskAiSectionProps = {
  state: TaskAiReviewState;
  /**
   * 這則任務目前可不可以取得建議。
   *
   * false = A／B 類或服務關閉。**不顯示按鈕**，只留一句不影響建立的說明 ——
   * 一顆按了永遠不會成功的按鈕比沒有按鈕糟糕得多。
   */
  eligible: boolean;
  /** 家長在拿到建議之後又改過草稿。 */
  draftChanged: boolean;
  /** 上一次套用被擋下來的原因。 */
  applyError?: string;
  /** 有建議被採用而且動到了幣值的輸入。 */
  rewardRecalculated: boolean;
  /** development 才顯示的一行（服務模式）。**不含任何設定值。** */
  developerNote?: string;
  onRequest: () => void;
  onApply: (item: TaskAiSuggestionItem) => void;
  onKeep: (item: TaskAiSuggestionItem) => void;
  onUndo: (item: TaskAiSuggestionItem) => void;
};

export function TaskAiSection({
  state,
  eligible,
  draftChanged,
  applyError,
  rewardRecalculated,
  developerNote,
  onRequest,
  onApply,
  onKeep,
  onUndo,
}: TaskAiSectionProps) {
  const showsImplementationNotes = useShowsImplementationNotes();

  return (
    <View style={s.block}>
      <Text style={s.blockTitle}>{TASK_AI_COPY.title}</Text>

      {showsImplementationNotes && developerNote ? (
        <Text style={s.aiStatus}>{developerNote}</Text>
      ) : null}

      {!eligible ? (
        // 這一段刻意平淡：這不是警告，也不代表任務有問題。
        // 「不影響建立」和它寫在同一句 —— 那是家長此刻唯一在意的事。
        <Text style={s.aiBody}>{TASK_AI_COPY.notOffered}</Text>
      ) : (
        <AiBody
          state={state}
          draftChanged={draftChanged}
          {...(applyError !== undefined ? { applyError } : null)}
          rewardRecalculated={rewardRecalculated}
          showsImplementationNotes={showsImplementationNotes}
          onRequest={onRequest}
          onApply={onApply}
          onKeep={onKeep}
          onUndo={onUndo}
        />
      )}
    </View>
  );
}

function AiBody({
  state,
  draftChanged,
  applyError,
  rewardRecalculated,
  showsImplementationNotes,
  onRequest,
  onApply,
  onKeep,
  onUndo,
}: {
  state: TaskAiReviewState;
  draftChanged: boolean;
  applyError?: string;
  rewardRecalculated: boolean;
  showsImplementationNotes: boolean;
  onRequest: () => void;
  onApply: (item: TaskAiSuggestionItem) => void;
  onKeep: (item: TaskAiSuggestionItem) => void;
  onUndo: (item: TaskAiSuggestionItem) => void;
}) {
  switch (state.kind) {
    case 'idle':
      return (
        <>
          <Text style={s.aiBody}>{TASK_AI_COPY.intro}</Text>
          <RequestButton label={TASK_AI_COPY.requestButton} onPress={onRequest} />
        </>
      );

    case 'loading':
      return (
        <>
          <Text style={s.aiBody}>{TASK_AI_COPY.loading}</Text>
          {/*
            按鈕仍然在，但按不下去 —— 直接把它拿掉的話，畫面會在等待期間
            少一塊，回來時又長回來，家長會以為自己按錯了什麼。
          */}
          <RequestButton label={TASK_AI_COPY.requestButton} disabled onPress={onRequest} />
        </>
      );

    case 'auth_required':
      return (
        <Text style={s.aiBody} accessibilityRole="alert">
          {TASK_AI_COPY.authRequired}
        </Text>
      );

    case 'rate_limited': {
      const retry = retryAfterText(state.retryAfterSeconds);
      return (
        <>
          <Text style={s.aiBody} accessibilityRole="alert">
            {TASK_AI_COPY.rateLimited}
          </Text>
          {/* 有數字才顯示，而且只到分鐘 —— 秒數會讓家長守著畫面數秒。 */}
          {retry ? <Text style={s.aiBody}>{retry}</Text> : null}
        </>
      );
    }

    case 'unavailable':
      return (
        <>
          <Text style={s.aiBody}>
            {state.reason === 'not_offered' ? TASK_AI_COPY.notOffered : TASK_AI_COPY.unavailable}
          </Text>
          {/* not_offered 再試一百次都一樣，不給重試按鈕。 */}
          {state.reason === 'temporary' ? (
            <RequestButton label={TASK_AI_COPY.retryButton} onPress={onRequest} />
          ) : null}
          {/*
            development 只顯示固定代號，不顯示原始回傳、prompt、model 名稱
            或 token 用量 —— 那些對家長沒有意義，而且是最容易在截圖裡外流的東西。
          */}
          {showsImplementationNotes && state.developerCode ? (
            <Text style={s.aiStatus}>服務狀態：{state.developerCode}</Text>
          ) : null}
        </>
      );

    case 'no_change':
      return (
        <>
          <Text style={s.aiBody}>{TASK_AI_COPY.noChange}</Text>
          {/* summary 已經過 client validator 的長度與安全檢查。 */}
          <Text style={s.aiBody}>{state.summary}</Text>
        </>
      );

    case 'suggestions':
      return (
        <>
          <Text style={s.aiBody}>{state.summary}</Text>
          {draftChanged ? <Text style={s.aiNotice}>{TASK_AI_COPY.draftChanged}</Text> : null}
          {rewardRecalculated ? (
            // 主詞是「系統」不是「AI」——幣值一直都是規則引擎算的。
            <Text style={s.aiNotice}>{TASK_AI_COPY.rewardRecalculated}</Text>
          ) : null}
          {applyError ? (
            <Text style={s.aiError} accessibilityRole="alert">
              {applyError}
            </Text>
          ) : null}
          {state.items.map(item => (
            <SuggestionCard
              key={item.suggestion.id}
              item={item}
              showsImplementationNotes={showsImplementationNotes}
              onApply={onApply}
              onKeep={onKeep}
              onUndo={onUndo}
            />
          ))}
        </>
      );
  }
}

function RequestButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[s.aiButton, disabled && s.aiButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!disabled }}
    >
      <Text style={[s.aiButtonText, disabled && s.aiButtonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

function SuggestionCard({
  item,
  showsImplementationNotes,
  onApply,
  onKeep,
  onUndo,
}: {
  item: TaskAiSuggestionItem;
  showsImplementationNotes: boolean;
  onApply: (item: TaskAiSuggestionItem) => void;
  onKeep: (item: TaskAiSuggestionItem) => void;
  onUndo: (item: TaskAiSuggestionItem) => void;
}) {
  const { suggestion, state } = item;
  const label = KIND_LABEL[suggestion.kind];

  return (
    <View style={s.card}>
      <Text style={s.cardKind}>{label}</Text>

      <Text style={s.cardLabel}>{TASK_AI_COPY.cardCurrentLabel}</Text>
      <Text style={s.cardValue}>{valueText(suggestion.currentValue)}</Text>

      <Text style={s.cardLabel}>{TASK_AI_COPY.cardSuggestedLabel}</Text>
      <Text style={s.cardValue}>{valueText(suggestion.suggestedValue)}</Text>

      <Text style={s.cardLabel}>{TASK_AI_COPY.cardReasonLabel}</Text>
      <Text style={s.cardBody}>{suggestion.rationale}</Text>

      {/*
        confidence、expectedBenefit、fieldPath、suggestion kind code、
        schemaVersion 都不上正式畫面。「信心 85%」會讓家長把它當成準確率，
        而它不是 —— 那是模型對自己的感覺。
      */}
      {showsImplementationNotes ? (
        <Text style={s.aiStatus}>
          {suggestion.kind}｜{state}
        </Text>
      ) : null}

      {state === 'stale' ? (
        <Text style={s.cardStale}>{TASK_AI_COPY.staleItem}</Text>
      ) : state === 'applied_edited' ? (
        <>
          <Text style={s.appliedMark}>{TASK_AI_COPY.appliedMark}</Text>
          <Text style={s.cardStale}>{TASK_AI_COPY.undoUnsafe}</Text>
        </>
      ) : state === 'applied' ? (
        <View style={s.cardActions}>
          <Text style={s.appliedMark}>{TASK_AI_COPY.appliedMark}</Text>
          {canUndoItem(item) ? (
            <Pressable
              style={s.secondaryAction}
              onPress={() => onUndo(item)}
              accessibilityRole="button"
              accessibilityLabel={`${TASK_AI_COPY.undoButton}：${label}`}
            >
              <Text style={s.secondaryActionText}>{TASK_AI_COPY.undoButton}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : state === 'kept' ? (
        <Text style={s.rejectedMark}>{TASK_AI_COPY.keptMark}</Text>
      ) : (
        <View style={s.cardActions}>
          <Pressable
            style={s.primaryAction}
            onPress={() => onApply(item)}
            disabled={!canApplyItem(item)}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canApplyItem(item) }}
            accessibilityLabel={`${TASK_AI_COPY.applyButton}：${label}`}
          >
            <Text style={s.primaryActionText}>{TASK_AI_COPY.applyButton}</Text>
          </Pressable>
          <Pressable
            style={s.secondaryAction}
            onPress={() => onKeep(item)}
            accessibilityRole="button"
            accessibilityLabel={`${TASK_AI_COPY.keepButton}：${label}`}
          >
            <Text style={s.secondaryActionText}>{TASK_AI_COPY.keepButton}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  block: { gap: ParentSpacing[2], paddingTop: ParentSpacing[3] },
  blockTitle: {
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },

  finding: {
    borderRadius: ParentRadii.md,
    padding: ParentSpacing[3],
    gap: ParentSpacing[1],
    borderWidth: 1,
  },
  findingBlocking: {
    backgroundColor: ParentColors.tintClay,
    borderColor: ParentColors.fgMuted,
  },
  findingWarning: {
    backgroundColor: ParentColors.tintAmber,
    borderColor: ParentColors.fgMuted,
  },
  findingSeverity: {
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
  },
  findingMessage: {
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgPrimary,
  },

  aiBody: { fontSize: ParentFontSizes.pMeta, color: ParentColors.fgSecondary },
  aiNotice: { fontSize: ParentFontSizes.eyebrow, color: ParentColors.fgMuted },
  aiError: { fontSize: ParentFontSizes.pMeta, color: ParentColors.dangerSoft },
  aiStatus: { fontSize: ParentFontSizes.eyebrow, color: ParentColors.fgMuted },
  aiButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[2],
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.accent,
  },
  aiButtonDisabled: { borderColor: ParentColors.borderSoft },
  aiButtonText: {
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.accent,
  },
  aiButtonTextDisabled: { color: ParentColors.fgMuted },

  card: {
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.fgMuted,
    backgroundColor: ParentColors.bgSurface,
    padding: ParentSpacing[3],
    gap: ParentSpacing[1],
  },
  cardKind: {
    fontSize: ParentFontSizes.pBody,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  cardLabel: { fontSize: ParentFontSizes.eyebrow, color: ParentColors.fgMuted },
  cardValue: {
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  cardBody: { fontSize: ParentFontSizes.pMeta, color: ParentColors.fgSecondary },
  cardStale: {
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
    paddingTop: ParentSpacing[2],
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
    paddingTop: ParentSpacing[2],
  },
  primaryAction: {
    paddingHorizontal: ParentSpacing[3],
    paddingVertical: ParentSpacing[1],
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.accent,
  },
  primaryActionText: {
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.onSidebar,
  },
  secondaryAction: {
    paddingHorizontal: ParentSpacing[3],
    paddingVertical: ParentSpacing[1],
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.fgMuted,
  },
  secondaryActionText: { fontSize: ParentFontSizes.pMeta, color: ParentColors.fgSecondary },
  appliedMark: {
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.accent,
  },
  rejectedMark: {
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
    paddingTop: ParentSpacing[2],
  },
});
