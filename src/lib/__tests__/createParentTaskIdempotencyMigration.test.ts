// 第七階段 C — idempotency migration 的靜態檢查
//
// ⚠️ 這一支**不是** integration test。它讀 SQL 檔案的字串，證明的只有
// 「這段 SQL 有寫進去」，不是「這段 SQL 在 PostgreSQL 上跑起來是對的」。
//
// 真正的驗證在 supabase/verify/task_reward_verification.sql：那支在一次性的
// PostgreSQL cluster 上實際套用 migration 並跑 assertion。結果記在
// docs/TASK_DRAWER_POSTGRES_VERIFICATION.md。
//
// 這一支的用途是抓「有人改了 RPC 但忘了同一件事」——例如把 replay 查詢
// 移到授權之前，或把包住 tasks INSERT 的例外處理擴大到整個函式。

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 讀檔一律把 CRLF 正規化成 LF。
 *
 * 這個 repo 的 git 設定會在 checkout 時把行尾轉成 CRLF（Windows），
 * 而下面的斷言用多行片段比對 SQL。不正規化的話，一次 `git checkout`
 * 就能讓一堆測試「壞掉」，但程式其實一個字都沒改。
 */
function readText(path: string): string {
  return readFileSync(path, 'utf8').split(/\r\n/).join('\n');
}

const MIGRATION = readText(join(
  process.cwd(), 'supabase', 'migrations',
  '20260730000000_create_parent_task_idempotency.sql',
));

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

describe('tasks.creation_request_id', () => {
  it('型別是 uuid，不是 text', () => {
    // text 會讓大小寫不同的同一個 id 變成兩筆，unique 就失去意義。
    expect(MIGRATION).toContain('ADD COLUMN IF NOT EXISTS creation_request_id uuid');
    expect(MIGRATION).not.toMatch(/creation_request_id\s+text/);
  });

  it('有 unique index —— 沒有它整套 idempotency 只是祈禱', () => {
    expect(MIGRATION).toContain('CREATE UNIQUE INDEX IF NOT EXISTS tasks_creation_request_id_key');
    expect(MIGRATION).toContain('WHERE creation_request_id IS NOT NULL');
  });

  it('預設任務必填、legacy 任務可為 null', () => {
    expect(MIGRATION).toContain(
      'CHECK (NOT created_from_preset OR creation_request_id IS NOT NULL)',
    );
  });

  it('沒有改動已經驗證過的兩支 migration', () => {
    for (const name of [
      '20260728000000_task_drawer_persistence_v1.sql',
      '20260729000000_task_reward_and_completion_authz.sql',
    ]) {
      const other = readText(join(process.cwd(), 'supabase', 'migrations', name));
      expect({ name, has: other.includes('creation_request_id') })
        .toEqual({ name, has: false });
    }
  });
});

// ---------------------------------------------------------------------------
// RPC
// ---------------------------------------------------------------------------

describe('create_parent_task_v1 的 idempotency', () => {
  const fn = MIGRATION.slice(
    MIGRATION.indexOf('CREATE OR REPLACE FUNCTION public.create_parent_task_v1'),
  );

  it('缺識別碼時回 VALIDATION_FAILED，不是硬跑下去', () => {
    expect(fn).toContain("'message', '命令缺少建立請求識別碼'");
  });

  it('格式先用正規表達式擋，不直接 ::uuid 讓它拋 22P02', () => {
    expect(fn).toContain("v_request_raw !~*");
    expect(fn).toContain("'message', format('建立請求識別碼格式不正確：%s', v_request_raw)");
  });

  it('replay 查詢排在授權檢查之後 —— 否則它會變成探測工具', () => {
    const authzAt = fn.indexOf('caller does not belong to family');
    const replayAt = fn.indexOf('preset_task_replay_payload');
    expect(authzAt).toBeGreaterThan(-1);
    expect(replayAt).toBeGreaterThan(authzAt);
  });

  it('查到既有任務就直接回傳，不再 insert', () => {
    const before = fn.slice(0, fn.indexOf('INSERT INTO tasks'));
    expect(before).toContain('IF v_replay IS NOT NULL THEN');
    expect(before).toContain('RETURN v_replay;');
  });

  it('tasks INSERT 寫入 creation_request_id', () => {
    expect(fn).toContain('created_from_preset, creation_request_id,');
    expect(fn).toContain('v_schema_version, true, v_request_id,');
  });

  it('成功回傳標記 idempotentReplay: false', () => {
    expect(fn).toContain("'idempotentReplay', false");
  });
});

// ---------------------------------------------------------------------------
// 競態
// ---------------------------------------------------------------------------

describe('競態處理', () => {
  const fn = MIGRATION.slice(
    MIGRATION.indexOf('CREATE OR REPLACE FUNCTION public.create_parent_task_v1'),
  );

  it('unique_violation 的例外處理只包住 tasks 那一個 INSERT', () => {
    const handlerAt = fn.indexOf('EXCEPTION WHEN unique_violation');
    const childTasksAt = fn.indexOf('INSERT INTO child_tasks');
    const selectionsAt = fn.indexOf('INSERT INTO task_preset_selections');

    expect(handlerAt).toBeGreaterThan(-1);
    // 子表的 insert 都在 handler 後面 = 不在保護範圍內，它們的 unique 違反
    // 仍然會往外拋、讓整筆回滾（這是 20260728 就有的行為）。
    expect(childTasksAt).toBeGreaterThan(handlerAt);
    expect(selectionsAt).toBeGreaterThan(handlerAt);
    expect(fn.split('EXCEPTION WHEN unique_violation').length - 1).toBe(1);
  });

  it('撞的不是 creation_request_id 時照樣拋出，不假裝成 replay', () => {
    const handler = fn.slice(fn.indexOf('EXCEPTION WHEN unique_violation'));
    expect(handler).toContain('IF v_replay IS NULL THEN');
    expect(handler).toContain('RAISE;');
  });

  it('競態不回 PERSISTENCE_FAILED', () => {
    const handler = fn.slice(
      fn.indexOf('EXCEPTION WHEN unique_violation'),
      fn.indexOf('INSERT INTO child_tasks'),
    );
    expect(handler).not.toContain('PERSISTENCE_FAILED');
  });
});

// ---------------------------------------------------------------------------
// replay 的授權
// ---------------------------------------------------------------------------

describe('preset_task_replay_payload', () => {
  const fn = MIGRATION.slice(
    MIGRATION.indexOf('CREATE OR REPLACE FUNCTION public.preset_task_replay_payload'),
    MIGRATION.indexOf('CREATE OR REPLACE FUNCTION public.create_parent_task_v1'),
  );

  it('family 不符回 42501', () => {
    expect(fn).toContain('belongs to another family');
    expect(fn).toMatch(/another family[\s\S]{0,200}ERRCODE = '42501'/);
  });

  it('child 不符也回 42501', () => {
    expect(fn).toContain('belongs to another child');
    expect(fn).toMatch(/another child[\s\S]{0,200}ERRCODE = '42501'/);
  });

  it('錯誤訊息不洩漏那筆任務的內容', () => {
    // 只提到 request id，沒有任務名稱、家庭名稱或 task id。
    expect(fn).not.toMatch(/RAISE EXCEPTION[^;]*v_task/);
  });

  it('不對外授權 —— 它自己不驗呼叫者身分', () => {
    expect(MIGRATION).toContain(
      'REVOKE ALL ON FUNCTION public.preset_task_replay_payload(uuid, uuid, uuid) FROM authenticated',
    );
    expect(MIGRATION).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.preset_task_replay_payload/,
    );
  });

  it('沒建立過時回 NULL，讓呼叫端照常往下走', () => {
    expect(fn).toContain('IF v_task IS NULL THEN');
    expect(fn).toContain('RETURN NULL;');
  });

  it('replay 不寫任何一筆稽核事件', () => {
    expect(fn).not.toContain('INSERT INTO task_change_events');
    expect(fn).not.toMatch(/INSERT INTO/);
  });
});
