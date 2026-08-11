import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260814000000_reward_guard_hardening.sql',
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

describe('P0-6 reward guard hardening migration', () => {
  it('backfills only active long-term goal/task assignments', () => {
    const sql = codeOnly(readSql());
    const functionStart = sql.indexOf('FUNCTION public.complete_task(');
    const backfill = sql.slice(0, functionStart);

    expect(backfill).toMatch(/INSERT INTO child_tasks[\s\S]*FROM long_term_goals ltg[\s\S]*JOIN tasks t ON t\.id = ltg\.task_id/);
    expect(backfill).toMatch(/ltg\.status = 'active'/);
    expect(backfill).toMatch(/t\.is_active = true/);
    expect(backfill).toMatch(/NOT EXISTS \([\s\S]*FROM child_tasks ct/);
    expect(backfill).toMatch(/ON CONFLICT \(child_id, task_id\) DO NOTHING/);
    expect(backfill).not.toMatch(/DO UPDATE|UPDATE\s+child_tasks/i);
  });

  it('checks task activity and an active child assignment before mutation', () => {
    const sql = codeOnly(readSql());
    const functionStart = sql.indexOf('FUNCTION public.complete_task(');
    const taskActive = sql.indexOf('IF v_task.is_active IS DISTINCT FROM true THEN', functionStart);
    const assignment = sql.indexOf('FROM child_tasks ct', taskActive);
    const firstWrite = sql.indexOf('INSERT INTO task_completions', functionStart);

    expect(taskActive).toBeGreaterThan(0);
    expect(sql).toContain("'task_inactive'");
    expect(assignment).toBeGreaterThan(taskActive);
    expect(sql).toContain("ct.is_active = true");
    expect(sql).toContain("'task_not_assigned'");
    expect(assignment).toBeLessThan(firstWrite);
  });

  it('locks and validates a supplied goal for child, task, and active status before writes', () => {
    const sql = codeOnly(readSql());
    const goalRead = sql.indexOf('FROM long_term_goals ltg');
    const lock = sql.indexOf('FOR UPDATE', goalRead);
    const firstWrite = sql.indexOf('INSERT INTO task_completions');

    expect(goalRead).toBeGreaterThan(0);
    expect(lock).toBeGreaterThan(goalRead);
    expect(lock).toBeLessThan(firstWrite);
    expect(sql).toContain('v_goal.child_id IS DISTINCT FROM p_child_id');
    expect(sql).toContain('v_goal.task_id IS DISTINCT FROM p_task_id');
    expect(sql).toContain("v_goal.status IS DISTINCT FROM 'active'");
    expect(sql).toContain("'invalid_goal'");
    expect(sql).toContain("'goal_inactive'");
  });

  it('permits checkpoint coin only for bounded coin-eligible non-flexible tasks', () => {
    const sql = codeOnly(readSql());

    expect(sql).toContain("v_task.reward_policy = 'coin_eligible'");
    expect(sql).toContain("v_task.schedule_mode IS DISTINCT FROM 'weekly_frequency'");
    expect(sql).toContain('v_milestone_coin > 0');
    expect(sql).toContain('v_milestone_coin BETWEEN v_task.reward_coin_min AND v_task.reward_coin_max');
  });

  it('maps only the daily completion constraint collision to already_completed', () => {
    const sql = codeOnly(readSql());

    expect(sql).toContain('GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME');
    expect(sql).toContain("IF v_constraint_name = 'idx_unique_task_per_day' THEN");
    expect(sql).toContain("RETURN jsonb_build_object('error', 'already_completed')");
    expect(sql).toMatch(/IF v_constraint_name = 'idx_unique_task_per_day' THEN[\s\S]*ELSE[\s\S]*RAISE;[\s\S]*END IF/);
  });

  it('restates least-privilege execute ACLs', () => {
    const sql = codeOnly(readSql());

    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.settle_weekly_interest() FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.settle_weekly_interest() TO service_role');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.complete_task(uuid, uuid, timestamptz, boolean, uuid) FROM PUBLIC, anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.complete_task(uuid, uuid, timestamptz, boolean, uuid) TO authenticated, service_role');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.mark_task_atomic(uuid, uuid, text, int, text) FROM PUBLIC, anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.mark_task_atomic(uuid, uuid, text, int, text) TO authenticated, service_role');
  });

  it('keeps the latest-master completion and reward mechanics while adding guards', () => {
    const sql = codeOnly(readSql());

    for (const latestMasterBehavior of [
      'v_legacy := (v_task.reward_policy IS NULL)',
      'ROUND(v_task.base_time_min::numeric * v_task.difficulty::numeric)',
      "v_task.reward_policy = 'time_saving_eligible'",
      'v_coin_earned := COALESCE(v_task.reward_coin_amount, 0)',
      "IF v_task.claim_period = 'once' THEN",
      "wallet_type = 'spending'",
      "'task_completion'",
      'SET current_day = current_day + 1',
    ]) {
      expect({ latestMasterBehavior, preserved: sql.includes(latestMasterBehavior) })
        .toEqual({ latestMasterBehavior, preserved: true });
    }
  });

  it('places every rejection guard before spendable side effects', () => {
    const sql = codeOnly(readSql());
    const functionStart = sql.indexOf('FUNCTION public.complete_task(');
    const functionSql = sql.slice(functionStart);
    const completionWrite = functionSql.indexOf('INSERT INTO task_completions');

    for (const guard of [
      "ERRCODE = '42501'",
      "'task_inactive'",
      "'invalid_goal'",
      "'goal_inactive'",
      "'task_not_assigned'",
    ]) {
      expect({ guard, beforeWrite: functionSql.indexOf(guard) < completionWrite })
        .toEqual({ guard, beforeWrite: true });
    }

    expect(functionSql.indexOf('UPDATE wallets')).toBeGreaterThan(completionWrite);
    expect(functionSql.indexOf('INSERT INTO transactions')).toBeGreaterThan(completionWrite);
    expect(functionSql).not.toMatch(/DELETE\s+FROM/i);
  });

  it('does not expose a client-controlled reward amount', () => {
    const sql = codeOnly(readSql());
    const signature = sql.slice(
      sql.indexOf('FUNCTION public.complete_task('),
      sql.indexOf(') RETURNS jsonb', sql.indexOf('FUNCTION public.complete_task(')),
    );

    expect(signature).not.toMatch(/coin|reward/i);
  });
});
