// 第七階段 E — Supabase 連線環境防呆
//
// 這一支守的是一個具體事故：驗收期間 `.env.local` 指向 staging、
// `.env` 指向 production，而 Expo 讓前者蓋過後者。只要 `.env.local`
// 被刪掉或改名，App 就會**無聲地連回正式專案** —— 一樣能登入、
// 一樣能建任務，只是寫進了真實家庭的資料。
//
// 所以每一條測試問的都是同一件事：設定講不清楚的時候，它會不會自己猜？

import {
  ENVIRONMENT_BADGE_LABEL,
  SupabaseEnvironmentError,
  parseSupabaseProjectRef,
  resolveAppEnvironment,
  resolveBadgeMode,
  shouldShowBadge,
  validateSupabaseEnvironment,
  type AppEnvironment,
} from '../supabaseEnvironment';

// 假的 ref：20 個小寫英數字，與真實專案無關。
const REF_A = 'aaaabbbbccccddddeeee';
const REF_B = 'zzzzyyyyxxxxwwwwvvvv';
const URL_A = `https://${REF_A}.supabase.co`;

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    return err instanceof SupabaseEnvironmentError ? err.code : `非預期錯誤：${String(err)}`;
  }
  return '沒有丟錯';
}

// ---------------------------------------------------------------------------
// 1. 解析 project ref
// ---------------------------------------------------------------------------

describe('parseSupabaseProjectRef', () => {
  it('從專案根 URL 取出 ref', () => {
    expect(parseSupabaseProjectRef(URL_A)).toBe(REF_A);
  });

  it('容許結尾斜線', () => {
    expect(parseSupabaseProjectRef(`${URL_A}/`)).toBe(REF_A);
  });

  it('前後空白不影響', () => {
    expect(parseSupabaseProjectRef(`  ${URL_A}  `)).toBe(REF_A);
  });

  // ---------------------------------------------------------------------
  // 2. 拒絕 endpoint URL
  //
  // 這不是假想情況：驗收時 `.env.local` 填的就是 Dashboard 上複製到的
  // `/rest/v1/`，supabase-js 再接一次，組出 `.../rest/v1//rest/v1`，
  // 所有請求回 PGRST125，而錯誤訊息完全沒指向設定值。
  // ---------------------------------------------------------------------
  it.each([
    ['/rest/v1', `${URL_A}/rest/v1`],
    ['/rest/v1/（帶結尾斜線）', `${URL_A}/rest/v1/`],
    ['/auth/v1', `${URL_A}/auth/v1`],
    ['/functions/v1', `${URL_A}/functions/v1`],
  ])('拒絕 %s', (_label, url) => {
    expect(codeOf(() => parseSupabaseProjectRef(url))).toBe('SUPABASE_URL_NOT_ROOT');
  });

  it('拒絕帶 query 的網址', () => {
    expect(codeOf(() => parseSupabaseProjectRef(`${URL_A}?apikey=x`)))
      .toBe('SUPABASE_URL_NOT_ROOT');
  });

  it('空值有自己的錯誤碼', () => {
    expect(codeOf(() => parseSupabaseProjectRef(''))).toBe('SUPABASE_URL_MISSING');
  });

  it.each([
    ['不是網址', 'not a url'],
    ['沒有子網域', 'https://supabase.co'],
    ['ref 長度不對', 'https://short.supabase.co'],
  ])('解析不出 ref 就丟錯：%s', (_label, url) => {
    expect(codeOf(() => parseSupabaseProjectRef(url))).toBe('SUPABASE_URL_UNPARSABLE');
  });
});

// ---------------------------------------------------------------------------
// 3-5. APP_ENV
// ---------------------------------------------------------------------------

describe('resolveAppEnvironment', () => {
  it.each<AppEnvironment>(['development', 'staging', 'production', 'test'])(
    '接受 %s', env => expect(resolveAppEnvironment(env)).toBe(env));

  it('缺少 APP_ENV 直接丟錯 —— 不退回 production', () => {
    for (const missing of [undefined, null, '', '   ']) {
      expect(codeOf(() => resolveAppEnvironment(missing))).toBe('APP_ENV_MISSING');
    }
  });

  it('production 必須明確宣告，不會由其他值推導出來', () => {
    // 「看起來像 production」的字串一律不接受。
    for (const near of ['prod', 'PRODUCTION', 'Production', 'live']) {
      expect(codeOf(() => resolveAppEnvironment(near))).toBe('APP_ENV_INVALID');
    }
    expect(resolveAppEnvironment('production')).toBe('production');
  });
});

// ---------------------------------------------------------------------------
// 6. expected ref 比對
// ---------------------------------------------------------------------------

describe('validateSupabaseEnvironment', () => {
  it('staging：ref 一致就通過', () => {
    const info = validateSupabaseEnvironment({
      appEnvironment: 'staging', supabaseUrl: URL_A, expectedProjectRef: REF_A,
    });
    expect(info).toEqual({
      appEnvironment: 'staging', projectRef: REF_A, url: URL_A, showBadge: true,
    });
  });

  it('staging：ref 不一致就拒絕 —— 這是整個模組存在的理由', () => {
    expect(codeOf(() => validateSupabaseEnvironment({
      appEnvironment: 'staging', supabaseUrl: URL_A, expectedProjectRef: REF_B,
    }))).toBe('PROJECT_REF_MISMATCH');
  });

  it.each<AppEnvironment>(['development', 'staging'])(
    '%s 沒有宣告 expected ref 就拒絕', env => {
      for (const missing of [undefined, null, '']) {
        expect(codeOf(() => validateSupabaseEnvironment({
          appEnvironment: env, supabaseUrl: URL_A, expectedProjectRef: missing,
        }))).toBe('EXPECTED_REF_MISSING');
      }
    });

  it('production 不需要宣告 expected ref（由部署環境提供）', () => {
    expect(validateSupabaseEnvironment({
      appEnvironment: 'production', supabaseUrl: URL_A,
    }).projectRef).toBe(REF_A);
  });

  it('production 若宣告了 expected ref，一樣要比對', () => {
    expect(codeOf(() => validateSupabaseEnvironment({
      appEnvironment: 'production', supabaseUrl: URL_A, expectedProjectRef: REF_B,
    }))).toBe('PROJECT_REF_MISMATCH');
  });

  it('test 可以注入假的 URL 與 ref', () => {
    const info = validateSupabaseEnvironment({
      appEnvironment: 'test', supabaseUrl: URL_A, expectedProjectRef: REF_A,
    });
    expect({ ref: info.projectRef, badge: info.showBadge }).toEqual({ ref: REF_A, badge: false });
  });

  it('URL 是 endpoint 時，連 ref 都不比對就先拒絕', () => {
    expect(codeOf(() => validateSupabaseEnvironment({
      appEnvironment: 'staging',
      supabaseUrl: `${URL_A}/rest/v1`,
      expectedProjectRef: REF_A,
    }))).toBe('SUPABASE_URL_NOT_ROOT');
  });

  it('錯誤訊息不含 anon key 之類的祕密，但講得出哪兩個 ref 對不上', () => {
    try {
      validateSupabaseEnvironment({
        appEnvironment: 'staging', supabaseUrl: URL_A, expectedProjectRef: REF_B,
      });
      throw new Error('應該要丟錯');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain(REF_A);
      expect(message).toContain(REF_B);
      expect(message).not.toMatch(/eyJ|anon|password/i);
    }
  });
});

// ---------------------------------------------------------------------------
// 7-8. badge
// ---------------------------------------------------------------------------

describe('環境標示', () => {
  it('staging 與 development 預設顯示', () => {
    expect(shouldShowBadge('staging', 'auto')).toBe(true);
    expect(shouldShowBadge('development', 'auto')).toBe(true);
    expect(shouldShowBadge('staging', 'show')).toBe(true);
  });

  it('hide 時不顯示', () => {
    expect(shouldShowBadge('staging', 'hide')).toBe(false);
    expect(shouldShowBadge('development', 'hide')).toBe(false);
  });

  it('production 與 test 一律不顯示，show 也不行', () => {
    for (const mode of ['show', 'auto', 'hide'] as const) {
      expect({ mode, production: shouldShowBadge('production', mode) })
        .toEqual({ mode, production: false });
      expect({ mode, test: shouldShowBadge('test', mode) }).toEqual({ mode, test: false });
    }
  });

  it('hide 只關掉標示，驗證照跑', () => {
    // 同一組壞設定，badgeMode 給 hide，仍然要丟出同一個錯誤碼。
    expect(codeOf(() => validateSupabaseEnvironment({
      appEnvironment: 'staging', supabaseUrl: URL_A,
      expectedProjectRef: REF_B, badgeMode: 'hide',
    }))).toBe('PROJECT_REF_MISMATCH');

    // 設定正確時也只是 showBadge 變 false，其餘資訊不變。
    const info = validateSupabaseEnvironment({
      appEnvironment: 'staging', supabaseUrl: URL_A,
      expectedProjectRef: REF_A, badgeMode: 'hide',
    });
    expect({ ref: info.projectRef, badge: info.showBadge })
      .toEqual({ ref: REF_A, badge: false });
  });

  it('badgeMode 認不得的值退回 auto —— 它不決定連哪一個資料庫', () => {
    expect(resolveBadgeMode(undefined)).toBe('auto');
    expect(resolveBadgeMode('')).toBe('auto');
    expect(resolveBadgeMode('yes')).toBe('auto');
    expect(resolveBadgeMode('hide')).toBe('hide');
  });

  it('標示文字：staging 是 STAGING、development 是 DEV，其餘為空', () => {
    expect(ENVIRONMENT_BADGE_LABEL.staging).toBe('STAGING');
    expect(ENVIRONMENT_BADGE_LABEL.development).toBe('DEV');
    expect(ENVIRONMENT_BADGE_LABEL.production).toBe('');
    expect(ENVIRONMENT_BADGE_LABEL.test).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 硬編碼檢查
// ---------------------------------------------------------------------------

describe('不把真實 ref 寫進程式碼', () => {
  it('模組原始碼裡沒有任何 20 字元的 project ref 常數', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'supabaseEnvironment.ts'), 'utf8');
    // 只找字串字面值，避免誤判註解與識別字。
    const literals = src.match(/'[a-z0-9]{20}'|"[a-z0-9]{20}"/g) ?? [];
    expect(literals).toEqual([]);
  });
});
