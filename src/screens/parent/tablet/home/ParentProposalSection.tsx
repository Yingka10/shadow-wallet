import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ChildProposal } from '../../../../lib/childProposal';
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
  proposals: ChildProposal[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

export function ParentProposalSection({ childName, proposals, loading, error, onRetry }: Props) {
  const cards = useMemo(
    () => proposals.slice(0, 3).map(item => presentParentProposal(item, childName)),
    [childName, proposals],
  );

  if (!loading && !error && cards.length === 0) return null;

  return (
    <View style={styles.section} testID="parent-proposal-section">
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>需要一起看看</Text>
        <Text style={styles.sectionMeta}>孩子自己提出的新想法</Text>
      </View>

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
          {cards.map(card => (
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
                <Text style={styles.detailLabel}>孩子的想法</Text>
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
});
