import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentSpacing,
} from '../../../../constants/parentTheme';

export const UNSUITABLE_REASON_PRESETS = [
  '最近安排比較滿，我們晚一點再一起想',
  '這個做法現在可能不太適合',
  '我們先從別的方法開始',
] as const;

type Props = {
  visible: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
};

export function ParentProposalUnsuitableSheet({ visible, saving, error, onClose, onSubmit }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [customReason, setCustomReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelected(null);
    setCustom(false);
    setCustomReason('');
    setLocalError(null);
  }, [visible]);

  const submit = () => {
    const reason = custom ? customReason.trim() : selected;
    if (!reason) {
      setLocalError('請留一句話給孩子');
      return;
    }
    onSubmit(reason);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>想留一句話給孩子嗎？</Text>
            <TouchableOpacity onPress={onClose} disabled={saving}><Text style={styles.close}>關閉</Text></TouchableOpacity>
          </View>
          {UNSUITABLE_REASON_PRESETS.map(reason => (
            <TouchableOpacity
              key={reason}
              style={[styles.option, selected === reason && !custom && styles.optionSelected]}
              onPress={() => { setSelected(reason); setCustom(false); setLocalError(null); }}
            >
              <Text style={styles.optionText}>{reason}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.option, custom && styles.optionSelected]}
            onPress={() => { setCustom(true); setSelected(null); setLocalError(null); }}
          >
            <Text style={styles.optionText}>自己寫一句</Text>
          </TouchableOpacity>
          {custom && (
            <TextInput
              testID="proposal-unsuitable-custom-input"
              value={customReason}
              onChangeText={setCustomReason}
              style={styles.input}
              multiline
            />
          )}
          {(localError || error) && <Text style={styles.error}>{localError ?? error}</Text>}
          <TouchableOpacity style={styles.primary} onPress={submit}>
            <Text style={styles.primaryText}>{saving ? '正在收好…' : '先把這個想法收好'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20, 35, 28, 0.35)' },
  sheet: { gap: ParentSpacing[3], padding: ParentSpacing[5], borderTopLeftRadius: ParentRadii.lg, borderTopRightRadius: ParentRadii.lg, backgroundColor: ParentColors.bgSurface },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: ParentSpacing[3] },
  title: { flex: 1, fontFamily: ParentFonts.display, fontSize: ParentFontSizes.h3, fontWeight: ParentFontWeights.bold, color: ParentColors.fgPrimary },
  close: { fontFamily: ParentFonts.body, color: ParentColors.fgMuted },
  option: { padding: ParentSpacing[3], borderRadius: ParentRadii.md, borderWidth: 1, borderColor: ParentColors.borderSoft },
  optionSelected: { borderColor: ParentColors.accent, backgroundColor: ParentColors.bgSurfaceWarm },
  optionText: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, color: ParentColors.fgPrimary },
  input: { minHeight: 80, padding: ParentSpacing[3], borderWidth: 1, borderColor: ParentColors.borderMedium, borderRadius: ParentRadii.md, color: ParentColors.fgPrimary, textAlignVertical: 'top' },
  error: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, color: ParentColors.error },
  primary: { alignItems: 'center', padding: ParentSpacing[3], borderRadius: ParentRadii.pill, backgroundColor: ParentColors.accent },
  primaryText: { fontFamily: ParentFonts.body, fontSize: ParentFontSizes.sm, fontWeight: ParentFontWeights.bold, color: '#FFFFFF' },
});
