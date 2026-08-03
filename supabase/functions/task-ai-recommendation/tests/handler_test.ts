// HTTP handler。
//
// **本檔案不做任何真實網路呼叫。** globalThis.fetch 被換掉，
// GoTrue 與 Gemini 兩邊都由 stub 依 URL 分流。
//
// 這裡最在意的兩件事：
//   1. 400 / 401 / 405 / 500 **不可以**長得像一個有效的 AI 結果
//   2. log 裡不可以出現任務內容或 token

import { assert, assertEquals, assertNotStringIncludes } from './assert.ts';
import { handleRequest } from '../handler.ts';
import { taskById } from './fixtures.ts';

const REAL_FETCH = globalThis.fetch;
const REAL_LOG = console.log;

const SUPABASE_URL = 'https://example-project.supabase.co';
const VALID_TOKEN = 'valid-token-for-tests';

Deno.env.set('SUPABASE_URL', SUPABASE_URL);
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key-for-tests');
Deno.env.set('GEMINI_API_KEY', 'gemini-key-for-tests');

// B2A.5 起，happy path 必須用一個**通過使用範圍閘門**的任務。
// 「餐後整理」是家庭參與類，第一版不開放 —— 它現在的正確結果是 NOT_ELIGIBLE，
// 所以它在下面成了「不符合資格」那組測試的樣本，不再是 happy path。
const TASK = taskById('sport-practice');
const INELIGIBLE_TASK = taskById('after-meal-tidy');

const VALID_BODY = () => JSON.stringify({ input: TASK.input });

const NO_CHANGE = {
  status: 'no_change', schemaVersion: 1, summary: '目前設定已經清楚。', suggestions: [],
};

const SUGGESTIONS = {
  status: 'suggestions', schemaVersion: 1, summary: '一個地方可以更清楚。',
  suggestions: [{
    id: 's1', kind: 'clarify_completion', fieldPath: 'completionDescription',
    currentValue: '認真做', suggestedValue: '把碗筷收到水槽並擦好桌面',
    rationale: '「認真做」很難判斷做到了沒。',
    expectedBenefit: 'clearer_expectation', confidence: 'high',
  }],
};

type Stubs = {
  authOk?: boolean;
  gemini?: () => Promise<Response>;
  /** 限流 RPC 的回傳。預設放行。 */
  quota?: () => Promise<Response>;
};

/** 換掉 globalThis.fetch，依 URL 把 GoTrue、限流 RPC 與 Gemini 分開。 */
function installFetch(stubs: Stubs): void {
  const authOk = stubs.authOk ?? true;

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    // 限流 RPC 與 GoTrue 在**同一個 host**，只有 path 不同 ——
    // 先分 path 再分 host，否則 RPC 會被當成一次 auth 查詢。
    if (url.includes('/rest/v1/rpc/')) {
      return (stubs.quota ?? (() => Promise.resolve(jsonResponse({ allowed: true }))))();
    }

    if (url.startsWith(SUPABASE_URL)) {
      // GoTrue：帶對 token 才回 user。只看 header 存不存在是不夠的。
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      const auth = headers.get('Authorization') ?? '';
      const good = authOk && auth === `Bearer ${VALID_TOKEN}`;
      return Promise.resolve(new Response(
        JSON.stringify(good
          ? { id: 'user-under-test', aud: 'authenticated' }
          : { message: 'invalid claim' }),
        { status: good ? 200 : 401, headers: { 'content-type': 'application/json' } },
      ));
    }

    if (url.includes('generativelanguage.googleapis.com')) {
      return (stubs.gemini ?? (() => Promise.resolve(geminiText(JSON.stringify(NO_CHANGE)))))();
    }

    return Promise.reject(new Error(`測試不該打到這個網址：${url}`));
  }) as typeof fetch;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function geminiText(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function restore(): void {
  globalThis.fetch = REAL_FETCH;
  console.log = REAL_LOG;
}

function post(body: string, token: string | null = VALID_TOKEN): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return new Request('https://fn.test/task-ai-recommendation', { method: 'POST', headers, body });
}

/** 跑一次 handler，同時收集 console.log 的內容。 */
async function run(req: Request, stubs: Stubs = {}): Promise<{ res: Response; body: Record<string, unknown>; logs: string }> {
  installFetch(stubs);
  const logs: string[] = [];
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  try {
    const res = await handleRequest(req);
    const text = await res.text();
    return { res, body: text ? JSON.parse(text) as Record<string, unknown> : {}, logs: logs.join('\n') };
  } finally {
    restore();
  }
}

// ---------------------------------------------------------------------------
// 1-3. Method
// ---------------------------------------------------------------------------

Deno.test('1 + 8. POST 合法請求 → 200 並帶 result', async () => {
  const { res, body } = await run(post(VALID_BODY()), {
    gemini: () => Promise.resolve(geminiText(JSON.stringify(SUGGESTIONS))),
  });
  assertEquals(res.status, 200);
  assertEquals((body.result as Record<string, unknown>).status, 'suggestions');
  assert(typeof body.requestId === 'string', '應該有 requestId');
  assertEquals(body.error, undefined);
});

Deno.test('2. OPTIONS → 200 且帶 CORS，但不放寬 credentials', async () => {
  const res = await handleRequest(
    new Request('https://fn.test/x', { method: 'OPTIONS' }),
  );
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
  assertEquals(res.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
  // `*` 搭配 credentials 是瀏覽器會拒絕的組合；設了它就得把 origin 改成回音式的，
  // 那等於對任意站台開放帶憑證的請求。這支用 Authorization header，不需要 cookie。
  assertEquals(res.headers.get('Access-Control-Allow-Credentials'), null);
});

Deno.test('3. GET → 405，而且不長得像 AI 結果', async () => {
  const res = await handleRequest(new Request('https://fn.test/x', { method: 'GET' }));
  const body = await res.json() as Record<string, unknown>;

  assertEquals(res.status, 405);
  assertEquals((body.error as Record<string, unknown>).code, 'method_not_allowed');
  // 沒有 result、沒有 status、沒有 suggestions —— 漏檢查 HTTP code 的 client
  // 也沒有辦法把它讀成「AI 說沒有建議」。
  assertEquals(body.result, undefined);
  assertEquals(body.status, undefined);
  assertEquals(body.suggestions, undefined);
});

// ---------------------------------------------------------------------------
// 4-5. Auth
// ---------------------------------------------------------------------------

Deno.test('4. 沒有 token → 401', async () => {
  const { res, body } = await run(post(VALID_BODY(), null));
  assertEquals(res.status, 401);
  assertEquals((body.error as Record<string, unknown>).code, 'unauthorized');
  assertEquals(body.result, undefined);
});

Deno.test('4b. 有 header 但是空的 → 401（不是只看 header 存不存在）', async () => {
  for (const token of ['', '   ']) {
    const { res } = await run(post(VALID_BODY(), token));
    assertEquals(res.status, 401, `token「${token}」應該被拒`);
  }
});

Deno.test('5. token 無效 → 401（真的問過 GoTrue）', async () => {
  const { res, body } = await run(post(VALID_BODY(), 'forged-token'));
  assertEquals(res.status, 401);
  assertEquals(body.result, undefined);
});

Deno.test('5b. GoTrue 掛掉時不放行 ——「驗不了」不等於「通過」', async () => {
  installFetch({});
  const broken = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error('network down'))) as typeof fetch;
  try {
    const res = await handleRequest(post(VALID_BODY()));
    assertEquals(res.status, 401);
  } finally {
    globalThis.fetch = broken;
    restore();
  }
});

// ---------------------------------------------------------------------------
// 6-7. Body 與 input
// ---------------------------------------------------------------------------

Deno.test('6. body 不是 JSON → 400', async () => {
  const { res, body } = await run(post('這不是 JSON'));
  assertEquals(res.status, 400);
  assertEquals((body.error as Record<string, unknown>).code, 'bad_request');
  assertEquals(body.result, undefined);
});

Deno.test('7. input 不合法 → 400', async () => {
  const cases: string[] = [
    JSON.stringify({}),
    JSON.stringify({ input: null }),
    JSON.stringify({ input: { schemaVersion: 2 } }),
    JSON.stringify({ input: { ...TASK.input, childNickname: '承恩' } }),
  ];
  for (const body of cases) {
    const { res } = await run(post(body));
    assertEquals(res.status, 400, body.slice(0, 60));
  }
});

Deno.test('7b. body 過大 → 400，而且不會打到 Gemini', async () => {
  let geminiCalled = false;
  const huge = JSON.stringify({ input: TASK.input, padding: 'x'.repeat(20_000) });
  const { res } = await run(post(huge), {
    gemini: () => { geminiCalled = true; return Promise.resolve(geminiText('{}')); },
  });
  assertEquals(res.status, 400);
  assertEquals(geminiCalled, false, '超大的 body 不該花錢');
});

// ---------------------------------------------------------------------------
// 9-13. AI 結果一律 200
// ---------------------------------------------------------------------------

Deno.test('9. no_change → 200', async () => {
  const { res, body } = await run(post(VALID_BODY()));
  assertEquals(res.status, 200);
  assertEquals((body.result as Record<string, unknown>).status, 'no_change');
});

Deno.test('10-13. 各種 AI 失敗都是 200 + unavailable', async () => {
  const cases: Array<[string, Stubs['gemini'], string]> = [
    ['Gemini 500', () => Promise.resolve(new Response('{}', { status: 500 })), 'SERVICE_ERROR'],
    ['空回應', () => Promise.resolve(geminiText('')), 'INVALID_RESPONSE'],
    ['不是 JSON', () => Promise.resolve(geminiText('好的，我來看看')), 'INVALID_RESPONSE'],
    ['schema 不符', () => Promise.resolve(geminiText('{"status":"jailbroken","schemaVersion":1}')), 'INVALID_RESPONSE'],
  ];

  for (const [name, gemini, reason] of cases) {
    const { res, body } = await run(post(VALID_BODY()), { gemini });
    const result = body.result as Record<string, unknown>;
    // HTTP 一律 200：AI 不可用是正常狀態，不是錯誤。
    // 回 5xx 會讓 supabase-js 走 error 分支，client 就分不出
    // 「服務掛了」和「服務說沒有建議」。
    assertEquals({ name, status: res.status, reason: result.reason }, { name, status: 200, reason });
  }
});

Deno.test('16 + 25. 想改幣值 / 內容不安全 → 200 + UNSAFE_OUTPUT', async () => {
  const coin = {
    status: 'suggestions', schemaVersion: 1, summary: '建議給一點成長幣。',
    suggestions: [{
      id: 's1', kind: 'clarify_completion', fieldPath: 'coinAmount',
      currentValue: null, suggestedValue: 12, rationale: '孩子比較有動力。',
      expectedBenefit: 'more_achievable', confidence: 'high',
    }],
  };
  // 刻意落在**合法且開放**的欄位上：這樣被擋下的原因只可能是內容安全，
  // 不會被 allowlist 順手擋掉而讓這條測試變成在測別的東西。
  const unsafe = {
    status: 'suggestions', schemaVersion: 1, summary: '可以再具體一點。',
    suggestions: [{
      id: 's1', kind: 'clarify_completion', fieldPath: 'completionDescription',
      currentValue: '完成當天的練習內容',
      suggestedValue: '練習完成後自己清理瓦斯爐台面',
      rationale: '順便養成收拾的習慣。',
      expectedBenefit: 'more_autonomy', confidence: 'medium',
    }],
  };

  for (const payload of [coin, unsafe]) {
    const { res, body } = await run(post(VALID_BODY()), {
      gemini: () => Promise.resolve(geminiText(JSON.stringify(payload))),
    });
    const result = body.result as Record<string, unknown>;
    assertEquals(res.status, 200);
    assertEquals(result.reason, 'UNSAFE_OUTPUT');
    assertEquals((result.suggestions as unknown[]).length, 0);
    // 不安全的原文不會流到家長畫面。
    assertNotStringIncludes(JSON.stringify(body.result), '瓦斯');
  }
});

// ---------------------------------------------------------------------------
// 500：設定缺失
// ---------------------------------------------------------------------------

Deno.test('缺少 server 設定 → 500，不是假裝成 unavailable', async () => {
  const saved = Deno.env.get('GEMINI_API_KEY')!;
  Deno.env.delete('GEMINI_API_KEY');
  try {
    const { res, body } = await run(post(VALID_BODY()));
    // 回 unavailable 會讓它看起來像「AI 暫時沒空」，於是沒有人去修。
    assertEquals(res.status, 500);
    assertEquals((body.error as Record<string, unknown>).code, 'server_misconfigured');
    assertEquals(body.result, undefined);
  } finally {
    Deno.env.set('GEMINI_API_KEY', saved);
  }
});

// ---------------------------------------------------------------------------
// 22-23. Log redaction
// ---------------------------------------------------------------------------

Deno.test('22 + 23. log 不含任務內容、prompt 或 token', async () => {
  const { logs } = await run(post(VALID_BODY()), {
    gemini: () => Promise.resolve(geminiText(JSON.stringify(SUGGESTIONS))),
  });

  assert(logs.length > 0, '應該有 log');

  const mustNotAppear = [
    VALID_TOKEN,                    // token
    'gemini-key-for-tests',         // API key
    'anon-key-for-tests',
    '運動練習',                      // 任務標題
    '每週三次的運動習慣',             // 家長原始期待
    '完成當天的練習內容',             // 完成標準
    '週二、週四、週六',               // 排程描述
    '把碗筷收到水槽並擦好桌面',        // 模型建議原文
    'BEGIN_TASK_DATA',              // prompt 片段
    'GrowBook 的親子任務設計協作者',   // system instruction 片段
    'user-under-test',              // user id
  ];
  for (const secret of mustNotAppear) {
    assertNotStringIncludes(logs, secret, `log 洩漏了：${secret}`);
  }
});

Deno.test('log 記的是可稽核的統計，不是內容', async () => {
  const { logs } = await run(post(VALID_BODY()), {
    gemini: () => Promise.resolve(geminiText(JSON.stringify(SUGGESTIONS))),
  });
  const entry = JSON.parse(logs.trim().split('\n').pop()!) as Record<string, unknown>;

  assertEquals(entry.fn, 'task-ai-recommendation');
  assertEquals(entry.outcome, 'suggestions');
  assertEquals(entry.suggestionCount, 1);
  assert(typeof entry.latencyMs === 'number', '應該有 latency');
  assert(typeof entry.requestId === 'string', '應該有 requestId');
});

Deno.test('驗證失敗時 log 只有分類代碼，沒有 detail 文字', async () => {
  const { logs } = await run(post(JSON.stringify({ input: { ...TASK.input, childNickname: '承恩' } })));
  assertNotStringIncludes(logs, '承恩');
  assertNotStringIncludes(logs, 'childNickname');
  // 只留代碼。
  assert(logs.includes('FORBIDDEN_FIELD'), '應該記下分類代碼');
});

// ---------------------------------------------------------------------------
// B2A.5 — 總開關、使用範圍、限流
// ---------------------------------------------------------------------------

Deno.test('總開關關閉 → 200 + SERVICE_DISABLED，而且完全不打 Gemini', async () => {
  let geminiCalled = false;
  Deno.env.set('TASK_AI_ENABLED', 'false');
  try {
    const { res, body } = await run(post(VALID_BODY()), {
      gemini: () => { geminiCalled = true; return Promise.resolve(geminiText('{}')); },
    });
    const result = body.result as Record<string, unknown>;
    assertEquals(res.status, 200);
    assertEquals(result.reason, 'SERVICE_DISABLED');
    assertEquals(geminiCalled, false, '關掉之後不該再花任何一毛錢');
  } finally {
    Deno.env.delete('TASK_AI_ENABLED');
  }
});

Deno.test('總開關設成看不懂的值 → 視為關閉（不對稱是刻意的）', async () => {
  Deno.env.set('TASK_AI_ENABLED', 'flase');
  try {
    const { body } = await run(post(VALID_BODY()));
    assertEquals((body.result as Record<string, unknown>).reason, 'SERVICE_DISABLED');
  } finally {
    Deno.env.delete('TASK_AI_ENABLED');
  }
});

Deno.test('沒設總開關 → 預設開啟（既有部署不會因為少一個變數就整個消失）', async () => {
  assertEquals(Deno.env.get('TASK_AI_ENABLED'), undefined);
  const { body } = await run(post(VALID_BODY()));
  assertEquals((body.result as Record<string, unknown>).status, 'no_change');
});

Deno.test('不符合資格的任務 → NOT_ELIGIBLE，且不消耗 Gemini 也不消耗額度', async () => {
  let geminiCalled = false;
  let quotaCalled = false;

  const { res, body } = await run(
    post(JSON.stringify({ input: INELIGIBLE_TASK.input })),
    {
      gemini: () => { geminiCalled = true; return Promise.resolve(geminiText('{}')); },
      quota: () => { quotaCalled = true; return Promise.resolve(jsonResponse({ allowed: true })); },
    },
  );

  const result = body.result as Record<string, unknown>;
  assertEquals(res.status, 200);
  assertEquals(result.reason, 'NOT_ELIGIBLE');
  assertEquals(geminiCalled, false, '不符合資格不該呼叫付費模型');
  // 這一條是 §九 執行順序的重點：不符合資格**不是家長的錯**，
  // 不該扣掉他今天的額度。
  assertEquals(quotaCalled, false, '不符合資格不該消耗額度');
});

Deno.test('超過額度 → 429 + Retry-After，且不打 Gemini', async () => {
  let geminiCalled = false;
  const { res, body } = await run(post(VALID_BODY()), {
    gemini: () => { geminiCalled = true; return Promise.resolve(geminiText('{}')); },
    quota: () => Promise.resolve(jsonResponse({
      allowed: false, reason: 'RATE_LIMITED', retry_after_seconds: 240,
    })),
  });

  assertEquals(res.status, 429);
  assertEquals(res.headers.get('Retry-After'), '240');
  const error = body.error as Record<string, unknown>;
  assertEquals(error.code, 'rate_limited');
  assertEquals(error.retryAfterSeconds, 240);
  // 429 走的是 error envelope，不是 result —— 一個漏看 HTTP code 的 client
  // 不可以把「你太快了」讀成「AI 說沒有建議」。
  assertEquals(body.result, undefined);
  assertEquals(geminiCalled, false, '被限流就不該花錢');
});

Deno.test('限流回應不洩漏目前用量或上限', async () => {
  const { body, logs } = await run(post(VALID_BODY()), {
    quota: () => Promise.resolve(jsonResponse({
      allowed: false, reason: 'RATE_LIMITED', retry_after_seconds: 60,
      // 就算 RPC 哪天多回了這些欄位，handler 也不該把它們轉出去。
      request_count: 41, limit: 40,
    })),
  });

  // 只看 error 物件本身：requestId 是一串 UUID，裡面出現任何兩位數字都
  // 只是巧合，拿整包 body 去比對數字會變成一條會隨機失敗的測試。
  const error = body.error as Record<string, unknown>;
  assertEquals(Object.keys(error).sort(), ['code', 'retryAfterSeconds']);
  assertEquals(error.retryAfterSeconds, 60);

  assertNotStringIncludes(JSON.stringify(error), 'request_count');
  assertNotStringIncludes(logs, 'request_count');
  assertNotStringIncludes(logs, '"limit"');
});

Deno.test('限流 RPC 壞掉 → 不放行（壞掉的限流不可以等於沒有限流）', async () => {
  let geminiCalled = false;
  const { res, body } = await run(post(VALID_BODY()), {
    gemini: () => { geminiCalled = true; return Promise.resolve(geminiText('{}')); },
    quota: () => Promise.resolve(jsonResponse({ message: 'function does not exist' }, 404)),
  });

  assertEquals(res.status, 200);
  assertEquals((body.result as Record<string, unknown>).reason, 'SERVICE_ERROR');
  assertEquals(geminiCalled, false, 'migration 沒套用時，寧可整個功能不可用');
});

Deno.test('通過限流的請求，額度只被消耗一次', async () => {
  let calls = 0;
  await run(post(VALID_BODY()), {
    quota: () => { calls += 1; return Promise.resolve(jsonResponse({ allowed: true })); },
  });
  assertEquals(calls, 1, '一次請求只能扣一次');
});

Deno.test('unavailable 的 reason 會進 log（那是我們要看的東西）', async () => {
  const { logs } = await run(post(VALID_BODY()), {
    gemini: () => Promise.resolve(new Response('{}', { status: 503 })),
  });
  assert(logs.includes('SERVICE_ERROR'), 'reason 應該進 log');
  assert(logs.includes('503'), 'httpStatus 應該進 log');
});
