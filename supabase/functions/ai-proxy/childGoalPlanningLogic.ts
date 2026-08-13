// childGoalPlanning — 純邏輯（prompt、輸出正規化、deterministic 組裝）。
//
// ─────────────────────────────────────────────────────────────────────────
// 這個檔案刻意**不 import 任何 Deno 專屬的東西**，所以 jest 跑得動。
// 真正呼叫模型的接線在 childGoalPlanning.ts。
//
// 分工與 P0-3 完全一致，也刻意如此：
//
//   Function 端  回「理解」＋ deterministic 組裝（孩子講過的東西一定贏）
//   App 端       決定「這份計畫能不能用」（下一步驗證、心理狀態、多嘴檢查）
//
// 所以這裡**沒有**任何關鍵字清單。「讀完整本書不能當下一步」那份清單
// 只有一份，住在 App 端的 canonicalPlanFields.ts —— 在這裡再寫一份，
// 兩份一定會分岔，而分岔之後某一條路徑會安靜地放行它。
// （parity 測試會確認這個檔案沒有第二份清單。）
//
// 這一層要守住的四件事，都是程式，不是 prompt 裡的請求：
//
//   1. **孩子選的節奏由程式覆寫回去。** 模型講什麼都不算數。
//   2. **孩子講過的方法逐字保留在 provenance。** 模型碰不到那個欄位。
//   3. **孩子沒說的事一律 undecided。** 模型補不進去。
//   4. **孩子已經講夠了就不准再問。** 資訊足夠時模型還問問題 = 這一輪無效。
// ─────────────────────────────────────────────────────────────────────────

/** 1：第一版 planning contract。與 P0-3 的 schemaVersion 是兩個獨立的數列。 */
export const CHILD_GOAL_PLANNING_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// 輸入
// ---------------------------------------------------------------------------

export type ChildPlanAgeGroup = '2-4' | '4-6' | '6-9' | '9-12';

export type ChildPlanCadenceMode = 'one_time' | 'weekly_frequency' | 'fixed_days';

export type ChildPlanCadence = {
  mode: ChildPlanCadenceMode;
  weeklyFrequency?: number;
  /** 0=週日 … 6=週六，與 tasks.recurrence_days 一致。 */
  days?: number[];
};

export type ChildPlanningSupportPreference =
  | 'organize_only'
  | 'suggest_if_needed'
  | 'give_me_options'
  | 'first_step_only';

export type ChildGoalPlanningInput = {
  schemaVersion: typeof CHILD_GOAL_PLANNING_SCHEMA_VERSION;
  ageGroup: ChildPlanAgeGroup;
  /** 孩子的原話。**只讀。** 這一層不會、也不能改寫它。 */
  childOriginalGoal: string;
  childOriginalMotivation: string | null;
  /** 孩子自己已經想到的做法。有值時只能整理，不能換掉。 */
  childApproach: string | null;
  cadence: ChildPlanCadence | null;
  preferredTime: string | null;
  planningSupportPreference: ChildPlanningSupportPreference | null;
};

// ---------------------------------------------------------------------------
// 輸出（與 App 端契約鏡射，由 parity 測試釘住）
// ---------------------------------------------------------------------------

export type ChildPlanProgressionKind =
  | 'rhythm'
  | 'staged'
  | 'accumulation'
  | 'outcome_to_action';

export type ChildPlanClarificationKind =
  | 'goal_focus'
  | 'current_level'
  | 'approach'
  | 'cadence'
  | 'session_size'
  | 'target_amount';

export type ChildPlanFieldSource = 'child' | 'ai_suggested' | 'derived' | 'undecided';

export type ChildPlanActionSource = 'child' | 'ai_suggested' | 'derived';

export type ChildPlanningContribution =
  | 'organized_child_plan'
  | 'filled_missing_details'
  | 'suggested_options';

export type ChildPlanReviewPoint =
  | { type: 'after_days'; days: number }
  | { type: 'after_sessions'; sessions: number }
  | { type: 'after_phase'; phaseId: string }
  | null;

export type ChildPlanSessionSize =
  | { kind: 'minutes'; minutes: number }
  | { kind: 'count'; count: number; unit: string };

export type ChildPlanPhase = { id: string; title: string; observableDoneWhen: string };

export type ChildPlanStartOption = { id: string; text: string };

export type ChildPlanProvenance = {
  childOriginalGoal: string;
  childStatedApproach: string | null;
  fields: {
    cadence: ChildPlanFieldSource;
    sessionSize: ChildPlanFieldSource;
    preferredTime: ChildPlanFieldSource;
    nextAction: ChildPlanFieldSource;
    reviewPoint: ChildPlanFieldSource;
    phases: ChildPlanFieldSource;
    target: ChildPlanFieldSource;
  };
};

export type ChildGoalPlanCore = {
  desiredOutcome: string;
  actionPlanSummary: string;
  currentFocus: string;
  nextAction: { text: string; source: ChildPlanActionSource };
  reviewPoint: ChildPlanReviewPoint;
  planningContribution: ChildPlanningContribution;
  provenance: ChildPlanProvenance;
  startOptions: ChildPlanStartOption[] | null;
  model: string;
};

export type ChildGoalPlan =
  | (ChildGoalPlanCore & {
      progressionKind: 'rhythm';
      cadence: ChildPlanCadence | null;
      sessionSize: ChildPlanSessionSize | null;
      trialPeriod: { days: number } | { sessions: number } | null;
    })
  | (ChildGoalPlanCore & { progressionKind: 'staged'; phases: ChildPlanPhase[] })
  | (ChildGoalPlanCore & {
      progressionKind: 'accumulation';
      targetValue: number;
      targetUnit: string;
      currentValue: number;
    })
  | (ChildGoalPlanCore & {
      progressionKind: 'outcome_to_action';
      controllableActions: string[];
      cadence: ChildPlanCadence | null;
    });

export type ChildGoalPlanningResponse =
  | {
      status: 'needs_clarification';
      schemaVersion: typeof CHILD_GOAL_PLANNING_SCHEMA_VERSION;
      knownGoal: string;
      question: { kind: ChildPlanClarificationKind; text: string };
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
      reason: 'INVALID_AI_OUTPUT' | 'SERVICE_ERROR' | 'INVALID_INPUT';
    };

// ---------------------------------------------------------------------------
// 上限
// ---------------------------------------------------------------------------

/** 與 App 端 CHILD_GOAL_PLANNING_LIMITS 同值，由 parity 測試釘住。 */
export const CHILD_GOAL_PLANNING_LIMITS = {
  maxGoalLength: 200,
  maxMotivationLength: 200,
  maxApproachLength: 200,
  maxPreferredTimeLength: 40,
  maxOutcomeLength: 40,
  maxSummaryLength: 120,
  maxFocusLength: 40,
  maxActionLength: 40,
  maxQuestionLength: 40,
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
  minStartOptions: 2,
  maxStartOptions: 3,
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
 * 這一支給模型的預算，覆蓋 gemini.ts 的 8 秒預設。
 *
 * 理由與 P0-3 相同（見 childProposalPlanDraftLogic.ts 的同名常數）：
 * 要模型讀完孩子的原話再回一整包結構化 JSON，8 秒不夠，而症狀會是
 * SERVICE_ERROR —— 看起來像服務壞掉而不是太慢。
 *
 * 上限來自 App 端的 CHILD_GOAL_PLANNING_TIMEOUT_MS（20 秒）：要留餘裕
 * 讓這支在 client 放棄之前把結構化的 unavailable 回出去。
 */
export const CHILD_GOAL_PLANNING_GEMINI_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// 輸入檢查
// ---------------------------------------------------------------------------

const AGE_GROUPS: readonly string[] = ['2-4', '4-6', '6-9', '9-12'];

export function childGoalPlanningInputIsUsable(input: ChildGoalPlanningInput): boolean {
  if (input === null || typeof input !== 'object') return false;
  if (input.schemaVersion !== CHILD_GOAL_PLANNING_SCHEMA_VERSION) return false;
  if (typeof input.childOriginalGoal !== 'string') return false;
  if (input.childOriginalGoal.trim().length === 0) return false;
  return AGE_GROUPS.includes(input.ageGroup);
}

/**
 * 孩子講的東西夠不夠形成一份行動計畫。
 *
 * 與 App 端 planGuards.informationSufficiency 是同一條規則，而且刻意是
 * 一個**結構條件**（有節奏 ＋ 有自己的方法），不是一份關鍵字清單 ——
 * 所以兩端各有一份實作不會像關鍵字那樣默默分岔，parity 測試也釘得住。
 */
export function informationIsSufficient(input: ChildGoalPlanningInput): boolean {
  const hasCadence = input.cadence !== null && input.cadence !== undefined;
  const hasApproach =
    typeof input.childApproach === 'string' && input.childApproach.trim().length > 0;
  return hasCadence && hasApproach;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const DAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

export function describeCadenceForPrompt(cadence: ChildPlanCadence | null): string {
  if (!cadence) return '孩子還沒說';
  if (cadence.mode === 'weekly_frequency') return `一週 ${cadence.weeklyFrequency ?? '?'} 次`;
  if (cadence.mode === 'fixed_days') {
    const days = (cadence.days ?? []).map((d) => DAY_ZH[d] ?? String(d)).join('、');
    return days ? `固定每週${days}` : '固定星期幾做';
  }
  return '先做一次看看';
}

const SUPPORT_ZH: Record<ChildPlanningSupportPreference, string> = {
  organize_only: '我自己想好了，只要幫我整理',
  suggest_if_needed: '缺什麼再幫我補',
  give_me_options: '我想看幾種做法再挑',
  first_step_only: '先告訴我第一步就好',
};

/**
 * 給模型的指示。
 *
 * 四段話是重點，而且每一段在程式裡都有對應的 deterministic 執法點 ——
 * prompt 只是讓模型第一次就寫對，不是唯一的防線：
 *
 *   · 「孩子已經有方法就先整理他的方法」→ composeChildGoalPlan 逐字保留
 *   · 「沒說的不要幫他決定」            → provenance 一律 undecided
 *   · 「不是每件事都要拆成 3-5 步」      → progressionKind 是 union 判別欄位
 *   · 「不要猜他的心理狀態」            → App 端 guard 一律擋掉
 */
export function buildChildGoalPlanningPrompt(input: ChildGoalPlanningInput): string {
  const L = CHILD_GOAL_PLANNING_LIMITS;
  const goal = input.childOriginalGoal.trim().slice(0, L.maxGoalLength);
  const motivation = (input.childOriginalMotivation ?? '').trim().slice(0, L.maxMotivationLength);
  const approach = (input.childApproach ?? '').trim().slice(0, L.maxApproachLength);
  const sufficient = informationIsSufficient(input);

  const approachRule = approach
    ? `孩子已經自己想到做法了（「${approach}」）。**先整理他的方法**，不要換成另一套。`
      + ' planningContribution 只能是 organized_child_plan 或 filled_missing_details，'
      + '不可以是 suggested_options。'
    : '孩子還沒說他打算怎麼做。如果從他的話裡看得出方向，就幫他整理成可執行的行動；'
      + '看不出來而且問了才有辦法規劃，就問一題。';

  const cadenceRule = input.cadence
    ? `孩子已經自己選了節奏（${describeCadenceForPrompt(input.cadence)}）。**不要改掉它**，`
      + 'suggestedCadence 一律給 null。'
    : '孩子還沒選節奏。這件事需要節奏才成立的話，可以在 suggestedCadence 給一個'
      + '對這個年紀合理、容易開始的建議；不需要就給 null。';

  const clarificationRule = sufficient
    ? '⚠️ 孩子這次已經講得夠清楚了（有節奏、也講了他打算怎麼做）。'
      + '**這一輪一定要給計畫，status 必須是 ready，不可以再問問題。**'
      + ' 而且 nextAction 要從他自己講的做法裡拿出來，source 給 "child" 或 "derived"，'
      + '不可以是 "ai_suggested" —— 他已經說了要做什麼，下一步就不該換成你想的。'
    : '只有在「不知道答案就沒辦法形成合理的行動計畫」時才問，而且**一次只問一題**。'
      + '孩子的話裡已經回答過的事不要再問一次（例如他說「平日睡前」，就不要再問一週幾次）。';

  return `你是 GrowBook 的計畫夥伴。一個孩子說出他想做的事，你的工作是幫他把它變成「接下來真的做得到的行動」。

你不是在審核，也不是在出作業。你是在幫他把想法整理清楚。

孩子的原話：「${goal}」
${motivation ? `孩子說的原因：「${motivation}」` : '孩子沒有說原因。'}
${approach ? `孩子自己想到的做法：「${approach}」` : '孩子沒有說他打算怎麼做。'}
孩子的年齡段：${input.ageGroup}
孩子想的節奏：${describeCadenceForPrompt(input.cadence)}
${input.preferredTime ? `孩子想做的時段：${input.preferredTime}` : '孩子沒有說想在什麼時段做。'}
孩子希望你幫多少：${input.planningSupportPreference ? SUPPORT_ZH[input.planningSupportPreference] : '他沒有特別說（預設：先整理，缺什麼才補）'}

最重要的四條規則：

1. **先看孩子有沒有自己的方法，再決定要不要建議。**
   ${approachRule}

2. **成果是方向，行動才是計畫。**
   「國文考 100 分」「比賽拿第一名」這種結果，孩子控制不了全部——
   把它放在 desiredOutcome 保留下來，**但不可以**變成 nextAction。
   nextAction 一定要是他下一次可以直接做完的一個小動作。
   可以：「先複習 15 分鐘」「先寫三句故事大綱」。
   不可以：「讀完整本書」「考 100 分」「拿第一名」「變得更自律」。

3. **他沒說的事，不要幫他決定。**
   ${cadenceRule}
   他沒說時段，就不要生出「每天晚上 8:00」這種具體時間。
   不是必要的資訊就讓它空著（null），不要猜。

4. **不要猜他的心理狀態。**
   可以說看得到的事：「最近幾次星期三比較難照原本安排完成」。
   不可以說：「你失去動機」「你不夠自律」「你會更有自信」「你會真正理解」。
   staged 的階段完成條件也一樣，必須是看得見的（「能不扶著騎完 10 公尺」），
   不可以是心情或理解程度。

${clarificationRule}

progressionKind —— 先想清楚「這件事怎麼向前走」，不要每件事都拆成 3-5 步：

  rhythm             靠固定頻率往前（每天讀 15 分鐘、30 天跑步、練琴習慣）。
                     重點是頻率、單次份量、先試多久，不要編假的里程碑。
  staged             有真實的能力或成果進展（學會騎車、學一首曲子、做一本漫畫）。
                     phases 給 ${CHILD_GOAL_PLANNING_LIMITS.minPhases}-${CHILD_GOAL_PLANNING_LIMITS.maxPhases} 個，每個都要是真的進展，不是為了湊數。
  accumulation       主要進度是「做到幾個 / 目標幾個」（讀 5 本書、跑 20 公里）。
                     不要硬拆成「第一本」「第二本」這種假階段。
  outcome_to_action  成果受外部因素影響（考 100 分、拿第一名、進校隊）。
                     保留成果，另外給 1-${CHILD_GOAL_PLANNING_LIMITS.maxControllableActions} 個他控制得了的行動。
                     絕對不要寫成「80 分 → 90 分 → 100 分」這種假進度。

其他限制：
- desiredOutcome ${L.maxOutcomeLength} 字內、actionPlanSummary ${L.maxSummaryLength} 字內、currentFocus ${L.maxFocusLength} 字內、nextAction.text ${L.maxActionLength} 字內。
- nextAction.source：孩子自己講過的動作給 "child"，你提的給 "ai_suggested"，從他的話推出來的給 "derived"。
- reviewPoint 是「什麼時候回頭看看這個方法適不適合」，不是完成或失敗。不需要就給 null。
- 只有孩子明顯不知道怎麼開始、而且你要給他挑的時候，planningContribution 才是 suggested_options，
  這時 startOptions 給 ${L.minStartOptions}-${L.maxStartOptions} 個，其他情況一律 null。
- 不要出現「任務」「審核」「批准」「系統」「AI」這些字。
- 不要提到任何幣值、點數、獎勵數字——這個 JSON 裡沒有那種欄位。

只回傳 JSON，前後不要有其他文字。資訊不夠時：
{"status":"needs_clarification","question":{"kind":"goal_focus","text":"你最想在哪一件事情上變厲害？"}}

question.kind 只能是：goal_focus（不知道要做什麼）、current_level（不知道他現在到哪）、
approach（有目標沒方法）、cadence（缺頻率）、session_size（缺單次份量）、target_amount（缺目標數量）。

資訊夠時：
{"status":"ready","desiredOutcome":"兩週讀完神奇樹屋","progressionKind":"rhythm","actionPlanSummary":"平日睡前讀 15 分鐘，兩週把這本書讀完。","currentFocus":"先維持平日睡前的閱讀","nextAction":{"text":"今晚睡前先讀 15 分鐘","source":"child"},"reviewPoint":{"type":"after_days","days":7},"planningContribution":"organized_child_plan","suggestedCadence":null,"sessionSize":{"kind":"minutes","minutes":15},"trialPeriod":{"days":7},"phases":null,"targetValue":null,"targetUnit":null,"currentValue":null,"controllableActions":null,"startOptions":null}

各 progressionKind 專屬欄位（其他一律給 null，不要為了整齊硬填）：
  rhythm            sessionSize、trialPeriod（trialPeriod 有值時 reviewPoint 要講同一個數字）
  staged            phases: [{"title":"先能自己滑行","observableDoneWhen":"能雙腳離地滑行 5 公尺"}]（不用給 id）
  accumulation      targetValue、targetUnit（${L.maxUnitLength} 字內，例如「本」「公里」）、currentValue
  outcome_to_action controllableActions: ["先複習 15 分鐘"]

sessionSize 只能是 null 或：{"kind":"minutes","minutes":15} 或 {"kind":"count","count":20,"unit":"球"}
suggestedCadence 只能是 null 或：{"mode":"weekly_frequency","weeklyFrequency":3} 或 {"mode":"fixed_days","days":[1,2,3,4,5]} 或 {"mode":"one_time"}
reviewPoint 只能是 null 或：{"type":"after_days","days":7} 或 {"type":"after_sessions","sessions":3} 或 {"type":"after_phase","phaseIndex":1}`;
}

// ---------------------------------------------------------------------------
// 模型輸出正規化
// ---------------------------------------------------------------------------

/**
 * 超過上限就是 null，**不截斷**。
 *
 * 這是與 P0-3 的同名 helper 刻意不同的地方。P0-3 截斷得起，因為那些欄位
 * 是候選（App 端還會再驗一次、過不了就丟掉）；這裡的欄位是計畫本體，
 * 一句被砍到一半的「下一步」會剛好落在長度限制以內、然後一路通過 ——
 * 孩子看到的就是一句話講到一半的計畫。
 *
 * 上限本來就寫在 prompt 裡了。模型寫超過，代表這一輪它沒有照著寫。
 */
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

function intInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const PROGRESSION_KINDS: readonly string[] = [
  'rhythm',
  'staged',
  'accumulation',
  'outcome_to_action',
];

const CLARIFICATION_KINDS: readonly string[] = [
  'goal_focus',
  'current_level',
  'approach',
  'cadence',
  'session_size',
  'target_amount',
];

const CONTRIBUTIONS: readonly string[] = [
  'organized_child_plan',
  'filled_missing_details',
  'suggested_options',
];

const ACTION_SOURCES: readonly string[] = ['child', 'ai_suggested', 'derived'];

export function normalizeCadence(value: unknown): ChildPlanCadence | null {
  if (!isRecord(value)) return null;

  if (value.mode === 'one_time') return { mode: 'one_time' };

  if (value.mode === 'weekly_frequency') {
    const times = intInRange(value.weeklyFrequency, 1, CHILD_GOAL_PLANNING_LIMITS.maxWeeklyFrequency);
    return times === null ? null : { mode: 'weekly_frequency', weeklyFrequency: times };
  }

  if (value.mode === 'fixed_days') {
    if (!Array.isArray(value.days) || value.days.length === 0) return null;
    const days: number[] = [];
    for (const day of value.days) {
      const parsed = intInRange(day, 0, 6);
      if (parsed === null) return null;
      if (!days.includes(parsed)) days.push(parsed);
    }
    return { mode: 'fixed_days', days: days.sort((a, b) => a - b) };
  }

  return null;
}

function normalizeSessionSize(value: unknown): ChildPlanSessionSize | null {
  if (!isRecord(value)) return null;
  const L = CHILD_GOAL_PLANNING_LIMITS;

  if (value.kind === 'minutes') {
    const minutes = intInRange(value.minutes, L.minSessionMinutes, L.maxSessionMinutes);
    return minutes === null ? null : { kind: 'minutes', minutes };
  }
  if (value.kind === 'count') {
    const count = intInRange(value.count, L.minSessionCount, L.maxSessionCount);
    const unit = text(value.unit, L.maxUnitLength);
    return count === null || unit === null ? null : { kind: 'count', count, unit };
  }
  return null;
}

/** 模型端的 review point。after_phase 用 1-based index，id 由我們自己編。 */
export type RawReviewPoint =
  | { type: 'after_days'; days: number }
  | { type: 'after_sessions'; sessions: number }
  | { type: 'after_phase'; phaseIndex: number }
  | null;

function normalizeReviewPoint(value: unknown): RawReviewPoint {
  if (!isRecord(value)) return null;
  const L = CHILD_GOAL_PLANNING_LIMITS;

  if (value.type === 'after_days') {
    const days = intInRange(value.days, L.minReviewDays, L.maxReviewDays);
    return days === null ? null : { type: 'after_days', days };
  }
  if (value.type === 'after_sessions') {
    const sessions = intInRange(value.sessions, L.minReviewSessions, L.maxReviewSessions);
    return sessions === null ? null : { type: 'after_sessions', sessions };
  }
  if (value.type === 'after_phase') {
    const index = intInRange(value.phaseIndex, 1, L.maxPhases);
    return index === null ? null : { type: 'after_phase', phaseIndex: index };
  }
  return null;
}

/** 模型回的階段（沒有 id —— id 由組裝端編）。 */
export type RawPhase = { title: string; observableDoneWhen: string };

function normalizePhases(value: unknown): RawPhase[] | null {
  if (!Array.isArray(value)) return null;
  const L = CHILD_GOAL_PLANNING_LIMITS;
  if (value.length < L.minPhases || value.length > L.maxPhases) return null;

  const phases: RawPhase[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const title = text(item.title, L.maxPhaseTitleLength);
    const observableDoneWhen = text(item.observableDoneWhen, L.maxDoneWhenLength);
    if (title === null || observableDoneWhen === null) return null;
    phases.push({ title, observableDoneWhen });
  }
  return phases;
}

function normalizeStartOptions(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const L = CHILD_GOAL_PLANNING_LIMITS;
  if (value.length < L.minStartOptions || value.length > L.maxStartOptions) return null;

  const options: string[] = [];
  for (const item of value) {
    const candidate = isRecord(item) ? item.text : item;
    const parsed = text(candidate, L.maxOptionLength);
    if (parsed === null) return null;
    options.push(parsed);
  }
  return options;
}

/** 模型的「理解」。只有理解，沒有 provenance —— 那是組裝端的事。 */
export type ChildGoalPlanningUnderstanding =
  | { status: 'needs_clarification'; question: { kind: ChildPlanClarificationKind; text: string } }
  | {
      status: 'ready';
      desiredOutcome: string;
      progressionKind: ChildPlanProgressionKind;
      actionPlanSummary: string;
      currentFocus: string;
      nextAction: { text: string; source: ChildPlanActionSource };
      reviewPoint: RawReviewPoint;
      planningContribution: ChildPlanningContribution;
      suggestedCadence: ChildPlanCadence | null;
      sessionSize: ChildPlanSessionSize | null;
      trialPeriod: { days: number } | { sessions: number } | null;
      phases: RawPhase[] | null;
      targetValue: number | null;
      targetUnit: string | null;
      currentValue: number | null;
      controllableActions: string[] | null;
      startOptions: string[] | null;
    };

/**
 * 把模型回的東西變成 understanding，或 null。
 *
 * null 的意思是「這一輪沒有計畫」，不是「用預設值頂著」。
 */
export function normalizeChildGoalPlanning(value: unknown): ChildGoalPlanningUnderstanding | null {
  if (!isRecord(value)) return null;
  const L = CHILD_GOAL_PLANNING_LIMITS;

  if (value.status === 'needs_clarification') {
    if (!isRecord(value.question)) return null;
    const kind = value.question.kind;
    const questionText = text(value.question.text, L.maxQuestionLength);
    if (typeof kind !== 'string' || !CLARIFICATION_KINDS.includes(kind)) return null;
    if (questionText === null) return null;
    return {
      status: 'needs_clarification',
      question: { kind: kind as ChildPlanClarificationKind, text: questionText },
    };
  }

  if (value.status !== 'ready') return null;

  const desiredOutcome = text(value.desiredOutcome, L.maxOutcomeLength);
  const actionPlanSummary = text(value.actionPlanSummary, L.maxSummaryLength);
  const currentFocus = text(value.currentFocus, L.maxFocusLength);
  if (desiredOutcome === null || actionPlanSummary === null || currentFocus === null) return null;

  if (
    typeof value.progressionKind !== 'string'
    || !PROGRESSION_KINDS.includes(value.progressionKind)
  ) {
    return null;
  }
  const progressionKind = value.progressionKind as ChildPlanProgressionKind;

  if (!isRecord(value.nextAction)) return null;
  const nextActionText = text(value.nextAction.text, L.maxActionLength);
  const nextActionSource = value.nextAction.source;
  if (nextActionText === null) return null;
  if (typeof nextActionSource !== 'string' || !ACTION_SOURCES.includes(nextActionSource)) {
    return null;
  }

  if (
    typeof value.planningContribution !== 'string'
    || !CONTRIBUTIONS.includes(value.planningContribution)
  ) {
    return null;
  }

  // 每一種 progression 只驗它自己的欄位。缺了就是這一輪沒有計畫 ——
  // 補一個「看起來合理」的預設值，等於讓沒有人決定過的內容進入計畫。
  let phases: RawPhase[] | null = null;
  let targetValue: number | null = null;
  let targetUnit: string | null = null;
  let currentValue: number | null = null;
  let controllableActions: string[] | null = null;

  if (progressionKind === 'staged') {
    phases = normalizePhases(value.phases);
    if (phases === null) return null;
  }

  if (progressionKind === 'accumulation') {
    targetValue = intInRange(value.targetValue, L.minTargetValue, L.maxTargetValue);
    targetUnit = text(value.targetUnit, L.maxUnitLength);
    currentValue = intInRange(value.currentValue, 0, L.maxTargetValue) ?? 0;
    if (targetValue === null || targetUnit === null) return null;
    if (currentValue > targetValue) return null;
  }

  if (progressionKind === 'outcome_to_action') {
    if (!Array.isArray(value.controllableActions)) return null;
    if (
      value.controllableActions.length < L.minControllableActions
      || value.controllableActions.length > L.maxControllableActions
    ) {
      return null;
    }
    controllableActions = [];
    for (const item of value.controllableActions) {
      const parsed = text(item, L.maxActionLength);
      if (parsed === null) return null;
      controllableActions.push(parsed);
    }
  }

  let trialPeriod: { days: number } | { sessions: number } | null = null;
  if (isRecord(value.trialPeriod)) {
    const days = intInRange(value.trialPeriod.days, L.minReviewDays, L.maxReviewDays);
    const sessions = intInRange(value.trialPeriod.sessions, L.minReviewSessions, L.maxReviewSessions);
    if (days !== null) trialPeriod = { days };
    else if (sessions !== null) trialPeriod = { sessions };
    else return null;
  }

  return {
    status: 'ready',
    desiredOutcome,
    progressionKind,
    actionPlanSummary,
    currentFocus,
    nextAction: {
      text: nextActionText,
      source: nextActionSource as ChildPlanActionSource,
    },
    reviewPoint: normalizeReviewPoint(value.reviewPoint),
    planningContribution: value.planningContribution as ChildPlanningContribution,
    suggestedCadence: normalizeCadence(value.suggestedCadence),
    sessionSize: normalizeSessionSize(value.sessionSize),
    trialPeriod: progressionKind === 'rhythm' ? trialPeriod : null,
    phases,
    targetValue,
    targetUnit,
    currentValue,
    controllableActions,
    startOptions: normalizeStartOptions(value.startOptions),
  };
}

// ---------------------------------------------------------------------------
// 組裝
// ---------------------------------------------------------------------------

function phaseId(index: number): string {
  return `phase-${index + 1}`;
}

/**
 * 把模型的理解組成一份計畫。
 *
 * ⚠️ 這一段是「AI 不可以默默改掉孩子的東西」在程式裡的樣子。四行 if，
 *    不是 prompt 裡的四句請求：
 *
 *      · 孩子選的節奏一定贏
 *      · 孩子講的方法逐字進 provenance
 *      · 孩子沒說的時段一律 undecided
 *      · 孩子已經有方法時，這一輪不可能是「AI 給你幾個選項」
 */
export function composeChildGoalPlan(args: {
  input: ChildGoalPlanningInput;
  understanding: Extract<ChildGoalPlanningUnderstanding, { status: 'ready' }>;
  model: string;
}): ChildGoalPlan {
  const { input, understanding, model } = args;

  const childApproach =
    typeof input.childApproach === 'string' && input.childApproach.trim().length > 0
      ? input.childApproach.trim()
      : null;
  const childPreferredTime =
    typeof input.preferredTime === 'string' && input.preferredTime.trim().length > 0
      ? input.preferredTime.trim()
      : null;

  // 孩子選過就照抄；沒選才看模型的建議。
  const cadence = input.cadence ?? understanding.suggestedCadence ?? null;
  const cadenceSource: ChildPlanFieldSource = input.cadence
    ? 'child'
    : understanding.suggestedCadence
      ? 'ai_suggested'
      : 'undecided';

  // 孩子已經有方法 → 不可能是「AI 給你幾個做法挑」。降級而不是照抄，
  // 因為照抄會讓資料看起來像整份計畫都是 AI 想的。
  const planningContribution: ChildPlanningContribution =
    childApproach !== null && understanding.planningContribution === 'suggested_options'
      ? 'filled_missing_details'
      : understanding.planningContribution;

  const startOptions: ChildPlanStartOption[] | null =
    planningContribution === 'suggested_options' && understanding.startOptions !== null
      ? understanding.startOptions.map((textValue, index) => ({
          id: `option-${index + 1}`,
          text: textValue,
        }))
      : null;

  const phases: ChildPlanPhase[] | null =
    understanding.phases === null
      ? null
      : understanding.phases.map((phase, index) => ({
          id: phaseId(index),
          title: phase.title,
          observableDoneWhen: phase.observableDoneWhen,
        }));

  // after_phase 的 index → 我們自己編的 id。指到不存在的階段就當作沒有
  // review point，不要留下一個指向空氣的參照。
  let reviewPoint: ChildPlanReviewPoint = null;
  const raw = understanding.reviewPoint;
  if (raw !== null) {
    if (raw.type === 'after_phase') {
      reviewPoint =
        phases !== null && raw.phaseIndex <= phases.length
          ? { type: 'after_phase', phaseId: phaseId(raw.phaseIndex - 1) }
          : null;
    } else {
      reviewPoint = raw;
    }
  }

  // trialPeriod 與 reviewPoint 講的是同一件事。模型只講了一邊時，
  // 由 trialPeriod 補出 reviewPoint（derived），不是各留各的。
  const trialPeriod = understanding.progressionKind === 'rhythm' ? understanding.trialPeriod : null;
  if (trialPeriod !== null) {
    reviewPoint =
      'days' in trialPeriod
        ? { type: 'after_days', days: trialPeriod.days }
        : { type: 'after_sessions', sessions: trialPeriod.sessions };
  }

  const provenance: ChildPlanProvenance = {
    // 孩子的原話與方法由這裡複製，模型碰不到這兩個欄位。
    childOriginalGoal: input.childOriginalGoal.trim(),
    childStatedApproach: childApproach,
    fields: {
      cadence: cadenceSource,
      sessionSize:
        understanding.sessionSize === null
          ? 'undecided'
          : childApproach !== null
            ? 'derived'
            : 'ai_suggested',
      // 孩子沒說時段就一定是 undecided —— 這是「不可以偷偷補決定」的執法點。
      preferredTime: childPreferredTime === null ? 'undecided' : 'child',
      nextAction: understanding.nextAction.source,
      reviewPoint: reviewPoint === null ? 'undecided' : trialPeriod !== null ? 'derived' : 'ai_suggested',
      phases: phases === null ? 'undecided' : 'ai_suggested',
      target: understanding.targetValue === null ? 'undecided' : 'ai_suggested',
    },
  };

  const core: ChildGoalPlanCore = {
    desiredOutcome: understanding.desiredOutcome,
    actionPlanSummary: understanding.actionPlanSummary,
    currentFocus: understanding.currentFocus,
    nextAction: understanding.nextAction,
    reviewPoint,
    planningContribution,
    provenance,
    startOptions,
    model,
  };

  if (understanding.progressionKind === 'rhythm') {
    return {
      ...core,
      progressionKind: 'rhythm',
      cadence,
      sessionSize: understanding.sessionSize,
      trialPeriod,
    };
  }

  if (understanding.progressionKind === 'staged') {
    return { ...core, progressionKind: 'staged', phases: phases ?? [] };
  }

  if (understanding.progressionKind === 'accumulation') {
    return {
      ...core,
      progressionKind: 'accumulation',
      targetValue: understanding.targetValue ?? 0,
      targetUnit: understanding.targetUnit ?? '',
      currentValue: understanding.currentValue ?? 0,
    };
  }

  return {
    ...core,
    progressionKind: 'outcome_to_action',
    controllableActions: understanding.controllableActions ?? [],
    cadence,
  };
}

/**
 * understanding → 要回給 App 的東西。
 *
 * 這裡是「多嘴」的第一道防線：孩子已經講夠了，模型卻回一個問題，
 * 這一輪就是無效輸出。**不是**把問題吞掉再自己編一份計畫 ——
 * 那會產出一份沒有人決定過的計畫。
 */
export function composeChildGoalPlanningResponse(args: {
  input: ChildGoalPlanningInput;
  understanding: ChildGoalPlanningUnderstanding;
  model: string;
}): ChildGoalPlanningResponse {
  const { input, understanding, model } = args;

  if (understanding.status === 'needs_clarification') {
    if (informationIsSufficient(input)) {
      return {
        status: 'unavailable',
        schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
        reason: 'INVALID_AI_OUTPUT',
      };
    }
    return {
      status: 'needs_clarification',
      schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
      knownGoal: input.childOriginalGoal.trim(),
      question: understanding.question,
      model,
    };
  }

  return {
    status: 'ready',
    schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
    plan: composeChildGoalPlan({ input, understanding, model }),
  };
}
