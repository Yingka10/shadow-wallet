// GrowBook — Child Goal Planning contract（P1-A1）
//
// 這個 barrel 只匯出契約與純函式。它**沒有**匯出任何會改變 production
// 行為的東西：沒有 DB 存取、沒有畫面、也沒有掛進 Child Proposal 流程。
// 契約穩定之前，這個模組對 App 的其他部分應該是「可以 import，但沒有人
// 非 import 不可」。
//
// source of truth：docs/CHILD_GOAL_PLANNING_CONTRACT.md

export * from './types';
export * from './planGuards';
export * from './buildChildGoalPlanningInput';
export {
  childGoalPlanningUnavailable,
  validateChildGoalPlanningResult,
} from './validateChildGoalPlanningResult';
export {
  AI_PROXY_FUNCTION_NAME,
  CHILD_GOAL_PLANNING_TIMEOUT_MS,
  LiveChildGoalPlanningClient,
  childGoalPlanningClientSetup,
  createChildGoalPlanningClientSetup,
  type ChildGoalPlanningClientSetup,
  type InvokeAiProxy,
} from './childGoalPlanningClient';
export {
  generateChildGoalPlan,
  type ChildGoalPlanOutcome,
  type GenerateChildGoalPlanDeps,
} from './generateChildGoalPlan';
