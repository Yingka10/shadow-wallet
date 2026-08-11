// childProposalPlanDraft — 純邏輯（prompt、輸出正規化、與規則引擎的組裝）。
//
// ─────────────────────────────────────────────────────────────────────────
// 這個檔案刻意**不 import 任何 Deno 專屬的東西**（不碰 gemini.ts、不碰
// coin-policy.json 的 import attribute），所以 jest 跑得動。
// 真正呼叫模型與規則引擎的接線在 childProposalPlanDraft.ts。
//
// 這一層要守住的三件事，都不是靠 prompt 拜託模型，而是靠程式：
//
//   1. **孩子選的節奏由程式覆寫回去。** 模型講什麼都不算數 ——
//      孩子選了一週 4 次，composePlanDraft 就寫一週 4 次。
//      只有孩子沒選（cadence = null）時才採用模型的建議。
//
//   2. **幣值不由模型決定。** 模型只回估時與難度；能不能發幣走
//      runEligibilityGate，發多少走 calcCoins。模型吐的任何數字都不會
//      成為 aiSuggestedCoinAmount。
//
//   3. **看不懂的輸出就是沒有草稿。** 缺欄位、型別不對、超出範圍一律
//      回 null，讓呼叫端回 unavailable。**不編一份看起來像 AI 的東西**——
//      那會變成一筆 authored_by='ai' 但模型從來沒跑過的資料。
// ─────────────────────────────────────────────────────────────────────────

import type { AgeGroup, Category, EligibilityResult } from './rewardEligibility.ts';

export const CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// 輸入 —— 一筆真實 Proposal 的實質內容
// ---------------------------------------------------------------------------

export type PlanDraftCadenceMode = 'one_time' | 'fixed_days' | 'weekly_frequency';

export type PlanDraftCadence = {
  mode: PlanDraftCadenceMode;
  weeklyFrequency?: number;
  /** 0=週日 … 6=週六，與 tasks.recurrence_days 一致。 */
  days?: number[];
};

export type ChildProposalPlanDraftInput = {
  schemaVersion: typeof CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION;
  ageGroup: AgeGroup;
  /** 孩子的原話。**只讀。** 這一層不會、也不能改寫它。 */
  childOriginalGoal: string;
  childOriginalMotivation: string | null;
  proposalSource: 'child' | 'co_created';
  /** 孩子自己選的節奏。null = 他選了「我還不知道」。 */
  cadence: PlanDraftCadence | null;
  preferredTime: string | null;
  childRewardPreference:
    | 'not_specified'
    | 'just_record'
    | 'see_progress'
    | 'hopes_for_coin';
};

// ---------------------------------------------------------------------------
// 模型回來的「理解」—— 只有理解，沒有決策
// ---------------------------------------------------------------------------

export type PlanDraftDifficulty = 'easy' | 'standard' | 'hard';

export type PlanDraftUnderstanding = {
  planTitle: string;
  planSummary: string;
  /**
   * 怎樣算完成一次。
   *
   * D 類（學習與技能）獎勵的是投入與持續，不是結果 ——
   * 「完成一次約定的閱讀時段」可以，「兩週後讀完整本才算」不行。
   * 模型被要求這樣寫，而 outcomeBased 讓沒照做的情況仍然攔得下來。
   */
  completionDescription: string;
  category: Category;
  categoryReason: string;
  estimatedMinutes: number;
  difficulty: PlanDraftDifficulty;
  outcomeBased: boolean;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  /** 孩子講了期間（「兩週」）才有值。 */
  durationDays: number | null;
  /** 只有孩子沒選節奏時才會被採用。 */
  suggestedCadence: PlanDraftCadence | null;
};

// ---------------------------------------------------------------------------
// 組裝出來的 Plan Draft
// ---------------------------------------------------------------------------

export type PlanDraftDurationType = 'one_time' | 'recurring' | 'long_term';

export type PlanDraftRewardPolicy =
  | 'record_only'
  | 'family_contribution'
  | 'progress_only'
  | 'coin_eligible';

export type PlanDraftRewardEligibility = 'not_evaluated' | 'allowed' | 'blocked';

/** 幣值來自規則引擎，不是模型。四種狀態都要能被家長端解釋。 */
export type PlanDraftPricingStatus = 'priced' | 'unpriced' | 'coin_disabled' | 'gated';

export type ChildProposalPlanDraft = {
  schemaVersion: typeof CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION;

  planTitle: string;
  planSummary: string;
  completionDescription: string;

  cadence: PlanDraftCadence | null;
  /** child = 照抄孩子選的；ai_suggested = 孩子沒選，這是 AI 提的。 */
  cadenceSource: 'child' | 'ai_suggested' | 'none';

  estimatedMinutes: number;
  durationType: PlanDraftDurationType;
  durationDays: number | null;

  category: Category;
  categoryReason: string;
  difficulty: PlanDraftDifficulty;

  rewardPolicy: PlanDraftRewardPolicy;
  rewardEligibility: PlanDraftRewardEligibility;
  rewardPolicyVersion: string;
  pricingStatus: PlanDraftPricingStatus;
  /** 規則引擎算得出來才有值。模型說什麼都不會寫進這裡。 */
  aiSuggestedCoinAmount: number | null;

  blockingIssues: string[];
  requiresConfirmation: string[];
  warnings: string[];
  clarificationQuestion: string | null;

  /** 實際回答的 model 名稱。用來稽核「這一版是誰寫的」。 */
  model: string;
};

export type ChildProposalPlanDraftResponse =
  | {
      status: 'draft';
      schemaVersion: typeof CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION;
      draft: ChildProposalPlanDraft;
    }
  | {
      status: 'unavailable';
      schemaVersion: typeof CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION;
      reason: 'INVALID_AI_OUTPUT' | 'SERVICE_ERROR' | 'INVALID_INPUT';
    };

// ---------------------------------------------------------------------------
// 上限
// ---------------------------------------------------------------------------

export const PLAN_DRAFT_LIMITS = {
  maxTitleLength: 24,
  maxSummaryLength: 160,
  maxCompletionLength: 60,
  maxReasonLength: 80,
  minMinutes: 1,
  maxMinutes: 180,
  minDurationDays: 1,
  maxDurationDays: 365,
  maxWeeklyFrequency: 7,
  /** 孩子的原話送進 prompt 前的截斷長度。 */
  maxGoalLength: 200,
  maxMotivationLength: 200,
} as const;

// ---------------------------------------------------------------------------
// 輸入檢查
// ---------------------------------------------------------------------------

const AGE_GROUPS: readonly string[] = ['2-4', '4-6', '6-9', '9-12'];

/** 沒有目標或沒有年齡段就不呼叫模型 —— 那一輪一定產不出可用的草稿。 */
export function planDraftInputIsUsable(input: ChildProposalPlanDraftInput): boolean {
  if (input.schemaVersion !== CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION) return false;
  if (typeof input.childOriginalGoal !== 'string') return false;
  if (input.childOriginalGoal.trim().length === 0) return false;
  return AGE_GROUPS.includes(input.ageGroup);
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const CADENCE_ZH: Record<PlanDraftCadenceMode, string> = {
  one_time: '先做一次看看',
  fixed_days: '固定星期幾做',
  weekly_frequency: '一週固定做幾次',
};

const DAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

export function describeCadenceForPrompt(cadence: PlanDraftCadence | null): string {
  if (!cadence) return '孩子還沒決定，想跟爸媽一起討論';
  if (cadence.mode === 'weekly_frequency') {
    return `一週 ${cadence.weeklyFrequency ?? '?'} 次`;
  }
  if (cadence.mode === 'fixed_days') {
    const days = (cadence.days ?? []).map((d) => DAY_ZH[d] ?? String(d)).join('、');
    return days ? `固定每週${days}` : CADENCE_ZH.fixed_days;
  }
  return CADENCE_ZH.one_time;
}

const REWARD_PREFERENCE_ZH: Record<
  ChildProposalPlanDraftInput['childRewardPreference'],
  string
> = {
  not_specified: '沒有特別說',
  just_record: '希望有做到就被記下來',
  see_progress: '希望看得到自己的進度',
  hopes_for_coin: '如果適合，希望可以有成長幣',
};

/**
 * 給模型的指示。
 *
 * 兩段話是重點：
 *   · 「不要換掉孩子想做的事」—— 原始目標是 source of truth。
 *   · 「不要決定幣值」—— 那是規則引擎的事，模型連數字都不用給。
 *
 * 孩子已經選好的節奏仍然寫進 prompt（讓摘要講得出來），
 * 但**採不採用不是模型決定的**：composePlanDraft 會覆寫回孩子的選擇。
 */
export function buildPlanDraftPrompt(input: ChildProposalPlanDraftInput): string {
  const goal = input.childOriginalGoal.trim().slice(0, PLAN_DRAFT_LIMITS.maxGoalLength);
  const motivation = (input.childOriginalMotivation ?? '')
    .trim()
    .slice(0, PLAN_DRAFT_LIMITS.maxMotivationLength);

  const cadenceLine = describeCadenceForPrompt(input.cadence);
  const cadenceRule = input.cadence
    ? `孩子已經自己選了節奏（${cadenceLine}）。**不要改掉它**，suggestedCadence 一律給 null。`
    : '孩子還沒決定節奏。請在 suggestedCadence 給一個對這個年紀合理、容易開始的建議。';

  return `你是 GrowBook 的計畫整理助手。一個孩子剛剛說出他想試試看的事，你的工作是把它整理成一份「可以拿去跟爸媽討論」的草稿。

你不是在審核，也不是在批准。你只是幫忙整理。

孩子的原話：「${goal}」
${motivation ? `孩子說的原因：「${motivation}」` : '孩子沒有說原因。'}
孩子的年齡段：${input.ageGroup}
這件事的來源：${input.proposalSource === 'child' ? '孩子自己提出' : '親子一起討論出來'}
孩子想怎麼開始：${cadenceLine}
${input.preferredTime ? `孩子想做的時段：${input.preferredTime}` : ''}
孩子希望被陪伴的方式：${REWARD_PREFERENCE_ZH[input.childRewardPreference]}

規則：
1. **不要換掉孩子想做的事。** 「我想兩週把這本書讀完」就是讀完這本書，不要改寫成「建立閱讀習慣」這種大人的說法。planTitle 是幫他取一個好記的名字，不是換一個目標。
2. ${cadenceRule}
3. **不要決定任何幣值、點數、獎勵數字。** 那不是你的工作，這個 JSON 裡也沒有那個欄位。
4. completionDescription 寫「做一次算完成什麼」，而且必須是**投入或練習**，不是結果或成績。
   可以：「完成一次約定的閱讀時段」。
   不可以：「兩週後把整本書讀完才算」「考到 90 分」。
5. 如果孩子的話裡有講到期間（例如「兩週」「一個月」），把它換算成 durationDays（兩週=14）。沒講就給 null。
6. estimatedMinutes 是「做一次大概花幾分鐘」，${PLAN_DRAFT_LIMITS.minMinutes}-${PLAN_DRAFT_LIMITS.maxMinutes} 的整數，要符合這個年紀能持續的長度。
7. 如果這件事聽起來是在獎勵一次性的成績或名次，outcomeBased 給 true。
8. 如果分不清楚這是家裡本來就該做的事還是額外的挑戰，needsClarification 給 true 並寫一句 clarificationQuestion 給爸媽看。

類別定義（判斷「為什麼做」，不是判斷難度）：
A = 生活常規（刷牙、整理書包）
B = 家庭參與 / 家庭本分（倒垃圾、洗碗等固定家務）
C = 自主挑戰（孩子主動提出、明顯超出本分的額外貢獻）
D = 學習與技能（練習、學習新東西、有進步軌跡）

planSummary 用溫暖的白話寫 2 句以內，要講得出孩子原本想做什麼、以及先用什麼節奏開始。不要出現「任務」「審核」「批准」「系統」這些字。

只回傳 JSON，前後不要有其他文字：
{"planTitle":"兩週閱讀挑戰","planSummary":"...","completionDescription":"完成一次約定的閱讀時段","category":"D","categoryReason":"40字內","estimatedMinutes":15,"difficulty":"standard","outcomeBased":false,"needsClarification":false,"clarificationQuestion":null,"durationDays":14,"suggestedCadence":null}

suggestedCadence 只能是 null 或以下三種其中一種：
{"mode":"weekly_frequency","weeklyFrequency":3}
{"mode":"fixed_days","days":[2,4]}
{"mode":"one_time"}
difficulty 只能是 easy / standard / hard。`;
}

// ---------------------------------------------------------------------------
// 模型輸出正規化
// ---------------------------------------------------------------------------

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}

function intInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

const CATEGORIES: readonly string[] = ['A', 'B', 'C', 'D'];
const DIFFICULTIES: readonly string[] = ['easy', 'standard', 'hard'];

/**
 * 節奏建議的形狀檢查。
 *
 * 形狀對不上就回 null，不修修補補 —— 一個「weeklyFrequency 缺了就補 3」
 * 的寬容 parser，產出的是一個沒有人決定過的數字。
 */
export function normalizeSuggestedCadence(value: unknown): PlanDraftCadence | null {
  if (value === null || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  if (raw.mode === 'one_time') return { mode: 'one_time' };

  if (raw.mode === 'weekly_frequency') {
    const times = intInRange(raw.weeklyFrequency, 1, PLAN_DRAFT_LIMITS.maxWeeklyFrequency);
    return times === null ? null : { mode: 'weekly_frequency', weeklyFrequency: times };
  }

  if (raw.mode === 'fixed_days') {
    if (!Array.isArray(raw.days)) return null;
    const days: number[] = [];
    for (const day of raw.days) {
      const parsed = intInRange(day, 0, 6);
      if (parsed === null) return null;
      if (!days.includes(parsed)) days.push(parsed);
    }
    if (days.length === 0) return null;
    return { mode: 'fixed_days', days: days.sort((a, b) => a - b) };
  }

  return null;
}

/**
 * 把模型回的東西變成 PlanDraftUnderstanding，或是 null。
 *
 * null 的意思是「這一輪沒有草稿」，不是「用預設值頂著」。
 */
export function normalizePlanDraftUnderstanding(
  value: unknown,
): PlanDraftUnderstanding | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const planTitle = text(raw.planTitle, PLAN_DRAFT_LIMITS.maxTitleLength);
  const planSummary = text(raw.planSummary, PLAN_DRAFT_LIMITS.maxSummaryLength);
  const completionDescription = text(
    raw.completionDescription,
    PLAN_DRAFT_LIMITS.maxCompletionLength,
  );
  if (planTitle === null || planSummary === null || completionDescription === null) {
    return null;
  }

  if (typeof raw.category !== 'string' || !CATEGORIES.includes(raw.category)) return null;
  const category = raw.category as Category;

  const estimatedMinutes = intInRange(
    raw.estimatedMinutes,
    PLAN_DRAFT_LIMITS.minMinutes,
    PLAN_DRAFT_LIMITS.maxMinutes,
  );
  if (estimatedMinutes === null) return null;

  const difficulty: PlanDraftDifficulty =
    typeof raw.difficulty === 'string' && DIFFICULTIES.includes(raw.difficulty)
      ? (raw.difficulty as PlanDraftDifficulty)
      : 'standard';

  // 「沒有期間」與「期間是 5000 天」是兩件事。前者正常（孩子沒講），
  // 後者代表這一輪的理解整個壞掉 —— 靜靜當成沒講的話，會留下一份
  // 建立在明顯錯誤上、但看起來完全正常的草稿。
  const durationDaysGiven = raw.durationDays !== null && raw.durationDays !== undefined;
  const durationDays = durationDaysGiven
    ? intInRange(
        raw.durationDays,
        PLAN_DRAFT_LIMITS.minDurationDays,
        PLAN_DRAFT_LIMITS.maxDurationDays,
      )
    : null;
  if (durationDaysGiven && durationDays === null) return null;

  return {
    planTitle,
    planSummary,
    completionDescription,
    category,
    categoryReason: text(raw.categoryReason, PLAN_DRAFT_LIMITS.maxReasonLength) ?? '',
    estimatedMinutes,
    difficulty,
    outcomeBased: raw.outcomeBased === true,
    needsClarification: raw.needsClarification === true,
    clarificationQuestion: text(raw.clarificationQuestion, PLAN_DRAFT_LIMITS.maxReasonLength),
    durationDays,
    suggestedCadence: normalizeSuggestedCadence(raw.suggestedCadence),
  };
}

// ---------------------------------------------------------------------------
// 組裝
// ---------------------------------------------------------------------------

/**
 * 執行形式由節奏與期間**推導**，不問模型。
 *
 * 「長期」不是第五個類別，它是執行形式 —— 混進 category 的話，
 * 一個兩週的閱讀挑戰會變成一種新的任務種類。
 */
export function resolveDurationType(
  cadence: PlanDraftCadence | null,
  durationDays: number | null,
): PlanDraftDurationType {
  if (cadence?.mode === 'one_time') return 'one_time';
  if (durationDays !== null) return 'long_term';
  if (cadence === null) return 'recurring';
  return 'recurring';
}

/** 規則引擎的 durationType 詞彙（single / recurring / long_term）。 */
export function toEligibilityDurationType(
  durationType: PlanDraftDurationType,
): 'single' | 'recurring' | 'long_term' {
  return durationType === 'one_time' ? 'single' : durationType;
}

/**
 * 回饋方式**只看規則引擎**，不看孩子的期待。
 *
 * 孩子說「如果適合，也可以用成長幣鼓勵我」是一個願望，不是資格。
 * 把它接到 reward_policy 上等於讓孩子自己決定發不發幣。
 */
export function resolveRewardPolicy(gate: EligibilityResult): PlanDraftRewardPolicy {
  if (gate.rewardMode === 'family_contribution') return 'family_contribution';
  if (gate.rewardMode === 'life_progress') return 'progress_only';
  // C / D：閘門放行才是 coin_eligible。被擋下時只提進度，不承諾幣。
  return gate.coinEnabled && !gate.gateBlocked ? 'coin_eligible' : 'progress_only';
}

export type PlanDraftPricing =
  | { status: 'priced'; coins: number; policyVersion: string }
  | { status: 'unpriced'; policyVersion: string }
  | { status: 'coin_disabled'; policyVersion: string }
  | { status: 'gated'; policyVersion: string };

/**
 * 把模型的理解、閘門結果與幣值結果組成一份 Plan Draft。
 *
 * ⚠️ `childCadence` 一定贏。這是「AI 不可以默默改掉孩子的選擇」在程式裡的樣子 ——
 *    不是 prompt 裡的一句請求，是這裡的一行 if。
 */
export function composePlanDraft(args: {
  input: ChildProposalPlanDraftInput;
  understanding: PlanDraftUnderstanding;
  gate: EligibilityResult;
  pricing: PlanDraftPricing;
  model: string;
}): ChildProposalPlanDraft {
  const { input, understanding, gate, pricing, model } = args;

  const cadence = input.cadence ?? understanding.suggestedCadence ?? null;
  const cadenceSource: ChildProposalPlanDraft['cadenceSource'] = input.cadence
    ? 'child'
    : understanding.suggestedCadence
      ? 'ai_suggested'
      : 'none';

  const durationType = resolveDurationType(cadence, understanding.durationDays);
  const rewardPolicy = resolveRewardPolicy(gate);

  // 幣值只在規則引擎真的算出數字時才有。模型從頭到尾沒有機會碰這一欄。
  const aiSuggestedCoinAmount =
    pricing.status === 'priced' && rewardPolicy === 'coin_eligible' ? pricing.coins : null;

  return {
    schemaVersion: CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION,

    planTitle: understanding.planTitle,
    planSummary: understanding.planSummary,
    completionDescription: understanding.completionDescription,

    cadence,
    cadenceSource,

    estimatedMinutes: understanding.estimatedMinutes,
    durationType,
    durationDays: understanding.durationDays,

    category: understanding.category,
    categoryReason: understanding.categoryReason,
    difficulty: understanding.difficulty,

    rewardPolicy,
    rewardEligibility: gate.coinEnabled && !gate.gateBlocked ? 'allowed' : 'blocked',
    rewardPolicyVersion: pricing.policyVersion,
    pricingStatus: pricing.status,
    aiSuggestedCoinAmount,

    blockingIssues: gate.blockingIssues,
    requiresConfirmation: gate.requiresConfirmation,
    warnings: gate.warnings,
    clarificationQuestion: gate.clarificationQuestion ?? null,

    model,
  };
}
