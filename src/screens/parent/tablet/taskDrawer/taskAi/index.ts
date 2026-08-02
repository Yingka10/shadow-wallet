// Shadow Wallet · Parent Tablet — AI 任務調整建議
//
// 邊界在 docs/TASK_AI_RECOMMENDATION_CONTRACT.md。三句話版本：
//   規則引擎決定不可違反的政策，AI 只提可選建議，家長逐項決定。

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
