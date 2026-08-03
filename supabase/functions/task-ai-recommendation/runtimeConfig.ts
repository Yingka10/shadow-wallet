// task-ai-recommendation — 執行期設定
//
// ─────────────────────────────────────────────────────────────────────────
// model 名稱與 timeout 都從環境變數讀，**不散落在程式碼裡**。
//
// 為什麼 timeout 也要可設定：B2A 要真的驗證逾時路徑。等 Gemini 偶然超時
// 是不可行的（可能永遠等不到），而加一個 `X-Simulate-Timeout` header 更糟 ——
// 那等於讓任何 client 都能觸發一條只有測試該走的分支。
//
// 用環境變數的話，觸發權在**部署者**手上，不在請求端。
//
// ⚠️ 但可設定就代表可以設錯。所以下面每一個值都有：
//   - 型別驗證（不是數字就用預設值）
//   - 最小／最大限制（設成 0 或 999999 都會被夾回範圍）
//   - production-safe 預設值
//
// 一個「設成 5ms 之後忘記改回來」的 staging，會讓每一次請求都逾時，
// 而且看起來像 Gemini 壞掉。夾回範圍不能防止這件事，
// 但至少不會變成「設成 0 之後每個請求立刻失敗」。
// ─────────────────────────────────────────────────────────────────────────

import { TIMEOUTS } from './contract.ts';

/**
 * 逾時的合法範圍。
 *
 * 下限 10ms：低於這個值連本機的 stub 都來不及回應，那不是設定是筆誤。
 * 保留這麼低是**刻意的** —— B2A 的逾時驗證需要一個小到能穩定觸發的值，
 * 而那個值必須是合法設定，不是特例分支。
 *
 * 上限 30s：Supabase Edge Function 本身有執行上限，設得比它長沒有意義，
 * 只會讓家長多等。
 */
export const TIMEOUT_BOUNDS = { minMs: 10, maxMs: 30_000 } as const;

/** 沒設定、設錯、或設成非數字時使用。 */
export const DEFAULT_TIMEOUT_MS = TIMEOUTS.geminiRequestMs;

export type TimeoutResolution = {
  timeoutMs: number;
  /** 供 log 用：這個值是怎麼來的。**不含環境變數的原始內容。** */
  source: 'default' | 'env' | 'env_clamped' | 'env_invalid';
};

/**
 * 解析 `TASK_AI_TIMEOUT_MS`。
 *
 * 純函式 —— 環境變數由呼叫端讀進來。這樣它才測得動，
 * 也才不會在 import 時就把設定固定住。
 */
export function resolveTimeoutMs(raw: string | undefined | null): TimeoutResolution {
  if (raw === undefined || raw === null || raw.trim() === '') {
    return { timeoutMs: DEFAULT_TIMEOUT_MS, source: 'default' };
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    // 設錯不該讓 Function 掛掉，但也不該安靜地照用。
    return { timeoutMs: DEFAULT_TIMEOUT_MS, source: 'env_invalid' };
  }

  if (parsed < TIMEOUT_BOUNDS.minMs) {
    return { timeoutMs: TIMEOUT_BOUNDS.minMs, source: 'env_clamped' };
  }
  if (parsed > TIMEOUT_BOUNDS.maxMs) {
    return { timeoutMs: TIMEOUT_BOUNDS.maxMs, source: 'env_clamped' };
  }

  return { timeoutMs: parsed, source: 'env' };
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/**
 * 沒設定 `GEMINI_TASK_RECOMMENDATION_MODEL` 時使用。
 *
 * 這是**後備值**不是設定值。正式部署一律由環境變數指定，
 * 好處是換 model 不需要改程式碼、不需要重新 review、不需要重新測型別。
 *
 * 選 `-latest` 別名的理由與 ai-proxy 相同：它永遠指向 Google 當前可用的
 * flash，不會被「舊 model 對新用戶下架」咬到（`gemini-2.5-flash` 已經
 * 對新 key 下架過一次）。
 */
export const DEFAULT_MODEL = 'gemini-flash-latest';

/** model 名稱的形狀。擋的是設定錯字與注入，不是判斷 model 存不存在。 */
const MODEL_PATTERN = /^[a-z0-9][a-z0-9.-]{2,63}$/;

export type ModelResolution = {
  model: string;
  source: 'default' | 'env' | 'env_invalid';
};

export function resolveModel(raw: string | undefined | null): ModelResolution {
  const trimmed = raw?.trim();
  if (!trimmed) return { model: DEFAULT_MODEL, source: 'default' };

  // model 名稱會被拼進 URL。一個含 `/` 或 `?` 的值可以把請求導到別的路徑，
  // 所以這裡不是「順手驗一下」，是必要的。
  if (!MODEL_PATTERN.test(trimmed)) {
    return { model: DEFAULT_MODEL, source: 'env_invalid' };
  }

  return { model: trimmed, source: 'env' };
}
