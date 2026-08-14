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
// 用 *-latest 別名：它們永遠指向 Google 當前可用的 flash，不會被
// 「舊 model 對新用戶下架」咬到（gemini-2.5-flash 已對新 key 下架）。
// 別名實際指向哪一個 model 由 Google 決定、會隨時間改變，所以這裡不寫死 ——
// 想知道當下是誰，看呼叫端記下來的 model 名稱（見 callGeminiWithModel）。
//
// 2026-08-14：第三順位 gemini-2.0-flash 移除。它已永久下架，實測固定回
// 404 no longer available，也不在這把 key 的 ListModels 清單裡 —— 留著等於
// 前兩個撞配額時最後一跳保證失敗，只是多花一次請求換一個更難讀的錯誤。
//
// 現在刻意只有兩個。要補第三順位的話，候選必須先在**當前 project/key**
// 上做過真實 capability smoke（一般呼叫 + JSON mode 都成功）才能加進來，
// 不能因為它出現在 model 清單或文件上就直接採用。
const MODEL_CHAIN = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

// 沒有這個限制的話，Gemini 端網路卡住時 fetch 可能懸著不回應很久（遠超正常
// TCP timeout），家長會看著顧問聊天/週報轉圈轉很久才等到 fallback。硬性中斷
// 比等待「自然失敗」快得多、也更可預期——尤其是 Demo 現場網路不穩的時候。
//
// 這是**預設值**，不是上限。所有既有呼叫端（週報、顧問、許願澄清、
// analyzeTask…）都沿用它，行為一個字都沒變。
export const GEMINI_TIMEOUT_MS = 8000;

async function callGeminiOnce(
  prompt: string,
  model: string,
  jsonMode: boolean,
  timeoutMs: number,
): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  if (jsonMode) {
    body.generationConfig = { responseMimeType: 'application/json' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
      throw new Error(`Gemini timed out after ${timeoutMs}ms (model ${model})`);
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
 * 呼叫 Gemini，依 MODEL_CHAIN 逐一嘗試，並回報**實際回答的那個 model**。
 *
 * 這是這個模組唯一真正做事的 public API。`callGemini` 只是它的薄包裝 ——
 * 兩支各自跑一次 MODEL_CHAIN 的話，重試策略會分岔，而
 * `FORCE_AI_FALLBACK` 這種「一定要對所有呼叫端生效」的開關就會漏掉一半。
 *
 * 遇到 429（配額）、404（model 不存在）或 503（該 model 過載）時換下一個
 * model；其他錯誤直接拋出。
 *
 * model 名稱要帶回去的理由：MODEL_CHAIN 會 fallback，所以「這段文字是誰寫的」
 * 不是固定的。要把它存進稽核紀錄（例如計畫版本的 ai_model）的呼叫端，
 * 必須拿到真的那一個，不能寫死首選 —— 否則紀錄會說是 flash-latest 寫的，
 * 而實際上那天首選掛了、答案來自 lite。
 *
 * 設 Edge Function secret `FORCE_AI_FALLBACK=true` 可以直接跳過 Gemini、
 * 立刻進入呼叫端既有的 fallback 路徑——排練 Demo Q&A、或想在沒有網路的
 * 環境下確認降級畫面長什麼樣子時用，正式環境不要設這個變數。
 *
 * `timeoutMs` 是**每一次** model 嘗試的上限，預設 8 秒。會需要它是因為
 * 這些呼叫的工作量差很多：classifyTask 要的是一個分類代號（實測約 4-5 秒），
 * 而 P0-3 的計畫草稿要模型讀完孩子的原話再回一整包結構化 JSON ——
 * 2026-08-11 的 staging 驗收顯示它穩定超過 8 秒，於是每一次都逾時，
 * 表面症狀是「AI 服務錯誤」而不是「太慢」。
 *
 * 放大成全域預設是錯的：那會讓顧問聊天與週報在網路不穩時多轉好幾秒，
 * 而它們本來就有 fallback、快點失敗才是對的。所以由呼叫端各自宣告預算。
 */
export async function callGeminiWithModel(
  prompt: string,
  jsonMode = false,
  timeoutMs: number = GEMINI_TIMEOUT_MS,
): Promise<{ text: string; model: string }> {
  // guard 放在這裡（而不是 callGemini），因為這裡是所有呼叫端最後會經過的
  // 同一個點。放在包裝層的話，直接用 callGeminiWithModel 的呼叫端
  // （P0-3 的計畫草稿）會繞過這個開關，而排練 Demo 時沒有人會發現。
  if (Deno.env.get('FORCE_AI_FALLBACK') === 'true') {
    throw new Error('FORCE_AI_FALLBACK enabled — skipping Gemini call');
  }
  let lastErr: unknown;
  for (const model of MODEL_CHAIN) {
    try {
      return { text: await callGeminiOnce(prompt, model, jsonMode, timeoutMs), model };
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      // 429 配額用盡、404 model 不存在、503 該 model 現在過載 ——
      // 三者的共通點是「換一個 model 有機會成功」。
      //
      // 503 是 2026-08-14 加的：實測 gemini-flash-latest 回
      // 「This model is currently experiencing high demand」而
      // gemini-flash-lite-latest 在同一秒是 200。少了這一條，整條鏈會在
      // 第一跳就放棄，而第二順位明明是好的 —— 所有呼叫端一起降級，
      // 卻不是因為配額也不是因為 model 不見了。
      if (!msg.includes('429') && !msg.includes('404') && !msg.includes('503')) throw err;
      console.warn(`[ai-proxy] model ${model} 失敗，改試下一個：${msg.slice(0, 100)}`);
    }
  }
  throw lastErr;
}

/**
 * 只要文字的呼叫端用這一支（週報、顧問聊天、許願澄清、既有 analyzeTask）。
 *
 * 行為與加上 model 回報之前**完全相同**：同一條 MODEL_CHAIN、同一個 8 秒
 * timeout、同一個 FORCE_AI_FALLBACK 開關、同樣把錯誤往外拋讓各自的
 * fallback 接住。差別只有它把 model 名稱丟掉。
 */
export async function callGemini(prompt: string, jsonMode = false): Promise<string> {
  const { text } = await callGeminiWithModel(prompt, jsonMode);
  return text;
}

export function parseJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(cleaned) as T;
}
