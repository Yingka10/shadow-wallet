// GrowBook — 產生一份 Goal Plan（P1-A1）
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支與 P0-3 的 generateChildProposalPlanDraft 有一個很重要的差別：
//
//   **它不碰資料庫。**
//
// P1-A1 只回答「資料應該長什麼樣子」，還沒回答「到底塞哪張表」。
// 先寫進去的話，兩天後 product model 一改，就要動 migration。
// 所以這一支只做：輸入檢查 → 呼叫 → 驗證 → 回傳結構化結果。
//
// 也**沒有**被掛到 generateChildProposalPlanDraftInBackground()。
// 這是 P1-A1 的邊界：契約還在驗證，不可以因為做出 generator 就讓
// production 的提案行為改變。
//
// 這支不 throw —— 每個出口都是一個結構化的 outcome，與 P0-3 同一個理由。
// ─────────────────────────────────────────────────────────────────────────

import { buildChildGoalPlanningInput, type ChildGoalPlanningRequest } from './buildChildGoalPlanningInput';
import { childGoalPlanningUnavailable } from './validateChildGoalPlanningResult';
import type {
  ChildGoalPlanningClient,
  ChildGoalPlanningInput,
  ChildGoalPlanningResult,
} from './types';

export type GenerateChildGoalPlanDeps = {
  /** null = 這個環境不提供 AI。不是「會失敗的 client」——那會讓人一直重試。 */
  client: ChildGoalPlanningClient | null;
  signal?: AbortSignal;
};

export type ChildGoalPlanOutcome = {
  result: ChildGoalPlanningResult;
  /** 真的送出去的那一份輸入。null = 根本沒呼叫。稽核與測試用。 */
  input: ChildGoalPlanningInput | null;
};

/**
 * 一次規劃。
 *
 * 順序是刻意的：
 *   1. AI 關著 → 立刻結束，不組 input、不花任何一次請求。
 *   2. 組 input；組不出來代表這一輪本來就產不出計畫。
 *   3. 呼叫（client 內部負責逾時）。
 *   4. client 內部已經驗過並套用 guard，這裡直接轉達。
 */
export async function generateChildGoalPlan(
  deps: GenerateChildGoalPlanDeps,
  request: ChildGoalPlanningRequest,
): Promise<ChildGoalPlanOutcome> {
  if (deps.client === null) {
    return { result: childGoalPlanningUnavailable('SERVICE_DISABLED'), input: null };
  }

  const input = buildChildGoalPlanningInput(request);
  if (input === null) {
    return { result: childGoalPlanningUnavailable('INVALID_INPUT'), input: null };
  }

  const result = await deps.client.requestPlan(input, deps.signal);
  return { result, input };
}
