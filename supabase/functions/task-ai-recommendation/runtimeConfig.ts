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

import { CONTRACT, TIMEOUTS } from './contract.ts';

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

// ---------------------------------------------------------------------------
// 總開關
// ---------------------------------------------------------------------------
//
// 為什麼需要一個開關：這條路徑會花錢，而且會把家長輸入送給第三方模型。
// 出事的時候（帳單異常、red-team 發現新的繞過方式、Google 那邊改行為）
// 需要一個**幾秒內就能關掉**的方法，而不是等一次 redeploy。
//
// `supabase secrets set TASK_AI_ENABLED=false` 幾秒生效，不需要動程式碼、
// 不需要 review、不需要在半夜找人 approve PR。
//
// 關掉之後回的是 `unavailable / SERVICE_DISABLED`（HTTP 200），不是 5xx：
// 對家長來說「AI 現在沒有建議」和「AI 壞了」是同一件事 —— 都不影響建立任務 ——
// 但對我們來說「是我們主動關的」和「它自己掛了」完全不同，
// 所以 log 分得出來。

export type FeatureSwitch = {
  enabled: boolean;
  source: 'default' | 'env' | 'env_invalid';
};

const TRUE_VALUES = ['true', '1', 'on', 'enabled'];
const FALSE_VALUES = ['false', '0', 'off', 'disabled'];

/**
 * 解析 `TASK_AI_ENABLED`。
 *
 * 沒設定 = 開啟。這樣既有部署不會因為少一個變數就整個功能消失。
 *
 * **設了但看不懂 = 關閉。** 這是刻意的不對稱：沒設定代表「沒有人表達意見」，
 * 設成 `flase` 代表「有人正在試圖控制這個開關」——
 * 而在那個當下猜錯的代價是不對等的（誤關只是少了建議，誤開是繼續花錢
 * 或繼續送出我們正想停掉的請求）。
 */
export function resolveFeatureEnabled(raw: string | undefined | null): FeatureSwitch {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) return { enabled: true, source: 'default' };
  if (TRUE_VALUES.includes(trimmed)) return { enabled: true, source: 'env' };
  if (FALSE_VALUES.includes(trimmed)) return { enabled: false, source: 'env' };
  return { enabled: false, source: 'env_invalid' };
}

// ---------------------------------------------------------------------------
// 限流額度
// ---------------------------------------------------------------------------
//
// ⚠️ 這裡的數字是**暫定值，未經產品驗證**。它們的來源是「一個家長在
// 一次任務編輯裡合理會按幾次」的直覺，不是使用資料。
// 真實值要等有人真的用過才知道。詳見 docs/TASK_AI_PRODUCTION_READINESS.md。
//
// **不在程式裡硬編 Gemini 的每日配額。** 那個數字屬於帳戶方案，
// 不屬於這支 Function —— 寫進來只會在方案改變時變成一個沒有人記得的謊言。

export type RateLimitConfig = {
  per10Minutes: number;
  perDay: number;
  source: 'default' | 'env' | 'env_clamped' | 'env_invalid';
};

function resolveCount(
  raw: string | undefined | null,
  fallback: number,
  max: number,
): { value: number; source: FeatureSwitch['source'] | 'env_clamped' } {
  if (raw === undefined || raw === null || raw.trim() === '') {
    return { value: fallback, source: 'default' };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return { value: fallback, source: 'env_invalid' };
  }
  if (parsed > max) return { value: max, source: 'env_clamped' };
  return { value: parsed, source: 'env' };
}

/**
 * 解析兩個視窗的額度上限。
 *
 * 上限夾在契約的 `maxPer10Minutes` / `maxPerDay`：一個手滑打成 6000 的
 * 環境變數不該等於「沒有限流」。同樣的夾制在 SQL 那邊**又做了一次** ——
 * 不是重複，是因為那支 RPC 可以被 authenticated 直接呼叫，
 * 它不能相信參數是這裡送來的。
 */
export function resolveRateLimit(
  raw10: string | undefined | null,
  rawDay: string | undefined | null,
): RateLimitConfig {
  const limits = CONTRACT.rateLimit;
  const a = resolveCount(raw10, limits.defaultPer10Minutes, limits.maxPer10Minutes);
  const b = resolveCount(rawDay, limits.defaultPerDay, limits.maxPerDay);

  // 兩個來源不同時，回報比較「值得注意」的那一個：
  // 設錯 > 被夾 > 有設 > 預設。log 只有一個欄位，要留給最需要被看到的事。
  const rank = { env_invalid: 3, env_clamped: 2, env: 1, default: 0 } as const;
  const source = rank[a.source] >= rank[b.source] ? a.source : b.source;

  return { per10Minutes: a.value, perDay: b.value, source };
}
