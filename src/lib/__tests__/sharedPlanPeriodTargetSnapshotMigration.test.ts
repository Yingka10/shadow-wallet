import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const TARGET_MIGRATION = join(
  MIGRATIONS,
  '20260820000000_shared_plan_period_target_snapshot.sql',
);
const SNAPSHOT_MIGRATION = join(
  MIGRATIONS,
  '20260819000000_snapshot_canonical_payout_basis.sql',
);
const SETTLEMENT_MIGRATION = join(
  MIGRATIONS,
  '20260818000000_long_term_payout_settlement.sql',
);

function readSql(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

function codeOnly(sql: string): string {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
}

function functionBody(sql: string, signature: string): string {
  const start = sql.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf('$$;', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

const sql = () => codeOnly(readSql(TARGET_MIGRATION));
const trigger = () =>
  functionBody(sql(), 'FUNCTION public.snapshot_canonical_payout_basis_v1(');

describe('per_period 快照必須帶達標次數', () => {
  it('新欄位從 tasks.period_target_count 複製', () => {
    const body = trigger();

    expect(sql()).toContain('ADD COLUMN IF NOT EXISTS confirmed_period_target_count smallint');
    expect(body).toMatch(
      /SELECT t\.payout_basis, t\.period_target_count\s*\n\s*INTO v_basis, v_target/,
    );
    expect(body).toContain('NEW.confirmed_period_target_count := v_target');
  });

  it('per_period 少了達標次數就擋在確認的那一刻', () => {
    const body = trigger();
    const perPeriod = body.indexOf("IF v_basis = 'per_period' THEN");
    expect(perPeriod).toBeGreaterThan(-1);

    const branch = body.slice(perPeriod);
    expect(branch).toContain('SHARED_PLAN_PERIOD_TARGET_MISSING');
    // fail closed：不是塞一個預設值進去。
    expect(branch).not.toMatch(/v_target\s*:=\s*(COALESCE|1|max_claims)/);
  });

  it('非 per_period 的 basis 一律歸零，不留下憑空的數字', () => {
    const body = trigger();
    const elseBranch = body.slice(body.indexOf('ELSE', body.indexOf("IF v_basis = 'per_period'")));
    expect(elseBranch).toContain('NEW.confirmed_period_target_count := NULL');
  });
});

describe('不得用別的欄位代替達標次數', () => {
  it('trigger 完全不讀 claim_period 或 max_claims_per_period', () => {
    // 這兩個是結算視窗與 claim 次數上限，都不是「幾次算達標」。
    // 只要 trigger 讀了它們，這條規則就已經被繞過。
    const body = trigger();
    expect(body).not.toContain('claim_period');
    expect(body).not.toContain('max_claims');
  });

  it('整支 migration 沒有從 claim 相關欄位推導達標次數的寫法', () => {
    const raw = sql();
    expect(raw).not.toMatch(/confirmed_period_target_count\s*:?=\s*[^;\n]*claim/i);
    expect(raw).not.toMatch(/confirmed_period_target_count\s*:?=\s*[^;\n]*max_claims/i);
  });
});

describe('不 backfill', () => {
  it('legacy 任務（payout_basis IS NULL）在填達標次數之前就早退', () => {
    const body = trigger();
    const legacyReturn = body.indexOf('IF v_basis IS NULL THEN');
    const targetWrite = body.indexOf('NEW.confirmed_period_target_count := v_target');

    expect(legacyReturn).toBeGreaterThan(-1);
    expect(legacyReturn).toBeLessThan(targetWrite);
  });

  it('沒有任何 UPDATE 去回填既有版本列', () => {
    expect(sql()).not.toMatch(
      /UPDATE\s+child_proposal_plan_versions[\s\S]{0,300}?SET[\s\S]{0,300}?confirmed_period_target_count/i,
    );
  });

  it('只在快照第一次成立時介入', () => {
    const body = trigger();
    expect(body).toMatch(/IF NEW\.confirmed_at IS NULL THEN\s*\n\s*RETURN NEW;/);
    expect(body).toMatch(
      /IF TG_OP = 'UPDATE' AND OLD\.confirmed_at IS NOT NULL THEN\s*\n\s*RETURN NEW;/,
    );
  });
});

describe('值域約束', () => {
  it('達標次數只屬於 per_period，且範圍與 tasks 一致', () => {
    const raw = sql();
    expect(raw).toMatch(
      /child_proposal_plan_versions_period_target_scope\s*\n\s*CHECK \(\s*\n\s*confirmed_period_target_count IS NULL\s*\n\s*OR confirmed_payout_basis = 'per_period'/,
    );
    expect(raw).toContain('confirmed_period_target_count BETWEEN 1 AND 7');
  });

  it('反方向不寫成 CHECK —— 既有 legacy 列會在無關的 UPDATE 上炸掉', () => {
    // per_period ⇒ 一定要有 target 由 trigger 在寫入當下強制。
    // 寫成 CHECK（含 NOT VALID）的話，P0-8M 每次接受換時段時對舊版本
    // superseded_at 的 UPDATE 都會撞上一列歷史資料。
    const raw = sql();
    expect(raw).not.toMatch(
      /CHECK[\s\S]{0,200}?confirmed_payout_basis = 'per_period'[\s\S]{0,120}?confirmed_period_target_count IS NOT NULL/,
    );
    expect(raw).not.toContain('NOT VALID');
  });
});

describe('write-once', () => {
  it('新欄位有自己的 immutability guard', () => {
    const guard = functionBody(sql(), 'FUNCTION public.guard_confirmed_period_target_v1(');
    expect(guard).toContain('OLD.confirmed_at IS NOT NULL');
    expect(guard).toContain(
      'NEW.confirmed_period_target_count IS DISTINCT FROM OLD.confirmed_period_target_count',
    );
    expect(guard).toContain("USING ERRCODE = '23514'");
  });

  it('不併進 P0-8 那份 confirmed 欄位清單', () => {
    // forward-derive child_proposal_plan_version_guard 會覆蓋別的工作包
    // 對同一份清單的修改 —— 20260818 差點就是這樣打壞 P0-8G。
    const raw = sql();
    expect(raw).not.toContain('FUNCTION public.child_proposal_plan_version_guard');
    expect(raw).toMatch(
      /CREATE TRIGGER child_proposal_plan_versions_period_target_guard\s*\n\s*BEFORE UPDATE ON child_proposal_plan_versions/,
    );
  });
});

describe('已套用的 migration 保持不動', () => {
  it('不改寫任何既有的寫入者函式', () => {
    const raw = sql();
    expect(raw).not.toContain('FUNCTION public.transition_child_proposal_v1');
    expect(raw).not.toContain('FUNCTION public.accept_child_proposal_adjustment_v1');
    expect(raw).not.toContain('FUNCTION public.guard_active_shared_plan_task_v1');
    expect(raw).not.toContain('FUNCTION public.complete_task');
  });

  it('20260818 / 20260819 都沒有被回頭修改', () => {
    const settlement = codeOnly(readSql(SETTLEMENT_MIGRATION));
    expect(settlement).not.toMatch(/confirmed_payout_basis/i);
    expect(settlement).not.toContain('child_proposal_plan_versions');

    const snapshot = codeOnly(readSql(SNAPSHOT_MIGRATION));
    expect(snapshot).not.toContain('confirmed_period_target_count');
    expect(snapshot).not.toContain('period_target_count');
  });
});
