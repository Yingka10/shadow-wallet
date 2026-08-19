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
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
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
// 直接指向這一支，不走 barrel（barrel 沒有重新匯出這個常數，加一個很小的
// 直接 import 比為了一個常數改動 barrel 的匯出面安全）。
import { PLANNING_COPY, formatPlanningStep } from './copy';

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

// ---------------------------------------------------------------------------
// P6 視覺共用元件 —— 只用在 needs_choice 與 ready 這兩個 capture state。
// 其餘畫面（開場／等待／澄清／我自己想／逾時）維持原樣，不在這輪範圍內。
// ---------------------------------------------------------------------------

/**
 * 孩子端看到的固定三段：
 *   1｜說出我想做的事（開場）
 *   2｜一起想怎麼開始（needs_clarification／needs_choice／自己寫，不管
 *      AI 中間多問幾輪，畫面上都還是「第 2 段」）
 *   3｜看看整理好的計畫（ready）
 *
 * ⚠️ 這是 presentation semantics，跟實際 AI round 數脫鉤。之前用
 *    session.responses.length 動態算過（needs_choice 用架構上限
 *    CHILD_GOAL_PLANNING_MAX_ROUNDS 當分母、ready 用自己當分母），
 *    canonical 路線會出現「步驟 2/4 → 步驟 3/3」——分母從 4 變 3，
 *    視覺上像步驟被吃掉。固定三段就不會有這個問題：AI 多問一輪
 *    只是仍然停在第 2 段，畫面數字不會變。
 */
const CHILD_PLANNING_TOTAL_STEPS = 3;
const CHILD_PLANNING_STEP_CHOOSING = 2;
const CHILD_PLANNING_STEP_READY = 3;

/**
 * 頁首的步驟徽章：分段進度條 ＋ 純文字步驟數。
 *
 * 兩頁統一用同一套（P6 §1）—— 不用回到左邊那顆「離開」，那顆按鈕本來就
 * 掛在 ChildProposalScreen 的外層 header，這裡只加「現在在第幾步」。
 *
 * ⚠️ 步驟數字**沒有**用圓角 pill 包起來——那顆 pill 跟外層 header 自己
 *    的圓形返回鍵疊在一起，看起來像同一列冒出第二個圓形按鈕。純文字
 *    就不會跟返回鍵搶視覺。
 */
function ProgressHeader({ step, totalSteps }: { step: number; totalSteps: number }) {
  return (
    <View style={styles.progressRow} testID="planning-progress">
      <View style={styles.progressTrack}>
        {Array.from({ length: totalSteps }).map((_, index) => (
          <View
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            style={[styles.progressSegment, index < step - 1 && styles.progressSegmentDone]}
          />
        ))}
      </View>
      <Text style={styles.progressStepText}>{formatPlanningStep(step, totalSteps)}</Text>
    </View>
  );
}

/**
 * GrowBook 現有的小芽角色（journey-mascot.png，沿用 LongTerm 已經在用的同一張圖）。
 *
 * ⚠️ 不生新插圖：mockup 裡 Step 2「抱著書」、Step 4「拿筆」是兩張不同姿勢的
 *    插圖，但 repo 裡沒有這兩張、也不該為了兩個畫面各生一張專屬插圖
 *    （P6 §Illustration：「不要為每個 task 建 task-specific illustration
 *    system」）。兩頁共用同一張既有的小芽靜態圖。
 */
function Mascot({ size = 84 }: { size?: number }) {
  return (
    <Image
      source={require('../../../../assets/images/child/journey-mascot.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessible={false}
    />
  );
}

function CheckIcon({ size = 14, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12.5l4.5 4.5L19 7"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ChevronRightIcon({ size = 16, color = Colors.leaf700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function PencilIcon({ size = 18, color = Colors.leaf700 }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16.5 4.5l3 3L8 19l-4 1 1-4L16.5 4.5z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Step 2 的 AI 選項卡（P6 §5）。
 *
 * 左側是編號圓，不是內容相關的圖示 —— option 是模型當場生的自由文字，
 * 沒有可靠的方式從文字內容判斷「這是時間類/份量類/排程類」而不用關鍵字
 * 猜（那正是 P6 明講不要做的 task-name sniffing）。編號圓在 mockup 的
 * 左側圖示位置上，同時是舊版就有的「孩子講得出我要第幾個」的功能。
 */
/**
 * P6 追加：title（大標）／detail（一行細節）／rhythmHint（節奏小標籤）
 * 三層排版。`detail`／`rhythmHint`／`badge` 都是 optional——舊資料
 * （或極少數 title 缺席的回應）退回只顯示一行 title，不會空一塊或報錯。
 *
 * ⚠️ badge **不是**「推薦方案」的另一種寫法：只有 grounded rationale
 *    才會有值（見 validateChildGoalPlanningResult 的 rationaleCount<=1），
 *    低權重純文字，不用綠色實心 chip，免得又讀成「AI 已經幫你選好了」。
 */
function StartOptionCard({
  testID,
  index,
  title,
  detail,
  rhythmHint,
  badge,
  selected,
  onPress,
}: {
  testID: string;
  index: number;
  title: string;
  detail?: string;
  rhythmHint?: string;
  badge?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const a11yLabel = [title, detail, rhythmHint].filter(Boolean).join('。');
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.optionCard, selected && styles.optionCardOn]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={a11yLabel}
      activeOpacity={0.85}
    >
      <View style={[styles.optionMarker, selected && styles.optionMarkerOn]}>
        <Text style={[styles.optionMarkerText, selected && styles.optionMarkerTextOn]}>{index}</Text>
      </View>
      <View style={styles.optionCardCopy}>
        {badge ? (
          <Text style={styles.optionBadge}>{badge}</Text>
        ) : null}
        <Text style={[styles.optionCardTitle, selected && styles.optionCardTitleOn]}>{title}</Text>
        {detail ? <Text style={styles.optionCardDetail}>{detail}</Text> : null}
        {rhythmHint ? <Text style={styles.optionCardRhythmHint}>{rhythmHint}</Text> : null}
      </View>
      <View style={[styles.optionIndicator, selected && styles.optionIndicatorOn]}>
        {selected ? <CheckIcon size={13} /> : null}
      </View>
    </TouchableOpacity>
  );
}

/**
 * 「我有自己的方式」（P6 §6）。
 *
 * ⚠️ 不是第四個 AI 選項 —— 虛線框、鉛筆圖示、沒有編號圓、右側是 chevron
 *    不是選取指示。視覺上就不能被讀成「第四種 GrowBook 提的做法」。
 */
function CustomOptionRow({
  testID,
  title,
  subtitle,
  onPress,
}: {
  testID: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      style={styles.customOption}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}。${subtitle}`}
      activeOpacity={0.85}
    >
      <View style={styles.customOptionIcon}>
        <PencilIcon size={18} />
      </View>
      <View style={styles.customOptionCopy}>
        <Text style={styles.customOptionTitle}>{title}</Text>
        <Text style={styles.customOptionSubtitle}>{subtitle}</Text>
      </View>
      <ChevronRightIcon size={18} />
    </TouchableOpacity>
  );
}

/** Step 4 的「我想改一下」——outline，比 primary 弱一階，但仍是完整按鈕（P6 §14）。 */
function SecondaryOutline({
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
      style={styles.secondaryOutline}
      onPress={onPress}
      accessibilityRole="button"
      activeOpacity={0.75}
    >
      <Text style={styles.secondaryOutlineText}>{label}</Text>
    </TouchableOpacity>
  );
}

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
        <ProgressHeader step={CHILD_PLANNING_STEP_CHOOSING} totalSteps={CHILD_PLANNING_TOTAL_STEPS} />
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            {/* 標題直接用 AI 回來的 question——本來就是依 goal 動態生成，
                不是這裡另外組一句「想用 XX，你想怎麼開始？」去 hardcode 主題。 */}
            <Text style={styles.question}>{result.question}</Text>
            <Text style={styles.subtitle}>{PLANNING_COPY.choice.hint}</Text>
          </View>
          <Mascot size={80} />
        </View>

        <Text style={styles.microcopy}>{PLANNING_COPY.choice.microcopy}</Text>

        <View style={styles.options}>
          {result.options.map((option, index) => (
            <StartOptionCard
              key={option.id}
              testID={`planning-option-${option.id}`}
              index={index + 1}
              // title 缺席（極少數舊資料）時退回顯示整句 text，不留空。
              title={option.title ?? option.text}
              detail={option.title ? option.detail : undefined}
              rhythmHint={option.rhythmHint}
              badge={option.rationale ? PLANNING_COPY.choice.optionRationale[option.rationale] : undefined}
              // 只是選起來，還沒送出 —— 可以改選，也可以不選。
              selected={chosenOptionId === option.id}
              onPress={() => setChosenOptionId(option.id)}
            />
          ))}

          {/* 永遠在最後，而且永遠存在 —— 不是一個可以被關掉的分支。
              虛線框、鉛筆、沒有編號：它是「換一種方式」，不是第四個做法。 */}
          <CustomOptionRow
            testID="planning-option-custom"
            title={PLANNING_COPY.choice.customTitle}
            subtitle={PLANNING_COPY.choice.customSubtitle}
            onPress={() => setWritingOwn(true)}
          />
        </View>

        <Text style={styles.reassurance}>{PLANNING_COPY.choice.reassurance}</Text>

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
        {/* ready 是第三段的終點，畫面上永遠是「走到底了」（全部 segment 填滿）。 */}
        <ProgressHeader step={CHILD_PLANNING_STEP_READY} totalSteps={CHILD_PLANNING_TOTAL_STEPS} />
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.question}>{PLANNING_COPY.ready.title}</Text>
            <Text style={styles.subtitle}>{PLANNING_COPY.ready.subtitle}</Text>
          </View>
          <Mascot size={80} />
        </View>

        <ReadyPlanV2 plan={result.plan} preferredTime={preferredTime} />

        <Primary
          testID="planning-confirm"
          label={PLANNING_COPY.ready.confirm}
          onPress={() => void handleConfirm()}
        />
        {/* 「我想改一下」不是打開一張表單 —— 是回到他自己決定的那一層。
            Outline，比 primary 弱一階，但仍是完整按鈕（P6 §14 secondary）。 */}
        <SecondaryOutline
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
 * P6 Step 4 三層 hierarchy：方向 → 這一段先這樣走 → 今天第一步（P6 §10）。
 *
 * 不重畫長期詳情、不顯示分類、不顯示幣值、不顯示 actionPlanSummary 全文——
 * 孩子這一刻只需要回答一件事：「這是不是我願意先這樣試的方式？」
 *
 * ⚠️ 沒有幣值／回饋區塊是刻意的，不是漏做：sessionCoinReference 這類
 *    canonical enriched policy 要到 confirm 之後的 publish() 才會算出來
 *    （見 formalPlan/toChildPlanEnrichment.ts）——這一頁 confirm 之前根本
 *    還沒有真的政策結果可以讀，寫死或先猜一個數字都是騙孩子。
 */
function ReadyPlanV2({ plan, preferredTime }: { plan: ChildGoalPlan; preferredTime: string | null }) {
  const trial = describeTrial(plan);
  const cadence = plan.progressionKind === 'rhythm' ? plan.cadence : null;
  const sessionSize = plan.progressionKind === 'rhythm' ? plan.sessionSize : null;
  const weeklyCount = cadence?.mode === 'weekly_frequency' ? cadence.weeklyFrequency : null;
  const sessionMinutes = sessionSize?.kind === 'minutes' ? sessionSize.minutes : null;
  const rhythmSentence = describeRhythm(plan);

  return (
    <View testID="planning-ready-plan" style={styles.planCard}>
      {/* A｜方向 —— 這一頁的主詞，所以是大字，不是欄位表的第一列。 */}
      <View style={styles.planSection}>
        <Text style={styles.planSectionLabel}>{PLANNING_COPY.ready.outcomeLabel}</Text>
        <Text style={styles.planOutcome}>{plan.desiredOutcome}</Text>
        {/* duration 沒有資料就不 render，不補一個沒有人決定過的週數。 */}
        {trial !== null ? (
          <View style={styles.trialBadge}>
            <Text style={styles.trialBadgeText}>
              📅 {PLANNING_COPY.ready.trialLabel} {trial}
            </Text>
          </View>
        ) : null}
      </View>

      {/* B｜這一段先這樣走 —— 只有 rhythm 計畫、而且真的有數字才用大數字兩欄；
          其他形狀（fixed_days／count 份量／staged／accumulation）退回一句真實文字，
          不編兩個假數字湊版面。完全沒有資料就整段不 render。 */}
      {plan.progressionKind === 'rhythm' && weeklyCount !== null && sessionMinutes !== null ? (
        <View style={styles.planSection}>
          <Text style={styles.planSectionLabel}>{PLANNING_COPY.ready.rhythmLabel}</Text>
          <View style={styles.rhythmSurface}>
            <View style={styles.rhythmCell}>
              <Text style={styles.rhythmCellLabel}>📅 {PLANNING_COPY.ready.weeklyLabel}</Text>
              <Text style={styles.rhythmCellValue}>{weeklyCount}</Text>
              <Text style={styles.rhythmCellUnit}>{PLANNING_COPY.ready.weeklyUnit}</Text>
            </View>
            <View style={styles.rhythmDivider} />
            <View style={styles.rhythmCell}>
              <Text style={styles.rhythmCellLabel}>🕒 {PLANNING_COPY.ready.sessionLabel}</Text>
              <Text style={styles.rhythmCellValue}>{sessionMinutes}</Text>
              <Text style={styles.rhythmCellUnit}>分鐘</Text>
            </View>
          </View>
        </View>
      ) : plan.progressionKind === 'rhythm' && rhythmSentence !== null ? (
        <View style={styles.planSection}>
          <Text style={styles.planSectionLabel}>{PLANNING_COPY.ready.rhythmLabel}</Text>
          <Text style={styles.rhythmFallback}>{rhythmSentence}</Text>
        </View>
      ) : plan.progressionKind === 'staged' ? (
        <View style={styles.planSection}>
          <Text style={styles.planSectionLabel}>{PLANNING_COPY.ready.rhythmLabel}</Text>
          <Text style={styles.rhythmFallback}>
            {plan.phases.length} 個階段：{plan.phases.map((phase) => phase.title).join('、')}
          </Text>
        </View>
      ) : plan.progressionKind === 'accumulation' ? (
        <View style={styles.planSection}>
          <Text style={styles.planSectionLabel}>{PLANNING_COPY.ready.rhythmLabel}</Text>
          <Text style={styles.rhythmFallback}>
            {plan.currentValue} / {plan.targetValue} {plan.targetUnit}
          </Text>
        </View>
      ) : null}

      {/* C｜今天第一步 —— 唯一今天真的要做的事，所以獨立一塊、給重量。
          nextAction.text 本身已經是完整文案（見 canonical 契約），這裡不再
          另外組一句「次要說明」重複同一件事。 */}
      <View style={styles.planSection}>
        <Text style={styles.planSectionLabel}>{PLANNING_COPY.ready.nextActionLabel}</Text>
        <View style={styles.nextActionCard}>
          <Text style={styles.nextActionText}>{plan.nextAction.text}</Text>
        </View>
        {/* ⚠️ 沒有時段就整行不出現，不可以顯示「還沒決定」。 */}
        {preferredTime !== null && preferredTime.length > 0 ? (
          <View style={styles.timePill}>
            <Text style={styles.timePillText}>
              🕒 {PLANNING_COPY.ready.timeLabel}：{preferredTime}
            </Text>
          </View>
        ) : null}
      </View>
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
  label: { fontSize: 13, fontWeight: '800', color: Colors.leaf700 },

  // ── P6 §1：頁首分段進度條 ＋ 圓角步驟 pill ──────────────────────────
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack: { flex: 1, flexDirection: 'row', gap: 6 },
  progressSegment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.borderMedium },
  progressSegmentDone: { backgroundColor: Colors.accent },
  progressStepText: { fontSize: 12, fontWeight: '800', color: Colors.fgMuted },

  // ── 頁首：標題／說明在左，小芽在右（needs_choice／ready 共用） ─────────
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerCopy: { flex: 1, gap: 6 },
  // 選項上方的輕提醒（P6 追加）——比 hint 更小、更弱，純降低壓力，不是規則。
  microcopy: { fontSize: 12, fontWeight: '600', color: Colors.fgMuted, marginTop: 2 },
  reassurance: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.fgMuted,
    textAlign: 'center',
    marginTop: 2,
  },

  // ── P6 §5：Step 2 AI 選項卡 ──────────────────────────────────────────
  optionCard: {
    minHeight: 72,
    borderRadius: 20,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    // flex-start，不是 center——title/detail/rhythmHint 疊三行時，
    // marker 跟右側指示圓要貼齊卡片頂端，不要整組被拉去跟著置中。
    alignItems: 'flex-start',
    gap: 14,
  },
  optionCardOn: { borderColor: Colors.accent, backgroundColor: Colors.leaf50 },
  optionMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.leaf50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionMarkerOn: { backgroundColor: Colors.bgSurface },
  optionMarkerText: { fontSize: 14, fontWeight: '800', color: Colors.leaf700 },
  optionMarkerTextOn: { color: Colors.leaf700 },
  optionCardCopy: { flex: 1, gap: 3, paddingTop: 4 },
  // 低權重徽章：純文字＋淡底，不是綠色實心 chip——不能讀成「AI 推薦」。
  optionBadge: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '800',
    color: Colors.leaf700,
    backgroundColor: Colors.leaf50,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    marginBottom: 2,
    overflow: 'hidden',
  },
  optionCardTitle: { fontSize: 16, lineHeight: 23, fontWeight: '800', color: Colors.ink900 },
  optionCardTitleOn: { color: Colors.leaf700 },
  optionCardDetail: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: Colors.fgSecondary },
  optionCardRhythmHint: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: Colors.fgMuted },
  // 右側簡單的空心選取指示；選到了才填滿變成綠底白勾（P6 §5「不用 radio button」
  // 講的是不要傳統 radio 圖示，這裡的圓仍然是「選取狀態」的最小表達）。
  optionIndicator: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: Colors.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIndicatorOn: { borderColor: Colors.accent, backgroundColor: Colors.accent },

  // ── P6 §6：「我有自己的方式」——虛線框，跟上面三張視覺語言不同 ────────
  customOption: {
    minHeight: 64,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.borderMedium,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  customOptionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customOptionCopy: { flex: 1, gap: 2 },
  customOptionTitle: { fontSize: 15, fontWeight: '800', color: Colors.fgSecondary },
  customOptionSubtitle: { fontSize: 13, fontWeight: '600', color: Colors.fgMuted },

  // ── P6 §14：Step 4 secondary（「我想改一下」）—— outline，不是純文字 ───
  secondaryOutline: {
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: Colors.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  secondaryOutlineText: { fontSize: 16, fontWeight: '800', color: Colors.fgSecondary },

  // ── P6 §10：Step 4 三層 hierarchy（方向 → 這一段先這樣走 → 今天第一步）──
  planCard: {
    borderRadius: 24,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 18,
    gap: 18,
  },
  planSection: { gap: 8 },
  planSectionLabel: { fontSize: 13, fontWeight: '800', color: Colors.leaf700 },
  // A｜方向
  planOutcome: { fontSize: 21, lineHeight: 30, fontWeight: '900', color: Colors.ink900 },
  trialBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.cream100,
  },
  trialBadgeText: { fontSize: 13, fontWeight: '700', color: Colors.fgSecondary },
  // B｜這一段先這樣走：大數字兩欄
  rhythmSurface: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.leaf50,
    borderRadius: 16,
    paddingVertical: 16,
  },
  rhythmCell: { flex: 1, alignItems: 'center', gap: 2 },
  rhythmCellLabel: { fontSize: 12, fontWeight: '700', color: Colors.leaf700 },
  rhythmCellValue: { fontSize: 28, lineHeight: 34, fontWeight: '900', color: Colors.ink900 },
  rhythmCellUnit: { fontSize: 12, fontWeight: '700', color: Colors.fgMuted },
  rhythmDivider: { width: 1, alignSelf: 'stretch', backgroundColor: Colors.borderMedium, marginVertical: 8 },
  // B 的退回文字（非 weekly_frequency+minutes 的節奏形狀、staged、accumulation）
  rhythmFallback: { fontSize: 15, lineHeight: 22, fontWeight: '700', color: Colors.ink900 },
  // C｜今天第一步：左側綠邊＋淡綠底，視覺上是「現在就能做的那一件」。
  nextActionCard: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    backgroundColor: Colors.leaf50,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  nextActionText: { fontSize: 18, lineHeight: 26, fontWeight: '900', color: Colors.ink900 },
  timePill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.borderMedium,
  },
  timePillText: { fontSize: 13, fontWeight: '700', color: Colors.fgSecondary },

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
