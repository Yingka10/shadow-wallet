-- P0 payout settlement — 真實並發測試 ③：驗證（唯讀，不改任何資料）。
--
--   supabase db query --linked -f supabase/verify/staging/p0_payout_race_verify.sql
--
-- 成功條件：
--   settlement_rows = 1
--   reward_tx_rows  = 1
--   wallet_balance  = 7（= X，一次而且只有一次）
--   completion_rows = 5（兩次完成都留下了 progress —— 沒有人被吃掉）
--   overlap_ms 很小（證明兩條連線真的重疊，不是一前一後）
--   settled_sessions = 1（兩條連線裡只有一條真的結算）
SELECT
  (SELECT count(*) FROM task_completions
    WHERE task_id = 'aa000000-0000-4000-8000-000000000005') AS completion_rows,
  (SELECT count(*) FROM reward_settlements
    WHERE task_id = 'aa000000-0000-4000-8000-000000000005') AS settlement_rows,
  (SELECT count(*) FROM transactions t
     JOIN reward_settlements rs ON rs.transaction_id = t.id
    WHERE rs.task_id = 'aa000000-0000-4000-8000-000000000005') AS reward_tx_rows,
  (SELECT COALESCE(sum(coin_amount), 0) FROM reward_settlements
    WHERE task_id = 'aa000000-0000-4000-8000-000000000005') AS settlement_sum,
  (SELECT balance FROM wallets
    WHERE id = 'aa000000-0000-4000-8000-000000000004') AS wallet_balance,
  (SELECT count(*) FROM p0_race_log
    WHERE (result -> 'settlement') <> 'null'::jsonb) AS settled_sessions,
  (SELECT round(extract(epoch FROM (max(wake_at) - min(wake_at))) * 1000)
     FROM p0_race_log) AS overlap_ms,
  (SELECT jsonb_object_agg(session, jsonb_build_object(
            'coinEarned', result->>'coinEarned',
            'periodDone', result->'period'->>'done',
            'settled',    result->'period'->>'settled',
            'error',      result->>'error'))
     FROM p0_race_log) AS per_session;
