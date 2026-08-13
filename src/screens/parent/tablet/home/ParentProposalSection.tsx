import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ParentProposalCardData } from '../../../../lib/childProposal/types';
import type { ParentProposalMaterialEdits } from '../../../../lib/childProposal/types';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentShadows,
  ParentSpacing,
} from '../../../../constants/parentTheme';
import { presentParentProposal } from './parentProposalPresentation';
import { ParentProposalEditSheet, supportsMaterialEditing } from './ParentProposalEditSheet';
import { ParentProposalUnsuitableSheet } from './ParentProposalUnsuitableSheet';

type Props = {
  childName: string;
  proposals: ParentProposalCardData[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onConfirm: (card: ParentProposalCardData) => void;
  confirmingProposalId: string | null;
  confirmError: string | null;
  successMessage: string | null;
  onRevise?: (card: ParentProposalCardData, edits: ParentProposalMaterialEdits) => Promise<boolean> | boolean | void;
  onCloseProposal?: (card: ParentProposalCardData, reason: string) => Promise<boolean> | boolean | void;
  actingProposalId?: string | null;
  actionError?: string | null;
};

export function ParentProposalSection({
  childName,
  proposals,
  loading,
  error,
  onRetry,
  onConfirm,
  confirmingProposalId,
  confirmError,
  successMessage,
  onRevise,
  onCloseProposal,
  actingProposalId = null,
  actionError = null,
}: Props) {
  const [editCard, setEditCard] = useState<ParentProposalCardData | null>(null);
  const [closeCard, setCloseCard] = useState<ParentProposalCardData | null>(null);
  const [expandedSummaries, setExpandedSummaries] = useState<Record<string, boolean>>({});
  const cards = useMemo(
    () => proposals.slice(0, 3).map(item => ({
      source: item,
      view: presentParentProposal(item, childName),
    })),
    [childName, proposals],
  );

  if (!loading && !error && !successMessage && !confirmError && cards.length === 0) return null;

  return (
    <View style={styles.section} testID="parent-proposal-section">
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>需要一起看看</Text>
        <Text style={styles.sectionMeta}>孩子自己提出的新想法</Text>
      </View>

      {successMessage && <Text style={styles.successText}>{successMessage}</Text>}
      {confirmError && <Text style={styles.errorText}>{confirmError}</Text>}
      {actionError && <Text style={styles.errorText}>{actionError}</Text>}

      {loading && cards.length === 0 ? (
        <View style={styles.stateCard}>
          <ActivityIndicator size="small" color={ParentColors.accent} />
          <Text style={styles.stateText}>正在看看孩子的新想法…</Text>
        </View>
      ) : error && cards.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>孩子的新想法暫時讀不到</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.8}>
            <Text style={styles.retryText}>再試一次</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.cardList}>
          {cards.map(({ source, view: card }) => {
            const summaryKey = source.currentPlanVersion?.id;
            const summaryIsExpanded = summaryKey
              ? expandedSummaries[summaryKey] === true
              : false;
            const summaryButtonText = summaryIsExpanded ? '收合整理摘要' : '查看整理摘要';
            const summaryAccessibilityLabel = summaryIsExpanded
              ? `收合「${card.goal}」的整理摘要`
              : `查看「${card.goal}」的整理摘要`;
            const decisionHeading = card.state === 'fresh_ai'
              ? `這樣開始，適合${childName}嗎？`
              : card.state === 'child_revisit'
                ? '要再一起調整哪裡？'
                : null;

            return (
              <View key={card.id} style={styles.card} testID="parent-proposal-card">
              <View style={styles.childVoiceBand} testID={`proposal-child-voice-${card.id}`}>
                <View style={styles.bandHead}>
                  <Text style={styles.bandEyebrow}>孩子的聲音</Text>
                  <Text style={styles.statusLabel}>{card.statusLabel}</Text>
                </View>
                <Text style={styles.goalText}>{card.goal}</Text>
                {card.motivation && (
                  <View style={styles.detailBlock}>
                    <Text style={styles.detailLabel}>為什麼想做</Text>
                    <Text style={styles.voiceMotivation}>{card.motivation}</Text>
                  </View>
                )}
                <View style={styles.compactFacts}>
                  <View style={styles.compactFact}>
                    <Text style={styles.detailLabel}>想怎麼開始</Text>
                    <Text style={styles.detailText}>{card.cadence}</Text>
                  </View>
                  <View style={styles.compactFact}>
                    <Text style={styles.detailLabel}>希望的回饋</Text>
                    <Text style={styles.detailText}>{card.rewardHope}</Text>
                  </View>
                </View>
              </View>

              {card.planTitle ? (
                <View style={styles.planBand} testID={`proposal-plan-${card.id}`}>
                  <Text style={styles.bandEyebrow}>GrowBook 幫忙整理</Text>
                  <View style={styles.planFacts}>
                    {card.planCadence && (
                      <View style={styles.planFact}>
                        <Text style={styles.detailLabel}>計畫節奏</Text>
                        <Text style={styles.detailText}>{card.planCadence}</Text>
                      </View>
                    )}
                    {card.estimatedTime && (
                      <View style={styles.planFact}>
                        <Text style={styles.detailLabel}>每次投入</Text>
                        <Text style={styles.detailText}>{card.estimatedTime}</Text>
                      </View>
                    )}
                    {card.completionDescription && (
                      <View style={styles.planFact}>
                        <Text style={styles.detailLabel}>怎樣算完成</Text>
                        <Text style={styles.detailText}>{card.completionDescription}</Text>
                      </View>
                    )}
                    {card.preferredTime && (
                      <View style={styles.planFact}>
                        <Text style={styles.detailLabel}>適合時間</Text>
                        <Text style={styles.detailText}>{card.preferredTime}</Text>
                      </View>
                    )}
                    {card.nextStep && (
                      <View style={styles.planFactWide}>
                        <Text style={styles.detailLabel}>下一步</Text>
                        <Text style={styles.detailText}>{card.nextStep}</Text>
                      </View>
                    )}
                  </View>
                  {(card.rhythmCopy || card.rewardSuggestion) && (
                    <View style={styles.supportingDetails}>
                      {card.rhythmCopy && <Text style={styles.supportingText}>{card.rhythmCopy}</Text>}
                      {card.rewardSuggestion && (
                        <View style={styles.rewardDetail}>
                          <Text style={styles.suggestionLabel}>{card.rewardSuggestionLabel}</Text>
                          <Text style={styles.supportingText}>{card.rewardSuggestion}</Text>
                        </View>
                      )}
                    </View>
                  )}
                  {card.planSummary && summaryKey && (
                    <>
                      <TouchableOpacity
                        style={styles.summaryToggle}
                        accessibilityRole="button"
                        accessibilityLabel={summaryAccessibilityLabel}
                        accessibilityState={{ expanded: summaryIsExpanded }}
                        onPress={() => setExpandedSummaries(current => ({
                          ...current,
                          [summaryKey]: current[summaryKey] !== true,
                        }))}
                        activeOpacity={0.72}
                      >
                        <Text style={styles.summaryToggleText}>{summaryButtonText}</Text>
                      </TouchableOpacity>
                      {summaryIsExpanded && (
                        <Text style={styles.summaryText}>{card.planSummary}</Text>
                      )}
                    </>
                  )}
                </View>
              ) : null}

              <View style={styles.decisionBand} testID={`proposal-decision-${card.id}`}>
                {decisionHeading && <Text style={styles.decisionTitle}>{decisionHeading}</Text>}
                {confirmingProposalId === card.id || actingProposalId === card.id ? (
                  <View style={styles.confirmingRow}>
                    <ActivityIndicator size="small" color={ParentColors.accent} />
                    <Text style={styles.detailText}>{confirmingProposalId === card.id ? '正在建立共同計畫…' : '正在保存你們的決定…'}</Text>
                  </View>
                ) : (
                  <View style={styles.actions}>
                    {card.canConfirm && (
                      <TouchableOpacity style={styles.confirmButton} onPress={() => onConfirm(source)} activeOpacity={0.8}>
                        <Text style={styles.confirmButtonText}>確認這個計畫</Text>
                      </TouchableOpacity>
                    )}
                    {(card.state === 'fresh_ai' || card.state === 'child_revisit')
                      && onRevise
                      && supportsMaterialEditing(source) && (
                      <TouchableOpacity style={styles.secondaryButton} onPress={() => setEditCard(source)} activeOpacity={0.8}>
                        <Text style={styles.secondaryButtonText}>{card.state === 'child_revisit' ? '再調整一下' : '調整一下'}</Text>
                      </TouchableOpacity>
                    )}
                    {card.waitingMessage && <Text style={styles.waitingText}>{card.waitingMessage}</Text>}
                    {onCloseProposal && (
                      <TouchableOpacity style={styles.lowButton} onPress={() => setCloseCard(source)} activeOpacity={0.8}>
                        <Text style={styles.lowButtonText}>目前不適合</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
              </View>
            );
          })}
        </View>
      )}
      {editCard && (
        <ParentProposalEditSheet
          visible
          card={editCard}
          saving={actingProposalId === editCard.proposal.id}
          error={actionError}
          onClose={() => setEditCard(null)}
          onSave={async edits => {
            const completed = await onRevise?.(editCard, edits);
            if (completed === true) setEditCard(null);
          }}
        />
      )}
      <ParentProposalUnsuitableSheet
        visible={closeCard !== null}
        saving={closeCard !== null && actingProposalId === closeCard.proposal.id}
        error={actionError}
        onClose={() => setCloseCard(null)}
        onSubmit={async reason => {
          if (!closeCard) return;
          const completed = await onCloseProposal?.(closeCard, reason);
          if (completed === true) setCloseCard(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: ParentSpacing[3] },
  sectionHead: { gap: ParentSpacing[1] },
  sectionTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  sectionMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },
  stateCard: {
    minHeight: 72,
    padding: ParentSpacing[4],
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[3],
  },
  stateText: {
    flex: 1,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  retryButton: {
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[2],
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderMedium,
  },
  retryText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.accent,
  },
  cardList: { gap: ParentSpacing[3] },
  card: {
    padding: ParentSpacing.cardPad,
    borderRadius: ParentRadii.lg,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
    ...ParentShadows.card,
  },
  childVoiceBand: { gap: ParentSpacing[3], paddingBottom: ParentSpacing[5] },
  bandHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: ParentSpacing[3],
  },
  bandEyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.accent,
  },
  statusLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.accent,
  },
  detailBlock: { gap: ParentSpacing[1] },
  detailLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },
  goalText: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.xl,
    fontWeight: ParentFontWeights.bold,
    lineHeight: 29,
    color: ParentColors.fgPrimary,
  },
  voiceMotivation: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.base,
    lineHeight: 24,
    color: ParentColors.fgSecondary,
  },
  detailText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 21,
    color: ParentColors.fgSecondary,
  },
  compactFacts: {
    flexDirection: 'row',
    gap: ParentSpacing[5],
    paddingTop: ParentSpacing[2],
  },
  compactFact: {
    flex: 1,
    minWidth: 0,
    gap: ParentSpacing[1],
  },
  planBand: {
    gap: ParentSpacing[3],
    paddingVertical: ParentSpacing[5],
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
  },
  planFacts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: ParentSpacing[5],
    rowGap: ParentSpacing[3],
  },
  planFact: {
    flexGrow: 1,
    flexBasis: '42%',
    minWidth: 0,
    gap: ParentSpacing[1],
  },
  planFactWide: { flexBasis: '100%', gap: ParentSpacing[1] },
  supportingDetails: {
    gap: ParentSpacing[2],
    paddingTop: ParentSpacing[3],
    borderTopWidth: 1,
    borderTopColor: ParentColors.hairline,
  },
  supportingText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 18,
    color: ParentColors.fgMuted,
  },
  rewardDetail: { gap: ParentSpacing[1] },
  suggestionLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },
  summaryToggle: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  summaryToggleText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.accent,
  },
  summaryText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 19,
    color: ParentColors.fgMuted,
  },
  decisionBand: {
    gap: ParentSpacing[3],
    paddingTop: ParentSpacing[5],
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
  },
  decisionTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.lg,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  confirmButton: {
    alignItems: 'center',
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[3],
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.accent,
  },
  confirmButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: '#FFFFFF',
  },
  confirmingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ParentSpacing[2],
  },
  actions: { gap: ParentSpacing[2] },
  secondaryButton: {
    alignItems: 'center',
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[3],
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.accent,
  },
  secondaryButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.accent,
  },
  lowButton: { alignItems: 'center', paddingVertical: ParentSpacing[2] },
  lowButtonText: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, color: ParentColors.fgMuted },
  waitingText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },
  successText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.success,
  },
  errorText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.error,
  },
});
