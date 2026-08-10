// Shadow Wallet · Parent Tablet — AI 建議服務的模式
//
// ─────────────────────────────────────────────────────────────────────────
// 三種模式，而且**必須是顯式選擇**：
//
//   off   完全不呼叫任何服務，畫面上不出現 AI 區塊
//   fake  用本機假資料（開發與測試）
//   live  真的呼叫 task-ai-recommendation Edge Function
//
// 這一支的整個重點是「不猜」。
//
// 兩種猜法各有各的災難：
//
//   猜成 live —— 一次開發時的誤按就是一筆真的付費請求，
//                而且家長端會把 staging 的資料送進正式的模型配額。
//
//   猜成 fake —— 更糟，因為它**看起來是成功的**。staging 驗收時
//                畫面上出現了幾張漂亮的建議卡，所有人都以為串接完成了，
//                而實際上那批文字是寫死在 repo 裡的。
//
// 所以缺值、值看不懂、或這個環境不允許的時候，一律退到 off ——
// 那是唯一一種「壞掉的時候看得出來壞掉」的模式。
//
// ⚠️ **live 失敗絕對不會退回 fake。** 那會製造出上面第二種災難的即時版：
//    真的服務掛了，家長卻收到一批來源不明的建議。
//    降級只能降到「目前無法取得建議」，不能降到「假裝有建議」。
// ─────────────────────────────────────────────────────────────────────────

import type { AppEnvironment } from '../../../../../lib/environment';

export type TaskAiServiceMode = 'off' | 'fake' | 'live';

/**
 * 為什麼是這個模式。
 *
 * **只在 development 顯示**，而且只顯示這個代號本身 —— 它不含 URL、
 * project ref 或任何設定值。用途是回答驗收時最常問的一句話：
 * 「畫面上這批建議是真的嗎？」
 */
export type TaskAiServiceModeReason =
  /** 環境變數明確指定，而且這個環境允許。 */
  | 'explicit'
  /** 沒有設定。 */
  | 'unset'
  /** 設了但不是三個合法值之一。 */
  | 'invalid'
  /** 值合法，但這個環境不允許（例如 production 的 fake）。 */
  | 'not_allowed_here'
  /** test 一律 off —— 測試自己注入需要的替身。 */
  | 'test_environment';

export type TaskAiServiceModeResolution = {
  mode: TaskAiServiceMode;
  reason: TaskAiServiceModeReason;
};

const MODES: readonly TaskAiServiceMode[] = ['off', 'fake', 'live'];

/**
 * 每個環境允許哪些模式。
 *
 * production 不允許 `fake`：對真實家庭顯示一批寫死的建議，
 * 比完全沒有這個功能糟糕得多 —— 家長會照著那些字調整孩子的任務。
 */
const ALLOWED_MODES: Record<AppEnvironment, readonly TaskAiServiceMode[]> = {
  development: ['off', 'fake', 'live'],
  staging: ['off', 'fake', 'live'],
  production: ['off', 'live'],
  test: ['off'],
};

/**
 * 沒有設定時用哪一個。
 *
 * 四個環境全部是 `off`，包含 development —— 一個「預設就會動」的 AI 功能
 * 會讓人忘記它其實需要被明確打開，而那個習慣帶到 staging 就是誤判驗收結果。
 */
const DEFAULT_MODE: TaskAiServiceMode = 'off';

export function resolveTaskAiServiceMode(
  raw: string | undefined | null,
  appEnvironment: AppEnvironment,
): TaskAiServiceModeResolution {
  // test 不看環境變數。測試要什麼替身就自己注入什麼，
  // 讓 CI 的行為取決於某台機器的 .env 是最難重現的一種失敗。
  if (appEnvironment === 'test') {
    return { mode: 'off', reason: 'test_environment' };
  }

  const value = (raw ?? '').trim();
  if (value === '') return { mode: DEFAULT_MODE, reason: 'unset' };
  if (!(MODES as readonly string[]).includes(value)) {
    return { mode: DEFAULT_MODE, reason: 'invalid' };
  }

  const mode = value as TaskAiServiceMode;
  if (!ALLOWED_MODES[appEnvironment].includes(mode)) {
    return { mode: DEFAULT_MODE, reason: 'not_allowed_here' };
  }

  return { mode, reason: 'explicit' };
}

/** development 面板上的一行。**不含任何設定值。** */
export function taskAiServiceModeLabel(resolution: TaskAiServiceModeResolution): string {
  const reason: Record<TaskAiServiceModeReason, string> = {
    explicit: '明確設定',
    unset: '未設定，已退回關閉',
    invalid: '設定值無法辨識，已退回關閉',
    not_allowed_here: '這個環境不允許該模式，已退回關閉',
    test_environment: '測試環境一律關閉',
  };
  return `AI 服務模式：${resolution.mode}（${reason[resolution.reason]}）`;
}
