// 第八階段 B2B — 1-6. 服務模式
//
// 這一支盯的是一個不會有人發現的失敗：
//
//   staging 驗收時畫面上出現了三張漂亮的建議卡，
//   所有人都以為串接完成了 —— 而那批文字是寫死在 repo 裡的。
//
// 那比「AI 壞掉」糟糕得多，因為它看起來是成功的。所以 fake 與 live
// 必須是**顯式選擇**，而任何講不清楚的情況一律退到 off。

import { resolveTaskAiServiceMode, taskAiServiceModeLabel } from '../taskAiServiceMode';

describe('1, 5-6. 缺值與非法值一律 off', () => {
  it('沒設定 → off', () => {
    for (const env of ['development', 'staging', 'production'] as const) {
      expect(resolveTaskAiServiceMode(undefined, env)).toEqual({ mode: 'off', reason: 'unset' });
      expect(resolveTaskAiServiceMode('', env)).toEqual({ mode: 'off', reason: 'unset' });
      expect(resolveTaskAiServiceMode('   ', env)).toEqual({ mode: 'off', reason: 'unset' });
    }
  });

  it('看不懂的值 → off，不猜', () => {
    for (const raw of ['LIVE', 'on', 'true', 'gemini', 'fake ', 'yes']) {
      const resolved = resolveTaskAiServiceMode(raw, 'staging');
      // 「fake 」有尾空白會被 trim，所以它是合法的 —— 其餘都不是。
      if (raw.trim() === 'fake') continue;
      expect(resolved).toEqual({ mode: 'off', reason: 'invalid' });
    }
  });

  it('6. test 環境不看環境變數', () => {
    // 讓 CI 的行為取決於某台機器的 .env 是最難重現的一種失敗。
    for (const raw of ['live', 'fake', 'off', undefined]) {
      expect(resolveTaskAiServiceMode(raw, 'test')).toEqual({
        mode: 'off',
        reason: 'test_environment',
      });
    }
  });
});

describe('2-3. 明確設定才會用 fake 或 live', () => {
  it('development 三種都可以，但都要明講', () => {
    expect(resolveTaskAiServiceMode('fake', 'development').mode).toBe('fake');
    expect(resolveTaskAiServiceMode('live', 'development').mode).toBe('live');
    expect(resolveTaskAiServiceMode('off', 'development').mode).toBe('off');
    // 沒講就是 off —— 一個「預設就會動」的 AI 功能會讓人忘記它需要被打開。
    expect(resolveTaskAiServiceMode(undefined, 'development').mode).toBe('off');
  });

  it('staging 明確設 live 才是 live', () => {
    expect(resolveTaskAiServiceMode('live', 'staging')).toEqual({
      mode: 'live',
      reason: 'explicit',
    });
    expect(resolveTaskAiServiceMode(undefined, 'staging').mode).toBe('off');
  });
});

describe('5. production 的限制', () => {
  it('預設 off', () => {
    expect(resolveTaskAiServiceMode(undefined, 'production').mode).toBe('off');
  });

  it('明確設定才可以 live', () => {
    expect(resolveTaskAiServiceMode('live', 'production')).toEqual({
      mode: 'live',
      reason: 'explicit',
    });
  });

  it('production 不接受 fake', () => {
    // 對真實家庭顯示一批寫死的建議，比完全沒有這個功能糟糕得多 ——
    // 家長會照著那些字調整孩子的任務。
    expect(resolveTaskAiServiceMode('fake', 'production')).toEqual({
      mode: 'off',
      reason: 'not_allowed_here',
    });
  });
});

describe('development 面板上的那一行', () => {
  it('說得出模式與理由，但不含任何設定值', () => {
    const label = taskAiServiceModeLabel(resolveTaskAiServiceMode('fake', 'staging'));
    expect(label).toBe('AI 服務模式：fake（明確設定）');
    for (const secret of ['http', 'supabase', 'key', 'ref', '.co']) {
      expect(label.toLowerCase()).not.toContain(secret);
    }
  });

  it('退回 off 時說得出是哪一種退回', () => {
    expect(taskAiServiceModeLabel(resolveTaskAiServiceMode('fake', 'production')))
      .toContain('這個環境不允許該模式');
    expect(taskAiServiceModeLabel(resolveTaskAiServiceMode('nope', 'staging')))
      .toContain('無法辨識');
  });
});
