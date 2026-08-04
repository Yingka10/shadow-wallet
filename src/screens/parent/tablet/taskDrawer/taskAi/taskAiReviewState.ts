// Shadow Wallet · Parent Tablet — AI 建議區塊的狀態
//
// ─────────────────────────────────────────────────────────────────────────
// 為什麼是 discriminated union 而不是四個 boolean：
//
//   isLoading && isRateLimited && hasSuggestions
//
// 這個組合在型別上完全合法，在畫面上是三段互相矛盾的文字同時出現。
// 而它一定會發生 —— rate limit 回來時忘記把 isLoading 設回 false 就有了。
//
// union 讓那種狀態根本表達不出來。
//
// 另外一條：**item 的狀態是算出來的，不是記下來的。**
//
// 家長改了草稿之後，哪些建議還套得上去？記一個 boolean 的話，
// 每一個會改到草稿的地方都要記得去更新它 —— 而漏掉的那一個
// 就是「套用了一個對不上的建議」。所以這裡每次都用當下的草稿重算。
// ─────────────────────────────────────────────────────────────────────────

import { readAiField, type AiFieldValue, type AppliedSuggestionRecord } from './applyTaskAiSuggestion';
import type { TaskDraft } from '../taskDraft';
import type { TaskAiSuggestion, TaskAiUnavailableReason } from './types';

/**
 * 家長對這一項的處置 ＋ 它現在還套不套得上去。
 *
 * `stale` 與 `applied_edited` 都不是家長選的，是草稿變了之後算出來的。
 */
export type TaskAiItemState =
  /** 還沒決定，而且現在套得上去。 */
  | 'pending'
  /** 已採用，而且那個欄位還是採用後的值 —— 可以安全復原。 */
  | 'applied'
  /** 已採用，但家長之後又自己改過那個欄位。**復原會蓋掉家長的輸入。** */
  | 'applied_edited'
  /** 家長選擇保留原設定。 */
  | 'kept'
  /** 目標欄位已經和建議說的「目前設定」不同了，不可直接套用。 */
  | 'stale';

export type TaskAiSuggestionItem = {
  suggestion: TaskAiSuggestion;
  /**
   * 送出請求**當下**這個欄位在本機草稿裡的真實值。
   *
   * ⚠️ 這是「目前設定」的唯一來源 —— **不要改用 `suggestion.currentValue`。**
   *
   * 模型收到的是遮蔽過孩子名字的草稿（`buildTaskAiInput` 的資料最小化），
   * 所以它回的 `currentValue` 是遮蔽後的字串：本機是「承恩的成長計畫」，
   * 模型回的是「孩子的成長計畫」。拿它去比對本機草稿永遠不相等，
   * 結果是**每一則指向含名字欄位的建議一產生就是 stale、永遠按不下採用**，
   * 而畫面上還會顯示一個家長從沒設定過的值。
   *
   * `suggestion.currentValue` 因此只屬於 transport／安全契約（由 server
   * validator 驗），**不進 UI、不參與 stale 判斷**。
   */
  baselineValue: AiFieldValue;
  state: TaskAiItemState;
  /** 只有 applied / applied_edited 才有。復原時要用。 */
  record?: AppliedSuggestionRecord;
};

/**
 * 家長看得懂的「沒有建議」理由。
 *
 * 只有兩種，因為家長只需要做兩種決定：**再試一次**，或**不用管它**。
 * TIMEOUT / SERVICE_ERROR / INVALID_RESPONSE / UNSAFE_OUTPUT 對家長
 * 完全是同一件事，分開顯示只會讓人以為自己遇到了不同的問題。
 */
export type UserFacingUnavailableReason =
  /** 暫時的。可以再試。 */
  | 'temporary'
  /** 這一類任務目前不提供。再試一百次都一樣。 */
  | 'not_offered';

export type TaskAiReviewState =
  | { kind: 'idle' }
  | {
      kind: 'loading';
      /** 這一次請求的號碼。回來時對不上就丟掉。 */
      requestToken: number;
      inputSignature: string;
    }
  | {
      kind: 'suggestions';
      inputSignature: string;
      summary: string;
      items: TaskAiSuggestionItem[];
    }
  | { kind: 'no_change'; inputSignature: string; summary: string }
  | {
      kind: 'unavailable';
      reason: UserFacingUnavailableReason;
      /** development 才顯示的固定代號。**不是原始回傳。** */
      developerCode?: string;
    }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }
  | { kind: 'auth_required' };

// ---------------------------------------------------------------------------
// Edge Function 的 reason → 家長看得懂的狀態
// ---------------------------------------------------------------------------

export function userFacingUnavailable(
  reason: TaskAiUnavailableReason,
): { reason: UserFacingUnavailableReason; developerCode: string } {
  const userFacing: UserFacingUnavailableReason =
    reason === 'NOT_ELIGIBLE' ? 'not_offered' : 'temporary';
  return { reason: userFacing, developerCode: reason };
}

// ---------------------------------------------------------------------------
// item 狀態的重算
// ---------------------------------------------------------------------------

/** 兩個欄位值一不一樣。陣列逐項比，其餘用嚴格相等。 */
export function aiFieldValuesEqual(a: AiFieldValue, b: AiFieldValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;
  return a === b;
}

/**
 * 依目前草稿重算每一項的狀態。
 *
 * 規則刻意做成**可逆**的：家長把欄位改回去，那一項就從 stale 變回 pending。
 * 不可逆的話，一次手滑輸入就會永久廢掉一則本來有用的建議。
 *
 * `kept` 不重算 —— 那是家長做過的決定，和欄位值沒有關係。
 */
export function refreshItemStates(
  items: readonly TaskAiSuggestionItem[],
  draft: TaskDraft,
): TaskAiSuggestionItem[] {
  return items.map(item => {
    if (item.state === 'kept') return item;

    const current = readAiField(draft, item.suggestion.fieldPath);

    if (item.state === 'applied' || item.state === 'applied_edited') {
      // 採用後那個欄位還是建議值 → 復原是安全的。
      const untouched = aiFieldValuesEqual(current, item.suggestion.suggestedValue);
      return { ...item, state: untouched ? 'applied' : 'applied_edited' };
    }

    /*
      pending / stale：**家長在送出請求之後，自己動過這個欄位嗎。**

      比對的是本機 baseline，不是 `suggestion.currentValue` —— 後者是模型
      收到的遮蔽版本（見 baselineValue 的說明）。用它比對的話，只要欄位裡
      有孩子的名字，這一項就會在家長什麼都還沒做的時候被標成 stale。
    */
    const matches = aiFieldValuesEqual(current, item.baselineValue);
    return { ...item, state: matches ? 'pending' : 'stale' };
  });
}

/** 這一項現在可不可以按「採用這項」。 */
export function canApplyItem(item: TaskAiSuggestionItem): boolean {
  return item.state === 'pending';
}

/**
 * 這一項現在可不可以按「復原」。
 *
 * `applied_edited` 回 false 是刻意的 fail-safe：家長在採用之後又自己改了
 * 那個欄位，復原會把他剛打的字換成一個舊值。寧可少一個按鈕，
 * 也不要無聲蓋掉家長的輸入。
 */
export function canUndoItem(item: TaskAiSuggestionItem): boolean {
  return item.state === 'applied' && item.record !== undefined;
}

// ---------------------------------------------------------------------------
// 單項處置
// ---------------------------------------------------------------------------

function patchItem(
  items: readonly TaskAiSuggestionItem[],
  suggestionId: string,
  patch: (item: TaskAiSuggestionItem) => TaskAiSuggestionItem,
): TaskAiSuggestionItem[] {
  return items.map(item => (item.suggestion.id === suggestionId ? patch(item) : item));
}

export function markItemApplied(
  items: readonly TaskAiSuggestionItem[],
  suggestionId: string,
  record: AppliedSuggestionRecord,
): TaskAiSuggestionItem[] {
  return patchItem(items, suggestionId, item => ({ ...item, state: 'applied', record }));
}

export function markItemKept(
  items: readonly TaskAiSuggestionItem[],
  suggestionId: string,
): TaskAiSuggestionItem[] {
  return patchItem(items, suggestionId, item => ({ ...item, state: 'kept' }));
}

/** 復原之後回到 pending —— 家長可以再改變主意，那一項沒有被用掉。 */
export function markItemUndone(
  items: readonly TaskAiSuggestionItem[],
  suggestionId: string,
): TaskAiSuggestionItem[] {
  return patchItem(items, suggestionId, item => {
    // baseline 要留著：復原之後這一項回到 pending，還要能再比一次。
    const next: TaskAiSuggestionItem = {
      suggestion: item.suggestion,
      baselineValue: item.baselineValue,
      state: 'pending',
    };
    return next;
  });
}

/**
 * 剛拿到一批建議時的初始狀態。
 *
 * `requestedDraft` 必須是**送出請求當下**那一份草稿（`handleAiRequest` 在
 * 呼叫服務之前就把它抓下來了），不是回應到達時的最新草稿：每一項的
 * baseline 就從這裡取。等待期間家長若改過欄位，緊接著的 `refreshItemStates`
 * 會用最新草稿把那一項標成 stale —— 那才是真正的「設定已變更」。
 */
export function initialItems(
  suggestions: readonly TaskAiSuggestion[],
  requestedDraft: TaskDraft,
): TaskAiSuggestionItem[] {
  return refreshItemStates(
    suggestions.map(suggestion => ({
      suggestion,
      baselineValue: readAiField(requestedDraft, suggestion.fieldPath),
      state: 'pending' as const,
    })),
    requestedDraft,
  );
}
