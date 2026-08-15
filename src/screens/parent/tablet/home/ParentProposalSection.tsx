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
import { ParentProposalEditSheet } from './ParentProposalEditSheet';
import { ParentProposalUnsuitableSheet } from './ParentProposalUnsuitableSheet';
import { ParentSharedTermsSheet } from './ParentSharedTermsSheet';
import type { ChildPlanningSharedTerms } from '../../../../lib/childPlanning/sharedTerms';

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
  /**
   * P1-A4B1：家長提出家庭共同條件。**不是** onRevise 的別名 ——
   * 那一支是 P0 的 material edit，這一支的終點是 needs_child_review。
   */
  onProposeTerms?: (
    card: ParentProposalCardData,
    terms: ChildPlanningSharedTerms,
  ) => Promise<boolean> | boolean | void;
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
  onProposeTerms,
  onCloseProposal,
  actingProposalId = null,
  actionError = null,
}: Props) {
  const [editCard, setEditCard] = useState<ParentProposalCardData | null>(null);
  const [closeCard, setCloseCard] = useState<ParentProposalCardData | null>(null);
  const [termsCard, setTermsCard] = useState<ParentProposalCardData | null>(null);
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

              {/*
                P1：孩子自己規劃並確認過的安排。上半部是「孩子想怎麼做」，
                下半部（planBlock）是「家庭要一起約定什麼」。兩半分開，
                家長才看得出來哪些是孩子決定的、哪些是現在要一起談的。
              */}
              {card.childPlan ? (
                <View style={styles.childPlanBlock} testID={`child-plan-${card.id}`}>
                  <Text style={styles.childPlanEyebrow}>孩子想怎麼做</Text>
                  {card.childPlan.desiredOutcome && (
                    <Text style={styles.planTitle}>{card.childPlan.desiredOutcome}</Text>
                  )}
                  {card.childPlan.actionPlanSummary && (
                    <Text style={styles.detailText}>{card.childPlan.actionPlanSummary}</Text>
                  )}
                  {card.childPlan.shape && (
                    <Text style={styles.detailText}>{card.childPlan.shape}</Text>
                  )}
                  {card.childPlan.nextAction && (
                    <View style={styles.detailBlock}>
                      <Text style={styles.detailLabel}>他想先做的第一件事</Text>
                      <Text style={styles.detailText}>{card.childPlan.nextAction}</Text>
                    </View>
                  )}
                </View>
              ) : null}

              {/*
                還有共同條件沒決定 —— **不顯示一顆假的「確認」**。
                孩子把「怎麼做到」想得很清楚，缺的是家庭要一起說定的事。
              */}
              {card.sharedDecisions.length > 0 ? (
                <View style={styles.sharedTermsBlock} testID={`shared-terms-${card.id}`}>
                  <Text style={styles.childPlanEyebrow}>還有安排要一起補充</Text>
                  {card.sharedDecisions.map(item => (
                    <Text key={item} style={styles.detailText}>・{item}</Text>
                  ))}
                </View>
              ) : null}

              {card.planTitle ? (
                <View style={styles.planBlock}>
                  <Text style={styles.planEyebrow}>
                    {card.childPlan ? '家庭約定' : 'GrowBook 幫忙整理'}
                  </Text>
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
                  {card.preferredTime && (
                    <View style={styles.summaryItem}>
                      <Text style={styles.detailLabel}>適合時間</Text>
                      <Text style={styles.detailText}>{card.preferredTime}</Text>
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

              {confirmingProposalId === card.id || actingProposalId === card.id ? (
                <View style={styles.confirmingRow}>
                  <ActivityIndicator size="small" color={ParentColors.accent} />
                  <Text style={styles.detailText}>{confirmingProposalId === card.id ? '正在建立共同計畫…' : '正在保存你們的決定…'}</Text>
                </View>
              ) : (
                <View style={styles.actions}>
                  {card.canConfirm && (
                    <TouchableOpacity style={styles.confirmButton} onPress={() => onConfirm(source)} activeOpacity={0.8}>
                      <Text style={styles.confirmButtonText}>{card.confirmLabel}</Text>
                    </TouchableOpacity>
                  )}
                  {/*
                    P1-A4B1：提出家庭共同條件。與「確認」是兩條路徑 ——
                    這一顆的終點是 needs_child_review，孩子看過並同意
                    之後才會開始。所以字是「一起補幾個安排」／
                    「想提出不同的安排」，不是「調整一下」。
                  */}
                  {card.canProposeTerms && onProposeTerms && (
                    <TouchableOpacity
                      testID={`propose-terms-${card.id}`}
                      style={card.canConfirm ? styles.secondaryButton : styles.confirmButton}
                      onPress={() => setTermsCard(source)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={card.canConfirm
                          ? styles.secondaryButtonText
                          : styles.confirmButtonText}
                      >
                        {card.canConfirm ? '想提出不同的安排' : '一起補幾個安排'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {card.enrichmentRequiredCopy && (
                    <Text style={styles.waitingText} testID={`enrichment-required-${card.id}`}>
                      {card.enrichmentRequiredCopy}
                    </Text>
                  )}
                  {/*
                    調整只給 legacy 那兩個狀態。P1 不走這一支 ——
                    改 cadence / duration / next step 是共同條件協商，
                    在這裡直接讓家長改，等於孩子沒答應過就成立了。
                  */}
                  {(card.state === 'fresh_ai' || card.state === 'child_revisit') && onRevise && (
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
          ))}
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
      {termsCard && (
        <ParentSharedTermsSheet
          visible
          card={termsCard}
          saving={actingProposalId === termsCard.proposal.id}
          error={actionError}
          onClose={() => setTermsCard(null)}
          onSubmit={async terms => {
            const completed = await onProposeTerms?.(termsCard, terms);
            if (completed === true) setTermsCard(null);
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
  // 孩子那一半用左側色條而不是另一個底色塊：兩個並排的色塊會讓
  // 「孩子想的」與「一起約定的」看起來像兩張卡片，但它們是同一件事的兩面。
  childPlanBlock: {
    gap: ParentSpacing[2],
    paddingLeft: ParentSpacing[4],
    paddingVertical: ParentSpacing[2],
    borderLeftWidth: 3,
    borderLeftColor: ParentColors.accent,
  },
  sharedTermsBlock: {
    gap: ParentSpacing[1],
    padding: ParentSpacing[4],
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  childPlanEyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgSecondary,
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
