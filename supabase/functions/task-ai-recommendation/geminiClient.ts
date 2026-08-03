// task-ai-recommendation — Gemini transport
//
// ─────────────────────────────────────────────────────────────────────────
// 這個檔案只負責「把 request 送出去、把文字拿回來」。
// 它**不認識** suggestion、fieldPath、幣值或任何產品欄位 ——
// 那些是 outputValidator 的事。
//
// 與 ai-proxy 的三個差別，每一個都是它現在的 bug：
//
//   1. **有 timeout。** ai-proxy 的 fetch 沒有 signal，整個檔案沒有
//      AbortController。Gemini 掛住就一路掛住，家長看到轉不完的圈。
//   2. **不 retry、不換 model。** ai-proxy 的 MODEL_CHAIN 逐一改試三個 model，
//      三次串起來遠超任何上限。對這個功能來說，等 30 秒拿到建議
//      比 12 秒拿到「暫時無法取得」更糟 —— 後者家長可以直接繼續建立。
//   3. **回 `unknown`。** ai-proxy 寫 `JSON.parse(cleaned) as T`，
//      那個 cast 讓型別系統對整批資料失效。這裡的回傳型別是 unknown，
//      呼叫端非驗不可。
// ─────────────────────────────────────────────────────────────────────────

import { TIMEOUTS, type ValidatedInput } from './contract.ts';
import { buildGeminiRequestBody } from './prompt.ts';

/** model 名稱集中在這裡一處。 */
export const GEMINI_MODEL = 'gemini-flash-latest';

const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export type TransportFailure = 'TIMEOUT' | 'SERVICE_ERROR' | 'INVALID_RESPONSE';

export type TransportResult =
  | { ok: true; raw: unknown }
  | { ok: false; failure: TransportFailure; httpStatus?: number };

/** 測試用的注入點。預設是真的 fetch；測試一律傳 stub 進來。 */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

type GeminiResponseShape = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

/** responseMimeType 之下通常沒有圍籬，但模型偶爾還是會加。 */
function stripFence(raw: string): string {
  return raw.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
}

/**
 * 呼叫 Gemini。
 *
 * API key 只從呼叫端傳入（由 index.ts 從 `Deno.env` 讀），
 * **不出現在任何 log、任何回傳值、任何錯誤訊息裡**。
 * 它放在 header 而不是 query string —— query string 會被中間層記進 access log。
 */
export async function requestRecommendation(args: {
  apiKey: string;
  input: ValidatedInput;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<TransportResult> {
  const fetchImpl = args.fetchImpl ?? ((url, init) => fetch(url, init));
  const timeoutMs = args.timeoutMs ?? TIMEOUTS.geminiRequestMs;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetchImpl(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': args.apiKey,
      },
      body: JSON.stringify(buildGeminiRequestBody(args.input)),
      signal: controller.signal,
    });

    if (!res.ok) {
      // 只留 status。回應內容可能含 prompt 回音，不進 log、不回給 client。
      return { ok: false, failure: 'SERVICE_ERROR', httpStatus: res.status };
    }

    let data: GeminiResponseShape;
    try {
      data = await res.json() as GeminiResponseShape;
    } catch {
      return { ok: false, failure: 'INVALID_RESPONSE' };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    // 空回應多半是安全過濾擋掉了 —— 不是我們的 bug，但也不是可用的結果。
    // 回 `{}` 會讓下游寫出一份空白建議（generate-weekly-report 踩過這個坑）。
    if (typeof text !== 'string' || text.trim().length === 0) {
      return { ok: false, failure: 'INVALID_RESPONSE' };
    }

    try {
      // 刻意標成 unknown。呼叫端沒有辦法不驗就用。
      const raw: unknown = JSON.parse(stripFence(text));
      return { ok: true, raw };
    } catch {
      return { ok: false, failure: 'INVALID_RESPONSE' };
    }
  } catch (err) {
    // 自己的 timer 觸發的 abort 才算 TIMEOUT。
    // 呼叫端取消（未來若加上）不該被回報成逾時。
    if (timedOut) return { ok: false, failure: 'TIMEOUT' };
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, failure: 'TIMEOUT' };
    }
    return { ok: false, failure: 'SERVICE_ERROR' };
  } finally {
    clearTimeout(timer);
  }
}
