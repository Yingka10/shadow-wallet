import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/colors';
import { materialDiff } from '../../lib/childProposal/materialDiff';
import type { ChildProposalReviewData } from '../../lib/childProposal/types';

type Props = {
  review: ChildProposalReviewData;
  saving: boolean;
  error: string | null;
  onAccept: () => void;
  onRequestChanges: () => void;
  onRetry: () => void;
};

export function ChildPlanReviewCard({
  review,
  saving,
  error,
  onAccept,
  onRequestChanges,
  onRetry,
}: Props) {
  const changes = useMemo(
    () => materialDiff(review.sourcePlanVersion, review.currentPlanVersion),
    [review],
  );

  if (changes.length === 0) {
    return (
      <View style={styles.card} testID="child-plan-review-card">
        <Text style={styles.title}>安排剛剛更新了，重新看看就好</Text>
        <TouchableOpacity style={styles.secondary} onPress={onRetry}>
          <Text style={styles.secondaryText}>重新看看</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.card} testID="child-plan-review-card">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>一起決定</Text>
        <Text style={styles.title}>媽媽調整了一點安排</Text>
        <Text style={styles.subtitle}>看看這樣是不是也想試試看</Text>
      </View>

      <View style={styles.changes}>
        {changes.map(change => (
          <View key={change.field} style={styles.changeRow}>
            <Text style={styles.changeLabel}>{change.label}</Text>
            <View style={styles.beforeAfter}>
              <Text style={styles.before}>{change.before}</Text>
              <Text style={styles.arrow}>→</Text>
              <Text style={styles.after}>{change.after}</Text>
            </View>
          </View>
        ))}
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity onPress={onRetry}><Text style={styles.retry}>重新看看</Text></TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[styles.primary, saving && styles.disabled]}
        onPress={onAccept}
        disabled={saving}
        accessibilityState={{ disabled: saving }}
      >
        <Text style={styles.primaryText}>{saving ? '正在把計畫準備好…' : '好，我也想這樣試試看'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondary}
        onPress={onRequestChanges}
        disabled={saving}
        accessibilityState={{ disabled: saving }}
      >
        <Text style={styles.secondaryText}>我想再聊聊</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    backgroundColor: Colors.bgSurface,
    shadowColor: Colors.shadowWarm,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  header: { gap: 4 },
  eyebrow: { color: Colors.accent, fontSize: 13, fontWeight: '800' },
  title: { color: Colors.fgPrimary, fontSize: 20, fontWeight: '900' },
  subtitle: { color: Colors.fgSecondary, fontSize: 14, lineHeight: 20 },
  changes: { gap: 10 },
  changeRow: { gap: 6, padding: 12, borderRadius: 16, backgroundColor: Colors.leaf50 },
  changeLabel: { color: Colors.fgMuted, fontSize: 12, fontWeight: '700' },
  beforeAfter: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  before: { color: Colors.fgMuted, fontSize: 14, textDecorationLine: 'line-through' },
  arrow: { color: Colors.accent, fontSize: 15, fontWeight: '800' },
  after: { color: Colors.fgPrimary, fontSize: 15, fontWeight: '800' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: Colors.cream100 },
  error: { flex: 1, color: Colors.error, fontSize: 13 },
  retry: { color: Colors.accent, fontSize: 13, fontWeight: '800' },
  primary: { alignItems: 'center', padding: 14, borderRadius: 22, backgroundColor: Colors.accent },
  primaryText: { color: Colors.bgSurface, fontSize: 15, fontWeight: '900' },
  secondary: { alignItems: 'center', padding: 10 },
  secondaryText: { color: Colors.fgSecondary, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
