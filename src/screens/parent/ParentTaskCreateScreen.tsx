import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Circle } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { suggestTaskCoin } from '../../lib/aiAgent';
import { useSelectedChild } from '../../context/SelectedChildContext';
import {
  ParentColors,
  ParentFontSizes,
  ParentFontWeights,
  ParentSpacing,
  ParentRadii,
  ParentFonts,
} from '../../constants/parentTheme';
import type { TaskCategory } from '../../types/database';

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

function CheckIcon({ size = 16, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12l5 5L20 7" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SparkleIcon({ size = 14, color = ParentColors.clay500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z"
        stroke={color} strokeWidth={1.8} strokeLinejoin="round"
      />
    </Svg>
  );
}

function HourglassSmIcon({ size = 14, color = ParentColors.teal500 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 2h14M5 22h14M6 2c0 7 6 8 6 10s-6 3-6 10M18 2c0 7-6 8-6 10s6 3 6 10"
        stroke={color} strokeWidth={1.8} strokeLinecap="round"
      />
    </Svg>
  );
}

function CoinGlyph({ size = 13 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" fill="#F5B800" />
      <Circle cx="12" cy="12" r="7" fill="#D69A00" fillOpacity={0.3} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function FormGroup({ label, hint, children }: { label: string; hint?: string | null; children: React.ReactNode }) {
  return (
    <View style={styles.formGroup}>
      <View style={styles.formGroupHeader}>
        <Text style={styles.formGroupLabel}>{label}</Text>
        {!!hint && <Text style={styles.formGroupHint}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

function Stepper({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const handleBlur = () => {
    const val = parseInt(text, 10);
    if (isNaN(val)) {
      setText(String(value));
    } else {
      const clamped = Math.max(min, Math.min(max, val));
      onChange(clamped);
      setText(String(clamped));
    }
  };

  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        style={styles.stepperBtn}
        onPress={() => onChange(Math.max(min, value - step))}
        activeOpacity={0.6}
      >
        <View style={styles.stepperBtnMinus} />
      </TouchableOpacity>
      <View style={styles.stepperInputRow}>
        <TextInput
          style={styles.stepperInput}
          value={text}
          onChangeText={setText}
          onBlur={handleBlur}
          keyboardType="number-pad"
          selectTextOnFocus
        />
        <Text style={styles.stepperSuffix}>{suffix}</Text>
      </View>
      <TouchableOpacity
        style={styles.stepperBtn}
        onPress={() => onChange(Math.min(max, value + step))}
        activeOpacity={0.6}
      >
        <View style={styles.stepperBtnMinus} />
        <View style={[styles.stepperBtnMinus, { transform: [{ rotate: '90deg' }] }]} />
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function ParentTaskCreateScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { childId, allChildren } = useSelectedChild();

  const [name, setName] = useState('');
  const [cat, setCat] = useState<TaskCategory>('A');
  const [taskMode, setTaskMode] = useState<'recurring' | 'deadline'>('recurring');
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [dueYear, setDueYear] = useState(() => new Date(Date.now() + 30 * 86400000).getFullYear());
  const [dueMonth, setDueMonth] = useState(() => new Date(Date.now() + 30 * 86400000).getMonth() + 1);
  const [dueDay, setDueDay] = useState(() => new Date(Date.now() + 30 * 86400000).getDate());
  const [rewardN, setRewardN] = useState(5);
  const [rewardM, setRewardM] = useState(15);
  const [rewardOverride, setRewardOverride] = useState<'auto' | 'coins' | 'time'>('auto');
  const [appliesTo, setAppliesTo] = useState<string[]>(childId ? [childId] : []);
  const [saving, setSaving] = useState(false);
  const [aiCoinLoading, setAiCoinLoading] = useState(false);
  const [aiCoinReason, setAiCoinReason] = useState<string | null>(null);

  const isDuty = cat === 'B';
  const isMilestone = cat === 'D';
  const useTime = rewardOverride === 'time' ? true : rewardOverride === 'coins' ? false : isDuty;

  const suggestions = ['整理玩具', '幫忙摺衣服', '練琴 30 分鐘', '幫忙準備餐桌', '自己量血壓記錄'];

  async function handleAiCoinSuggest() {
    if (!name.trim()) return;
    setAiCoinLoading(true);
    setAiCoinReason(null);
    try {
      const result = await suggestTaskCoin(name.trim());
      setRewardN(result.coins);
      setAiCoinReason(result.reason);
    } catch {
      Alert.alert('AI 建議失敗', '請手動設定幣值');
    } finally {
      setAiCoinLoading(false);
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('提示', '請輸入任務名稱');
      return;
    }
    if (appliesTo.length === 0) {
      Alert.alert('提示', '請至少選擇一位適用孩子');
      return;
    }
    if (taskMode === 'recurring' && selectedDays.length === 0) {
      Alert.alert('提示', '請至少選擇一天執行日期');
      return;
    }

    setSaving(true);
    try {
      // 1. Get familyId
      const { data: parent } = await supabase.from('parents').select('family_id').limit(1).single();
      if (!parent) throw new Error('Cannot find family ID');

      // 2. Determine reward logic
      const baseTimeMin = useTime ? rewardM : 15; // default 15 if not time
      const coinOverride = !useTime && rewardOverride === 'coins' ? rewardN : null;

      // 3. Insert into tasks
      const { data: taskRes, error: taskErr } = await supabase
        .from('tasks')
        .insert({
          family_id: parent.family_id,
          name: name.trim(),
          category: cat,
          day_type: taskMode === 'recurring' ? 'custom' : 'once',
          recurrence_days: taskMode === 'recurring' ? selectedDays : null,
          due_date: taskMode === 'deadline'
            ? `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
            : null,
          base_time_min: baseTimeMin,
          difficulty: 1,
          time_saving_min: useTime ? rewardM : 0,
          coin_override: coinOverride,
          is_active: true,
          is_system_default: false,
          allow_repeat: false,
          min_age: 0,
          max_age: 99,
        })
        .select('id')
        .single();

      if (taskErr) throw taskErr;
      const taskId = taskRes.id;

      // 4. Insert child_tasks
      const childTasks = appliesTo.map(cid => ({
        child_id: cid,
        task_id: taskId,
        is_active: true,
      }));
      const { error: ctErr } = await supabase.from('child_tasks').insert(childTasks);
      if (ctErr) throw ctErr;

      navigation.goBack();
    } catch (err: any) {
      console.error('[ParentTaskCreateScreen] Error saving task:', err);
      Alert.alert('錯誤', err.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* ── Nav Bar ──────────────────────────────────────────────── */}
      <View style={[styles.navBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          style={styles.backNavBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevLeftIcon size={22} color={ParentColors.ink700} />
          <Text style={styles.backNavLabel}>取消</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>新增任務</Text>
        <View style={styles.navSpacer} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>新增</Text>
            <Text style={styles.heroTitle}>設一項新任務</Text>
            <Text style={styles.heroMeta}>
              完成後 {appliesTo.length === 1 ? allChildren.find(c => c.id === appliesTo[0])?.nickname || '孩子' : '所選孩子'}會立刻看到
            </Text>
          </View>

          {/* Name + suggestions */}
          <FormGroup label="任務名稱" hint="可從建議選一個，或自己輸入">
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="例：自己摺好今天穿的衣服"
              placeholderTextColor={ParentColors.ink400}
            />
            <View style={styles.suggestions}>
              {suggestions.map(s => {
                const active = name === s;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setName(s)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </FormGroup>

          {/* Category */}
          <FormGroup label="類別" hint={isDuty ? '家庭本分：獎勵為「時間」' : isMilestone ? '里程碑：獎勵是進度' : '獎勵為金幣'}>
            <View style={styles.grid2}>
              {(['A', 'B', 'C', 'D'] as TaskCategory[]).map(c => {
                const active = cat === c;
                const labels = { A: '生活自理', B: '家庭本分', C: '超出本分', D: '里程碑' };
                return (
                  <TouchableOpacity
                    key={c}
                    style={[styles.catOption, active && styles.catOptionActive]}
                    onPress={() => setCat(c)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.catOptionText, active && styles.catOptionTextActive]}>
                      {c}. {labels[c]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </FormGroup>

          {/* Reward */}
          <FormGroup label="獎勵設定" hint={isMilestone ? '里程碑任務不發獎勵' : null}>
            {!isMilestone && (
              <>
                <View style={styles.rewardOverrideRow}>
                  <Text style={styles.rewardOverrideLabel}>獎勵類型</Text>
                  <Text style={styles.rewardOverrideHint}>
                    {rewardOverride === 'auto' && '依類別、可指定'}
                    {rewardOverride === 'coins' && '已改指定金幣'}
                    {rewardOverride === 'time' && '已改指定時間'}
                  </Text>
                </View>
                <View style={styles.grid3}>
                  {(['auto', 'coins', 'time'] as const).map(rt => {
                    const active = rewardOverride === rt;
                    const lbl = rt === 'auto' ? '自動' : rt === 'coins' ? '金幣' : '時間';
                    return (
                      <TouchableOpacity
                        key={rt}
                        style={[styles.rewardOption, active && styles.catOptionActive]}
                        onPress={() => setRewardOverride(rt)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.catOptionText, active && styles.catOptionTextActive]}>{lbl}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {rewardOverride !== 'auto' && (
                  <View style={styles.rewardWarn}>
                    <SparkleIcon size={12} />
                    <Text style={styles.rewardWarnText}>已手動指定獎勵類型</Text>
                  </View>
                )}

                <View style={styles.rewardBox}>
                  <View style={styles.rewardBoxLeft}>
                    {useTime ? <HourglassSmIcon size={20} /> : <CoinGlyph size={18} />}
                    <View>
                      <Text style={styles.rewardBoxTitle}>{useTime ? '時間獎勵' : '金幣獎勵'}</Text>
                      <Text style={styles.rewardBoxDesc}>{useTime ? '累積到儲蓄本' : '可用於兌換'}</Text>
                    </View>
                  </View>
                  <Stepper
                    value={useTime ? rewardM : rewardN}
                    onChange={v => (useTime ? setRewardM(v) : setRewardN(v))}
                    min={useTime ? 5 : 1}
                    max={useTime ? 60 : 50}
                    step={useTime ? 5 : 1}
                    suffix={useTime ? '分' : '幣'}
                  />
                </View>
                {!useTime && (
                  <View style={styles.aiCoinRow}>
                    <TouchableOpacity
                      style={[styles.aiCoinBtn, (!name.trim() || aiCoinLoading) && styles.aiCoinBtnDisabled]}
                      onPress={handleAiCoinSuggest}
                      disabled={!name.trim() || aiCoinLoading}
                      activeOpacity={0.7}
                    >
                      {aiCoinLoading
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.aiCoinBtnText}>✨ AI 建議幣值</Text>}
                    </TouchableOpacity>
                    {aiCoinReason ? <Text style={styles.aiCoinReason}>{aiCoinReason}</Text> : null}
                  </View>
                )}
              </>
            )}
            {isMilestone && (
              <View style={styles.milestoneNotice}>
                <SparkleIcon size={14} color={ParentColors.ink700} />
                <Text style={styles.milestoneNoticeText}>儲存後可於詳情頁設定關卡</Text>
              </View>
            )}
          </FormGroup>

          {/* Frequency */}
          <FormGroup label="執行方式">
            <View style={styles.grid2}>
              {(['recurring', 'deadline'] as const).map(mode => {
                const active = taskMode === mode;
                const lbl = mode === 'recurring' ? '週期任務' : '期限任務';
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.catOption, active && styles.catOptionActive]}
                    onPress={() => setTaskMode(mode)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.catOptionText, active && styles.catOptionTextActive]}>{lbl}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {taskMode === 'recurring' && (
              <View style={styles.dayPickerRow}>
                {['日', '一', '二', '三', '四', '五', '六'].map((lbl, idx) => {
                  const on = selectedDays.includes(idx);
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.dayBtn, on && styles.dayBtnActive]}
                      onPress={() => setSelectedDays(prev =>
                        on ? prev.filter(d => d !== idx) : [...prev, idx].sort((a, b) => a - b)
                      )}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dayBtnText, on && styles.dayBtnTextActive]}>週{lbl}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {taskMode === 'deadline' && (
              <View style={styles.deadlineRow}>
                <Stepper value={dueYear} onChange={setDueYear} min={2024} max={2030} step={1} suffix="年" />
                <Stepper value={dueMonth} onChange={setDueMonth} min={1} max={12} step={1} suffix="月" />
                <Stepper value={dueDay} onChange={setDueDay} min={1} max={31} step={1} suffix="日" />
              </View>
            )}
          </FormGroup>

          {/* Applies to */}
          <FormGroup label="適用孩子" hint="可同時套用給多位孩子">
            <View style={styles.kidsList}>
              {allChildren.map(k => {
                const on = appliesTo.includes(k.id);
                return (
                  <TouchableOpacity
                    key={k.id}
                    style={[styles.kidOption, on && styles.kidOptionActive]}
                    onPress={() => setAppliesTo(prev => on ? prev.filter(x => x !== k.id) : [...prev, k.id])}
                    activeOpacity={0.7}
                  >
                    <View style={styles.kidOptionAvatar}>
                      <Text style={styles.kidOptionAvatarText}>{k.nickname.charAt(0)}</Text>
                    </View>
                    <View style={styles.kidOptionInfo}>
                      <Text style={styles.kidOptionName}>{k.nickname}</Text>
                    </View>
                    <View style={[styles.checkbox, on && styles.checkboxActive]}>
                      {on && <CheckIcon size={12} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </FormGroup>
        </ScrollView>
        
        {/* Submit Bar */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <CheckIcon size={16} />
                <Text style={styles.submitBtnText}>建立任務</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
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
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ParentSpacing.gutter,
    paddingBottom: 10,
    backgroundColor: ParentColors.bgCanvas,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  backNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    minWidth: 64,
  },
  backNavLabel: {
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
    paddingHorizontal: ParentSpacing.gutter,
    paddingTop: 14,
    paddingBottom: 40,
  },
  hero: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.ink900,
    fontFamily: ParentFonts.display,
  },
  heroMeta: {
    marginTop: 6,
    fontSize: 13,
    color: ParentColors.ink500,
  },
  formGroup: {
    marginBottom: 22,
  },
  formGroupHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  formGroupLabel: {
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.ink900,
  },
  formGroupHint: {
    fontSize: 11.5,
    color: ParentColors.ink500,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: ParentColors.ink900,
    fontFamily: ParentFonts.body,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  chip: {
    backgroundColor: ParentColors.ivory100,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipActive: {
    backgroundColor: ParentColors.teal500,
  },
  chipText: {
    fontSize: 12.5,
    color: ParentColors.ink700,
    fontWeight: ParentFontWeights.medium,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  grid2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  grid3: {
    flexDirection: 'row',
    gap: 8,
  },
  catOption: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  rewardOption: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  catOptionActive: {
    backgroundColor: ParentColors.ink900,
    borderColor: ParentColors.ink900,
  },
  catOptionText: {
    fontSize: 13,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.ink700,
  },
  catOptionTextActive: {
    color: '#FFFFFF',
  },
  dayPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  dayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    alignItems: 'center',
  },
  dayBtnActive: {
    backgroundColor: ParentColors.teal500,
    borderColor: ParentColors.teal500,
  },
  dayBtnText: {
    fontSize: 12,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.ink700,
  },
  dayBtnTextActive: {
    color: '#FFFFFF',
  },
  deadlineRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  rewardOverrideRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  rewardOverrideLabel: {
    fontSize: 12,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.ink700,
  },
  rewardOverrideHint: {
    fontSize: 11,
    color: ParentColors.ink400,
  },
  rewardWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  rewardWarnText: {
    fontSize: 11,
    color: ParentColors.clay500,
  },
  rewardBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  rewardBoxLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rewardBoxTitle: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.ink900,
  },
  rewardBoxDesc: {
    fontSize: 11.5,
    color: ParentColors.ink500,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ParentColors.ivory100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnMinus: {
    width: 10,
    height: 2,
    backgroundColor: ParentColors.ink700,
    borderRadius: 1,
    position: 'absolute',
  },
  stepperInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 32,
    justifyContent: 'center',
  },
  stepperInput: {
    fontSize: 15,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.ink900,
    padding: 0,
    margin: 0,
    textAlign: 'right',
    minWidth: 20,
  },
  stepperSuffix: {
    fontSize: 15,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.ink900,
  },
  milestoneNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ParentColors.ivory100,
    borderRadius: 12,
    padding: 12,
  },
  milestoneNoticeText: {
    fontSize: 13,
    color: ParentColors.ink700,
  },
  kidsList: {
    gap: 8,
  },
  kidOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: 12,
    padding: 10,
  },
  kidOptionActive: {
    borderColor: ParentColors.teal500,
  },
  kidOptionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ParentColors.teal400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kidOptionAvatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: ParentFontWeights.bold,
  },
  kidOptionInfo: {
    flex: 1,
  },
  kidOptionName: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.ink900,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: ParentColors.ivory300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: ParentColors.teal500,
    borderColor: ParentColors.teal500,
  },
  bottomBar: {
    paddingHorizontal: ParentSpacing.gutter,
    paddingVertical: 12,
    backgroundColor: ParentColors.bgCanvas,
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
  },
  submitBtn: {
    backgroundColor: ParentColors.teal500,
    borderRadius: ParentRadii.lg,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: ParentFontWeights.semi,
    color: '#FFFFFF',
  },
  aiCoinRow: {
    marginTop: 8,
    gap: 6,
  },
  aiCoinBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ParentColors.teal500,
    borderRadius: ParentRadii.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  aiCoinBtnDisabled: {
    opacity: 0.4,
  },
  aiCoinBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: ParentFontWeights.semi,
  },
  aiCoinReason: {
    fontSize: 12,
    color: ParentColors.ink500,
    lineHeight: 18,
  },
});
