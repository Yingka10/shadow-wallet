-- Add the redeemed-state columns the redeem_wish RPC depends on.
--
-- Background: migrations 20260615000001_fn_redeem_wish and
-- 20260705000000_rpc_authz_checks both define redeem_wish to read/write
-- reward_items.is_redeemed and reward_items.redeemed_at, but the DDL that
-- creates those columns was never written. On the live DB reward_items only
-- had is_active, so every redemption failed with:
--   42703  column "is_redeemed" does not exist
--
-- is_redeemed is a dedicated redemption flag, intentionally distinct from
-- is_active (which the parent can toggle for reasons other than redemption).
-- The RPC's idempotency check keys off is_redeemed, not is_active.

ALTER TABLE reward_items
  ADD COLUMN IF NOT EXISTS is_redeemed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS redeemed_at timestamptz;
