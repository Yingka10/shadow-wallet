// AI 建議在自訂任務裡的三種狀態。
//
// 三種必須分得出來，否則家長會對著一個永遠不會成功的按鈕重試：
//   可用 / 這種任務不提供 / 服務暫時不可用
//
// 而且**內部代碼一個字都不可以出現在畫面上**。

import {
  aiAvailabilityFromUnavailableReason,
  resolveTaskAiAvailability,
} from '../customTaskAiAvailability';

describe('三種狀態', () => {
  it('C／D 類且服務正常 → 可用', () => {
    for (const purposeCategory of ['autonomous_challenge', 'learning_skill'] as const) {
      const copy = resolveTaskAiAvailability({ purposeCategory, serviceHealthy: true });
      expect({ purposeCategory, state: copy.state, button: copy.showActionButton })
        .toEqual({ purposeCategory, state: 'available', button: true });
    }
  });

  it('A／B 類 → 這種任務不提供，而且不顯示按鈕', () => {
    // 第一版 eligibility 只開放 C／D（B2A.5 的決定）。
    // 顯示一個按不出結果的按鈕比不顯示更糟。
    for (const purposeCategory of ['life_routine', 'family_participation'] as const) {
      const copy = resolveTaskAiAvailability({ purposeCategory, serviceHealthy: true });
      expect({ purposeCategory, state: copy.state, button: copy.showActionButton, retry: copy.retryable })
        .toEqual({
          purposeCategory,
          state: 'not_offered_for_this_task',
          button: false,
          retry: false,
        });
    }
  });

  it('服務掛掉 → 可重試', () => {
    const copy = resolveTaskAiAvailability({
      purposeCategory: 'learning_skill',
      serviceHealthy: false,
    });
    expect(copy.state).toBe('service_unavailable');
    expect(copy.retryable).toBe(true);
  });

  it('順序有意義：A／B 類即使服務掛掉也不顯示「稍後再試」', () => {
    // 反過來的話，服務掛掉時 A／B 類會被叫去重試 ——
    // 而它們再試一百次也不會有建議。
    const copy = resolveTaskAiAvailability({
      purposeCategory: 'family_participation',
      serviceHealthy: false,
    });
    expect(copy.state).toBe('not_offered_for_this_task');
    expect(copy.retryable).toBe(false);
  });
});

describe('文案不洩漏內部代碼', () => {
  it('三種狀態的文案都不含 TASK_TYPE_NOT_ENABLED 這類代碼', () => {
    const cases = [
      resolveTaskAiAvailability({ purposeCategory: 'learning_skill', serviceHealthy: true }),
      resolveTaskAiAvailability({ purposeCategory: 'family_participation', serviceHealthy: true }),
      resolveTaskAiAvailability({ purposeCategory: 'learning_skill', serviceHealthy: false }),
    ];

    for (const copy of cases) {
      const text = `${copy.title}${copy.message}`;
      for (const forbidden of [
        'TASK_TYPE_NOT_ENABLED', 'NOT_ELIGIBLE', 'SERVICE_DISABLED', 'SERVICE_ERROR',
        'HIGH_RISK_CONTEXT', 'UNSUPPORTED_CATEGORY', 'INSUFFICIENT_CONTEXT',
        'UNSAFE_OUTPUT', 'INVALID_RESPONSE', 'TIMEOUT',
      ]) {
        expect({ state: copy.state, forbidden, found: text.includes(forbidden) })
          .toEqual({ state: copy.state, forbidden, found: false });
      }
      // 也不可以出現大寫底線這種一看就是代碼的東西。
      expect(text).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/);
    }
  });

  it('不可用的兩種狀態都明講「不影響任務建立」', () => {
    // 家長此刻真正在意的是這件事，不是 AI 為什麼壞掉。
    for (const copy of [
      resolveTaskAiAvailability({ purposeCategory: 'family_participation', serviceHealthy: true }),
      resolveTaskAiAvailability({ purposeCategory: 'learning_skill', serviceHealthy: false }),
    ]) {
      expect(copy.message).toContain('不影響任務建立');
    }
  });
});

describe('Edge Function reason → 家長狀態', () => {
  it('NOT_ELIGIBLE 對到「這種任務不提供」', () => {
    expect(aiAvailabilityFromUnavailableReason('NOT_ELIGIBLE'))
      .toBe('not_offered_for_this_task');
  });

  it('其餘 reason 都對到「服務暫時不可用」', () => {
    for (const reason of [
      'TIMEOUT', 'SERVICE_ERROR', 'INVALID_RESPONSE', 'UNSAFE_OUTPUT', 'SERVICE_DISABLED',
    ]) {
      expect({ reason, state: aiAvailabilityFromUnavailableReason(reason) })
        .toEqual({ reason, state: 'service_unavailable' });
    }
  });

  it('認不得的 reason 當成暫時性問題，不讓按鈕默默消失', () => {
    // 猜成 not_offered 的話，一個新加的 reason 會讓按鈕消失而沒有人發現。
    expect(aiAvailabilityFromUnavailableReason('SOMETHING_NEW')).toBe('service_unavailable');
  });

  it('契約裡的每個 reason 都對得到一個狀態', () => {
    const contract = jest.requireActual(
      '../../../../../../../supabase/functions/task-ai-recommendation/contract.json',
    ) as { unavailableReasons: string[] };

    for (const reason of contract.unavailableReasons) {
      const state = aiAvailabilityFromUnavailableReason(reason);
      expect({ reason, ok: state === 'not_offered_for_this_task' || state === 'service_unavailable' })
        .toEqual({ reason, ok: true });
    }
  });
});
