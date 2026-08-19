// GrowBook — P1-A3 Formal Plan Bridge
//
// 孩子確認過的規劃 → child-authored 正式 Plan Version ＋ proposal proposed。
//
// ⚠️ 這裡不做家長最終確認、不建任務、不發幣。停在 proposed。

export {
  PUBLISH_CHILD_CONFIRMED_PLAN_SCHEMA_VERSION,
  REQUIRES_PARENT_DECISION_VALUES,
  type ChildPlanEnrichment,
  type PublishChildConfirmedPlanCommand,
  type PublishFormalPlanFailure,
  type PublishFormalPlanFailureCode,
  type PublishFormalPlanResult,
  type PublishFormalPlanSuccess,
  type RequiresParentDecision,
} from './types';
export { toChildPlanEnrichment } from './toChildPlanEnrichment';
export {
  ChildFormalPlanService,
  PUBLISH_CHILD_CONFIRMED_PLAN_RPC,
  type FormalPlanRpc,
  type PublishChildConfirmedPlanArgs,
} from './formalPlanService';
export {
  publishChildConfirmedPlan,
  type FormalPlanBridgePort,
  type PublishChildConfirmedPlanDeps,
  type PublishChildConfirmedPlanInput,
} from './publishChildConfirmedPlan';
