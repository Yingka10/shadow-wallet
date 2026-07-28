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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import Svg, { Path, Circle } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import {
  ParentColors,
  ParentFontWeights,
  ParentSpacing,
  ParentRadii,
  ParentFonts,
} from '../../constants/parentTheme';
import type { RootStackParamList } from '../../../App';
import type { Task } from '../../types/database';

type Nav = StackNavigationProp<RootStackParamList, 'ParentTaskEdit'>;
type Route = RouteProp<RootStackParamList, 'ParentTaskEdit'>;
type RewardKind = 'coins' | 'time' | 'none';

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
// Helpers
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
  value, onChange, min, max, step, suffix,
}: {
  value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; suffix: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  const handleBlur = () => {
    const val = parseInt(text, 10);
    if (isNaN(val)) { setText(String(value)); return; }
    const clamped = Math.max(min, Math.min(max, val));
    onChange(clamped);
    setText(String(clamped));
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

function getDaysFromTask(task: Task): number[] {
  if (task.day_type === 'both')    return [0, 1, 2, 3, 4, 5, 6];
  if (task.day_type === 'weekday') return [1, 2, 3, 4, 5];
  if (task.day_type === 'weekend') return [0, 6];
  if (task.day_type === 'custom')  return task.recurrence_days ?? [0, 1, 2, 3, 4, 5, 6];
  return [0, 1, 2, 3, 4, 5, 6];
}

function getInitialRewardKind(task: Task): RewardKind {
  if (task.is_long_term || task.category === 'A') return 'none';
  if (task.category === 'B') return 'time';
  return 'coins';
}

function getInitialRewardAmount(task: Task): number {
  if (task.category === 'B') return task.time_saving_min;
  if (task.category === 'C') return task.coin_override ?? Math.round(task.base_time_min * 1);
  return 0;
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function ParentTaskEditScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { taskId, childTaskId, childName, isActive } = route.params;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [taskData, setTaskData] = useState<Task | null>(null);

  const [name, setName] = useState('');
  const [taskMode, setTaskMode] = useState<'recurring' | 'deadline'>('recurring');
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [dueYear, setDueYear] = useState(new Date().getFullYear());
  const [dueMonth, setDueMonth] = useState(new Date().getMonth() + 1);
  const [dueDay, setDueDay] = useState(new Date().getDate());
  const [rewardKind, setRewardKind] = useState<RewardKind>('none');
  const [rewardAmount, setRewardAmount] = useState(0);

  useEffect(() => {
    async function loadTask() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', taskId)
          .single();
        if (error) throw error;

        setTaskData(data);
        setName(data.name);

        if (data.day_type === 'once') {
          setTaskMode('deadline');
          if (data.due_date) {
            const [y, m, d] = data.due_date.split('-').map(Number);
            setDueYear(y);
            setDueMonth(m);
            setDueDay(d);
          }
        } else {
          setTaskMode('recurring');
          setSelectedDays(getDaysFromTask(data));
        }

        setRewardKind(getInitialRewardKind(data));
        setRewardAmount(getInitialRewardAmount(data));
      } catch (err) {
        Alert.alert('載入失敗', err instanceof Error ? err.message : '請稍後再試');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    }
    void loadTask();
  }, [taskId]);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('提示', '請輸入任務名稱');
      return;
    }
    if (taskMode === 'recurring' && selectedDays.length === 0) {
      Alert.alert('提示', '請至少選擇一天執行日期');
      return;
    }

    setSaving(true);
    try {
      const dueDateStr = taskMode === 'deadline'
        ? `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
        : null;

      // 用 Partial<Task> 而不是 Record<string, unknown>：後者會被 supabase-js 的
      // RejectExcessProperties 判定成「每個 key 都可能是多餘欄位」而整包拒收。
      // 這裡也刻意不寫 reward_policy —— legacy 任務的 null 就原樣保留。
      const updates: Partial<Task> = {
        name: name.trim(),
        day_type: taskMode === 'recurring' ? 'custom' : 'once',
        recurrence_days: taskMode === 'recurring' ? selectedDays : null,
        due_date: dueDateStr,
      };

      if (!taskData?.is_long_term) {
        if (rewardKind === 'coins') {
          updates.category = 'C';
          updates.coin_override = rewardAmount;
          updates.time_saving_min = 0;
        } else if (rewardKind === 'time') {
          updates.category = 'B';
          updates.time_saving_min = rewardAmount;
          updates.coin_override = null;
        } else {
          updates.category = 'A';
          updates.coin_override = null;
          updates.time_saving_min = 0;
        }
      }

      const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
      if (error) throw error;
      navigation.goBack();
    } catch (err) {
      Alert.alert('儲存失敗', err instanceof Error ? err.message : '請稍後再試');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    setToggling(true);
    try {
      const { error } = await supabase
        .from('child_tasks')
        .update({ is_active: !isActive })
        .eq('id', childTaskId);
      if (error) throw error;
      navigation.goBack();
    } catch (err) {
      Alert.alert('操作失敗', err instanceof Error ? err.message : '請稍後再試');
    } finally {
      setToggling(false);
    }
  }

  const isLongTerm = taskData?.is_long_term ?? false;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={[styles.navBar, { paddingTop: insets.top + 4 }]}>
          <TouchableOpacity style={styles.backNavBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <ChevLeftIcon size={22} />
            <Text style={styles.backNavLabel}>取消</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>修改任務</Text>
          <View style={styles.navSpacer} />
        </View>
        <View style={styles.loaderBox}>
          <ActivityIndicator size="large" color={ParentColors.teal500} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
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
        <Text style={styles.navTitle} numberOfLines={1}>修改任務</Text>
        <View style={styles.navSpacer} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>{childName}</Text>
            <Text style={styles.heroTitle}>修改任務設定</Text>
          </View>

          {/* Name */}
          <FormGroup label="任務名稱">
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="任務名稱"
              placeholderTextColor={ParentColors.ink400}
              maxLength={40}
            />
          </FormGroup>

          {/* Frequency */}
          <FormGroup label="執行方式">
            <View style={styles.modeRow}>
              {(['recurring', 'deadline'] as const).map(mode => {
                const active = taskMode === mode;
                const lbl = mode === 'recurring' ? '週期任務' : '期限任務';
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.modeOption, active && styles.modeOptionActive]}
                    onPress={() => setTaskMode(mode)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modeOptionText, active && styles.modeOptionTextActive]}>{lbl}</Text>
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

          {/* Reward */}
          <FormGroup label="獎勵設定" hint={isLongTerm ? '里程碑任務不設獎勵' : null}>
            {isLongTerm ? (
              <View style={styles.milestoneNotice}>
                <Text style={styles.milestoneNoticeText}>里程碑任務，獎勵依關卡節點設定</Text>
              </View>
            ) : (
              <>
                <View style={styles.rewardKindRow}>
                  {(['coins', 'time', 'none'] as RewardKind[]).map(kind => {
                    const active = rewardKind === kind;
                    const lbl = kind === 'coins' ? '金幣' : kind === 'time' ? '時間' : '無';
                    return (
                      <TouchableOpacity
                        key={kind}
                        style={[styles.rewardKindOption, active && styles.rewardKindOptionActive]}
                        onPress={() => setRewardKind(kind)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.rewardKindText, active && styles.rewardKindTextActive]}>{lbl}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {rewardKind !== 'none' && (
                  <View style={styles.rewardBox}>
                    <View style={styles.rewardBoxLeft}>
                      {rewardKind === 'time' ? <HourglassSmIcon size={20} /> : <CoinGlyph size={18} />}
                      <View>
                        <Text style={styles.rewardBoxTitle}>{rewardKind === 'time' ? '時間獎勵' : '金幣獎勵'}</Text>
                        <Text style={styles.rewardBoxDesc}>{rewardKind === 'time' ? '累積到儲蓄本' : '可用於兌換'}</Text>
                      </View>
                    </View>
                    <Stepper
                      value={rewardAmount}
                      onChange={setRewardAmount}
                      min={rewardKind === 'time' ? 5 : 1}
                      max={rewardKind === 'time' ? 120 : 99}
                      step={rewardKind === 'time' ? 5 : 1}
                      suffix={rewardKind === 'time' ? '分' : '幣'}
                    />
                  </View>
                )}
              </>
            )}
          </FormGroup>

        </ScrollView>

        {/* Bottom bar */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.toggleBtn, isActive ? styles.deactivateBtn : styles.activateBtn]}
            onPress={handleToggleActive}
            disabled={toggling}
            activeOpacity={0.8}
          >
            {toggling
              ? <ActivityIndicator color={isActive ? '#B91C1C' : '#15803D'} size="small" />
              : <Text style={[styles.toggleBtnText, isActive ? styles.deactivateBtnText : styles.activateBtnText]}>
                  {isActive ? '停用此任務' : '重新啟用'}
                </Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : <>
                  <CheckIcon size={16} />
                  <Text style={styles.submitBtnText}>儲存變更</Text>
                </>}
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
  safe: { flex: 1, backgroundColor: ParentColors.bgCanvas },

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
  navSpacer: { minWidth: 64 },

  scroll: { flex: 1 },
  content: {
    paddingHorizontal: ParentSpacing.gutter,
    paddingTop: 14,
    paddingBottom: 40,
  },
  loaderBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  hero: { paddingVertical: 14, paddingHorizontal: 4, marginBottom: 8 },
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

  formGroup: { marginBottom: 22 },
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
  formGroupHint: { fontSize: 11.5, color: ParentColors.ink500 },

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

  modeRow: { flexDirection: 'row', gap: 8 },
  modeOption: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modeOptionActive: {
    backgroundColor: ParentColors.ink900,
    borderColor: ParentColors.ink900,
  },
  modeOptionText: {
    fontSize: 13,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.ink700,
  },
  modeOptionTextActive: { color: '#FFFFFF' },

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
  dayBtnTextActive: { color: '#FFFFFF' },

  deadlineRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  },

  rewardKindRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  rewardKindOption: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  rewardKindOptionActive: {
    backgroundColor: ParentColors.ink900,
    borderColor: ParentColors.ink900,
  },
  rewardKindText: {
    fontSize: 13,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.ink700,
  },
  rewardKindTextActive: { color: '#FFFFFF' },

  rewardBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
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
  rewardBoxDesc: { fontSize: 11.5, color: ParentColors.ink500 },

  milestoneNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ParentColors.ivory100,
    borderRadius: 12,
    padding: 12,
  },
  milestoneNoticeText: { fontSize: 13, color: ParentColors.ink700 },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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

  bottomBar: {
    paddingHorizontal: ParentSpacing.gutter,
    paddingVertical: 12,
    backgroundColor: ParentColors.bgCanvas,
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: ParentRadii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  deactivateBtn: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  activateBtn: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
  toggleBtnText: {
    fontSize: 14,
    fontWeight: ParentFontWeights.semi,
  },
  deactivateBtnText: { color: '#B91C1C' },
  activateBtnText: { color: '#15803D' },

  submitBtn: {
    flex: 2,
    backgroundColor: ParentColors.teal500,
    borderRadius: ParentRadii.lg,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: {
    fontSize: 16,
    fontWeight: ParentFontWeights.semi,
    color: '#FFFFFF',
  },
});
