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
  type PublishFormalPlanResult,
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
  /**
   * 把孩子確認過的計畫變成正式提案版本（P1-A3）。
   *
   * ⚠️ 這是**確認之後的另一件事**，不是同一件。確認是「這份計畫我同意」，
   *    送出是「請爸媽看」。合成一步的話，送出失敗會看起來像確認失敗，
   *    而孩子會以為他剛剛點的頭沒有算數 —— 但那份計畫已經安全地存下來了。
   */
  publish(): Promise<PublishFormalPlanResult>;
};

export type ChildGoalPlanningFlowProps = {
  ports: PlanningFlowPorts;
  /** 這場對話開始時的 session revision（剛開好的是 0）。 */
  initialRevision: number;
  /**
   * 孩子在提案上已經講過的時段（`preferred_time_custom ?? preferred_time`）。
   *
   * ⚠️ **optional execution detail，不是必填。** 沒有就是沒有 ——
   *    這一層不追問、不補預設值，summary 也不會出現那一列。
   *    目前孩子端問卷不收時段，所以多半是 null；它不是死碼，因為
   *    `child_proposals.preferred_time` 本來就存在，之後若由 optional
   *    clarification 寫入，這裡不用改就會顯示。
   */
  preferredTime?: string | null;
  /**
   * 直接進「我自己寫怎麼開始」，跳過開場那一題。
   *
   * 用在孩子已經表達過「我自己想」的時候（例如規劃開不起來那一頁）——
   * 再問他一次「你已經想到要怎麼開始了嗎」，等於沒有在聽。
   */
  startInWriteOwn?: boolean;
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
  /**
   * 孩子確認了。`sent` 說的是**那份計畫有沒有送到爸媽手上**。
   *
   * 兩個布林分開的理由：確認已經持久化了，送出可能還沒。把它們畫成
   * 同一件事的話，送出失敗只剩兩種爛選擇 —— 顯示成功（騙他）或退回
   * 對話（讓他以為剛剛的確認不算）。
   */
  | { kind: 'confirmed'; sent: boolean; sending: boolean };

export default function ChildGoalPlanningFlow({
  ports,
  initialRevision,
  preferredTime = null,
  startInWriteOwn = false,
  onSendToParents,
  onDone,
}: ChildGoalPlanningFlowProps) {
  const [session, setSession] = useState<ChildPlanningSessionState>(createChildPlanningSession);
  const [revision, setRevision] = useState(initialRevision);
  const [phase, setPhase] = useState<Phase>(
    startInWriteOwn ? { kind: 'conversation' } : { kind: 'opening' },
  );

  const [openingChoice, setOpeningChoice] = useState<OpeningChoice | null>(null);
  const [approach, setApproach] = useState('');
  const [answer, setAnswer] = useState('');
  const [writingOwn, setWritingOwn] = useState(startInWriteOwn);
  /**
   * needs_choice 這一頁「選起來了、但還沒送出」的那一個。
   *
   * 與 openingChoice 分開：那一個是支援強度（本地偏好），這一個會變成
   * 一則寫進對話的 choice_selection。送出後立刻清掉，下一輪不會帶著上一輪
   * 的選取狀態進來。
   */
  const [chosenOptionId, setChosenOptionId] = useState<string | null>(null);

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

  /**
   * 送出正式版本。確認之後跑一次，失敗時可以再按。
   *
   * publish 在伺服器端是冪等的（同一場對話最多一個正式版本），所以
   * 「其實已經成功了但回應掉了」的重試會拿回原本那一版，不會送出第二次。
   */
  const runPublish = useCallback(async () => {
    setPhase({ kind: 'confirmed', sent: false, sending: true });
    const published = await ports.publish();
    setPhase({ kind: 'confirmed', sent: published.ok, sending: false });
  }, [ports]);

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
    // 確認已經定案了 —— 接下來送出失敗也不會把他退回對話。
    await runPublish();
  }, [ports, revision, runPublish, session]);

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
    const { sent, sending } = phase;
    return (
      <View testID="planning-confirmed" style={styles.center}>
        <Text style={styles.waitTitle}>{PLANNING_COPY.confirmed.title}</Text>
        <Text style={styles.hint}>
          {sent ? PLANNING_COPY.confirmed.body : PLANNING_COPY.confirmed.notSentBody}
        </Text>

        {sending ? <ActivityIndicator color={Colors.accent} /> : null}

        {/*
          送出失敗時**不謊報**，但也不把他退回對話 —— 他已經確認過了，
          那份計畫安全地存著。他只需要再按一次。
        */}
        {sent || sending ? null : (
          <Primary
            testID="planning-publish-retry"
            label={PLANNING_COPY.confirmed.retrySend}
            onPress={() => void runPublish()}
          />
        )}

        <Primary
          testID="planning-done"
          label={PLANNING_COPY.confirmed.done}
          disabled={sending}
          onPress={onDone}
        />
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
        {/*
          退回剛剛那一頁（選項／計畫）。

          只有真的有東西可以退回去時才出現 —— latestResult 是 null 時
          （例如等待中按「先不等」進來的），退回去只會看到一個空畫面。
          這一步純粹是畫面狀態，不會動到已經記下的那一輪。
        */}
        {result !== null ? (
          <Secondary
            testID="planning-write-own-back"
            label={PLANNING_COPY.nav.back}
            onPress={() => {
              setAnswer('');
              setWritingOwn(false);
            }}
          />
        ) : null}
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
    const chosen = result.options.find((o) => o.id === chosenOptionId) ?? null;
    return (
      <ScrollView testID="planning-choice" contentContainerStyle={styles.body}>
        <Text style={styles.question}>{result.question}</Text>
        <Text style={styles.subtitle}>{PLANNING_COPY.choice.hint}</Text>

        <View style={styles.options}>
          {result.options.map((option, index) => (
            <Choice
              key={option.id}
              testID={`planning-option-${option.id}`}
              label={option.text}
              marker={index + 1}
              // 只是選起來，還沒送出 —— 可以改選，也可以不選。
              selected={chosenOptionId === option.id}
              onPress={() => setChosenOptionId(option.id)}
            />
          ))}

          {/* 永遠在最後，而且永遠存在 —— 不是一個可以被關掉的分支。
              outlined 而且沒有編號：它是「換一種方式」，不是第四個做法。
              它通往一個有「上一步」的輸入頁，所以直接進去不算不可逆。 */}
          <Choice
            testID="planning-option-custom"
            label={PLANNING_COPY.choice.custom}
            variant="outlined"
            selected={false}
            onPress={() => setWritingOwn(true)}
          />
        </View>

        <Primary
          testID="planning-choice-confirm"
          label={PLANNING_COPY.choice.confirm}
          disabled={chosen === null}
          onPress={() => {
            if (chosen === null) return;
            setChosenOptionId(null);
            void runRound({
              type: 'choice_selection',
              optionId: chosen.id,
              optionText: chosen.text,
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

  if (result?.status === 'ready') {
    return (
      <ScrollView testID="planning-ready" contentContainerStyle={styles.body}>
        <Text style={styles.question}>{PLANNING_COPY.ready.title}</Text>
        <Text style={styles.subtitle}>{PLANNING_COPY.ready.subtitle}</Text>
        <ReadyPlan plan={result.plan} preferredTime={preferredTime} />

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
 * 節奏 ＋ 份量合成一句話：「每週 3 次、每次 15 分鐘」。
 *
 * 兩者各自可能缺席，所以是組合而不是樣板字串 —— 只有節奏時就只講節奏，
 * 補一個沒有人決定過的份量是這份契約整包在防的事。
 */
function describeRhythm(plan: ChildGoalPlan): string | null {
  const cadence = describeCadence(plan);
  const size = describeSessionSize(plan);
  if (cadence && size) return `${cadence}、每次 ${size}`;
  if (cadence) return cadence;
  return size ? `每次 ${size}` : null;
}

/**
 * 先試多久。
 *
 * 42 天講成「6 週」是因為孩子（與家長）想的是週，不是天；除不盡才退回天數，
 * 不四捨五入成一個沒有人講過的數字。
 */
function describeTrial(plan: ChildGoalPlan): string | null {
  if (plan.progressionKind !== 'rhythm' || plan.trialPeriod === null) return null;
  if ('sessions' in plan.trialPeriod) return `${plan.trialPeriod.sessions} 次`;
  const { days } = plan.trialPeriod;
  return days % 7 === 0 ? `${days / 7} 週` : `${days} 天`;
}

/**
 * 這一輪只做**最窄的孩子端預覽**。
 *
 * 不重畫長期詳情、不顯示分類、不顯示幣值 —— 孩子這一刻只需要回答一件事：
 * 「這是不是我願意先這樣試的方式？」
 */
function ReadyPlan({ plan, preferredTime }: { plan: ChildGoalPlan; preferredTime: string | null }) {
  return (
    <View testID="planning-ready-plan" style={styles.card}>
      {/* ① 想做到什麼 —— 這一頁的主詞，所以是大字，不是欄位表的第一列。 */}
      <View style={styles.heroBlock}>
        <Text style={styles.label}>{PLANNING_COPY.ready.outcomeLabel}</Text>
        <Text style={styles.heroValue}>{plan.desiredOutcome}</Text>
      </View>

      {/* ② 這一段怎麼做 —— 執行細節收在一起，每一項都是一行短句。 */}
      <View style={styles.detailBlock}>
        <InlineRow label={PLANNING_COPY.ready.trialLabel} value={describeTrial(plan)} />
        <InlineRow label={PLANNING_COPY.ready.rhythmLabel} value={describeRhythm(plan)} />
        {/*
          ⚠️ 沒有時段就**整列不出現**。
          沒有固定時間不是缺漏 —— 不追問、不補假值，見 copy 的 timeLabel。
        */}
        <InlineRow label={PLANNING_COPY.ready.timeLabel} value={preferredTime} />
      </View>

      {/* ③ 今天第一步 —— 唯一今天真的要做的事，所以獨立一塊、給重量。 */}
      <View style={styles.stepBlock}>
        <Text style={styles.stepLabel}>{PLANNING_COPY.ready.nextActionLabel}</Text>
        <Text style={styles.stepValue}>{plan.nextAction.text}</Text>
      </View>

      <Row label={PLANNING_COPY.ready.summaryLabel} value={plan.actionPlanSummary} />

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

/**
 * 標籤在左、值在右的一行。**沒有值就整行消失**（不是顯示「未定」）。
 *
 * 顯示「未定」等於把「還沒決定」畫成一個缺口，孩子會覺得計畫沒做完；
 * 而很多事本來就不需要決定。
 */
function InlineRow({ label, value }: { label: string; value: string | null }) {
  if (value === null || value.length === 0) return null;
  return (
    <View style={styles.inlineRow}>
      <Text style={styles.inlineLabel}>{label}</Text>
      <Text style={styles.inlineValue}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------

function Choice({
  testID,
  label,
  selected,
  onPress,
  marker,
  variant = 'card',
}: {
  testID: string;
  label: string;
  selected: boolean;
  onPress: () => void;
  /**
   * 選項序號（1／2／3）。**只有 needs_choice 那一頁給。**
   *
   * 開場那三個是並列的問句答案，編號會讓它們看起來有先後或優劣；
   * 這裡的三個則是「幾種做法」，編號純粹是讓孩子講得出「我要第 2 個」。
   */
  marker?: number;
  /**
   * outlined = 「我自己想」。
   *
   * 它不是第四個選項，是**另一種動作** —— 長得跟前三張一樣的話，
   * 「自己想」會被讀成「第四種 GrowBook 提的做法」。
   */
  variant?: 'card' | 'outlined';
}) {
  const outlined = variant === 'outlined';
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.choice, outlined && styles.choiceOutlined, selected && styles.choiceOn]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      activeOpacity={0.85}
    >
      {marker !== undefined ? (
        <View style={styles.marker}>
          <Text style={styles.markerText}>{marker}</Text>
        </View>
      ) : null}
      <Text
        style={[
          styles.choiceLabel,
          outlined && styles.choiceLabelOutlined,
          selected && styles.choiceLabelOn,
        ]}
      >
        {label}
      </Text>
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
  /**
   * 靠左的說明行。
   *
   * 與 hint 分開是因為對齊方式不同，不是因為顏色不同：hint 服務的是
   * 置中的等待／完成頁，這一個服務的是靠左標題底下的頁面。置中的說明
   * 掛在靠左的標題底下，兩行的起點對不上，截圖時特別明顯。
   */
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.fgMuted,
    fontWeight: '600',
    marginTop: -4,
  },
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
    paddingVertical: 14,
    // row + center：有沒有編號都垂直置中，長文字則在卡片內換行（見 choiceLabel 的 flex）。
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  choiceOn: { borderColor: Colors.accent, backgroundColor: Colors.leaf50 },
  /**
   * 「我自己想」。
   *
   * 透明底 ＋ 綠框：白色實心卡是「GrowBook 提的做法」，這一個不是做法，
   * 是他自己來。用同一種卡片樣式的話，第四張看起來就是第四個建議。
   */
  choiceOutlined: {
    backgroundColor: 'transparent',
    borderColor: Colors.accent,
  },
  choiceLabelOutlined: { color: Colors.leaf700 },
  marker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.leaf50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerText: { fontSize: 13, fontWeight: '800', color: Colors.leaf700 },
  // flex: 1 讓長選項在卡片內換行，而不是把編號擠出去。
  choiceLabel: { flex: 1, fontSize: 17, lineHeight: 24, fontWeight: '800', color: Colors.ink900 },
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

  // ① 想做到什麼
  heroBlock: { paddingTop: 18, paddingBottom: 14, gap: 6 },
  heroValue: { fontSize: 21, lineHeight: 30, fontWeight: '900', color: Colors.ink900 },

  // ② 執行細節：淡底的一塊，與上下兩塊區隔開，但不搶主標。
  detailBlock: {
    backgroundColor: Colors.leaf50,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 14,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 9,
    gap: 16,
  },
  inlineLabel: { fontSize: 14, fontWeight: '700', color: Colors.leaf700 },
  // flex + 靠右：長值換行時仍與標籤對齊，不會把標籤擠掉。
  inlineValue: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800',
    color: Colors.ink900,
    textAlign: 'right',
  },

  // ③ 今天第一步：左側綠邊，視覺上是「現在就能做的那一件」。
  stepBlock: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    paddingLeft: 12,
    paddingVertical: 2,
    marginBottom: 4,
    gap: 4,
  },
  stepLabel: { fontSize: 13, fontWeight: '800', color: Colors.leaf700 },
  stepValue: { fontSize: 18, lineHeight: 26, fontWeight: '900', color: Colors.ink900 },
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
