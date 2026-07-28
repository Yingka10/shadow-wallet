// Shadow Wallet · Parent Tablet — command 值 → DB canonical 值
//
// 有兩個地方名稱對不起來，而且兩邊都不該讓步：
//
//   1. 任務目的。UI 與 command 用四個講得出口的名字，DB 用 A/B/C/D。
//      **沒有新增 purpose_category 欄位** —— tasks.category 仍是 canonical，
//      因為 fn_complete_task 讀的是它。兩個欄位並存的話，總有一天會不同步，
//      而不同步的那一刻幣值就算錯了。
//
//   2. 結束方式。catalog 用 ongoing / plan_complete，
//      DB canonical 用 keep_recurring / finish_project。
//      與其去改 26 family / 36 variant 的資料與所有既有測試，不如在這裡映射一次。
//
// 這一份與 migration 裡的 map_purpose_category() / map_completion_policy()
// 是同一組規則的兩個實作。SQL 那一份才是最終防線（前端繞得過，RPC 繞不過），
// 這一份的用途是讓前端在送出前就知道會被寫成什麼，以及讓映射有測試可寫。

import type { CompletionPolicy, PurposeCategory } from '../taskCatalog';

/** DB 的 tasks.category。 */
export type DbTaskCategory = 'A' | 'B' | 'C' | 'D';

/** DB canonical 的結束方式。與 catalog 的 CompletionPolicy 不完全同名。 */
export type DbCompletionPolicy =
  | 'complete_once'
  | 'keep_recurring'
  | 'finish_project'
  | 'review_and_continue'
  | 'stabilize_and_exit';

/**
 * 任務目的 → A/B/C/D。
 * 對照 docs/SPEC_task-taxonomy-2026-07.md：
 *   A 生活常規 / B 家庭參與 / C 自主挑戰 / D 學習與技能。
 */
export const DB_CATEGORY_BY_PURPOSE: Record<PurposeCategory, DbTaskCategory> = {
  life_routine: 'A',
  family_participation: 'B',
  autonomous_challenge: 'C',
  learning_skill: 'D',
};

export const DB_COMPLETION_POLICY: Record<CompletionPolicy, DbCompletionPolicy> = {
  complete_once: 'complete_once',
  ongoing: 'keep_recurring',
  plan_complete: 'finish_project',
  review_and_continue: 'review_and_continue',
  stabilize_and_exit: 'stabilize_and_exit',
};

export function dbCategoryOf(purpose: PurposeCategory): DbTaskCategory {
  return DB_CATEGORY_BY_PURPOSE[purpose];
}

export function dbCompletionPolicyOf(policy: CompletionPolicy): DbCompletionPolicy {
  return DB_COMPLETION_POLICY[policy];
}

// ---------------------------------------------------------------------------
// claim 規則
// ---------------------------------------------------------------------------

/**
 * DB 的 tasks.claim_period。
 * 'once' 是這一輪新增的：單次任務的「只能完成一次」不是「每天一次」，
 * 用 day + due_date 假裝會讓沒有截止日的一次性任務隔天又能再領一次。
 */
export type DbClaimPeriod = 'day' | 'week' | 'once';

export type ClaimRule = {
  claimPeriod: DbClaimPeriod;
  maxClaimsPerPeriod: number;
};

/**
 * 由排程推導 claim 規則。
 *
 * 前端**不會**把這個結果送給 RPC —— RPC 自己算一次（見 migration §9）。
 * 這裡存在的理由是讓「每週三次代表什麼」有一份看得懂、測得到的定義，
 * 而不是只躺在 plpgsql 裡。
 */
export function claimRuleFor(
  scheduleMode: 'one_time' | 'fixed_days' | 'weekly_frequency',
  weeklyFrequency?: number,
): ClaimRule {
  if (scheduleMode === 'one_time') {
    return { claimPeriod: 'once', maxClaimsPerPeriod: 1 };
  }
  if (scheduleMode === 'weekly_frequency') {
    return { claimPeriod: 'week', maxClaimsPerPeriod: weeklyFrequency ?? 1 };
  }
  // fixed_days：每個排定日最多一次。長期形式再加上 end_date 的界線（DB 側）。
  return { claimPeriod: 'day', maxClaimsPerPeriod: 1 };
}
