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
  it('四類任務且服務正常 → 可用', () => {
    // 2026-08-11：eligibility 從 C／D 擴大到全部四類（見 customTaskAiAvailability.ts
    // 檔頭的追記——這是知情狀態下的決定，docs/TASK_AI_PRODUCTION_READINESS.md
    // 記錄的放寬前提並未成立）。resolveTaskAiAvailability 現在對任何合法
    // purposeCategory 都不會回傳 not_offered_for_this_task。
    for (const purposeCategory of [
      'autonomous_challenge', 'learning_skill', 'life_routine', 'family_participation',
    ] as const) {
      const copy = resolveTaskAiAvailability({ purposeCategory, serviceHealthy: true });
      expect({ purposeCategory, state: copy.state, button: copy.showActionButton })
        .toEqual({ purposeCategory, state: 'available', button: true });
    }
  });

  it('家庭角色任務 → 不提供，且與 purposeCategory 無關', () => {
    // family_role 的限制是任務形式本身的限制（見 AI_DENIED_EDITOR_KINDS 的
    // 說明），不是 2026-08-11 那次 purposeCategory 擴大要處理的內容安全問題。
    // 就算 purposeCategory 已經全部開放，這一種形式仍然不提供。
    const copy = resolveTaskAiAvailability({
      purposeCategory: 'family_participation',
      editorKind: 'family_role',
      serviceHealthy: true,
    });
    expect({ state: copy.state, button: copy.showActionButton, retry: copy.retryable })
      .toEqual({ state: 'not_offered_for_this_task', button: false, retry: false });
  });

  it('順序有意義：家庭角色任務即使服務掛掉也不顯示「稍後再試」', () => {
    const copy = resolveTaskAiAvailability({
      purposeCategory: 'family_participation',
      editorKind: 'family_role',
      serviceHealthy: false,
    });
    expect(copy.state).toBe('not_offered_for_this_task');
    expect(copy.retryable).toBe(false);
  });

  it('服務掛掉 → 非家庭角色的任何類別都可重試', () => {
    for (const purposeCategory of [
      'autonomous_challenge', 'learning_skill', 'life_routine', 'family_participation',
    ] as const) {
      const copy = resolveTaskAiAvailability({ purposeCategory, serviceHealthy: false });
      expect({ purposeCategory, state: copy.state, retry: copy.retryable })
        .toEqual({ purposeCategory, state: 'service_unavailable', retry: true });
    }
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

  it('service_unavailable 明講「不影響任務建立」', () => {
    // 家長此刻真正在意的是這件事，不是 AI 為什麼壞掉。
    // not_offered_for_this_task 現在無法透過 resolveTaskAiAvailability 產生
    // （見上方「三種狀態」的說明），這裡只驗證仍然可觸發的那個狀態。
    for (const copy of [
      resolveTaskAiAvailability({ purposeCategory: 'family_participation', serviceHealthy: false }),
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
