// GrowBook — 家長提出家庭共同條件（P1-A4B1 §17 / §18）
//
// ─────────────────────────────────────────────────────────────────────────
// 這不是一個編輯器。孩子想怎麼做到的那一段完全不在這裡 —— 畫面上連
// 標題、做法、下一步的輸入框都沒有，因為那些不是家長要決定的事。
//
// 只顯示**真正需要一起說定的東西**，而且如果家長改的是孩子已經明確
// 講過的安排，兩行都要在：
//
//     孩子原本：睡前 15 分鐘
//     你提出：晚餐後 20 分鐘
//
// 主要按鈕的字是「送給孩子看看」。不是儲存、不是確認、不是套用 ——
// 那三個字都在說「這件事定了」，而這一步的意思正好相反。
// ─────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ParentProposalCardData } from '../../../../lib/childProposal';
import {
  familyNegotiableTerms,
  sharedTermChanges,
} from '../../../../lib/childPlanning/sharedTerms';
import type {
  ChildPlanningPreferredTime,
  ChildPlanningSharedTerms,
} from '../../../../lib/childPlanning/sharedTerms';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentSpacing,
} from '../../../../constants/parentTheme';

type Props = {
  visible: boolean;
  card: ParentProposalCardData;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (terms: ChildPlanningSharedTerms) => void;
};

const DAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'] as const;

const TIMES: readonly { value: ChildPlanningPreferredTime; label: string }[] = [
  { value: 'before_school', label: '上學前' },
  { value: 'after_school', label: '放學後' },
  { value: 'after_dinner', label: '晚餐後' },
  { value: 'before_bed', label: '睡覺前' },
  { value: 'weekend', label: '週末' },
  { value: 'when_needed', label: '需要時' },
  { value: 'custom', label: '自訂時間' },
];

export function ParentSharedTermsSheet({
  visible, card, saving, error, onClose, onSubmit,
}: Props) {
  const plan = card.currentPlanVersion;
  const [mode, setMode] = useState<'weekly_frequency' | 'fixed_days'>('weekly_frequency');
  const [frequency, setFrequency] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [preferredTime, setPreferredTime] = useState<ChildPlanningPreferredTime | null>(null);
  const [preferredTimeCustom, setPreferredTimeCustom] = useState('');
  const [minutes, setMinutes] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [noCoin, setNoCoin] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !plan) return;
    setMode(plan.cadence_mode === 'fixed_days' ? 'fixed_days' : 'weekly_frequency');
    setFrequency(plan.cadence_weekly_frequency ? String(plan.cadence_weekly_frequency) : '');
    setDays(plan.cadence_days ?? []);
    setPreferredTime((plan.preferred_time as ChildPlanningPreferredTime | null) ?? null);
    setPreferredTimeCustom(plan.preferred_time_custom ?? '');
    setMinutes(plan.estimated_minutes ? String(plan.estimated_minutes) : '');
    setDurationDays(plan.duration_days ? String(plan.duration_days) : '');
    setNoCoin(false);
    setLocalError(null);
  }, [plan, visible]);

  /** 沒動過的欄位不送 —— 送出去就等於「我提出了這個」。 */
  const terms = useMemo((): ChildPlanningSharedTerms => {
    if (!plan) return {};
    const draft: ChildPlanningSharedTerms = {};

    const parsedFrequency = Number(frequency);
    const cadenceTouched = mode !== plan.cadence_mode
      || (mode === 'weekly_frequency' && parsedFrequency !== plan.cadence_weekly_frequency)
      || (mode === 'fixed_days'
        && JSON.stringify([...days].sort((a, b) => a - b)) !== JSON.stringify(plan.cadence_days));
    if (cadenceTouched) {
      draft.cadenceMode = mode;
      if (mode === 'weekly_frequency') draft.cadenceWeeklyFrequency = parsedFrequency;
      else draft.cadenceDays = [...days].sort((a, b) => a - b);
    }

    if (preferredTime !== null && preferredTime !== plan.preferred_time) {
      draft.preferredTime = preferredTime;
      if (preferredTime === 'custom') draft.preferredTimeCustom = preferredTimeCustom.trim();
    }

    const parsedMinutes = Number(minutes);
    if (minutes.trim() !== '' && parsedMinutes !== plan.estimated_minutes) {
      draft.sessionMinutes = parsedMinutes;
    }

    const parsedDays = Number(durationDays);
    if (durationDays.trim() !== '' && parsedDays !== plan.duration_days
      && plan.duration_type === 'long_term') {
      draft.durationDays = parsedDays;
    }

    if (noCoin) draft.rewardChoice = 'no_coin';
    return draft;
  }, [days, durationDays, frequency, minutes, mode, noCoin, plan,
    preferredTime, preferredTimeCustom]);

  const changes = useMemo(
    () => (plan ? sharedTermChanges(plan, terms) : []),
    [plan, terms],
  );
  // 改到孩子已經講過的安排 —— 這幾條必須讓家長在按下去之前就看到。
  const overrides = changes.filter((change) => change.before !== null);
  const pending = plan ? familyNegotiableTerms(plan) : [];

  const submit = () => {
    if (Object.keys(terms).length === 0) {
      setLocalError('還沒有提出任何安排。');
      return;
    }
    if (terms.cadenceMode === 'weekly_frequency'
      && (!Number.isInteger(terms.cadenceWeeklyFrequency)
        || (terms.cadenceWeeklyFrequency ?? 0) < 1 || (terms.cadenceWeeklyFrequency ?? 0) > 7)) {
      setLocalError('一週幾次請填 1 到 7。');
      return;
    }
    if (terms.cadenceMode === 'fixed_days' && (terms.cadenceDays ?? []).length === 0) {
      setLocalError('請至少選一個星期。');
      return;
    }
    if (terms.preferredTime === 'custom' && !preferredTimeCustom.trim()) {
      setLocalError('請填寫時段。');
      return;
    }
    if (terms.sessionMinutes !== undefined && !Number.isInteger(terms.sessionMinutes)) {
      setLocalError('每次多久請填數字。');
      return;
    }
    if (terms.durationDays !== undefined && !Number.isInteger(terms.durationDays)) {
      setLocalError('先試多久請填數字。');
      return;
    }
    setLocalError(null);
    onSubmit(terms);
  };

  if (!plan) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>一起補幾個安排</Text>
              <TouchableOpacity onPress={onClose} disabled={saving}>
                <Text style={styles.close}>關閉</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.lead} testID="shared-terms-lead">
              他想怎麼做到的部分不會變，這裡只談要一起配合的事。
            </Text>

            <Text style={styles.label}>一週想安排幾次？</Text>
            <View style={styles.row}>
              <Choice label="一週幾次" selected={mode === 'weekly_frequency'}
                onPress={() => setMode('weekly_frequency')} />
              <Choice label="固定星期" selected={mode === 'fixed_days'}
                onPress={() => setMode('fixed_days')} />
            </View>
            {mode === 'weekly_frequency' ? (
              <TextInput
                testID="shared-terms-frequency-input"
                value={frequency}
                onChangeText={setFrequency}
                keyboardType="number-pad"
                placeholder="例如 3"
                style={styles.input}
              />
            ) : (
              <View style={styles.wrap}>
                {DAYS.map((label, day) => (
                  <Choice
                    key={label}
                    label={label}
                    selected={days.includes(day)}
                    onPress={() => setDays((current) => current.includes(day)
                      ? current.filter((value) => value !== day)
                      : [...current, day])}
                  />
                ))}
              </View>
            )}

            <Text style={styles.label}>什麼時候做？</Text>
            <View style={styles.wrap}>
              {TIMES.map((option) => (
                <Choice
                  key={option.value}
                  label={option.label}
                  selected={preferredTime === option.value}
                  onPress={() => setPreferredTime(option.value)}
                />
              ))}
            </View>
            {preferredTime === 'custom' && (
              <TextInput
                testID="shared-terms-time-custom-input"
                value={preferredTimeCustom}
                onChangeText={setPreferredTimeCustom}
                style={styles.input}
                placeholder="例如：週末早餐後"
              />
            )}

            <Text style={styles.label}>每次先做多久？（分鐘）</Text>
            <TextInput
              testID="shared-terms-minutes-input"
              value={minutes}
              onChangeText={setMinutes}
              keyboardType="number-pad"
              placeholder="例如 20"
              style={styles.input}
            />

            {plan.duration_type === 'long_term' && (
              <>
                <Text style={styles.label}>這次先試多久？（天）</Text>
                <TextInput
                  testID="shared-terms-duration-input"
                  value={durationDays}
                  onChangeText={setDurationDays}
                  keyboardType="number-pad"
                  placeholder="例如 28"
                  style={styles.input}
                />
              </>
            )}

            {/*
              金額不在這裡，而且不會在這裡。家長能決定的是「要不要用
              成長幣鼓勵這件事」，多少錢是規則引擎算的。
            */}
            {(plan.reward_policy === 'coin_eligible' || pending.includes('reward')) && (
              <>
                <Text style={styles.label}>怎麼給回饋？</Text>
                <View style={styles.wrap}>
                  <Choice label="照 GrowBook 的建議" selected={!noCoin}
                    onPress={() => setNoCoin(false)} />
                  <Choice label="這件事不用給成長幣" selected={noCoin}
                    onPress={() => setNoCoin(true)} />
                </View>
              </>
            )}

            {overrides.length > 0 && (
              <View style={styles.diffBlock} testID="shared-terms-diff">
                <Text style={styles.diffEyebrow}>這幾項和他原本說的不一樣</Text>
                {overrides.map((change) => (
                  <View key={change.label} style={styles.diffRow}>
                    <Text style={styles.diffLabel}>{change.label}</Text>
                    <Text style={styles.diffBefore}>孩子原本：{change.before}</Text>
                    <Text style={styles.diffAfter}>你提出：{change.after}</Text>
                  </View>
                ))}
              </View>
            )}

            {(localError || error) && <Text style={styles.error}>{localError ?? error}</Text>}
            <TouchableOpacity
              testID="shared-terms-submit"
              style={styles.primary}
              onPress={submit}
              disabled={saving}
            >
              <Text style={styles.primaryText}>{saving ? '正在送出…' : '送給孩子看看'}</Text>
            </TouchableOpacity>
            <Text style={styles.footnote}>他看過並同意之後，這份約定才會開始。</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Choice({ label, selected, onPress }: {
  label: string; selected: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.choice, selected && styles.choiceSelected]} onPress={onPress}>
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20, 35, 28, 0.35)' },
  sheet: {
    maxHeight: '90%',
    borderTopLeftRadius: ParentRadii.lg,
    borderTopRightRadius: ParentRadii.lg,
    backgroundColor: ParentColors.bgSurface,
  },
  content: { gap: ParentSpacing[3], padding: ParentSpacing[5] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  close: { fontFamily: ParentFonts.body, color: ParentColors.fgMuted },
  lead: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  label: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  row: { flexDirection: 'row', gap: ParentSpacing[2] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: ParentSpacing[2] },
  choice: {
    paddingHorizontal: ParentSpacing[3],
    paddingVertical: ParentSpacing[2],
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderMedium,
  },
  choiceSelected: { backgroundColor: ParentColors.accent, borderColor: ParentColors.accent },
  choiceText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  choiceTextSelected: { color: '#FFFFFF', fontWeight: ParentFontWeights.bold },
  input: {
    minHeight: 44,
    paddingHorizontal: ParentSpacing[3],
    paddingVertical: ParentSpacing[2],
    borderWidth: 1,
    borderColor: ParentColors.borderMedium,
    borderRadius: ParentRadii.md,
    color: ParentColors.fgPrimary,
  },
  diffBlock: {
    gap: ParentSpacing[2],
    padding: ParentSpacing[3],
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  diffEyebrow: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgSecondary,
  },
  diffRow: { gap: 2 },
  diffLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  diffBefore: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
  },
  diffAfter: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgPrimary,
  },
  error: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.error,
  },
  primary: {
    alignItems: 'center',
    padding: ParentSpacing[3],
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.accent,
  },
  primaryText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: '#FFFFFF',
  },
  footnote: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
    textAlign: 'center',
  },
});
