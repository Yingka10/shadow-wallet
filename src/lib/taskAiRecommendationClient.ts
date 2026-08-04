// Shadow Wallet — AI 建議 client 的唯一建立點
//
// ─────────────────────────────────────────────────────────────────────────
// `process.env.EXPO_PUBLIC_TASK_AI_MODE` 只在這裡讀一次，理由與
// `lib/environment` 相同：第二個讀取點就是第二套判斷，而兩套判斷遲早
// 會在某個環境下給出不同答案 —— 而那個答案決定的是「要不要真的花錢
// 呼叫模型」與「畫面上這批建議是不是真的」。
//
// 三種模式各自回什麼：
//
//   off   → null。呼叫端看到 null 就整個不顯示 AI 區塊。
//           **不是**一個「按了會失敗」的 client —— 那會讓家長對著
//           一顆永遠不會成功的按鈕重試。
//   fake  → 本機假資料。只在 development / staging 允許。
//   live  → 真的打 Edge Function。
//
// ⚠️ live 建立失敗（例如 Supabase 環境沒設好）時回 null，**不退回 fake**。
//    「服務不可用」與「這批建議是假的」是兩件完全不同的事，
//    而後者在畫面上看起來是成功的。
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import { supabaseEnvironment } from './environment';
import {
  FakeTaskAiRecommendationService,
  LiveTaskAiRecommendationClient,
  resolveTaskAiServiceMode,
  taskAiClientFromService,
  TASK_AI_FUNCTION_NAME,
  type InvokeTaskAiFunction,
  type TaskAiRecommendationClient,
  type TaskAiServiceModeResolution,
} from '../screens/parent/tablet/taskDrawer/taskAi';

export type TaskAiClientSetup = {
  resolution: TaskAiServiceModeResolution;
  /** null = 這個環境不提供 AI 建議。畫面上不出現 AI 區塊。 */
  client: TaskAiRecommendationClient | null;
};

/**
 * supabase-js 的 invoke 包成一支函式。
 *
 * adapter 因此不必認識 SupabaseClient，也就能在 jest 裡完整測試 ——
 * 不需要 URL、不需要金鑰，更不會有人不小心讓測試連上網。
 */
const invokeTaskAiFunction: InvokeTaskAiFunction = async (body, signal) =>
  supabase.functions.invoke(TASK_AI_FUNCTION_NAME, {
    body,
    ...(signal ? { signal } : null),
  });

export function createTaskAiClientSetup(
  rawMode: string | undefined | null,
): TaskAiClientSetup {
  // 環境沒設好時連 app environment 都不知道 —— 那時候一律不提供 AI。
  if (!supabaseEnvironment.ok) {
    return { resolution: { mode: 'off', reason: 'unset' }, client: null };
  }

  const resolution = resolveTaskAiServiceMode(
    rawMode,
    supabaseEnvironment.info.appEnvironment,
  );

  switch (resolution.mode) {
    case 'off':
      return { resolution, client: null };
    case 'fake':
      return { resolution, client: taskAiClientFromService(new FakeTaskAiRecommendationService()) };
    case 'live':
      return { resolution, client: new LiveTaskAiRecommendationClient(invokeTaskAiFunction) };
  }
}

/**
 * 模組載入時就決定好。
 *
 * 與 `supabaseEnvironment` 同一個理由：模式不該在 App 跑到一半改變，
 * 否則同一次建立流程裡的兩次請求可能走到不同的地方。
 */
export const taskAiClientSetup: TaskAiClientSetup = createTaskAiClientSetup(
  process.env.EXPO_PUBLIC_TASK_AI_MODE,
);
