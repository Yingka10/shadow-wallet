-- P1-1 (backend) / AUDIT 2-6, 5-9 #4: redemption review pipeline.
-- See SPEC_P1-1_redemption-review-backend.md for the full mini-spec.
--
-- This migration:
--   1. Brings the live-only `redemption_requests` table + RLS + index into repo
--      (AUDIT P1-7 reproducibility debt) — table/policies already exist live;
--      statements below are idempotent captures of the current live definition.
--   2. Adds `review_redemption_request` RPC: the missing piece that makes
--      "approve" actually move money. The prior client-side approveRequest()
--      only flipped `status` — no wallet deduction, no transaction record, no
--      intervention_log. This RPC does all three atomically, and gives
--      `adjusted_coins` its first real semantics: actual charge = adjusted_coins
--      if the parent supplied one, else the original coin_cost.
--
-- Does NOT touch the 6 pre-existing demo rows in live `redemption_requests`
-- (AUDIT 5-9 #4) — cleanup is a separate, explicit decision (see spec).

-- ── 1. Table (idempotent capture of live schema) ───────────────────────────
CREATE TABLE IF NOT EXISTS redemption_requests (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id          uuid        NOT NULL REFERENCES families(id),
  child_id           uuid        NOT NULL REFERENCES children(id),
  name               text        NOT NULL,
  description        text,
  coin_cost          integer     NOT NULL,
  status             text        NOT NULL DEFAULT 'pending',
  ai_verdict         text,
  ai_reason          text,
  ai_suggested_coins integer,
  adjusted_coins     integer,
  parent_note        text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  reviewed_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_redemption_requests_family_status_time
  ON redemption_requests (family_id, status, created_at DESC);

ALTER TABLE redemption_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "children can insert their own requests" ON redemption_requests;
CREATE POLICY "children can insert their own requests"
  ON redemption_requests
  FOR INSERT
  WITH CHECK (family_id = my_family_id());

DROP POLICY IF EXISTS "family members can view redemption requests" ON redemption_requests;
CREATE POLICY "family members can view redemption requests"
  ON redemption_requests
  FOR SELECT
  USING (family_id = my_family_id());

DROP POLICY IF EXISTS "parents can update redemption requests" ON redemption_requests;
CREATE POLICY "parents can update redemption requests"
  ON redemption_requests
  FOR UPDATE
  USING (family_id = my_family_id());

GRANT SELECT, INSERT, UPDATE ON redemption_requests TO authenticated;

-- ── 2. review_redemption_request RPC ───────────────────────────────────────
CREATE OR REPLACE FUNCTION review_redemption_request(
  p_request_id     uuid,
  p_decision       text,          -- 'approve' | 'reject'
  p_adjusted_coins int  DEFAULT NULL,
  p_parent_note    text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req            record;
  v_final_cost     int;
  v_wallet_id      uuid;
  v_balance_before int;
BEGIN
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  SELECT * INTO v_req FROM redemption_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Redemption request not found: %', p_request_id;
  END IF;

  -- Authorization (P1-6 pattern): service_role bypasses; authenticated callers
  -- must own the request's family.
  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF v_req.family_id <> (SELECT family_id FROM parents WHERE user_id = auth.uid() LIMIT 1) THEN
      RAISE EXCEPTION 'Not authorized: request % is not in the caller''s family', p_request_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Idempotency: a request already reviewed cannot be reviewed again.
  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('error', 'already_reviewed');
  END IF;

  IF p_decision = 'reject' THEN
    UPDATE redemption_requests
    SET    status      = 'rejected',
           parent_note = p_parent_note,
           reviewed_at = now()
    WHERE  id = p_request_id;

    INSERT INTO intervention_log
      (family_id, child_id, event_type, trigger_source, ai_suggested, parent_decision)
    VALUES (
      v_req.family_id, v_req.child_id, 'redemption_reviewed', 'parent_manual',
      jsonb_build_object('verdict', v_req.ai_verdict, 'reason', v_req.ai_reason, 'suggestedCoins', v_req.ai_suggested_coins),
      jsonb_build_object('status', 'rejected', 'note', p_parent_note)
    );

    RETURN jsonb_build_object('ok', true, 'status', 'rejected');
  END IF;

  -- p_decision = 'approve'
  -- adjusted_coins semantics: an explicit parent-adjusted price wins; otherwise
  -- the child's original ask stands.
  v_final_cost := coalesce(p_adjusted_coins, v_req.coin_cost);

  SELECT balance INTO v_balance_before
  FROM wallets
  WHERE child_id = v_req.child_id AND wallet_type = 'spending';

  -- Conditional deduct — same race-safe pattern as redeem_wish.
  UPDATE wallets
  SET    balance = balance - v_final_cost
  WHERE  child_id    = v_req.child_id
    AND  wallet_type = 'spending'
    AND  balance     >= v_final_cost
  RETURNING id INTO v_wallet_id;

  IF v_wallet_id IS NULL THEN
    RETURN jsonb_build_object('error', 'insufficient_balance');
  END IF;

  UPDATE redemption_requests
  SET    status         = 'approved',
         adjusted_coins = p_adjusted_coins,
         parent_note    = p_parent_note,
         reviewed_at    = now()
  WHERE  id = p_request_id;

  INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
  VALUES (v_wallet_id, v_final_cost, 'redeem', p_request_id, 'redemption_request');

  INSERT INTO intervention_log
    (family_id, child_id, event_type, trigger_source, ai_suggested, parent_decision, context_snapshot)
  VALUES (
    v_req.family_id, v_req.child_id, 'redemption_reviewed', 'parent_manual',
    jsonb_build_object('verdict', v_req.ai_verdict, 'reason', v_req.ai_reason, 'suggestedCoins', v_req.ai_suggested_coins),
    jsonb_build_object('status', 'approved', 'finalCoins', v_final_cost, 'adjustedCoins', p_adjusted_coins, 'note', p_parent_note),
    jsonb_build_object('walletBalanceBefore', v_balance_before, 'originalCoinCost', v_req.coin_cost)
  );

  RETURN jsonb_build_object('ok', true, 'status', 'approved', 'finalCoins', v_final_cost);
END;
$$;
