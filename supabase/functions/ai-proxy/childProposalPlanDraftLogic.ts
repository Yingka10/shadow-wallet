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

// 2：新增 payoutType / pricing / sessionCoinReference（payout-aware pricing）。
// 舊版一端解析新契約、或反過來，一律回 unavailable，不要半驗證通過。
export const CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION = 2;

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

/**
 * 這件事「在做什麼」的封閉列舉。
 *
 * 存在的理由只有一個：App 端要用它組出**正式的完成標準**，而正式的完成標準
 * 不可以照抄模型的自由文字。讓模型從一個固定清單裡挑一個，句子由我們自己寫 ——
 * 這樣「完成一次約定的閱讀時段」是我們的句型，不是模型那天剛好寫得好。
 *
 * 認不出來時退回 `other`，不是猜一個最像的。
 */
export type PlanDraftActivityKind =
  | 'reading'
  | 'practice'
  | 'exercise'
  | 'creating'
  | 'learning'
  | 'helping'
  | 'other';

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
  /** 封閉列舉。App 端用它組正式的完成標準。 */
  activityKind: PlanDraftActivityKind;
  /**
   * 孩子下一次最小可做的步驟。
   *
   * 名字裡的 Suggestion 是刻意的：它是**建議**，要通過 App 端的長度與內容
   * 驗證才會成為 next_step。過不了就是 null —— 不生成假內容。
   */
  nextStepSuggestion: string | null;
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

/**
 * 時間分級 band id。跟 coinPolicy.ts 的 BandId 是同一組值，但**獨立宣告**——
 * 這個檔案刻意不 import coinPolicy.ts（它有 `with { type: 'json' }` import
 * attribute，jest 解析不了），所以型別在這裡自己重宣告一份，跟
 * PlanDraftDifficulty 是同一個理由。
 */
export type PlanDraftBandId = '5-10' | '11-20' | '21-30' | '31-45' | '46+';

// ---------------------------------------------------------------------------
// payout-aware pricing
// ---------------------------------------------------------------------------
//
// 兩件事分開講：
//
//   pricingStatus（上面那個列舉）回答「這一次投入，規則引擎算不算得出價」。
//   PricingResult／payoutType 回答「算出來的這個 session 價，能不能直接當成
//   這份計畫最終會發的金額」。
//
// 兩者正交，不能互相推導 —— 跟 claim_period 不能推導 payout_basis 是同一個
// 錯誤模式（見 docs/CLAIM_PERIOD_VS_PAYOUT_BASIS.md）。
//
// payoutType 目前**永遠是 'per_completion'**：這是目前唯一有實作結算路徑的
// 方式，per_period／per_milestone／final_completion 都還沒有定價政策
// （PRODUCT_POLICY_GAP）。**不從 cadence／durationType 推導**——demo 主線
// 「兩週讀完這本書」用的是 weekly_frequency 節奏，卻仍然必須是
// per_completion，證明 cadence 推不出 payoutType。之後如果產品真的決定了
// per_period 定價政策，這裡才會有第二個值，而且會是一個新的、顯式的輸入，
// 不是從既有欄位反推出來的。

/** 結算基準：錢包因為什麼事件而改變。目前只有 per_completion 會被產出。 */
export type PayoutType = 'per_completion' | 'per_period' | 'per_milestone' | 'final_completion';

/**
 * 算出這個 session 價的依據。稽核用——半年後要回答「這個數字怎麼來的」，
 * 答案都在這裡，不用回去猜當時的 coin-policy 版本或輸入。
 */
export type PricingBasis = {
  policyVersion: string;
  ageGroup: AgeGroup;
  taskType: 'C' | 'D';
  band: PlanDraftBandId;
  difficulty: PlanDraftDifficulty;
  estimatedMinutes: number;
  /** 固定值，標示這不是模型吐出來的數字。 */
  computedFrom: 'deterministic';
};

/**
 * payout-aware 的定價結果。**只有 per_completion 這個分支拿得到
 * finalRewardCoins**——其他分支在型別上就沒有這個欄位，所以
 * 「session 價 × 次數」這種寫法在編譯期就不可能表達，不必靠 review 抓。
 */
export type PricingResult =
  | {
      payoutType: 'per_completion';
      status: 'resolved';
      finalRewardCoins: number;
      sessionCoinReference: number;
      basis: PricingBasis;
    }
  | {
      payoutType: 'per_period';
      status: 'session_reference_only';
      sessionCoinReference: number;
      gapCode: 'PERIOD_PRICING_POLICY_GAP';
      basis: PricingBasis;
    }
  | {
      payoutType: 'per_milestone' | 'final_completion';
      status: 'policy_gap';
      sessionCoinReference: number;
      gapCode: 'MILESTONE_PRICING_POLICY_GAP';
      basis: PricingBasis;
    };

export type ChildProposalPlanDraft = {
  schemaVersion: typeof CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION;

  planTitle: string;
  planSummary: string;
  /**
   * 模型寫的完成說明。
   *
   * ⚠️ 這是 **AI candidate / 稽核證據**，不是正式的完成標準。
   *    正式的那一個由 App 端的 deterministic transformer 依 activityKind
   *    組出來（見 canonicalPlanFields.ts）—— 不照抄這一段。
   */
  completionDescription: string;
  activityKind: PlanDraftActivityKind;
  /** 建議的下一步。要通過驗證才會成為 next_step。 */
  nextStepSuggestion: string | null;

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

  /** 目前恆為 'per_completion'。見上方 payout-aware pricing 說明。 */
  payoutType: PayoutType;
  /** null = 沒有 session price 可算（不發幣／unpriced/gated/coin_disabled）。 */
  pricing: PricingResult | null;
  /** 一次投入的參考值。**不是**這份計畫最終會發的金額——那個只有
   *  payoutType 是 per_completion 時才等於它，見 pricing.status。 */
  sessionCoinReference: number | null;
  /** @deprecated 用 sessionCoinReference。名稱讓人誤以為是「AI 決定的
   *  金額」或「最終發放金額」，兩者都不是。內部一律等於 sessionCoinReference。 */
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
  maxNextStepLength: 40,
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

/**
 * 這一支給模型的預算，覆蓋 gemini.ts 的 8 秒預設。
 *
 * 8 秒是給「回一個分類代號」那種呼叫的。這裡要模型讀完孩子的原話、
 * 判斷類別與難度、再回一整包結構化 JSON —— 2026-08-11 的 staging 驗收
 * 實測穩定超過 8 秒，於是**每一次**都逾時，而症狀是 SERVICE_ERROR，
 * 看起來像服務壞掉而不是太慢。
 *
 * 上限來自 App 端的 PLAN_DRAFT_TIMEOUT_MS（20 秒）：要留餘裕讓這支
 * 在 client 放棄之前把結構化的 unavailable 回出去 —— 拿到 reason
 * 才分得出「模型太慢」與「模型亂寫」，client 端 abort 則兩者都看不出來。
 */
export const PLAN_DRAFT_GEMINI_TIMEOUT_MS = 15_000;

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
9. activityKind 從清單裡挑一個最接近的，不要自己造詞：
   reading（看書/閱讀）、practice（練習某項技能，例如樂器、單字）、exercise（身體活動）、
   creating（畫畫、寫作、做東西）、learning（學一個新東西）、helping（幫忙家裡）、other（都不像）。
10. nextStepSuggestion 寫「今天或下一次，最小可以做的一步」，${PLAN_DRAFT_LIMITS.maxNextStepLength} 字以內，
   要是一個孩子看完就知道現在要做什麼的動作。
   可以：「選一本想看的書，閱讀約 15 分鐘」。
   不可以：「讀完整本書」「養成閱讀習慣」（前者是結果，後者不是一個動作）。
   想不到具體的就給 null，**不要硬湊一句**。

類別定義（判斷「為什麼做」，不是判斷難度）：
A = 生活常規（刷牙、整理書包）
B = 家庭參與 / 家庭本分（倒垃圾、洗碗等固定家務）
C = 自主挑戰（孩子主動提出、明顯超出本分的額外貢獻）
D = 學習與技能（練習、學習新東西、有進步軌跡）

planSummary 用溫暖的白話寫 2 句以內，要講得出孩子原本想做什麼、以及先用什麼節奏開始。不要出現「任務」「審核」「批准」「系統」這些字。

只回傳 JSON，前後不要有其他文字：
{"planTitle":"兩週閱讀挑戰","planSummary":"...","completionDescription":"完成一次約定的閱讀時段","activityKind":"reading","nextStepSuggestion":"選一本想看的書，閱讀約 15 分鐘","category":"D","categoryReason":"40字內","estimatedMinutes":15,"difficulty":"standard","outcomeBased":false,"needsClarification":false,"clarificationQuestion":null,"durationDays":14,"suggestedCadence":null}

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
export const ACTIVITY_KINDS: readonly PlanDraftActivityKind[] = [
  'reading',
  'practice',
  'exercise',
  'creating',
  'learning',
  'helping',
  'other',
];

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

  // 認不出來就是 other。挑一個「最像」的會讓完成標準寫出一句
  // 跟這件事沒關係的話，而那句話會變成正式任務的完成標準。
  const activityKind: PlanDraftActivityKind =
    typeof raw.activityKind === 'string'
      && (ACTIVITY_KINDS as readonly string[]).includes(raw.activityKind)
      ? (raw.activityKind as PlanDraftActivityKind)
      : 'other';

  return {
    planTitle,
    planSummary,
    completionDescription,
    activityKind,
    nextStepSuggestion: text(raw.nextStepSuggestion, PLAN_DRAFT_LIMITS.maxNextStepLength),
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
  | { status: 'priced'; coins: number; band: PlanDraftBandId; policyVersion: string }
  | { status: 'unpriced'; policyVersion: string }
  | { status: 'coin_disabled'; policyVersion: string }
  | { status: 'gated'; policyVersion: string };

/**
 * 把「這一次投入值多少幣」（PlanDraftPricing）跟 payoutType 組成
 * payout-aware 的定價結果。
 *
 * `rewardPolicy !== 'coin_eligible'` 或 session 價本身沒算出來，一律回
 * `null`——跟現有 `aiSuggestedCoinAmount` 的判斷條件一致，不變。
 *
 * payoutType 現階段只會是 'per_completion'（見上方型別區的說明），所以
 * 這裡只有第一個分支會被真的走到；其餘分支寫出來是為了讓型別完整、
 * 讓未來真的出現 per_period 時這個函式不用重寫，只是先天不會被觸發。
 */
export function buildPricingResult(args: {
  payoutType: PayoutType;
  pricing: PlanDraftPricing;
  rewardPolicy: PlanDraftRewardPolicy;
  ageGroup: AgeGroup;
  category: Category;
  difficulty: PlanDraftDifficulty;
  estimatedMinutes: number;
}): PricingResult | null {
  const { payoutType, pricing, rewardPolicy, ageGroup, category, difficulty, estimatedMinutes } = args;

  if (rewardPolicy !== 'coin_eligible' || pricing.status !== 'priced') return null;
  if (category !== 'C' && category !== 'D') return null;

  const basis: PricingBasis = {
    policyVersion: pricing.policyVersion,
    ageGroup,
    taskType: category,
    band: pricing.band,
    difficulty,
    estimatedMinutes,
    computedFrom: 'deterministic',
  };

  const sessionCoinReference = pricing.coins;

  switch (payoutType) {
    case 'per_completion':
      return {
        payoutType,
        status: 'resolved',
        finalRewardCoins: sessionCoinReference,
        sessionCoinReference,
        basis,
      };
    case 'per_period':
      return {
        payoutType,
        status: 'session_reference_only',
        sessionCoinReference,
        gapCode: 'PERIOD_PRICING_POLICY_GAP',
        basis,
      };
    case 'per_milestone':
    case 'final_completion':
      return {
        payoutType,
        status: 'policy_gap',
        sessionCoinReference,
        gapCode: 'MILESTONE_PRICING_POLICY_GAP',
        basis,
      };
  }
}

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

  // payoutType 目前恆為 'per_completion'——不從 cadence/durationType 推導。
  // 見上方 payout-aware pricing 說明與 docs/CLAIM_PERIOD_VS_PAYOUT_BASIS.md。
  const payoutType: PayoutType = 'per_completion';
  const pricingResult = buildPricingResult({
    payoutType,
    pricing,
    rewardPolicy,
    ageGroup: input.ageGroup,
    category: understanding.category,
    difficulty: understanding.difficulty,
    estimatedMinutes: understanding.estimatedMinutes,
  });
  const sessionCoinReference = pricingResult?.sessionCoinReference ?? null;
  // shim：舊欄位內部一律等於新欄位，不獨立計算。
  const aiSuggestedCoinAmount = sessionCoinReference;

  return {
    schemaVersion: CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION,

    planTitle: understanding.planTitle,
    planSummary: understanding.planSummary,
    completionDescription: understanding.completionDescription,
    activityKind: understanding.activityKind,
    nextStepSuggestion: understanding.nextStepSuggestion,

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

    payoutType,
    pricing: pricingResult,
    sessionCoinReference,
    aiSuggestedCoinAmount,

    blockingIssues: gate.blockingIssues,
    requiresConfirmation: gate.requiresConfirmation,
    warnings: gate.warnings,
    clarificationQuestion: gate.clarificationQuestion ?? null,

    model,
  };
}
