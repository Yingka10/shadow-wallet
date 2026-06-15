// Shadow Wallet · AddChildScreen
// 已登入家長新增第二個（或更多）孩子。
// 收集暱稱 + 生日 + 選填 PIN，建立孩子後進入 GoalSetup → TaskSelection → Overview 流程。

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { supabase } from '../../lib/supabase';
import { addChildToFamily } from '../../lib/onboarding';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentShadows,
} from '../../constants/parentTheme';
import type { RootStackParamList } from '../../../App';

type Nav = StackNavigationProp<RootStackParamList, 'AddChild'>;

// ─────────────────────────────────────────────────────────────────────────────

function FieldLabel({ text }: { text: string }) {
  return <Text style={s.fieldLabel}>{text}</Text>;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AddChildScreen() {
  const navigation = useNavigation<Nav>();

  const [nickname, setNickname] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function validate(): string {
    if (!nickname.trim()) return '請輸入孩子的暱稱';
    const y = parseInt(birthYear, 10);
    const m = parseInt(birthMonth, 10);
    const d = parseInt(birthDay, 10);
    if (!birthYear || !birthMonth || !birthDay) return '請填寫完整的出生日期';
    if (isNaN(y) || y < 2010 || y > 2025) return '請輸入正確的出生年份（2010–2025）';
    if (isNaN(m) || m < 1 || m > 12) return '請輸入正確的月份（1–12）';
    if (isNaN(d) || d < 1 || d > 31) return '請輸入正確的日期（1–31）';
    if (pin && pin.length !== 4) return 'PIN 碼需要恰好 4 位數字';
    if (pin && !/^\d{4}$/.test(pin)) return 'PIN 碼只能包含數字';
    return '';
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setError('');
    setSubmitting(true);

    try {
      const birthDate = [
        birthYear.padStart(4, '0'),
        birthMonth.padStart(2, '0'),
        birthDay.padStart(2, '0'),
      ].join('-');

      // Resolve family ID from current auth user's parent record
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('請重新登入後再試');

      const { data: parentData, error: parentErr } = await supabase
        .from('parents')
        .select('family_id')
        .eq('user_id', user.id)
        .single();
      if (parentErr || !parentData) throw new Error('找不到家庭資料，請重新登入');

      const { childId, ageGroup } = await addChildToFamily({
        familyId: parentData.family_id,
        childNickname: nickname.trim(),
        childBirthDate: birthDate,
        childPin: pin || undefined,
      });

      navigation.replace('GoalSetup', {
        childId,
        childNickname: nickname.trim(),
        familyId: parentData.family_id,
        ageGroup,
        isOnboarding: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生未知錯誤，請再試一次');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.backLabel}>✕</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>新增孩子</Text>
          <View style={s.headerRight} />
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.card}>
            <Text style={s.sectionTitle}>基本資料</Text>
            <Text style={s.sectionSub}>填好之後會進入目標設定和任務選擇</Text>

            {/* 暱稱 */}
            <View style={s.fieldGroup}>
              <FieldLabel text="暱稱" />
              <TextInput
                style={s.input}
                value={nickname}
                onChangeText={setNickname}
                placeholder="孩子在 App 裡的名字"
                placeholderTextColor={ParentColors.fgMuted}
                maxLength={16}
                returnKeyType="next"
              />
            </View>

            {/* 生日 */}
            <View style={s.fieldGroup}>
              <FieldLabel text="出生日期" />
              <View style={s.dateRow}>
                <View style={s.dateFieldWrap}>
                  <TextInput
                    style={[s.input, s.dateInput]}
                    value={birthYear}
                    onChangeText={setBirthYear}
                    placeholder="年"
                    placeholderTextColor={ParentColors.fgMuted}
                    keyboardType="number-pad"
                    maxLength={4}
                    returnKeyType="next"
                  />
                  <Text style={s.dateUnit}>年</Text>
                </View>
                <View style={s.dateFieldWrap}>
                  <TextInput
                    style={[s.input, s.dateInput]}
                    value={birthMonth}
                    onChangeText={setBirthMonth}
                    placeholder="月"
                    placeholderTextColor={ParentColors.fgMuted}
                    keyboardType="number-pad"
                    maxLength={2}
                    returnKeyType="next"
                  />
                  <Text style={s.dateUnit}>月</Text>
                </View>
                <View style={s.dateFieldWrap}>
                  <TextInput
                    style={[s.input, s.dateInput]}
                    value={birthDay}
                    onChangeText={setBirthDay}
                    placeholder="日"
                    placeholderTextColor={ParentColors.fgMuted}
                    keyboardType="number-pad"
                    maxLength={2}
                    returnKeyType="done"
                  />
                  <Text style={s.dateUnit}>日</Text>
                </View>
              </View>
              <Text style={s.fieldHint}>年齡決定任務類型與幣制複雜度</Text>
            </View>

            {/* PIN（選填） */}
            <View style={s.fieldGroup}>
              <FieldLabel text="孩子 PIN 碼（選填）" />
              <TextInput
                style={s.input}
                value={pin}
                onChangeText={text => setPin(text.replace(/\D/g, '').slice(0, 4))}
                placeholder="4 位數字，孩子端登入用"
                placeholderTextColor={ParentColors.fgMuted}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                returnKeyType="done"
              />
              <Text style={s.fieldHint}>不填也可以，之後可以在設定中更改</Text>
            </View>
          </View>

          {/* Error */}
          {error ? <Text style={s.errorText}>{error}</Text> : null}

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, submitting && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.submitLabel}>下一步：設定目標 →</Text>}
          </TouchableOpacity>

          <Text style={s.footerNote}>接下來會設定第一個兌換目標，以及任務包</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: ParentColors.bgCanvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ParentColors.borderSoft,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: ParentRadii.sm,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 14,
    color: ParentColors.fgSecondary,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: ParentFonts.display,
    fontSize: 18,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
  },
  headerRight: {
    width: 32,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 24,
    maxWidth: 560,
    alignSelf: 'center',
    width: '100%',
    paddingBottom: 48,
  },
  card: {
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.xl,
    padding: 24,
    marginBottom: 20,
    ...ParentShadows.card,
  },
  sectionTitle: {
    fontFamily: ParentFonts.display,
    fontSize: 20,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    marginBottom: 4,
  },
  sectionSub: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
    marginBottom: 24,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: ParentFonts.body,
    fontSize: 15,
    color: ParentColors.fgPrimary,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateFieldWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateInput: {
    flex: 1,
    textAlign: 'center',
  },
  dateUnit: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgMuted,
    flexShrink: 0,
  },
  fieldHint: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.fgMuted,
    marginTop: 6,
  },
  errorText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.error,
    textAlign: 'center',
    marginBottom: 16,
  },
  submitBtn: {
    backgroundColor: ParentColors.accent,
    borderRadius: ParentRadii.pill,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  submitBtnDisabled: {
    opacity: 0.55,
  },
  submitLabel: {
    fontFamily: ParentFonts.body,
    fontSize: 16,
    fontWeight: ParentFontWeights.semi,
    color: '#fff',
  },
  footerNote: {
    fontFamily: ParentFonts.body,
    fontSize: 12,
    color: ParentColors.fgMuted,
    textAlign: 'center',
  },
});
