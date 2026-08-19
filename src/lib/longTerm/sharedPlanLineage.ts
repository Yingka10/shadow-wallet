// GrowBook — 從一筆正式任務走回孩子自己確認過的那份計畫（LT-FINAL-1R §H）
//
// ─────────────────────────────────────────────────────────────────────────
// 長期詳情頁要能說出「你原本想達成什麼」「你打算怎麼做」，而那些字只有
// 一個來源：孩子在螢幕上看過並按下確認的 `child_confirmed_plan`。
//
// ⚠️ **不要用「第一筆 authored_by='child'」猜 root。** 一個提案下面可能有
//    多個孩子版本（草稿、被取代的版本），而共同約定只沿著 adoption
//    lineage 成立。挑錯一份的後果是畫面上寫著孩子從來沒有同意過的話。
//
//    正確走法：current → adopted_from → … 直到遇見一份**帶 planning
//    session 且有 child_confirmed_plan 的孩子版本**。
// ─────────────────────────────────────────────────────────────────────────

import type { ChildProposalPlanVersion } from '../childProposal/types';

/** 迴圈保險。資料正常時鏈長是個位數。 */
const MAX_DEPTH = 20;

export function isChildFormalPlanVersion(
  version: ChildProposalPlanVersion | null | undefined,
): boolean {
  return Boolean(version)
    && version!.authored_by === 'child'
    && typeof version!.source_planning_session_id === 'string'
    && version!.child_confirmed_plan !== null
    && version!.child_confirmed_plan !== undefined;
}

/**
 * 沿 adoption lineage 找到孩子的正式計畫版本。找不到就是 null ——
 * 那代表這筆任務不是從 P1 規劃來的（legacy P0），不是「再猜一份」。
 */
export function resolveChildFormalPlanVersion(
  versions: readonly ChildProposalPlanVersion[],
  currentPlanVersionId: string | null | undefined,
): ChildProposalPlanVersion | null {
  if (!currentPlanVersionId) return null;
  const byId = new Map(versions.map((version) => [version.id, version]));

  let cursor = byId.get(currentPlanVersionId) ?? null;
  const seen = new Set<string>();
  for (let depth = 0; cursor && depth < MAX_DEPTH; depth += 1) {
    if (seen.has(cursor.id)) return null;
    seen.add(cursor.id);
    if (isChildFormalPlanVersion(cursor)) return cursor;
    const next = cursor.adopted_from_plan_version_id;
    cursor = typeof next === 'string' ? byId.get(next) ?? null : null;
  }
  return null;
}

export type ChildConfirmedPlanView = {
  desiredOutcome: string | null;
  actionPlanSummary: string | null;
  nextAction: string | null;
  progressionKind: string | null;
};

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 讀不到的欄位一律 null。缺了就少一段，不要補「（未提供）」。 */
export function readChildConfirmedPlan(
  version: ChildProposalPlanVersion | null,
): ChildConfirmedPlanView | null {
  const plan = record(version?.child_confirmed_plan);
  if (plan === null) return null;
  return {
    desiredOutcome: str(plan.desiredOutcome),
    actionPlanSummary: str(plan.actionPlanSummary),
    nextAction: str(record(plan.nextAction)?.text),
    progressionKind: str(plan.progressionKind),
  };
}

export type AgreedRewardView = {
  policy: string;
  coinAmount: number | null;
  payoutBasis: string | null;
  claimPeriod: string | null;
  maxClaimsPerPeriod: number | null;
  /** 畫面上那句話。 */
  label: string;
};

/**
 * 「說好的回饋」。**只讀目前有效共同版本的 confirmed_* 快照**（§J）。
 *
 * ⚠️ 不讀 tasks.reward_coin_amount（那是現況，會被之後的調整改掉）、
 *    不讀 ai_suggested_coin_amount（那不是算出來的）、不讀 ai_snapshot。
 *
 * ⚠️ legacy 的 per_period 快照**不在這裡重新詮釋成「說好的回饋」** ——
 *    那些家庭當初看到的畫面寫的是「每次完成」，沒有人真的確認過每週結算。
 *    回 null，讓呼叫端顯示 legacy 版本（§J / §K）。
 */
export function readAgreedReward(
  version: ChildProposalPlanVersion | null,
): AgreedRewardView | null {
  if (!version?.confirmed_reward_policy) return null;
  const basis = version.confirmed_payout_basis ?? null;
  const coins = typeof version.confirmed_coin_amount === 'number'
    ? version.confirmed_coin_amount
    : null;

  if (version.confirmed_reward_policy === 'coin_eligible') {
    if (coins === null || coins <= 0) return null;
    if (basis !== 'per_completion') return null;   // legacy per_period → 交給呼叫端
    return {
      policy: version.confirmed_reward_policy,
      coinAmount: coins,
      payoutBasis: basis,
      claimPeriod: version.confirmed_claim_period ?? null,
      maxClaimsPerPeriod: version.confirmed_max_claims_per_period ?? null,
      label: `每完成一次，+${coins} 成長幣`,
    };
  }

  const label = version.confirmed_reward_policy === 'progress_only'
    ? '看得到進度，不給成長幣'
    : version.confirmed_reward_policy === 'family_contribution'
      ? '記在家庭貢獻裡'
      : '先把完成記錄下來';
  return {
    policy: version.confirmed_reward_policy,
    coinAmount: null,
    payoutBasis: basis,
    claimPeriod: version.confirmed_claim_period ?? null,
    maxClaimsPerPeriod: version.confirmed_max_claims_per_period ?? null,
    label,
  };
}
