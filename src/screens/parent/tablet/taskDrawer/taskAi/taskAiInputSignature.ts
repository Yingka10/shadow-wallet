// Shadow Wallet · Parent Tablet — 這一份輸入的指紋
//
// ─────────────────────────────────────────────────────────────────────────
// 一句話：**回來的建議還對得上眼前這份草稿嗎。**
//
// AI 請求是非同步的，而家長在等待期間什麼都做得了 —— 返回 editor 改分鐘數、
// 換一個孩子、關掉抽屜再開一次。三秒後回來的那批建議是對著**舊的**草稿寫的。
//
// 沒有指紋的話，那批建議會直接蓋上去，而畫面上完全看不出異狀：
// 建議卡寫著「目前設定：45 分鐘」，而草稿裡已經是 20 分鐘了。
// 家長按下採用，得到的是一個他從來沒有同意過的組合。
//
// 指紋刻意**不含** clientRequestId、時間戳、隨機值或 UI 展開狀態 ——
// 那些每次都不一樣，會讓每一批建議一回來就立刻過期。
// 它只含「會改變建議內容」的實質欄位。
//
// 用完整字串而不是 hash：這個值只在記憶體裡比對相等，不顯示、不傳輸、
// 不落地。省那幾百個 byte 換來一個雜湊碰撞就會靜靜接受過期建議的風險，
// 不划算。
// ─────────────────────────────────────────────────────────────────────────

import type { TaskAiRecommendationInput } from './types';

/**
 * 穩定序列化。
 *
 * `JSON.stringify` 的鍵順序取決於物件的建構順序 —— `buildTaskAiInput`
 * 目前是固定的，但那是實作細節，不該讓正確性依賴它。
 * 這裡對鍵排序，陣列維持原順序（順序本身就是內容的一部分）。
 */
function stable(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * 這份輸入的指紋。
 *
 * 欄位逐項寫出來，不是 `stable(input)` —— 之後有人在 input 上加一個
 * 「送出時間」之類的欄位時，指紋不會因此每次都變。要加進指紋是一個決定，
 * 應該在這裡明確做，而不是自動繼承。
 */
export function createTaskAiInputSignature(input: TaskAiRecommendationInput): string {
  return stable({
    schemaVersion: input.schemaVersion,
    ageGroup: input.childContext.ageGroup,
    taskContext: input.taskContext,
    originalExpectation: input.parentIntent.originalExpectation,
    currentDraft: input.currentDraft,
    immutablePolicies: input.immutablePolicies,
  });
}
