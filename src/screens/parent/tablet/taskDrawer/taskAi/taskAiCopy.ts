// Shadow Wallet · Parent Tablet — AI 建議區塊的正式文案
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支只有字串。集中的理由是它們**全部都是不可以說錯的話**：
//
//   · 不能出現 429、TIMEOUT、UNSAFE_OUTPUT、SERVICE_ERROR 這類代號
//   · 不能出現 Gemini、model 名稱、token
//   · 不能說「AI 幫你決定」「最佳設定」——那不是這個功能在做的事
//   · A／B 類不能被說成「不安全」「系統無法分析」——那是第一版的開放範圍，
//     不是對任務本身的判斷
//
// 每一條散在元件裡的話，改一次要改五個地方，而漏掉的那一個
// 就是截圖裡出現「SERVICE_ERROR」的那一次。
// ─────────────────────────────────────────────────────────────────────────

export const TASK_AI_COPY = {
  /** 區塊標題。 */
  title: '一起調整這項任務',
  /** 還沒請求時的說明。 */
  intro: 'AI 可以協助檢查範圍、時間與完成方式；是否採用仍由你決定。',
  requestButton: '取得調整建議',
  retryButton: '再試一次',

  loading: '正在整理這項任務…',

  /**
   * 這一類任務目前不提供建議。
   *
   * 措辭刻意平淡：這不是警告，也不是任務有問題。
   * 「不影響建立」放在同一句裡 —— 那是家長此刻唯一在意的事。
   */
  notOffered: '這類任務先由家長直接確認，不影響建立。',

  /** TIMEOUT / SERVICE_ERROR / INVALID_RESPONSE / UNSAFE_OUTPUT 共用同一句。 */
  unavailable: '目前無法取得建議，不影響任務建立。',

  rateLimited: '目前暫時無法再取得建議，稍後再試；你仍可以直接建立任務。',

  authRequired: '登入狀態已失效，請重新登入後再試。',

  noChange: '目前設定已經清楚，可以直接建立。',

  /** 家長在拿到建議之後又改了草稿。 */
  draftChanged: '任務內容已調整，需要時可重新取得建議。',

  /** 套用後草稿會變成不合法的組合。 */
  applyIncompatible: '這項建議和目前設定不相容，請手動調整。',

  /** 建議說的「目前設定」已經對不上了。 */
  staleItem: '設定已變更，請重新確認',

  /** 採用後家長又改過同一個欄位，復原會蓋掉他的輸入。 */
  undoUnsafe: '這個欄位在採用後又調整過，已保留你的版本。',

  applyButton: '採用這項',
  keepButton: '保留原設定',
  undoButton: '復原',
  appliedMark: '已採用',
  keptMark: '保留原設定',

  /** 幣值重算。**主詞是規則，不是 AI。** */
  rewardRecalculated: '依更新後的時間與任務設定，系統重新估算了成長幣。',

  cardCurrentLabel: '目前設定',
  cardSuggestedLabel: '建議調整',
  cardReasonLabel: '原因',
} as const;

/**
 * 「約 N 分鐘後可再試」。
 *
 * 不顯示秒數，也不顯示 server 的實際 bucket ——
 * 「還要等 47 秒」洩漏的是限流的實作，而且會讓家長守在畫面前面數秒。
 * 一律向上取整到分鐘，並且封頂：超過一小時就只說「稍後再試」。
 */
export function retryAfterText(seconds: number | undefined): string | undefined {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  if (seconds > 3600) return undefined;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `約 ${minutes} 分鐘後可以再試。`;
}
