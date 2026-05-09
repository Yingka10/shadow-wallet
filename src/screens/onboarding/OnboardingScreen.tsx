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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Colors } from '../../constants/colors';
import {
  QUESTIONS,
  SelectedAnswer,
  signUpUser,
  submitOnboarding,
  calcAgeGroup,
} from '../../lib/onboarding';
import type { QuestionOption } from '../../lib/onboarding';
import type { RootStackParamList } from '../../../App';

type Nav = StackNavigationProp<RootStackParamList, 'Onboarding'>;
type Step = 'account' | 'questionnaire' | 'child' | 'submitting';

// ── 子元件：步驟進度列 ────────────────────────────────────────

function ProgressBar({ label, current, total }: { label: string; current: number; total: number }) {
  return (
    <View style={styles.progressRow}>
      <Text style={styles.progressLabel}>{label}</Text>
      <Text style={styles.progressCount}>{current} / {total}</Text>
    </View>
  );
}

// ── 主畫面 ────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const navigation = useNavigation<Nav>();

  const [step, setStep] = useState<Step>('account');
  const [accountLoading, setAccountLoading] = useState(false);

  // Step: account
  const [familyName, setFamilyName] = useState('');
  const [parentName, setParentName] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Step: questionnaire
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, SelectedAnswer>>({});

  // Step: child
  const [childNickname, setChildNickname] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [childPin, setChildPin] = useState('');
  const [submitError, setSubmitError] = useState('');

  // ── handlers ──────────────────────────────────────────────

  function validateEmail(value: string): string {
    if (!value.trim()) return '請輸入 Email';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Email 格式不正確';
    return '';
  }

  function validatePassword(value: string): string {
    if (!value) return '請輸入密碼';
    if (value.length < 6) return '密碼至少需要 6 個字元';
    return '';
  }

  function handleEmailBlur() {
    setEmailError(validateEmail(email));
  }

  function handlePasswordBlur() {
    setPasswordError(validatePassword(password));
  }

  async function handleAccountNext() {
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);

    if (!familyName.trim() || !parentName.trim()) {
      Alert.alert('提示', '請填寫家庭名稱和你的名字');
      return;
    }
    if (eErr || pErr) return;

    setAccountLoading(true);
    try {
      await signUpUser(email, password);
      setStep('questionnaire');
    } catch (err) {
      const message = err instanceof Error ? err.message : '發生未知錯誤';
      if (message === 'EMAIL_TAKEN') {
        setEmailError('這個 Email 已被使用，請換一個 Email 重試。');
      } else {
        Alert.alert('建立帳號失敗', message);
      }
    } finally {
      setAccountLoading(false);
    }
  }

  function handleSelectOption(option: QuestionOption, optionIndex: number) {
    setAnswers(prev => ({
      ...prev,
      [QUESTIONS[currentQ].id]: {
        questionId: QUESTIONS[currentQ].id,
        optionIndex,
        demand: option.demand,
        responsiveness: option.responsiveness,
      },
    }));
  }

  function handleQuestionNext() {
    if (answers[QUESTIONS[currentQ].id] === undefined) {
      Alert.alert('提示', '請選擇一個選項');
      return;
    }
    if (currentQ < QUESTIONS.length - 1) {
      setCurrentQ(prev => prev + 1);
    } else {
      setStep('child');
    }
  }

  function handleQuestionBack() {
    if (currentQ > 0) {
      setCurrentQ(prev => prev - 1);
    } else {
      setStep('account');
    }
  }

  async function handleSubmit() {
    if (!childNickname.trim() || !birthYear || !birthMonth || !birthDay) {
      Alert.alert('提示', '請填寫所有欄位');
      return;
    }
    const birthDate = [
      birthYear.padStart(4, '0'),
      birthMonth.padStart(2, '0'),
      birthDay.padStart(2, '0'),
    ].join('-');
    if (isNaN(new Date(birthDate).getTime())) {
      Alert.alert('提示', '請輸入正確的出生日期');
      return;
    }

    setSubmitError('');
    setStep('submitting');

    try {
      const { familyId, childId, ageGroup } = await submitOnboarding({
        parentName,
        familyName,
        answers: Object.values(answers),
        childNickname,
        childBirthDate: birthDate,
        childPin: childPin.length === 4 ? childPin : undefined,
      });
      navigation.replace('GoalSetup', {
        childId,
        childNickname,
        familyId,
        ageGroup,
        isOnboarding: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '發生未知錯誤';
      setSubmitError(message);
      setStep('child');
    }
  }

  // ── 各步驟畫面 ────────────────────────────────────────────

  if (step === 'account') {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <ProgressBar label="基本資料" current={1} total={3} />
            <Text style={styles.title}>建立家庭帳號</Text>

            <Text style={styles.label}>家庭名稱</Text>
            <TextInput
              style={styles.input}
              value={familyName}
              onChangeText={setFamilyName}
              placeholder="例：陳家"
              placeholderTextColor={Colors.textSecondary}
            />

            <Text style={styles.label}>你的名字</Text>
            <TextInput
              style={styles.input}
              value={parentName}
              onChangeText={setParentName}
              placeholder="例：爸爸 / 媽媽 / 王小明"
              placeholderTextColor={Colors.textSecondary}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, emailError ? styles.inputError : null]}
              value={email}
              onChangeText={(v) => { setEmail(v); if (emailError) setEmailError(validateEmail(v)); }}
              onBlur={handleEmailBlur}
              placeholder="your@email.com"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}

            <Text style={styles.label}>密碼（至少 6 碼）</Text>
            <TextInput
              style={[styles.input, passwordError ? styles.inputError : null]}
              value={password}
              onChangeText={(v) => { setPassword(v); if (passwordError) setPasswordError(validatePassword(v)); }}
              onBlur={handlePasswordBlur}
              placeholder="••••••"
              placeholderTextColor={Colors.textSecondary}
              secureTextEntry
            />
            {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryButton, styles.marginTop]}
              onPress={handleAccountNext}
              disabled={accountLoading}
            >
              {accountLoading
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.primaryButtonText}>下一步：教養問卷</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (step === 'questionnaire') {
    const question = QUESTIONS[currentQ];
    const selected = answers[question.id];
    const isLast = currentQ === QUESTIONS.length - 1;

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <ProgressBar label="教養問卷" current={2} total={3} />
          <Text style={styles.questionCount}>
            問題 {currentQ + 1} / {QUESTIONS.length}
          </Text>
          <Text style={styles.scenario}>{question.scenario}</Text>

          {question.options.map((opt, idx) => {
            const isSelected = selected?.optionIndex === idx;
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.optionButton, isSelected && styles.optionSelected]}
                onPress={() => handleSelectOption(opt, idx)}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleQuestionBack}>
              <Text style={styles.secondaryButtonText}>上一步</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={handleQuestionNext}>
              <Text style={styles.primaryButtonText}>{isLast ? '完成問卷' : '下一題'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'child') {
    const birthDate =
      birthYear && birthMonth && birthDay
        ? `${birthYear.padStart(4, '0')}-${birthMonth.padStart(2, '0')}-${birthDay.padStart(2, '0')}`
        : null;
    const ageGroup = birthDate && !isNaN(new Date(birthDate).getTime())
      ? calcAgeGroup(birthDate)
      : null;

    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <ProgressBar label="新增孩子" current={3} total={3} />
            <Text style={styles.title}>新增孩子</Text>

            {submitError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{submitError}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>孩子暱稱</Text>
            <TextInput
              style={styles.input}
              value={childNickname}
              onChangeText={setChildNickname}
              placeholder="例：小明"
              placeholderTextColor={Colors.textSecondary}
            />

            <Text style={styles.label}>出生日期</Text>
            <View style={styles.dateRow}>
              <TextInput
                style={[styles.input, styles.dateYear]}
                value={birthYear}
                onChangeText={setBirthYear}
                placeholder="年"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="numeric"
                maxLength={4}
              />
              <TextInput
                style={[styles.input, styles.dateMonthDay]}
                value={birthMonth}
                onChangeText={setBirthMonth}
                placeholder="月"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="numeric"
                maxLength={2}
              />
              <TextInput
                style={[styles.input, styles.dateMonthDay]}
                value={birthDay}
                onChangeText={setBirthDay}
                placeholder="日"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="numeric"
                maxLength={2}
              />
            </View>

            {ageGroup ? (
              <Text style={styles.ageHint}>
                年齡段：{ageGroup} 歲
                {ageGroup === '9-12' ? '　（將自動建立儲蓄帳戶）' : ''}
              </Text>
            ) : null}

            <Text style={styles.label}>孩子 PIN 碼（選填，4 位數字）</Text>
            <TextInput
              style={styles.input}
              value={childPin}
              onChangeText={(v) => setChildPin(v.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="讓孩子自行登入時使用"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setCurrentQ(QUESTIONS.length - 1);
                  setStep('questionnaire');
                }}
              >
                <Text style={styles.secondaryButtonText}>上一步</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit}>
                <Text style={styles.primaryButtonText}>完成設定</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // step === 'submitting'
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.submittingText}>正在建立家庭資料...</Text>
      </View>
    </SafeAreaView>
  );
}

// ── 樣式 ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  progressLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  progressCount: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
    marginTop: 20,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  inputError: {
    borderColor: Colors.error,
  },
  fieldError: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 4,
  },
  marginTop: {
    marginTop: 32,
  },
  questionCount: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  scenario: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 28,
    marginBottom: 24,
  },
  optionButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    backgroundColor: Colors.surface,
  },
  optionSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#EBF4FF',
  },
  optionText: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
  optionTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  secondaryButtonText: {
    fontSize: 16,
    color: Colors.text,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dateYear: {
    flex: 2,
  },
  dateMonthDay: {
    flex: 1,
  },
  ageHint: {
    fontSize: 13,
    color: Colors.primary,
    marginTop: 8,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: Colors.error,
    lineHeight: 20,
  },
  submittingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textSecondary,
  },
});
