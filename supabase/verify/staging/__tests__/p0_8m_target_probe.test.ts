// P0-8M staging 驗收 — target 證據。
//
// 這支要先跑、而且必須自己證明目標，因為專案裡的 `.env.local` 目前指向
// **production**。整輪驗收只靠命令列的環境變數把目標換成 staging，
// 所以「環境變數真的蓋過 .env.local 了嗎」不能用推論的。
//
// 額外的保險是 supabaseEnvironment 的 PROJECT_REF_MISMATCH：URL 與宣告的
// expected ref 對不上時它拒絕建立 client。也就是說，萬一覆寫沒有生效，
// 結果是整組測試爆掉，而不是安靜地連到正式專案。

import { supabaseEnvironment } from '../../../../src/lib/environment';

const RUN = process.env.STAGING_P0_8M === '1';
const suite = RUN ? describe : describe.skip;

const STAGING_REF = 'lcmzbdgzehjxwuyduqwj';
const PRODUCTION_REF = 'mduaghqszbwmoigllpbj';

suite('P0-8M · target proof', () => {
  it('環境守衛成功解析，而且解析出來的是 growbook-staging', () => {
    expect(supabaseEnvironment.ok).toBe(true);
    if (!supabaseEnvironment.ok) return;
    expect(supabaseEnvironment.info.projectRef).toBe(STAGING_REF);
    expect(supabaseEnvironment.info.appEnvironment).toBe('staging');
  });

  it('production ref 沒有出現在任何一個 target 證據裡', () => {
    if (!supabaseEnvironment.ok) throw new Error('環境守衛沒過，不繼續');
    expect(supabaseEnvironment.info.url).not.toContain(PRODUCTION_REF);
    expect(supabaseEnvironment.info.projectRef).not.toBe(PRODUCTION_REF);
    expect(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').not.toContain(PRODUCTION_REF);
    expect(process.env.EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF)
      .toBe(STAGING_REF);
  });
});
