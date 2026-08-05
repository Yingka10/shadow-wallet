// Shadow Wallet · Parent Tablet — AI 建議的 client 契約
//
// ─────────────────────────────────────────────────────────────────────────
// `TaskAiRecommendationService`（既有）只回得出「AI 說了什麼」。
// 那對 prototype 夠用，接上真的 Edge Function 之後不夠：
//
//   429  你太快了，等一下再來            ← 家長要看到不同的話
//   401  登入過期                        ← 家長要去重新登入
//   400  我們送錯了                      ← 家長什麼都不用做，但我們要知道
//   500  伺服器壞了                      ← 稍後再試
//   abort 家長自己離開了                  ← **什麼都不要顯示**
//
// 全部壓成 `unavailable` 的話，登入過期會顯示成「目前無法取得建議」，
// 家長重試一百次都不會成功；而家長自己關掉抽屜也會跳出一個錯誤。
//
// 所以這一層是 outcome union，不是字串錯誤。
// ─────────────────────────────────────────────────────────────────────────

import type {
  TaskAiRecommendationInput,
  TaskAiRecommendationResult,
  TaskAiRecommendationService,
} from './types';

export type TaskAiClientOutcome =
  /** Function 有回話（可能是 suggestions / no_change / unavailable）。 */
  | { kind: 'result'; result: TaskAiRecommendationResult }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }
  | { kind: 'auth_required' }
  /** 我們送出的請求本身不合法。家長改不了，但這是 bug。 */
  | { kind: 'request_invalid' }
  | { kind: 'server_unavailable' }
  /** 家長自己離開了。**不是失敗，不顯示任何東西。** */
  | { kind: 'aborted' };

export interface TaskAiRecommendationClient {
  recommend(
    input: TaskAiRecommendationInput,
    signal?: AbortSignal,
  ): Promise<TaskAiClientOutcome>;
}

/** AbortController 取消時各家 runtime 丟的東西不一樣，統一在這裡認。 */
export function isAbortError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const name = (error as { name?: unknown }).name;
  return name === 'AbortError';
}

/**
 * 把既有的 service（Fake、Unavailable）包成 client。
 *
 * 存在的理由是**不要為了新契約去改已經通過測試的假服務** ——
 * 那些替身的價值就在於它們沒有被這一輪動過。
 */
export function taskAiClientFromService(
  service: TaskAiRecommendationService,
): TaskAiRecommendationClient {
  return {
    async recommend(input, signal) {
      try {
        const result = await service.recommend(input, signal);
        // service 可能在 signal 已取消之後才 resolve；那份結果不該被使用。
        if (signal?.aborted) return { kind: 'aborted' };
        return { kind: 'result', result };
      } catch (error) {
        if (isAbortError(error)) return { kind: 'aborted' };
        // 假服務丟例外只可能是測試自己安排的。當成服務不可用，
        // 不要把例外往上丟到 React —— AI 壞掉不該讓抽屜白畫面。
        return { kind: 'server_unavailable' };
      }
    },
  };
}
