// GrowBook — P1-A4A Parent Direct Agreement
//
// 家長同意孩子已經想清楚、而且完整的安排 → 家庭共同約定版本 ＋ 正式任務。
//
// ⚠️ 這是 P0 Direct Confirm 的 sibling，不是它的擴充。legacy 一個字都沒改。

export {
  CONFIRM_CHILD_PLANNING_PROPOSAL_RPC,
  type BuildChildPlanConfirmCommandResult,
  type ChildPlanConfirmBlock,
  type ChildPlanConfirmability,
  type ConfirmChildPlanningProposalCommand,
  type ConfirmChildPlanningProposalResult,
  type ConfirmChildPlanningProposalSuccess,
} from './types';
export {
  childPlanConfirmability,
  childPlanSharedDecisions,
  isChildPlanDirectConfirmable,
  isChildPlanningPlanVersion,
} from './isChildPlanDirectConfirmable';
export {
  buildChildPlanConfirmCommand,
  buildChildPlanRewardDecision,
  type BuildChildPlanRewardDecisionResult,
} from './buildChildPlanConfirmCommand';
export { resolveConfirmRoute, type ProposalConfirmRoute } from './resolveConfirmRoute';
