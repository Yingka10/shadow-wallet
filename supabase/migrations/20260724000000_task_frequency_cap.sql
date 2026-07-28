-- P0 (coin-policy §3.4 / 修改.txt 第 7 點): enforce a per-task claim frequency
-- cap so a child cannot farm unlimited coins off the same task.
--
-- Problem: complete_task's duplicate guard only fired when allow_repeat was
-- false (blocking a 2nd same-day claim). Tasks created with allow_repeat=true
-- (e.g. ParentHomeTablet's 臨時任務 panel) had *no* cap at all — a child could
-- call complete_task on the same task any number of times per day for
-- unlimited coins. coin-policy.json already models this via
-- payoutBasis/claimPeriod/maxClaimsPerPeriod, but no DB column carried it and
-- the RPC never checked it.
--
-- Fix: add claim_period + max_claims_per_period to tasks, and replace the
-- boolean "already completed today" check with a period-bounded COUNT. The
-- error string returned on rejection is left as 'already_completed' (its
-- pre-existing value) so no calling code needs to change.

ALTER TABLE tasks
  ADD COLUMN claim_period text NOT NULL DEFAULT 'day'
    CHECK (claim_period IN ('day', 'week')),
  ADD COLUMN max_claims_per_period integer NOT NULL DEFAULT 1
    CHECK (max_claims_per_period > 0);

COMMENT ON COLUMN tasks.claim_period IS
  'Window a claim frequency cap resets over. Mirrors coin-policy.json frequency.defaultClaimPeriod.';
COMMENT ON COLUMN tasks.max_claims_per_period IS
  'Max times this task may be claimed (completed) per claim_period. Mirrors coin-policy.json frequency.defaultMaxClaimsPerPeriod. P0 guard — see complete_task.';

-- Backfill: allow_repeat=true tasks previously had no cap at all. Give them a
-- finite default (5/day) instead of leaving them unlimited; parents can lower
-- this per-task later once the UI exposes it.
UPDATE tasks SET max_claims_per_period = 5 WHERE allow_repeat = true;

-- ── complete_task ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION complete_task(
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
  v_task          record;
  v_coin_earned   int;
  v_time_saved    int;
  v_wallet_id     uuid;
  v_completion_id uuid;
  v_new_day       int;
  v_rewards       jsonb;
  v_milestone_coin int;
  v_period_start  date;
  v_claim_count   int;
BEGIN
  -- Authorization (P1-6): a user-authenticated caller may only act on children
  -- in their own family. service_role bypasses; anon / cross-family rejected.
  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM children c
      WHERE c.id = p_child_id
        AND c.family_id = (SELECT family_id FROM parents WHERE user_id = auth.uid() LIMIT 1)
    ) THEN
      RAISE EXCEPTION 'Not authorized: child % is not in the caller''s family', p_child_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Read task
  SELECT category, base_time_min, difficulty, coin_override,
         time_saving_min, long_term_type, day_type, allow_repeat,
         claim_period, max_claims_per_period
  INTO v_task
  FROM tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  -- Coin calculation (mirrors calcCoin in taskActions.ts)
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

  -- Frequency guard (P0) — caps claims per task within claim_period, using
  -- Asia/Taipei calendar boundaries. Supersedes the old allow_repeat boolean
  -- check (allow_repeat=false tasks still get exactly 1/day via the column
  -- default). Error string kept as 'already_completed' for caller compat.
  v_period_start := CASE
    WHEN v_task.claim_period = 'week'
      THEN date_trunc('week', (p_completed_at AT TIME ZONE 'Asia/Taipei'))::date
    ELSE (p_completed_at AT TIME ZONE 'Asia/Taipei')::date
  END;

  SELECT count(*) INTO v_claim_count
  FROM task_completions
  WHERE child_id = p_child_id
    AND task_id  = p_task_id
    AND status   = 'completed'
    AND (
      CASE
        WHEN v_task.claim_period = 'week'
          THEN date_trunc('week', (completed_at AT TIME ZONE 'Asia/Taipei'))::date
        ELSE (completed_at AT TIME ZONE 'Asia/Taipei')::date
      END
    ) = v_period_start;

  IF v_claim_count >= COALESCE(v_task.max_claims_per_period, 1) THEN
    RETURN jsonb_build_object('error', 'already_completed');
  END IF;

  -- 1. Insert task_completion (part of the transaction — rolls back with everything else)
  INSERT INTO task_completions
    (task_id, child_id, completed_at, reported_by, status, coin_earned, time_saved_min)
  VALUES
    (p_task_id, p_child_id, p_completed_at, 'child', 'completed', v_coin_earned, v_time_saved)
  RETURNING id INTO v_completion_id;

  -- 2. Task-C/D: award completion coins
  IF v_coin_earned > 0 THEN
    UPDATE wallets
    SET    balance = balance + v_coin_earned
    WHERE  child_id    = p_child_id
      AND  wallet_type = 'spending'
    RETURNING id INTO v_wallet_id;

    IF v_wallet_id IS NULL THEN
      RAISE EXCEPTION 'Spending wallet not found for child %', p_child_id;
    END IF;

    INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
    VALUES (v_wallet_id, v_coin_earned, 'earn', v_completion_id, 'task_completion');
  END IF;

  -- 3. Task-B: record time savings
  IF v_task.category = 'B' AND v_time_saved > 0 THEN
    INSERT INTO time_savings (child_id, completion_id, minutes_saved)
    VALUES (p_child_id, v_completion_id, v_time_saved);
  END IF;

  -- 4. once task: deactivate from child's list
  IF v_task.day_type = 'once' THEN
    UPDATE child_tasks
    SET    is_active = false
    WHERE  task_id = p_task_id AND child_id = p_child_id;
  END IF;

  -- 5. Task-D habit: advance current_day, check for milestone reward
  v_milestone_coin := NULL;
  IF v_task.category = 'D'
    AND v_task.long_term_type = 'habit'
    AND p_goal_id IS NOT NULL
  THEN
    UPDATE long_term_goals
    SET    current_day = current_day + 1
    WHERE  id = p_goal_id
    RETURNING current_day, checkpoint_rewards INTO v_new_day, v_rewards;

    IF v_rewards IS NOT NULL THEN
      v_milestone_coin := (v_rewards->>(v_new_day::text))::int;
    END IF;

    IF v_milestone_coin IS NOT NULL THEN
      -- Reuse wallet already fetched in step 2 if available
      IF v_wallet_id IS NULL THEN
        SELECT id INTO v_wallet_id
        FROM wallets
        WHERE child_id = p_child_id AND wallet_type = 'spending';
      END IF;

      IF v_wallet_id IS NOT NULL THEN
        UPDATE wallets SET balance = balance + v_milestone_coin WHERE id = v_wallet_id;
        INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
        VALUES (v_wallet_id, v_milestone_coin, 'earn', p_goal_id, 'long_term_goal_milestone');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'completionId',  v_completion_id,
    'coinEarned',    v_coin_earned,
    'timeSavedMin',  v_time_saved,
    'milestone',     CASE
                       WHEN v_milestone_coin IS NOT NULL THEN jsonb_build_object(
                         'goalId',     p_goal_id,
                         'day',        v_new_day,
                         'coinReward', v_milestone_coin
                       )
                       ELSE NULL
                     END
  );
END;
$$;
