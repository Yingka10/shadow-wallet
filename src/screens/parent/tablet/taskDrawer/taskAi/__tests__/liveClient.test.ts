// 第八階段 B2B — 3-4, 27, 31-39. Live adapter
//
// Edge Function 的正式契約：
//
//   200      { requestId, result }
//   4xx/5xx  { requestId, error: { code, retryAfterSeconds? } }
//
// 這一支要證明每一種都被分開處理。**全部壓成同一個 console.error 的話**，
// 登入過期會顯示成「目前無法取得建議」，家長重試一百次都不會成功。
//
// 不需要 Supabase 的 URL 或金鑰：adapter 吃的是一支 invoke 函式，
// 所以測試不會連上網，也不會有人不小心讓 CI 呼叫真的模型。

import {
  LiveTaskAiRecommendationClient,
  type InvokeTaskAiFunction,
  type TaskAiClientOutcome,
  type TaskAiRecommendationInput,
} from '../index';

const INPUT: TaskAiRecommendationInput = {
  schemaVersion: 1,
  childContext: { ageGroup: '6-9' },
  taskContext: {
    editorKind: 'recurring',
    purposeCategory: 'learning_skill',
    durationType: 'recurring',
    source: 'parent',
    rewardPolicy: 'coin_eligible',
    completionPolicy: 'ongoing',
  },
  parentIntent: { originalExpectation: '希望孩子慢慢養成閱讀習慣' },
  currentDraft: {
    title: '每天閱讀',
    completionDescription: '認真讀',
    scheduleSummary: '固定在週一、週三、週五',
    selectedOptions: {},
  },
  immutablePolicies: {
    purposeCategory: 'learning_skill',
    rewardPolicy: 'coin_eligible',
    blockedFields: ['rewardPolicy', 'coinAmount'],
  },
};

const VALID_RESULT = {
  status: 'suggestions',
  schemaVersion: 1,
  summary: '有一個地方可以更清楚。',
  suggestions: [
    {
      id: 'sug-1',
      kind: 'clarify_completion',
      fieldPath: 'completionDescription',
      currentValue: '認真讀',
      suggestedValue: '把讀到的一段講給家人聽',
      rationale: '「認真讀」很難判斷做到了沒。',
      expectedBenefit: 'clearer_expectation',
      confidence: 'high',
    },
  ],
};

/** 假的 FunctionsHttpError：supabase-js 把原始 Response 放在 context。 */
function httpError(status: number, body?: unknown, headers?: Record<string, string>) {
  return {
    name: 'FunctionsHttpError',
    context: new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      ...(headers ? { headers } : null),
    }),
  };
}

function clientReturning(
  data: unknown,
  error: unknown = null,
): { client: LiveTaskAiRecommendationClient; calls: number } {
  const state = { calls: 0 };
  const invoke: InvokeTaskAiFunction = async () => {
    state.calls += 1;
    return { data, error };
  };
  return { client: new LiveTaskAiRecommendationClient(invoke), get calls() { return state.calls; } };
}

async function outcomeOf(data: unknown, error: unknown = null): Promise<TaskAiClientOutcome> {
  return clientReturning(data, error).client.recommend(INPUT);
}

// ---------------------------------------------------------------------------
// 31-32. 200
// ---------------------------------------------------------------------------

describe('31-32. 200 envelope', () => {
  it('suggestions 從 result 取出來', async () => {
    const outcome = await outcomeOf({ requestId: 'req-1', result: VALID_RESULT });
    expect(outcome.kind).toBe('result');
    if (outcome.kind !== 'result') throw new Error('預期 result');
    expect(outcome.result.status).toBe('suggestions');
    expect(outcome.result.suggestions).toHaveLength(1);
  });

  it('no_change', async () => {
    const outcome = await outcomeOf({
      requestId: 'req-1',
      result: { status: 'no_change', schemaVersion: 1, summary: '已經很清楚。', suggestions: [] },
    });
    if (outcome.kind !== 'result') throw new Error('預期 result');
    expect(outcome.result.status).toBe('no_change');
  });

  it('requestId 不會流到 App 的狀態裡 —— 它只對 server log 有用', async () => {
    const outcome = await outcomeOf({ requestId: 'req-secret', result: VALID_RESULT });
    expect(JSON.stringify(outcome)).not.toContain('req-secret');
  });
});

// ---------------------------------------------------------------------------
// 34-35. 不 cast
// ---------------------------------------------------------------------------

describe('34-35. server 驗過了，client 仍然再驗一次', () => {
  it('形狀壞掉的 result → INVALID_RESPONSE，不是直接當成有效', async () => {
    const outcome = await outcomeOf({
      requestId: 'r',
      result: { status: 'suggestions', schemaVersion: 1, summary: 'x', suggestions: [{ id: 'a' }] },
    });
    if (outcome.kind !== 'result') throw new Error('預期 result');
    expect(outcome.result).toEqual({
      status: 'unavailable', schemaVersion: 1, reason: 'UNSAFE_OUTPUT', suggestions: [],
    });
  });

  it('想改幣值的建議整批被擋下來', async () => {
    const outcome = await outcomeOf({
      requestId: 'r',
      result: {
        status: 'suggestions',
        schemaVersion: 1,
        summary: '建議調整幣值。',
        suggestions: [{
          id: 'sug-coin', kind: 'reduce_scope', fieldPath: 'rewardCoinAmount',
          currentValue: 12, suggestedValue: 30, rationale: '孩子會更有動力。',
          expectedBenefit: 'more_achievable', confidence: 'high',
        }],
      },
    });
    if (outcome.kind !== 'result') throw new Error('預期 result');
    expect(outcome.result.status).toBe('unavailable');
    expect(outcome.result.suggestions).toEqual([]);
  });

  it('envelope 本身不對也不會炸開', async () => {
    for (const data of [null, 'ok', 42, {}, { requestId: 'r' }]) {
      const outcome = await outcomeOf(data);
      if (outcome.kind !== 'result') throw new Error('預期 result');
      expect(outcome.result.status).toBe('unavailable');
    }
  });
});

// ---------------------------------------------------------------------------
// 37-38. HTTP 錯誤
// ---------------------------------------------------------------------------

describe('37-38. HTTP 狀態各自對應不同的處置', () => {
  it('429 → rate_limited，並帶上 body 裡的秒數', async () => {
    const outcome = await outcomeOf(
      null,
      httpError(429, { requestId: 'r', error: { code: 'rate_limited', retryAfterSeconds: 120 } }),
    );
    expect(outcome).toEqual({ kind: 'rate_limited', retryAfterSeconds: 120 });
  });

  it('429 沒有 body 時退到 Retry-After header', async () => {
    const outcome = await outcomeOf(null, httpError(429, undefined, { 'Retry-After': '90' }));
    expect(outcome).toEqual({ kind: 'rate_limited', retryAfterSeconds: 90 });
  });

  it('429 兩者都沒有就不給數字 —— 不猜一個讓家長白等', async () => {
    const outcome = await outcomeOf(null, httpError(429));
    expect(outcome).toEqual({ kind: 'rate_limited' });
  });

  it('401 / 403 → auth_required，不是一般不可用', async () => {
    expect(await outcomeOf(null, httpError(401))).toEqual({ kind: 'auth_required' });
    expect(await outcomeOf(null, httpError(403))).toEqual({ kind: 'auth_required' });
  });

  it('400 / 405 → request_invalid（我們送錯了）', async () => {
    expect(await outcomeOf(null, httpError(400))).toEqual({ kind: 'request_invalid' });
    expect(await outcomeOf(null, httpError(405))).toEqual({ kind: 'request_invalid' });
  });

  it('500 → server_unavailable', async () => {
    expect(await outcomeOf(null, httpError(500))).toEqual({ kind: 'server_unavailable' });
    expect(await outcomeOf(null, httpError(503))).toEqual({ kind: 'server_unavailable' });
  });

  it('網路不通（沒有 Response）→ server_unavailable', async () => {
    const outcome = await outcomeOf(null, { name: 'FunctionsFetchError', context: {} });
    expect(outcome).toEqual({ kind: 'server_unavailable' });
  });
});

// ---------------------------------------------------------------------------
// 27-30. abort
// ---------------------------------------------------------------------------

describe('27-30. abort', () => {
  it('27. signal 有傳進 invoke', async () => {
    let received: AbortSignal | undefined;
    const invoke: InvokeTaskAiFunction = async (_body, signal) => {
      received = signal;
      return { data: { requestId: 'r', result: VALID_RESULT }, error: null };
    };
    const controller = new AbortController();
    await new LiveTaskAiRecommendationClient(invoke).recommend(INPUT, controller.signal);
    expect(received).toBe(controller.signal);
  });

  it('已經取消就不送出 —— 送出去的請求一樣會計入配額', async () => {
    let calls = 0;
    const invoke: InvokeTaskAiFunction = async () => {
      calls += 1;
      return { data: null, error: null };
    };
    const controller = new AbortController();
    controller.abort();

    const outcome = await new LiveTaskAiRecommendationClient(invoke)
      .recommend(INPUT, controller.signal);
    expect(outcome).toEqual({ kind: 'aborted' });
    expect(calls).toBe(0);
  });

  it('請求途中被取消 → aborted，不是失敗', async () => {
    const controller = new AbortController();
    const invoke: InvokeTaskAiFunction = async () => {
      controller.abort();
      return { data: { requestId: 'r', result: VALID_RESULT }, error: null };
    };
    const outcome = await new LiveTaskAiRecommendationClient(invoke)
      .recommend(INPUT, controller.signal);
    // 家長是自己離開的。回一個 result 會讓建議蓋在他已經改過的草稿上。
    expect(outcome).toEqual({ kind: 'aborted' });
  });

  it('invoke 直接丟 AbortError 也算 aborted', async () => {
    const invoke: InvokeTaskAiFunction = async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    };
    expect(await new LiveTaskAiRecommendationClient(invoke).recommend(INPUT))
      .toEqual({ kind: 'aborted' });
  });

  it('其他例外不會往上丟 —— AI 壞掉不該讓抽屜白畫面', async () => {
    const invoke: InvokeTaskAiFunction = async () => {
      throw new TypeError('network down');
    };
    expect(await new LiveTaskAiRecommendationClient(invoke).recommend(INPUT))
      .toEqual({ kind: 'server_unavailable' });
  });
});

// ---------------------------------------------------------------------------
// 21, 39. App 不認識 provider
// ---------------------------------------------------------------------------

describe('21, 39. App 不認識 provider', () => {
  it('adapter 的原始碼裡沒有任何 Gemini 詞彙', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', 'liveTaskAiRecommendationClient.ts'),
      'utf8',
    );
    // 註解裡會提到「底下現在是 Gemini」，那是說明；程式碼不可以碰它。
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const provider of [
      'gemini', 'generativelanguage', 'candidates', 'responseSchema',
      'systemInstruction', 'usageMetadata', 'apiKey', 'x-goog',
    ]) {
      expect(code.toLowerCase()).not.toContain(provider.toLowerCase());
    }
  });

  it('outcome 裡不會夾帶原始回傳', async () => {
    const outcome = await outcomeOf({
      requestId: 'r',
      result: VALID_RESULT,
      // Function 不會回這些，但如果哪天多回了，App 也不該把它帶進狀態。
      debug: { prompt: '你是一個助理', model: 'some-model', tokens: 812 },
    });
    const serialized = JSON.stringify(outcome);
    for (const leak of ['prompt', 'model', 'tokens', '你是一個助理']) {
      expect(serialized).not.toContain(leak);
    }
  });
});
