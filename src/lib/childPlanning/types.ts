// GrowBook — 孩子的長期目標 → 可執行計畫的 App 端契約（P1-A1）
//
// ─────────────────────────────────────────────────────────────────────────
// 這是一條**與 P0-3 Plan Draft 並存、互不影響**的新契約。
//
// P0-3 回答的是：「這筆提案要怎麼變成一個可以跟家長討論的任務草稿」——
// 它的下游是 child_proposal_plan_versions、資格閘門與幣值。
//
// 這一條回答的是另一個問題：「孩子講的這件事，到底怎麼向前走」。
// 它**不碰幣值、不碰資格、不寫任何資料庫**，也還沒有接上正式的
// Child Proposal 流程（P1-A1 的邊界，見 docs/CHILD_GOAL_PLANNING_CONTRACT.md）。
//
// 五件事在型別上就必須成立，不能靠 prompt 拜託模型：
//
//   1. **不一定有計畫。** 結果是四態 union：目標不清楚就問一題、
//      目標清楚但還沒決定怎麼做就給選項、資訊夠了才生計畫、
//      技術性失敗單獨一態。
//
//   2. **「怎麼前進」與「成果控制得了嗎」是兩個維度。**
//      goalControlType 與 progressionKind 正交 —— 「國文考 100 分」是
//      external_outcome，但它的行動計畫可以是 rhythm。
//
//   3. **不是所有目標都拆成 3-5 步。** progressionKind 是 discriminated
//      union 的判別欄位，rhythm 的計畫在型別上根本沒有 phases 可以填。
//
//   4. **孩子想到的東西不會被洗掉。** provenance 逐欄記錄「這是誰決定的」，
//      而且沒說過的事只能是 'undecided'。
//
//   5. **孩子永遠可以說「我自己想」。** needs_choice 的 allowCustomAnswer
//      是字面量 true —— 一個只能從 AI 選項裡挑的畫面寫不出來。
//
// ⚠️ progressionKind **不是** progress_model。後者（weekly_rhythm）是 P0 的
//    正式欄位，Direct Confirm 依賴它。兩者不要互相代入，也不要把這裡的
//    三個值塞進那個 enum。
// ─────────────────────────────────────────────────────────────────────────

/** 1：第一版 planning contract。與 P0-3 的 schemaVersion 是兩個獨立的數列。 */
export const CHILD_GOAL_PLANNING_SCHEMA_VERSION = 1;

/** ai-proxy 的 request type。改版會是另一個字串，這裡是唯一寫出它的地方。 */
export const CHILD_GOAL_PLANNING_REQUEST_TYPE = 'childGoalPlanning';

export type ChildPlanAgeGroup = '2-4' | '4-6' | '6-9' | '9-12';

// ---------------------------------------------------------------------------
// Input —— 必須表達得出「孩子已經想到多少」
// ---------------------------------------------------------------------------

export type ChildPlanCadenceMode = 'one_time' | 'weekly_frequency' | 'fixed_days';

export type ChildPlanCadence = {
  mode: ChildPlanCadenceMode;
  weeklyFrequency?: number;
  /** 0=週日 … 6=週六，與 tasks.recurrence_days 一致。 */
  days?: number[];
};

/**
 * 孩子希望 AI 幫多少。
 *
 * 存在的理由是 Principle A：**AI 不可以自己決定要接管多少**。
 * null = 孩子沒表態，這時預設仍然是「先整理，缺什麼才補」，
 * 不是「請 AI 重新設計一套」。
 */
export type ChildPlanningSupportPreference =
  /** 我自己想好了，只要幫我整理。 */
  | 'organize_only'
  /** 缺什麼再幫我補。 */
  | 'suggest_if_needed'
  /** 我想看幾種做法再挑。 */
  | 'give_me_options'
  /** 先告訴我第一步就好。 */
  | 'first_step_only';

export type ChildGoalPlanningInput = {
  schemaVersion: typeof CHILD_GOAL_PLANNING_SCHEMA_VERSION;
  ageGroup: ChildPlanAgeGroup;
  /** 孩子的原話。**只讀，永遠不會被覆寫回去。** */
  childOriginalGoal: string;
  childOriginalMotivation: string | null;
  /**
   * 孩子自己已經想到的做法（原話）。
   *
   * 「我想每天放學投 20 球」屬於這裡，不屬於 childOriginalGoal。
   * 「老師叫我先練右手旋律，再練左手」也屬於這裡 —— 孩子已經有老師、
   * 教材或課程時，那套方法就是這裡的內容。
   *
   * 有值時 AI 只能整理它，不能換成另一套 —— 這條由
   * validateChildGoalPlanningResult 強制，不是由 prompt 拜託。
   *
   * needs_choice 之後孩子挑的那個選項，下一輪也從這裡帶回來。
   */
  childApproach: string | null;
  cadence: ChildPlanCadence | null;
  preferredTime: string | null;
  planningSupportPreference: ChildPlanningSupportPreference | null;
};

// ---------------------------------------------------------------------------
// 兩個正交維度
// ---------------------------------------------------------------------------

/**
 * 這個成果，孩子控制得了嗎。
 *
 * directly_actionable  做了就會發生（讀完一本書、學會騎車、每天練琴）
 * external_outcome     受外部因素影響（考 100 分、拿第一名、被老師選中）
 *
 * external_outcome **不代表不能做計畫** —— 它代表計畫要建立在孩子控制得了的
 * 行動上，成果本身保留在 desiredOutcome。
 */
export type ChildPlanGoalControlType = 'directly_actionable' | 'external_outcome';

export const CHILD_PLAN_GOAL_CONTROL_TYPES: readonly ChildPlanGoalControlType[] = [
  'directly_actionable',
  'external_outcome',
] as const;

/**
 * 這件事怎麼向前走。
 *
 * ⚠️ 這與 goalControlType 是**兩個正交維度**，也與 A/B/C/D 無關。
 *
 *    「國文考 100 分」的成果是 external_outcome，
 *    但它的行動計畫「每週複習三次」的 progression 是 rhythm。
 *
 *    早期版本把 outcome_to_action 放在這個 enum 裡是錯的：它把
 *    「成果控制得了嗎」偽裝成一種前進方式，於是每個不可控目標都
 *    只能有一種節奏形狀。
 *
 * rhythm        固定頻率的投入（每天讀 15 分鐘、30 天跑步）
 * staged        有真實能力／成果進展的階段（學騎車、做一本漫畫）
 * accumulation  主要進度是 current / target（讀 5 本書、跑 20 公里）
 */
export type ChildPlanProgressionKind = 'rhythm' | 'staged' | 'accumulation';

export const CHILD_PLAN_PROGRESSION_KINDS: readonly ChildPlanProgressionKind[] = [
  'rhythm',
  'staged',
  'accumulation',
] as const;

// ---------------------------------------------------------------------------
// Clarification
// ---------------------------------------------------------------------------

/**
 * 可以問的問題種類。封閉列舉，而且**一次只有一個**。
 *
 * 型別上是單一物件而不是陣列 —— 「一次只問一題」因此在結構上就寫不出違反的形狀。
 */
export type ChildPlanClarificationKind =
  /** 「我想變厲害」→ 你最想在哪一件事上變厲害？ */
  | 'goal_focus'
  /** 「我想學會騎腳踏車」→ 你現在騎到哪裡了？（不能假設完全不會） */
  | 'current_level'
  /** 有成果、沒方法，而且連方向都還看不出來。 */
  | 'approach'
  /** 完全沒有頻率線索，而且這件事沒有頻率就不成立。 */
  | 'cadence'
  /** 有頻率但沒有單次份量，而且份量會決定計畫成不成立。 */
  | 'session_size'
  /** accumulation 缺目標數量。 */
  | 'target_amount';

export const CHILD_PLAN_CLARIFICATION_KINDS: readonly ChildPlanClarificationKind[] = [
  'goal_focus',
  'current_level',
  'approach',
  'cadence',
  'session_size',
  'target_amount',
] as const;

export type ChildPlanClarificationQuestion = {
  kind: ChildPlanClarificationKind;
  /** 給孩子看的一句話。 */
  text: string;
};

// ---------------------------------------------------------------------------
// Choice
// ---------------------------------------------------------------------------

/** 一個可以選的開始方式。**不是唯一最佳答案。** */
export type ChildPlanStartOption = {
  id: string;
  text: string;
};

// ---------------------------------------------------------------------------
// Provenance —— 孩子的自主性
// ---------------------------------------------------------------------------

/**
 * 一個欄位是誰決定的。
 *
 * 五個值，而且**順序就是證據強度**（見 EVIDENCE_PRIORITY）：
 *
 *   child_stated        孩子自己講的（原話裡就有）
 *   derived_from_child  從孩子講的內容直接推導（「投 20 球」→ 單次份量 20 球）
 *   deterministic_policy GrowBook 自己的規則決定的（不是模型、也不是孩子）
 *   ai_suggested        模型提的
 *   undecided           沒有人決定 —— **留白**
 *
 * `derived_from_child` 與 `deterministic_policy` 一定要分開：早期版本共用
 * 一個 `derived`，於是「從孩子的話推出來的」與「GrowBook 政策決定的」
 * 在資料上長得一模一樣，而它們的證據強度差一級。半年後要回答
 * 「這個數字憑什麼」時，那個 derived 答不出來。
 *
 * `undecided` 是這組值裡最重要的一個：孩子沒說、而這件事又不是計畫成立
 * 的必要條件時，正確答案是留白，不是讓模型挑一個看起來合理的值。
 */
export type ChildPlanFieldSource =
  | 'child_stated'
  | 'derived_from_child'
  | 'deterministic_policy'
  | 'ai_suggested'
  | 'undecided';

export const CHILD_PLAN_FIELD_SOURCES: readonly ChildPlanFieldSource[] = [
  'child_stated',
  'derived_from_child',
  'deterministic_policy',
  'ai_suggested',
  'undecided',
] as const;

/**
 * 證據強度。數字越小越優先。
 *
 * **低順位不得覆蓋高順位。** 這不是一句原則宣言 —— validator 會拿它去比對：
 * 孩子講過的節奏被標成 ai_suggested，就是一次覆蓋，整份不放行。
 */
export const EVIDENCE_PRIORITY: Record<ChildPlanFieldSource, number> = {
  child_stated: 0,
  derived_from_child: 1,
  deterministic_policy: 2,
  ai_suggested: 3,
  undecided: 4,
};

/** 這個來源夠不夠格代表「這件事是孩子自己的」。 */
export function isChildOwned(source: ChildPlanFieldSource): boolean {
  return EVIDENCE_PRIORITY[source] <= EVIDENCE_PRIORITY.derived_from_child;
}

/**
 * 這份計畫裡，哪些是孩子想的、哪些是 AI 補的。
 *
 * 這一輪不做完整的 event sourcing，但**結果不可以把來源洗平** ——
 * 孩子說「每天投 20 球」、AI 只是補了一句「先試七天」，最後的資料
 * 不能看起來像整份計畫都是 AI 想的。
 */
export type ChildPlanProvenance = {
  /** 孩子的原話，逐字。由組裝端從 input 複製，模型碰不到。 */
  childOriginalGoal: string;
  /** 孩子自己講的方法，逐字。null = 他沒講。同樣由組裝端複製。 */
  childStatedApproach: string | null;
  fields: {
    cadence: ChildPlanFieldSource;
    sessionSize: ChildPlanFieldSource;
    preferredTime: ChildPlanFieldSource;
    nextAction: ChildPlanFieldSource;
    reviewPoint: ChildPlanFieldSource;
    /** staged 以外一律 undecided。 */
    phases: ChildPlanFieldSource;
    /** accumulation 以外一律 undecided。 */
    target: ChildPlanFieldSource;
    /** external_outcome 以外一律 undecided。 */
    controllableActions: ChildPlanFieldSource;
  };
};

// ---------------------------------------------------------------------------
// Ready Plan
// ---------------------------------------------------------------------------

/**
 * 下一步是誰想的。與 provenance.fields.nextAction 一致，由組裝端保證。
 *
 * 用的是同一組詞彙 —— 兩個 enum 講同一件事會各自漂移。
 */
export type ChildPlanActionSource = 'child_stated' | 'derived_from_child' | 'ai_suggested';

export type ChildPlanNextAction = {
  /** 下一次可以直接做完的一個小動作。過不了 validateNextStep 就整份不放行。 */
  text: string;
  source: ChildPlanActionSource;
};

/**
 * 什麼時候回頭看看這個方法適不適合。
 *
 * **不是完成／失敗**，是 review。null 合法 —— 不強迫每種目標都有 review date。
 */
export type ChildPlanReviewPoint =
  | { type: 'after_days'; days: number }
  | { type: 'after_sessions'; sessions: number }
  | { type: 'after_phase'; phaseId: string }
  | null;

/** 一次做多少。分鐘或次數兩種，不硬統一成分鐘。 */
export type ChildPlanSessionSize =
  | { kind: 'minutes'; minutes: number }
  | { kind: 'count'; count: number; unit: string };

/**
 * staged 的階段。
 *
 * ⚠️ **這是 provisional route，不是 authoritative curriculum。**
 *    GrowBook 的 AI 是規劃夥伴，不是鋼琴老師、不是籃球教練、不是醫師。
 *    孩子已經有老師／教材／自己的方法時，phases 只能是那套方法的整理
 *    （provenance 會是 derived_from_child），不是模型另造的一套課程。
 *
 * 完成條件**必須可觀察**，不可以是心理狀態。
 */
export type ChildPlanPhase = {
  id: string;
  title: string;
  /** 「能不扶著騎完 10 公尺」可以；「真正理解」「更有自信」不行。 */
  observableDoneWhen: string;
};

/** AI 這一輪到底做了什麼。 */
export type ChildPlanningContribution =
  /** 孩子自己想好了，AI 只是整理。 */
  | 'organized_child_plan'
  /** 孩子有方向，AI 補了缺的細節。 */
  | 'filled_missing_details'
  /**
   * 孩子從 needs_choice 的選項裡挑了一個。
   *
   * 選項的文字是 AI 寫的，但**決定是孩子做的** —— 這兩件事不能被寫成
   * 同一件。挑過之後那個選項會從下一輪的 childApproach 帶回來，
   * 所以這個值成立的前提是 input.childApproach 有值。
   */
  | 'child_chose_option';

export const CHILD_PLANNING_CONTRIBUTIONS: readonly ChildPlanningContribution[] = [
  'organized_child_plan',
  'filled_missing_details',
  'child_chose_option',
] as const;

/** 三種 progression 共有的部分。 */
export type ChildGoalPlanCore = {
  /**
   * 孩子想要的成果。**可以是不可控的**（「國文考 100 分」）——
   * 保留它是刻意的，弄丟它等於把孩子的目標換掉。
   * 但它永遠不會是 nextAction。
   */
  desiredOutcome: string;
  actionPlanSummary: string;
  /** 現在這一段要專注的事。 */
  currentFocus: string;
  nextAction: ChildPlanNextAction;
  reviewPoint: ChildPlanReviewPoint;
  planningContribution: ChildPlanningContribution;
  provenance: ChildPlanProvenance;
  /** 真正回答的 model。稽核用 —— MODEL_CHAIN 會 fallback，不能寫死首選。 */
  model: string;
};

/**
 * 成果控制得了嗎。
 *
 * external_outcome 一定要附上孩子控制得了的行動 —— 型別上就沒有
 * 「不可控目標但沒有可控行動」這個形狀。
 */
export type ChildGoalPlanControl =
  | { goalControlType: 'directly_actionable' }
  | { goalControlType: 'external_outcome'; controllableActions: string[] };

/**
 * 怎麼向前走。
 *
 * rhythm 的計畫**在型別上就沒有** phases，所以「把所有目標都拆成 3-5 步」
 * 這件事寫不出來，不必靠 review 抓。
 */
export type ChildGoalPlanProgression =
  | {
      progressionKind: 'rhythm';
      /** null = 還沒定，而且不是計畫成立的必要條件。 */
      cadence: ChildPlanCadence | null;
      sessionSize: ChildPlanSessionSize | null;
      /** 先試多久再看看。與 reviewPoint 必須一致（見 validator）。 */
      trialPeriod: { days: number } | { sessions: number } | null;
    }
  | {
      progressionKind: 'staged';
      /** 2-5 個真實的能力／成果進展，不是為了湊數字。provisional route。 */
      phases: ChildPlanPhase[];
    }
  | {
      progressionKind: 'accumulation';
      targetValue: number;
      targetUnit: string;
      currentValue: number;
    };

/**
 * 一份可執行的計畫 = 共同欄位 × 成果控制性 × 前進方式。
 *
 * 交集而不是單一 union：兩個維度正交，所以
 * 「external_outcome 的 rhythm 計畫」是一個合法、而且很常見的形狀。
 */
export type ChildGoalPlan = ChildGoalPlanCore & ChildGoalPlanControl & ChildGoalPlanProgression;

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/**
 * 為什麼這一輪沒有結果。
 *
 * 與 P0-3 同一組值 —— 兩條鏈的失敗語意本來就一樣，另外發明一組
 * 只會讓 log 難讀。
 */
export type ChildGoalPlanningUnavailableReason =
  | 'TIMEOUT'
  /** Function 回來的東西 App 看不懂（版本不合、代理改過、部署到一半）。 */
  | 'INVALID_RESPONSE'
  /** Function 說：模型回的東西**它**看不懂。 */
  | 'INVALID_AI_OUTPUT'
  | 'SERVICE_ERROR'
  | 'SERVICE_DISABLED'
  | 'INVALID_INPUT';

/**
 * 被 deterministic guard 擋下來的理由。
 *
 * 存在的理由是診斷：`INVALID_AI_OUTPUT` 只說得出「這一輪沒有計畫」，
 * 而這些代碼說得出**是哪一條產品原則被違反**。它們是稽核資訊，
 * 不是給孩子看的文案。
 */
export type ChildPlanRejectionCode =
  /** 形狀／列舉／長度不對。 */
  | 'SHAPE_INVALID'
  /** 下一步過不了既有的 validateNextStep（結果導向、太長、系統語言）。 */
  | 'NEXT_ACTION_INVALID'
  /** 出現心理狀態推測（失去動機、不夠自律、更有自信…）。 */
  | 'MENTAL_STATE_DIAGNOSIS'
  /** 資訊已經足夠，卻還在問問題或還在給選項。 */
  | 'UNNECESSARY_CLARIFICATION'
  /** 孩子講過的方法／節奏被換掉，或低順位證據覆蓋了高順位。 */
  | 'CHILD_INPUT_OVERWRITTEN'
  /** 孩子沒說時，計畫裡卻冒出一個具體時間。 */
  | 'UNDECIDED_DETAIL_INVENTED'
  /** staged 的階段完成條件不可觀察。 */
  | 'PHASE_NOT_OBSERVABLE'
  /** 不可控的成果被寫成了行動。 */
  | 'OUTCOME_USED_AS_ACTION'
  /** 模型把自己的一般知識講成領域權威（最佳訓練順序、專業處方…）。 */
  | 'DOMAIN_AUTHORITY_CLAIM';

/**
 * 四態。
 *
 * needs_clarification  連孩子想達成什麼都還不夠清楚 → 問一題
 * needs_choice         目標清楚，但還沒決定怎麼做 → 給 2-3 個選項
 * ready                資訊夠了 → 一份可執行的計畫
 * unavailable          技術性失敗（關著／逾時／亂回／服務錯誤）
 *
 * ⚠️ unavailable **不可以**被偽裝成 needs_clarification。Gemini 逾時的時候
 *    把它塞成一個問題，孩子看到的是「AI 在問我問題」，但他講得一點都沒錯 ——
 *    只是服務掛了。技術狀態與對話狀態是兩件事。
 */
export type ChildGoalPlanningResult =
  | {
      status: 'needs_clarification';
      schemaVersion: typeof CHILD_GOAL_PLANNING_SCHEMA_VERSION;
      /** AI 目前理解到的目標。孩子的原話，不是改寫版。 */
      knownGoal: string;
      /** **一次只有一題。** */
      question: ChildPlanClarificationQuestion;
      model: string;
    }
  | {
      status: 'needs_choice';
      schemaVersion: typeof CHILD_GOAL_PLANNING_SCHEMA_VERSION;
      knownGoal: string;
      question: string;
      /** 2-3 個可選的開始方式。 */
      options: ChildPlanStartOption[];
      /**
       * 字面量 `true`。
       *
       * 孩子**一定**可以說「我自己想」——這不是一個可以被關掉的旗標，
       * 所以型別上它只有一個值。一個「只能從 AI 選項裡挑」的畫面，
       * 在這個契約下寫不出來。
       */
      allowCustomAnswer: true;
      model: string;
    }
  | {
      status: 'ready';
      schemaVersion: typeof CHILD_GOAL_PLANNING_SCHEMA_VERSION;
      plan: ChildGoalPlan;
    }
  | {
      status: 'unavailable';
      schemaVersion: typeof CHILD_GOAL_PLANNING_SCHEMA_VERSION;
      reason: ChildGoalPlanningUnavailableReason;
      /** 只有 guard 擋下來時才有值。空陣列不會出現，一律 undefined。 */
      rejections?: ChildPlanRejectionCode[];
    };

// ---------------------------------------------------------------------------
// 上限
// ---------------------------------------------------------------------------

/** 與 Function 端 CHILD_GOAL_PLANNING_LIMITS 同值，由 parity 測試釘住。 */
export const CHILD_GOAL_PLANNING_LIMITS = {
  maxGoalLength: 200,
  maxMotivationLength: 200,
  maxApproachLength: 200,
  maxPreferredTimeLength: 40,
  maxOutcomeLength: 40,
  maxSummaryLength: 120,
  maxFocusLength: 40,
  /** 與既有的 NEXT_STEP_MAX_LENGTH 同值——下一步是同一種東西，不該有兩個上限。 */
  maxActionLength: 40,
  maxQuestionLength: 40,
  maxChoiceQuestionLength: 40,
  maxPhaseTitleLength: 20,
  maxPhaseIdLength: 24,
  maxDoneWhenLength: 40,
  maxOptionLength: 40,
  maxUnitLength: 8,
  maxModelLength: 80,
  minPhases: 2,
  maxPhases: 5,
  minControllableActions: 1,
  maxControllableActions: 4,
  minChoiceOptions: 2,
  maxChoiceOptions: 3,
  minTargetValue: 1,
  maxTargetValue: 10000,
  maxWeeklyFrequency: 7,
  minSessionMinutes: 1,
  maxSessionMinutes: 180,
  minSessionCount: 1,
  maxSessionCount: 999,
  minReviewDays: 1,
  maxReviewDays: 90,
  minReviewSessions: 1,
  maxReviewSessions: 60,
} as const;

/**
 * 呼叫 AI 的那一層。
 *
 * 與 P0-3 同一個理由抽成介面：orchestrator 因此可以在 jest 裡完整測試
 * （含逾時、亂回、服務掛掉），不需要網路也不會花到配額。
 */
export interface ChildGoalPlanningClient {
  requestPlan(
    input: ChildGoalPlanningInput,
    signal?: AbortSignal,
  ): Promise<ChildGoalPlanningResult>;
}
