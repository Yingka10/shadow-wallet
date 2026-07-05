-- P1-6 / AUDIT 2-5: add caller authorization to the three SECURITY DEFINER RPCs.
--
-- Problem: complete_task, redeem_wish, and setup_child_tasks run as SECURITY
-- DEFINER (they bypass RLS) but never checked *who* is calling. Any logged-in
-- user could complete tasks / redeem / seed tasks for a child in *another*
-- family. This migration prepends a family-ownership guard to each; the
-- transactional bodies are otherwise byte-for-byte identical to their prior
-- definitions ("只需加授權檢查,邏輯別動").
--
-- Auth model (verified 2026-07): there is one Supabase auth account per family
-- — the parent's (parents.user_id = auth.uid()). Children have no auth account;
-- the child device runs under the parent's session. So the correct check is
-- "does the target child/family belong to auth.uid()'s parent row", NOT "is the
-- caller a specific child".
--
-- Caller classes (distinguished by JWT role, since anon and service_role both
-- have a NULL auth.uid()):
--   * service_role  → trusted backend (Edge Functions, cron). Bypasses; it is
--                     responsible for its own authorization.
--   * authenticated → a parent. Must own the target child/family.
--   * anon / none   → rejected (auth.uid() is NULL → ownership check fails).

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

-- ── redeem_wish ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION redeem_wish(
  p_child_id  uuid,
  p_item_id   uuid,
  p_cost      int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
BEGIN
  -- Authorization (P1-6): see complete_task above.
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

  -- Idempotency: bail if item was already redeemed (handles double-tap retry)
  IF EXISTS (
    SELECT 1 FROM reward_items WHERE id = p_item_id AND is_redeemed = true
  ) THEN
    RETURN jsonb_build_object('error', 'already_redeemed');
  END IF;

  -- Conditional deduct — atomicity comes from the database.
  -- If balance < p_cost, no rows match; v_wallet_id stays NULL.
  UPDATE wallets
  SET    balance = balance - p_cost
  WHERE  child_id    = p_child_id
    AND  wallet_type = 'spending'
    AND  balance     >= p_cost
  RETURNING id INTO v_wallet_id;

  IF v_wallet_id IS NULL THEN
    RETURN jsonb_build_object('error', 'insufficient_balance');
  END IF;

  INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
  VALUES (v_wallet_id, p_cost, 'redeem', p_item_id, 'reward_item');

  UPDATE reward_items
  SET  is_redeemed = true,
       redeemed_at = now(),
       is_active   = false
  WHERE id = p_item_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── setup_child_tasks ─────────────────────────────────────────────────────
-- NOTE: this function previously existed only in the live DB (AUDIT P1-7).
-- This is its first definition in repo; the body matches the live source as of
-- 2026-07, with the authorization guard prepended. Task #8 will bring the
-- remaining live-only objects (helpers, core tables) into migrations.
CREATE OR REPLACE FUNCTION setup_child_tasks(
  p_family_id     uuid,
  p_child_id      uuid,
  p_template_ids  uuid[],
  p_custom_tasks  jsonb DEFAULT '[]'::jsonb,
  p_reward_name   text  DEFAULT ''::text,
  p_coin_cost     integer DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id UUID;
  v_tmpl    system_task_templates%ROWTYPE;
  v_custom  JSONB;
BEGIN
  -- Authorization (P1-6): caller must be a parent of the target family, and the
  -- target child must belong to that family. service_role bypasses.
  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM parents
      WHERE user_id = auth.uid() AND family_id = p_family_id
    ) THEN
      RAISE EXCEPTION 'Not authorized: caller is not a parent of family %', p_family_id
        USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM children WHERE id = p_child_id AND family_id = p_family_id
    ) THEN
      RAISE EXCEPTION 'Not authorized: child % is not in family %', p_child_id, p_family_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 1. 複製模板任務
  FOR v_tmpl IN
    SELECT * FROM system_task_templates WHERE id = ANY(p_template_ids)
  LOOP
    INSERT INTO tasks (family_id, name, category, day_type,
                       base_time_min, difficulty, time_saving_min, is_system_default)
    VALUES (p_family_id, v_tmpl.name, v_tmpl.category, 'both',
            v_tmpl.base_time_min, v_tmpl.difficulty, v_tmpl.time_saving_min, false)
    RETURNING id INTO v_task_id;

    INSERT INTO child_tasks (child_id, task_id)
    VALUES (p_child_id, v_task_id);
  END LOOP;

  -- 2. 插入自訂任務
  FOR v_custom IN SELECT * FROM jsonb_array_elements(p_custom_tasks)
  LOOP
    INSERT INTO tasks (family_id, name, category, day_type,
                       base_time_min, difficulty, time_saving_min, is_system_default)
    VALUES (
      p_family_id,
      v_custom->>'name',
      v_custom->>'category',
      'both',
      (v_custom->>'base_time_min')::INT,
      (v_custom->>'difficulty')::NUMERIC,
      (v_custom->>'time_saving_min')::INT,
      false
    )
    RETURNING id INTO v_task_id;

    INSERT INTO child_tasks (child_id, task_id)
    VALUES (p_child_id, v_task_id);
  END LOOP;

  -- 3. 寫入兌換目標
  INSERT INTO reward_items
    (family_id, child_id, name, reward_type, coin_cost, added_by, parent_approved)
  VALUES
    (p_family_id, p_child_id, p_reward_name, 'item', p_coin_cost, 'parent', true);
END;
$$;
