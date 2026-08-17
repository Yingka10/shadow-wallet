-- P1-M1B Correction 1：settlement ledger ordering 改成 reservation-first。
--
-- 20260901 的版本先 INSERT transactions（純帳本，不動 balance）取得 tx_id，
-- 才拿 tx_id 去 INSERT milestone_settlements。問題：如果 milestone_settlements
-- 那步撞到 ON CONFLICT DO NOTHING（理論上因為 achievement 自己的 AFTER INSERT
-- ROW 語意幾乎不會發生，但「幾乎不會發生」不是這條 canonical accounting path
-- 應該仰賴的保證），會留下一筆沒有對應 settlement、也沒有對應 wallet 異動的
-- 孤兒 transactions 列。
--
-- 改成：settlement 的 INSERT 本身（transaction_id 先留 NULL）才是允不允許
-- mint 的 gate；只有它真的 insert 到新列，才去動 wallet、建 transactions，
-- 再把 tx_id 寫回這一列。沒有成功的 settlement，就不會有 transactions 列，
-- 也不會有 wallet 異動 —— 三者的存在與否完全綁在一起，不再是「大概率一起
-- 發生」。

BEGIN;

CREATE OR REPLACE FUNCTION public.settle_milestone_reward_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agreement     record;
  v_wallet_id     uuid;
  v_tx_id         uuid;
  v_settlement_id uuid;
BEGIN
  SELECT * INTO v_agreement FROM milestone_agreements WHERE id = NEW.milestone_agreement_id;

  -- 沒有幣的 milestone：achievement 已經寫下了，這支什麼都不用做。
  IF v_agreement.reward_coin_amount IS NULL OR v_agreement.reward_coin_amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- ── 1. reservation：這一步是真正的 gate ──────────────────────────────────
  -- transaction_id 先留 NULL。撞到 UNIQUE(milestone_achievement_id) 就代表
  -- 已經結算過（正常情況下不會發生，因為 NEW 保證是全新 achievement），
  -- 這時 v_settlement_id 會是 NULL，下面直接 return，不動 wallet、不建
  -- transactions —— 沒有成功的 reservation，就沒有新的 reward transaction。
  INSERT INTO milestone_settlements (
    milestone_achievement_id, milestone_agreement_id, child_id, coin_amount, transaction_id
  ) VALUES (
    NEW.id, NEW.milestone_agreement_id, NEW.child_id, v_agreement.reward_coin_amount, NULL
  )
  ON CONFLICT (milestone_achievement_id) DO NOTHING
  RETURNING id INTO v_settlement_id;

  IF v_settlement_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── 2. 只有 reservation 成功，才動 wallet／建 transactions ───────────────
  SELECT id INTO v_wallet_id FROM wallets WHERE child_id = NEW.child_id AND wallet_type = 'spending';

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Spending wallet not found for child %', NEW.child_id;
  END IF;

  UPDATE wallets SET balance = balance + v_agreement.reward_coin_amount WHERE id = v_wallet_id;

  INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
  VALUES (v_wallet_id, v_agreement.reward_coin_amount, 'earn', NEW.id, 'milestone_achievement')
  RETURNING id INTO v_tx_id;

  -- ── 3. 寫回 transaction_id，讓 settlement 可以完整追到這筆帳本交易 ───────
  UPDATE milestone_settlements SET transaction_id = v_tx_id WHERE id = v_settlement_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.settle_milestone_reward_v1() IS
  'Reservation-first：milestone_settlements 的 INSERT（transaction_id 先 NULL）'
  '才是允不允許 mint 的 gate。只有它真的 insert 到新列，才會動 wallet、建'
  'transactions，再把 tx_id 寫回同一列 —— 不會有「transactions 存在但沒有'
  '對應 settlement」的孤兒帳本列，也不會有「settlement 存在但錢沒真的到」。';

COMMIT;
