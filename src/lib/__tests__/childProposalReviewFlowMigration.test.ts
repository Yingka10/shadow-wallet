import { readFileSync } from 'fs';
import { join } from 'path';

const SQL = readFileSync(join(
  process.cwd(), 'supabase', 'migrations', '20260815000000_child_proposal_review_flow.sql',
), 'utf8').replace(/\r\n/g, '\n');

function body(name: string): string {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = SQL.indexOf('\n$$;', start) + 4;
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return SQL.slice(start, end);
}

describe('P0-5B child proposal review-flow migration', () => {
  it('提供四支窄用途、repeat-safe orchestration RPC', () => {
    for (const name of [
      'revise_child_proposal_plan_v1',
      'accept_child_proposal_plan_v1',
      'request_child_proposal_changes_v1',
      'close_child_proposal_unsuitable_v1',
    ]) {
      expect(SQL).toContain(`CREATE OR REPLACE FUNCTION public.${name}`);
      expect(SQL).toContain(`REVOKE ALL ON FUNCTION public.${name}(jsonb) FROM PUBLIC, anon`);
      expect(SQL).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(jsonb) TO authenticated`);
    }
    expect(SQL).toContain('BEGIN;');
    expect(SQL).toContain('COMMIT;');
    expect(SQL).not.toContain('ALTER FUNCTION public.confirm_child_proposal_v1');
  });

  it('revise 先鎖 proposal、做 exact stale guard，source 可為 AI 或 parent', () => {
    const revise = body('revise_child_proposal_plan_v1');
    expect(revise).toMatch(/FROM child_proposals[\s\S]*FOR UPDATE/);
    expect(revise).toContain('public.assert_child_in_caller_family');
    expect(revise).toContain("v_proposal.status <> 'proposed'");
    expect(revise).toContain('v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id');
    expect(revise).toMatch(/FROM child_proposal_plan_versions[\s\S]*proposal_id = v_proposal\.id/);
    expect(revise).not.toMatch(/v_source\.authored_by\s*<>\s*'ai'/);
  });

  it('DB 是 material diff authority，no-op 在任何 insert/update 前返回', () => {
    const revise = body('revise_child_proposal_plan_v1');
    const noOp = revise.indexOf("'NO_MATERIAL_CHANGE'");
    const insert = revise.indexOf('INSERT INTO child_proposal_plan_versions');
    expect(noOp).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(noOp);
    expect(revise).toContain('IS NOT DISTINCT FROM');
    expect(revise).toContain("v_mode = 'weekly_frequency'");
    expect(revise).toContain('v_weekly_frequency NOT BETWEEN 1 AND 7');
    expect(revise).toContain("v_mode = 'fixed_days'");
    expect(revise).toContain('unnest(v_days)');
  });

  it('parent version 只採 editable patch，readonly/server evidence 從 source 複製', () => {
    const revise = body('revise_child_proposal_plan_v1');
    expect(revise).toContain('v_source.plan_title');
    expect(revise).toContain('v_source.plan_summary');
    expect(revise).toContain('v_source.duration_days');
    expect(revise).toContain('v_source.estimated_minutes');
    expect(revise).toContain('v_source.reward_policy');
    expect(revise).toContain('v_source.ai_suggested_coin_amount');
    expect(revise).toContain('v_expected_plan_id');
    expect(revise).toMatch(/'parent',\s*auth\.uid\(\)/);
    expect(revise).toMatch(/NULL,\s*NULL,[\s\S]*v_source\.ai_snapshot/);
    expect(revise).toContain('TRUE, NULL, v_now, NULL');
  });

  it('cadence mode 改變時由 server 同步推導 canonical progress model，不產生無法接受的版本', () => {
    const revise = body('revise_child_proposal_plan_v1');
    expect(revise).toContain(
      "CASE WHEN v_mode = 'weekly_frequency' THEN 'weekly_rhythm' ELSE NULL END",
    );
    expect(revise).not.toMatch(/v_source\.purpose_category, v_completion_description,\s*v_source\.progress_model/);
  });

  it('lineage 只辨認 exact constraint，其他 unique violation 不會被吞', () => {
    const revise = body('revise_child_proposal_plan_v1');
    expect(revise).toContain('GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME');
    expect(revise).toContain('child_proposal_plan_versions_one_adoption_per_source');
    expect(revise).toContain("'REVISION_ALREADY_EXISTS'");
    expect(revise).toContain('RAISE;');
  });

  it('accept 只建立 canonical rows，再由既有 transition 擁有 activation semantics', () => {
    const accept = body('accept_child_proposal_plan_v1');
    expect(accept).toMatch(/FROM child_proposals[\s\S]*FOR UPDATE/);
    expect(accept).toContain("v_plan.authored_by <> 'parent'");
    expect(accept).toContain('v_plan.requires_child_review IS DISTINCT FROM TRUE');
    expect(accept).toContain("timezone('Asia/Taipei', now())::date");
    expect(accept).toContain('v_start_date + (v_plan.duration_days - 1)');
    expect(accept).toContain('public.create_parent_task_v1');
    expect(accept).toContain('public.transition_child_proposal_v1');
    expect(accept).toContain("'actorRole', 'child'");
    expect(accept).not.toMatch(/SET\s+(effective_at|child_accepted_at|confirmed_reward_policy)/);
  });

  it('accept 比對 fresh application decision 與 version evidence，不另建 pricing engine', () => {
    const accept = body('accept_child_proposal_plan_v1');
    expect(accept).toContain("'POLICY_CHANGED'");
    expect(accept).toContain('v_plan.reward_policy');
    expect(accept).toContain('v_plan.reward_policy_version');
    expect(accept).toContain('v_plan.ai_suggested_coin_amount');
    expect(accept).toContain("v_plan.reward_policy = 'coin_eligible'");
    expect(accept).not.toContain('priceCoin');
    expect(accept).not.toContain('coinPolicy');
  });

  it('accept 對 transition/canonical failure 原子 rollback，active retry 回同一結果', () => {
    const accept = body('accept_child_proposal_plan_v1');
    expect(accept).toContain("v_proposal.status = 'active'");
    expect(accept).toContain('v_plan.confirmed_source_task_id IS DISTINCT FROM v_proposal.task_id');
    expect(accept).toContain('v_plan.child_accepted_at IS NULL');
    expect(accept).toContain("'idempotentReplay', true");
    expect(accept).toContain("RAISE EXCEPTION USING ERRCODE = 'P0001'");
    expect(accept).toContain('GET STACKED DIAGNOSTICS');
    expect(accept).toContain("v_verified.status <> 'active'");
  });

  it('request changes 保留 current version，retry 只接受 latest matching child event', () => {
    const request = body('request_child_proposal_changes_v1');
    expect(request).toContain("v_proposal.status = 'proposed'");
    expect(request).toContain('FROM child_proposal_status_events');
    expect(request).toContain("from_status = 'needs_child_review'");
    expect(request).toContain("to_status = 'proposed'");
    expect(request).toContain("actor_role = 'child'");
    expect(request).toContain('v_latest_event.reason IS NOT DISTINCT FROM v_reason');
    expect(request).toContain('ORDER BY created_at DESC');
    expect(request).toContain("'idempotentReplay', true");
    expect(request).toContain('public.transition_child_proposal_v1');
    expect(request).toContain('v_proposal.task_id IS NOT NULL');
    expect(request).not.toContain('UPDATE child_proposal_plan_versions');
  });

  it('close 要求 explicit nullable expected version 與 nonblank reason', () => {
    const close = body('close_child_proposal_unsuitable_v1');
    expect(close).toContain("p_command ? 'expectedPlanVersionId'");
    expect(close).toContain('current_plan_version_id IS DISTINCT FROM v_expected_plan_id');
    expect(close).toContain("v_proposal.status NOT IN ('proposed', 'needs_child_review')");
    expect(close).toContain("'CLOSE_REQUIRES_REASON'");
    expect(close).toContain("'closed_unsuitable'");
    expect(close).toContain("'idempotentReplay', true");
    expect(close).toContain("EXCEPTION WHEN SQLSTATE 'P0001'");
    expect(close).toContain("'CLOSE_VERIFICATION_FAILED'");
  });

  it('tracked contract 說明 parent decision 不等於 shared effective plan', () => {
    expect(SQL).toContain('COMMENT ON COLUMN child_proposal_plan_versions.parent_confirmed_at');
    expect(SQL).toContain('家長完成自己對這一版的決定');
    expect(SQL).toContain('不代表家庭共同版本已生效');
  });

  it('review flow 零 wallet/completion side effect，也不碰 P0-6 functions', () => {
    expect(SQL).not.toMatch(/\b(INSERT|UPDATE|DELETE)\s+(INTO\s+|FROM\s+)?(wallets|transactions|task_completions)\b/i);
    expect(SQL).not.toContain('complete_task');
    expect(SQL).not.toContain('mark_task_atomic');
    expect(SQL).not.toContain('settle_weekly_interest');
  });
});
