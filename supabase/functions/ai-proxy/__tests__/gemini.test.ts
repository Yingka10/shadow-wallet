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

  it('404 也會換 model；其他錯誤直接拋出，不吞', async () => {
    fetchImpl = async () => errorResponse(500);
    const { callGeminiWithModel } = load();

    await expect(callGeminiWithModel('prompt')).rejects.toThrow('500');
    // 500 不是配額問題 —— 換 model 沒有意義，也會多花一次請求。
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
