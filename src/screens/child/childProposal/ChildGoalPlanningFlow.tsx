// GrowBook — 一起想怎麼開始（P1-A2）
//
// ─────────────────────────────────────────────────────────────────────────
// 這個元件只管**一場對話的生命週期**。提案的生命週期（建立、送出、
// 狀態轉換）仍然在 ChildProposalScreen —— 兩者混在同一個 state 裡的話，
// 「AI 掛了」與「提案沒送出去」會變成同一種失敗，而它們差很多。
//
// 規則不住在這裡：輪數上限、確認後不可變、還能走哪幾條路，全部來自
// childPlanningSession 那支純函式。這裡只負責把它畫出來。
//
// 三件事在畫面上是硬的：
//
//   1. **等待時看得到出路。** 實測有 20-30 秒的長尾，只給一個轉圈
//      等於把孩子鎖在那裡。沒有假的進度條，也不承諾還要幾秒。
//   2. **選項永遠附「我自己想」。** allowCustomAnswer 是字面量 true，
//      這裡也就沒有把它藏起來的分支。
//   3. **AI 掛掉不影響送出。** 「先把想法送給爸媽」走的是既有的
//      legacy 送出，跟這場對話沒有關係。
// ─────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../../../constants/colors';
import {
  childPlanningSessionExits,
  confirmChildPlan,
  createChildPlanningSession,
  recordChildResponse,
  recordPlanningResult,
  type ChildGoalPlan,
  type ChildGoalPlanningResult,
  type ChildPlanningResponse,
  type ChildPlanningSessionState,
  type ChildPlanningSessionSnapshot,
  type ChildPlanningSessionResult,
  type ChildPlanningSupportPreference,
} from '../../../lib/childPlanning';
import { PLANNING_COPY } from './copy';

// ---------------------------------------------------------------------------

export type PlanningRoundRequest = {
  childApproach: string | null;
  planningSupportPreference: ChildPlanningSupportPreference | null;
  responses: ChildPlanningResponse[];
};

/**
 * 這個元件需要外面提供的三件事。
 *
 * 抽成 port 的理由與 client 一樣：整個流程（含逾時、stale、三輪問完）
 * 因此在 jest 裡測得完，不需要網路也不需要資料庫。
 */
export type PlanningFlowPorts = {
  /** 打一輪。回的是**驗證過的契約結果**，不是 provider 的回應。 */
  requestPlan(request: PlanningRoundRequest): Promise<ChildGoalPlanningResult>;
  recordRound(args: {
    expectedRevision: number;
    childResponse?: ChildPlanningResponse;
    result: ChildGoalPlanningResult;
  }): Promise<ChildPlanningSessionResult>;
  confirm(args: { expectedRevision: number }): Promise<ChildPlanningSessionResult>;
};

export type ChildGoalPlanningFlowProps = {
  ports: PlanningFlowPorts;
  /** 這場對話開始時的 session revision（剛開好的是 0）。 */
  initialRevision: number;
  /** 「先把想法送給爸媽」—— 走既有的 legacy 送出。 */
  onSendToParents: () => void;
  /** 孩子確認完、按下「知道了」。 */
  onDone: () => void;
};

type OpeningChoice = 'has_own_idea' | 'want_options' | 'first_step_only';

/**
 * 開場的選擇 → 支援強度。
 *
 * 沒有第四個選項是刻意的：`suggest_if_needed`（「缺什麼再幫我補」）
 * 就是**沒有特別說**時的預設，契約已經這樣定義。再給孩子一個選項去選
 * 一個本來就是預設的東西，只是多一個要讀的句子。
 */
const SUPPORT_BY_CHOICE: Record<OpeningChoice, ChildPlanningSupportPreference> = {
  has_own_idea: 'organize_only',
  want_options: 'give_me_options',
  first_step_only: 'first_step_only',
};

type Phase =
  | { kind: 'opening' }
  | { kind: 'requesting' }
  | { kind: 'conversation' }
  | { kind: 'confirmed' };

export default function ChildGoalPlanningFlow({
  ports,
  initialRevision,
  onSendToParents,
  onDone,
}: ChildGoalPlanningFlowProps) {
  const [session, setSession] = useState<ChildPlanningSessionState>(createChildPlanningSession);
  const [revision, setRevision] = useState(initialRevision);
  const [phase, setPhase] = useState<Phase>({ kind: 'opening' });

  const [openingChoice, setOpeningChoice] = useState<OpeningChoice | null>(null);
  const [approach, setApproach] = useState('');
  const [answer, setAnswer] = useState('');
  const [writingOwn, setWritingOwn] = useState(false);

  const exits = useMemo(() => childPlanningSessionExits(session), [session]);

  /**
   * 跑一輪：打模型 → 存起來 → 更新畫面。
   *
   * 順序是刻意的。先存再顯示的話，孩子看到的東西與資料庫裡的可能不一樣；
   * 存失敗（例如 stale）時畫面必須知道，否則他會對著一份不會被保留的
   * 計畫點頭。
   */
  const runRound = useCallback(
    async (childResponse?: ChildPlanningResponse) => {
      const pending = childResponse
        ? recordChildResponse(session, childResponse)
        : ({ ok: true, state: session } as const);
      if (!pending.ok) return;

      const nextSession = pending.state;
      setSession(nextSession);
      setPhase({ kind: 'requesting' });

      const result = await ports.requestPlan({
        childApproach: approach.trim().length > 0 ? approach.trim() : null,
        planningSupportPreference: openingChoice ? SUPPORT_BY_CHOICE[openingChoice] : null,
        responses: nextSession.responses,
      });

      const recorded = recordPlanningResult(nextSession, result);
      if (!recorded.ok) {
        setPhase({ kind: 'conversation' });
        return;
      }

      const persisted = await ports.recordRound({
        expectedRevision: revision,
        ...(childResponse ? { childResponse } : {}),
        result,
      });

      if (persisted.ok) {
        setRevision(persisted.revision);
        setSession(recorded.state);
      } else {
        // 存不進去（多半是 stale：另一個裝置已經往前走了）。
        // 這一輪的結果**不採用** —— 顯示它等於讓孩子看一份不會被保留的計畫。
        setSession({
          ...nextSession,
          latestResult: { status: 'unavailable', schemaVersion: 1, reason: 'SERVICE_ERROR' },
        });
        if (typeof persisted.revision === 'number') setRevision(persisted.revision);
      }
      setPhase({ kind: 'conversation' });
    },
    [approach, openingChoice, ports, revision, session],
  );

  const handleConfirm = useCallback(async () => {
    const confirmed = confirmChildPlan(session);
    if (!confirmed.ok) return;

    const persisted: ChildPlanningSessionResult = await ports.confirm({
      expectedRevision: revision,
    });
    if (!persisted.ok) {
      // 沒存進去就**不算確認**。顯示成功會讓孩子以為講定了。
      setSession({
        ...session,
        latestResult: { status: 'unavailable', schemaVersion: 1, reason: 'SERVICE_ERROR' },
      });
      setPhase({ kind: 'conversation' });
      return;
    }

    setRevision((persisted as ChildPlanningSessionSnapshot).revision);
    setSession(confirmed.state);
    setPhase({ kind: 'confirmed' });
  }, [ports, revision, session]);

  // ── 開場 ────────────────────────────────────────────────────────────────
  if (phase.kind === 'opening') {
    return (
      <ScrollView testID="planning-opening" contentContainerStyle={styles.body}>
        <Text style={styles.question}>{PLANNING_COPY.opening.question}</Text>
        <Text style={styles.hint}>{PLANNING_COPY.opening.hint}</Text>

        <View style={styles.options}>
          {(
            [
              ['has_own_idea', PLANNING_COPY.opening.options.hasOwnIdea],
              ['want_options', PLANNING_COPY.opening.options.wantOptions],
              ['first_step_only', PLANNING_COPY.opening.options.firstStepOnly],
            ] as const
          ).map(([value, label]) => (
            <Choice
              key={value}
              testID={`planning-opening-${value}`}
              label={label}
              selected={openingChoice === value}
              onPress={() => setOpeningChoice(value)}
            />
          ))}
        </View>

        {/* 只有「我有自己的想法」才追問一句。其他兩種問了就是多嘴。 */}
        {openingChoice === 'has_own_idea' ? (
          <View style={styles.block}>
            <Text style={styles.label}>{PLANNING_COPY.opening.approachQuestion}</Text>
            <TextInput
              testID="planning-approach-input"
              style={styles.input}
              value={approach}
              onChangeText={setApproach}
              placeholder={PLANNING_COPY.opening.approachPlaceholder}
              placeholderTextColor={Colors.ink300}
              multiline
            />
          </View>
        ) : null}

        <Primary
          testID="planning-opening-next"
          label={PLANNING_COPY.opening.next}
          disabled={openingChoice === null}
          onPress={() => void runRound()}
        />
        <Secondary
          testID="planning-send-to-parents"
          label={PLANNING_COPY.requesting.escapeSend}
          onPress={onSendToParents}
        />
      </ScrollView>
    );
  }

  // ── 等待 ────────────────────────────────────────────────────────────────
  if (phase.kind === 'requesting') {
    return (
      <View testID="planning-requesting" style={styles.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
        <Text style={styles.waitTitle}>{PLANNING_COPY.requesting.title}</Text>
        <Text style={styles.hint}>{PLANNING_COPY.requesting.hint}</Text>

        {/* 等待中就看得到出路 —— 不必等到逾時才知道自己可以走。 */}
        <Secondary
          testID="planning-escape-self"
          label={PLANNING_COPY.requesting.escapeSelf}
          onPress={() => {
            setWritingOwn(true);
            setPhase({ kind: 'conversation' });
          }}
        />
        <Secondary
          testID="planning-send-to-parents"
          label={PLANNING_COPY.requesting.escapeSend}
          onPress={onSendToParents}
        />
      </View>
    );
  }

  // ── 確認完 ──────────────────────────────────────────────────────────────
  if (phase.kind === 'confirmed') {
    return (
      <View testID="planning-confirmed" style={styles.center}>
        <Text style={styles.waitTitle}>{PLANNING_COPY.confirmed.title}</Text>
        <Text style={styles.hint}>{PLANNING_COPY.confirmed.body}</Text>
        <Primary testID="planning-done" label={PLANNING_COPY.confirmed.done} onPress={onDone} />
      </View>
    );
  }

  // ── 對話中 ──────────────────────────────────────────────────────────────
  const result = session.latestResult;

  // 孩子自己寫怎麼開始。三輪問完、逾時、或他在等待中按了「先不等」都走這裡。
  if (writingOwn) {
    return (
      <ScrollView testID="planning-write-own" contentContainerStyle={styles.body}>
        <Text style={styles.question}>{PLANNING_COPY.choice.customQuestion}</Text>
        <TextInput
          testID="planning-custom-input"
          style={styles.input}
          value={answer}
          onChangeText={setAnswer}
          placeholder={PLANNING_COPY.choice.customPlaceholder}
          placeholderTextColor={Colors.ink300}
          multiline
        />
        <Primary
          testID="planning-custom-next"
          label={PLANNING_COPY.choice.customNext}
          disabled={answer.trim().length === 0}
          onPress={() => {
            const own = answer.trim();
            setAnswer('');
            setWritingOwn(false);
            // 還問得動就再整理一輪；問滿了就只把他寫的留在對話裡。
            if (exits.canRequestRound) {
              void runRound({ type: 'custom_choice', answer: own });
              return;
            }
            const appended = recordChildResponse(session, { type: 'custom_choice', answer: own });
            if (appended.ok) setSession(appended.state);
          }}
        />
        <Secondary
          testID="planning-send-to-parents"
          label={PLANNING_COPY.requesting.escapeSend}
          onPress={onSendToParents}
        />
      </ScrollView>
    );
  }

  if (result?.status === 'needs_clarification') {
    return (
      <ScrollView testID="planning-clarification" contentContainerStyle={styles.body}>
        {/* 只顯示模型回來的那一題。附加任何別的表單都是多問。 */}
        <Text style={styles.question}>{result.question.text}</Text>
        <Text style={styles.hint}>{PLANNING_COPY.clarification.hint}</Text>
        <TextInput
          testID="planning-answer-input"
          style={styles.input}
          value={answer}
          onChangeText={setAnswer}
          placeholder={PLANNING_COPY.clarification.placeholder}
          placeholderTextColor={Colors.ink300}
          multiline
        />
        <Primary
          testID="planning-answer-next"
          label={PLANNING_COPY.clarification.next}
          disabled={answer.trim().length === 0}
          onPress={() => {
            const said = answer.trim();
            setAnswer('');
            // ⚠️ 答案進 responses，**不會**寫回他的原話。
            void runRound({
              type: 'clarification_answer',
              questionKind: result.question.kind,
              question: result.question.text,
              answer: said,
            });
          }}
        />
        <Secondary
          testID="planning-send-to-parents"
          label={PLANNING_COPY.requesting.escapeSend}
          onPress={onSendToParents}
        />
      </ScrollView>
    );
  }

  if (result?.status === 'needs_choice') {
    return (
      <ScrollView testID="planning-choice" contentContainerStyle={styles.body}>
        <Text style={styles.question}>{result.question}</Text>
        <Text style={styles.hint}>{PLANNING_COPY.choice.hint}</Text>

        <View style={styles.options}>
          {result.options.map((option) => (
            <Choice
              key={option.id}
              testID={`planning-option-${option.id}`}
              label={option.text}
              selected={false}
              onPress={() =>
                void runRound({
                  type: 'choice_selection',
                  optionId: option.id,
                  optionText: option.text,
                })
              }
            />
          ))}

          {/* 永遠在最後，而且永遠存在 —— 不是一個可以被關掉的分支。 */}
          <Choice
            testID="planning-option-custom"
            label={PLANNING_COPY.choice.custom}
            selected={false}
            onPress={() => setWritingOwn(true)}
          />
        </View>

        <Secondary
          testID="planning-send-to-parents"
          label={PLANNING_COPY.requesting.escapeSend}
          onPress={onSendToParents}
        />
      </ScrollView>
    );
  }

  if (result?.status === 'ready') {
    return (
      <ScrollView testID="planning-ready" contentContainerStyle={styles.body}>
        <Text style={styles.question}>{PLANNING_COPY.ready.title}</Text>
        <ReadyPlan plan={result.plan} />

        <Primary
          testID="planning-confirm"
          label={PLANNING_COPY.ready.confirm}
          onPress={() => void handleConfirm()}
        />
        {/* 「我想改一下」不是打開一張表單 —— 是回到他自己決定的那一層。 */}
        <Secondary
          testID="planning-revise"
          label={PLANNING_COPY.ready.revise}
          onPress={() => setWritingOwn(true)}
        />
      </ScrollView>
    );
  }

  // 沒有結果、或這一輪 unavailable。三條路都在。
  const exhausted = exits.roundsExhausted || !exits.canRequestRound;
  return (
    <ScrollView testID="planning-unavailable" contentContainerStyle={styles.body}>
      <Text style={styles.question}>
        {exhausted ? PLANNING_COPY.unavailable.exhaustedTitle : PLANNING_COPY.unavailable.title}
      </Text>
      <Text style={styles.hint}>
        {exhausted ? PLANNING_COPY.unavailable.exhaustedHint : PLANNING_COPY.unavailable.hint}
      </Text>

      {exits.canRequestRound ? (
        <Primary
          testID="planning-retry"
          label={PLANNING_COPY.unavailable.retry}
          onPress={() => void runRound()}
        />
      ) : null}
      <Secondary
        testID="planning-write-own-entry"
        label={PLANNING_COPY.unavailable.self}
        onPress={() => setWritingOwn(true)}
      />
      <Secondary
        testID="planning-send-to-parents"
        label={PLANNING_COPY.unavailable.send}
        onPress={onSendToParents}
      />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// 計畫預覽
// ---------------------------------------------------------------------------

const DAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

function describeCadence(plan: ChildGoalPlan): string | null {
  if (plan.progressionKind !== 'rhythm' || plan.cadence === null) return null;
  if (plan.cadence.mode === 'weekly_frequency') return `一週 ${plan.cadence.weeklyFrequency} 次`;
  if (plan.cadence.mode === 'fixed_days') {
    const days = (plan.cadence.days ?? []).map((d) => DAY_ZH[d] ?? String(d)).join('、');
    return days ? `每週${days}` : null;
  }
  return '先做一次看看';
}

function describeSessionSize(plan: ChildGoalPlan): string | null {
  if (plan.progressionKind !== 'rhythm' || plan.sessionSize === null) return null;
  return plan.sessionSize.kind === 'minutes'
    ? `${plan.sessionSize.minutes} 分鐘`
    : `${plan.sessionSize.count} ${plan.sessionSize.unit}`;
}

/**
 * 這一輪只做**最窄的孩子端預覽**。
 *
 * 不重畫長期詳情、不顯示分類、不顯示幣值 —— 孩子這一刻只需要回答一件事：
 * 「這是不是我願意先這樣試的方式？」
 */
function ReadyPlan({ plan }: { plan: ChildGoalPlan }) {
  return (
    <View testID="planning-ready-plan" style={styles.card}>
      <Row label={PLANNING_COPY.ready.outcomeLabel} value={plan.desiredOutcome} />
      <Row label={PLANNING_COPY.ready.summaryLabel} value={plan.actionPlanSummary} />
      <Row label={PLANNING_COPY.ready.nextActionLabel} value={plan.nextAction.text} />

      {plan.progressionKind === 'rhythm' ? (
        <>
          <Row label={PLANNING_COPY.ready.cadenceLabel} value={describeCadence(plan)} />
          <Row label={PLANNING_COPY.ready.sessionSizeLabel} value={describeSessionSize(plan)} />
        </>
      ) : null}

      {plan.progressionKind === 'staged' ? (
        <>
          <Row label={PLANNING_COPY.ready.focusLabel} value={plan.currentFocus} />
          {/* ⚠️ 標題寫的是「可能的」—— 這是暫定路線，不是正式課程大綱。 */}
          <Row
            label={PLANNING_COPY.ready.phasesLabel}
            value={plan.phases.map((phase) => phase.title).join('、')}
          />
        </>
      ) : null}

      {plan.progressionKind === 'accumulation' ? (
        <>
          <Row
            label={PLANNING_COPY.ready.targetLabel}
            value={`${plan.targetValue} ${plan.targetUnit}`}
          />
          <Row
            label={PLANNING_COPY.ready.currentLabel}
            value={`${plan.currentValue} ${plan.targetUnit}`}
          />
        </>
      ) : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (value === null || value.length === 0) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------

function Choice({
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
      style={[styles.choice, selected && styles.choiceOn]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      activeOpacity={0.85}
    >
      <Text style={[styles.choiceLabel, selected && styles.choiceLabelOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Primary({
  testID,
  label,
  onPress,
  disabled,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.primary, disabled && styles.primaryOff]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      activeOpacity={0.85}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

function Secondary({
  testID,
  label,
  onPress,
}: {
  testID: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      style={styles.secondary}
      onPress={onPress}
      accessibilityRole="button"
      activeOpacity={0.72}
    >
      <Text style={styles.secondaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingBottom: 24, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  question: { fontSize: 24, lineHeight: 34, fontWeight: '900', color: Colors.ink900 },
  waitTitle: {
    fontSize: 20,
    lineHeight: 30,
    fontWeight: '800',
    color: Colors.ink900,
    textAlign: 'center',
  },
  hint: { fontSize: 14, color: Colors.fgMuted, fontWeight: '600', textAlign: 'center' },
  block: { gap: 8 },
  options: { gap: 10, marginTop: 8 },
  input: {
    minHeight: 92,
    borderRadius: 18,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    lineHeight: 25,
    color: Colors.ink900,
    textAlignVertical: 'top',
  },
  choice: {
    minHeight: 60,
    borderRadius: 18,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  choiceOn: { borderColor: Colors.accent, backgroundColor: Colors.leaf50 },
  choiceLabel: { fontSize: 17, lineHeight: 24, fontWeight: '800', color: Colors.ink900 },
  choiceLabelOn: { color: Colors.leaf700 },
  card: {
    borderRadius: 20,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    paddingHorizontal: 18,
  },
  row: { paddingVertical: 14, gap: 4 },
  label: { fontSize: 13, fontWeight: '800', color: Colors.leaf700 },
  value: { fontSize: 17, lineHeight: 25, fontWeight: '800', color: Colors.ink900 },
  primary: {
    minHeight: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 8,
  },
  primaryOff: { opacity: 0.45 },
  primaryText: { fontSize: 18, fontWeight: '900', color: Colors.bgSurface },
  secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 15, fontWeight: '700', color: Colors.fgMuted },
});
