// 第八階段 B2B — 1-6. AI client 的建立點
//
// 這一支驗的是「畫面上這批建議是不是真的」這個問題的唯一答案來源。
//
// 最重要的一條是 **live 失敗不會退回 fake**。那個 fallback 寫起來只要一行，
// 而且看起來很體貼 —— 但它製造的狀態是：真的服務掛了，家長卻收到一批
// 寫死在 repo 裡的建議，然後照著調整孩子的任務。
//
// 這裡不連任何網路：mockInvoke 被 mock 掉了。

import type { AppEnvironment } from '../environment';

const mockInvoke = jest.fn();

/** 可變的環境替身 —— 每個測試自己決定這一次是哪個環境。 */
const mockEnvironmentState: {
  ok: boolean;
  appEnvironment: AppEnvironment;
} = { ok: true, appEnvironment: 'staging' };

jest.mock('../supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}));

/*
  getter 要能容忍「還沒初始化」。

  jest 會把 jest.mock 提到最上面，而 taskAiRecommendationClient 在被 import
  的那一刻就會算一次 taskAiClientSetup —— 那時 mockEnvironmentState 還是
  undefined。那一次算出 off 完全沒問題（測試都直接呼叫 createTaskAiClientSetup），
  但不能讓它丟例外，否則整個 suite 載入失敗。
*/
jest.mock('../environment', () => ({
  get supabaseEnvironment() {
    return mockEnvironmentState?.ok
      ? {
          ok: true,
          info: {
            appEnvironment: mockEnvironmentState.appEnvironment,
            projectRef: 'a'.repeat(20),
            url: 'https://example.supabase.co',
            showBadge: true,
          },
          anonKey: 'anon',
        }
      : { ok: false, error: new Error('env missing') };
  },
}));

import { createTaskAiClientSetup } from '../taskAiRecommendationClient';
import {
  LiveTaskAiRecommendationClient,
  TASK_AI_FUNCTION_NAME,
  type TaskAiRecommendationInput,
} from '../../screens/parent/tablet/taskDrawer/taskAi';

/** 一份形狀正確的 input。內容不重要 —— 這幾條測的是**外層**。 */
const INPUT: TaskAiRecommendationInput = {
  schemaVersion: 1,
  childContext: { ageGroup: '6-9' },
  taskContext: {
    editorKind: 'growth_plan',
    purposeCategory: 'autonomous_challenge',
    durationType: 'long_term',
    source: 'child',
    rewardPolicy: 'progress_only',
    completionPolicy: 'plan_complete',
  },
  parentIntent: { originalExpectation: '希望孩子能持續投入這件事。' },
  currentDraft: {
    title: '孩子的成長計畫',
    completionDescription: '能依約定的節奏持續投入。',
    scheduleSummary: '30 天期間內，固定在週一、週三、週五',
    selectedOptions: {},
  },
  immutablePolicies: {
    purposeCategory: 'autonomous_challenge',
    rewardPolicy: 'progress_only',
    blockedFields: ['purposeCategory', 'rewardPolicy'],
  },
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockEnvironmentState.ok = true;
  mockEnvironmentState.appEnvironment = 'staging';
});

describe('1. off 不會產生任何 client', () => {
  it('沒設定 → 沒有 client，畫面上不會出現 AI 區塊', () => {
    const setup = createTaskAiClientSetup(undefined);
    expect(setup.resolution.mode).toBe('off');
    expect(setup.client).toBeNull();
  });

  it('off 不會呼叫 Function', async () => {
    const setup = createTaskAiClientSetup('off');
    expect(setup.client).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('2-3. fake 與 live 是不同的東西', () => {
  it('2. fake 給的是本機假服務，不碰網路', async () => {
    const setup = createTaskAiClientSetup('fake');
    expect(setup.resolution.mode).toBe('fake');
    expect(setup.client).not.toBeNull();
    expect(setup.client).not.toBeInstanceOf(LiveTaskAiRecommendationClient);
  });

  it('3. live 給的是真的 adapter', () => {
    const setup = createTaskAiClientSetup('live');
    expect(setup.resolution.mode).toBe('live');
    expect(setup.client).toBeInstanceOf(LiveTaskAiRecommendationClient);
  });
});

describe('4. live 失敗不會退回 fake', () => {
  it('環境沒設好時回 off，不是 fake', () => {
    mockEnvironmentState.ok = false;
    const setup = createTaskAiClientSetup('live');
    // 「服務不可用」與「這批建議是假的」是兩件事，而後者看起來是成功的。
    expect(setup.resolution.mode).toBe('off');
    expect(setup.client).toBeNull();
  });

  it('live client 本身失敗時仍然是 live client —— 沒有第二個來源可以偷偷換', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', context: {} } });
    const setup = createTaskAiClientSetup('live');
    expect(setup.client).toBeInstanceOf(LiveTaskAiRecommendationClient);
  });
});

describe('5. production 的預設', () => {
  it('沒設定 → off', () => {
    mockEnvironmentState.appEnvironment = 'production';
    expect(createTaskAiClientSetup(undefined).client).toBeNull();
  });

  it('明確設 live 才會是 live', () => {
    mockEnvironmentState.appEnvironment = 'production';
    expect(createTaskAiClientSetup('live').client).toBeInstanceOf(LiveTaskAiRecommendationClient);
  });

  it('production 不接受 fake —— 真實家庭不該看到寫死的建議', () => {
    mockEnvironmentState.appEnvironment = 'production';
    const setup = createTaskAiClientSetup('fake');
    expect(setup.resolution).toEqual({ mode: 'off', reason: 'not_allowed_here' });
    expect(setup.client).toBeNull();
  });
});

describe('6. test 環境', () => {
  it('一律 off，測試自己注入替身', () => {
    mockEnvironmentState.appEnvironment = 'test';
    for (const raw of ['live', 'fake', undefined]) {
      expect(createTaskAiClientSetup(raw).client).toBeNull();
    }
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7. HTTP envelope（回歸測試）
// ---------------------------------------------------------------------------
//
// 這一組測的是**最後一段接縫**：live adapter → 真正的
// `supabase.functions.invoke`。以前沒有任何測試走到這裡。
//
// 為什麼會漏：
//   App 端的測試注入一支假的 `InvokeTaskAiFunction`，那支假 invoker
//   直接收下 domain 的 input，從來不看 HTTP body 長什麼樣。
//   Function 端的 Deno 測試則自己組 `{ input: … }` 餵給 handler，
//   永遠符合 server 的期待。
//   兩邊各自都綠，中間那一段沒有人測 —— 於是真實 App 打真實 Function
//   時每一次都回 400，畫面上只說「目前無法取得建議」。
//
// handler.ts 讀的是 `body.input`。下面這幾條就是釘住這件事。

describe('7. 送出去的 HTTP body 必須是 { input: … }', () => {
  function liveClient() {
    const setup = createTaskAiClientSetup('live');
    if (setup.client === null) throw new Error('live 應該要有 client');
    return setup.client;
  }

  beforeEach(() => {
    // outcome 不是這一組的重點，只要別讓 adapter 丟例外。
    mockInvoke.mockResolvedValue({ data: null, error: null });
  });

  it('body 是 { input }，而不是裸的 input', async () => {
    await liveClient().recommend(INPUT, undefined);

    expect(mockInvoke).toHaveBeenCalledWith(
      TASK_AI_FUNCTION_NAME,
      expect.objectContaining({ body: { input: INPUT } }),
    );
  });

  it('body 最外層不得直接出現 input 的欄位', async () => {
    await liveClient().recommend(INPUT, undefined);

    const [, options] = mockInvoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    // 這一條就是那個 bug 的形狀：schemaVersion 跑到最外層 = 忘了包 envelope。
    expect(options.body).not.toHaveProperty('schemaVersion');
    expect(options.body).not.toHaveProperty('currentDraft');
    expect(options.body).not.toHaveProperty('taskContext');
    expect(Object.keys(options.body)).toEqual(['input']);
  });

  it('有 signal 時照樣傳進去（abort 才停得下來）', async () => {
    const controller = new AbortController();
    await liveClient().recommend(INPUT, controller.signal);

    const [, options] = mockInvoke.mock.calls[0] as [string, Record<string, unknown>];
    expect(options.signal).toBe(controller.signal);
    expect(options.body).toEqual({ input: INPUT });
  });

  it('沒有 signal 時不會多送一個 signal 鍵', async () => {
    await liveClient().recommend(INPUT, undefined);

    const [, options] = mockInvoke.mock.calls[0] as [string, Record<string, unknown>];
    expect(options).not.toHaveProperty('signal');
    expect(options.body).toEqual({ input: INPUT });
  });

  it('打的是 task-ai-recommendation，只呼叫一次', async () => {
    await liveClient().recommend(INPUT, undefined);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0]?.[0]).toBe(TASK_AI_FUNCTION_NAME);
  });
});
