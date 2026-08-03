// task-ai-recommendation — Edge Function 端的契約型別
//
// ─────────────────────────────────────────────────────────────────────────
// 這個檔案是**這支 Function 唯一認識 GrowBook 領域概念的地方**。
//
// 它刻意不從 App 端 import 任何東西：`src/screens/.../taskAi/types.ts` 掛在
// React Native 的 module graph 上（taskCatalog → taskDraft → 元件 → .tsx），
// Deno 部署時會整串拉進來然後炸掉。
//
// 相對的，**資料只有一份**：allowlist、上限、timeout 全部來自 contract.json，
// 兩端讀同一個檔案。這裡只是替那些資料補上 Deno 端的型別。
// 漂移由 taskAi/__tests__/contractParity.test.ts 釘住。
//
// （同一個模式在 taskReward/coinPolicy.ts 已經跑在正式路徑上，理由見該檔檔頭。）
// ─────────────────────────────────────────────────────────────────────────

import contractJson from './contract.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// 從 JSON 補型別
// ---------------------------------------------------------------------------

export type ValueKind = 'string' | 'number' | 'string[]';

type ContractShape = {
  allowedFieldPaths: Record<string, ValueKind>;
  allowedSuggestionKinds: readonly string[];
  allowedBenefits: readonly string[];
  allowedConfidence: readonly string[];
  unavailableReasons: readonly string[];
  immutableFields: readonly string[];
  explicitlyForbiddenPaths: readonly string[];
  limits: {
    maxSuggestions: number;
    maxSummaryLength: number;
    maxRationaleLength: number;
    maxTextValueLength: number;
    maxListItems: number;
    maxListItemLength: number;
    maxMinutes: number;
    maxDurationDays: number;
    maxWeeklyFrequency: number;
    maxReviewAfterDays: number;
    maxIdLength: number;
  };
  timeouts: { geminiRequestMs: number; totalHandlerMs: number };
};

// JSON 的推導型別把每個鍵變成字面量，沒辦法用變數索引。
// 這裡做一次結構斷言（**不是 any**），之後全部型別安全。
export const CONTRACT = contractJson as unknown as ContractShape;

export const FIELD_KINDS = CONTRACT.allowedFieldPaths;
export const ALLOWED_FIELD_PATHS: readonly string[] = Object.keys(FIELD_KINDS);
export const LIMITS = CONTRACT.limits;
export const TIMEOUTS = CONTRACT.timeouts;

// ---------------------------------------------------------------------------
// 輸出
// ---------------------------------------------------------------------------

export type UnavailableReason = 'TIMEOUT' | 'INVALID_RESPONSE' | 'SERVICE_ERROR' | 'UNSAFE_OUTPUT';

export type Suggestion = {
  id: string;
  kind: string;
  fieldPath: string;
  currentValue: string | number | string[] | null;
  suggestedValue: string | number | string[];
  rationale: string;
  expectedBenefit: string;
  confidence: string;
};

export type RecommendationResult =
  | { status: 'suggestions'; schemaVersion: 1; summary: string; suggestions: Suggestion[] }
  | { status: 'no_change'; schemaVersion: 1; summary: string; suggestions: [] }
  | { status: 'unavailable'; schemaVersion: 1; reason: UnavailableReason; suggestions: [] };

export function unavailable(reason: UnavailableReason): RecommendationResult {
  return { status: 'unavailable', schemaVersion: 1, reason, suggestions: [] };
}

// ---------------------------------------------------------------------------
// 輸入
// ---------------------------------------------------------------------------
//
// 這些 enum 是 App 端 taskCatalog / taskDraft 的**值**，不是它們的型別。
// 抄一份而不是 import，理由見檔頭；catalogIntegrity 那邊改了這裡沒改的話，
// 會在 inputValidator 拒收真實請求時被發現 —— 不會安靜地放行。

export const AGE_GROUPS = ['2-4', '4-6', '6-9', '9-12'] as const;
export const EDITOR_KINDS = ['growth_plan', 'short_support', 'recurring', 'family_role', 'one_time'] as const;
export const PURPOSE_CATEGORIES = ['life_routine', 'family_participation', 'autonomous_challenge', 'learning_skill'] as const;
export const DURATION_TYPES = ['one_time', 'recurring', 'long_term'] as const;
export const TASK_SOURCES = ['parent', 'child', 'co_created', 'system'] as const;
export const REWARD_POLICIES = ['record_only', 'family_contribution', 'progress_only', 'coin_eligible', 'time_saving_eligible'] as const;
export const COMPLETION_POLICIES = ['complete_once', 'ongoing', 'plan_complete', 'review_and_continue', 'stabilize_and_exit'] as const;

export type AgeGroup = typeof AGE_GROUPS[number];

/**
 * 通過驗證的 input。
 *
 * 這個型別**只由 inputValidator 建構**，而且是逐欄白名單建構的 ——
 * 沒有任何一條路徑可以把 raw body 直接變成它。這是「不要 spread 後送給
 * Gemini」在型別上的落實：想繞過去就得自己動手抄十幾個欄位，
 * 而那件事在 code review 裡看得見。
 */
export type ValidatedInput = {
  schemaVersion: 1;
  childContext: { ageGroup: AgeGroup };
  taskContext: {
    editorKind: string;
    purposeCategory: string;
    durationType: string;
    source: string;
    rewardPolicy: string;
    completionPolicy: string;
  };
  parentIntent: { originalExpectation: string };
  currentDraft: {
    title: string;
    completionDescription: string;
    estimatedMinutes?: number;
    scheduleSummary: string;
    durationDays?: number;
    reviewAfterDays?: number;
    selectedOptions: Record<string, string[]>;
    supportSteps?: string[];
    milestones?: string[];
    responsibilities?: string[];
  };
  immutablePolicies: {
    purposeCategory: string;
    rewardPolicy: string;
    blockedFields: string[];
  };
};

// ---------------------------------------------------------------------------
// 輸入的額外上限（輸出的上限在 contract.json）
// ---------------------------------------------------------------------------

export const INPUT_LIMITS = {
  /** 整包 body 的位元組上限。超過就是 client bug 或有人在灌 prompt。 */
  maxBodyBytes: 16_000,
  maxTextLength: 500,
  maxScheduleSummaryLength: 200,
  maxListItems: 12,
  maxListItemLength: 200,
  maxOptionGroups: 12,
  maxOptionValues: 12,
  maxOptionValueLength: 64,
  maxEstimatedMinutes: 600,
  maxDurationDays: 365,
  maxReviewAfterDays: 365,
} as const;
