-- Atomic task completion.
--
-- Replaces the multi-step JS implementation in taskActions.ts completeTask().
-- Key properties:
--   1. Duplicate guard is INSIDE the transaction: if any later step fails and
--      rolls back, the completion record is also rolled back, so a retry sees
--      a clean state and the guard will not block it (SDT invariant: child
--      always receives their reward if they completed the task).
--   2. Coin award uses "UPDATE ... SET balance = balance + ?" — additions are
--      safe under concurrency; only subtractions need the conditional pattern.
--   3. Milestone coins share the same transaction boundary as the task completion.
--
-- Returns jsonb:
--   { error: 'already_completed' }           — guard fired, no writes
--   { completionId, coinEarned, timeSavedMin, milestone }  — success

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
BEGIN
  -- Read task
  SELECT category, base_time_min, difficulty, coin_override,
         time_saving_min, long_term_type, day_type, allow_repeat
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

  -- Duplicate guard — skipped for allow_repeat tasks.
  -- Uses AT TIME ZONE to compare dates correctly in Asia/Taipei regardless of
  -- the DB server's timezone setting.
  IF NOT COALESCE(v_task.allow_repeat, false) THEN
    IF EXISTS (
      SELECT 1 FROM task_completions
      WHERE child_id  = p_child_id
        AND task_id   = p_task_id
        AND status    = 'completed'
        AND (completed_at AT TIME ZONE 'Asia/Taipei')::date
            = (p_completed_at AT TIME ZONE 'Asia/Taipei')::date
    ) THEN
      RETURN jsonb_build_object('error', 'already_completed');
    END IF;
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
