// 第七階段 E — repo 衛生
//
// `supabase/.temp/` 是 Supabase CLI 記錄「這台機器現在 link 哪一個 project」
// 的地方。它被版控追蹤時有兩個後果：每次切換環境都產生 diff，
// 而且**一個人的連線目標會被帶進別人的 checkout**。
//
// 第七階段 D 期間就發生過：link 到 staging 之後 `git status` 冒出六個
// 修改檔案，內容是 project-ref 與 pooler-url。那不是專案設定，是本機狀態。

import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

describe('supabase/.temp 不進版控', () => {
  it('git 沒有追蹤 supabase/.temp 底下的任何檔案', () => {
    expect(git('ls-files', 'supabase/.temp')).toBe('');
  });

  it('.gitignore 擋著它', () => {
    const gitignore = readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^supabase\/\.temp\/?$/m);
  });

  it('git 自己也認為它被忽略', () => {
    // check-ignore 對被忽略的路徑回傳 exit 0；沒被忽略時會丟。
    expect(() => git('check-ignore', 'supabase/.temp/project-ref')).not.toThrow();
  });
});

describe('不把環境值寫進 tracked 檔案', () => {
  it('.env.example 只有變數名稱與說明，沒有真實值', () => {
    const example = readFileSync(join(REPO_ROOT, '.env.example'), 'utf8');

    for (const key of [
      'EXPO_PUBLIC_APP_ENV',
      'EXPO_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      'EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF',
      'EXPO_PUBLIC_ENV_BADGE_MODE',
    ]) {
      expect(example).toContain(key);
    }

    // 每一個變數都必須是空值。
    const assignments = example
      .split('\n')
      .filter(line => /^EXPO_PUBLIC_/.test(line));
    expect(assignments.length).toBeGreaterThan(0);
    for (const line of assignments) {
      expect({ line, value: line.split('=').slice(1).join('=').trim() })
        .toEqual({ line, value: '' });
    }

    // 註解裡可以有 https://<ref>.supabase.co 這種形狀說明（那正是最常填錯的地方），
    // 但賦值那幾行不能有真的網址或 JWT。
    const values = assignments.join('\n');
    expect(values).not.toMatch(/supabase\.co/);
    expect(values).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    // 註解裡也不可以出現 20 字元的真實 project ref。
    expect(example).not.toMatch(/\b[a-z0-9]{20}\b/);
  });

  it('.env / .env.local 這類本機檔案沒有被追蹤', () => {
    const tracked = git('ls-files').split('\n');
    const leaked = tracked.filter(
      path => /(^|\/)\.env($|\.)/.test(path) && !path.endsWith('.env.example'),
    );
    expect(leaked).toEqual([]);
  });
});
