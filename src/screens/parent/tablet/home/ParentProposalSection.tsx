import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ParentProposalCardData } from '../../../../lib/childProposal/types';
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
}: Props) {
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
          {cards.map(({ source, view: card }) => (
            <View key={card.id} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.ideaMark}>
                  <Text style={styles.ideaMarkText}>想</Text>
                </View>
                <View style={styles.cardHeadCopy}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.statusLabel}>{card.statusLabel}</Text>
                </View>
              </View>

              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>孩子原本怎麼說</Text>
                <Text style={styles.goalText}>{card.goal}</Text>
              </View>
              {card.motivation && (
                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>孩子為什麼想做</Text>
                  <Text style={styles.detailText}>{card.motivation}</Text>
                </View>
              )}
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.detailLabel}>想怎麼開始</Text>
                  <Text style={styles.detailText}>{card.cadence}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.detailLabel}>孩子希望的回饋</Text>
                  <Text style={styles.detailText}>{card.rewardHope}</Text>
                </View>
              </View>

              {card.planTitle ? (
                <View style={styles.planBlock}>
                  <Text style={styles.planEyebrow}>GrowBook 幫忙整理</Text>
                  <Text style={styles.planTitle}>{card.planTitle}</Text>
                  {card.planSummary && <Text style={styles.detailText}>{card.planSummary}</Text>}
                  <View style={styles.summaryRow}>
                    {card.planCadence && (
                      <View style={styles.summaryItem}>
                        <Text style={styles.detailLabel}>這份計畫的節奏</Text>
                        <Text style={styles.detailText}>{card.planCadence}</Text>
                      </View>
                    )}
                    {card.estimatedTime && (
                      <View style={styles.summaryItem}>
                        <Text style={styles.detailLabel}>每次投入</Text>
                        <Text style={styles.detailText}>{card.estimatedTime}</Text>
                      </View>
                    )}
                  </View>
                  {card.completionDescription && (
                    <View style={styles.detailBlock}>
                      <Text style={styles.detailLabel}>一次完成標準</Text>
                      <Text style={styles.detailText}>{card.completionDescription}</Text>
                    </View>
                  )}
                  {card.nextStep && (
                    <View style={styles.detailBlock}>
                      <Text style={styles.detailLabel}>下一步</Text>
                      <Text style={styles.detailText}>{card.nextStep}</Text>
                    </View>
                  )}
                  {card.rhythmCopy && <Text style={styles.rhythmText}>{card.rhythmCopy}</Text>}
                  {card.rewardSuggestion && (
                    <View style={styles.rewardBlock}>
                      <Text style={styles.suggestionLabel}>{card.rewardSuggestionLabel}</Text>
                      <Text style={styles.detailText}>{card.rewardSuggestion}</Text>
                    </View>
                  )}
                </View>
              ) : null}

              {confirmingProposalId === card.id ? (
                <View style={styles.confirmingRow}>
                  <ActivityIndicator size="small" color={ParentColors.accent} />
                  <Text style={styles.detailText}>正在建立共同計畫…</Text>
                </View>
              ) : card.canConfirm ? (
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={() => onConfirm(source)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.confirmButtonText}>確認這個計畫</Text>
                </TouchableOpacity>
              ) : card.waitingMessage ? (
                <Text style={styles.waitingText}>{card.waitingMessage}</Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
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
    gap: ParentSpacing[4],
    ...ParentShadows.card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: ParentSpacing[3] },
  ideaMark: {
    width: 40,
    height: 40,
    borderRadius: ParentRadii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.reqIconGreen,
  },
  ideaMarkText: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.black,
    color: ParentColors.accent,
  },
  cardHeadCopy: { flex: 1, gap: ParentSpacing[1] },
  cardTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.lg,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
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
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.semi,
    lineHeight: 24,
    color: ParentColors.fgPrimary,
  },
  detailText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 21,
    color: ParentColors.fgSecondary,
  },
  summaryRow: { flexDirection: 'row', gap: ParentSpacing[4] },
  summaryItem: {
    flex: 1,
    minWidth: 0,
    gap: ParentSpacing[1],
    padding: ParentSpacing[3],
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  planBlock: {
    gap: ParentSpacing[3],
    padding: ParentSpacing[4],
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  planEyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.accent,
  },
  planTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  rhythmText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 21,
    color: ParentColors.accent,
  },
  rewardBlock: {
    gap: ParentSpacing[1],
    paddingTop: ParentSpacing[2],
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
  },
  suggestionLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pending,
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
