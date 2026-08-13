import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type {
  ChildProposalPlanVersion,
  ParentProposalCardData,
  ParentProposalMaterialEdits,
} from '../../../../lib/childProposal';
import {
  formatPlanCadence,
  materialDiff,
} from '../../../../lib/childProposal/materialDiff';
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
  onSave: (edits: ParentProposalMaterialEdits) => void;
};

const DAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'] as const;
const TIMES = [
  { value: null, label: '尚未決定' },
  { value: 'before_school', label: '上學前' },
  { value: 'after_school', label: '放學後' },
  { value: 'after_dinner', label: '晚餐後' },
  { value: 'before_bed', label: '睡覺前' },
  { value: 'weekend', label: '週末' },
  { value: 'when_needed', label: '需要時' },
  { value: 'custom', label: '自訂時間' },
] as const;

const PRIMARY_TIME_VALUES = new Set<string | null>([null, 'after_dinner', 'before_bed']);

export function ParentProposalEditSheet({ visible, card, saving, error, onClose, onSave }: Props) {
  const plan = card.currentPlanVersion;
  const [mode, setMode] = useState<'weekly_frequency' | 'fixed_days'>('weekly_frequency');
  const [frequency, setFrequency] = useState(1);
  const [days, setDays] = useState<number[]>([]);
  const [preferredTime, setPreferredTime] = useState<string | null>(null);
  const [preferredTimeCustom, setPreferredTimeCustom] = useState('');
  const [completionDescription, setCompletionDescription] = useState('');
  const [showMoreTimes, setShowMoreTimes] = useState(false);
  const [editingCompletion, setEditingCompletion] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !plan) return;
    setMode(plan.cadence_mode === 'fixed_days' ? 'fixed_days' : 'weekly_frequency');
    setFrequency(plan.cadence_weekly_frequency ?? 1);
    setDays(plan.cadence_days ?? []);
    setPreferredTime(plan.preferred_time);
    setPreferredTimeCustom(plan.preferred_time_custom ?? '');
    setCompletionDescription(plan.completion_description ?? '');
    setShowMoreTimes(false);
    setEditingCompletion(false);
    setLocalError(null);
  }, [plan, visible]);

  const submit = () => {
    if (mode === 'weekly_frequency' && (!Number.isInteger(frequency) || frequency < 1 || frequency > 7)) {
      setLocalError('一週次數請填 1 到 7');
      return;
    }
    if (mode === 'fixed_days' && days.length === 0) {
      setLocalError('固定星期至少選一天');
      return;
    }
    if (!completionDescription.trim()) {
      setLocalError('請寫下怎樣算完成');
      return;
    }
    if (preferredTime === 'custom' && !preferredTimeCustom.trim()) {
      setLocalError('請填寫適合時間');
      return;
    }
    onSave({
      cadenceMode: mode,
      cadenceWeeklyFrequency: mode === 'weekly_frequency' ? frequency : null,
      cadenceDays: mode === 'fixed_days' ? [...days].sort((a, b) => a - b) : null,
      preferredTime,
      preferredTimeCustom: preferredTime === 'custom' ? preferredTimeCustom.trim() : null,
      completionDescription: completionDescription.trim(),
    });
  };

  if (!plan) return null;
  const editedPlan: ChildProposalPlanVersion = {
    ...plan,
    cadence_mode: mode,
    cadence_weekly_frequency: mode === 'weekly_frequency' ? frequency : null,
    cadence_days: mode === 'fixed_days' ? [...days].sort((a, b) => a - b) : null,
    preferred_time: preferredTime,
    preferred_time_custom: preferredTime === 'custom' ? preferredTimeCustom.trim() || null : null,
    completion_description: completionDescription.trim() || null,
  };
  const changes = materialDiff(plan, editedPlan);
  const visibleTimes = showMoreTimes
    ? TIMES
    : TIMES.filter(option => PRIMARY_TIME_VALUES.has(option.value) || option.value === preferredTime);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!saving) onClose();
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>一起調整計畫</Text>
              <TouchableOpacity
                accessibilityLabel="關閉"
                accessibilityRole="button"
                onPress={onClose}
                disabled={saving}
              >
                <Text style={styles.close}>關閉</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.contextCard}>
              <Text style={styles.contextText}>這是孩子原本提的計畫，一起把安排調整成適合家裡的節奏。</Text>
              <Text style={styles.originalText}>原本安排：{formatPlanCadence(plan)}</Text>
            </View>

            <Text style={styles.label}>安排方式</Text>
            <View style={styles.row}>
              <Choice label="一週幾次" selected={mode === 'weekly_frequency'} onPress={() => setMode('weekly_frequency')} />
              <Choice label="固定星期" selected={mode === 'fixed_days'} onPress={() => setMode('fixed_days')} />
            </View>
            {mode === 'weekly_frequency' ? (
              <View
                testID="proposal-weekly-frequency-input"
                style={styles.stepper}
              >
                <TouchableOpacity
                  accessibilityLabel="減少每週次數"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: frequency <= 1 }}
                  disabled={frequency <= 1}
                  onPress={() => setFrequency(current => Math.max(1, current - 1))}
                  style={[styles.stepperButton, frequency <= 1 && styles.controlDisabled]}
                >
                  <Text style={styles.stepperButtonText}>−</Text>
                </TouchableOpacity>
                <Text accessibilityLiveRegion="polite" style={styles.stepperValue}>{frequency} 次</Text>
                <TouchableOpacity
                  accessibilityLabel="增加每週次數"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: frequency >= 7 }}
                  disabled={frequency >= 7}
                  onPress={() => setFrequency(current => Math.min(7, current + 1))}
                  style={[styles.stepperButton, frequency >= 7 && styles.controlDisabled]}
                >
                  <Text style={styles.stepperButtonText}>＋</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.wrap}>
                {DAYS.map((label, day) => (
                  <Choice
                    key={label}
                    label={label}
                    selected={days.includes(day)}
                    onPress={() => setDays(current => current.includes(day)
                      ? current.filter(value => value !== day)
                      : [...current, day])}
                  />
                ))}
              </View>
            )}

            <Text style={styles.label}>適合時間</Text>
            <View style={styles.wrap}>
              {visibleTimes.map(option => (
                <Choice
                  key={option.value ?? 'not_decided'}
                  label={option.label}
                  selected={preferredTime === option.value}
                  onPress={() => setPreferredTime(option.value)}
                />
              ))}
            </View>
            <TouchableOpacity
              accessibilityLabel={showMoreTimes ? '收合更多時間選項' : '展開更多時間選項'}
              accessibilityRole="button"
              accessibilityState={{ expanded: showMoreTimes }}
              onPress={() => setShowMoreTimes(current => !current)}
              style={styles.disclosure}
            >
              <Text style={styles.disclosureText}>
                {showMoreTimes ? '收合更多時間選項' : '展開更多時間選項'}
              </Text>
            </TouchableOpacity>
            {preferredTime === 'custom' && (
              <TextInput
                testID="proposal-preferred-time-custom-input"
                value={preferredTimeCustom}
                onChangeText={setPreferredTimeCustom}
                style={styles.input}
                placeholder="例如：週末早餐後"
              />
            )}

            <View style={styles.completionCard}>
              <Text style={styles.label}>怎樣算完成？</Text>
              {!editingCompletion && (
                <Text style={styles.currentValue}>{completionDescription.trim() || '還沒決定'}</Text>
              )}
              {editingCompletion && (
                <TextInput
                  testID="proposal-completion-description-input"
                  value={completionDescription}
                  onChangeText={setCompletionDescription}
                  style={[styles.input, styles.multiline]}
                  multiline
                />
              )}
              <TouchableOpacity
                accessibilityLabel={editingCompletion ? '收合怎樣算完成' : '修改怎樣算完成'}
                accessibilityRole="button"
                accessibilityState={{ expanded: editingCompletion }}
                onPress={() => setEditingCompletion(current => !current)}
                style={styles.disclosure}
              >
                <Text style={styles.disclosureText}>
                  {editingCompletion ? '收合' : '修改怎樣算完成'}
                </Text>
              </TouchableOpacity>
            </View>

            <View testID="proposal-change-summary" style={styles.summary}>
              <Text style={styles.summaryTitle}>這次會調整</Text>
              {changes.length === 0 ? (
                <Text style={styles.currentValue}>目前沒有調整</Text>
              ) : changes.map(change => (
                <Text key={change.field} style={styles.summaryItem}>
                  {change.label}：{change.before} → {change.after}
                </Text>
              ))}
            </View>
            {(localError || error) && <Text style={styles.error}>{localError ?? error}</Text>}
            <TouchableOpacity style={styles.primary} onPress={submit} disabled={saving}>
              <Text style={styles.primaryText}>{saving ? '正在存下來…' : '存下來，讓孩子看看'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.choice, selected && styles.choiceSelected]}
      onPress={onPress}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20, 35, 28, 0.35)' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: ParentRadii.lg, borderTopRightRadius: ParentRadii.lg, backgroundColor: ParentColors.bgSurface },
  content: { gap: ParentSpacing[3], padding: ParentSpacing[5] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: ParentFonts.display, fontSize: ParentFontSizes.h3, fontWeight: ParentFontWeights.bold, color: ParentColors.fgPrimary },
  close: { fontFamily: ParentFonts.body, color: ParentColors.fgMuted },
  contextCard: { gap: ParentSpacing[2], padding: ParentSpacing[3], borderRadius: ParentRadii.md, backgroundColor: ParentColors.bgSurfaceWarm },
  contextText: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, color: ParentColors.fgSecondary },
  originalText: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, fontWeight: ParentFontWeights.bold, color: ParentColors.fgPrimary },
  label: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, fontWeight: ParentFontWeights.bold, color: ParentColors.fgPrimary },
  row: { flexDirection: 'row', gap: ParentSpacing[2] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: ParentSpacing[2] },
  choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: ParentSpacing[3], paddingVertical: ParentSpacing[2], borderRadius: ParentRadii.pill, borderWidth: 1, borderColor: ParentColors.borderMedium },
  choiceSelected: { backgroundColor: ParentColors.accent, borderColor: ParentColors.accent },
  choiceText: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, color: ParentColors.fgSecondary },
  choiceTextSelected: { color: '#FFFFFF', fontWeight: ParentFontWeights.bold },
  stepper: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: ParentSpacing[3] },
  stepperButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: ParentColors.borderMedium, borderRadius: ParentRadii.pill, backgroundColor: ParentColors.bgSurface },
  stepperButtonText: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.h3, fontWeight: ParentFontWeights.bold, color: ParentColors.accent },
  stepperValue: { minWidth: 64, textAlign: 'center', fontFamily: ParentFonts.display, fontSize: ParentFontSizes.h3, fontWeight: ParentFontWeights.bold, color: ParentColors.fgPrimary },
  controlDisabled: { opacity: 0.4 },
  disclosure: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: ParentSpacing[1] },
  disclosureText: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, fontWeight: ParentFontWeights.bold, color: ParentColors.accent },
  input: { minHeight: 44, paddingHorizontal: ParentSpacing[3], paddingVertical: ParentSpacing[2], borderWidth: 1, borderColor: ParentColors.borderMedium, borderRadius: ParentRadii.md, color: ParentColors.fgPrimary },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  completionCard: { gap: ParentSpacing[2], padding: ParentSpacing[3], borderRadius: ParentRadii.md, borderWidth: 1, borderColor: ParentColors.borderSoft },
  currentValue: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, color: ParentColors.fgSecondary },
  summary: { gap: ParentSpacing[2], padding: ParentSpacing[3], borderRadius: ParentRadii.md, backgroundColor: ParentColors.bgSurfaceWarm },
  summaryTitle: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, fontWeight: ParentFontWeights.bold, color: ParentColors.fgPrimary },
  summaryItem: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, color: ParentColors.fgSecondary },
  error: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, color: ParentColors.error },
  primary: { alignItems: 'center', padding: ParentSpacing[3], borderRadius: ParentRadii.pill, backgroundColor: ParentColors.accent },
  primaryText: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, fontWeight: ParentFontWeights.bold, color: '#FFFFFF' },
});
