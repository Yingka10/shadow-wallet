-- P1-8: rewrite settle_weekly_interest for idempotency (last_interest_at gate)
-- + lock EXECUTE to service_role.
--
-- Bug fixed: live version has no gating at all — every cron/manual invocation
-- re-pays interest on every saving wallet with balance>0 (AUDIT 5-9 #2).
-- MASTER §WF-16 (stated twice, identically): "Cron 每週觸發，內部判斷距離上次
-- 結算是否滿兩週，未到則跳過。錢沒動才計息。" — bi-weekly accrual, gated by
-- last_interest_at, regardless of how often the cron tick itself fires.
--
-- Authorization: this function takes no parameters and processes ALL
-- families' saving wallets globally — it isn't scoped to one family, so the
-- P1-6 "caller must own this family" pattern (used in complete_task /
-- redeem_wish / setup_child_tasks / mark_task_atomic / review_redemption_request)
-- doesn't apply here. There's no legitimate reason for an authenticated app
-- user to trigger a global interest re-settlement, so instead we lock EXECUTE
-- to service_role only — the Edge Function already calls this via a
-- service_role client.

CREATE OR REPLACE FUNCTION public.settle_weekly_interest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w                record;
  interest_amount  int;
  v_wallets_paid   int := 0;
  v_wallets_zero   int := 0;
  v_total_interest int := 0;
BEGIN
  FOR w IN
    SELECT * FROM wallets
    WHERE wallet_type = 'saving'
      AND balance > 0
      AND (last_interest_at IS NULL OR last_interest_at <= now() - interval '14 days')
  LOOP
    interest_amount := round(w.balance * w.interest_rate)::int;
    IF interest_amount > 0 THEN
      UPDATE wallets
        SET balance = balance + interest_amount,
            last_interest_at = now()
        WHERE id = w.id;
      INSERT INTO transactions (wallet_id, amount, type, note)
        VALUES (w.id, interest_amount, 'interest', '週日利息自動入帳');
      v_wallets_paid   := v_wallets_paid + 1;
      v_total_interest := v_total_interest + interest_amount;
    ELSE
      -- Balance too small to yield a non-zero interest amount this cycle.
      -- Deliberately do NOT advance last_interest_at here, so a wallet that
      -- crosses back above the rounding threshold next cycle isn't skipped.
      v_wallets_zero := v_wallets_zero + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'walletsPaid', v_wallets_paid,
    'walletsZeroInterest', v_wallets_zero,
    'totalInterest', v_total_interest,
    'settledAt', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_weekly_interest() FROM PUBLIC, authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.settle_weekly_interest() TO service_role;
