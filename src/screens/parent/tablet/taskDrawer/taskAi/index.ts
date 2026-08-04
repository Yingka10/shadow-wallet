// Shadow Wallet · Parent Tablet — AI 任務調整建議
//
// 邊界在 docs/TASK_AI_RECOMMENDATION_CONTRACT.md。三句話版本：
//   規則引擎決定不可違反的政策，AI 只提可選建議，家長逐項決定。
//
// 接線（服務模式、live adapter、狀態機）見 docs/TASK_AI_DRAWER_INTEGRATION.md。

export * from './types';
export { collectTaskRuleFindings, hasBlockingFinding, blockingFindings, warningFindings } from './ruleFindings';
export { buildTaskAiInput, type BuildTaskAiInputArgs } from './buildTaskAiInput';
export { validateTaskAiRecommendationResult } from './validateTaskAiResult';
export {
  applyTaskAiSuggestion,
  undoTaskAiSuggestion,
  readAiField,
  type AiFieldValue,
  type AppliedSuggestionRecord,
  type ApplyFailureReason,
  type ApplyTaskAiSuggestionResult,
} from './applyTaskAiSuggestion';
export {
  FakeTaskAiRecommendationService,
  UnavailableTaskAiRecommendationService,
  type FakeAiBehaviour,
} from './fakeTaskAiRecommendationService';

// ── 第八階段 B2B：接線 ──────────────────────────────────────────────────
export {
  isAbortError,
  taskAiClientFromService,
  type TaskAiClientOutcome,
  type TaskAiRecommendationClient,
} from './taskAiClient';
export {
  LiveTaskAiRecommendationClient,
  TASK_AI_FUNCTION_NAME,
  type InvokeTaskAiFunction,
} from './liveTaskAiRecommendationClient';
export {
  resolveTaskAiServiceMode,
  taskAiServiceModeLabel,
  type TaskAiServiceMode,
  type TaskAiServiceModeReason,
  type TaskAiServiceModeResolution,
} from './taskAiServiceMode';
export { createTaskAiInputSignature } from './taskAiInputSignature';
export {
  aiFieldValuesEqual,
  canApplyItem,
  canUndoItem,
  initialItems,
  markItemApplied,
  markItemKept,
  markItemUndone,
  refreshItemStates,
  userFacingUnavailable,
  type TaskAiItemState,
  type TaskAiReviewState,
  type TaskAiSuggestionItem,
  type UserFacingUnavailableReason,
} from './taskAiReviewState';
export { TASK_AI_COPY, retryAfterText } from './taskAiCopy';
