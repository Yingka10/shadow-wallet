import { readFileSync } from 'fs';
import { join } from 'path';

const SQL = readFileSync(join(
  process.cwd(), 'supabase', 'migrations', '20260813000000_child_proposal_direct_confirm.sql',
), 'utf8').replace(/\r\n/g, '\n');

function body(name: string): string {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = SQL.indexOf('\n$$;', start) + 4;
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return SQL.slice(start, end);
}

describe('P0-5A child proposal direct confirm migration', () => {
  it('新增 migration 而不改寫 P0-3，並保存 adoption lineage', () => {
    expect(SQL).toContain('adopted_from_plan_version_id uuid');
    expect(SQL).toContain('REFERENCES child_proposal_plan_versions(id)');
    expect(SQL).toContain("authored_by = 'parent'");
    expect(SQL).toContain('child_proposal_adoption_lineage_guard');
  });

  it('creation_source / audit event 正式接受 child_proposal，且仍是 non-preset', () => {
    expect(SQL).toContain("creation_source IN ('preset', 'parent_custom', 'child_proposal', 'legacy')");
    expect(SQL).toContain("creation_source IN ('parent_custom', 'child_proposal')");
    expect(SQL).toContain("'created_from_child_proposal'");
    expect(SQL).toContain("creation_source = 'child_proposal'");
    expect(SQL).toContain('preset_family_id IS NULL AND preset_variant_id IS NULL');
  });

  it('保留既有 create_parent_task_v1 名稱並以 core 重用 canonical inserts', () => {
    expect(SQL).toContain('ALTER FUNCTION public.create_parent_task_v1(jsonb)');
    expect(SQL).toContain('RENAME TO create_parent_task_core_v1');
    const wrapper = body('create_parent_task_v1');
    expect(wrapper).toContain('public.create_parent_task_core_v1');
    expect(wrapper).toContain("p_command ->> 'progressModel'");
    expect(wrapper).toMatch(/long_term_type\s*=\s*CASE[\s\S]*weekly_rhythm[\s\S]*THEN 'habit'/);
    expect(wrapper).toContain("goal_type = 'habit'");
    expect(wrapper).not.toContain('INSERT INTO wallets');
    expect(wrapper).not.toContain('INSERT INTO transactions');
    expect(wrapper).not.toContain('INSERT INTO task_completions');
  });

  it('orchestration 鎖 proposal、檢查 stale，並只從 locked rows 組 canonical command', () => {
    const confirm = body('confirm_child_proposal_v1');
    expect(confirm).toContain('FOR UPDATE');
    expect(confirm).toContain("'STALE_PLAN_VERSION'");
    expect(confirm).toContain("v_plan.authored_by <> 'ai'");
    expect(confirm).toContain("timezone('Asia/Taipei', now())::date");
    expect(confirm).toContain("WHEN v_plan.duration_days IS NOT NULL");
    expect(confirm).toContain("THEN v_start_date + (v_plan.duration_days - 1)");
    expect(confirm).toMatch(/v_plan\.duration_type = 'long_term'[\s\S]*v_plan\.duration_days IS NULL/);
    expect(confirm).toContain("'clientRequestId', v_proposal.id");
    expect(confirm).toContain("'creationSource', 'child_proposal'");
    expect(confirm).toContain("'recurrenceDays', to_jsonb(v_plan.cadence_days)");
    expect(confirm).toContain("'weeklyFrequency', v_plan.cadence_weekly_frequency");
    expect(confirm).not.toContain("ai_snapshot ->>");
  });

  it('AI version 不被蓋章；另建 parent version且不複製 ai_request_id', () => {
    const confirm = body('confirm_child_proposal_v1');
    expect(confirm).toContain('INSERT INTO child_proposal_plan_versions');
    expect(confirm).toContain("'parent', auth.uid()");
    expect(confirm).toContain('v_expected_plan_id');
    expect(confirm).toContain('NULL, v_plan.ai_suggested_coin_amount');
    expect(confirm).not.toMatch(/UPDATE child_proposal_plan_versions[\s\S]*parent_confirmed_at/);
  });

  it('inner false 轉 exception，activation failure 會回滾 task 與 adoption', () => {
    const confirm = body('confirm_child_proposal_v1');
    expect(confirm).toContain('BEGIN');
    expect(confirm).toContain("RAISE EXCEPTION USING ERRCODE = 'P0001'");
    expect(confirm).toContain('GET STACKED DIAGNOSTICS');
    expect(confirm).toContain('public.create_parent_task_v1');
    expect(confirm).toContain('public.transition_child_proposal_v1');
    expect(confirm).toContain("v_verified.status <> 'active'");
  });

  it('proposal_id 是 idempotency key，active lineage replay 回同一 task', () => {
    const confirm = body('confirm_child_proposal_v1');
    expect(confirm).toContain("v_proposal.status = 'active'");
    expect(confirm).toContain('adopted_from_plan_version_id = v_expected_plan_id');
    expect(confirm).toContain("'idempotentReplay', true");
    expect(SQL).toContain('UNIQUE (adopted_from_plan_version_id)');
  });

  it('reward 必須等於目前顯示的 plan suggestion；confirm 零 wallet side effect', () => {
    const confirm = body('confirm_child_proposal_v1');
    expect(confirm).toContain("'POLICY_CHANGED'");
    expect(confirm).toContain('v_plan.ai_suggested_coin_amount');
    expect(confirm).not.toMatch(/\b(INSERT|UPDATE|DELETE)\s+(INTO\s+|FROM\s+)?(wallets|transactions|task_completions)\b/i);
  });

  it('RPC 權限固定且 core 不暴露給 authenticated', () => {
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.create_parent_task_core_v1(jsonb) FROM authenticated');
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.confirm_child_proposal_v1(jsonb) FROM PUBLIC, anon');
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.confirm_child_proposal_v1(jsonb) TO authenticated');
  });
});
