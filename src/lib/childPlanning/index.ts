// GrowBook — Child Goal Planning contract（P1-A1 / P1-A2）
//
// 這個 barrel 匯出契約、純函式，以及 P1-A2 的 session 狀態機與持久化。
//
// 它**不認識 ChildProposal**，而且要保持這樣：兩者的接線住在畫面那一層
// 的 toPlanningRequest.ts。之後換 provider、或 planning 改接別的來源時，
// 要改的只有那一個檔案。
//
// source of truth：docs/CHILD_GOAL_PLANNING_CONTRACT.md

export * from './types';
export * from './planGuards';
export * from './buildChildGoalPlanningInput';
export * from './childPlanningSession';
export {
  CONFIRM_PLANNING_SESSION_RPC,
  ChildPlanningSessionService,
  RECORD_PLANNING_ROUND_RPC,
  START_PLANNING_SESSION_RPC,
  type ChildPlanningSessionFailure,
  type ChildPlanningSessionFailureCode,
  type ChildPlanningSessionResult,
  type ChildPlanningSessionSnapshot,
  type PlanningSessionRpc,
} from './childPlanningSessionService';
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
