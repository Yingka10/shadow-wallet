// task-ai-recommendation — AI 任務調整建議
//
// ─────────────────────────────────────────────────────────────────────────
// ⚠️ 第八階段 B0：**尚未部署**。這是骨架，用來把設計釘成可讀的程式。
//    部署前要做的事見 README.md 的「部署前檢查」。
//
// 為什麼不加進既有的 ai-proxy：
//   - ai-proxy 混了六種用途，其中三種讓 LLM 直接決定幣值，
//     而這支的第一條規則就是「AI 碰不到幣值」。同一個檔案裡放兩種相反的
//     幣值哲學，遲早有人複製錯一段。
//   - ai-proxy 沒有 timeout、沒有 schema validation、prompt 用字串插值。
//     在那上面加功能等於繼承那三個問題。
//   - 這支需要自己的 timeout、自己的 validator、自己的 prompt 邊界。
//
// 這支**只做一件事**：拿一份任務草稿，回一組可選的文字調整建議。
// 它不寫任何資料表、不建立任務、不算幣、不讀錢包、不讀家庭歷史、
// 不用 service role。它讀得到的東西只有請求本身。
// ─────────────────────────────────────────────────────────────────────────

// @ts-ignore Deno 遠端匯入，本 repo 的 tsc 不編譯 supabase/functions
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import contract from './contract.json' with { type: 'json' };
import { buildGeminiRequestBody } from './prompt.ts';
import { rejectTaskAiInput } from './validateInput.ts';
import { unavailable, validateModelOutput } from './validateOutput.ts';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'gemini-flash-latest';
const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * 呼叫 Gemini，帶 timeout。
 *
 * ai-proxy 完全沒有這一段 —— 它的 fetch 沒有 signal，Gemini 掛住就一路掛住，
 * 家長端會看到一個永遠轉不完的圈。這裡用 AbortController 把上限釘死。
 *
 * **不重試、不換 model。** ai-proxy 的 MODEL_CHAIN 在配額用盡時逐一改試，
 * 三次串起來可以遠遠超過任何 timeout。對這個功能來說，等 30 秒拿到建議
 * 比 12 秒拿到「目前無法取得建議」更糟：後者家長可以直接繼續建立任務。
 */
async function callGemini(apiKey: string, input: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), contract.timeouts.geminiRequestMs);

  try {
    const res = await fetch(GEMINI_URL(apiKey), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildGeminiRequestBody(input)),
      signal: controller.signal,
    });

    if (!res.ok) {
      // 只留 status。回應內容可能含 prompt 回音，不進 log。
      console.warn(`[task-ai-recommendation] gemini http ${res.status}`);
      throw new HandledFailure('SERVICE_ERROR');
    }

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text || !text.trim()) {
      // 空回應通常是安全過濾擋掉了，不是我們的 bug，但也不是可用的結果。
      throw new HandledFailure('INVALID_RESPONSE');
    }

    try {
      // 這裡刻意 parse 成 unknown 再交給 validator。
      // ai-proxy 寫的是 `JSON.parse(cleaned) as T` —— 那個 cast 讓型別系統
      // 對整批資料失效，模型回什麼都會被當成合法。
      return JSON.parse(stripFence(text)) as unknown;
    } catch {
      throw new HandledFailure('INVALID_RESPONSE');
    }
  } catch (err) {
    if (err instanceof HandledFailure) throw err;
    if ((err as { name?: string }).name === 'AbortError') throw new HandledFailure('TIMEOUT');
    throw new HandledFailure('SERVICE_ERROR');
  } finally {
    clearTimeout(timer);
  }
}

/** responseMimeType 之下通常沒有圍籬，但模型偶爾還是會加。 */
function stripFence(raw: string): string {
  return raw.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
}

class HandledFailure extends Error {
  constructor(public readonly reason: 'TIMEOUT' | 'INVALID_RESPONSE' | 'SERVICE_ERROR' | 'UNSAFE_OUTPUT') {
    super(reason);
  }
}

/**
 * 確認呼叫者是登入中的使用者。
 *
 * 用 anon key + 呼叫者自己的 JWT，**不用 service role**：這支不需要
 * 任何跨使用者的讀取權限，拿了只會擴大它出事時的影響範圍。
 * 這裡也刻意不查 parents / children —— 這支不需要知道你是誰家的誰，
 * 只需要知道你是「一個登入中的人」。
 */
async function isAuthenticated(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;

  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await client.auth.getUser();
  return !error && !!data?.user;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    if (!(await isAuthenticated(req))) return json({ error: 'unauthorized' }, 401);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'bad_request' }, 400);
    }

    const input = (body as { input?: unknown } | null)?.input;

    const rejection = rejectTaskAiInput(input);
    if (rejection) {
      // detail 只進 log，不回給 client：那是我們的除錯資訊，
      // 對家長沒有意義，對想探測欄位結構的人則太有意義。
      console.warn(`[task-ai-recommendation] input rejected: ${rejection.code} — ${rejection.detail}`);
      return json({ error: 'bad_request' }, 400);
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      console.error('[task-ai-recommendation] GEMINI_API_KEY 未設定');
      return json(unavailable('SERVICE_ERROR'));
    }

    const raw = await callGemini(apiKey, input);

    // 第二道：模型回什麼都要過這裡。壞一項就整批 unavailable。
    return json(validateModelOutput(raw));
  } catch (err) {
    if (err instanceof HandledFailure) {
      console.warn(`[task-ai-recommendation] ${err.reason}`);
      // 注意 HTTP 仍是 200：AI 不可用是這個功能的正常狀態之一，
      // 不是錯誤。回 5xx 會讓 supabase-js 走 error 分支，
      // client 就分不出「服務掛了」和「服務說沒建議」。
      return json(unavailable(err.reason));
    }
    // 未預期的例外也不把原始訊息送到家長畫面。
    console.error('[task-ai-recommendation] unexpected:', err);
    return json(unavailable('SERVICE_ERROR'));
  }
});
