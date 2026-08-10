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

async function callGeminiOnce(prompt: string, model: string, jsonMode: boolean): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  if (jsonMode) {
    body.generationConfig = { responseMimeType: 'application/json' };
  }

  const res = await fetch(GEMINI_URL(model), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);

  const data = await res.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  return data.candidates[0]?.content.parts[0]?.text ?? '';
}

/**
 * 呼叫 Gemini，依 MODEL_CHAIN 逐一嘗試。
 * 遇到 429（配額）或 404（model 不存在）時換下一個 model；其他錯誤直接拋出。
 */
export async function callGemini(prompt: string, jsonMode = false): Promise<string> {
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
