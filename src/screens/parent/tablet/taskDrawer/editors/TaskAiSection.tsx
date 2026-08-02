// Shadow Wallet · Parent Tablet — 規則檢查與 AI 協作建議
//
// 兩個區塊刻意分開、長得也不一樣：
//
//   規則檢查   系統說了算。blocking 的那幾條會擋住建立，沒有「保留原設定」
//              這個選項 —— 因為那不是建議。
//
//   AI 建議    逐項採用。沒有「全部採用」按鈕，這是刻意的：
//              一鍵套用四項等於沒有人讀過那四項，
//              而這個功能的整個價值就在家長讀過並且做了決定。

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
import type {
  AiSuggestionDecision,
  TaskAiRecommendationResult,
  TaskAiSuggestion,
  TaskRuleFinding,
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

const BENEFIT_LABEL: Record<TaskAiSuggestion['expectedBenefit'], string> = {
  clearer_expectation: '期待更清楚',
  more_age_appropriate: '更符合這個年紀',
  more_achievable: '更做得到',
  more_autonomy: '孩子有更多決定權',
  easier_to_review: '之後更好一起回顧',
  safer: '更安全',
};

const KIND_LABEL: Record<TaskAiSuggestion['kind'], string> = {
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
  /** null = 還沒按過「取得調整建議」。 */
  result: TaskAiRecommendationResult | null;
  loading: boolean;
  decisions: Record<string, AiSuggestionDecision>;
  onRequest: () => void;
  onApply: (suggestion: TaskAiSuggestion) => void;
  onReject: (suggestion: TaskAiSuggestion) => void;
  onUndo: (suggestion: TaskAiSuggestion) => void;
};

export function TaskAiSection({
  result,
  loading,
  decisions,
  onRequest,
  onApply,
  onReject,
  onUndo,
}: TaskAiSectionProps) {
  const showsImplementationNotes = useShowsImplementationNotes();

  return (
    <View style={s.block}>
      <Text style={s.blockTitle}>一起調整這項任務</Text>

      {loading ? (
        <Text style={s.aiBody}>正在整理建議…</Text>
      ) : result === null ? (
        <>
          <Text style={s.aiBody}>
            AI 可以協助檢查範圍、時間與完成方式，是否採用仍由你決定。
          </Text>
          <Pressable
            style={s.aiButton}
            onPress={onRequest}
            accessibilityRole="button"
            accessibilityLabel="取得調整建議"
          >
            <Text style={s.aiButtonText}>取得調整建議</Text>
          </Pressable>
        </>
      ) : result.status === 'no_change' ? (
        <Text style={s.aiBody}>目前設定已經清楚，可以直接建立。</Text>
      ) : result.status === 'unavailable' ? (
        <>
          <Text style={s.aiBody}>目前無法取得建議，不影響任務建立。</Text>
          {/*
            development 只顯示狀態碼，不顯示原始回傳、prompt、model 名稱或
            token 用量 —— 那些對家長沒有意義，而且是最容易在截圖裡外流的東西。
          */}
          {showsImplementationNotes ? (
            <Text style={s.aiStatus}>服務狀態：{result.reason}</Text>
          ) : null}
        </>
      ) : (
        <>
          <Text style={s.aiBody}>{result.summary}</Text>
          {result.suggestions.map(suggestion => {
            const decision = decisions[suggestion.id] ?? 'pending';
            return (
              <View key={suggestion.id} style={s.card}>
                <Text style={s.cardKind}>{KIND_LABEL[suggestion.kind]}</Text>

                <Text style={s.cardLabel}>目前設定</Text>
                <Text style={s.cardValue}>{valueText(suggestion.currentValue)}</Text>

                <Text style={s.cardLabel}>建議調整</Text>
                <Text style={s.cardValue}>{valueText(suggestion.suggestedValue)}</Text>

                <Text style={s.cardLabel}>原因</Text>
                <Text style={s.cardBody}>{suggestion.rationale}</Text>

                <Text style={s.cardBenefit}>{BENEFIT_LABEL[suggestion.expectedBenefit]}</Text>

                {decision === 'applied' ? (
                  <View style={s.cardActions}>
                    <Text style={s.appliedMark}>已套用</Text>
                    <Pressable
                      style={s.secondaryAction}
                      onPress={() => onUndo(suggestion)}
                      accessibilityRole="button"
                      accessibilityLabel={`復原：${KIND_LABEL[suggestion.kind]}`}
                    >
                      <Text style={s.secondaryActionText}>復原</Text>
                    </Pressable>
                  </View>
                ) : decision === 'rejected' ? (
                  <Text style={s.rejectedMark}>已保留原設定</Text>
                ) : (
                  <View style={s.cardActions}>
                    <Pressable
                      style={s.primaryAction}
                      onPress={() => onApply(suggestion)}
                      accessibilityRole="button"
                      accessibilityLabel={`採用這項：${KIND_LABEL[suggestion.kind]}`}
                    >
                      <Text style={s.primaryActionText}>採用這項</Text>
                    </Pressable>
                    <Pressable
                      style={s.secondaryAction}
                      onPress={() => onReject(suggestion)}
                      accessibilityRole="button"
                      accessibilityLabel={`保留原設定：${KIND_LABEL[suggestion.kind]}`}
                    >
                      <Text style={s.secondaryActionText}>保留原設定</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </>
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
  aiStatus: { fontSize: ParentFontSizes.eyebrow, color: ParentColors.fgMuted },
  aiButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[2],
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.accent,
  },
  aiButtonText: {
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.accent,
  },

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
  cardBenefit: {
    fontSize: ParentFontSizes.eyebrow,
    color: ParentColors.accent,
    paddingTop: ParentSpacing[1],
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
