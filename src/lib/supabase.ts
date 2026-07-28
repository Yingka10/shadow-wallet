import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import {
  SUPABASE_ENVIRONMENT_FAILURE_MESSAGE,
  supabaseEnvironment,
} from './environment';

// 環境設定講不清楚時，這裡**不建立 client**。
//
// 舊版是 `process.env.EXPO_PUBLIC_SUPABASE_URL!` —— 那個 `!` 的意思是
// 「相信它一定在」，而實際上 `.env.local` 一旦消失，Expo 會安靜地退回
// `.env`，App 照常啟動、照常登入，只是連的是正式專案。
//
// 所以失敗時給的是一個「碰到就丟錯」的替身，而不是連到別的地方的 client：
// 唯一比連錯資料庫更糟的是連錯了還不知道。
function unavailableClient(): SupabaseClient<Database> {
  const fail = (): never => {
    throw new Error(SUPABASE_ENVIRONMENT_FAILURE_MESSAGE);
  };
  return new Proxy({} as SupabaseClient<Database>, {
    get: fail,
    apply: fail,
  });
}

if (!supabaseEnvironment.ok) {
  // console 只印錯誤類型與說明，不印 anon key、不印密碼、不印連線字串。
  console.error(
    `[supabase] ${supabaseEnvironment.error.code}｜${supabaseEnvironment.error.message}`,
  );
}

export const supabase: SupabaseClient<Database> = supabaseEnvironment.ok
  ? createClient<Database>(supabaseEnvironment.info.url, supabaseEnvironment.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : unavailableClient();
