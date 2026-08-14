// ai-proxy — Gemini transport 的三個能力必須同時成立
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支的存在理由是一次真實的合併衝突：
//
//   master 在 callGemini 上加了 8 秒 timeout 與 FORCE_AI_FALLBACK 開關，
//   P0-3 同時把 callGemini 拆成 callGeminiWithModel（要記真正回答的 model）。
//
// 兩邊都對，但只要合併時偏向任何一邊，就會安靜地少掉一個能力：
// timeout 掉了 → Demo 現場網路一卡就轉圈很久；
// FORCE_AI_FALLBACK 只掛在其中一支 → 排練時 P0-3 仍然會真的打 Gemini。
//
// 所以三件事一起釘住。Deno.env 與 fetch 都用替身，這支不碰網路。
// ─────────────────────────────────────────────────────────────────────────

type DenoLike = { env: { get(key: string): string | undefined } };

const env = new Map<string, string>();
let fetchCalls: string[] = [];
let fetchImpl: (url: string, init: RequestInit) => Promise<Response>;

function geminiResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  } as unknown as Response;
}

function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    text: async () => `boom ${status}`,
  } as unknown as Response;
}

beforeEach(() => {
  jest.resetModules();
  env.clear();
  env.set('GEMINI_API_KEY', 'test-key');
  fetchCalls = [];
  fetchImpl = async () => geminiResponse('hello');

  (globalThis as unknown as { Deno: DenoLike }).Deno = {
    env: { get: (key: string) => env.get(key) },
  };
  (globalThis as unknown as { fetch: unknown }).fetch = (url: string, init: RequestInit) => {
    fetchCalls.push(url);
    return fetchImpl(url, init);
  };
});

afterEach(() => {
  delete (globalThis as unknown as { Deno?: DenoLike }).Deno;
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
function load() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  return require('../gemini') as typeof import('../gemini');
}

// ---------------------------------------------------------------------------

describe('callGeminiWithModel 回真正回答的那個 model', () => {
  it('首選成功 → 就是首選', async () => {
    const { callGeminiWithModel } = load();
    const result = await callGeminiWithModel('prompt');

    expect(result.text).toBe('hello');
    expect(result.model).toBe('gemini-flash-latest');
    expect(fetchCalls).toHaveLength(1);
  });

  it('首選 429 → 換下一個，回報的是**實際回答的**那一個', async () => {
    let call = 0;
    fetchImpl = async () => {
      call += 1;
      return call === 1 ? errorResponse(429) : geminiResponse('from fallback');
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { callGeminiWithModel } = load();
    const result = await callGeminiWithModel('prompt');

    // 寫死首選的話，稽核紀錄會說是 flash-latest 寫的，而實際上不是。
    expect(result).toEqual({ text: 'from fallback', model: 'gemini-flash-lite-latest' });
    warn.mockRestore();
  });

  it('首選 404 → 一樣換下一個', async () => {
    let call = 0;
    fetchImpl = async () => {
      call += 1;
      return call === 1 ? errorResponse(404) : geminiResponse('from fallback');
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { callGeminiWithModel } = load();
    const result = await callGeminiWithModel('prompt');

    // 404 是「這個 model 對這把 key 不存在／已下架」—— 換一個是有意義的。
    expect(result).toEqual({ text: 'from fallback', model: 'gemini-flash-lite-latest' });
    expect(fetchCalls).toHaveLength(2);
    warn.mockRestore();
  });

  it('首選 503 → 換下一個（該 model 過載，不是整個服務掛了）', async () => {
    let call = 0;
    fetchImpl = async () => {
      call += 1;
      return call === 1 ? errorResponse(503) : geminiResponse('from fallback');
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { callGeminiWithModel } = load();
    const result = await callGeminiWithModel('prompt');

    // 2026-08-14 實測：gemini-flash-latest 回 503 high demand，而
    // gemini-flash-lite-latest 在同一秒是 200。少了這一條，整條鏈會在
    // 第一跳就放棄，而第二順位明明是好的。
    expect(result).toEqual({ text: 'from fallback', model: 'gemini-flash-lite-latest' });
    expect(fetchCalls).toHaveLength(2);
    warn.mockRestore();
  });

  it('503 之後 jsonMode 與自訂預算都還在', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const budgets: number[] = [];
    const real = globalThis.setTimeout;
    jest.spyOn(globalThis, 'setTimeout').mockImplementation(((
      fn: () => void, ms?: number, ...rest: unknown[]
    ) => {
      if (typeof ms === 'number') budgets.push(ms);
      return (real as unknown as (...a: unknown[]) => unknown)(fn, ms, ...rest);
    }) as unknown as typeof globalThis.setTimeout);

    let call = 0;
    fetchImpl = async (_url, init) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      call += 1;
      return call === 1 ? errorResponse(503) : geminiResponse('{}');
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { callGeminiWithModel } = load();
    await callGeminiWithModel('prompt', true, 15_000);

    expect(bodies[1].generationConfig).toEqual({ responseMimeType: 'application/json' });
    expect(budgets).toEqual([15_000, 15_000]);
    warn.mockRestore();
    jest.restoreAllMocks();
  });

  it('兩個都掛 → 拋**最後一個** model 的真實錯誤，而不是第一個', async () => {
    let call = 0;
    fetchImpl = async () => errorResponse((call += 1) === 1 ? 429 : 404);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { callGeminiWithModel } = load();
    const rejection = callGeminiWithModel('prompt');

    // 拋第一個的話，log 會說「配額用盡」，而實際上是最後那一跳 404。
    await expect(rejection).rejects.toThrow('404');
    await expect(rejection).rejects.not.toThrow('429');
    expect(fetchCalls).toHaveLength(2);
    warn.mockRestore();
  });

  it.each([
    [500, '伺服器自己壞了 —— 換 model 也是同一個後端'],
    [400, '請求本身有問題 —— 換 model 只會再被拒絕一次'],
    [403, '權限問題 —— 換 model 不會變得有權限'],
  ])('%s 直接拋出，不吞、不換 model（%s）', async (status) => {
    fetchImpl = async () => errorResponse(status);
    const { callGeminiWithModel } = load();

    await expect(callGeminiWithModel('prompt')).rejects.toThrow(String(status));
    expect(fetchCalls).toHaveLength(1);
  });

  it('網路層失敗也不換 model', async () => {
    fetchImpl = async () => {
      throw new TypeError('network request failed');
    };
    const { callGeminiWithModel } = load();

    // 連不出去的話，換 model 只是把同一個網路問題再撞一次。
    await expect(callGeminiWithModel('prompt')).rejects.toThrow('network request failed');
    expect(fetchCalls).toHaveLength(1);
  });
});

describe('callGemini 舊 API 行為不變', () => {
  it('只回文字', async () => {
    const { callGemini } = load();
    await expect(callGemini('prompt')).resolves.toBe('hello');
  });

  it('跑的是同一條 MODEL_CHAIN，不是自己複製一份', async () => {
    let call = 0;
    fetchImpl = async () => {
      call += 1;
      return call === 1 ? errorResponse(429) : geminiResponse('from fallback');
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { callGemini } = load();
    await expect(callGemini('prompt')).resolves.toBe('from fallback');
    warn.mockRestore();
  });

  it('jsonMode 會帶 responseMimeType', async () => {
    let body: Record<string, unknown> = {};
    fetchImpl = async (_url, init) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return geminiResponse('{}');
    };

    const { callGemini } = load();
    await callGemini('prompt', true);

    expect(body.generationConfig).toEqual({ responseMimeType: 'application/json' });
  });
});

describe('FORCE_AI_FALLBACK 對**兩支** public API 都生效', () => {
  it('callGemini 直接拋，不打 Gemini', async () => {
    env.set('FORCE_AI_FALLBACK', 'true');
    const { callGemini } = load();

    await expect(callGemini('prompt')).rejects.toThrow('FORCE_AI_FALLBACK');
    expect(fetchCalls).toHaveLength(0);
  });

  it('callGeminiWithModel 也一樣 —— 只掛在其中一支等於排練時漏掉一半', async () => {
    env.set('FORCE_AI_FALLBACK', 'true');
    const { callGeminiWithModel } = load();

    await expect(callGeminiWithModel('prompt')).rejects.toThrow('FORCE_AI_FALLBACK');
    expect(fetchCalls).toHaveLength(0);
  });

  it('沒設或不是 "true" 就正常呼叫', async () => {
    env.set('FORCE_AI_FALLBACK', 'false');
    const { callGemini } = load();

    await expect(callGemini('prompt')).resolves.toBe('hello');
    expect(fetchCalls).toHaveLength(1);
  });
});

describe('硬性 timeout 仍然在', () => {
  it('每一次呼叫都帶 AbortSignal', async () => {
    let signal: unknown;
    fetchImpl = async (_url, init) => {
      signal = init.signal;
      return geminiResponse('hello');
    };

    const { callGeminiWithModel } = load();
    await callGeminiWithModel('prompt');

    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('中止時給的是逾時訊息，不是原始的 AbortError', async () => {
    fetchImpl = async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    };

    const { callGeminiWithModel } = load();
    // 逾時訊息裡有毫秒數 —— log 讀起來才知道是撞到上限，不是網路斷了。
    await expect(callGeminiWithModel('prompt')).rejects.toThrow(/timed out after \d+ms/);
  });

  it('原始碼裡的上限沒有被拿掉', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'gemini.ts'),
      'utf8',
    ) as string;

    expect(source).toContain('GEMINI_TIMEOUT_MS = 8000');
    expect(source).toContain('clearTimeout(timer)');
  });
});

// ---------------------------------------------------------------------------
// 2026-08-11 staging 驗收發現的真實 bug：計畫草稿要模型回一整包結構化 JSON，
// 穩定超過 8 秒，於是**每一次**都逾時，而症狀是 SERVICE_ERROR ——
// 看起來像服務壞掉，實際上只是預算給錯了。
//
// 修法是讓預算變成每次呼叫的參數，預設仍是 8 秒。所以這裡要同時釘住
// 「新的呼叫端拿得到更長的預算」與「既有呼叫端一秒都沒有變」。
// ---------------------------------------------------------------------------

describe('timeout 預算由呼叫端決定，預設不變', () => {
  /** 攔 setTimeout，看實際掛上去的毫秒數。比操作假時鐘直接。 */
  function captureBudgets(): number[] {
    const budgets: number[] = [];
    const real = globalThis.setTimeout;
    jest.spyOn(globalThis, 'setTimeout').mockImplementation(((
      fn: () => void, ms?: number, ...rest: unknown[]
    ) => {
      if (typeof ms === 'number') budgets.push(ms);
      return (real as unknown as (...a: unknown[]) => unknown)(fn, ms, ...rest);
    }) as unknown as typeof globalThis.setTimeout);
    return budgets;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('callGemini 仍然是 8 秒 —— 週報、顧問、許願澄清一秒都沒變', async () => {
    const budgets = captureBudgets();
    const { callGemini } = load();
    await callGemini('prompt');

    expect(budgets).toEqual([8000]);
  });

  it('callGeminiWithModel 不給參數時也是 8 秒', async () => {
    const budgets = captureBudgets();
    const { callGeminiWithModel } = load();
    await callGeminiWithModel('prompt');

    expect(budgets).toEqual([8000]);
  });

  it('呼叫端給得起更長的預算', async () => {
    const budgets = captureBudgets();
    const { callGeminiWithModel } = load();
    await callGeminiWithModel('prompt', true, 15_000);

    expect(budgets).toEqual([15_000]);
  });

  it('換 model 重試時每一次都用同一個預算，不是只有第一次', async () => {
    let calls = 0;
    fetchImpl = async () => {
      calls += 1;
      return calls === 1 ? errorResponse(429) : geminiResponse('hi');
    };

    const budgets = captureBudgets();
    const { callGeminiWithModel } = load();
    await callGeminiWithModel('prompt', false, 15_000);

    expect(budgets).toEqual([15_000, 15_000]);
  });

  it('逾時訊息帶的是實際用的預算，不是寫死的 8000', async () => {
    fetchImpl = async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    };

    const { callGeminiWithModel } = load();
    await expect(callGeminiWithModel('prompt', true, 15_000))
      .rejects.toThrow(/timed out after 15000ms/);
  });
});

// ---------------------------------------------------------------------------
// 2026-08-14：第三順位 gemini-2.0-flash 已永久下架（實測固定 404、不在
// ListModels 裡）。它留在鏈上的唯一效果是「前兩個撞配額時保證再浪費一次
// 請求」。這一組釘住的是 **實際會被執行的那條鏈**，不只是原始碼字串 ——
// 只比對字串的話，有人把 model 名稱搬到別的常數再組回來就抓不到。
// ---------------------------------------------------------------------------

describe('可執行的 model chain 就是這兩個', () => {
  /** 從實際打出去的 URL 反推嘗試順序，比讀原始碼可靠。 */
  function attemptedModels(): string[] {
    return fetchCalls.map((url) => /models\/([^:]+):/.exec(url)?.[1] ?? url);
  }

  it('全部失敗時只嘗試兩個 model，沒有第三次請求', async () => {
    fetchImpl = async () => errorResponse(429);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { callGeminiWithModel } = load();
    await expect(callGeminiWithModel('prompt')).rejects.toThrow('429');

    expect(attemptedModels()).toEqual(['gemini-flash-latest', 'gemini-flash-lite-latest']);
    warn.mockRestore();
  });

  it('已下架的 gemini-2.0-flash 不在鏈上，也不在原始碼裡', async () => {
    fetchImpl = async () => errorResponse(429);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { callGeminiWithModel } = load();
    await expect(callGeminiWithModel('prompt')).rejects.toThrow();
    expect(attemptedModels()).not.toContain('gemini-2.0-flash');
    warn.mockRestore();

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'gemini.ts'),
      'utf8',
    ) as string;
    // 註解裡寫「為什麼移除」是可以的，被 MODEL_CHAIN 讀到就不行。
    const chainLine = /const MODEL_CHAIN = \[[^\]]*\]/.exec(source)?.[0] ?? '';
    expect(chainLine).not.toContain('gemini-2.0-flash');
  });

  it('jsonMode 在 fallback 之後仍然生效', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    fetchImpl = async (_url, init) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      call += 1;
      return call === 1 ? errorResponse(429) : geminiResponse('{}');
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { callGeminiWithModel } = load();
    const result = await callGeminiWithModel('prompt', true);

    // 第二跳掉了 responseMimeType 的話，回來的會是帶 ``` 的散文，
    // parseJson 直接炸掉 —— 而且只在首選撞配額那天才會發生。
    expect(result.model).toBe('gemini-flash-lite-latest');
    expect(bodies).toHaveLength(2);
    expect(bodies[1].generationConfig).toEqual({ responseMimeType: 'application/json' });
    warn.mockRestore();
  });
});

describe('沒有第二份 MODEL_CHAIN', () => {
  it('整支檔案只宣告一次', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'gemini.ts'),
      'utf8',
    ) as string;

    expect(source.match(/const MODEL_CHAIN/g) ?? []).toHaveLength(1);
    // callGemini 是薄包裝：它自己不跑迴圈。
    expect(source.match(/for \(const model of MODEL_CHAIN\)/g) ?? []).toHaveLength(1);
  });
});
