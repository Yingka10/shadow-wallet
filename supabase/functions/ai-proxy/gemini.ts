// ai-proxy — Gemini transport layer。
//
// 只管「怎麼打到 Gemini、怎麼把回應轉成可以 JSON.parse 的字串」，
// 不認識任何領域概念（任務、願望、幣值）。每個 handler 檔案（wishClarify.ts、
// 未來可能拆出去的其他 handler）都從這裡 import callGemini / parseJson，
// 不要各自重複實作一份 fetch 邏輯。

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!;
const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

// 依序嘗試的 model 鏈：某個配額用盡（429）或不存在（404）時自動換下一個。
// 用 *-latest 別名當首選：它永遠指向 Google 當前可用的 flash，
// 不會被「舊 model 對新用戶下架」咬到（gemini-2.5-flash 已對新 key 下架）。
// 目前 gemini-flash-latest 實際指向 gemini-3.6-flash。
const MODEL_CHAIN = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.0-flash'];

// 沒有這個限制的話，Gemini 端網路卡住時 fetch 可能懸著不回應很久（遠超正常
// TCP timeout），家長會看著顧問聊天/週報轉圈轉很久才等到 fallback。硬性中斷
// 比等待「自然失敗」快得多、也更可預期——尤其是 Demo 現場網路不穩的時候。
const GEMINI_TIMEOUT_MS = 8000;

async function callGeminiOnce(prompt: string, model: string, jsonMode: boolean): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  if (jsonMode) {
    body.generationConfig = { responseMimeType: 'application/json' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(GEMINI_URL(model), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Gemini timed out after ${GEMINI_TIMEOUT_MS}ms (model ${model})`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);

  const data = await res.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  return data.candidates[0]?.content.parts[0]?.text ?? '';
}

/**
 * 呼叫 Gemini，依 MODEL_CHAIN 逐一嘗試。
 * 遇到 429（配額）或 404（model 不存在）時換下一個 model；其他錯誤直接拋出。
 *
 * 設 Edge Function secret `FORCE_AI_FALLBACK=true` 可以直接跳過 Gemini、
 * 立刻進入呼叫端既有的 fallback 路徑——排練 Demo Q&A、或想在沒有網路的
 * 環境下確認降級畫面長什麼樣子時用，正式環境不要設這個變數。
 */
export async function callGemini(prompt: string, jsonMode = false): Promise<string> {
  if (Deno.env.get('FORCE_AI_FALLBACK') === 'true') {
    throw new Error('FORCE_AI_FALLBACK enabled — skipping Gemini call');
  }
  let lastErr: unknown;
  for (const model of MODEL_CHAIN) {
    try {
      return await callGeminiOnce(prompt, model, jsonMode);
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      if (!msg.includes('429') && !msg.includes('404')) throw err;
      console.warn(`[ai-proxy] model ${model} 失敗，改試下一個：${msg.slice(0, 100)}`);
    }
  }
  throw lastErr;
}

export function parseJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(cleaned) as T;
}
