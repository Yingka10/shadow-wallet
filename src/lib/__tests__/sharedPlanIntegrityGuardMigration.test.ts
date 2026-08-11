import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260816000000_shared_plan_integrity_guard.sql',
);

function sql(): string {
  return readFileSync(MIGRATION, 'utf8').replace(/\r\n/g, '\n');
}

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`FUNCTION public.${name}`);
  const end = source.indexOf('\n$$;', start) + 4;
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('P0-8G shared plan integrity guard migration', () => {
  it('defines active Shared Plan truth from an active Proposal task link', () => {
    const source = sql();
    const helper = functionBody(source, 'is_active_shared_plan_task_v1');

    expect(helper).toContain('FROM child_proposals cp');
    expect(helper).toContain('cp.task_id = p_task_id');
    expect(helper).toContain("cp.status = 'active'");
    expect(helper).not.toContain('creation_source');
    expect(helper).toContain('SECURITY INVOKER');
    expect(source).toContain('REVOKE ALL ON FUNCTION public.is_active_shared_plan_task_v1(uuid) FROM PUBLIC, anon');
    expect(source).toContain('GRANT EXECUTE ON FUNCTION public.is_active_shared_plan_task_v1(uuid) TO authenticated');
  });

  it('guards exact task commitment fields without blanket-freezing all updates', () => {
    const source = sql();
    const guard = functionBody(source, 'guard_active_shared_plan_task_v1');

    for (const column of [
      'name',
      'category',
      'day_type',
      'recurrence_days',
      'schedule_mode',
      'weekly_frequency',
      'claim_period',
      'max_claims_per_period',
      'preferred_time',
      'preferred_time_custom',
      'completion_description',
      'difficulty',
      'reward_policy',
      'reward_coin_amount',
    ]) {
      expect(guard).toMatch(new RegExp(`NEW\\.${column}\\s+IS DISTINCT FROM OLD\\.${column}`));
    }

    expect(guard).toContain('OLD.is_active = true AND NEW.is_active = false');
    expect(guard).toContain("TG_OP = 'DELETE'");
    expect(guard).toContain('SHARED_PLAN_REQUIRES_RENEGOTIATION');
    expect(guard).not.toContain('NEW.current_day');
  });

  it('blocks only goal lifecycle changes and preserves completion progress updates', () => {
    const source = sql();
    const guard = functionBody(source, 'guard_active_shared_plan_goal_v1');

    expect(guard).toContain("TG_OP = 'DELETE'");
    expect(guard).toContain('NEW.status IS DISTINCT FROM OLD.status');
    expect(guard).not.toContain('NEW.current_day');
    expect(guard).not.toContain('NEW.current_level');
    expect(guard).toContain('SHARED_PLAN_REQUIRES_RENEGOTIATION');
  });

  it('blocks assignment deactivation/delete without blocking active runtime updates', () => {
    const source = sql();

    expect(source).toContain('CREATE POLICY child_tasks_shared_plan_update_guard');
    expect(source).toMatch(/WITH CHECK \([\s\S]*is_active = true[\s\S]*NOT public\.is_active_shared_plan_task_v1\(task_id\)/);
    expect(source).toContain('CREATE POLICY child_tasks_shared_plan_delete_guard');
    expect(source).toContain('NOT public.is_active_shared_plan_task_v1(task_id)');
  });

  it.each([
    'update_task_schedule',
    'update_task_recurrence_days',
  ])('returns a typed zero-write refusal from %s', name => {
    const source = sql();
    const rpc = functionBody(source, name);
    const refusal = rpc.indexOf("'SHARED_PLAN_REQUIRES_RENEGOTIATION'");
    const taskWrite = rpc.indexOf('UPDATE tasks');
    const eventWrite = rpc.indexOf('INSERT INTO intervention_log');

    expect(refusal).toBeGreaterThan(-1);
    expect(refusal).toBeLessThan(taskWrite);
    expect(refusal).toBeLessThan(eventWrite);
  });

  it('does not absorb P0-5B, completion, or wallet domains', () => {
    const source = sql();

    expect(source).not.toContain('child_proposal_plan_version_guard');
    expect(source).not.toContain('complete_task');
    expect(source).not.toMatch(/\b(wallets|transactions|task_completions)\b/);
    expect(source).not.toContain('create_child_proposal_adjustment_request_v1');
    expect(source).not.toContain('INSERT INTO child_proposal_plan_versions');
  });
});
