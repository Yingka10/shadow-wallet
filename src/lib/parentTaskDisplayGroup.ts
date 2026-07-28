// Shadow Wallet — 任務在家長列表上該歸到哪一區
//
// 為什麼需要這一層：
//
// 任務管理頁的分組是在 reward_policy 這個欄位存在之前寫的，判斷依據只有
// category：A → 生活紀錄、B → 時間儲蓄、其餘 → 成長幣任務。
//
// 抽屜建立的任務打破了這個假設。同樣是 D 類（學習與技能），
// 選 record_only 的任務完成後什麼都不發，選 coin_eligible 的才發幣 ——
// 但兩者的 category 都是 D，舊規則會把前者放進「成長幣任務」區並顯示一個
// 它永遠不會發的幣值。家長據此以為孩子完成後有幣，孩子完成後沒有。
//
// 所以分組依據改成 reward_policy 優先、category 墊底：
//   reward_policy 有值 → 那是家長明確選的回饋方式，直接用
//   reward_policy 為 NULL → legacy 任務，維持原本的 category 判斷，一個字不改
//
// 這一輪**不重做任務管理頁的分區**（那是另一個範圍）。這支的責任只有
// 「不要把不發幣的任務說成發幣的」與「不要讓任何任務消失」。

import type { RewardPolicyValue, TaskCategory } from '../types/database';

/**
 * 顯示分區。
 *
 * legacy_time_saving 單獨一個值而不是併進 family_contribution：
 * 舊的 B 類任務**真的會**寫 time_savings（fn_complete_task 現況），
 * 新的家庭參與不會。把兩者混在一起，畫面就得在同一區裡顯示兩種完全不同的結果。
 */
export type ParentTaskDisplayGroup =
  | 'life_record'
  | 'family_contribution'
  | 'progress'
  | 'coin_reward'
  | 'legacy_time_saving';

/** 分組只需要這兩個欄位，不必把整個 Task 或 TaskListItem 拖進來。 */
export type DisplayGroupInput = {
  category: TaskCategory;
  rewardPolicy?: RewardPolicyValue | null;
};

export function mapTaskToDisplayGroup(task: DisplayGroupInput): ParentTaskDisplayGroup {
  switch (task.rewardPolicy) {
    case 'coin_eligible':
      return 'coin_reward';
    case 'family_contribution':
      return 'family_contribution';
    case 'progress_only':
      return 'progress';
    case 'record_only':
      return 'life_record';
    case 'time_saving_eligible':
      // 建立端擋死、完成端也拒絕，所以不該存在。真的出現時放進舊的時間儲蓄區，
      // 而不是讓它掉進成長幣區顯示一個不存在的金額。
      return 'legacy_time_saving';
    default:
      break;
  }

  // reward_policy 為 NULL = 這一版之前建立的任務。判斷方式一字不動。
  if (task.category === 'A') return 'life_record';
  if (task.category === 'B') return 'legacy_time_saving';
  return 'coin_reward';
}

/** 這一區的任務會不會發成長幣。畫面用它決定要不要顯示幣值。 */
export function displayGroupShowsCoins(group: ParentTaskDisplayGroup): boolean {
  return group === 'coin_reward';
}
