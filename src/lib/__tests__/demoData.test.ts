// 第七階段 F — Demo 展示資料與 QA regression 資料的分離
//
// staging 上住著兩組資料，用途相反：
//
//   qa_seed.sql    regression 用。名稱刻意帶技術性（QA Child 8、
//                  QA idempotency 測試），因為 E2E 會斷言那些字串。
//   demo_seed.sql  給人看的。任何一個 QA/test/debug 字眼出現在 Demo 畫面上，
//                  都會讓人覺得這是半成品。
//
// 兩者最危險的互動是 reset：一支沒有 family 範圍的 DELETE 會把另一組清掉。
// 所以下面除了檢查文案，更重要的是檢查**每一條 DELETE 都有範圍**。

import { readFileSync } from 'fs';
import { join } from 'path';

const DIR = join(__dirname, '..', '..', '..', 'supabase', 'verify', 'staging');
const read = (name: string) => readFileSync(join(DIR, name), 'utf8');

const DEMO_SEED = read('demo_seed.sql');
const DEMO_RESET = read('demo_reset.sql');
const QA_SEED = read('qa_seed.sql');
const RUNNER = read('run_demo.sh');

const DEMO_FAMILY = 'd0e70000-0000-4000-8000-000000000001';

/** 去掉註解，只留真正會被執行的 SQL。 */
function statementsOf(sql: string): string {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
}

// ---------------------------------------------------------------------------
// 14. Demo 資料不含技術性字眼
// ---------------------------------------------------------------------------

describe('14. Demo seed 的內容是給人看的', () => {
  /** 只看會被寫進資料庫的中文字串（單引號內），不看註解與欄位名。 */
  const literals = statementsOf(DEMO_SEED)
    .match(/'[^']*'/g)
    ?.map(s => s.slice(1, -1)) ?? [];

  it.each(['QA', 'idempotency', 'debug', '測試'])(
    '寫進資料庫的字串不含「%s」', term => {
      const offenders = literals.filter(v => v.toLowerCase().includes(term.toLowerCase()));
      expect(offenders).toEqual([]);
    });

  it('六筆展示任務都在', () => {
    for (const name of ['完成學校作業', '餐後整理', '運動練習',
      '四週閱讀計畫', '整理書包 14 天', '四週餐桌小幫手']) {
      expect(DEMO_SEED).toContain(`'${name}'`);
    }
  });

  it('孩子是承恩、家庭是 GrowBook Demo Family', () => {
    expect(DEMO_SEED).toContain("'承恩'");
    expect(DEMO_SEED).toContain("'GrowBook Demo Family'");
  });

  it('可發幣的那一筆有正的幣值 —— 不展示 0 枚成長幣任務', () => {
    // demo_coin(12, 5, 25)：12 來自正式的 coin policy。
    expect(DEMO_SEED).toMatch(/demo_coin\(\s*(\d+)/);
    const amount = Number(DEMO_SEED.match(/demo_coin\(\s*(\d+)/)![1]);
    expect(amount).toBeGreaterThan(0);
  });

  it('成長計畫有五個里程碑，而且沒有任何「已完成」標記', () => {
    const milestones = DEMO_SEED.match(/'targetDay',\s*\d+/g) ?? [];
    expect(milestones).toHaveLength(5);
    // 目前沒有 milestone completion model，seed 也不該假裝有。
    expect(DEMO_SEED).not.toMatch(/completedAt|completed_at|'completed'/);
  });

  it('不含密碼、金鑰或 project ref', () => {
    expect(DEMO_SEED).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(DEMO_SEED).not.toMatch(/supabase\.co/);
    // 密碼是必須被替換掉的佔位符，不是真的值。
    expect(DEMO_SEED).toContain('__DEMO_PASSWORD__');
  });

  it('佔位符沒被替換就拒絕建立帳號', () => {
    expect(DEMO_SEED).toMatch(/RAISE EXCEPTION[^;]*DEMO_PASSWORD/);
  });
});

// ---------------------------------------------------------------------------
// 15 + 17. reset 的範圍
// ---------------------------------------------------------------------------

describe('15. demo_reset 只刪 Demo family', () => {
  const body = statementsOf(DEMO_RESET);

  it('沒有 TRUNCATE', () => {
    expect(body).not.toMatch(/TRUNCATE/i);
  });

  it('沒有 DROP TABLE / DROP SCHEMA', () => {
    expect(body).not.toMatch(/DROP\s+(TABLE|SCHEMA|DATABASE)/i);
  });

  it('每一條 DELETE 都有 WHERE', () => {
    const deletes = body.match(/DELETE FROM[\s\S]*?;/g) ?? [];
    expect(deletes.length).toBeGreaterThan(10);
    for (const stmt of deletes) {
      expect({ stmt: stmt.slice(0, 60), hasWhere: /WHERE/i.test(stmt) })
        .toEqual({ stmt: stmt.slice(0, 60), hasWhere: true });
    }
  });

  it('每一條 DELETE 的範圍都追溯得到 Demo family', () => {
    // 允許的範圍變數：family / 該 family 的孩子 / 該 family 的任務 / demo 使用者。
    const deletes = body.match(/DELETE FROM[\s\S]*?;/g) ?? [];
    for (const stmt of deletes) {
      const scoped = /v_family|v_kids|v_tasks|v_user/.test(stmt);
      expect({ stmt: stmt.slice(0, 60), scoped }).toEqual({ stmt: stmt.slice(0, 60), scoped: true });
    }
  });

  it('範圍來自固定 id，不是「第一個家庭」這種不穩定的判斷', () => {
    expect(body).toContain(DEMO_FAMILY);
    expect(body).not.toMatch(/LIMIT 1|ORDER BY created_at\s+(ASC|LIMIT)/i);
  });

  it('刪之前先確認那個 id 真的是 Demo family', () => {
    expect(body).toContain("'GrowBook Demo Family'");
    expect(body).toMatch(/RAISE EXCEPTION[^;]*Demo family/);
  });
});

describe('17. QA regression 資料不會被 Demo reset 波及', () => {
  it('reset 完全沒有提到 QA 的任何識別字', () => {
    const body = statementsOf(DEMO_RESET);
    for (const term of ['QA Family', 'QA Parent', 'QA Child', 'qa-parent']) {
      expect(body).not.toContain(term);
    }
  });

  it('兩組 seed 的 family 名稱不同、帳號網域也不同', () => {
    expect(QA_SEED).toContain("'QA Family A'");
    expect(DEMO_SEED).toContain("'GrowBook Demo Family'");
    expect(QA_SEED).toContain('@example.invalid');
    expect(DEMO_SEED).toContain('@growbook-demo.invalid');
    expect(DEMO_SEED).not.toContain('@example.invalid');
  });

  it('Demo 的固定 id 不會出現在 QA seed 裡', () => {
    expect(QA_SEED).not.toContain('d0e70000');
  });
});

// ---------------------------------------------------------------------------
// 16. 可重複執行
// ---------------------------------------------------------------------------

describe('16. reset → seed 連跑兩次不會產生重複', () => {
  it('身分用固定 id，所以重跑不會多出一個家庭或孩子', () => {
    for (const id of [
      'd0e70000-0000-4000-8000-000000000001', // family
      'd0e70000-0000-4000-8000-000000000011', // auth user
      'd0e70000-0000-4000-8000-000000000021', // child
      'd0e70000-0000-4000-8000-000000000031', // wallet
    ]) {
      expect(DEMO_SEED).toContain(id);
    }
  });

  it('每一筆任務都有固定的 clientRequestId —— DB 層的 idempotency 也擋一次', () => {
    const requestIds = DEMO_SEED.match(/'d0e70000-0000-4000-8000-0000000000a\d'/g) ?? [];
    expect(requestIds).toHaveLength(6);
    expect(new Set(requestIds).size).toBe(6); // 六筆各自不同，不會互相覆蓋
  });

  it('已經有資料時 seed 直接停手，要求先 reset', () => {
    expect(DEMO_SEED).toMatch(/RAISE EXCEPTION[^;]*demo_reset\.sql/);
  });

  it('沒有資料時 reset 不算失敗（可以直接 reseed）', () => {
    expect(DEMO_RESET).toMatch(/RAISE NOTICE[^;]*不存在/);
  });
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

describe('run_demo.sh 的安全條件', () => {
  it('沒有指定目標就不執行 —— 這支腳本會刪資料', () => {
    expect(RUNNER).toContain('DEMO_STAGING_REF');
    expect(RUNNER).toMatch(/中止：請設定 DEMO_STAGING_REF/);
  });

  it('比對 linked ref，而且要求專案名稱是 growbook-staging', () => {
    expect(RUNNER).toContain('supabase/.temp/project-ref');
    expect(RUNNER).toContain('growbook-staging');
  });

  it('密碼只從環境變數讀，不寫死也不放進指令列', () => {
    expect(RUNNER).toContain('DEMO_PASSWORD');
    expect(RUNNER).not.toMatch(/DEMO_PASSWORD=['"][^'"$]/);
  });

  it('不含 project ref 或金鑰', () => {
    expect(RUNNER).not.toMatch(/[a-z0-9]{20}/);
    expect(RUNNER).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });

  it('用 stdout.buffer 輸出 —— 否則中文會在送進資料庫前被本機 codepage 轉壞', () => {
    // 這不是假設性的：第一次跑 seed 時就是這樣壞的，而且壞得很安靜 ——
    // 筆數正確、只有名稱是亂碼。
    expect(RUNNER).toContain('stdout.buffer.write');
    expect(RUNNER).not.toMatch(/sys\.stdout\.write\(/);
  });
});

describe('編碼守門', () => {
  it('seed 會驗中文的位元組長度，不是比對內容', () => {
    // 比對內容抓不到傳輸損壞：SQL 裡的字串和寫進去的值會一起壞掉，兩邊仍然相等。
    expect(DEMO_SEED).toContain('octet_length(nickname)');
    expect(DEMO_SEED).toMatch(/RAISE EXCEPTION[^;]*位元組/);
  });
});
