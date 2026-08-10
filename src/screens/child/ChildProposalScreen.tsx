// Shadow Wallet — 孩子提案畫面（P0-2）
//
// ─────────────────────────────────────────────────────────────────────────
// 一次只問一件事。四個問題 ＋ 一頁摘要 ＋ 一頁成功。
//
// 這個畫面刻意「薄」：所有判斷（能不能送、送出去長什麼樣、兩步流程）
// 都在 childProposal/ 的純函式裡，這裡只負責收集與呈現。
// 理由是那些規則要能被測試釘住，而渲染測試證明不了映射對不對。
//
// ⚠️ 這裡不 import taskActions、不碰 tasks / child_tasks / wallets /
//    transactions，也不呼叫任何 AI。孩子送出的是「想法」，不是任務。
// ─────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../App';
import GradientBackground from '../../components/child/GradientBackground';
import { Colors } from '../../constants/colors';
import { webMouseDraggableScroll, webScreen } from '../../constants/webStyles';
import { SupabaseChildProposalService } from '../../lib/childProposal';
import {
  CADENCE_OPTIONS,
  DAY_LABELS,
  MAX_TIMES_PER_WEEK,
  MIN_TIMES_PER_WEEK,
  PROPOSAL_COPY,
  SEEN_AS_OPTIONS,
  canLeaveStep,
  canSubmit,
  createEmptyDraft,
  describeCadence,
  describeSeenAs,
  goalError,
  submitChildProposal,
  toCreateCommand,
  toggleDay,
  withCadence,
  withGoal,
  withMotivation,
  withSeenAs,
  type CadenceChoice,
  type CadenceKind,
  type ChildProposalDraft,
  type ProposalStep,
  type SubmitStage,
} from './childProposal';

type ProposalRoute = RouteProp<RootStackParamList, 'ChildProposal'>;
type Nav = StackNavigationProp<RootStackParamList, 'ChildProposal'>;

/** 問題頁的順序。摘要是最後一頁，成功另外算（不在返回鏈上）。 */
const STEP_ORDER: readonly ProposalStep[] = ['goal', 'motivation', 'cadence', 'seenAs', 'review'];

type Phase =
  | { kind: 'form'; step: ProposalStep }
  | { kind: 'success' };

type ErrorState = { stage: SubmitStage; proposalId?: string } | null;

export default function ChildProposalScreen() {
  const route = useRoute<ProposalRoute>();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { childId } = route.params;

  const [draft, setDraft] = useState<ChildProposalDraft>(createEmptyDraft);
  const [phase, setPhase] = useState<Phase>({ kind: 'form', step: 'goal' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ErrorState>(null);
  const [showGoalError, setShowGoalError] = useState(false);

  // service 只建一次。每次 render 都 new 一個會讓它變成新的識別，
  // 之後如果有人把它放進 dependency array 就會無限重跑。
  const serviceRef = useRef(new SupabaseChildProposalService());

  const step = phase.kind === 'form' ? phase.step : null;
  const stepIndex = step ? STEP_ORDER.indexOf(step) : -1;

  const goTo = useCallback((next: ProposalStep) => {
    setPhase({ kind: 'form', step: next });
  }, []);

  const goNext = useCallback(() => {
    if (!step) return;
    if (!canLeaveStep(step, draft)) {
      if (step === 'goal') setShowGoalError(true);
      return;
    }
    setShowGoalError(false);
    const next = STEP_ORDER[stepIndex + 1];
    if (next) goTo(next);
  }, [draft, goTo, step, stepIndex]);

  const goBack = useCallback(() => {
    // 第一頁的「上一步」＝離開這個流程。
    if (stepIndex <= 0) {
      navigation.goBack();
      return;
    }
    setShowGoalError(false);
    goTo(STEP_ORDER[stepIndex - 1]);
  }, [goTo, navigation, stepIndex]);

  const handleSubmit = useCallback(async () => {
    if (submitting || !canSubmit(draft)) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await submitChildProposal(
        serviceRef.current,
        toCreateCommand(draft, childId),
        // 上一次是第二步失敗的話，重試只重送第二步 —— 不會多一份提案。
        error?.stage === 'transition' ? error.proposalId : undefined,
      );

      if (result.ok) {
        setPhase({ kind: 'success' });
        return;
      }

      // ⚠️ 失敗一律停在摘要頁。**任何情況都不顯示成功畫面。**
      setError({ stage: result.stage, proposalId: result.proposalId });
    } finally {
      setSubmitting(false);
    }
  }, [childId, draft, error, submitting]);

  const summary = useMemo(
    () => ({
      goal: draft.goal.trim(),
      motivation: draft.motivation.trim(),
      cadence: describeCadence(draft.cadence.kind, {
        timesPerWeek:
          draft.cadence.kind === 'weekly_times' ? draft.cadence.timesPerWeek : undefined,
        days: draft.cadence.kind === 'certain_days' ? draft.cadence.days : undefined,
      }),
      seenAs: describeSeenAs(draft.seenAs),
    }),
    [draft],
  );

  // ── 成功頁 ────────────────────────────────────────────────────────────────
  if (phase.kind === 'success') {
    return (
      <View style={webScreen}>
        <GradientBackground />
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View testID="proposal-success" style={styles.successWrap}>
            <View style={styles.successBadge}>
              <Text style={styles.successBadgeMark}>✓</Text>
            </View>
            <Text style={styles.successTitle}>{PROPOSAL_COPY.success.title}</Text>
            <Text style={styles.successBody}>{PROPOSAL_COPY.success.body}</Text>

            <TouchableOpacity
              testID="proposal-success-done"
              style={styles.primaryBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>{PROPOSAL_COPY.success.done}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const isReview = step === 'review';
  const canGoOn = step ? canLeaveStep(step, draft) : false;

  return (
    <View style={webScreen}>
      <GradientBackground />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            testID="proposal-back"
            accessibilityRole="button"
            accessibilityLabel="上一步"
            style={styles.backBtn}
            onPress={goBack}
            activeOpacity={0.72}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Text style={styles.backMark}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{PROPOSAL_COPY.screenTitle}</Text>
          {/* 進度用點，不用「3/5」—— 數字會讓孩子覺得還有多久要交作業。 */}
          <View style={styles.dots}>
            {STEP_ORDER.map((s, i) => (
              <View key={s} style={[styles.dot, i <= stepIndex && styles.dotOn]} />
            ))}
          </View>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            // web 多吃一份 draggable 樣式（滑鼠 affordance），native 不需要。
            // 合成一個陣列而不是再給一次 style —— 兩個 style prop 後面那個會贏，
            // 是那種「web 正常、手機少一半樣式」的無聲 bug。
            style={[styles.flex, Platform.OS === 'web' ? webMouseDraggableScroll : null]}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {step === 'goal' && (
              <StepShell
                question={PROPOSAL_COPY.goal.question}
                hint={PROPOSAL_COPY.goal.hint}
              >
                <TextInput
                  testID="proposal-goal-input"
                  style={styles.input}
                  value={draft.goal}
                  onChangeText={(text) => {
                    setDraft((d) => withGoal(d, text));
                    if (showGoalError) setShowGoalError(false);
                  }}
                  placeholder={PROPOSAL_COPY.goal.placeholder}
                  placeholderTextColor={Colors.ink300}
                  multiline
                  autoFocus
                  accessibilityLabel={PROPOSAL_COPY.goal.question}
                />
                {showGoalError && goalError(draft) ? (
                  <Text testID="proposal-goal-error" style={styles.fieldError}>
                    {PROPOSAL_COPY.goal.empty}
                  </Text>
                ) : null}
              </StepShell>
            )}

            {step === 'motivation' && (
              <StepShell
                question={PROPOSAL_COPY.motivation.question}
                hint={PROPOSAL_COPY.motivation.hint}
              >
                <TextInput
                  testID="proposal-motivation-input"
                  style={styles.input}
                  value={draft.motivation}
                  onChangeText={(text) => setDraft((d) => withMotivation(d, text))}
                  placeholder={PROPOSAL_COPY.motivation.placeholder}
                  placeholderTextColor={Colors.ink300}
                  multiline
                  accessibilityLabel={PROPOSAL_COPY.motivation.question}
                />
              </StepShell>
            )}

            {step === 'cadence' && (
              <StepShell
                question={PROPOSAL_COPY.cadence.question}
                hint={PROPOSAL_COPY.cadence.hint}
              >
                {CADENCE_OPTIONS.map((option) => {
                  const selected = draft.cadence.kind === option.kind;
                  return (
                    <View key={option.kind}>
                      <ChoiceRow
                        testID={`proposal-cadence-${option.kind}`}
                        label={option.label}
                        hint={option.hint}
                        selected={selected}
                        onPress={() => setDraft((d) => withCadence(d, defaultFor(option.kind, d)))}
                      />

                      {selected && option.kind === 'weekly_times' && (
                        <View testID="proposal-times-picker" style={styles.chipRow}>
                          {TIMES.map((n) => {
                            const on =
                              draft.cadence.kind === 'weekly_times' &&
                              draft.cadence.timesPerWeek === n;
                            return (
                              <TouchableOpacity
                                key={n}
                                testID={`proposal-times-${n}`}
                                style={[styles.chip, on && styles.chipOn]}
                                onPress={() =>
                                  setDraft((d) =>
                                    withCadence(d, { kind: 'weekly_times', timesPerWeek: n }),
                                  )
                                }
                                accessibilityRole="button"
                                accessibilityState={{ selected: on }}
                                accessibilityLabel={`一週 ${n} ${PROPOSAL_COPY.cadence.weeklyTimesSuffix}`}
                                activeOpacity={0.8}
                              >
                                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                                  {n}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {selected && option.kind === 'certain_days' && (
                        <View testID="proposal-days-picker">
                          <Text style={styles.pickerHint}>{PROPOSAL_COPY.cadence.daysHint}</Text>
                          <View style={styles.chipRow}>
                            {DAY_LABELS.map((label, day) => {
                              const on =
                                draft.cadence.kind === 'certain_days' &&
                                draft.cadence.days.includes(day);
                              return (
                                <TouchableOpacity
                                  key={label}
                                  testID={`proposal-day-${day}`}
                                  style={[styles.chip, on && styles.chipOn]}
                                  onPress={() => setDraft((d) => toggleDay(d, day))}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: on }}
                                  accessibilityLabel={`星期${label}`}
                                  activeOpacity={0.8}
                                >
                                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                                    {label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </StepShell>
            )}

            {step === 'seenAs' && (
              <StepShell
                question={PROPOSAL_COPY.seenAs.question}
                hint={PROPOSAL_COPY.seenAs.hint}
              >
                {SEEN_AS_OPTIONS.map((option) => (
                  <ChoiceRow
                    key={option.value}
                    testID={`proposal-seenas-${option.value}`}
                    label={option.label}
                    hint={option.hint}
                    selected={draft.seenAs === option.value}
                    onPress={() => setDraft((d) => withSeenAs(d, option.value))}
                  />
                ))}
              </StepShell>
            )}

            {isReview && (
              <StepShell
                question={PROPOSAL_COPY.review.question}
                hint={PROPOSAL_COPY.review.hint}
              >
                <View testID="proposal-summary" style={styles.summaryCard}>
                  <SummaryRow
                    label={PROPOSAL_COPY.review.goalLabel}
                    value={summary.goal}
                    onEdit={() => goTo('goal')}
                  />
                  <SummaryRow
                    label={PROPOSAL_COPY.review.motivationLabel}
                    value={summary.motivation || PROPOSAL_COPY.review.empty}
                    muted={!summary.motivation}
                    onEdit={() => goTo('motivation')}
                  />
                  <SummaryRow
                    label={PROPOSAL_COPY.review.cadenceLabel}
                    value={summary.cadence}
                    onEdit={() => goTo('cadence')}
                  />
                  <SummaryRow
                    label={PROPOSAL_COPY.review.seenAsLabel}
                    value={summary.seenAs}
                    onEdit={() => goTo('seenAs')}
                    last
                  />
                </View>

                {error ? (
                  <View testID="proposal-error" style={styles.errorBox}>
                    <Text style={styles.errorTitle}>{PROPOSAL_COPY.error.title}</Text>
                    <Text style={styles.errorBody}>
                      {error.stage === 'create'
                        ? PROPOSAL_COPY.error.create
                        : PROPOSAL_COPY.error.transition}
                    </Text>
                  </View>
                ) : null}
              </StepShell>
            )}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: 10 + Math.max(insets.bottom, 0) }]}>
            {/* 選填的步驟給一個明確的「先跳過」—— 沒有它，孩子會以為非填不可。 */}
            {(step === 'motivation' || step === 'seenAs') && (
              <TouchableOpacity
                testID="proposal-skip"
                style={styles.skipBtn}
                onPress={goNext}
                activeOpacity={0.72}
                accessibilityRole="button"
              >
                <Text style={styles.skipText}>
                  {step === 'motivation'
                    ? PROPOSAL_COPY.motivation.skip
                    : PROPOSAL_COPY.seenAs.skip}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              // testID 固定，不隨錯誤狀態改名：同一顆按鈕換 id 會讓
              // 「重試」這條路徑在測試與 QA 腳本裡憑空消失一次。
              // 按下去要做什麼由標籤（送出 / 再試一次）表達。
              testID={isReview ? 'proposal-submit' : 'proposal-next'}
              style={[styles.primaryBtn, (!canGoOn || submitting) && styles.primaryBtnOff]}
              onPress={isReview ? handleSubmit : goNext}
              disabled={submitting}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canGoOn || submitting }}
            >
              {submitting ? (
                <View style={styles.btnRow}>
                  <ActivityIndicator color={Colors.bgSurface} size="small" />
                  <Text style={styles.primaryBtnText}>{PROPOSAL_COPY.review.submitting}</Text>
                </View>
              ) : (
                <Text style={styles.primaryBtnText}>
                  {isReview
                    ? error
                      ? PROPOSAL_COPY.error.retry
                      : PROPOSAL_COPY.review.submit
                    : '下一步'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 小元件
// ---------------------------------------------------------------------------

const TIMES = Array.from(
  { length: MAX_TIMES_PER_WEEK - MIN_TIMES_PER_WEEK + 1 },
  (_, i) => MIN_TIMES_PER_WEEK + i,
);

/**
 * 選了某個節奏時，該帶什麼預設值。
 *
 * 已經選過的內容要留著：孩子點「一週做幾次」→ 選 4 → 好奇點了「固定哪幾天」
 * → 再點回來，那個 4 應該還在。每次都重設會讓他覺得自己剛剛做錯了什麼。
 *
 * 回傳型別明寫 CadenceChoice（不用 as const）—— 那會把 days 變成 readonly []，
 * 與 draft 的 number[] 對不起來。
 */
function defaultFor(kind: CadenceKind, draft: ChildProposalDraft): CadenceChoice {
  if (kind === 'weekly_times') {
    return draft.cadence.kind === 'weekly_times'
      ? draft.cadence
      : { kind: 'weekly_times', timesPerWeek: 3 };
  }
  if (kind === 'certain_days') {
    return draft.cadence.kind === 'certain_days'
      ? draft.cadence
      : { kind: 'certain_days', days: [] };
  }
  return kind === 'just_once' ? { kind: 'just_once' } : { kind: 'not_sure' };
}

function StepShell({
  question,
  hint,
  children,
}: {
  question: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.step}>
      <Text style={styles.question}>{question}</Text>
      <Text style={styles.hint}>{hint}</Text>
      <View style={styles.stepBody}>{children}</View>
    </View>
  );
}

function ChoiceRow({
  testID,
  label,
  hint,
  selected,
  onPress,
}: {
  testID: string;
  label: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.choice, selected && styles.choiceOn]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.choiceText}>
        <Text style={[styles.choiceLabel, selected && styles.choiceLabelOn]}>{label}</Text>
        <Text style={styles.choiceHint}>{hint}</Text>
      </View>
    </TouchableOpacity>
  );
}

function SummaryRow({
  label,
  value,
  onEdit,
  muted,
  last,
}: {
  label: string;
  value: string;
  onEdit: () => void;
  muted?: boolean;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.summaryRow, !last && styles.summaryRowLine]}
      onPress={onEdit}
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel={`${label}：${value}`}
    >
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, muted && styles.summaryValueMuted]} numberOfLines={3}>
        {value}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// 樣式
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: 'transparent' },

  header: {
    minHeight: 68,
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cream50,
  },
  backMark: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    color: Colors.ink700,
    marginTop: -4,
  },
  headerTitle: {
    flex: 1,
    color: Colors.ink900,
    fontSize: 19,
    fontWeight: '900',
  },
  dots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.ink100,
  },
  dotOn: { backgroundColor: Colors.accent },

  body: { paddingHorizontal: 18, paddingBottom: 24 },
  step: { paddingTop: 6 },
  question: {
    fontSize: 25,
    lineHeight: 34,
    fontWeight: '900',
    color: Colors.ink900,
  },
  hint: {
    marginTop: 6,
    fontSize: 14,
    color: Colors.fgMuted,
    fontWeight: '600',
  },
  stepBody: { marginTop: 20, gap: 10 },

  input: {
    minHeight: 108,
    borderRadius: 18,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    lineHeight: 26,
    color: Colors.ink900,
    textAlignVertical: 'top',
  },
  fieldError: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.warning,
  },

  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 66,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },
  choiceOn: {
    borderColor: Colors.accent,
    backgroundColor: Colors.leaf50,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.ink100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: Colors.accent },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.accent,
  },
  choiceText: { flex: 1, gap: 2 },
  choiceLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.ink900,
  },
  choiceLabelOn: { color: Colors.leaf700 },
  choiceHint: {
    fontSize: 13,
    color: Colors.fgMuted,
    fontWeight: '600',
  },

  pickerHint: {
    marginTop: 10,
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.fgMuted,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  chip: {
    minWidth: 48,
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },
  chipOn: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipText: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.ink700,
  },
  chipTextOn: { color: Colors.bgSurface },

  summaryCard: {
    borderRadius: 18,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    paddingHorizontal: 16,
  },
  summaryRow: { paddingVertical: 14, gap: 4 },
  summaryRowLine: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.fgMuted,
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.ink900,
    lineHeight: 24,
  },
  summaryValueMuted: { color: Colors.ink300 },

  errorBox: {
    marginTop: 14,
    borderRadius: 16,
    backgroundColor: Colors.cream100,
    borderWidth: 1,
    borderColor: Colors.borderMedium,
    padding: 14,
    gap: 4,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.ink900,
  },
  errorBody: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.ink700,
    fontWeight: '600',
  },

  footer: {
    paddingHorizontal: 18,
    paddingTop: 8,
    gap: 8,
  },
  primaryBtn: {
    minHeight: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryBtnOff: { opacity: 0.45 },
  primaryBtnText: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.bgSurface,
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skipBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.fgMuted,
  },

  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 14,
  },
  successBadge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.leaf100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successBadgeMark: {
    fontSize: 42,
    fontWeight: '900',
    color: Colors.leaf700,
  },
  successTitle: {
    fontSize: 27,
    fontWeight: '900',
    color: Colors.ink900,
    textAlign: 'center',
  },
  successBody: {
    fontSize: 16,
    lineHeight: 26,
    color: Colors.ink700,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 18,
  },
});
