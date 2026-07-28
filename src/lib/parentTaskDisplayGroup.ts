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
 * 六個值分成兩組：前四個是抽屜建立的新任務，後兩個是 reward_policy 為 null
 * 的舊任務。**新舊刻意不共用值**，因為同一個名字底下的完成行為不同 ——
 * 舊的 B 類任務真的會寫 time_savings（fn_complete_task 現況），
 * 新的 family_contribution 不會。共用一個值，畫面就得在同一區裡
 * 交代兩種不同的結果。
 *
 * 第七階段 C 曾經把 family_contribution 與 progress 併進 life_record 當作
 * 「不讓任務消失」的權宜。那只是相容，不是正確呈現：
 * 「家庭參與」與「生活紀錄」對家長是兩件事。
 */
export type ParentTaskDisplayGroup =
  | 'family_contribution'
  | 'progress'
  | 'coin_reward'
  | 'record_only'
  | 'legacy_time_saving'
  | 'legacy_life_record';

/** 分區在畫面上的名稱。文案只有這一份，不在 JSX 裡各寫一次。 */
export const DISPLAY_GROUP_LABEL: Record<ParentTaskDisplayGroup, string> = {
  family_contribution: '家庭參與',
  progress: '進度與肯定',
  coin_reward: '成長幣任務',
  record_only: '一般紀錄',
  legacy_time_saving: '時間儲蓄任務',
  legacy_life_record: '生活紀錄',
};

/** 一句話說明「完成之後會怎樣」。badge 之外還需要它，語意才完整。 */
export const DISPLAY_GROUP_SUBTITLE: Record<ParentTaskDisplayGroup, string> = {
  family_contribution: '記錄孩子對共同生活的投入，不發成長幣',
  progress: '回饋投入、持續與進步，不直接發成長幣',
  coin_reward: '完成後可獲得成長幣',
  record_only: '完成後保留紀錄，不發成長幣',
  legacy_time_saving: '完成後累積親子共處時間',
  legacy_life_record: '日常自理與家庭分工，不兌換成長幣',
};

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
      return 'record_only';
    case 'time_saving_eligible':
      // 建立端擋死、完成端也拒絕，所以不該存在。真的出現時放進舊的時間儲蓄區，
      // 而不是讓它掉進成長幣區顯示一個不存在的金額。
      return 'legacy_time_saving';
    default:
      break;
  }

  // reward_policy 為 NULL = 這一版之前建立的任務。判斷方式一字不動。
  if (task.category === 'A') return 'legacy_life_record';
  if (task.category === 'B') return 'legacy_time_saving';
  return 'coin_reward';
}

/**
 * 這一區的任務會不會發成長幣。
 *
 * 只有 coin_reward。這一條是整支檔案存在的理由 ——
 * 讓不發幣的任務顯示幣值，等於告訴家長孩子完成後會拿到某個數字，
 * 而孩子完成後什麼都沒有。
 */
export function displayGroupShowsCoins(group: ParentTaskDisplayGroup): boolean {
  return group === 'coin_reward';
}

/** 是不是這一版之前建立的任務。畫面需要時可以用它標示，但不必分開放。 */
export function isLegacyDisplayGroup(group: ParentTaskDisplayGroup): boolean {
  return group === 'legacy_time_saving' || group === 'legacy_life_record';
}
