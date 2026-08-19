export {
  fixedDayEvidence,
  hasAccumulationEvidence,
  hasLevelEvidence,
  resolveLongTermProgression,
  supportsAutomaticProgressAdvancement,
  supportsSessionCheckIn,
} from './progression';
export type { LongTermProgression } from './progression';

export {
  claimWindowCount,
  resolveLongTermCompletionAvailability,
} from './completionAvailability';
export type {
  CompletionRecord,
  LongTermCompletionAvailability,
  LongTermCompletionReason,
} from './completionAvailability';

export {
  buildWeeklyProgress,
  completionsThisWeek,
  taipeiWeekStart,
} from './weeklyProgress';
export type { LongTermWeeklyProgress } from './weeklyProgress';

export { resolveAgreedPreferredTime } from './agreedTime';
export type { AgreedPreferredTime } from './agreedTime';

export {
  isChildFormalPlanVersion,
  readAgreedReward,
  readChildConfirmedPlan,
  resolveChildFormalPlanVersion,
} from './sharedPlanLineage';
export type { AgreedRewardView, ChildConfirmedPlanView } from './sharedPlanLineage';

export { resolveSessionMinutes, resolveTodayAction } from './todayAction';

export { loadLongTermSharedPlan } from './sharedPlanService';
export type { LongTermSharedPlan } from './sharedPlanService';

export { loadMilestoneAgreements } from './milestoneAgreements';
export type { MilestoneAgreementView } from './milestoneAgreements';
