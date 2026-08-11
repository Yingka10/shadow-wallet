// Shadow Wallet — Child Proposal → AI Plan Draft 的 App 端契約（P0-3）
//
// ─────────────────────────────────────────────────────────────────────────
// App **只認 GrowBook 的契約**。
//
// 這一層底下是 ai-proxy 的 childProposalPlanDraft handler，它底下現在是
// Gemini。App 不知道第二件事：沒有 model chain、沒有 prompt、沒有 API key。
// 換 provider 時只該改 Edge Function。
//
// 型別在 App 與 Function 各有一份實作，由 planDraftContractParity.test.ts
// 釘住兩者一致 —— 與 taskAi 的 contractParity 同一個理由：Deno 部署不了
// RN 的 module graph，jest 也解析不了 Deno 的 import attributes。
//
// ⚠️ 幣值只有一個入口：`aiSuggestedCoinAmount`，而且它是**規則引擎**
//    （rewardEligibility → coinPolicy）算出來的，不是模型講的。
//    它永遠不是最終值 —— 最終值是 confirmed_coin_amount，由家長確認時
//    從 tasks 複製。兩者不要互相代入。
// ─────────────────────────────────────────────────────────────────────────

import type {
  ChildProposalCadenceMode,
  ChildProposalRewardEligibility,
  ChildProposalRewardPolicy,
  ChildProposalSource,
  ChildRewardPreference,
} from '../types';

export const CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION = 1;

/** ai-proxy 的 request type。改版會是另一個字串，這裡是唯一寫出它的地方。 */
export const CHILD_PROPOSAL_PLAN_DRAFT_REQUEST_TYPE = 'childProposalPlanDraft';

export type PlanDraftAgeGroup = '2-4' | '4-6' | '6-9' | '9-12';

/**
 * 送進 AI 的節奏。
 *
 * 刻意**不含** plan_schedule —— 那是 P0-5 之後才會出現的形式，
 * 現在讓它進得來只會讓一條沒有實作的路徑先累積資料。
 */
export type PlanDraftCadenceMode = Exclude<ChildProposalCadenceMode, 'plan_schedule'>;

export type PlanDraftCadence = {
  mode: PlanDraftCadenceMode;
  weeklyFrequency?: number;
  /** 0=週日 … 6=週六。 */
  days?: number[];
};

/**
 * AI 的輸入 —— 一筆**真實** Proposal 的實質內容。
 *
 * 這裡沒有 childId、familyId、暱稱或生日：模型判斷用不到身分，
 * 而少送一個欄位就少一個外流面。年齡只送分級。
 */
export type ChildProposalPlanDraftInput = {
  schemaVersion: typeof CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION;
  ageGroup: PlanDraftAgeGroup;
  /** 孩子的原話。**送出去也只是被讀，永遠不會被覆寫回 proposal。** */
  childOriginalGoal: string;
  childOriginalMotivation: string | null;
  proposalSource: ChildProposalSource;
  /** null = 孩子選了「我還不知道」。這時 AI 才可以提節奏建議。 */
  cadence: PlanDraftCadence | null;
  preferredTime: string | null;
  childRewardPreference: ChildRewardPreference;
};

export type PlanDraftDifficulty = 'easy' | 'standard' | 'hard';
export type PlanDraftDurationType = 'one_time' | 'recurring' | 'long_term';
export type PlanDraftPricingStatus = 'priced' | 'unpriced' | 'coin_disabled' | 'gated';
export type PlanDraftCategory = 'A' | 'B' | 'C' | 'D';

/** 這份草稿的節奏是誰決定的。孩子選過就一定是 child。 */
export type PlanDraftCadenceSource = 'child' | 'ai_suggested' | 'none';

export type ChildProposalPlanDraft = {
  schemaVersion: typeof CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION;

  planTitle: string;
  planSummary: string;
  /**
   * 做一次算完成什麼。
   *
   * 目前 child_proposal_plan_versions **沒有**這一欄，所以它存在
   * ai_snapshot 裡等 P0-5 取用（正式任務才有 completion_description）。
   * 這是刻意的：不為了一個還沒有人讀的欄位改 schema。
   */
  completionDescription: string;

  cadence: PlanDraftCadence | null;
  cadenceSource: PlanDraftCadenceSource;

  estimatedMinutes: number;
  durationType: PlanDraftDurationType;
  durationDays: number | null;

  category: PlanDraftCategory;
  categoryReason: string;
  difficulty: PlanDraftDifficulty;

  rewardPolicy: ChildProposalRewardPolicy;
  rewardEligibility: ChildProposalRewardEligibility;
  rewardPolicyVersion: string;
  pricingStatus: PlanDraftPricingStatus;
  /** 規則引擎算得出數字才有值；目前 coin-policy 是 placeholder，所以通常是 null。 */
  aiSuggestedCoinAmount: number | null;

  blockingIssues: string[];
  requiresConfirmation: string[];
  warnings: string[];
  clarificationQuestion: string | null;

  /** 真正回答的 model。稽核用 —— MODEL_CHAIN 會 fallback，不能寫死首選。 */
  model: string;
};

/**
 * 為什麼這一輪沒有草稿。
 *
 * 每一個都代表「Proposal 完全沒事，只是現在沒有 AI 整理」，
 * 沒有任何一個代表「提案失敗」。
 */
export type PlanDraftUnavailableReason =
  | 'TIMEOUT'
  /** Function 回來的東西 App 看不懂（版本不合、代理改過、部署到一半）。 */
  | 'INVALID_RESPONSE'
  /** Function 說：模型回的東西**它**看不懂。與上一個分開記，診斷才不會找錯地方。 */
  | 'INVALID_AI_OUTPUT'
  | 'SERVICE_ERROR'
  | 'SERVICE_DISABLED'
  | 'INVALID_INPUT';

export type ChildProposalPlanDraftResult =
  | {
      status: 'draft';
      schemaVersion: typeof CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION;
      draft: ChildProposalPlanDraft;
    }
  | {
      status: 'unavailable';
      schemaVersion: typeof CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION;
      reason: PlanDraftUnavailableReason;
    };

/** 與 Function 端 PLAN_DRAFT_LIMITS 同值，由 parity 測試釘住。 */
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
} as const;

/**
 * 呼叫 AI 的那一層。
 *
 * 抽成介面而不是直接吃 supabase client：orchestrator 因此可以在 jest 裡
 * 完整測試（含逾時、亂回、服務掛掉），不需要網路也不會花到配額。
 */
export interface ChildProposalPlanDraftClient {
  requestPlanDraft(
    input: ChildProposalPlanDraftInput,
    signal?: AbortSignal,
  ): Promise<ChildProposalPlanDraftResult>;
}
