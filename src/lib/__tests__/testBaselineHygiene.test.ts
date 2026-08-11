// 測試只能依賴進得了版本庫的東西
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支防的是一種特別難查的假紅：測試讀了一個 **gitignore 掉的**檔案。
//
// 症狀是「同一個 commit，兩台機器結果不同」——
// 手邊剛好有那份本機草稿的人全套 pass，乾淨 clone 或新開的 worktree
// 直接 collection fail。而失敗訊息長得像功能壞了，不像環境問題，
// 所以第一反應永遠是去查產品程式碼。
//
// 已經發生過一次：childProposalContractMigration.test.ts 讀
// docs/CONTRACT_P0-1_child-proposal.md，而 `docs/` 在 .gitignore 裡
// （「local analysis & scratch docs」）。那份檔案從來沒有進過版本庫，
// 但它一缺席就讓那支測試的一百多條斷言一起倒。
//
// 規則因此很簡單：**測試不從 docs/ 讀檔。**
// 契約要驗就驗 tracked 的來源 —— migration SQL、TypeScript、SQL COMMENT。
// 那些東西 code review 看得到，scratch 草稿看不到。
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { globSync } from 'glob';

const ROOT = process.cwd();

/** 去掉註解 —— 「docs/… 見那份文件」這種說明不算依賴。 */
function codeOnly(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('測試不依賴 gitignore 掉的檔案', () => {
  const testFiles = globSync('**/__tests__/**/*.test.{ts,tsx}', {
    cwd: ROOT,
    ignore: ['node_modules/**'],
    absolute: true,
    // 這一支自己就要寫出被禁的目錄名，否則掃不了 —— 會掃到自己。
  }).filter((file) => file !== __filename);

  it('有掃到東西（glob 壞掉時不要靜靜通過）', () => {
    expect(testFiles.length).toBeGreaterThan(50);
  });

  it.each([['docs'], ['scratch']])(
    '沒有任何測試從 %s/ 讀檔',
    (ignoredDir) => {
      const offenders = testFiles.filter((file) => {
        const code = codeOnly(readFileSync(file, 'utf8'));
        // join(process.cwd(), 'docs', …) 與 'docs/…' 兩種寫法都算。
        return new RegExp(`['"\`]${ignoredDir}[/'"\`]`).test(code);
      }).map((file) => relative(ROOT, file).split('\\').join('/'));

      expect(offenders).toEqual([]);
    },
  );

  it('.gitignore 仍然把 docs/ 當本機草稿（規則的前提沒變）', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^docs\/$/m);
  });
});
