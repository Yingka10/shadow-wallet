// Shadow Wallet — 環境設定的唯一讀取點
//
// process.env 只在這個檔案裡讀。其餘程式碼拿 `supabaseEnvironment`，
// 拿到的要嘛是驗證過的資訊，要嘛是明確的失敗 —— 沒有「可能是 undefined」
// 的中間狀態，也沒有第二個地方能偷偷再讀一次 env 然後做出不同判斷。
//
// Expo 會在打包時把 `process.env.EXPO_PUBLIC_*` 靜態替換掉，
// 所以這裡一定要逐個字面引用，不能用變數組出 key。

import {
  SUPABASE_ENVIRONMENT_FAILURE_MESSAGE,
  SupabaseEnvironmentError,
  resolveAppEnvironment,
  resolveBadgeMode,
  validateSupabaseEnvironment,
  type SupabaseEnvironmentInfo,
} from './supabaseEnvironment';

export * from './supabaseEnvironment';

export type SupabaseEnvironmentResult =
  | { ok: true; info: SupabaseEnvironmentInfo; anonKey: string }
  | { ok: false; error: SupabaseEnvironmentError };

function read(): SupabaseEnvironmentResult {
  try {
    const appEnvironment = resolveAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV);
    const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
    if (!anonKey) {
      // 訊息裡只講「沒有設定」，不講長度也不講前綴 —— 那些足以縮小猜測範圍。
      throw new SupabaseEnvironmentError(
        'SUPABASE_URL_MISSING',
        '沒有設定 EXPO_PUBLIC_SUPABASE_ANON_KEY。',
      );
    }
    const info = validateSupabaseEnvironment({
      appEnvironment,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      expectedProjectRef: process.env.EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF ?? '',
      badgeMode: resolveBadgeMode(process.env.EXPO_PUBLIC_ENV_BADGE_MODE),
    });
    return { ok: true, info, anonKey };
  } catch (err) {
    const error =
      err instanceof SupabaseEnvironmentError
        ? err
        : new SupabaseEnvironmentError('APP_ENV_MISSING', SUPABASE_ENVIRONMENT_FAILURE_MESSAGE);
    return { ok: false, error };
  }
}

/** 模組載入時就決定好，之後不會變 —— 環境不該在 App 跑到一半改變。 */
export const supabaseEnvironment: SupabaseEnvironmentResult = read();
