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
const MAX_CUSTOM_TIME_LENGTH = 60;
const MAX_COMPLETION_DESCRIPTION_LENGTH = 120;

export function supportsMaterialEditing(card: ParentProposalCardData): boolean {
  const cadenceMode = card.currentPlanVersion?.cadence_mode;
  return cadenceMode === 'weekly_frequency' || cadenceMode === 'fixed_days';
}

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

  const changeMode = (nextMode: 'weekly_frequency' | 'fixed_days') => {
    setLocalError(null);
    setMode(nextMode);
  };

  const adjustFrequency = (delta: -1 | 1) => {
    setLocalError(null);
    setFrequency(current => Math.min(7, Math.max(1, current + delta)));
  };

  const toggleDay = (day: number) => {
    setLocalError(null);
    setDays(current => current.includes(day)
      ? current.filter(value => value !== day)
      : [...current, day]);
  };

  const changePreferredTime = (nextPreferredTime: string | null) => {
    setLocalError(null);
    setPreferredTime(nextPreferredTime);
  };

  const submit = () => {
    if (!supportsMaterialEditing(card) || changes.length === 0) return;
    const trimmedCompletionDescription = completionDescription.trim();
    const trimmedPreferredTimeCustom = preferredTimeCustom.trim();
    if (mode === 'weekly_frequency' && (!Number.isInteger(frequency) || frequency < 1 || frequency > 7)) {
      setLocalError('一週次數請填 1 到 7');
      return;
    }
    if (mode === 'fixed_days' && days.length === 0) {
      setLocalError('固定星期至少選一天');
      return;
    }
    if (!trimmedCompletionDescription) {
      setLocalError('請寫下怎樣算完成');
      return;
    }
    if (trimmedCompletionDescription.length > MAX_COMPLETION_DESCRIPTION_LENGTH) {
      setLocalError('請用 120 字內描述怎樣算完成');
      return;
    }
    if (preferredTime === 'custom' && !trimmedPreferredTimeCustom) {
      setLocalError('請填寫適合時間');
      return;
    }
    if (preferredTime === 'custom' && trimmedPreferredTimeCustom.length > MAX_CUSTOM_TIME_LENGTH) {
      setLocalError('請用 60 字內描述自訂時間');
      return;
    }
    setLocalError(null);
    onSave({
      cadenceMode: mode,
      cadenceWeeklyFrequency: mode === 'weekly_frequency' ? frequency : null,
      cadenceDays: mode === 'fixed_days' ? [...days].sort((a, b) => a - b) : null,
      preferredTime,
      preferredTimeCustom: preferredTime === 'custom' ? trimmedPreferredTimeCustom : null,
      completionDescription: trimmedCompletionDescription,
    });
  };

  if (!plan) return null;
  const materialEditingSupported = supportsMaterialEditing(card);
  const editedPlan: ChildProposalPlanVersion = materialEditingSupported
    ? {
        ...plan,
        cadence_mode: mode,
        cadence_weekly_frequency: mode === 'weekly_frequency' ? frequency : null,
        cadence_days: mode === 'fixed_days' ? [...days].sort((a, b) => a - b) : null,
        preferred_time: preferredTime,
        preferred_time_custom: preferredTime === 'custom' ? preferredTimeCustom.trim() || null : null,
        completion_description: completionDescription.trim() || null,
      }
    : plan;
  const changes = materialEditingSupported ? materialDiff(plan, editedPlan) : [];
  const primaryDisabled = saving || changes.length === 0;
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
                style={styles.closeButton}
              >
                <Text style={styles.close}>關閉</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.contextCard}>
              <Text style={styles.contextText}>這是孩子原本提的計畫，一起把安排調整成適合家裡的節奏。</Text>
              <Text style={styles.originalText}>原本安排：{formatPlanCadence(plan)}</Text>
            </View>

            {!materialEditingSupported ? (
              <View style={styles.unsupportedCard}>
                <Text style={styles.currentValue}>這種一次完成的計畫目前不能在這裡調整</Text>
              </View>
            ) : (
              <>
            <Text style={styles.label}>安排方式</Text>
            <View style={styles.row}>
              <Choice label="一週幾次" selected={mode === 'weekly_frequency'} onPress={() => changeMode('weekly_frequency')} />
              <Choice label="固定星期" selected={mode === 'fixed_days'} onPress={() => changeMode('fixed_days')} />
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
                  onPress={() => adjustFrequency(-1)}
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
                  onPress={() => adjustFrequency(1)}
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
                    onPress={() => toggleDay(day)}
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
                  onPress={() => changePreferredTime(option.value)}
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
                accessibilityLabel="自訂適合時間"
                value={preferredTimeCustom}
                onChangeText={value => {
                  setLocalError(null);
                  setPreferredTimeCustom(value);
                }}
                maxLength={MAX_CUSTOM_TIME_LENGTH}
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
                  accessibilityLabel="怎樣算完成"
                  value={completionDescription}
                  onChangeText={value => {
                    setLocalError(null);
                    setCompletionDescription(value);
                  }}
                  maxLength={MAX_COMPLETION_DESCRIPTION_LENGTH}
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
            {(localError || error) && (
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                style={styles.error}
              >
                {localError ?? error}
              </Text>
            )}
            <TouchableOpacity
              accessibilityLabel={saving ? '正在存下來' : '存下來，讓孩子看看'}
              accessibilityRole="button"
              accessibilityState={{ disabled: primaryDisabled }}
              style={[styles.primary, primaryDisabled && styles.primaryDisabled]}
              onPress={submit}
              disabled={primaryDisabled}
            >
              <Text style={styles.primaryText}>{saving ? '正在存下來…' : '存下來，讓孩子看看'}</Text>
            </TouchableOpacity>
              </>
            )}
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
  closeButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
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
  unsupportedCard: { minHeight: 72, justifyContent: 'center', padding: ParentSpacing[3], borderRadius: ParentRadii.md, backgroundColor: ParentColors.bgSurfaceWarm },
  currentValue: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, color: ParentColors.fgSecondary },
  summary: { gap: ParentSpacing[2], padding: ParentSpacing[3], borderRadius: ParentRadii.md, backgroundColor: ParentColors.bgSurfaceWarm },
  summaryTitle: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, fontWeight: ParentFontWeights.bold, color: ParentColors.fgPrimary },
  summaryItem: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, color: ParentColors.fgSecondary },
  error: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, color: ParentColors.error },
  primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: ParentSpacing[3], borderRadius: ParentRadii.pill, backgroundColor: ParentColors.accent },
  primaryDisabled: { backgroundColor: ParentColors.borderMedium },
  primaryText: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, fontWeight: ParentFontWeights.bold, color: '#FFFFFF' },
});
