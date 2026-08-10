// Shadow Wallet · Parent Tablet — AI 任務調整建議的契約
//
// ─────────────────────────────────────────────────────────────────────────
// 這個檔案的核心是一句話：**規則歸規則，建議歸建議。**
//
// 規則引擎說「家庭參與不能發成長幣」——那是政策，不能被討論、不能被略過，
// 也不該由一個會胡說的東西產生。AI 說「這個完成標準有點模糊」——那是建議，
// 家長可以採用、可以改、可以直接不理。
//
// 兩者混在一起的後果是具體的：如果 AI 能產生 blocking finding，
// 一次幻覺就會擋住家長建立任務；如果規則能被當成建議略過，
// 「不發幣」這種承諾就不再是承諾。
//
// 所以型別上就分開：TaskRuleFinding 只由 deterministic 規則引擎產生，
// TaskAiSuggestion 只能落在 allowlist 的欄位上，兩者不共用任何型別。
// ─────────────────────────────────────────────────────────────────────────

import type {
  CompletionPolicy,
  DurationType,
  PurposeCategory,
  RewardPolicy,
  TaskSource,
} from '../taskCatalog';
import type { TaskEditorKind } from '../taskDraft';

// ---------------------------------------------------------------------------
// 規則檢查結果（deterministic，AI 不得產生）
// ---------------------------------------------------------------------------

/** 規則可以指向的欄位。與 AI 的 allowlist 是兩份，故意不共用。 */
export type AllowedRuleFieldPath =
  | 'rewardPolicy'
  | 'purposeCategory'
  | 'title'
  | 'completionDescription'
  | 'sessionMinutes'
  | 'durationDays'
  | 'reviewAfterDays'
  | 'responsibilityItems'
  | 'milestones'
  | 'supportSteps';

export type TaskRuleFinding = {
  id: string;
  /**
   * blocking：不可確認建立，**也不可被拒絕或略過**。
   * warning：可以建立，但要向家長講清楚。
   */
  severity: 'blocking' | 'warning';
  code: string;
  fieldPath?: AllowedRuleFieldPath;
  message: string;
  source: 'task_policy' | 'reward_policy' | 'safety_policy';
};

// ---------------------------------------------------------------------------
// 送給 AI 的東西
// ---------------------------------------------------------------------------

/**
 * AI **不可以**修改的欄位。
 *
 * 這份清單會原封不動送進 input 的 `immutablePolicies.blockedFields` ——
 * 不是因為相信 AI 會遵守（不能相信），而是為了讓「它被告知過」這件事
 * 可稽核。真正的執行在 validator 與 apply：那兩層不接受這些路徑。
 */
export type AllowedImmutableField =
  | 'purposeCategory'
  | 'durationType'
  | 'source'
  | 'rewardPolicy'
  | 'completionPolicy'
  | 'childId'
  | 'familyId'
  | 'presetFamilyId'
  | 'presetVariantId'
  | 'commandSchemaVersion'
  | 'taskPolicyVersion'
  | 'rewardPolicyVersion'
  | 'presetCatalogVersion'
  | 'coinAmount'
  | 'rewardDecision'
  | 'safetyPolicy'
  | 'familyContributionEligibility'
  | 'originalExpectation';

export const IMMUTABLE_FIELDS: readonly AllowedImmutableField[] = [
  'purposeCategory',
  'durationType',
  'source',
  'rewardPolicy',
  'completionPolicy',
  'childId',
  'familyId',
  'presetFamilyId',
  'presetVariantId',
  'commandSchemaVersion',
  'taskPolicyVersion',
  'rewardPolicyVersion',
  'presetCatalogVersion',
  'coinAmount',
  'rewardDecision',
  'safetyPolicy',
  'familyContributionEligibility',
  // 家長寫下的原始期待是這張草稿的來源，不是可以被優化的文案。
  // AI 可以建議「完成標準」怎麼寫得更清楚，但不能改寫家長想要什麼。
  'originalExpectation',
] as const;

export type TaskAiRecommendationInput = {
  schemaVersion: 1;

  childContext: {
    /** 分級（`6-9`），不是生日、不是年齡。 */
    ageGroup: string;
  };

  taskContext: {
    editorKind: TaskEditorKind;
    purposeCategory: PurposeCategory;
    durationType: DurationType;
    source: TaskSource;
    rewardPolicy: RewardPolicy;
    completionPolicy: CompletionPolicy;
  };

  parentIntent: {
    originalExpectation: string;
  };

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
    purposeCategory: PurposeCategory;
    rewardPolicy: RewardPolicy;
    blockedFields: AllowedImmutableField[];
  };
};

// ---------------------------------------------------------------------------
// AI 回傳的東西
// ---------------------------------------------------------------------------

/**
 * AI 可以指向的欄位 —— 嚴格 allowlist，不接受任意字串路徑。
 *
 * 這裡刻意用「語意名稱」而不是 draft 的實際欄位名：
 * 同一件事在五種 editor 上叫不同名字（completionDescription /
 * successDescription / contributionDescription），
 * 讓 AI 去記那些差異只會增加它出錯的面。
 * 對應關係在 applyTaskAiSuggestion 的 exhaustive switch 裡解。
 */
export type AllowedAiFieldPath =
  | 'title'
  | 'completionDescription'
  | 'taskDetails'
  | 'scopeDescription'
  | 'notes'
  | 'sessionMinutes'
  | 'durationDays'
  | 'weeklyFrequency'
  | 'reviewAfterDays'
  | 'supportSteps'
  | 'milestones'
  | 'responsibilityItems';

/** 每個 path 接受的值型別。validator 用它比對，apply 用它決定怎麼寫。 */
export const AI_FIELD_VALUE_KIND = {
  title: 'string',
  completionDescription: 'string',
  taskDetails: 'string',
  scopeDescription: 'string',
  notes: 'string',
  sessionMinutes: 'number',
  durationDays: 'number',
  weeklyFrequency: 'number',
  reviewAfterDays: 'number',
  supportSteps: 'string[]',
  milestones: 'string[]',
  responsibilityItems: 'string[]',
} as const satisfies Record<AllowedAiFieldPath, 'string' | 'number' | 'string[]'>;

export const ALLOWED_AI_FIELD_PATHS = Object.keys(
  AI_FIELD_VALUE_KIND,
) as AllowedAiFieldPath[];

export type TaskAiSuggestionKind =
  | 'clarify_title'
  | 'clarify_completion'
  | 'reduce_scope'
  | 'adjust_duration'
  | 'adjust_frequency'
  | 'adjust_session_time'
  | 'add_support_step'
  | 'adjust_review_timing'
  | 'preserve_child_choice'
  | 'split_milestone'
  | 'improve_feedback_language';

export const ALLOWED_SUGGESTION_KINDS: readonly TaskAiSuggestionKind[] = [
  'clarify_title',
  'clarify_completion',
  'reduce_scope',
  'adjust_duration',
  'adjust_frequency',
  'adjust_session_time',
  'add_support_step',
  'adjust_review_timing',
  'preserve_child_choice',
  'split_milestone',
  'improve_feedback_language',
] as const;

export type TaskAiExpectedBenefit =
  | 'clearer_expectation'
  | 'more_age_appropriate'
  | 'more_achievable'
  | 'more_autonomy'
  | 'easier_to_review'
  | 'safer';

export const ALLOWED_BENEFITS: readonly TaskAiExpectedBenefit[] = [
  'clearer_expectation',
  'more_age_appropriate',
  'more_achievable',
  'more_autonomy',
  'easier_to_review',
  'safer',
] as const;

export type TaskAiConfidence = 'low' | 'medium' | 'high';

export type TaskAiSuggestion = {
  id: string;
  kind: TaskAiSuggestionKind;
  fieldPath: AllowedAiFieldPath;
  currentValue: string | number | string[] | null;
  suggestedValue: string | number | string[];
  rationale: string;
  expectedBenefit: TaskAiExpectedBenefit;
  confidence: TaskAiConfidence;
};

/**
 * 為什麼 `NOT_ELIGIBLE` 與 `SERVICE_DISABLED` 是 reason 而不是新的 status：
 *
 * `TaskAiSection` 對 status 做窮舉，多一個 status 就要動 UI，
 * 而 UI 的分支越多、家長越搞不清楚「AI 到底出了什麼事」。
 * 這兩件事對家長的意義和其他 unavailable 完全一樣 ——
 * **沒有建議，但不影響任務建立** —— 所以放在同一個 status 底下。
 *
 * 分開記的價值在 log 與稽核：「這種任務第一版不開放」和「服務掛了」
 * 需要不同的處置，混成一個 SERVICE_ERROR 會讓前者看起來像故障，
 * 於是有人去修一個沒有壞的東西。
 *
 * ⚠️ `NOT_ELIGIBLE` 不是錯誤。它是預期中的正常結果。
 */
export type TaskAiUnavailableReason =
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'SERVICE_ERROR'
  | 'UNSAFE_OUTPUT'
  | 'NOT_ELIGIBLE'
  | 'SERVICE_DISABLED';

export type TaskAiRecommendationResult =
  | {
      status: 'suggestions';
      schemaVersion: 1;
      summary: string;
      suggestions: TaskAiSuggestion[];
    }
  | {
      status: 'no_change';
      schemaVersion: 1;
      summary: string;
      suggestions: [];
    }
  | {
      status: 'unavailable';
      schemaVersion: 1;
      reason: TaskAiUnavailableReason;
      suggestions: [];
    };

// ---------------------------------------------------------------------------
// 上限
// ---------------------------------------------------------------------------

/**
 * 長度與數量上限。
 *
 * 不只是為了畫面：一個沒有上限的 rationale 可以塞進整篇文章，
 * 而家長會讀不完就直接按採用 —— 那等於沒有審核。
 */
export const AI_LIMITS = {
  maxSuggestions: 5,
  maxSummaryLength: 200,
  maxRationaleLength: 200,
  maxTextValueLength: 200,
  maxListItems: 8,
  maxListItemLength: 100,
  /** 分鐘、天數這類數值的合理範圍，超出就是幻覺。 */
  maxMinutes: 180,
  maxDurationDays: 365,
  maxWeeklyFrequency: 7,
  maxReviewAfterDays: 365,
} as const;

// ---------------------------------------------------------------------------
// 家長對每一項建議的處置
// ---------------------------------------------------------------------------

export type AiSuggestionDecision = 'pending' | 'applied' | 'rejected' | 'edited';

// ---------------------------------------------------------------------------
// 服務介面
// ---------------------------------------------------------------------------

export interface TaskAiRecommendationService {
  recommend(
    input: TaskAiRecommendationInput,
    signal?: AbortSignal,
  ): Promise<TaskAiRecommendationResult>;
}
