// task-ai-recommendation — 伺服器端限流
//
// ─────────────────────────────────────────────────────────────────────────
// 這一層擋的是：**一個登入中的家長，連按二十次。**
//
// B2A 之前，擋在付費 Gemini 呼叫前面的東西只有「你有沒有登入」。
// 那不是限流。B2A 的驗證本身就把三個 model 的當日免費額度用完了 ——
// 那不是假想的風險，是已經發生過的事。
//
// ⚠️ client 端的 debounce、disabled 按鈕、本地 cooldown **都不算**。
// 它們改善的是誤觸，不是濫用：直接對 endpoint 送請求的人完全不經過它們。
// 同理，Edge Function 記憶體裡的 Map 也不算 —— instance 會重啟、會水平擴充，
// 每個 instance 各數各的。那是限流的樣子，不是限流。
//
// 真正的計數在 Postgres：`consume_task_ai_recommendation_quota_v1`。
// 這個檔案只負責呼叫它，並把結果翻譯成 HTTP 的說法。
//
// ── 身分從哪裡來 ─────────────────────────────────────────────────────
//
// **RPC 不收 user_id。** 它自己讀 `auth.uid()`。
// 所以這裡必須用「帶著呼叫者 JWT 的 client」去呼叫，而不是 service role。
// 這是刻意的：一個收 user_id 的限流 RPC，等於讓任何人都可以消耗別人的
// 額度，或用別人的身分繞過自己的。
// ─────────────────────────────────────────────────────────────────────────

/**
 * 呼叫 RPC 需要的最小介面。
 *
 * 刻意不寫成 `SupabaseClient`：這個檔案不需要那整包型別，
 * 而收一個結構型別讓測試可以塞一個三行的 stub 進來，
 * 不必為了測「超額時回什麼」而去接一個真的資料庫。
 */
export type QuotaRpcCaller = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
};

export const QUOTA_RPC = 'consume_task_ai_recommendation_quota_v1';

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; outcome: 'RATE_LIMITED'; retryAfterSeconds: number }
  /** RPC 本身出錯（migration 沒跑、資料庫不通、回傳看不懂）。 */
  | { allowed: false; outcome: 'ERROR'; detail: string };

/** 超額時最少要等多久才建議重試。避免回一個 0 讓 client 立刻重打。 */
const MIN_RETRY_SECONDS = 1;
/** 上限一天。RPC 已經夾過，這裡是第二層 —— 不讓一個壞掉的值變成永久封鎖。 */
const MAX_RETRY_SECONDS = 86_400;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 消耗一次額度。
 *
 * ⚠️ 這個函式有副作用：呼叫它就會 +1。所以它必須在**確定要打 Gemini 的
 * 前一刻**才呼叫 —— 排在輸入驗證與 eligibility 之後。
 * 排在前面的話，一個送壞 JSON 的 client 會把家長的額度吃光。
 *
 * ⚠️ 失敗時**不放行**。
 *
 * 「資料庫不通就先讓它過」聽起來寬容，實際結果是：限流壞掉的那段時間
 * 正好是完全沒有限流的那段時間 —— 而那是唯一需要它的時候。
 * 代價是 migration 沒套用時整個功能不可用，但那是**部署錯誤**，
 * 會立刻被發現；靜靜放行則不會。
 */
export async function consumeQuota(
  client: QuotaRpcCaller,
  limits: { per10Minutes: number; perDay: number },
): Promise<RateLimitDecision> {
  let payload: unknown;
  try {
    const { data, error } = await client.rpc(QUOTA_RPC, {
      p_limit_per_10min: limits.per10Minutes,
      p_limit_per_day: limits.perDay,
    });
    if (error) {
      // 原始錯誤訊息不往外傳：它可能含 SQL 片段或表名。
      return { allowed: false, outcome: 'ERROR', detail: 'RPC_ERROR' };
    }
    payload = data;
  } catch {
    return { allowed: false, outcome: 'ERROR', detail: 'RPC_THREW' };
  }

  if (!isRecord(payload) || typeof payload.allowed !== 'boolean') {
    return { allowed: false, outcome: 'ERROR', detail: 'RPC_SHAPE' };
  }

  if (payload.allowed) return { allowed: true };

  // RPC 刻意不回「目前用了幾次」「上限是多少」——
  // 那會讓呼叫端知道怎麼剛好卡在邊界，而家長也不需要看到這種數字。
  // 這裡同樣只取 retry 秒數。
  const raw = payload.retry_after_seconds;
  const seconds = typeof raw === 'number' && Number.isFinite(raw) ? Math.ceil(raw) : MIN_RETRY_SECONDS;

  return {
    allowed: false,
    outcome: 'RATE_LIMITED',
    retryAfterSeconds: Math.min(MAX_RETRY_SECONDS, Math.max(MIN_RETRY_SECONDS, seconds)),
  };
}
