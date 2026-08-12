import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260818000000_long_term_payout_settlement.sql',
);

function readSql(): string {
  return readFileSync(MIGRATION, 'utf8').replace(/\r\n/g, '\n');
}

function codeOnly(sql: string): string {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
}

/** 取出某一支函式的 body（到下一個 `$$;` 為止）。 */
function functionBody(sql: string, signature: string): string {
  const start = sql.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf('$$;', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe('payout semantics schema', () => {
  it('把四個 payout basis 放進值域，但 period target 只屬於 per_period', () => {
    const sql = codeOnly(readSql());

    expect(sql).toContain(
      "payout_basis IN\n    ('per_completion', 'per_period', 'per_milestone', 'final_completion')",
    );
    expect(sql).toMatch(/CASE WHEN payout_basis = 'per_period'\s*\n\s*THEN period_target_count IS NOT NULL\s*\n\s*ELSE period_target_count IS NULL/);
  });

  it('有 payout_basis 就一定說得出從哪天開始適用', () => {
    const sql = codeOnly(readSql());
    expect(sql).toContain(
      'CHECK (payout_basis IS NULL OR payout_basis_effective_from IS NOT NULL)',
    );
  });

  it('不 backfill 任何既有任務 —— 遷移零列', () => {
    const sql = codeOnly(readSql());

    // 任何對既有 tasks 設定 payout_basis 的 UPDATE 都是遷移。
    // 既有任務的共同約定畫面說的是「每次完成 N 幣」，不能靜默改約。
    expect(sql).not.toMatch(/UPDATE\s+tasks\s+SET[\s\S]{0,400}?payout_basis\s*=/i);
    expect(sql).not.toMatch(/FROM child_proposal_plan_versions/i);
    expect(sql).not.toMatch(/confirmed_payout_basis/i);
  });
});

describe('reward_settlements：DB 層的 idempotency', () => {
  it('四種 basis 各有自己的 unique invariant', () => {
    const sql = codeOnly(readSql());

    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS reward_settlements_period_unique\s*\n\s*ON reward_settlements \(task_id, child_id, period_start\)\s*\n\s*WHERE reward_basis = 'per_period'/,
    );
    expect(sql).toMatch(
      /reward_settlements_completion_unique\s*\n\s*ON reward_settlements \(completion_id\)\s*\n\s*WHERE reward_basis = 'per_completion'/,
    );
    expect(sql).toMatch(
      /reward_settlements_milestone_unique\s*\n\s*ON reward_settlements \(milestone_id, child_id\)\s*\n\s*WHERE reward_basis = 'per_milestone'/,
    );
    expect(sql).toMatch(
      /reward_settlements_goal_unique\s*\n\s*ON reward_settlements \(goal_id, child_id\)\s*\n\s*WHERE reward_basis = 'final_completion'/,
    );
  });

  it('每一種 basis 都必須帶自己的 event key —— 否則 unique index 攔不住它', () => {
    const sql = codeOnly(readSql());
    expect(sql).toContain('reward_settlements_event_key_check');
    expect(sql).toMatch(/WHEN 'per_period'\s+THEN period_start IS NOT NULL/);
    expect(sql).toMatch(/WHEN 'final_completion' THEN goal_id\s+IS NOT NULL/);
  });

  it('settlement 必須指得出來源事件與那筆金流', () => {
    const sql = codeOnly(readSql());
    expect(sql).toMatch(/completion_id\s+uuid\s+NOT NULL REFERENCES task_completions\(id\)/);
    expect(sql).toMatch(/transaction_id\s+uuid\s+NOT NULL REFERENCES transactions\(id\) ON DELETE RESTRICT/);
    expect(sql).toContain('CONSTRAINT reward_settlements_amount_check CHECK (coin_amount > 0)');
  });

  it('沒有任何 INSERT / UPDATE / DELETE policy：只有結算函式能寫', () => {
    const sql = codeOnly(readSql());
    const policies = sql.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
    const settlementPolicies = policies.filter(p => p.includes('reward_settlements'));

    expect(settlementPolicies.length).toBe(1);
    expect(settlementPolicies[0]).toContain('FOR SELECT');
    expect(sql).not.toMatch(/ON reward_settlements FOR (INSERT|UPDATE|DELETE|ALL)/);
    expect(sql).toContain('GRANT SELECT ON reward_settlements TO authenticated');
  });
});

describe('resolve_payout_basis_v1', () => {
  const body = () => functionBody(codeOnly(readSql()), 'FUNCTION public.resolve_payout_basis_v1(');

  it('legacy 寫入路徑（沒有 duration_type）留 NULL，不被拉進新制', () => {
    expect(body()).toMatch(/IF p_duration_type IS NULL THEN\s*\n\s*RETURN jsonb_build_object\('basis', NULL/);
  });

  it('新 long-term 不得默認 per_completion：推不出週目標就擋下建立', () => {
    const sql = body();

    // per_completion 只出現在 one_time / recurring 那一支。
    const perCompletionBranch = sql.indexOf("IN ('one_time', 'recurring')");
    const longTermBranch = sql.indexOf("IF p_duration_type = 'long_term'");
    expect(perCompletionBranch).toBeGreaterThan(-1);
    expect(longTermBranch).toBeGreaterThan(perCompletionBranch);
    expect(sql.slice(longTermBranch)).not.toContain('per_completion');
    expect(sql.slice(longTermBranch)).toContain('PAYOUT_BASIS_NOT_IMPLEMENTED');
  });

  it('週目標來自 cadence，且限制在 1–7', () => {
    expect(body()).toMatch(/WHEN p_schedule_mode = 'weekly_frequency' THEN p_weekly_frequency/);
    expect(body()).toMatch(/WHEN p_schedule_mode = 'fixed_days'\s+THEN array_length\(p_recurrence_days, 1\)/);
    expect(body()).toContain('v_target BETWEEN 1 AND 7');
  });
});

describe('未實作的 payout basis', () => {
  it('建立路徑回 typed error，不落到任何預設值', () => {
    const sql = codeOnly(readSql());
    const wrapper = functionBody(sql, 'FUNCTION public.create_parent_task_v1(');

    expect(wrapper).toContain("SQLERRM = 'PAYOUT_BASIS_NOT_IMPLEMENTED'");
    expect(wrapper).toContain("'code', 'PAYOUT_BASIS_NOT_IMPLEMENTED'");
    // 其他例外必須原樣拋出，否則 shared plan 的守門訊息會被吃掉。
    expect(wrapper).toMatch(/RAISE;\s*\nEND;/);
  });

  it('complete_task 遇到時 fail closed：記 progress、不 mint、不擋打卡', () => {
    const sql = codeOnly(readSql());
    const body = functionBody(sql, 'FUNCTION public.complete_task(');

    const unsupported = body.indexOf('v_unsupported := true');
    expect(unsupported).toBeGreaterThan(-1);

    // fail closed 的那一支不會把 v_should_settle 打開。
    const branch = body.slice(body.indexOf("IF v_task.payout_basis = 'per_completion'"), unsupported);
    expect(branch).toContain("ELSIF v_task.payout_basis = 'per_period'");
    expect(body).toContain("'payoutBasisUnsupported', v_unsupported");
  });
});

describe('complete_task：progress 與 settlement 分離', () => {
  const body = () => functionBody(codeOnly(readSql()), 'FUNCTION public.complete_task(');

  it('新語意下 completion 先記 0，達標才回填金額', () => {
    const sql = body();
    expect(sql).toMatch(/IF v_new_semantics THEN\s*\n\s*v_settle_amount := v_coin_earned;\s*\n\s*v_coin_earned\s+:= 0;/);
    expect(sql).toMatch(/UPDATE task_completions\s*\n\s*SET coin_earned = v_settle_amount/);
  });

  it('per_period 要達到約定次數才結算', () => {
    const sql = body();
    expect(sql).toMatch(/v_should_settle := v_task\.period_target_count IS NOT NULL\s*\n\s*AND v_period_done >= v_task\.period_target_count/);
  });

  it('錢包、transaction、settlement 在同一個 subtransaction，撞 unique 就整組回滾', () => {
    const sql = body();
    const settleBlock = sql.slice(sql.indexOf('IF v_should_settle THEN'));

    const wallet = settleBlock.indexOf('UPDATE wallets');
    const tx = settleBlock.indexOf('INSERT INTO transactions');
    const settlement = settleBlock.indexOf('INSERT INTO reward_settlements');
    const handler = settleBlock.indexOf('WHEN unique_violation THEN');

    expect(wallet).toBeGreaterThan(-1);
    expect(tx).toBeGreaterThan(wallet);
    expect(settlement).toBeGreaterThan(tx);
    expect(handler).toBeGreaterThan(settlement);

    // 撞到就是「已結算過」，不是錯誤：completion 保留，金額歸零。
    expect(settleBlock).toMatch(/WHEN unique_violation THEN\s*\n\s*v_coin_earned := 0;\s*\n\s*v_settled\s+:= false;/);
  });

  it('period 以 Asia/Taipei 週一為界，與 claim window 用同一個表達式', () => {
    const sql = body();
    expect(sql).toContain(
      "v_settle_period := date_trunc('week', (p_completed_at AT TIME ZONE 'Asia/Taipei'))::date",
    );
  });

  it('生效邊界：本期 period_start 小於 effective_from 時走 legacy', () => {
    const sql = body();
    expect(sql).toMatch(/WHEN v_task\.payout_basis = 'per_period'\s*\n\s*THEN v_settle_period >= v_task\.payout_basis_effective_from/);
  });

  it('legacy 路徑逐字不變：reward_policy IS NULL 仍走 category + coin_override + 0.7', () => {
    const sql = body();
    expect(sql).toContain('v_legacy := (v_task.reward_policy IS NULL)');
    expect(sql).toMatch(/COALESCE\(\s*\n?\s*v_task\.coin_override,/);
    expect(sql).toContain('CASE WHEN p_is_prerequisite_met THEN 1.0 ELSE 0.7 END');
  });

  it('新語意任務不再走 legacy checkpoint 發幣', () => {
    const sql = body();
    expect(sql).toMatch(/IF NOT v_new_semantics\s*\n\s*AND v_task\.category = 'D'/);
  });

  it('新語意任務仍然推進 current_day —— 那是投入紀錄，不是幣', () => {
    const sql = body();
    const elsif = sql.indexOf('ELSIF v_new_semantics');
    expect(elsif).toBeGreaterThan(-1);
    const branch = sql.slice(elsif, sql.indexOf('RETURN jsonb_build_object', elsif));
    expect(branch).toContain('SET current_day = current_day + 1');
    expect(branch).not.toContain('UPDATE wallets');
  });
});

describe('家長端不再有發幣後門', () => {
  const body = () =>
    functionBody(codeOnly(readSql()), 'FUNCTION public.parent_complete_task_for_child_v1(');

  it('新語意任務忽略家長輸入的金額，轉呼叫 complete_task', () => {
    const sql = body();
    const branch = sql.slice(
      sql.indexOf('IF v_task.payout_basis IS NOT NULL THEN'),
      sql.indexOf('v_amount := GREATEST'),
    );

    expect(branch).toContain('public.complete_task(');
    expect(branch).not.toContain('p_coin_amount');
    expect(branch).toContain("'coinInputIgnored', true");
  });

  it('新語意分支不自己動錢包', () => {
    const sql = body();
    const branch = sql.slice(
      sql.indexOf('IF v_task.payout_basis IS NOT NULL THEN'),
      sql.indexOf('v_amount := GREATEST'),
    );
    expect(branch).not.toContain('UPDATE wallets');
    expect(branch).not.toContain('INSERT INTO transactions');
  });

  it('呼叫端必須是同一個家庭的家長', () => {
    const sql = body();
    expect(sql).toContain('FROM parents p');
    expect(sql).toContain("USING ERRCODE = '42501'");
  });
});

describe('shared plan：哪些欄位算共同約定', () => {
  const guard = () => functionBody(codeOnly(readSql()), 'FUNCTION public.guard_payout_semantics_v1(');

  it('不去改寫 guard_active_shared_plan_task_v1 —— 那份清單屬於 P0-8 系列', () => {
    // 「forward-derive 一份再加自己的兩欄」會把當時還沒 merge 的版本默默改回去。
    // staging 上已經套了 20260817（它把 preferred_time 移出 material 清單），
    // 衍生法會當場打壞 P0-8M 的換時段流程。
    const sql = codeOnly(readSql());
    expect(sql).not.toContain('FUNCTION public.guard_active_shared_plan_task_v1');
    expect(sql).not.toContain('preferred_time');
  });

  it('payout_basis 與 period_target_count 是 material change', () => {
    const sql = guard();
    expect(sql).toContain('NEW.payout_basis        IS DISTINCT FROM OLD.payout_basis');
    expect(sql).toContain('NEW.period_target_count IS DISTINCT FROM OLD.period_target_count');
    expect(sql).toContain('SHARED_PLAN_REQUIRES_RENEGOTIATION');
  });

  it('effective_from 不進 material diff —— 它是 rollout metadata，不是家庭約定', () => {
    const sql = guard();
    const materialStart = sql.indexOf('IF NEW.payout_basis        IS DISTINCT FROM');
    expect(materialStart).toBeGreaterThan(-1);
    expect(sql.slice(materialStart)).not.toContain('payout_basis_effective_from');
  });

  it('但 effective_from 一旦寫下就不可改：它是不會 double-pay 那份證明的前提', () => {
    const sql = guard();
    const immutability = sql.indexOf('PAYOUT_ROLLOUT_IMMUTABLE');
    const earlyReturn = sql.indexOf('IF NOT public.is_active_shared_plan_task_v1');

    expect(immutability).toBeGreaterThan(-1);
    // 不可變性與「是不是 active shared plan」無關，所以必須在早退之前。
    expect(immutability).toBeLessThan(earlyReturn);
  });

  it('只掛 BEFORE UPDATE：DELETE 的守門仍屬原本那支 trigger', () => {
    const sql = codeOnly(readSql());
    expect(sql).toMatch(/CREATE TRIGGER tasks_payout_semantics_guard\s*\n\s*BEFORE UPDATE ON tasks/);
  });
});
