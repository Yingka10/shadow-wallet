-- Atomic wish redemption.
--
-- Replaces the 3-step JS "read balance → deduct → mark redeemed" in WishScreen.tsx.
-- Key properties:
--   1. Idempotent: returns 'already_redeemed' if item is already redeemed.
--   2. Race-safe: uses "UPDATE ... WHERE balance >= p_cost" (conditional in SQL)
--      instead of JS read-calculate-write, so two concurrent taps on the redeem
--      button cannot both succeed with the same balance.
--   3. Atomic: wallet deduction, transaction record, and reward_item flag all
--      commit or roll back together.

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
