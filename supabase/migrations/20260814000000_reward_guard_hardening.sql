-- P0-6: harden the canonical completion/reward path.
--
-- IMPORTANT: the function body below is forward-derived from the latest
-- complete_task definition on master (20260804000000), with only the P0-6
-- authorization, ownership, activity, collision, and checkpoint guards added.

-- Repair only an authoritative legacy relation: an active long-term goal tied
-- to an active task. Existing inactive assignments are intentionally not
-- reactivated, and unrelated task/child pairs are not inferred.
INSERT INTO child_tasks (child_id, task_id, is_active)
SELECT ltg.child_id, ltg.task_id, true
FROM long_term_goals ltg
JOIN tasks t ON t.id = ltg.task_id
WHERE ltg.status = 'active'
  AND t.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM child_tasks ct
    WHERE ct.child_id = ltg.child_id
      AND ct.task_id = ltg.task_id
  )
ON CONFLICT (child_id, task_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.complete_task(
  p_task_id             uuid,
  p_child_id            uuid,
  p_completed_at        timestamptz,
  p_is_prerequisite_met boolean,
  p_goal_id             uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task            record;
  v_goal            record;
  v_child_family    uuid;
  v_coin_earned     int;
  v_time_saved      int;
  v_wallet_id       uuid;
  v_completion_id   uuid;
  v_new_day         int;
  v_rewards         jsonb;
  v_milestone_coin  int;
  v_period_start    date;
  v_claim_count     int;
  v_legacy          boolean;
  v_constraint_name text;
BEGIN
  SELECT c.family_id
  INTO v_child_family
  FROM children c
  WHERE c.id = p_child_id;

  IF v_child_family IS NULL THEN
    RAISE EXCEPTION 'Child not found: %', p_child_id USING ERRCODE = '42501';
  END IF;

  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM parents p
      WHERE p.user_id = auth.uid()
        AND p.family_id = v_child_family
    ) THEN
      RAISE EXCEPTION 'Not authorized: child % is not in the caller''s family', p_child_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT category, base_time_min, difficulty, coin_override,
         time_saving_min, long_term_type, day_type, allow_repeat,
         claim_period, max_claims_per_period, reward_policy,
         reward_coin_amount, reward_coin_min, reward_coin_max,
         family_id, is_active, schedule_mode
  INTO v_task
  FROM tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  IF v_task.family_id IS DISTINCT FROM v_child_family THEN
    RAISE EXCEPTION 'Not authorized: task % does not belong to child %''s family', p_task_id, p_child_id
      USING ERRCODE = '42501';
  END IF;

  IF v_task.is_active IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('error', 'task_inactive');
  END IF;

  -- A supplied goal is security-sensitive input. Lock and validate it before
  -- completion, progress, wallet, or transaction writes.
  IF p_goal_id IS NOT NULL THEN
    SELECT ltg.child_id, ltg.task_id, ltg.status,
           ltg.current_day, ltg.checkpoint_rewards
    INTO v_goal
    FROM long_term_goals ltg
    WHERE ltg.id = p_goal_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'invalid_goal');
    END IF;

    IF v_goal.child_id IS DISTINCT FROM p_child_id
      OR v_goal.task_id IS DISTINCT FROM p_task_id
    THEN
      RETURN jsonb_build_object('error', 'invalid_goal');
    END IF;

    IF v_goal.status IS DISTINCT FROM 'active' THEN
      RETURN jsonb_build_object('error', 'goal_inactive');
    END IF;
  END IF;

  -- Preserve the typed retry result before checking assignment activity. This
  -- matters for one-time tasks because their first successful completion
  -- deactivates child_tasks.
  IF v_task.claim_period = 'once' THEN
    SELECT count(*)
    INTO v_claim_count
    FROM task_completions
    WHERE child_id = p_child_id
      AND task_id = p_task_id
      AND status = 'completed';
  ELSE
    v_period_start := CASE
      WHEN v_task.claim_period = 'week'
        THEN date_trunc('week', (p_completed_at AT TIME ZONE 'Asia/Taipei'))::date
      ELSE (p_completed_at AT TIME ZONE 'Asia/Taipei')::date
    END;

    SELECT count(*)
    INTO v_claim_count
    FROM task_completions
    WHERE child_id = p_child_id
      AND task_id = p_task_id
      AND status = 'completed'
      AND (
        CASE
          WHEN v_task.claim_period = 'week'
            THEN date_trunc('week', (completed_at AT TIME ZONE 'Asia/Taipei'))::date
          ELSE (completed_at AT TIME ZONE 'Asia/Taipei')::date
        END
      ) = v_period_start;
  END IF;

  IF v_claim_count >= COALESCE(v_task.max_claims_per_period, 1) THEN
    RETURN jsonb_build_object('error', 'already_completed');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM child_tasks ct
    WHERE ct.child_id = p_child_id
      AND ct.task_id = p_task_id
      AND ct.is_active = true
  ) THEN
    RETURN jsonb_build_object('error', 'task_not_assigned');
  END IF;

  -- Reward calculation is unchanged from the latest master function, but now
  -- runs only after the task/child assignment has been authorized.
  v_legacy := (v_task.reward_policy IS NULL);

  IF NOT v_legacy AND v_task.reward_policy = 'time_saving_eligible' THEN
    RETURN jsonb_build_object('error', 'time_saving_not_enabled');
  END IF;

  IF v_legacy THEN
    IF v_task.category IN ('A', 'B') THEN
      v_coin_earned := 0;
    ELSE
      v_coin_earned := ROUND(
        COALESCE(
          v_task.coin_override,
          ROUND(v_task.base_time_min::numeric * v_task.difficulty::numeric)
        )::numeric
        * CASE WHEN p_is_prerequisite_met THEN 1.0 ELSE 0.7 END
      );
    END IF;

    v_time_saved := CASE
      WHEN v_task.category = 'B' THEN COALESCE(v_task.time_saving_min, 0)
      ELSE 0
    END;
  ELSE
    IF v_task.reward_policy = 'coin_eligible' THEN
      v_coin_earned := COALESCE(v_task.reward_coin_amount, 0);

      IF v_coin_earned <= 0 THEN
        RETURN jsonb_build_object('error', 'coin_amount_not_configured');
      END IF;
    ELSE
      v_coin_earned := 0;
    END IF;

    v_time_saved := 0;
  END IF;

  BEGIN
    INSERT INTO task_completions
      (task_id, child_id, completed_at, reported_by, status, coin_earned, time_saved_min)
    VALUES
      (p_task_id, p_child_id, p_completed_at, 'child', 'completed', v_coin_earned, v_time_saved)
    RETURNING id INTO v_completion_id;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name = 'idx_unique_task_per_day' THEN
        RETURN jsonb_build_object('error', 'already_completed');
      ELSE
        RAISE;
      END IF;
  END;

  IF v_coin_earned > 0 THEN
    UPDATE wallets
    SET balance = balance + v_coin_earned
    WHERE child_id = p_child_id
      AND wallet_type = 'spending'
    RETURNING id INTO v_wallet_id;

    IF v_wallet_id IS NULL THEN
      RAISE EXCEPTION 'Spending wallet not found for child %', p_child_id;
    END IF;

    INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
    VALUES (v_wallet_id, v_coin_earned, 'earn', v_completion_id, 'task_completion');
  END IF;

  IF v_task.category = 'B' AND v_time_saved > 0 THEN
    INSERT INTO time_savings (child_id, completion_id, minutes_saved)
    VALUES (p_child_id, v_completion_id, v_time_saved);
  END IF;

  IF v_task.day_type = 'once' THEN
    UPDATE child_tasks
    SET is_active = false
    WHERE task_id = p_task_id
      AND child_id = p_child_id;
  END IF;

  v_milestone_coin := NULL;
  IF v_task.category = 'D'
    AND v_task.long_term_type = 'habit'
    AND p_goal_id IS NOT NULL
  THEN
    UPDATE long_term_goals
    SET current_day = current_day + 1
    WHERE id = p_goal_id
    RETURNING current_day, checkpoint_rewards
    INTO v_new_day, v_rewards;

    IF v_rewards IS NOT NULL THEN
      v_milestone_coin := (v_rewards->>(v_new_day::text))::int;
    END IF;

    -- A checkpoint is an additional mint. It is not inferred for legacy,
    -- record-only, progress-only, or flexible weekly-rhythm tasks.
    IF v_milestone_coin IS NOT NULL
      AND v_task.reward_policy = 'coin_eligible'
      AND v_task.schedule_mode IS DISTINCT FROM 'weekly_frequency'
      AND v_milestone_coin > 0
      AND v_task.reward_coin_min IS NOT NULL
      AND v_task.reward_coin_max IS NOT NULL
      AND v_milestone_coin BETWEEN v_task.reward_coin_min AND v_task.reward_coin_max
    THEN
      IF v_wallet_id IS NULL THEN
        SELECT id
        INTO v_wallet_id
        FROM wallets
        WHERE child_id = p_child_id
          AND wallet_type = 'spending';
      END IF;

      IF v_wallet_id IS NOT NULL THEN
        UPDATE wallets
        SET balance = balance + v_milestone_coin
        WHERE id = v_wallet_id;

        INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
        VALUES (v_wallet_id, v_milestone_coin, 'earn', p_goal_id, 'long_term_goal_milestone');
      END IF;
    ELSE
      v_milestone_coin := NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'completionId', v_completion_id,
    'coinEarned', v_coin_earned,
    'timeSavedMin', v_time_saved,
    'milestone', CASE
      WHEN v_milestone_coin IS NOT NULL THEN jsonb_build_object(
        'goalId', p_goal_id,
        'day', v_new_day,
        'coinReward', v_milestone_coin
      )
      ELSE NULL
    END
  );
END;
$$;

COMMENT ON FUNCTION public.complete_task(uuid, uuid, timestamptz, boolean, uuid) IS
  'Atomically completes an actively assigned task. Caller family, task/goal ownership, activity, duplicate collision, and checkpoint reward policy are server-enforced.';

REVOKE EXECUTE ON FUNCTION public.settle_weekly_interest() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_weekly_interest() TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_task(uuid, uuid, timestamptz, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_task(uuid, uuid, timestamptz, boolean, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.mark_task_atomic(uuid, uuid, text, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_task_atomic(uuid, uuid, text, int, text) TO authenticated, service_role;
