-- P1-2: atomic parent override + intervention_log write.
--
-- Replaces the 5-step JS sequence in taskActions.ts parentMarkTask()
-- (resolve parent → find/create completion → insert override → wallet
-- adjust → update completion), which had two problems:
--   1. [correctness] Wallet adjustment was a client-side read-then-write
--      (SELECT balance, then UPDATE balance = balance - diff) — a race
--      condition under concurrent calls, unlike complete_task/redeem_wish's
--      "UPDATE ... SET balance = balance ± x" pattern.
--   2. [AUDIT 3-3 #14 / 5-9 #5] intervention_log never got a row. The design
--      intent (documented in 20260530000000_create_intervention_log.sql,
--      event_type 'parent_override_*') was for every parent override to also
--      write an intervention_log row in the same transaction as the override
--      — parentMarkTask never did this, so the table stayed at 0 rows.
--
-- Also fixes the same day-boundary bug class as P0-5 while porting this logic
-- into SQL: the JS version compared completed_at to a 'YYYY-MM-DD' string
-- (misreads as UTC midnight); this RPC uses the same
-- `(completed_at AT TIME ZONE 'Asia/Taipei')::date` comparison fn_complete_task
-- already uses, so it isn't reintroduced here.
--
-- All other behavior (coin_deducted math, credit_flag always false, status
-- only flips to 'flagged' for override_type='none') is preserved exactly —
-- this is an atomicity + logging fix, not a redesign.

CREATE OR REPLACE FUNCTION mark_task_atomic(
  p_task_id       uuid,
  p_child_id      uuid,
  p_override_type text,          -- 'partial' | 'none' | 'renegotiate'
  p_adjusted_coin int,
  p_note          text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id      uuid;
  v_family_id      uuid;
  v_task_name      text;
  v_task_category  text;
  v_completion_id  uuid;
  v_original_coin  int;
  v_override_id    uuid;
  v_coin_deducted  int;
  v_coin_diff      int;
  v_wallet_id      uuid;
  v_balance_before int;
  v_event_type     text;
BEGIN
  IF p_override_type NOT IN ('partial', 'none', 'renegotiate') THEN
    RAISE EXCEPTION 'Invalid override_type: %', p_override_type;
  END IF;

  -- Authorization (P1-6 pattern): service_role bypasses; authenticated caller
  -- must own the child's family.
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

  SELECT id INTO v_parent_id FROM parents WHERE user_id = auth.uid() LIMIT 1;
  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION 'Parent not found for caller';
  END IF;

  SELECT family_id, name, category INTO v_family_id, v_task_name, v_task_category
  FROM tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  -- Find today's completion (Asia/Taipei calendar day — mirrors fn_complete_task.sql).
  SELECT id, coin_earned INTO v_completion_id, v_original_coin
  FROM task_completions
  WHERE task_id  = p_task_id
    AND child_id = p_child_id
    AND (completed_at AT TIME ZONE 'Asia/Taipei')::date = (now() AT TIME ZONE 'Asia/Taipei')::date
  LIMIT 1;

  IF v_completion_id IS NULL THEN
    -- No child self-report yet — create a parent-initiated completion.
    INSERT INTO task_completions
      (task_id, child_id, completed_at, reported_at, reported_by, status, coin_earned, time_saved_min)
    VALUES (
      p_task_id, p_child_id, now(), now(), 'parent',
      CASE WHEN p_override_type = 'none' THEN 'flagged' ELSE 'completed' END,
      0, 0
    )
    RETURNING id, coin_earned INTO v_completion_id, v_original_coin;
  END IF;

  v_coin_deducted := GREATEST(v_original_coin - p_adjusted_coin, 0);

  INSERT INTO overrides (completion_id, parent_id, override_type, coin_deducted, credit_flag, reason)
  VALUES (v_completion_id, v_parent_id, p_override_type, v_coin_deducted, false, p_note)
  RETURNING id INTO v_override_id;

  -- Wallet adjustment — skipped (no wallet touch, no transaction row) when
  -- the coin value is unchanged, matching prior JS behavior exactly.
  SELECT id, balance INTO v_wallet_id, v_balance_before
  FROM wallets WHERE child_id = p_child_id AND wallet_type = 'spending';

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Spending wallet not found for child %', p_child_id;
  END IF;

  v_coin_diff := v_original_coin - p_adjusted_coin;  -- positive = deduct, negative = add
  IF v_coin_diff <> 0 THEN
    -- No floor at zero here (unlike redeem_wish) — this is an administrative
    -- correction, not a purchase, and the prior JS code allowed the balance
    -- to go negative the same way.
    UPDATE wallets SET balance = balance - v_coin_diff WHERE id = v_wallet_id;

    INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
    VALUES (
      v_wallet_id, abs(v_coin_diff),
      CASE WHEN v_coin_diff > 0 THEN 'deduct' ELSE 'adjust' END,
      v_override_id, 'override'
    );
  END IF;

  UPDATE task_completions
  SET coin_earned = p_adjusted_coin,
      override_id = v_override_id,
      status = CASE WHEN p_override_type = 'none' THEN 'flagged' ELSE status END
  WHERE id = v_completion_id;

  v_event_type := CASE p_override_type
    WHEN 'partial'     THEN 'parent_override_partial'
    WHEN 'none'        THEN 'parent_override_none'
    WHEN 'renegotiate' THEN 'parent_override_renegotiate'
  END;

  INSERT INTO intervention_log
    (family_id, child_id, parent_id, task_id, task_name_snapshot, override_id,
     event_type, trigger_source, parent_decision, context_snapshot)
  VALUES (
    v_family_id, p_child_id, v_parent_id, p_task_id, v_task_name, v_override_id,
    v_event_type, 'parent_manual',
    jsonb_build_object('override_type', p_override_type, 'coin_deducted', v_coin_deducted, 'credit_flag', false, 'reason', p_note),
    jsonb_build_object('coin_earned_original', v_original_coin, 'wallet_balance_before', v_balance_before, 'task_category', v_task_category)
  );

  RETURN jsonb_build_object('completionId', v_completion_id, 'overrideId', v_override_id, 'coinEarned', p_adjusted_coin);
END;
$$;
