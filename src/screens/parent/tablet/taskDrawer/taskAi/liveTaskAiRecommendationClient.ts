// Shadow Wallet · Parent Tablet — 真實 AI 建議 client（Edge Function adapter）
//
// ─────────────────────────────────────────────────────────────────────────
// App **只認 GrowBook 的契約**。
//
// 這一層底下是 task-ai-recommendation，它底下現在是 Gemini。App 不知道
// 第二件事，也不可以知道：沒有 model 名稱、沒有 candidate、沒有
// responseSchema、沒有 token 數、沒有 Google 的錯誤格式、沒有 API key。
//
// 那不是潔癖。比賽前很可能會換 provider —— 到時候只該改 Edge Function 的
// transport，App 的契約、UI、測試一行都不動。任何一個 Gemini 的字眼漏進
// 這個檔案，那次更換就會變成前端也要重做。
//
// 另一條硬規則：**不 cast。**
//
//   const result = data as TaskAiRecommendationResult;   ← 不可以
//
// server 已經驗過一次，但那是 server。這裡拿到的是網路上回來的 unknown，
// 中間可能有代理、快取、或一個部署到一半的舊版 Function。
// 所以一律再走一次 client validator。
// ─────────────────────────────────────────────────────────────────────────

import { isAbortError, type TaskAiClientOutcome, type TaskAiRecommendationClient } from './taskAiClient';
import { validateTaskAiRecommendationResult } from './validateTaskAiResult';
import type { TaskAiRecommendationInput } from './types';

/** Edge Function 名稱。改版會是 _v2，這裡是唯一寫出它的地方。 */
export const TASK_AI_FUNCTION_NAME = 'task-ai-recommendation';

/**
 * 呼叫 Function 的那一步。
 *
 * 抽成函式型別而不是直接吃 SupabaseClient：這一層因此可以在 jest 裡
 * 完整測試，不需要 Supabase 的 URL 與金鑰，也不會有人不小心讓測試連上網。
 */
export type InvokeTaskAiFunction = (
  body: TaskAiRecommendationInput,
  signal: AbortSignal | undefined,
) => Promise<{ data: unknown; error: unknown }>;

/** supabase-js 把非 2xx 包成 FunctionsHttpError，context 是原始 Response。 */
function responseOf(error: unknown): Response | null {
  if (error === null || typeof error !== 'object') return null;
  const context = (error as { context?: unknown }).context;
  if (context === null || typeof context !== 'object') return null;
  const status = (context as { status?: unknown }).status;
  return typeof status === 'number' ? (context as Response) : null;
}

/**
 * 429 要等多久。
 *
 * 先看 body（Function 自己寫的），再看標準的 Retry-After header。
 * 兩個都沒有就不給數字 —— 猜一個「大概五分鐘」出來，家長會照著等，
 * 然後在第五分鐘再撞一次同一道牆。
 */
async function retryAfterSecondsOf(response: Response): Promise<number | undefined> {
  const fromBody = await readRetryAfterFromBody(response);
  if (fromBody !== undefined) return fromBody;

  const header = response.headers?.get?.('Retry-After');
  const parsed = header === null || header === undefined ? NaN : Number(header);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

async function readRetryAfterFromBody(response: Response): Promise<number | undefined> {
  try {
    // clone 之後再讀：原始 Response 可能已經被 supabase-js 或呼叫端動過。
    const body: unknown = await response.clone().json();
    if (body === null || typeof body !== 'object') return undefined;
    const error = (body as { error?: unknown }).error;
    if (error === null || typeof error !== 'object') return undefined;
    const seconds = (error as { retryAfterSeconds?: unknown }).retryAfterSeconds;
    return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
      ? Math.floor(seconds)
      : undefined;
  } catch {
    // body 不是 JSON、已經被讀過、或根本沒有 body。不是錯誤，只是沒有這個資訊。
    return undefined;
  }
}

/**
 * HTTP status → App outcome。
 *
 * 400 與 405 都是「我們送錯了」——家長改不了任何東西，但兩者對開發的意義
 * 不同（一個是 body、一個是 method），所以 Function 那邊分開回。
 * 到了 App 這一層它們的處置一樣，合成 request_invalid。
 */
async function outcomeForStatus(response: Response): Promise<TaskAiClientOutcome> {
  const status = response.status;

  if (status === 429) {
    const retryAfterSeconds = await retryAfterSecondsOf(response);
    return retryAfterSeconds === undefined
      ? { kind: 'rate_limited' }
      : { kind: 'rate_limited', retryAfterSeconds };
  }
  if (status === 401 || status === 403) return { kind: 'auth_required' };
  if (status === 400 || status === 405 || status === 404 || status === 422) {
    return { kind: 'request_invalid' };
  }
  return { kind: 'server_unavailable' };
}

/** 200 的 envelope：`{ requestId, result }`。requestId 只在 server log 有用。 */
function resultFromEnvelope(data: unknown): TaskAiClientOutcome {
  if (data === null || typeof data !== 'object') {
    return { kind: 'result', result: invalidResponse() };
  }
  const result = (data as { result?: unknown }).result;
  if (result === undefined) return { kind: 'result', result: invalidResponse() };

  // **這裡是重點**：不 cast，走 client validator。
  return { kind: 'result', result: validateTaskAiRecommendationResult(result) };
}

function invalidResponse(): ReturnType<typeof validateTaskAiRecommendationResult> {
  return { status: 'unavailable', schemaVersion: 1, reason: 'INVALID_RESPONSE', suggestions: [] };
}

export class LiveTaskAiRecommendationClient implements TaskAiRecommendationClient {
  constructor(private readonly invoke: InvokeTaskAiFunction) {}

  async recommend(
    input: TaskAiRecommendationInput,
    signal?: AbortSignal,
  ): Promise<TaskAiClientOutcome> {
    // 已經取消就不要送出。家長按了取消之後才發出的請求仍然會計入配額。
    if (signal?.aborted) return { kind: 'aborted' };

    let data: unknown;
    let error: unknown;
    try {
      ({ data, error } = await this.invoke(input, signal));
    } catch (thrown) {
      // supabase-js 大多把錯誤放進 error，但 abort 會直接丟出來。
      if (isAbortError(thrown)) return { kind: 'aborted' };
      return { kind: 'server_unavailable' };
    }

    if (signal?.aborted) return { kind: 'aborted' };

    if (error !== null && error !== undefined) {
      if (isAbortError(error)) return { kind: 'aborted' };
      // FunctionsFetchError（網路不通）沒有 Response —— 當成服務不可用。
      const response = responseOf(error);
      if (response === null) return { kind: 'server_unavailable' };
      return outcomeForStatus(response);
    }

    return resultFromEnvelope(data);
  }
}
