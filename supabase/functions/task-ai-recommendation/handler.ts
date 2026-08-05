// task-ai-recommendation — AI 任務調整建議
//
// ─────────────────────────────────────────────────────────────────────────
// ⚠️ 第八階段 B1：**尚未部署、尚未接 UI。** 部署前檢查見 README.md。
//
// 為什麼不加進既有的 ai-proxy：ai-proxy 混了六種用途，其中三種讓 LLM
// 直接決定幣值，而這支的第一條規則是「AI 碰不到幣值」。兩種相反的幣值
// 哲學放在同一個 switch 裡，遲早有人複製錯一段 —— 而隔壁那段寫的正是
// `JSON.parse(x) as T`。
//
// 這個檔案只做**編排**：HTTP、CORS、auth、把各層串起來、把結果對映成回應。
// prompt 在 prompt.ts，驗證在 inputValidator / outputValidator，
// 安全在 contentSafety，transport 在 geminiClient。這裡不放邏輯。
//
// 這支不寫任何資料表、不建立任務、不算幣、不讀錢包、不讀家庭歷史、
// 不用 service role。它讀得到的東西只有請求本身。
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

import { INPUT_LIMITS, unavailable, type RecommendationResult } from './contract.ts';
import { evaluateTaskAiRecommendationEligibility } from './eligibility.ts';
import { validateTaskAiInput } from './inputValidator.ts';
import { requestRecommendation } from './geminiClient.ts';
import { consumeQuota, type QuotaRpcCaller } from './rateLimit.ts';
import {
  resolveFeatureEnabled,
  resolveModel,
  resolveRateLimit,
  resolveTimeoutMs,
} from './runtimeConfig.ts';
import { validateModelOutput } from './outputValidator.ts';

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
//
// 沿用 repo 既有 Edge Function 的慣例（`*` + 明列 header）。
// **刻意不設 Access-Control-Allow-Credentials**：`*` 搭配 credentials 是
// 瀏覽器會直接拒絕的組合，而「為了讓它動」把 origin 改成回音式的
// `req.headers.get('origin')` 就等於對任意站台開放帶憑證的請求。
// 這支用 Authorization header 帶 JWT，不需要 cookie，所以不需要 credentials。

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------------------------------------------------------------------------
// 回應 envelope
// ---------------------------------------------------------------------------
//
// 成功與失敗**用不同的鍵**，而且互斥：
//   200      → { requestId, result }
//   4xx/5xx  → { requestId, error: { code } }
//
// 這樣一個 401 沒有辦法被誤讀成「AI 說沒有建議」。
// 如果兩者共用同一個 `status` 欄位，一個漏檢查 HTTP code 的 client
// 就會把「你沒登入」顯示成「目前設定已經清楚」。

type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'method_not_allowed'
  | 'rate_limited'
  | 'server_misconfigured'
  | 'internal_error';

function okResponse(requestId: string, result: RecommendationResult): Response {
  return new Response(JSON.stringify({ requestId, result }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function errorResponse(
  requestId: string,
  status: number,
  code: ErrorCode,
  extra?: { retryAfterSeconds?: number },
): Response {
  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    'Content-Type': 'application/json',
  };
  const body: Record<string, unknown> = { requestId, error: { code } };

  if (extra?.retryAfterSeconds !== undefined) {
    // 標準的 Retry-After，讓 client（與任何中介）不必解析 body 就知道要等多久。
    headers['Retry-After'] = String(extra.retryAfterSeconds);
    body.error = { code, retryAfterSeconds: extra.retryAfterSeconds };
  }

  return new Response(JSON.stringify(body), { status, headers });
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
//
// 只能記這幾個欄位，**型別上就沒有地方可以放自由文字**。
//
// 這不是靠自律：如果 log 函式收 `string`，那總有一天會有人為了 debug
// 寫下 `console.log(prompt)`，然後那行留在 production。收一個固定形狀的
// 物件的話，要記下任務內容就得先改型別 —— 而那件事在 review 裡看得見。

type LogEvent = {
  requestId: string;
  outcome: 'suggestions' | 'no_change' | 'unavailable' | 'rejected' | 'unauthorized' | 'error';
  reason?: string;
  /** 驗證失敗的分類代碼。**不是** detail 文字，不含任何任務內容。 */
  rejectionKind?: string;
  latencyMs?: number;
  suggestionCount?: number;
  timedOut?: boolean;
  httpStatus?: number;
  /** 設定是怎麼來的。**不含環境變數的原始內容。** */
  modelSource?: string;
  timeoutSource?: string;
  timeoutMs?: number;
  enabledSource?: string;
  rateLimitSource?: string;
  /** 這份草稿有沒有通過使用範圍閘門。false 代表**沒有呼叫 Gemini**。 */
  eligible?: boolean;
  /** 不符合資格的分類代碼。**不是** detail 文字。 */
  eligibilityReason?: string;
  /** 有沒有被限流擋下。同樣代表沒有呼叫 Gemini。 */
  rateLimited?: boolean;
};

function logEvent(event: LogEvent): void {
  console.log(JSON.stringify({ fn: 'task-ai-recommendation', ...event }));
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * 驗證通過時一併帶回一個 RPC 呼叫端 —— 限流要用**同一個身分**去呼叫。
 *
 * 帶回去的是 `QuotaRpcCaller`（只有 `rpc` 一個方法）而不是整個 SupabaseClient：
 * 這支 Function 除了限流之外不該碰資料庫的任何東西，
 * 而把整個 client 交出去，等於把「順手查一下家庭資料」變成一行就做得到的事。
 */
type AuthOutcome =
  | { ok: true; quota: QuotaRpcCaller }
  | { ok: false };

/**
 * 確認呼叫者是登入中的使用者。
 *
 * 用 anon key + 呼叫者自己的 JWT 走一次真正的 `auth.getUser()` ——
 * **不是只看 header 存不存在**。一個 `Bearer x` 會被 GoTrue 拒絕。
 *
 * **不用 service role**：這支不需要任何跨使用者的讀取權限，拿了只會擴大
 * 它出事時的影響範圍。它也刻意不查 parents / children —— 它不需要知道
 * 你是誰家的誰，只需要知道你是「一個登入中的人」。
 *
 * 回傳的 client 帶著呼叫者的 JWT，所以限流 RPC 裡的 `auth.uid()` 拿到的
 * 是**這個人**。這正是為什麼那支 RPC 不需要、也不接受 user_id 參數。
 *
 * token 本身不進 log、不進回應、不進任何錯誤訊息。
 */
async function authenticate(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<AuthOutcome> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return { ok: false };
  if (authHeader.slice('Bearer '.length).trim().length === 0) return { ok: false };

  try {
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return { ok: false };

    return {
      ok: true,
      quota: {
        rpc: async (fn, args) => {
          const res = await client.rpc(fn, args);
          return { data: res.data as unknown, error: res.error as unknown };
        },
      },
    };
  } catch {
    // 驗證本身失敗（網路、GoTrue 掛掉）一律視為未通過。
    // 「驗不了」不可以等於「放行」。
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleRequest(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return errorResponse(requestId, 405, 'method_not_allowed');
  }

  try {
    // ── 0. 總開關 ────────────────────────────────────────────────────────
    //
    // 排在最前面，連 auth 都不做。一個還要先打一次 GoTrue 的 kill switch
    // 是個很差的 kill switch —— 出事時要停的就是「這條路徑的所有動作」。
    // 對未登入的探測者來說，這個回應也沒有洩漏任何東西。
    const featureSwitch = resolveFeatureEnabled(Deno.env.get('TASK_AI_ENABLED'));
    if (!featureSwitch.enabled) {
      logEvent({
        requestId,
        outcome: 'unavailable',
        reason: 'SERVICE_DISABLED',
        enabledSource: featureSwitch.source,
      });
      return okResponse(requestId, unavailable('SERVICE_DISABLED'));
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const apiKey = Deno.env.get('GEMINI_API_KEY');

    // 缺 server 設定是 500 —— 那是我們的問題，不是呼叫者的。
    // 回 unavailable 會讓它看起來像「AI 暫時沒空」，於是沒有人去修。
    if (!supabaseUrl || !anonKey || !apiKey) {
      logEvent({ requestId, outcome: 'error', reason: 'MISSING_ENV' });
      return errorResponse(requestId, 500, 'server_misconfigured');
    }

    // ── 1. Auth ─────────────────────────────────────────────────────────
    const auth = await authenticate(req, supabaseUrl, anonKey);
    if (!auth.ok) {
      logEvent({ requestId, outcome: 'unauthorized' });
      return errorResponse(requestId, 401, 'unauthorized');
    }

    // ── 2. 輸入驗證 ──────────────────────────────────────────────────────
    //
    // 先讀文字再量大小：`req.json()` 會把整包吃進記憶體之後才知道它多大。
    const bodyText = await req.text();
    if (new TextEncoder().encode(bodyText).length > INPUT_LIMITS.maxBodyBytes) {
      logEvent({ requestId, outcome: 'rejected', rejectionKind: 'BODY_TOO_LARGE' });
      return errorResponse(requestId, 400, 'bad_request');
    }

    let body: unknown;
    try {
      body = JSON.parse(bodyText) as unknown;
    } catch {
      logEvent({ requestId, outcome: 'rejected', rejectionKind: 'BODY_NOT_JSON' });
      return errorResponse(requestId, 400, 'bad_request');
    }

    const rawInput = (body !== null && typeof body === 'object' && !Array.isArray(body))
      ? (body as Record<string, unknown>).input
      : undefined;

    const validated = validateTaskAiInput(rawInput);
    if (!validated.ok) {
      // detail 只進 log 的 kind 欄位，**不回給 client**：那是我們的除錯資訊，
      // 對家長沒有意義，對想探測欄位結構的人則太有意義。
      logEvent({ requestId, outcome: 'rejected', rejectionKind: validated.rejection.code });
      return errorResponse(requestId, 400, 'bad_request');
    }

    // ── 3. 使用範圍與輸入安全 ─────────────────────────────────────────────
    //
    // 排在限流**之前**：不符合資格的請求不該消耗家長的額度。
    // 那不是他做錯什麼，是這個功能第一版還沒開放到那裡。
    const eligibility = evaluateTaskAiRecommendationEligibility(validated.input);
    if (!eligibility.eligible) {
      logEvent({
        requestId,
        outcome: 'unavailable',
        reason: 'NOT_ELIGIBLE',
        eligible: false,
        // detail（含任務文字片段）只留在函式內，不進 log 也不進回應。
        eligibilityReason: eligibility.reason,
      });
      return okResponse(requestId, unavailable('NOT_ELIGIBLE'));
    }

    // model 與 timeout 都從環境變數解析，兩者都有型別驗證與上下限。
    // 解析結果的 source 會進 log（`env` / `env_clamped` / `env_invalid` /
    // `default`）—— 那是「staging 把 timeout 設成 20ms 之後忘了改回來」
    // 唯一看得出來的地方。**原始環境變數內容不進 log。**
    const modelChoice = resolveModel(Deno.env.get('GEMINI_TASK_RECOMMENDATION_MODEL'));
    const timeoutChoice = resolveTimeoutMs(Deno.env.get('TASK_AI_TIMEOUT_MS'));
    const rateLimitConfig = resolveRateLimit(
      Deno.env.get('TASK_AI_RATE_LIMIT_PER_10MIN'),
      Deno.env.get('TASK_AI_RATE_LIMIT_PER_DAY'),
    );

    // ── 4. 消耗額度 ──────────────────────────────────────────────────────
    //
    // 位置是這一層的一半意義：**在確定要打 Gemini 的前一刻。**
    //
    // 排在輸入驗證前面的話，一個送壞 JSON 的 client 會把家長的額度吃光；
    // 排在 Gemini 後面的話，限流就完全沒有省到錢。
    //
    // 用 auth 那一步拿到的 client —— 帶著呼叫者的 JWT，
    // 所以 RPC 裡的 `auth.uid()` 是他自己，不是任何人可以指定的值。
    const quota = await consumeQuota(auth.quota, rateLimitConfig);
    if (!quota.allowed) {
      if (quota.outcome === 'ERROR') {
        // 限流查不動就不放行。「壞掉的時候先讓它過」等於
        // 「唯一需要限流的那段時間剛好沒有限流」。
        logEvent({
          requestId,
          outcome: 'unavailable',
          reason: 'SERVICE_ERROR',
          rejectionKind: `ratelimit:${quota.detail}`,
          rateLimitSource: rateLimitConfig.source,
        });
        return okResponse(requestId, unavailable('SERVICE_ERROR'));
      }

      // 429 而不是 200：這是**呼叫端該改變行為**的情況，
      // 和「AI 這次沒有建議」不一樣。混成同一個回應的話，
      // 一個自動重試的 client 會安靜地一直撞牆。
      logEvent({
        requestId,
        outcome: 'rejected',
        rejectionKind: 'RATE_LIMITED',
        rateLimited: true,
        rateLimitSource: rateLimitConfig.source,
        httpStatus: 429,
      });
      return errorResponse(requestId, 429, 'rate_limited', {
        retryAfterSeconds: quota.retryAfterSeconds,
      });
    }

    // ── 5. Gemini ───────────────────────────────────────────────────────
    const transport = await requestRecommendation({
      apiKey,
      input: validated.input,
      allowedFieldPaths: eligibility.allowedFieldPaths,
      model: modelChoice.model,
      timeoutMs: timeoutChoice.timeoutMs,
    });

    if (!transport.ok) {
      logEvent({
        requestId,
        outcome: 'unavailable',
        reason: transport.failure,
        latencyMs: Date.now() - startedAt,
        timedOut: transport.failure === 'TIMEOUT',
        httpStatus: transport.httpStatus,
        modelSource: modelChoice.source,
        timeoutSource: timeoutChoice.source,
        timeoutMs: timeoutChoice.timeoutMs,
        eligible: true,
      });
      return okResponse(requestId, unavailable(transport.failure));
    }

    // ── 6~7. 輸出驗證與輸出安全 ───────────────────────────────────────────
    //
    // `allowedFieldPaths` 傳的是**這一次**的清單，不是全域 allowlist。
    // prompt 已經只列了這一份，但 prompt 是請求不是規則 ——
    // 規則在這裡。
    const { result, rejection } = validateModelOutput(transport.raw, {
      ageGroup: validated.input.childContext.ageGroup,
      allowedFieldPaths: eligibility.allowedFieldPaths,
      allowedSuggestionKinds: eligibility.allowedSuggestionKinds,
    });

    logEvent({
      requestId,
      outcome: result.status === 'unavailable' ? 'unavailable' : result.status,
      reason: result.status === 'unavailable' ? result.reason : undefined,
      rejectionKind: rejection
        ? (rejection.kind === 'safety' ? `safety:${rejection.violation.code}` : rejection.kind)
        : undefined,
      latencyMs: Date.now() - startedAt,
      suggestionCount: result.suggestions.length,
      eligible: true,
      rateLimitSource: rateLimitConfig.source,
      // 成功路徑也要記。這兩個欄位的用途是讓「staging 把 timeout 調小之後
      // 忘了改回來」看得出來 —— 而那種情況多數請求仍然會成功，
      // 只是變慢或偶爾逾時。只在失敗時記的話，正好漏掉最需要它的情境。
      modelSource: modelChoice.source,
      timeoutSource: timeoutChoice.source,
      timeoutMs: timeoutChoice.timeoutMs,
    });

    // AI 不可用是這個功能的**正常狀態**之一，不是錯誤。
    // 回 5xx 會讓 supabase-js 走 error 分支，client 就分不出
    // 「服務掛了」和「服務說沒有建議」。
    return okResponse(requestId, result);
  } catch (err) {
    // 未預期的例外。原始訊息不進回應。
    logEvent({
      requestId,
      outcome: 'error',
      reason: err instanceof Error ? err.name : 'UNKNOWN',
      latencyMs: Date.now() - startedAt,
    });
    return errorResponse(requestId, 500, 'internal_error');
  }
}
