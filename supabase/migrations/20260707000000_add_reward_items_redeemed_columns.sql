-- reward_items 補欄位：is_redeemed + redeemed_at
-- redeem_wish RPC 需要這兩欄，但原始建表 migration 沒有定義。
ALTER TABLE reward_items
  ADD COLUMN IF NOT EXISTS is_redeemed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS redeemed_at timestamptz DEFAULT null;
