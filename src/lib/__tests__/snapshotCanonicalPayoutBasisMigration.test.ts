import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

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

const sql = () => codeOnly(readSql(SNAPSHOT_MIGRATION));
const trigger = () =>
  functionBody(sql(), 'FUNCTION public.snapshot_canonical_payout_basis_v1(');

describe('canonical truth：快照的 payout basis 來自 tasks.payout_basis', () => {
  it('新制任務由 tasks.payout_basis 覆寫呼叫端寫進來的值', () => {
    const body = trigger();

    expect(body).toMatch(
      /SELECT t\.payout_basis INTO v_basis\s*\n\s*FROM tasks t\s*\n\s*WHERE t\.id = NEW\.confirmed_source_task_id/,
    );
    expect(body).toContain('NEW.confirmed_payout_basis := v_basis');
  });

  it('legacy 任務（payout_basis IS NULL）維持 claim_period 推導，不被改寫', () => {
    const body = trigger();
    const nullBranch = body.indexOf('IF v_basis IS NULL THEN');
    const overwrite = body.indexOf('NEW.confirmed_payout_basis := v_basis');

    expect(nullBranch).toBeGreaterThan(-1);
    // 早退必須在覆寫之前，否則 legacy 任務會被寫進一個 NULL。
    expect(nullBranch).toBeLessThan(overwrite);
    expect(body.slice(nullBranch, overwrite)).toContain('RETURN NEW');
  });

  it('claim_period 不再是新制任務的來源：trigger 完全不讀它', () => {
    // 這是本 migration 的全部重點。trigger 裡只要出現 claim_period，
    // 就代表推導還活著，§9.4 沒有真的收掉。
    expect(trigger()).not.toContain('claim_period');
    expect(trigger()).not.toContain('child_proposal_payout_basis');
  });

  it('不看 payout_basis_effective_from —— 那是 rollout metadata，不是共同約定', () => {
    expect(trigger()).not.toContain('effective_from');
  });
});

describe('不 backfill、不動既有 confirmed 版本', () => {
  it('只在快照第一次成立的那一刻介入', () => {
    const body = trigger();

    // 尚未成立 → 沒有東西要蓋。
    expect(body).toMatch(/IF NEW\.confirmed_at IS NULL THEN\s*\n\s*RETURN NEW;/);
    // 早就成立 → 那是歷史。
    expect(body).toMatch(
      /IF TG_OP = 'UPDATE' AND OLD\.confirmed_at IS NOT NULL THEN\s*\n\s*RETURN NEW;/,
    );
  });

  it('整支 migration 沒有任何一筆改寫既有版本列的 UPDATE', () => {
    expect(sql()).not.toMatch(
      /UPDATE\s+child_proposal_plan_versions[\s\S]{0,400}?SET[\s\S]{0,400}?confirmed_/i,
    );
  });

  it('也沒有改寫既有任務的 UPDATE —— 遷移仍然零列', () => {
    expect(sql()).not.toMatch(/UPDATE\s+tasks\s+SET/i);
  });
});

describe('涵蓋現有兩條寫入路徑，且不改寫它們', () => {
  it('trigger 同時掛在 INSERT 與 UPDATE 上', () => {
    // 20260810 的 transition_child_proposal_v1 是 UPDATE 既有列；
    // 20260817 的 accept_child_proposal_adjustment_v1 是 INSERT 新列。
    // 少掛一邊就會漏掉其中一條路徑。
    expect(sql()).toMatch(
      /CREATE TRIGGER child_proposal_plan_versions_canonical_payout_basis\s*\n\s*BEFORE INSERT OR UPDATE ON child_proposal_plan_versions/,
    );
  });

  it('不 forward-derive 任何既有函式 —— 那正是差點打壞 P0-8G 的做法', () => {
    const raw = sql();
    expect(raw).not.toContain('FUNCTION public.transition_child_proposal_v1');
    expect(raw).not.toContain('FUNCTION public.accept_child_proposal_adjustment_v1');
    expect(raw).not.toContain('FUNCTION public.guard_active_shared_plan_task_v1');
    expect(raw).not.toContain('FUNCTION public.child_proposal_plan_version_guard');
    expect(raw).not.toContain('FUNCTION public.complete_task');
  });

  it('trigger 名稱排在既有 guard 之前，讓 guard 看到的就是最終值', () => {
    expect('child_proposal_plan_versions_canonical_payout_basis' <
      'child_proposal_plan_versions_guard').toBe(true);
  });
});

describe('legacy 推導函式：留著，但降級為相容路徑', () => {
  it('不被 DROP、不被改寫行為，只換合約說明', () => {
    const raw = sql();
    expect(raw).not.toMatch(/DROP FUNCTION[^;]*child_proposal_payout_basis/i);
    expect(raw).not.toContain('CREATE OR REPLACE FUNCTION public.child_proposal_payout_basis');
    expect(raw).toContain('COMMENT ON FUNCTION public.child_proposal_payout_basis(text)');
  });

  it('註解明說它不再服務新制任務', () => {
    const raw = sql();
    expect(raw).toContain('**LEGACY ONLY。**');
    expect(raw).toContain('tasks.payout_basis IS NOT NULL');
  });
});

describe('快照值域', () => {
  it('容得下 tasks.payout_basis 的四個值，並保留 legacy 的 one_time', () => {
    const raw = sql();
    const check = raw.slice(
      raw.indexOf('ADD CONSTRAINT child_proposal_plan_versions_payout_basis_check'),
    );

    for (const basis of [
      'per_completion',
      'per_period',
      'per_milestone',
      'final_completion',
      'one_time',
    ]) {
      expect(check).toContain(`'${basis}'`);
    }
  });
});

describe('20260818 保持不動', () => {
  it('已在 staging 套用並驗證過的那一支不得被本輪修改', () => {
    // 這裡釘住的是 20260818 自己的 contract test 也在檢的那幾個關鍵字串。
    // 若有人為了修 snapshot mismatch 回頭改它，這裡會先紅。
    const settlement = codeOnly(readSql(SETTLEMENT_MIGRATION));

    expect(settlement).not.toMatch(/confirmed_payout_basis/i);
    expect(settlement).not.toContain('child_proposal_plan_versions');
    expect(settlement).toMatch(
      /CREATE TRIGGER tasks_payout_semantics_guard\s*\n\s*BEFORE UPDATE ON tasks/,
    );
  });
});
