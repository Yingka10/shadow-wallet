// P1-REWARD-FIX — 每週節奏的共同計畫，完成一次就結算一次
//
// ─────────────────────────────────────────────────────────────────────────────
// 這一組守五件事：
//
//   1. **四個維度不互推。** weekly_frequency 不再變成 payout_basis，
//      也不再變成 max_claims_per_period。
//   2. **P1 一律明講 payout basis**，值來自共同版本的 policy evidence，
//      不從 cadence 猜、不從 ai_snapshot 讀。
//   3. **寫完要讀回來驗。** 少了這一段，任務安靜地退回 per_period 時，
//      唯一看得出來的地方是幾週後的錢包。
//   4. **legacy 沒有被為了修 P1 而破壞。** resolve_payout_basis_v1
//      行為一字未改，只是語意降級成非 canonical。
//   5. **沒有隱形的週上限。** per_completion 的完成上限是「同一天一次」。
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations');

function read(name: string): string {
  return readFileSync(join(MIGRATIONS, name), 'utf8').replace(/\r\n/g, '\n');
}

const SQL = read('20260831000000_weekly_rhythm_per_completion.sql');
const CODE = SQL.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

function body(source: string, name: string): string {
  const start = source.indexOf(`FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('$$;', start));
}

const WRAPPER = body(CODE, 'create_parent_task_v1');
const WRAPPER_FLAT = WRAPPER.replace(/\s+/g, ' ');
const A4A = body(CODE, 'confirm_child_planning_proposal_v1');
const A4B2 = body(CODE, 'accept_child_planning_terms_v1');

// ---------------------------------------------------------------------------

describe('1. 呼叫端明講的結算語意', () => {
  it('wrapper 讀 payoutBasis，而且只認 per_completion', () => {
    expect(WRAPPER).toContain("p_command ->> 'payoutBasis'");
    expect(WRAPPER_FLAT).toContain(
      "IF v_payout_basis IS NOT NULL AND v_payout_basis <> 'per_completion' THEN",
    );
    expect(WRAPPER).toContain('PAYOUT_BASIS_NOT_IMPLEMENTED');
  });

  it('兩支 P1 activation 都把 policy evidence 明講進命令', () => {
    for (const fn of [A4A, A4B2]) {
      expect(fn.replace(/\s+/g, ' ')).toContain(
        "'payoutBasis', COALESCE(v_payout, 'per_completion')",
      );
    }
  });

  it('P1 不從 ai_snapshot 讀結算語意', () => {
    for (const fn of [A4A, A4B2]) {
      const command = fn.slice(fn.indexOf("'payoutBasis'") - 400, fn.indexOf("'payoutBasis'"));
      expect(command).not.toContain('ai_snapshot');
    }
  });
});

describe('2. 四個維度不互推', () => {
  it('明講 per_completion 時，完成上限是「同一天一次」，不是「一週 N 次」', () => {
    expect(WRAPPER_FLAT).toContain(
      "claim_period = CASE WHEN v_payout_basis = 'per_completion' THEN 'day' ELSE claim_period END",
    );
    expect(WRAPPER_FLAT).toContain(
      "max_claims_per_period = CASE WHEN v_payout_basis = 'per_completion'"
      + ' THEN 1 ELSE max_claims_per_period END',
    );
  });

  it('per_completion 不留週目標 —— 那是 per_period 才有的東西', () => {
    expect(WRAPPER_FLAT).toContain(
      "period_target_count = CASE WHEN v_payout_basis = 'per_completion'"
      + ' THEN NULL ELSE period_target_count END',
    );
  });

  it('沒有任何一處把 weekly_frequency 直接寫成 payout / claim 設定', () => {
    for (const forbidden of [
      /payout_basis\s*=\s*'per_period'/,
      /max_claims_per_period\s*(:?=)\s*v_weekly/,
      /period_target_count\s*(:?=)\s*v_weekly/,
    ]) {
      expect(CODE).not.toMatch(forbidden);
    }
  });
});

describe('3. 寫完要讀回來驗', () => {
  it('從 tasks 讀回 payout_basis 與 period_target_count 再比對', () => {
    expect(WRAPPER_FLAT).toContain('SELECT t.payout_basis, t.period_target_count');
    expect(WRAPPER_FLAT).toContain(
      'IF v_written_basis IS DISTINCT FROM v_payout_basis OR v_written_target IS NOT NULL THEN',
    );
    expect(WRAPPER).toContain("RAISE EXCEPTION 'PAYOUT_BASIS_NOT_PERSISTED'");
  });

  it('驗不過就不建立任務，而且回得出是哪一種失敗', () => {
    expect(WRAPPER_FLAT).toContain("IF SQLERRM = 'PAYOUT_BASIS_NOT_PERSISTED' THEN");
    expect(WRAPPER).toContain("'code', 'PERSISTENCE_FAILED'");
  });
});

describe('4. legacy 沒有被破壞', () => {
  it('這支 migration 一個字都沒改 resolve_payout_basis_v1 的行為', () => {
    // 只有 COMMENT，沒有 CREATE OR REPLACE。
    expect(CODE).toContain('COMMENT ON FUNCTION public.resolve_payout_basis_v1');
    expect(CODE).not.toContain(
      'CREATE OR REPLACE FUNCTION public.resolve_payout_basis_v1',
    );
  });

  it('也沒有動 complete_task 與 trigger', () => {
    for (const untouched of [
      'CREATE OR REPLACE FUNCTION public.complete_task',
      'CREATE OR REPLACE FUNCTION public.tasks_resolve_payout_basis_v1',
      'CREATE OR REPLACE FUNCTION public.snapshot_canonical_payout_basis_v1',
    ]) {
      expect(CODE).not.toContain(untouched);
    }
  });

  it('沒帶 payoutBasis 的呼叫端維持既有行為（COALESCE 保留原值）', () => {
    expect(WRAPPER_FLAT).toContain('payout_basis = COALESCE(v_payout_basis, payout_basis)');
  });

  it('不 backfill 既有列', () => {
    // function body 裡的 UPDATE 是那一筆任務的正常流程（設 confirmed_*、
    // 換 current version…）。backfill 長得不一樣：它是 migration 本身跑的
    // 一句 DML。所以檢查的是**函式以外**有沒有 DML。
    const outsideFunctions = CODE
      .split(/CREATE OR REPLACE FUNCTION[\s\S]*?\n\$\$;/g)
      .join('\n');
    expect(outsideFunctions).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/i);
  });
});

describe('5. 這一輪只碰該碰的東西', () => {
  it('只重寫三支 function', () => {
    const defined = [...CODE.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)]
      .map((match) => match[1])
      .sort();
    expect(defined).toEqual([
      'accept_child_planning_terms_v1',
      'confirm_child_planning_proposal_v1',
      'create_parent_task_v1',
    ]);
  });

  it('沒有 schema 變更', () => {
    expect(CODE).not.toMatch(/ALTER TABLE/);
    expect(CODE).not.toMatch(/CREATE TABLE/);
  });
});
