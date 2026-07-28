// Shadow Wallet · Parent Tablet — 草稿的估計分鐘
//
// 三支 editor 用三個不同欄位名裝同一件事（成長計畫與固定任務是 minutesPerSession、
// 單次任務是 estimatedMinutes、短期支援與家庭角色沒有這個概念）。
// 幣值政策要的是「每次大約做多久」，所以在這裡收斂成一個問題的一個答案，
// 而不是讓每個呼叫端各自 optional chaining 一輪。

import type { TaskDraft } from './types';

/**
 * 這份草稿每次大約要做多久。
 *
 * undefined = 這個任務刻意不設固定分鐘（例如創作、探索），不是漏填。
 * 幣值政策沒有分鐘就對應不到時間分級，因此這個值直接決定了能不能發幣。
 */
export function draftEstimatedMinutes(draft: TaskDraft): number | undefined {
  switch (draft.editorKind) {
    case 'growth_plan':
    case 'recurring':
      return draft.minutesPerSession;
    case 'one_time':
      return draft.estimatedMinutes;
    case 'short_support':
    case 'family_role':
      return undefined;
  }
}
