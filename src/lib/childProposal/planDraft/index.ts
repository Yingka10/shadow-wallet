// Shadow Wallet — Child Proposal → AI Plan Draft（P0-3）
//
// 孩子的提案 → 既有 AI 基礎設施整理 → 一版 authored_by='ai' 的計畫版本。
//
// ⚠️ 這裡只產生**草稿**。不建立任務、不轉 active、不發幣、不碰錢包。
//    最終回饋由家長確認時決定（P0-5）。

export * from './types';
export {
  buildPlanDraftInput,
  planDraftRequestKey,
  toPlanDraftCadence,
  PLAN_DRAFT_REQUEST_KEY_PREFIX,
} from './buildPlanDraftInput';
export { planDraftUnavailable, validatePlanDraftResult } from './validatePlanDraftResult';
export {
  canonicalPlanFields,
  canonicalCompletionDescription,
  canonicalNextStep,
  canonicalProgressModel,
  canonicalPurposeCategory,
  validateNextStep,
  NEXT_STEP_MAX_LENGTH,
  NEXT_STEP_MIN_LENGTH,
  type CanonicalPlanFields,
  type NextStepRejection,
  type NextStepResult,
} from './canonicalPlanFields';
export {
  buildPlanDraftSnapshot,
  toAddPlanVersionCommand,
  PLAN_DRAFT_SNAPSHOT_VERSION,
  type PlanDraftSnapshot,
} from './toPlanVersionCommand';
export {
  generateChildProposalPlanDraft,
  generateChildProposalPlanDraftInBackground,
  type GeneratePlanDraftDeps,
  type PlanDraftOutcome,
  type PlanDraftPort,
} from './generatePlanDraft';
export {
  createPlanDraftClientSetup,
  planDraftClientSetup,
  LiveChildProposalPlanDraftClient,
  AI_PROXY_FUNCTION_NAME,
  PLAN_DRAFT_TIMEOUT_MS,
  type InvokeAiProxy,
  type PlanDraftClientSetup,
} from './planDraftClient';
