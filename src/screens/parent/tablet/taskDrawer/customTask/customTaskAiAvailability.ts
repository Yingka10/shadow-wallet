// Shadow Wallet · Parent Tablet — AI 建議在自訂任務裡的可用狀態
//
// ─────────────────────────────────────────────────────────────────────────
// AI recommendation 的第一版 eligibility 只開放 C／D 類（B2A.5 決定）。
// 自訂任務接進來之後，家長會遇到三種完全不同的情況：
//
//   1. 這則任務可以取得建議
//   2. 這種任務目前不提供建議          ← 不是錯誤，是範圍
//   3. 建議服務暫時無法使用            ← 是故障或逾時
//
// 三種必須在畫面上分得出來。混成一句「目前無法取得建議」的話，
// 家長會對著一個永遠不會成功的按鈕重試 —— 而第 2 種永遠不會成功。
//
// ⚠️ **`TASK_TYPE_NOT_ENABLED` 這種代碼不可以顯示給家長。**
//    那是我們的 log 詞彙。家長需要知道的是「這件事不影響你建立任務」，
//    不是一個看起來像故障代碼的東西。
//
// ⚠️ 本輪**不接真服務**。這裡只有 deterministic 的狀態判斷與文案，
//    沒有任何 Edge Function 呼叫。接線在 B2B。
//
// ── 兩個決策的分界（很容易被誤讀）─────────────────────────────────────
//
//   「B 類可以使用成長幣」          ← 這一輪修訂的
//   「B 類目前不開放生成式 AI」      ← 沒有改，維持 B2A.5 的決定
//
// 兩者沒有關係。前者是回饋政策，後者是內容安全的使用範圍 ——
// A／B 類任務的建議天然落在實體家務操作上，那是安全層最弱的地方。
// 不要因為這一輪放寬了回饋政策就順手把 AI 也打開。
// ─────────────────────────────────────────────────────────────────────────

import type { PurposeCategory } from '../taskCatalog';

/** 第一版開放 AI 建議的任務目的。與 Edge Function 的 eligibility 契約一致。 */
const AI_ENABLED_PURPOSE_CATEGORIES: readonly PurposeCategory[] = [
  'autonomous_challenge',
  'learning_skill',
] as const;

export type TaskAiAvailabilityState =
  /** 可以按「取得調整建議」。 */
  | 'available'
  /** 這種任務目前不提供建議。**不是錯誤，按鈕不該出現。** */
  | 'not_offered_for_this_task'
  /** 服務暫時不可用。可以稍後再試。 */
  | 'service_unavailable';

export type TaskAiAvailabilityCopy = {
  state: TaskAiAvailabilityState;
  /** 區塊標題。 */
  title: string;
  /** 給家長看的說明。**不含任何代碼。** */
  message: string;
  /** 要不要顯示「取得調整建議」按鈕。 */
  showActionButton: boolean;
  /** 這次失敗值不值得重試。not_offered 永遠是 false —— 重試一百次都一樣。 */
  retryable: boolean;
};

const COPY: Record<TaskAiAvailabilityState, Omit<TaskAiAvailabilityCopy, 'state'>> = {
  available: {
    title: '需要一點整理的建議嗎',
    message: '可以請 AI 看一次這份草稿，提出幾個可以更清楚的地方。採不採用由你決定。',
    showActionButton: true,
    retryable: false,
  },
  not_offered_for_this_task: {
    title: '這一類任務目前不提供 AI 建議',
    // 說出「為什麼」而不只是「不行」：家長會想知道是自己設定錯了，
    // 還是系統本來就不做這件事。也明確講「不影響建立」——
    // 那是家長此刻真正在意的事。
    message:
      '生活自理與家庭參與的任務，我們還在確認 AI 的建議品質，先不提供。'
      + '這不影響任務建立，你可以直接完成設定。',
    showActionButton: false,
    retryable: false,
  },
  service_unavailable: {
    title: '目前無法取得建議',
    message: '建議服務暫時沒有回應。這不影響任務建立，你可以直接完成設定，稍後再試。',
    showActionButton: true,
    retryable: true,
  },
};

export type ResolveAiAvailabilityInput = {
  purposeCategory: PurposeCategory;
  /**
   * 服務層此刻的健康狀態。
   *
   * 由呼叫端提供而不是在這裡判斷：這個模組不該知道 Edge Function 存在。
   * 本輪一律傳 true（沒有接真服務）。
   */
  serviceHealthy: boolean;
};

/**
 * 這則任務現在能不能用 AI 建議。
 *
 * 純函式。**順序有意義**：先問「這種任務開不開放」，再問「服務活著嗎」。
 * 反過來的話，服務掛掉時連 A／B 類任務都會顯示「稍後再試」，
 * 而它們再試一百次也不會有建議。
 */
export function resolveTaskAiAvailability(
  input: ResolveAiAvailabilityInput,
): TaskAiAvailabilityCopy {
  if (!AI_ENABLED_PURPOSE_CATEGORIES.includes(input.purposeCategory)) {
    return { state: 'not_offered_for_this_task', ...COPY.not_offered_for_this_task };
  }
  if (!input.serviceHealthy) {
    return { state: 'service_unavailable', ...COPY.service_unavailable };
  }
  return { state: 'available', ...COPY.available };
}

/**
 * Edge Function 的 unavailable reason → 家長看得懂的狀態。
 *
 * 這個對照表存在的唯一理由是**不要把內部代碼顯示給家長**。
 * `NOT_ELIGIBLE` 對我們是「使用範圍」，對家長應該是一句
 * 「這一類任務目前不提供」，而不是一串大寫英文。
 *
 * ⚠️ 本輪沒有呼叫真服務，這支函式目前只有測試在用。
 *    它先寫下來是為了讓 B2B 接線時不必臨時想文案 ——
 *    臨時想的結果通常就是把代碼直接印出去。
 */
export function aiAvailabilityFromUnavailableReason(reason: string): TaskAiAvailabilityState {
  switch (reason) {
    case 'NOT_ELIGIBLE':
      return 'not_offered_for_this_task';
    case 'TIMEOUT':
    case 'SERVICE_ERROR':
    case 'INVALID_RESPONSE':
    case 'UNSAFE_OUTPUT':
    case 'SERVICE_DISABLED':
      return 'service_unavailable';
    default:
      // 認不得的 reason 一律當成暫時性問題。
      // 猜成 not_offered 的話，一個新加的 reason 會讓按鈕默默消失，
      // 而沒有人會發現 —— 那比多顯示一次「稍後再試」糟糕得多。
      return 'service_unavailable';
  }
}
