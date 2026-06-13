import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { createLongTermGoal } from '../../lib/taskActions';
import type { RootStackParamList } from '../../../App';
import {
  ParentColors,
  ParentFontSizes,
  ParentFontWeights,
  ParentSpacing,
  ParentRadii,
  ParentFonts,
} from '../../constants/parentTheme';

type Nav = StackNavigationProp<RootStackParamList, 'ParentLongTermCreate'>;
type Route = RouteProp<RootStackParamList, 'ParentLongTermCreate'>;

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ChevLeftIcon({ size = 20, color = ParentColors.ink700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function TrashIcon({ size = 16, color = ParentColors.error }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Checkpoint = { day: string; coins: string };

const DAY_PRESETS = [21, 30, 60, 90];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ParentLongTermCreateScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { childId } = route.params;

  const [name, setName] = useState('');
  const [totalDaysPreset, setTotalDaysPreset] = useState<number | null>(30);
  const [customDays, setCustomDays] = useState('');
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([
    { day: '', coins: '' },
    { day: '', coins: '' },
  ]);
  const [motivationNote, setMotivationNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  const effectiveDays = totalDaysPreset !== null ? totalDaysPreset : Number.parseInt(customDays, 10);

  // Update default checkpoint day hints when total days changes
  const totalDays = Number.isFinite(effectiveDays) && effectiveDays >= 7 ? effectiveDays : null;

  // ---------------------------------------------------------------------------
  // Checkpoint helpers
  // ---------------------------------------------------------------------------

  const updateCheckpoint = useCallback((idx: number, field: keyof Checkpoint, value: string) => {
    setCheckpoints(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }, []);

  const addCheckpoint = useCallback(() => {
    setCheckpoints(prev => [...prev, { day: '', coins: '' }]);
    // Scroll down after adding
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const removeCheckpoint = useCallback((idx: number) => {
    setCheckpoints(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // ---------------------------------------------------------------------------
  // Validation + submit
  // ---------------------------------------------------------------------------

  const validate = (): string | null => {
    if (!name.trim()) return '請輸入目標名稱';
    if (!totalDays) return '請選擇或輸入總天數（至少 7 天）';

    const filled = checkpoints.filter(cp => cp.day.trim() || cp.coins.trim());
    for (const cp of filled) {
      const d = Number.parseInt(cp.day, 10);
      const c = Number.parseInt(cp.coins, 10);
      if (!Number.isFinite(d) || d < 1) return '關卡天數必須是正整數';
      if (d > totalDays) return `關卡天數不能超過總天數（${totalDays} 天）`;
      if (!Number.isFinite(c) || c < 1) return '關卡金幣數必須是正整數';
    }

    const days = filled.map(cp => Number.parseInt(cp.day, 10));
    if (new Set(days).size !== days.length) return '每個關卡的天數不能重複';

    return null;
  };

  const handleSubmit = useCallback(async () => {
    console.log('[ParentLongTermCreateScreen] handleSubmit called', { childId, name, totalDays });
    const err = validate();
    if (err) {
      Alert.alert('請檢查輸入', err);
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('請先登入');

      const { data: parentRow } = await supabase
        .from('parents')
        .select('family_id')
        .eq('user_id', user.id)
        .single();

      if (!parentRow) throw new Error('找不到家長資料');

      const rewardsMap: Record<string, number> = {};
      for (const cp of checkpoints) {
        if (!cp.day.trim() && !cp.coins.trim()) continue;
        rewardsMap[cp.day.trim()] = Number.parseInt(cp.coins, 10);
      }

      await createLongTermGoal({
        familyId: parentRow.family_id,
        childId,
        name: name.trim(),
        totalDays: totalDays!,
        checkpointRewards: rewardsMap,
        motivationNote: motivationNote.trim() || undefined,
      });

      navigation.goBack();
    } catch (err) {
      console.error('[ParentLongTermCreateScreen] handleSubmit error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('建立失敗', msg);
    } finally {
      setSubmitting(false);
    }
  }, [childId, name, totalDays, checkpoints, motivationNote, navigation]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* NavBar */}
      <View style={[styles.navBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevLeftIcon size={22} />
          <Text style={styles.backLabel}>返回</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>新增長期目標</Text>
        <View style={styles.navSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── 目標名稱 ──────────────────────────────── */}
          <Text style={styles.sectionLabel}>目標名稱</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="例如：每天喝 2000ml 水"
            placeholderTextColor={ParentColors.ink300}
            maxLength={60}
          />

          {/* ── 總天數 ────────────────────────────────── */}
          <Text style={styles.sectionLabel}>總天數</Text>
          <View style={styles.presetRow}>
            {DAY_PRESETS.map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.presetBtn, totalDaysPreset === d && styles.presetBtnActive]}
                onPress={() => { setTotalDaysPreset(d); setCustomDays(''); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.presetText, totalDaysPreset === d && styles.presetTextActive]}>
                  {d} 天
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.presetBtn, totalDaysPreset === null && styles.presetBtnActive]}
              onPress={() => setTotalDaysPreset(null)}
              activeOpacity={0.8}
            >
              <Text style={[styles.presetText, totalDaysPreset === null && styles.presetTextActive]}>
                自訂
              </Text>
            </TouchableOpacity>
          </View>
          {totalDaysPreset === null && (
            <TextInput
              style={[styles.input, styles.inputSmall]}
              value={customDays}
              onChangeText={setCustomDays}
              placeholder="輸入天數（至少 7 天）"
              placeholderTextColor={ParentColors.ink300}
              keyboardType="number-pad"
              maxLength={4}
            />
          )}

          {/* ── 里程碑關卡 ───────────────────────────── */}
          <Text style={styles.sectionLabel}>里程碑關卡</Text>
          <Text style={styles.sectionHint}>
            設定孩子達到特定天數時的金幣獎勵，讓努力有具體的肯定。
          </Text>

          {checkpoints.map((cp, idx) => (
            <View key={idx} style={styles.cpRow}>
              <Text style={styles.cpPrefix}>第</Text>
              <TextInput
                style={styles.cpDayInput}
                value={cp.day}
                onChangeText={v => updateCheckpoint(idx, 'day', v)}
                placeholder={totalDays ? String(Math.round(totalDays * (idx === 0 ? 0.33 : 0.67))) : '天'}
                placeholderTextColor={ParentColors.ink300}
                keyboardType="number-pad"
                maxLength={4}
              />
              <Text style={styles.cpMid}>天 →</Text>
              <TextInput
                style={styles.cpCoinInput}
                value={cp.coins}
                onChangeText={v => updateCheckpoint(idx, 'coins', v)}
                placeholder="枚金幣"
                placeholderTextColor={ParentColors.ink300}
                keyboardType="number-pad"
                maxLength={5}
              />
              {checkpoints.length > 1 && (
                <TouchableOpacity
                  style={styles.cpDeleteBtn}
                  onPress={() => removeCheckpoint(idx)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <TrashIcon size={16} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          <TouchableOpacity style={styles.addCpBtn} onPress={addCheckpoint} activeOpacity={0.8}>
            <Text style={styles.addCpText}>＋ 新增關卡</Text>
          </TouchableOpacity>

          {/* ── 動機備注 ──────────────────────────────── */}
          <Text style={styles.sectionLabel}>給孩子的話（選填）</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={motivationNote}
            onChangeText={setMotivationNote}
            placeholder="例如：你一直說想要學游泳，這是第一步！"
            placeholderTextColor={ParentColors.ink300}
            multiline
            numberOfLines={3}
            maxLength={200}
          />

          {/* ── 提交 ─────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>建立目標</Text>
            )}
          </TouchableOpacity>

          <View style={styles.bottomPad} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: ParentColors.bgCanvas,
  },
  flex: {
    flex: 1,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ParentSpacing.gutter,
    paddingBottom: 10,
    backgroundColor: ParentColors.bgCanvas,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    minWidth: 64,
  },
  backLabel: {
    fontSize: 15,
    color: ParentColors.ink700,
    fontFamily: ParentFonts.body,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
  },
  navSpacer: {
    minWidth: 64,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: ParentSpacing.gutter,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
    lineHeight: 18,
    marginBottom: 12,
    marginTop: -4,
  },
  input: {
    backgroundColor: ParentColors.bgSurface,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: ParentFontSizes.pBody,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.body,
  },
  inputSmall: {
    marginTop: 8,
  },
  inputMulti: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  presetBtn: {
    borderRadius: ParentRadii.pill,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  presetBtnActive: {
    backgroundColor: ParentColors.teal50,
    borderColor: ParentColors.teal500,
  },
  presetText: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },
  presetTextActive: {
    color: ParentColors.teal500,
  },
  cpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    backgroundColor: ParentColors.bgSurface,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cpPrefix: {
    fontSize: 14,
    color: ParentColors.fgMuted,
    fontFamily: ParentFonts.body,
  },
  cpDayInput: {
    width: 56,
    fontSize: 15,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    textAlign: 'center',
    fontFamily: ParentFonts.display,
    padding: 0,
  },
  cpMid: {
    fontSize: 14,
    color: ParentColors.fgMuted,
    fontFamily: ParentFonts.body,
    marginRight: 4,
  },
  cpCoinInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    fontFamily: ParentFonts.display,
    padding: 0,
  },
  cpDeleteBtn: {
    padding: 4,
  },
  addCpBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderStyle: 'dashed',
    marginBottom: 4,
  },
  addCpText: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.teal500,
  },
  submitBtn: {
    marginTop: 28,
    backgroundColor: ParentColors.teal500,
    borderRadius: ParentRadii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: ParentColors.shadowBase,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  submitBtnDisabled: {
    opacity: 0.65,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: ParentFontWeights.bold,
    fontFamily: ParentFonts.display,
  },
  bottomPad: {
    height: 40,
  },
});
