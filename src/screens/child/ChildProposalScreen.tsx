// Shadow Wallet — 孩子提案畫面（P0-2）
//
// ─────────────────────────────────────────────────────────────────────────
// 一次只問一件事。四個問題 ＋ 一頁摘要 ＋ 一頁成功。
//
// 這是「開始新挑戰」的步驟式引導，不是一張表單：
// 四顆進度點只算四個問題，摘要頁不算第五顆 —— 摘要不是在問孩子新的事，
// 是把他剛剛講的話唸一遍給他聽。
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
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../../App';
import GradientBackground from '../../components/child/GradientBackground';
import { Colors } from '../../constants/colors';
import { webMouseDraggableScroll, webScreen } from '../../constants/webStyles';
import {
  SupabaseChildProposalService,
  generateChildProposalPlanDraftInBackground,
  planDraftClientSetup,
} from '../../lib/childProposal';
import {
  ChildPlanningSessionService,
  buildChildGoalPlanningInput,
  childGoalPlanningClientSetup,
  childGoalPlanningUnavailable,
} from '../../lib/childPlanning';
import ChildGoalPlanningFlow, {
  type PlanningFlowPorts,
} from './childProposal/ChildGoalPlanningFlow';
import { toPlanningRequest } from './childProposal/toPlanningRequest';
import {
  CADENCE_OPTIONS,
  DAY_LABELS,
  PLANNING_COPY,
  MAX_TIMES_PER_WEEK,
  MIN_TIMES_PER_WEEK,
  PROPOSAL_COPY,
  SEEN_AS_OPTIONS,
  canLeaveStep,
  canSubmit,
  createChildProposalDraft,
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

/** 真正的問題只有四個。摘要是最後一頁，但不是第五個問題。 */
const QUESTION_STEPS: readonly ProposalStep[] = ['goal', 'motivation', 'cadence', 'seenAs'];
const STEP_ORDER: readonly ProposalStep[] = [...QUESTION_STEPS, 'review'];

type Phase =
  | { kind: 'form'; step: ProposalStep }
  /**
   * P1：想法已經安全落成 draft，接下來一起想怎麼開始。
   *
   * 提案在這個階段**仍然是 draft** —— 這一包不轉 proposed。理由見
   * migration 的 confirm RPC：現在就轉的話，孩子看的是 P1 計畫，
   * 而家長會看到背景跑出來的另一份 P0 草稿。
   */
  | {
      kind: 'planning';
      proposalId: string;
      sessionId: string;
      revision: number;
      /** 孩子已經說過「我自己想」，別再問他一次開場那一題。 */
      writeOwn?: boolean;
    }
  /**
   * draft 已經建立，但規劃開不起來。
   *
   * ⚠️ 這裡**不可以**自動幫孩子送出。`PERSISTENCE_FAILED` 有可能是
   *    「RPC 其實成功了，只是回應在路上掉了」—— App 分不出來。自動送出
   *    等於在一個可能已經開好對話的提案上，直接把它推去 proposed。
   *
   *    正確的作法是把選擇交回孩子，而「再試一次」用同一個
   *    clientRequestId，讓 start RPC 自己做冪等對帳。
   */
  | { kind: 'planningStartFailed'; proposalId: string }
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
  const planningServiceRef = useRef(new ChildPlanningSessionService());
  // 同一次「開始規劃」的識別碼。連點兩下不會生出兩場對話。
  const planningAttemptRef = useRef<string>(`${Date.now()}-${Math.random().toString(16).slice(2)}`);

  /**
   * 這個環境有沒有 Goal Planning。
   *
   * ⚠️ 這是 P1 與 legacy 的**唯一**分岔點。關掉時下面的 handleSubmit
   *    走的是一模一樣的兩步送出，一個字都沒有變 —— 那條路徑同時也是
   *    之後換付費 provider 前的降級路徑。
   */
  const planningEnabled = childGoalPlanningClientSetup.client !== null;

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

  /**
   * legacy 送出：建立 draft → transition proposed → 成功頁 → 背景整理草稿。
   *
   * ⚠️ AI 關掉時走的就是這一支，**一個字都沒有變**。P1 有自己的出口
   *    （sendWithoutPlanning），不共用這一支 —— 共用的話，legacy 路徑
   *    會被 P1 的需求一點一點改掉，而它同時是換 provider 前的降級路徑。
   */
  const submitToParents = useCallback(async () => {
    if (submitting) return;
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
        generateChildProposalPlanDraftInBackground(
          { client: planDraftClientSetup.client, port: serviceRef.current },
          result.proposalId,
        );
        return;
      }

      setError({ stage: result.stage, proposalId: result.proposalId });
    } finally {
      setSubmitting(false);
    }
  }, [childId, draft, error, submitting]);

  /**
   * P1 的出口：不規劃，直接把想法送給爸媽。
   *
   * 走的是 atomic RPC —— 放棄規劃與送出提案在同一個交易裡。分兩次做的話，
   * 中間斷掉會留下「已放棄但沒送出」或「已送出但規劃還開著」，
   * 而那正好是孩子按下按鈕、畫面在轉圈的那一刻。
   */
  const sendWithoutPlanning = useCallback(
    async (proposalId: string) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        const result = await planningServiceRef.current.submitWithoutPlanning({ proposalId });
        if (!result.ok) {
          // 送不出去就停在原地。**任何情況都不顯示成功畫面。**
          setError({ stage: 'transition', proposalId });
          setPhase({ kind: 'form', step: 'review' });
          return;
        }

        setPhase({ kind: 'success' });
        // 送出之後 P0 的背景草稿照舊 —— 這條路徑的下游行為與 legacy 相同。
        generateChildProposalPlanDraftInBackground(
          { client: planDraftClientSetup.client, port: serviceRef.current },
          proposalId,
        );
      } finally {
        setSubmitting(false);
      }
    },
    [submitting],
  );

  /**
   * 規劃開不起來之後的「再試一次」。
   *
   * ⚠️ 重用**同一個** clientRequestId。上一次很可能其實已經在 DB 建好了
   *    （回應在 commit 之後掉了），換一把新的 id 會真的開出第二場對話。
   */
  const retryStartPlanning = useCallback(
    async (proposalId: string, writeOwn = false) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        const session = await planningServiceRef.current.start({
          proposalId,
          clientRequestId: planningAttemptRef.current,
        });
        // 還是開不起來就留在原地。三條路仍然在，他可以再按一次或送出去。
        if (!session.ok) return;

        setPhase({
          kind: 'planning',
          proposalId,
          sessionId: session.sessionId,
          revision: session.revision,
          writeOwn,
        });
      } finally {
        setSubmitting(false);
      }
    },
    [submitting],
  );

  const handleSubmit = useCallback(async () => {
    if (submitting || !canSubmit(draft)) return;

    // ── P1：先把想法安全存成 draft，再一起想怎麼開始 ──────────────────
    //
    // 只建立、不送出。規劃會失敗（逾時、孩子中途離開、網路斷），
    // 而那些都不可以讓他剛剛打的那段話消失。
    if (planningEnabled) {
      setSubmitting(true);
      setError(null);
      try {
        const created = await createChildProposalDraft(
          serviceRef.current,
          toCreateCommand(draft, childId),
        );
        if (!created.ok) {
          setError({ stage: created.stage, proposalId: created.proposalId });
          return;
        }

        const session = await planningServiceRef.current.start({
          proposalId: created.proposalId,
          clientRequestId: planningAttemptRef.current,
        });

        if (!session.ok) {
          // ⚠️ **不自動送出。** 想法已經存好了，但這一刻 App 不知道
          //    對話到底有沒有被建立（回應可能是在 commit 之後掉的）。
          //    把選擇交回孩子：再試一次／自己想／送給爸媽。
          setPhase({ kind: 'planningStartFailed', proposalId: created.proposalId });
          return;
        }

        setPhase({
          kind: 'planning',
          proposalId: created.proposalId,
          sessionId: session.sessionId,
          revision: session.revision,
        });
      } finally {
        setSubmitting(false);
      }
      return;
    }

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
        // 成功頁**立刻**成立。孩子不等模型。
        setPhase({ kind: 'success' });

        // 之後才在背景請 GrowBook 幫忙整理成一份可以跟爸媽討論的草稿。
        // 不 await、不看結果：AI 關著、逾時、回亂碼、Edge Function 掛掉，
        // 最壞的情況都只是「這筆提案目前還沒有整理過的版本」——
        // 提案本身已經存好了，孩子這一頁不會因此變成失敗。
        generateChildProposalPlanDraftInBackground(
          { client: planDraftClientSetup.client, port: serviceRef.current },
          result.proposalId,
        );
        return;
      }

      // ⚠️ 失敗一律停在摘要頁。**任何情況都不顯示成功畫面。**
      setError({ stage: result.stage, proposalId: result.proposalId });
    } finally {
      setSubmitting(false);
    }
  }, [childId, draft, error, planningEnabled, submitToParents, submitting]);

  /**
   * planning flow 需要的三件事。
   *
   * requestPlan 讀的是**資料庫那一列**，不是畫面上的草稿：提案一旦建立，
   * 畫面上那份就不再是權威（與 P0-3 的 generatePlanDraft 同一個理由）。
   */
  const planning = phase.kind === 'planning' ? phase : null;

  const planningPorts: PlanningFlowPorts = useMemo(() => {
    const proposalId = planning?.proposalId ?? null;
    const sessionId = planning?.sessionId ?? '';

    return {
      async requestPlan(request) {
        const client = childGoalPlanningClientSetup.client;
        if (client === null || proposalId === null) {
          return childGoalPlanningUnavailable('SERVICE_DISABLED');
        }

        const proposal = await serviceRef.current.getProposal(proposalId);
        const ageGroup = proposal
          ? await serviceRef.current.getChildAgeGroup(proposal.child_id)
          : null;
        if (proposal === null || ageGroup === null) {
          return childGoalPlanningUnavailable('INVALID_INPUT');
        }

        const input = buildChildGoalPlanningInput(
          toPlanningRequest(proposal, { ageGroup, ...request }),
        );
        // 組不出 input 代表這一輪本來就產不出可用的計畫 —— 不花那次呼叫。
        if (input === null) return childGoalPlanningUnavailable('INVALID_INPUT');

        return client.requestPlan(input);
      },
      recordRound: (args) => planningServiceRef.current.recordRound({ ...args, sessionId }),
      confirm: (args) => planningServiceRef.current.confirm({ ...args, sessionId }),
    };
  }, [planning?.proposalId, planning?.sessionId]);

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

  // ── 一起想怎麼開始（P1）────────────────────────────────────────────────
  //
  // ⚠️ 這一頁結束時提案**仍然是 draft**。孩子確認的是「我願意先這樣試」，
  //    不是「送出給爸媽」—— 後者是下面那顆逃生按鈕，或 P1-A3 的橋。
  if (planning !== null) {
    return (
      <View style={webScreen}>
        <GradientBackground />
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <Text style={styles.headerTitle}>{PLANNING_COPY.flowTitle}</Text>
          </View>
          <ChildGoalPlanningFlow
            ports={planningPorts}
            initialRevision={planning.revision}
            startInWriteOwn={planning.writeOwn === true}
            // AI 掛掉不可以連帶讓孩子的想法送不出去 —— 走既有的兩步送出，
            // 帶著已經建立的 proposalId，所以不會多一份提案。
            onSendToParents={() => void sendWithoutPlanning(planning.proposalId)}
            onDone={() => navigation.goBack()}
          />
        </SafeAreaView>
      </View>
    );
  }

  // ── 規劃開不起來 ────────────────────────────────────────────────────────
  //
  // 想法已經存好了，所以這一頁不是失敗，是一個選擇。三條路都在，
  // 而且**沒有一條是系統替他選的**。
  if (phase.kind === 'planningStartFailed') {
    const failedProposalId = phase.proposalId;
    return (
      <View style={webScreen}>
        <GradientBackground />
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View testID="planning-start-failed" style={styles.successWrap}>
            <Text style={styles.successTitle}>{PLANNING_COPY.unavailable.title}</Text>
            <Text style={styles.successBody}>{PLANNING_COPY.unavailable.hint}</Text>

            <TouchableOpacity
              testID="planning-start-retry"
              style={styles.primaryBtn}
              onPress={() => void retryStartPlanning(failedProposalId)}
              disabled={submitting}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>{PLANNING_COPY.unavailable.retry}</Text>
            </TouchableOpacity>

            {/* 「我自己想」也要先有一場對話才存得住他寫的東西 ——
                所以它一樣走冪等的 start，只是進去之後直接跳到輸入那一頁，
                不會再問他一次「你已經想到要怎麼開始了嗎」。 */}
            <TouchableOpacity
              testID="planning-start-write-own"
              style={styles.skipBtn}
              onPress={() => void retryStartPlanning(failedProposalId, true)}
              disabled={submitting}
              activeOpacity={0.72}
              accessibilityRole="button"
            >
              <Text style={styles.skipText}>{PLANNING_COPY.unavailable.self}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="planning-start-send"
              style={styles.skipBtn}
              onPress={() => void sendWithoutPlanning(failedProposalId)}
              disabled={submitting}
              activeOpacity={0.72}
              accessibilityRole="button"
            >
              <Text style={styles.skipText}>{PLANNING_COPY.unavailable.send}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

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
  const skipLabel =
    step === 'motivation'
      ? PROPOSAL_COPY.motivation.skip
      : step === 'seenAs'
        ? PROPOSAL_COPY.seenAs.skip
        : null;

  return (
    <View style={webScreen}>
      <GradientBackground />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          {/* 頁首的一點日光與葉子。刻意只是一角，不是整塊 hero ——
              這一頁的主角是那個問題，不是風景。 */}
          <HeaderDaylight />

          <TouchableOpacity
            testID="proposal-back"
            accessibilityRole="button"
            accessibilityLabel={PROPOSAL_COPY.nav.prev}
            style={styles.backBtn}
            onPress={goBack}
            activeOpacity={0.72}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Text style={styles.backMark}>‹</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>{PROPOSAL_COPY.flowTitle}</Text>

          {/* 進度只算四個問題，而且用點不用「3/4」——
              數字會讓孩子覺得還有多久要交作業。摘要頁不顯示。 */}
          {isReview ? null : (
            <View
              testID="proposal-progress"
              style={styles.dots}
              accessibilityRole="progressbar"
            >
              {QUESTION_STEPS.map((s, i) => (
                <View
                  key={s}
                  testID={`proposal-progress-dot-${i}`}
                  style={[styles.dot, i <= stepIndex && styles.dotOn]}
                />
              ))}
            </View>
          )}
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
                {/* 沒有 height，只有 minHeight —— 一兩句就是一兩句的高度，
                    寫多了自己長。一開始就給一大塊空白等於在說「這裡要寫很多」。 */}
                <TextInput
                  testID="proposal-motivation-input"
                  style={[styles.input, styles.inputShort]}
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
                    // 展開的內容包在同一張卡裡面 —— 選項與它的細節是一件事，
                    // 掉出卡片外會讓孩子以為那排數字是另一個問題。
                    <View
                      key={option.kind}
                      style={[styles.optionCard, selected && styles.optionCardOn]}
                    >
                      <ChoiceRow
                        testID={`proposal-cadence-${option.kind}`}
                        label={option.label}
                        selected={selected}
                        onPress={() => setDraft((d) => withCadence(d, defaultFor(option.kind, d)))}
                      />

                      {selected && option.kind === 'weekly_times' && (
                        <View testID="proposal-times-picker" style={styles.panel}>
                          <Text style={styles.panelHint}>
                            {PROPOSAL_COPY.cadence.weeklyTimesHint}
                          </Text>
                          <View style={styles.chipRow}>
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
                          <Text style={styles.panelNote}>
                            {PROPOSAL_COPY.cadence.changeable}
                          </Text>
                        </View>
                      )}

                      {selected && option.kind === 'certain_days' && (
                        <View testID="proposal-days-picker" style={styles.panel}>
                          <Text style={styles.panelHint}>{PROPOSAL_COPY.cadence.daysHint}</Text>
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
                          <Text style={styles.panelNote}>
                            {PROPOSAL_COPY.cadence.changeable}
                          </Text>
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
                  <View
                    key={option.value}
                    style={[
                      styles.optionCard,
                      draft.seenAs === option.value && styles.optionCardOn,
                    ]}
                  >
                    <ChoiceRow
                      testID={`proposal-seenas-${option.value}`}
                      label={option.label}
                      selected={draft.seenAs === option.value}
                      onPress={() => setDraft((d) => withSeenAs(d, option.value))}
                    />
                  </View>
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

                {/* 按下去之前就先講清楚會發生什麼事：記下來，然後就可以開始。 */}
                <View style={styles.noteBox}>
                  <Sprout />
                  <Text style={styles.noteText}>{PROPOSAL_COPY.review.note}</Text>
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
            {skipLabel ? (
              <TouchableOpacity
                testID="proposal-skip"
                style={styles.skipBtn}
                onPress={goNext}
                activeOpacity={0.72}
                accessibilityRole="button"
              >
                <Text style={styles.skipText}>{skipLabel}</Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.footerRow}>
              {/* 第一頁沒有「上一步」—— 那裡的返回是離開，頁首的箭頭講得比較清楚。 */}
              {stepIndex > 0 ? (
                <TouchableOpacity
                  testID="proposal-prev"
                  style={[styles.secondaryBtn, styles.footerSecondary]}
                  onPress={goBack}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryBtnText}>{PROPOSAL_COPY.nav.prev}</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                // testID 固定，不隨錯誤狀態改名：同一顆按鈕換 id 會讓
                // 「重試」這條路徑在測試與 QA 腳本裡憑空消失一次。
                // 按下去要做什麼由標籤（送出這個想法 / 再試一次）表達。
                testID={isReview ? 'proposal-submit' : 'proposal-next'}
                style={[
                  styles.primaryBtn,
                  styles.footerPrimary,
                  (!canGoOn || submitting) && styles.primaryBtnOff,
                ]}
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
                      : PROPOSAL_COPY.nav.next}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
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
 * 頁首右上角的一點自然元素：日光 ＋ 兩片葉子。
 *
 * 刻意小、刻意淡、刻意不畫樹。整頁都放一棵大樹的話，五頁看起來會一樣，
 * 孩子分不出自己走到哪裡；而 hero 佔掉的高度正好是問題該有的留白。
 * 用已裝的 react-native-svg 畫，不加任何圖檔。
 */
function HeaderDaylight() {
  return (
    <View style={styles.daylight} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 160 96">
        <Circle cx={118} cy={26} r={20} fill={Colors.gold300} opacity={0.28} />
        <Circle cx={118} cy={26} r={12} fill={Colors.gold300} opacity={0.35} />
        <Ellipse cx={52} cy={64} rx={26} ry={11} fill={Colors.leaf200} opacity={0.4} />
        <Ellipse cx={86} cy={78} rx={18} ry={8} fill={Colors.leaf300} opacity={0.28} />
        <Path
          d="M136 62c-14 2-22 10-22 20 12 1 21-7 22-20z"
          fill={Colors.leaf300}
          opacity={0.45}
        />
      </Svg>
    </View>
  );
}

/** 摘要頁那句話前面的小苗。畫的，不是 emoji —— emoji 在不同機器上長得不一樣。 */
function Sprout() {
  return (
    <Svg width={18} height={20} viewBox="0 0 18 20">
      <Path d="M9 19V9" stroke={Colors.leaf600} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M9 10C9 6 6 4 2 4c0 4 3 6 7 6z" fill={Colors.leaf400} />
      <Path d="M9 12c0-3.4 2.6-5.4 6-5.4 0 3.4-2.6 5.4-6 5.4z" fill={Colors.leaf300} />
    </Svg>
  );
}

/**
 * 選了某個節奏時，該帶什麼預設值。
 *
 * 已經選過的內容要留著：孩子點「一週做幾次」→ 選 4 → 好奇點了「想在哪幾天做」
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

/**
 * 一列選項。節奏與「怎麼陪你」共用同一種列 ——
 * 兩頁的互動長得一樣，孩子第二次就不用重新學怎麼點。
 */
function ChoiceRow({
  testID,
  label,
  selected,
  onPress,
}: {
  testID: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      style={styles.choice}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text style={[styles.choiceLabel, selected && styles.choiceLabelOn]}>{label}</Text>
      <View style={[styles.mark, selected && styles.markOn]}>
        {selected ? <Text style={styles.markGlyph}>✓</Text> : null}
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
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  daylight: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 160,
    height: 96,
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
    color: Colors.ink700,
    fontSize: 16,
    fontWeight: '800',
  },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.ink100,
  },
  dotOn: { backgroundColor: Colors.accent },

  body: { paddingHorizontal: 18, paddingBottom: 24 },
  step: { paddingTop: 10 },
  question: {
    fontSize: 26,
    lineHeight: 36,
    fontWeight: '900',
    color: Colors.ink900,
  },
  hint: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.fgMuted,
    fontWeight: '600',
  },
  stepBody: { marginTop: 26, gap: 12 },

  input: {
    minHeight: 128,
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
  /** 選填的那一格不需要一大塊空白等著被填滿。 */
  inputShort: { minHeight: 92 },
  fieldError: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.warning,
  },

  optionCard: {
    borderRadius: 20,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    overflow: 'hidden',
  },
  optionCardOn: {
    borderColor: Colors.accent,
    backgroundColor: Colors.leaf50,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  choiceLabel: {
    flex: 1,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
    color: Colors.ink900,
  },
  choiceLabelOn: { color: Colors.leaf700 },
  mark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: Colors.ink100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markOn: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  markGlyph: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '900',
    color: Colors.bgSurface,
  },

  /** 展開的細節在同一張卡裡面，用一條髮絲線跟選項分開。 */
  panel: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.hairline,
    paddingTop: 14,
  },
  panelHint: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink700,
  },
  panelNote: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: Colors.fgMuted,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    minWidth: 44,
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 10,
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
    borderRadius: 20,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    paddingHorizontal: 18,
  },
  summaryRow: { paddingVertical: 16, gap: 5 },
  summaryRowLine: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.leaf700,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink900,
    lineHeight: 26,
  },
  summaryValueMuted: { color: Colors.ink300 },

  noteBox: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 16,
    backgroundColor: Colors.leaf50,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: Colors.leaf700,
  },

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
    paddingTop: 10,
    gap: 6,
  },
  footerRow: { flexDirection: 'row', gap: 10 },
  footerSecondary: { flex: 1 },
  footerPrimary: { flex: 1.35 },
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
  secondaryBtn: {
    minHeight: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.leaf700,
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
