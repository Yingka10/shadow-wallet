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
  ParentProposalCardData,
  ParentProposalMaterialEdits,
} from '../../../../lib/childProposal';
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
  { value: 'after_school', label: '放學後' },
  { value: 'after_dinner', label: '晚餐後' },
  { value: 'before_bed', label: '睡前' },
  { value: 'custom', label: '自訂時間' },
] as const;

export function ParentProposalEditSheet({ visible, card, saving, error, onClose, onSave }: Props) {
  const plan = card.currentPlanVersion;
  const [mode, setMode] = useState<'weekly_frequency' | 'fixed_days'>('weekly_frequency');
  const [frequency, setFrequency] = useState('1');
  const [days, setDays] = useState<number[]>([]);
  const [preferredTime, setPreferredTime] = useState('after_dinner');
  const [preferredTimeCustom, setPreferredTimeCustom] = useState('');
  const [completionDescription, setCompletionDescription] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !plan) return;
    setMode(plan.cadence_mode === 'fixed_days' ? 'fixed_days' : 'weekly_frequency');
    setFrequency(String(plan.cadence_weekly_frequency ?? 1));
    setDays(plan.cadence_days ?? []);
    setPreferredTime(plan.preferred_time ?? 'after_dinner');
    setPreferredTimeCustom(plan.preferred_time_custom ?? '');
    setCompletionDescription(plan.completion_description ?? '');
    setLocalError(null);
  }, [plan, visible]);

  const submit = () => {
    const parsedFrequency = Number(frequency);
    if (mode === 'weekly_frequency' && (!Number.isInteger(parsedFrequency) || parsedFrequency < 1 || parsedFrequency > 7)) {
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
      cadenceWeeklyFrequency: mode === 'weekly_frequency' ? parsedFrequency : null,
      cadenceDays: mode === 'fixed_days' ? [...days].sort((a, b) => a - b) : null,
      preferredTime,
      preferredTimeCustom: preferredTime === 'custom' ? preferredTimeCustom.trim() : null,
      completionDescription: completionDescription.trim(),
    });
  };

  if (!plan) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>調整一下</Text>
              <TouchableOpacity onPress={onClose} disabled={saving}><Text style={styles.close}>關閉</Text></TouchableOpacity>
            </View>

            <Text style={styles.label}>安排方式</Text>
            <View style={styles.row}>
              <Choice label="一週幾次" selected={mode === 'weekly_frequency'} onPress={() => setMode('weekly_frequency')} />
              <Choice label="固定星期" selected={mode === 'fixed_days'} onPress={() => setMode('fixed_days')} />
            </View>
            {mode === 'weekly_frequency' ? (
              <TextInput
                testID="proposal-weekly-frequency-input"
                value={frequency}
                onChangeText={setFrequency}
                keyboardType="number-pad"
                style={styles.input}
              />
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
              {TIMES.map(option => (
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
                testID="proposal-preferred-time-custom-input"
                value={preferredTimeCustom}
                onChangeText={setPreferredTimeCustom}
                style={styles.input}
                placeholder="例如：週末早餐後"
              />
            )}

            <Text style={styles.label}>怎樣算完成</Text>
            <TextInput
              testID="proposal-completion-description-input"
              value={completionDescription}
              onChangeText={setCompletionDescription}
              style={[styles.input, styles.multiline]}
              multiline
            />
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
    <TouchableOpacity style={[styles.choice, selected && styles.choiceSelected]} onPress={onPress}>
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
  label: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, fontWeight: ParentFontWeights.bold, color: ParentColors.fgPrimary },
  row: { flexDirection: 'row', gap: ParentSpacing[2] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: ParentSpacing[2] },
  choice: { paddingHorizontal: ParentSpacing[3], paddingVertical: ParentSpacing[2], borderRadius: ParentRadii.pill, borderWidth: 1, borderColor: ParentColors.borderMedium },
  choiceSelected: { backgroundColor: ParentColors.accent, borderColor: ParentColors.accent },
  choiceText: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, color: ParentColors.fgSecondary },
  choiceTextSelected: { color: '#FFFFFF', fontWeight: ParentFontWeights.bold },
  input: { minHeight: 44, paddingHorizontal: ParentSpacing[3], paddingVertical: ParentSpacing[2], borderWidth: 1, borderColor: ParentColors.borderMedium, borderRadius: ParentRadii.md, color: ParentColors.fgPrimary },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  error: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, color: ParentColors.error },
  primary: { alignItems: 'center', padding: ParentSpacing[3], borderRadius: ParentRadii.pill, backgroundColor: ParentColors.accent },
  primaryText: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, fontWeight: ParentFontWeights.bold, color: '#FFFFFF' },
});
