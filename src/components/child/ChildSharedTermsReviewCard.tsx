// GrowBook — 孩子看爸媽提出的共同條件（P1-A4B2 §4 / §22 / §23）
//
// ─────────────────────────────────────────────────────────────────────────
// 這張卡片**不是**「請你重新批准一份新計畫」。
//
// 孩子想做到什麼、準備怎麼做、第一步是什麼 —— 那幾行原封不動，而且
// 放在最上面，因為這張卡片要說的第一件事就是：**你的做法沒有被改掉。**
// 下面才是爸媽提出的、要一起配合的條件。
//
// 兩個狀態的差別必須看得出來：
//
//   都說定了   「可以，就照這樣開始」
//   還有沒說完 「這些安排可以」＋「還有一項要再和爸媽確認，現在還不會開始」
//
// 第二種絕對不可以寫「開始任務」—— 他按下去之後任務不會出現，
// 而他會以為是 App 壞了。
// ─────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/colors';
import {
  CHILD_REVIEW_REASON_MAX,
  childPlanningReviewability,
} from '../../lib/childPlanning/childReview';
import { sharedTermVersionChanges } from '../../lib/childPlanning/sharedTerms';
import type { ChildProposalReviewData } from '../../lib/childProposal/types';

type Props = {
  review: ChildProposalReviewData;
  saving: boolean;
  error: string | null;
  onAccept: () => void;
  onRequestChanges: (reason?: string) => void;
  onRetry: () => void;
};

export function ChildSharedTermsReviewCard({
  review, saving, error, onAccept, onRequestChanges, onRetry,
}: Props) {
  const [talking, setTalking] = useState(false);
  const [reason, setReason] = useState('');

  const reviewability = childPlanningReviewability(review);
  const plan = review.currentPlanVersion;
  const changes = useMemo(
    () => sharedTermVersionChanges(review.sourcePlanVersion, review.currentPlanVersion),
    [review],
  );

  if (!reviewability.ok) {
    return (
      <View style={styles.card} testID="child-shared-terms-card">
        <Text style={styles.title}>安排剛剛更新了，重新看看就好</Text>
        <TouchableOpacity style={styles.secondary} onPress={onRetry}>
          <Text style={styles.secondaryText}>重新看看</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { activates, pending } = reviewability;

  return (
    <View style={styles.card} testID="child-shared-terms-card">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>一起決定</Text>
        <Text style={styles.title}>爸媽想一起調整這些安排</Text>
      </View>

      {/* 你的計畫 —— 沒有被改掉的那一部分。 */}
      <View style={styles.ownPlan} testID="child-own-plan">
        <Text style={styles.ownPlanEyebrow}>你的計畫</Text>
        {plan.plan_title && <Text style={styles.ownPlanTitle}>{plan.plan_title}</Text>}
        {plan.plan_summary && <Text style={styles.ownPlanText}>{plan.plan_summary}</Text>}
        {plan.next_step && (
          <Text style={styles.ownPlanText}>第一步：{plan.next_step}</Text>
        )}
      </View>

      {changes.length > 0 ? (
        <View style={styles.changes} testID="child-shared-terms-diff">
          {changes.map((change) => (
            <View key={change.label} style={styles.changeRow}>
              <Text style={styles.changeLabel}>{change.label}</Text>
              <View style={styles.beforeAfter}>
                {/* 沒決定過的事不要寫成「你原本」—— 他沒說過那句話。 */}
                <Text style={styles.before}>
                  {change.before === null ? '原本：還沒決定' : `你原本：${change.before}`}
                </Text>
                <Text style={styles.arrow}>→</Text>
                <Text style={styles.after}>爸媽提出：{change.after}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.subtitle}>這一輪爸媽沒有改動你原本的安排。</Text>
      )}

      {pending.length > 0 && (
        <View style={styles.pendingBlock} testID="child-pending-terms">
          <Text style={styles.pendingEyebrow}>還有這些要再一起說定</Text>
          {pending.map((item) => (
            <Text key={item} style={styles.pendingText}>・{item}</Text>
          ))}
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity onPress={onRetry}><Text style={styles.retry}>重新看看</Text></TouchableOpacity>
        </View>
      )}

      {talking ? (
        <View style={styles.talkBlock} testID="child-request-changes-block">
          <Text style={styles.changeLabel}>想跟爸媽說什麼？（可以不寫）</Text>
          <TextInput
            testID="child-request-changes-input"
            value={reason}
            onChangeText={setReason}
            style={styles.input}
            placeholder="例如：我還是想睡前做"
            maxLength={CHILD_REVIEW_REASON_MAX}
            multiline
          />
          <TouchableOpacity
            testID="child-request-changes-submit"
            style={[styles.primary, saving && styles.disabled]}
            onPress={() => onRequestChanges(reason.trim() === '' ? undefined : reason.trim())}
            disabled={saving}
            accessibilityState={{ disabled: saving }}
          >
            <Text style={styles.primaryText}>{saving ? '正在送出…' : '送出我的想法'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={() => setTalking(false)}>
            <Text style={styles.secondaryText}>先不要</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TouchableOpacity
            testID="child-accept-shared-terms"
            style={[styles.primary, saving && styles.disabled]}
            onPress={onAccept}
            disabled={saving}
            accessibilityState={{ disabled: saving }}
          >
            <Text style={styles.primaryText}>
              {saving ? '正在送出…' : activates ? '可以，就照這樣開始' : '這些安排可以'}
            </Text>
          </TouchableOpacity>
          {!activates && (
            <Text style={styles.footnote} testID="child-not-starting-note">
              還有一項安排需要再和爸媽確認，現在還不會開始。
            </Text>
          )}
          <TouchableOpacity
            testID="child-open-request-changes"
            style={styles.secondary}
            onPress={() => setTalking(true)}
            disabled={saving}
          >
            <Text style={styles.secondaryText}>我想再調整</Text>
          </TouchableOpacity>
        </>
      )}
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
  ownPlan: { gap: 4, padding: 12, borderRadius: 16, backgroundColor: Colors.cream100 },
  ownPlanEyebrow: { color: Colors.fgMuted, fontSize: 12, fontWeight: '700' },
  ownPlanTitle: { color: Colors.fgPrimary, fontSize: 16, fontWeight: '800' },
  ownPlanText: { color: Colors.fgSecondary, fontSize: 14, lineHeight: 20 },
  changes: { gap: 10 },
  changeRow: { gap: 6, padding: 12, borderRadius: 16, backgroundColor: Colors.leaf50 },
  changeLabel: { color: Colors.fgMuted, fontSize: 12, fontWeight: '700' },
  beforeAfter: { gap: 4 },
  before: { color: Colors.fgMuted, fontSize: 14 },
  arrow: { color: Colors.accent, fontSize: 15, fontWeight: '800' },
  after: { color: Colors.fgPrimary, fontSize: 15, fontWeight: '800' },
  pendingBlock: { gap: 4, padding: 12, borderRadius: 16, backgroundColor: Colors.cream100 },
  pendingEyebrow: { color: Colors.fgMuted, fontSize: 12, fontWeight: '700' },
  pendingText: { color: Colors.fgSecondary, fontSize: 14 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, borderRadius: 12, backgroundColor: Colors.cream100,
  },
  error: { flex: 1, color: Colors.error, fontSize: 13 },
  retry: { color: Colors.accent, fontSize: 13, fontWeight: '800' },
  talkBlock: { gap: 10 },
  input: {
    minHeight: 72,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    color: Colors.fgPrimary,
    textAlignVertical: 'top',
  },
  primary: { alignItems: 'center', padding: 14, borderRadius: 22, backgroundColor: Colors.accent },
  primaryText: { color: Colors.bgSurface, fontSize: 15, fontWeight: '900' },
  footnote: { color: Colors.fgMuted, fontSize: 13, textAlign: 'center' },
  secondary: { alignItems: 'center', padding: 10 },
  secondaryText: { color: Colors.fgSecondary, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
