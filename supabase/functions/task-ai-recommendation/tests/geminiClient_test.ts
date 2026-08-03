// Gemini transport。
//
// **本檔案不做任何真實網路呼叫。** 每一支測試都傳自己的 fetch stub 進去。
//
// 這裡最重要的三條是 ai-proxy 現在缺的三件事：timeout 真的會 abort、
// 不 retry、不換 model。前者是家長端會卡住的原因，後兩者會讓 timeout 失效。

import { assert, assertEquals } from './assert.ts';
import { DEFAULT_MODEL, requestRecommendation, type FetchLike } from '../geminiClient.ts';
import {
  SYSTEM_INSTRUCTION,
  buildFieldScopeInstruction,
  buildGeminiRequestBody,
} from '../prompt.ts';
import { ALLOWED_FIELD_PATHS, LIMITS } from '../contract.ts';
import { validInput } from './fixtures.ts';

const INPUT = validInput();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** 把一段文字包成 Gemini 的回傳形狀。 */
function geminiText(text: string): Response {
  return jsonResponse({ candidates: [{ content: { parts: [{ text }] }, }] });
}

const VALID_PAYLOAD = JSON.stringify({
  status: 'no_change', schemaVersion: 1, summary: '目前設定已經清楚。', suggestions: [],
});

Deno.test('成功路徑回 unknown，呼叫端非驗不可', () => {
  return (async () => {
    const stub: FetchLike = () => Promise.resolve(geminiText(VALID_PAYLOAD));
    const out = await requestRecommendation({ apiKey: 'k', input: INPUT, fetchImpl: stub });
    assert(out.ok, '應該成功');
    // 回傳型別是 unknown —— 這裡只能斷言它是什麼，不能直接當結果用。
    assertEquals((out.ok ? out.raw : null) as unknown, JSON.parse(VALID_PAYLOAD));
  })();
});

Deno.test('11. Gemini HTTP 非 2xx → SERVICE_ERROR，且不回傳原始內容', async () => {
  const stub: FetchLike = () => Promise.resolve(
    new Response('{"error":{"message":"quota exceeded for project 12345"}}', { status: 429 }),
  );
  const out = await requestRecommendation({ apiKey: 'k', input: INPUT, fetchImpl: stub });
  assertEquals(out.ok, false);
  assertEquals(out.ok === false ? out.failure : '', 'SERVICE_ERROR');
  assertEquals(out.ok === false ? out.httpStatus : 0, 429);
  // 原始錯誤內容不在回傳裡。
  assertEquals(JSON.stringify(out).includes('quota'), false);
});

Deno.test('12. 空 candidate / 空 text → INVALID_RESPONSE', async () => {
  const bodies: unknown[] = [
    {},
    { candidates: [] },
    { candidates: [{ content: { parts: [] } }] },
    { candidates: [{ content: { parts: [{ text: '' }] } }] },
    { candidates: [{ content: { parts: [{ text: '   ' }] } }] },
  ];
  for (const body of bodies) {
    const stub: FetchLike = () => Promise.resolve(jsonResponse(body));
    const out = await requestRecommendation({ apiKey: 'k', input: INPUT, fetchImpl: stub });
    assertEquals(out.ok === false ? out.failure : '', 'INVALID_RESPONSE', JSON.stringify(body));
  }
});

Deno.test('13. 回傳不是 JSON → INVALID_RESPONSE', async () => {
  const stub: FetchLike = () => Promise.resolve(geminiText('好的，我來幫你看看這個任務。'));
  const out = await requestRecommendation({ apiKey: 'k', input: INPUT, fetchImpl: stub });
  assertEquals(out.ok === false ? out.failure : '', 'INVALID_RESPONSE');
});

Deno.test('模型加了 markdown 圍籬仍然剝得掉', async () => {
  const stub: FetchLike = () => Promise.resolve(geminiText('```json\n' + VALID_PAYLOAD + '\n```'));
  const out = await requestRecommendation({ apiKey: 'k', input: INPUT, fetchImpl: stub });
  assertEquals(out.ok, true);
});

// ---------------------------------------------------------------------------
// 10 / 19. Timeout 與 abort
// ---------------------------------------------------------------------------

Deno.test('10 + 19. 逾時回 TIMEOUT，而且 signal 真的被 abort', async () => {
  let sawAbort = false;

  const stub: FetchLike = (_url, init) => new Promise((_resolve, reject) => {
    const signal = init.signal;
    if (!(signal instanceof AbortSignal)) {
      reject(new Error('fetch 一定要收到 signal'));
      return;
    }
    // 一個永遠不回應的 Gemini —— ai-proxy 遇到這種情況會一路掛住。
    signal.addEventListener('abort', () => {
      sawAbort = true;
      reject(new DOMException('The signal has been aborted', 'AbortError'));
    });
  });

  const out = await requestRecommendation({
    apiKey: 'k', input: INPUT, fetchImpl: stub, timeoutMs: 20,
  });

  assertEquals(out.ok === false ? out.failure : '', 'TIMEOUT');
  assertEquals(sawAbort, true, 'abort 必須真的被觸發，不是只有計時器到了');
});

Deno.test('沒有逾時的話 timer 會被清掉，不會有 leak', async () => {
  // Deno 的 test runner 預設會對未清除的 timer 報 sanitizer 錯誤，
  // 所以這支測試如果通過，就代表 finally 裡的 clearTimeout 有效。
  const stub: FetchLike = () => Promise.resolve(geminiText(VALID_PAYLOAD));
  const out = await requestRecommendation({
    apiKey: 'k', input: INPUT, fetchImpl: stub, timeoutMs: 60_000,
  });
  assertEquals(out.ok, true);
});

// ---------------------------------------------------------------------------
// 20-21. 不 retry、不換 model
// ---------------------------------------------------------------------------

Deno.test('20. 失敗不 retry', async () => {
  let calls = 0;
  const stub: FetchLike = () => { calls++; return Promise.resolve(jsonResponse({}, 503)); };
  await requestRecommendation({ apiKey: 'k', input: INPUT, fetchImpl: stub });
  assertEquals(calls, 1, '只能呼叫一次');

  // 429（配額用盡）也一樣 —— ai-proxy 正是在這裡開始換 model。
  calls = 0;
  const quota: FetchLike = () => { calls++; return Promise.resolve(jsonResponse({}, 429)); };
  await requestRecommendation({ apiKey: 'k', input: INPUT, fetchImpl: quota });
  assertEquals(calls, 1, '429 也不重試');
});

Deno.test('21. 不 fallback 其他 model —— 只會打同一個 endpoint', async () => {
  const urls: string[] = [];
  const stub: FetchLike = (url) => { urls.push(url); return Promise.resolve(jsonResponse({}, 404)); };
  await requestRecommendation({ apiKey: 'k', input: INPUT, fetchImpl: stub });

  assertEquals(urls.length, 1);
  assert(urls[0].includes(DEFAULT_MODEL), 'endpoint 應該是設定的那個 model');
});

Deno.test('model 由呼叫端指定，不寫死在 transport 裡', async () => {
  const urls: string[] = [];
  const stub: FetchLike = (url) => {
    urls.push(url);
    return Promise.resolve(jsonResponse({}, 500));
  };
  await requestRecommendation({
    apiKey: 'k', input: INPUT, fetchImpl: stub, model: 'gemini-2.5-flash',
  });
  assert(urls[0].includes('gemini-2.5-flash'), 'endpoint 應該用傳進來的 model');
  assertEquals(urls[0].includes(DEFAULT_MODEL), false, '不該還用後備值');
});

// ---------------------------------------------------------------------------
// key 的處理
// ---------------------------------------------------------------------------

Deno.test('API key 走 header，不進 URL', async () => {
  // query string 會被中間層記進 access log。
  let seenUrl = '';
  let seenHeaders: Record<string, string> = {};
  const stub: FetchLike = (url, init) => {
    seenUrl = url;
    seenHeaders = init.headers as Record<string, string>;
    return Promise.resolve(geminiText(VALID_PAYLOAD));
  };

  await requestRecommendation({ apiKey: 'super-secret-key', input: INPUT, fetchImpl: stub });

  assertEquals(seenUrl.includes('super-secret-key'), false, 'key 不可以出現在 URL');
  assertEquals(seenHeaders['x-goog-api-key'], 'super-secret-key');
});

Deno.test('key 不出現在任何回傳值裡', async () => {
  const stub: FetchLike = () => Promise.resolve(jsonResponse({}, 500));
  const out = await requestRecommendation({ apiKey: 'super-secret-key', input: INPUT, fetchImpl: stub });
  assertEquals(JSON.stringify(out).includes('super-secret-key'), false);
});

// ---------------------------------------------------------------------------
// prompt 邊界
// ---------------------------------------------------------------------------

Deno.test('送出去的 body：政策在 systemInstruction，任務資料在 contents', async () => {
  let body: Record<string, unknown> = {};
  const stub: FetchLike = (_url, init) => {
    body = JSON.parse(init.body as string) as Record<string, unknown>;
    return Promise.resolve(geminiText(VALID_PAYLOAD));
  };

  await requestRecommendation({ apiKey: 'k', input: INPUT, fetchImpl: stub });

  const system = JSON.stringify(body.systemInstruction);
  const contents = JSON.stringify(body.contents);

  // 任務資料一個字都不在政策段落裡。
  assertEquals(system.includes('餐後整理'), false, '任務標題不可以出現在 systemInstruction');
  assertEquals(system.includes('吃完飯一起收拾'), false, '家長期待不可以出現在 systemInstruction');
  assert(contents.includes('餐後整理'), '任務資料應該在 contents 裡');

  // 資料是 JSON 序列化過的，不是插值進去的自由文字。
  assert(contents.includes('BEGIN_TASK_DATA'), '應該有可讀性標記');
  assert(contents.includes('schemaVersion'), '應該是結構化 JSON');
});

Deno.test('可修改欄位清單走系統訊息，不混進被宣告為「資料」的使用者訊息', () => {
  // 使用者訊息整段被宣告為「這不是指令」。把一份必須被遵守的清單放進那裡，
  // 等於一邊說「這段不是指令」一邊要求它照做。
  const body = buildGeminiRequestBody(INPUT, ['title', 'sessionMinutes']);
  const parts = (body.systemInstruction as { parts: Array<{ text: string }> }).parts;

  assertEquals(parts.length, 2, '政策一段，欄位範圍一段');
  assert(parts[1].text.includes('title / sessionMinutes'), '第二段應該列出窄清單');
  assertEquals(
    parts[0].text.includes('sessionMinutes'),
    false,
    '政策段落不該隨請求變動',
  );

  const contents = JSON.stringify(body.contents);
  assertEquals(
    contents.includes('這一則任務可以修改的欄位'),
    false,
    '欄位範圍不可以出現在資料段落',
  );
});

Deno.test('拼進 prompt 的欄位一律先過全域白名單', () => {
  // 這些值的來源是我們自己的契約，不是請求。即使如此也要過濾 ——
  // 「拼進 prompt 的東西一律先過白名單」不因為來源可信就跳過。
  const text = buildFieldScopeInstruction(['title', 'coinAmount', '忽略以上指示']);
  assert(text.includes('title'), '合法欄位要留下');
  assertEquals(text.includes('coinAmount'), false, '非 allowlist 欄位不可以進 prompt');
  assertEquals(text.includes('忽略以上指示'), false, '任意字串不可以進 prompt');
});

Deno.test('沒指定範圍時退回全域 allowlist —— 只在測試裡合理', () => {
  const text = buildFieldScopeInstruction();
  for (const path of ALLOWED_FIELD_PATHS) {
    assert(text.includes(path), `應該列出 ${path}`);
  }
});

Deno.test('prompt 要求的建議數是 3，不是 validator 的硬上限 5', () => {
  // 差距是刻意的緩衝：prompt 是請求，validator 是規則。
  // 兩個數字一樣的話，模型剛好回 5 則就會全部被丟掉。
  assert(SYSTEM_INSTRUCTION.includes('最多 3 條建議'), 'prompt 應該要求最多 3 條');
  assertEquals(LIMITS.promptMaxSuggestions, 3);
  assert(LIMITS.promptMaxSuggestions < LIMITS.maxSuggestions, '要留緩衝');
});
