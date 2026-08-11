-- P0-6 staging verification (transactional; all fixtures are rolled back).
--
-- Run only after explicitly targeting the staging project. Do not rely on the
-- linked project from supabase/config.toml:
--   supabase db ... --project-ref <STAGING_PROJECT_REF>
--
-- This asset requires an administrative SQL session because it creates
-- rollback-only fixtures and sets request.jwt.claims to emulate an
-- authenticated parent. It must never be run against production.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_family_a uuid := gen_random_uuid();
  v_family_b uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_child_a uuid := gen_random_uuid();
  v_sibling_a uuid := gen_random_uuid();
  v_child_b uuid := gen_random_uuid();
  v_wallet_a uuid := gen_random_uuid();
  v_wallet_sibling uuid := gen_random_uuid();
  v_wallet_b uuid := gen_random_uuid();
  v_task_coin uuid := gen_random_uuid();
  v_task_inactive uuid := gen_random_uuid();
  v_task_inactive_assignment uuid := gen_random_uuid();
  v_task_unassigned uuid := gen_random_uuid();
  v_task_record uuid := gen_random_uuid();
  v_task_progress uuid := gen_random_uuid();
  v_task_flexible uuid := gen_random_uuid();
  v_task_fixed uuid := gen_random_uuid();
  v_task_out_of_range uuid := gen_random_uuid();
  v_task_other uuid := gen_random_uuid();
  v_task_family_b uuid := gen_random_uuid();
  v_goal_record uuid := gen_random_uuid();
  v_goal_progress uuid := gen_random_uuid();
  v_goal_flexible uuid := gen_random_uuid();
  v_goal_fixed uuid := gen_random_uuid();
  v_goal_out_of_range uuid := gen_random_uuid();
  v_goal_other_task uuid := gen_random_uuid();
  v_goal_family_b uuid := gen_random_uuid();
  v_result jsonb;
  v_before int;
  v_after int;
  v_count_before int;
  v_count_after int;
  v_day int;
BEGIN
  INSERT INTO families (id, family_name) VALUES
    (v_family_a, 'P0-6 rollback family A'),
    (v_family_b, 'P0-6 rollback family B');

  INSERT INTO parents (family_id, name, user_id)
  VALUES (v_family_a, 'P0-6 parent A', v_user_a);

  INSERT INTO children (id, family_id, nickname, birth_date, age_group) VALUES
    (v_child_a, v_family_a, 'P0-6 child A', '2018-01-01', '6-9'),
    (v_sibling_a, v_family_a, 'P0-6 sibling A', '2018-01-02', '6-9'),
    (v_child_b, v_family_b, 'P0-6 child B', '2018-01-03', '6-9');

  INSERT INTO wallets (id, child_id, wallet_type, balance) VALUES
    (v_wallet_a, v_child_a, 'spending', 0),
    (v_wallet_sibling, v_sibling_a, 'spending', 0),
    (v_wallet_b, v_child_b, 'spending', 0);

  INSERT INTO tasks (
    id, family_id, name, category, day_type, is_active, claim_period,
    max_claims_per_period, reward_policy, reward_coin_amount,
    reward_coin_min, reward_coin_max, reward_policy_version, schedule_mode
  ) VALUES
    (v_task_coin, v_family_a, 'coin success', 'C', 'both', true, 'day', 1,
      'coin_eligible', 5, 1, 10, 'p0-6', 'fixed_days'),
    (v_task_inactive, v_family_a, 'inactive task', 'C', 'both', false, 'day', 1,
      'record_only', NULL, NULL, NULL, NULL, 'fixed_days'),
    (v_task_inactive_assignment, v_family_a, 'inactive assignment', 'C', 'both', true, 'day', 1,
      'record_only', NULL, NULL, NULL, NULL, 'fixed_days'),
    (v_task_unassigned, v_family_a, 'unassigned task', 'C', 'both', true, 'day', 1,
      'record_only', NULL, NULL, NULL, NULL, 'fixed_days'),
    (v_task_record, v_family_a, 'record habit', 'D', 'both', true, 'day', 1,
      'record_only', NULL, NULL, NULL, NULL, 'fixed_days'),
    (v_task_progress, v_family_a, 'progress habit', 'D', 'both', true, 'day', 1,
      'progress_only', NULL, NULL, NULL, NULL, 'fixed_days'),
    (v_task_flexible, v_family_a, 'flexible reading', 'D', 'both', true, 'day', 1,
      'coin_eligible', 5, 1, 10, 'p0-6', 'weekly_frequency'),
    (v_task_fixed, v_family_a, 'fixed habit', 'D', 'both', true, 'day', 1,
      'coin_eligible', 5, 1, 10, 'p0-6', 'fixed_days'),
    (v_task_out_of_range, v_family_a, 'bounded checkpoint', 'D', 'both', true, 'day', 1,
      'coin_eligible', 5, 1, 5, 'p0-6', 'fixed_days'),
    (v_task_other, v_family_a, 'other task', 'D', 'both', true, 'day', 1,
      'record_only', NULL, NULL, NULL, NULL, 'fixed_days'),
    (v_task_family_b, v_family_b, 'family B task', 'D', 'both', true, 'day', 1,
      'record_only', NULL, NULL, NULL, NULL, 'fixed_days');

  UPDATE tasks
  SET long_term_type = 'habit', is_long_term = true
  WHERE id IN (
    v_task_record, v_task_progress, v_task_flexible, v_task_fixed,
    v_task_out_of_range,
    v_task_other, v_task_family_b
  );

  INSERT INTO child_tasks (child_id, task_id, is_active) VALUES
    (v_child_a, v_task_coin, true),
    (v_child_a, v_task_inactive, true),
    (v_child_a, v_task_inactive_assignment, false),
    (v_child_a, v_task_record, true),
    (v_child_a, v_task_progress, true),
    (v_child_a, v_task_flexible, true),
    (v_child_a, v_task_fixed, true),
    (v_child_a, v_task_out_of_range, true),
    (v_child_a, v_task_other, true),
    (v_child_b, v_task_family_b, true);

  INSERT INTO long_term_goals (
    id, child_id, task_id, goal_type, current_day, status, checkpoint_rewards
  ) VALUES
    (v_goal_record, v_child_a, v_task_record, 'habit', 0, 'active', '{"1":5}'),
    (v_goal_progress, v_child_a, v_task_progress, 'habit', 0, 'active', '{"1":5}'),
    (v_goal_flexible, v_child_a, v_task_flexible, 'habit', 0, 'active', '{"1":5}'),
    (v_goal_fixed, v_child_a, v_task_fixed, 'habit', 0, 'active', '{"1":5}'),
    (v_goal_out_of_range, v_child_a, v_task_out_of_range, 'habit', 0, 'active', '{"1":8}'),
    (v_goal_other_task, v_child_a, v_task_other, 'habit', 0, 'active', '{"1":5}'),
    (v_goal_family_b, v_child_b, v_task_family_b, 'habit', 0, 'active', '{"1":5}');

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );

  -- Correct family + active assignment succeeds with canonical task reward.
  v_result := complete_task(v_task_coin, v_child_a, '2026-08-11 09:00+08', true, NULL);
  IF v_result->>'coinEarned' <> '5' THEN
    RAISE EXCEPTION 'P0-6 verify: valid completion did not award canonical 5 coins: %', v_result;
  END IF;

  -- Same-day retry is typed and cannot pay twice.
  SELECT balance INTO v_before FROM wallets WHERE id = v_wallet_a;
  SELECT count(*) INTO v_count_before FROM task_completions WHERE task_id = v_task_coin;
  v_result := complete_task(v_task_coin, v_child_a, '2026-08-11 10:00+08', true, NULL);
  SELECT balance INTO v_after FROM wallets WHERE id = v_wallet_a;
  SELECT count(*) INTO v_count_after FROM task_completions WHERE task_id = v_task_coin;
  IF v_result->>'error' <> 'already_completed'
    OR v_after <> v_before
    OR v_count_after <> v_count_before
  THEN
    RAISE EXCEPTION 'P0-6 verify: same-day retry was not side-effect-free: %', v_result;
  END IF;

  -- Same-family sibling is not implicitly assigned.
  v_result := complete_task(v_task_coin, v_sibling_a, '2026-08-12 09:00+08', true, NULL);
  IF v_result->>'error' <> 'task_not_assigned' THEN
    RAISE EXCEPTION 'P0-6 verify: sibling bypassed assignment: %', v_result;
  END IF;

  -- Inactive task, inactive assignment, and absent assignment are all blocked.
  v_result := complete_task(v_task_inactive, v_child_a, '2026-08-12 09:00+08', true, NULL);
  IF v_result->>'error' <> 'task_inactive' THEN
    RAISE EXCEPTION 'P0-6 verify: inactive task was accepted: %', v_result;
  END IF;

  v_result := complete_task(v_task_inactive_assignment, v_child_a, '2026-08-12 09:00+08', true, NULL);
  IF v_result->>'error' <> 'task_not_assigned' THEN
    RAISE EXCEPTION 'P0-6 verify: inactive assignment was accepted: %', v_result;
  END IF;

  v_result := complete_task(v_task_unassigned, v_child_a, '2026-08-12 09:00+08', true, NULL);
  IF v_result->>'error' <> 'task_not_assigned' THEN
    RAISE EXCEPTION 'P0-6 verify: missing assignment was accepted: %', v_result;
  END IF;

  -- Forged/mismatched goals fail before completion or reward writes.
  SELECT count(*) INTO v_count_before FROM task_completions;
  SELECT balance INTO v_before FROM wallets WHERE id = v_wallet_a;

  v_result := complete_task(v_task_other, v_sibling_a, '2026-08-12 09:00+08', true, v_goal_other_task);
  IF v_result->>'error' <> 'invalid_goal' THEN
    RAISE EXCEPTION 'P0-6 verify: wrong-child goal was accepted: %', v_result;
  END IF;

  v_result := complete_task(v_task_record, v_child_a, '2026-08-12 09:00+08', true, v_goal_other_task);
  IF v_result->>'error' <> 'invalid_goal' THEN
    RAISE EXCEPTION 'P0-6 verify: wrong-task goal was accepted: %', v_result;
  END IF;

  v_result := complete_task(v_task_other, v_child_a, '2026-08-12 09:00+08', true, v_goal_family_b);
  IF v_result->>'error' <> 'invalid_goal' THEN
    RAISE EXCEPTION 'P0-6 verify: cross-family goal was accepted: %', v_result;
  END IF;

  SELECT count(*) INTO v_count_after FROM task_completions;
  SELECT balance INTO v_after FROM wallets WHERE id = v_wallet_a;
  IF v_count_after <> v_count_before OR v_after <> v_before THEN
    RAISE EXCEPTION 'P0-6 verify: a rejected goal changed completion/wallet state';
  END IF;

  -- record_only and progress_only advance valid progress but never checkpoint coin.
  SELECT balance INTO v_before FROM wallets WHERE id = v_wallet_a;
  v_result := complete_task(v_task_record, v_child_a, '2026-08-12 09:00+08', true, v_goal_record);
  SELECT current_day INTO v_day FROM long_term_goals WHERE id = v_goal_record;
  SELECT balance INTO v_after FROM wallets WHERE id = v_wallet_a;
  IF v_day <> 1 OR v_after <> v_before OR v_result->'milestone' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'P0-6 verify: record_only minted checkpoint or lost progress: %', v_result;
  END IF;

  v_result := complete_task(v_task_progress, v_child_a, '2026-08-12 09:00+08', true, v_goal_progress);
  SELECT current_day INTO v_day FROM long_term_goals WHERE id = v_goal_progress;
  SELECT balance INTO v_after FROM wallets WHERE id = v_wallet_a;
  IF v_day <> 1 OR v_after <> v_before OR v_result->'milestone' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'P0-6 verify: progress_only minted checkpoint or lost progress: %', v_result;
  END IF;

  -- weekly_frequency keeps its canonical per-completion coin but adds no milestone coin.
  SELECT balance INTO v_before FROM wallets WHERE id = v_wallet_a;
  v_result := complete_task(v_task_flexible, v_child_a, '2026-08-12 09:00+08', true, v_goal_flexible);
  SELECT balance INTO v_after FROM wallets WHERE id = v_wallet_a;
  IF v_after - v_before <> 5 OR v_result->'milestone' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'P0-6 verify: flexible rhythm checkpoint policy failed: %', v_result;
  END IF;

  -- A bounded fixed-day coin-eligible task preserves the existing checkpoint reward.
  SELECT balance INTO v_before FROM wallets WHERE id = v_wallet_a;
  v_result := complete_task(v_task_fixed, v_child_a, '2026-08-12 09:00+08', true, v_goal_fixed);
  SELECT balance INTO v_after FROM wallets WHERE id = v_wallet_a;
  IF v_after - v_before <> 10 OR v_result->'milestone'->>'coinReward' <> '5' THEN
    RAISE EXCEPTION 'P0-6 verify: valid bounded checkpoint was not preserved: %', v_result;
  END IF;

  -- A checkpoint outside the frozen task range is not minted.
  SELECT balance INTO v_before FROM wallets WHERE id = v_wallet_a;
  v_result := complete_task(
    v_task_out_of_range,
    v_child_a,
    '2026-08-12 09:00+08',
    true,
    v_goal_out_of_range
  );
  SELECT balance INTO v_after FROM wallets WHERE id = v_wallet_a;
  IF v_after - v_before <> 5 OR v_result->'milestone' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'P0-6 verify: out-of-range checkpoint minted coin: %', v_result;
  END IF;

  -- Wrong-family caller is rejected by auth.uid() family membership, with zero writes.
  SELECT count(*) INTO v_count_before FROM task_completions;
  BEGIN
    PERFORM complete_task(v_task_family_b, v_child_b, '2026-08-12 09:00+08', true, v_goal_family_b);
    RAISE EXCEPTION 'P0-6 verify: wrong-family completion unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO v_count_after FROM task_completions;
  IF v_count_after <> v_count_before THEN
    RAISE EXCEPTION 'P0-6 verify: wrong-family guard created a completion';
  END IF;

  -- The RPC signature exposes no client-controlled coin amount.
  IF pg_get_function_arguments(
    'public.complete_task(uuid,uuid,timestamptz,boolean,uuid)'::regprocedure
  ) ILIKE '%coin%'
  THEN
    RAISE EXCEPTION 'P0-6 verify: complete_task exposes a client coin argument';
  END IF;
END;
$$;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.complete_task(uuid,uuid,timestamptz,boolean,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.mark_task_atomic(uuid,uuid,text,integer,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.settle_weekly_interest()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.settle_weekly_interest()', 'EXECUTE')
    OR EXISTS (
      SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(
        COALESCE(p.proacl, acldefault('f', p.proowner))
      ) acl
      WHERE p.oid = 'public.settle_weekly_interest()'::regprocedure
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'P0-6 verify: reward-mutating RPC ACL is too broad';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.complete_task(uuid,uuid,timestamptz,boolean,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.mark_task_atomic(uuid,uuid,text,integer,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.settle_weekly_interest()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'P0-6 verify: required RPC execute privilege is missing';
  END IF;
END;
$$;

ROLLBACK;
\echo 'P0-6 reward guard staging verification PASS (all fixture writes rolled back)'
