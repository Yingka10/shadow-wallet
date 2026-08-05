// Shadow Wallet — Supabase 連線環境的防呆
//
// 為什麼需要這一層：
//
// Expo 的 env 載入順序讓 `.env.local` 蓋過 `.env`。第七階段 D 驗收期間
// `.env.local` 指向 staging、`.env` 指向 production —— 只要前者被刪掉、改名，
// 或某次載入失敗，App 會**無聲地連回正式專案**。畫面上看不出任何差別：
// 一樣能登入（用正式帳號）、一樣能建立任務，只是寫進去的是真實家庭的資料。
//
// 那是這個專案最貴的一種錯：沒有錯誤訊息、沒有紅字，等到發現時資料已經在裡面了。
//
// 所以這裡的原則是「寧可不啟動」：設定講不清楚就拒絕建立 client，
// 而不是猜一個看起來合理的目標。fallback 到 production 永遠不是合理的猜測。
//
// 這個檔案是純函式，不讀 process.env、不碰 React、不建立 client ——
// 測試才能注入假的 URL 與 ref，而不需要一個真的專案。

export type AppEnvironment = 'development' | 'staging' | 'production' | 'test';

export type EnvironmentBadgeMode = 'show' | 'hide' | 'auto';

export type SupabaseEnvironmentInfo = {
  appEnvironment: AppEnvironment;
  projectRef: string;
  url: string;
  showBadge: boolean;
};

export type SupabaseEnvironmentErrorCode =
  /** 沒有宣告 EXPO_PUBLIC_APP_ENV。不猜，尤其不猜 production。 */
  | 'APP_ENV_MISSING'
  /** 宣告了但不是四個合法值之一。 */
  | 'APP_ENV_INVALID'
  /** 沒有給 Supabase URL。 */
  | 'SUPABASE_URL_MISSING'
  /** 給的是 REST / Auth / Functions endpoint，不是專案根 URL。 */
  | 'SUPABASE_URL_NOT_ROOT'
  /** 解析不出 project ref。 */
  | 'SUPABASE_URL_UNPARSABLE'
  /** development / staging 沒有宣告預期的 project ref。 */
  | 'EXPECTED_REF_MISSING'
  /** URL 指向的 project 與宣告的預期不同 —— 最重要的一條。 */
  | 'PROJECT_REF_MISMATCH';

export class SupabaseEnvironmentError extends Error {
  readonly code: SupabaseEnvironmentErrorCode;

  constructor(code: SupabaseEnvironmentErrorCode, message: string) {
    super(message);
    this.name = 'SupabaseEnvironmentError';
    this.code = code;
  }
}

/** 給使用者看的那一句。刻意不含 URL、ref、key —— 畫面上的字會被截圖。 */
export const SUPABASE_ENVIRONMENT_FAILURE_MESSAGE =
  'Supabase 環境設定不完整，App 未連線。';

const APP_ENVIRONMENTS: readonly AppEnvironment[] = [
  'development',
  'staging',
  'production',
  'test',
];

const BADGE_MODES: readonly EnvironmentBadgeMode[] = ['show', 'hide', 'auto'];

/** Supabase 的 project ref：20 個小寫英數字。 */
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;

/** 這三個路徑是最容易貼錯的 —— Dashboard 上複製得到的就是它們。 */
const ENDPOINT_PATHS = ['/rest/v1', '/auth/v1', '/functions/v1', '/storage/v1', '/realtime/v1'];

function trimmed(value: string | undefined | null): string {
  return (value ?? '').trim();
}

// ---------------------------------------------------------------------------
// APP_ENV
// ---------------------------------------------------------------------------

/**
 * 把 EXPO_PUBLIC_APP_ENV 解析成型別。
 *
 * 缺值時**丟錯而不是回預設值**。這個函式存在的唯一理由就是不要有預設值：
 * 任何預設都等於在替使用者猜他想連哪一個資料庫。
 */
export function resolveAppEnvironment(raw: string | undefined | null): AppEnvironment {
  const value = trimmed(raw);
  if (!value) {
    throw new SupabaseEnvironmentError(
      'APP_ENV_MISSING',
      '沒有設定 EXPO_PUBLIC_APP_ENV。請明確宣告 development / staging / production / test，不會自動採用 production。',
    );
  }
  if (!(APP_ENVIRONMENTS as readonly string[]).includes(value)) {
    throw new SupabaseEnvironmentError(
      'APP_ENV_INVALID',
      `EXPO_PUBLIC_APP_ENV 的值「${value}」不合法，只能是 development / staging / production / test。`,
    );
  }
  return value as AppEnvironment;
}

export function resolveBadgeMode(raw: string | undefined | null): EnvironmentBadgeMode {
  const value = trimmed(raw);
  // badge 只是視覺提示，缺值退回 auto 是安全的 —— 它不決定連哪一個資料庫。
  if (!(BADGE_MODES as readonly string[]).includes(value)) return 'auto';
  return value as EnvironmentBadgeMode;
}

// ---------------------------------------------------------------------------
// URL → project ref
// ---------------------------------------------------------------------------

/**
 * 從專案根 URL 取出 project ref。
 *
 * 這裡對「根 URL」很嚴格，因為驗收時真的踩過：`.env.local` 填的是
 * `https://<ref>.supabase.co/rest/v1/`（Dashboard 上複製得到的那個），
 * supabase-js 會再接一次 `/rest/v1`，組出 `.../rest/v1//rest/v1`，
 * 然後所有請求回 PGRST125。錯誤訊息完全沒指向設定值。
 */
export function parseSupabaseProjectRef(url: string): string {
  const value = trimmed(url);
  if (!value) {
    throw new SupabaseEnvironmentError('SUPABASE_URL_MISSING', '沒有設定 EXPO_PUBLIC_SUPABASE_URL。');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SupabaseEnvironmentError(
      'SUPABASE_URL_UNPARSABLE',
      'EXPO_PUBLIC_SUPABASE_URL 不是合法的網址。',
    );
  }

  const path = parsed.pathname.replace(/\/+$/, '');
  if (path !== '') {
    const hint = ENDPOINT_PATHS.find(p => `${path}/`.startsWith(`${p}/`));
    throw new SupabaseEnvironmentError(
      'SUPABASE_URL_NOT_ROOT',
      hint
        ? `EXPO_PUBLIC_SUPABASE_URL 是 ${hint} endpoint，不是專案根 URL。請去掉路徑，只保留 https://<ref>.supabase.co。`
        : 'EXPO_PUBLIC_SUPABASE_URL 必須是專案根 URL，不能帶路徑。',
    );
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    throw new SupabaseEnvironmentError(
      'SUPABASE_URL_NOT_ROOT',
      'EXPO_PUBLIC_SUPABASE_URL 不能帶 query 或 fragment。',
    );
  }

  const [ref, ...rest] = parsed.hostname.split('.');
  if (rest.length === 0 || !PROJECT_REF_PATTERN.test(ref)) {
    throw new SupabaseEnvironmentError(
      'SUPABASE_URL_UNPARSABLE',
      'EXPO_PUBLIC_SUPABASE_URL 解析不出 Supabase project ref，網址應為 https://<ref>.supabase.co。',
    );
  }
  return ref;
}

// ---------------------------------------------------------------------------
// 驗證
// ---------------------------------------------------------------------------

export type ValidateSupabaseEnvironmentInput = {
  appEnvironment: AppEnvironment;
  supabaseUrl: string;
  /** development / staging 必填；其餘給了就一併比對。 */
  expectedProjectRef?: string | null;
  badgeMode?: EnvironmentBadgeMode;
};

/**
 * 驗證這次要連的 project 是不是「說好的那一個」。
 *
 * development 與 staging 必須宣告 expectedProjectRef，因為這兩種環境的
 * `.env.local` 就在開發者手上、最容易被改掉或搞混。production 由部署環境
 * 明確提供，不需要在 client 端再宣告一次自己是誰。
 */
export function validateSupabaseEnvironment({
  appEnvironment,
  supabaseUrl,
  expectedProjectRef,
  badgeMode = 'auto',
}: ValidateSupabaseEnvironmentInput): SupabaseEnvironmentInfo {
  const projectRef = parseSupabaseProjectRef(supabaseUrl);
  const expected = trimmed(expectedProjectRef);

  const needsExpectedRef = appEnvironment === 'development' || appEnvironment === 'staging';
  if (needsExpectedRef && !expected) {
    throw new SupabaseEnvironmentError(
      'EXPECTED_REF_MISSING',
      `${appEnvironment} 必須設定 EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF，用來確認連的是預期的專案。`,
    );
  }

  if (expected && expected !== projectRef) {
    // 兩個 ref 都印出來：它們不是密碼，而少了任何一邊都無從判斷是哪裡設錯。
    throw new SupabaseEnvironmentError(
      'PROJECT_REF_MISMATCH',
      `Supabase URL 指向的專案（${projectRef}）與宣告的預期（${expected}）不同，已停止連線。`,
    );
  }

  return {
    appEnvironment,
    projectRef,
    url: trimmed(supabaseUrl).replace(/\/+$/, ''),
    showBadge: shouldShowBadge(appEnvironment, badgeMode),
  };
}

/**
 * badge 顯不顯示。
 *
 * production 與 test 一律不顯示；staging / development 由 badgeMode 決定。
 * `hide` 存在的理由是正式 Demo 截圖不想要角落有字 —— 但它只關掉這個布林值，
 * 上面的驗證照跑，關掉標示不等於關掉防呆。
 */
export function shouldShowBadge(
  appEnvironment: AppEnvironment,
  badgeMode: EnvironmentBadgeMode,
): boolean {
  if (appEnvironment === 'production' || appEnvironment === 'test') return false;
  if (badgeMode === 'hide') return false;
  return true; // show 與 auto 在 development / staging 都顯示
}

export const ENVIRONMENT_BADGE_LABEL: Record<AppEnvironment, string> = {
  development: 'DEV',
  staging: 'STAGING',
  production: '',
  test: '',
};

export const ENVIRONMENT_BADGE_A11Y_LABEL = '目前使用測試環境';
