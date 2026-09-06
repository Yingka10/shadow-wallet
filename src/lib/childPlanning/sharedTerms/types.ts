// GrowBook — 家長提出家庭共同條件的 App 端契約（P1-A4B1）
//
// ─────────────────────────────────────────────────────────────────────────
// 這一層的型別本身就是一道防線。
//
// `ChildPlanningSharedTerms` 裡**沒有**孩子擁有的任何欄位：沒有
// desiredOutcome、沒有 nextAction、沒有 progressionKind、沒有 phases。
// 型別上沒有那個位置，「家長順手改一下標題」這件事就寫不出來，
// 不必靠 review 抓。（RPC 端也會擋，兩層都有。）
//
// 家長在這一步提出的是**條件**，不是計畫：
//
//     一週想安排幾次   什麼時段   每次先做多久   先試多久   怎麼給回饋
// ─────────────────────────────────────────────────────────────────────────

import type { ChildProposalFailure } from '../../childProposal/types';
import type { MilestoneSplit } from './milestoneSplit';

export const PROPOSE_CHILD_PLANNING_TERMS_RPC = 'propose_child_planning_terms_v1';

/**
 * 家庭作息時段。與 revise_child_proposal_plan_v1 的清單同一組值 ——
 * 兩條路徑最後寫的是同一欄，清單分岔的話會有一邊寫得進、另一邊寫不進。
 */
export const CHILD_PLANNING_PREFERRED_TIMES = [
  'before_school', 'after_school', 'after_dinner', 'before_bed',
  'weekend', 'when_needed', 'custom',
] as const;

export type ChildPlanningPreferredTime = typeof CHILD_PLANNING_PREFERRED_TIMES[number];

/** 每次多久的合法範圍。與家長抽屜、Plan Draft 同一組上下限。 */
export const SESSION_MINUTES_RANGE = { min: 5, max: 120 } as const;
/** 先試多久的合法範圍。 */
export const DURATION_DAYS_RANGE = { min: 1, max: 180 } as const;

/**
 * 家長能提出的回饋方式。
 *
 * **只准往下或橫向，不准升級。** 資格閘門說不能發幣的計畫，家長勾一個
 * 選項不會讓它變成可以發幣 —— 那是規則引擎的判定，不是家庭偏好。
 *
 *   growbook_default   沿用 GrowBook 算出來的判定（staged 計畫預設拆站）
 *   no_coin            這件事不給成長幣，看得到進度就好
 *   flat_per_completion 只在真的有拆站草案時才有意義：不拆站，
 *                       全額每次結算（P1-M1B §1「家長能不能拒絕拆站」）。
 *                       總額不變、也不會讓不能發幣的變成能發幣，
 *                       跨的是既有那條「家長決定回饋方式」的線，
 *                       不是把 duration_type/purpose_category 那種
 *                       系統判定新開放給家長。
 */
export type ChildPlanningRewardChoice = 'growbook_default' | 'no_coin' | 'flat_per_completion';

/**
 * 家長提出的共同條件。**每一欄都是「沒提出就不動」**，
 * 所以 undefined 與 null 的意思不一樣：undefined = 沿用現在的安排。
 */
export type ChildPlanningSharedTerms = {
  cadenceMode?: 'weekly_frequency' | 'fixed_days';
  cadenceWeeklyFrequency?: number;
  cadenceDays?: number[];
  preferredTime?: ChildPlanningPreferredTime;
  preferredTimeCustom?: string;
  sessionMinutes?: number;
  durationDays?: number;
  rewardChoice?: ChildPlanningRewardChoice;
};

/**
 * 這一次提出的政策判定。由既有的 evaluateTaskReward 算出來，
 * **不是**家長輸入的 —— 家長在這一步連幣值欄位都看不到。
 *
 * 只有「來源是可發幣的計畫、而且結算語意已知」時才會有值。
 */
export type ChildPlanningRewardEvaluation = {
  rewardPolicy: 'coin_eligible';
  eligibility: 'allowed';
  rewardPolicyVersion: string;
  taskPolicyVersion: string;
  sessionCoinReference: number;
  payoutType: 'per_completion';
  /**
   * staged 計畫的混合制回饋拆法（P1-M1B）。null = 不拆
   * （非 staged 計畫、家長選 flat_per_completion、cadence 還沒定、
   * 或沒有任何一站帶得出可追蹤的 criterion）。
   *
   * ⚠️ 目前只讀 currentPlanVersion 本人的 child_confirmed_plan，不沿
   * adopted_from 走完整 lineage —— 再協商回合（authored_by='parent'）
   * 讀不到孩子原版本的 phases 時就是 null，不猜、不補。
   */
  milestoneSplit: MilestoneSplit | null;
};

export type ProposeChildPlanningTermsCommand = {
  schemaVersion: 1;
  proposalId: string;
  expectedPlanVersionId: string;
  sharedTerms: ChildPlanningSharedTerms;
  rewardEvaluation?: ChildPlanningRewardEvaluation;
};

/** 為什麼這張卡片現在不能提出共同條件。 */
export type ChildPlanningNegotiationBlock =
  | 'not_child_planning_plan'
  | 'not_current_proposed'
  | 'already_has_task'
  /** 系統還沒整理完（purpose_category / duration_type）。不是家長的事。 */
  | 'enrichment_required';

export type ChildPlanningNegotiability =
  | { ok: true; pending: string[] }
  | { ok: false; block: ChildPlanningNegotiationBlock };

export type ProposeChildPlanningTermsSuccess = {
  ok: true;
  proposalId: string;
  /** 家長草案那一版。**不是**有效計畫。 */
  planVersionId: string;
  sourcePlanVersionId: string;
  /** 整條 lineage 最後回到的那一份孩子計畫。 */
  childPlanVersionId: string;
  status: 'needs_child_review';
  requiresParentDecision: string[];
  idempotentReplay: boolean;
};

export type ProposeChildPlanningTermsResult =
  | ProposeChildPlanningTermsSuccess
  | ChildProposalFailure;
