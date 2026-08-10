// Shadow Wallet · Parent Tablet — 建立成功後要跳到哪個 Tab
//
// 抽成純函式的理由：這件事很容易寫成「在成功畫面裡順手判斷一下」，
// 然後五種 editor 有一種判斷錯，家長按了「查看任務」卻跳到空的分頁 ——
// 任務其實建好了，但看起來像沒建成。這種 bug 在 UI 裡幾乎測不到。
//
// 判斷依據只有 durationType 一個維度：
//   long_term  → 長期挑戰（成長計畫／短期支援／家庭角色都是這一類）
//   其餘       → 日常任務
//
// planMode 刻意不參與判斷。三種長期形式在列表上都由 long_term_goals 呈現，
// 用 planMode 再分一次只會多一個會不同步的地方。

import type { CreateParentTaskCommandBase } from './types';

/**
 * 建立成功後可能跳去的分頁。
 *
 * 刻意只有兩個值：paused 與 archive 裝的是「已經停掉的東西」，
 * 剛建立的任務不可能屬於那裡，讓它們成為合法回傳值只會讓錯誤更難發現。
 */
export type CreatedTaskTab = 'daily' | 'longTerm';

export function tabForCreatedTask(command: CreateParentTaskCommandBase): CreatedTaskTab {
  return command.task.durationType === 'long_term' ? 'longTerm' : 'daily';
}
