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
import { LiveTaskAiRecommendationClient } from '../../screens/parent/tablet/taskDrawer/taskAi';

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
