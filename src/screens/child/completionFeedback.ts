// 完成一次任務之後，孩子看到什麼。
//
// 抽出來的理由只有一個：**「這一次有沒有發幣」是一個會被寫錯的判斷。**
// 寫在畫面的 callback 裡，它會長成一串 else if，然後某一支忘記問
// settlement 就直接用 coinEarned —— 而 coinEarned 對 per_period 任務
// 在達標之前一律是 0，對「還沒達標」與「這個任務不發幣」是同一個數字。
//
// 規則只有一條：**有 settlement 才出現幣值畫面。** 其餘一律是投入紀錄。

import type { FeedbackType } from '../../components/FeedbackAnimation';
import type { CompletionResult } from '../../lib/taskActions';
import type { TaskCategory } from '../../types/database';

export type CompletionFeedback = {
  type: FeedbackType;
  value: number;
  periodDone?: number;
  periodTarget?: number | null;
};

/**
 * 決定一次完成之後要播哪一種回饋。
 *
 * @param result   complete_task 的回傳
 * @param category 任務類別（只有 legacy 路徑才用得到）
 */
export function decideCompletionFeedback(
  result: CompletionResult,
  category: TaskCategory,
): CompletionFeedback {
  // ── 新結算語意 ────────────────────────────────────────────────────────────
  if (result.payoutBasis != null) {
    // 真的形成了一次 reward event，才可以出現幣值。
    if (result.settlement) {
      return { type: 'task-c', value: result.settlement.coinAmount };
    }

    // per_period：講本週節奏，不講幣。
    if (result.period) {
      return {
        type: 'period-progress',
        value: 0,
        periodDone: result.period.done,
        periodTarget: result.period.target,
      };
    }

    // 不發幣的政策、或 Phase 2 才實作的結算方式：只確認「做到了」。
    return { type: 'task-a', value: 0 };
  }

  // ── legacy：一個字都不改 ──────────────────────────────────────────────────
  if (result.milestone) {
    return { type: 'milestone', value: result.milestone.coinReward };
  }
  if (category === 'A') {
    return { type: 'task-a', value: 0 };
  }
  if (category === 'B') {
    return { type: 'task-b', value: result.timeSavedMin };
  }
  return { type: 'task-c', value: result.coinEarned };
}
