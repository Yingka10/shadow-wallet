// Shadow Wallet · Parent Tablet — 「孩子想調整閱讀時間」待回應卡（P0-8M）
//
// 放在首頁的待回應區，和「需要一起看看」並排。刻意**不**進 Task Editor：
// 這件事只有一個欄位、兩個選擇，開一整個編輯抽屜等於要家長重新做一次決定。
//
// 卡片只呈現 structured diff（由 materialDiff 產生），不顯示 reward、
// 不顯示沒有變動的每週安排、不顯示 plan_summary —— 那些沒有變，
// 列出來只會讓家長懷疑自己是不是也在改它們。

import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ChildProposalAdjustmentCardData } from '../../../../lib/childProposal';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentShadows,
  ParentSpacing,
} from '../../../../constants/parentTheme';
import { presentParentAdjustment } from './parentAdjustmentPresentation';

type Props = {
  childName: string;
  requests: ChildProposalAdjustmentCardData[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onAccept: (card: ChildProposalAdjustmentCardData) => void;
  onDecline: (card: ChildProposalAdjustmentCardData) => void;
  actingRequestId: string | null;
  actionError: string | null;
  successMessage: string | null;
};

export function ParentAdjustmentSection({
  childName,
  requests,
  loading,
  error,
  onRetry,
  onAccept,
  onDecline,
  actingRequestId,
  actionError,
  successMessage,
}: Props) {
  const cards = useMemo(
    () => requests.flatMap(item => {
      const view = presentParentAdjustment(item, childName);
      return view ? [{ source: item, view }] : [];
    }),
    [childName, requests],
  );

  // 沒有請求時整區安靜消失。首頁不需要一塊寫著「目前沒有調整請求」的空白。
  if (!loading && !error && !successMessage && !actionError && cards.length === 0) {
    return null;
  }

  return (
    <View style={styles.section} testID="parent-adjustment-section">
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>孩子想調整時間</Text>
        <Text style={styles.sectionMeta}>一起確認之後，計畫才會更新</Text>
      </View>

      {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

      {loading && cards.length === 0 ? (
        <View style={styles.stateCard}>
          <ActivityIndicator size="small" color={ParentColors.accent} />
          <Text style={styles.stateText}>正在看看孩子想調整什麼…</Text>
        </View>
      ) : error && cards.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>孩子的調整請求暫時讀不到</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.8}>
            <Text style={styles.retryText}>再試一次</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.cardList}>
          {cards.map(({ source, view }) => {
            const acting = actingRequestId === view.id;
            return (
              <View key={view.id} style={styles.card} testID={`adjustment-card-${view.id}`}>
                <Text style={styles.cardTitle}>{view.title}</Text>
                {view.reason ? <Text style={styles.reasonText}>{view.reason}</Text> : null}

                {view.diffs.map(diff => (
                  <View key={diff.field} style={styles.diffBlock}>
                    <Text style={styles.detailLabel}>{diff.label}</Text>
                    <View style={styles.diffRow}>
                      <Text style={styles.diffBefore}>{diff.before}</Text>
                      <Text style={styles.diffArrow}>→</Text>
                      <Text style={styles.diffAfter}>{diff.after}</Text>
                    </View>
                  </View>
                ))}

                {acting ? (
                  <View style={styles.actingRow}>
                    <ActivityIndicator size="small" color={ParentColors.accent} />
                    <Text style={styles.stateText}>正在保存你們的決定…</Text>
                  </View>
                ) : (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      style={styles.confirmButton}
                      onPress={() => onAccept(source)}
                      disabled={actingRequestId !== null}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.confirmButtonText}>確認這個調整</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      style={styles.secondaryButton}
                      onPress={() => onDecline(source)}
                      disabled={actingRequestId !== null}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.secondaryButtonText}>先維持原本</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
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
  successText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.accent,
  },
  errorText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.error,
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
    gap: ParentSpacing[3],
    ...ParentShadows.card,
  },
  cardTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  reasonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  diffBlock: { gap: ParentSpacing[1] },
  detailLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
  },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: ParentSpacing[2] },
  diffBefore: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.base,
    color: ParentColors.fgMuted,
    textDecorationLine: 'line-through',
  },
  diffArrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.base,
    color: ParentColors.fgMuted,
  },
  diffAfter: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  actingRow: { flexDirection: 'row', alignItems: 'center', gap: ParentSpacing[3] },
  actions: { flexDirection: 'row', alignItems: 'center', gap: ParentSpacing[3] },
  confirmButton: {
    paddingHorizontal: ParentSpacing[5],
    paddingVertical: ParentSpacing[3],
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.accent,
  },
  confirmButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.bgSurface,
  },
  secondaryButton: {
    paddingHorizontal: ParentSpacing[5],
    paddingVertical: ParentSpacing[3],
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderMedium,
  },
  secondaryButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgSecondary,
  },
});
