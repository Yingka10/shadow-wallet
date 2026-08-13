-- P0 payout settlement — 真實並發測試 ④：清理 + 零殘留驗證（**會 commit**）。
--
--   supabase db query --linked -f supabase/verify/staging/p0_payout_race_cleanup.sql
--
-- 刪除順序照外鍵倒著走。最後回傳一行全 0 的計數 —— 那一行就是「零殘留」的證據，
-- 不是這支檔案自己宣稱的。任何一欄不是 0 就代表還有東西留在 staging 上。
DO $p0_race_cleanup$
DECLARE
  v_family uuid := 'aa000000-0000-4000-8000-000000000001';
  v_user   uuid := 'aa000000-0000-4000-8000-000000000002';
  v_child  uuid := 'aa000000-0000-4000-8000-000000000003';
  v_wallet uuid := 'aa000000-0000-4000-8000-000000000004';
  v_task   uuid := 'aa000000-0000-4000-8000-000000000005';
BEGIN
  DELETE FROM reward_settlements WHERE task_id = v_task OR child_id = v_child;
  DELETE FROM transactions       WHERE wallet_id = v_wallet;
  DELETE FROM time_savings       WHERE child_id = v_child;
  DELETE FROM task_completions   WHERE task_id = v_task OR child_id = v_child;
  DELETE FROM long_term_goals    WHERE task_id = v_task OR child_id = v_child;
  DELETE FROM child_tasks        WHERE task_id = v_task OR child_id = v_child;
  DELETE FROM task_change_events WHERE task_id = v_task;
  DELETE FROM tasks              WHERE id = v_task OR family_id = v_family;
  DELETE FROM wallets            WHERE child_id = v_child;
  DELETE FROM children           WHERE id = v_child OR family_id = v_family;
  DELETE FROM parents            WHERE family_id = v_family;
  DELETE FROM families           WHERE id = v_family;
  DELETE FROM auth.users         WHERE id = v_user;
END
$p0_race_cleanup$;

DROP TABLE IF EXISTS p0_race_log;
DROP TABLE IF EXISTS p0_race_ctl;

SELECT
  (SELECT count(*) FROM families    WHERE id = 'aa000000-0000-4000-8000-000000000001') AS families_left,
  (SELECT count(*) FROM children    WHERE id = 'aa000000-0000-4000-8000-000000000003') AS children_left,
  (SELECT count(*) FROM tasks       WHERE id = 'aa000000-0000-4000-8000-000000000005') AS tasks_left,
  (SELECT count(*) FROM wallets     WHERE id = 'aa000000-0000-4000-8000-000000000004') AS wallets_left,
  (SELECT count(*) FROM task_completions
     WHERE task_id = 'aa000000-0000-4000-8000-000000000005')                           AS completions_left,
  (SELECT count(*) FROM reward_settlements
     WHERE task_id = 'aa000000-0000-4000-8000-000000000005')                           AS settlements_left,
  (SELECT count(*) FROM transactions
     WHERE wallet_id = 'aa000000-0000-4000-8000-000000000004')                         AS transactions_left,
  (SELECT count(*) FROM auth.users  WHERE id = 'aa000000-0000-4000-8000-000000000002') AS users_left,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_name IN ('p0_race_log', 'p0_race_ctl'))                               AS scratch_tables_left,
  -- 全表掃一次名字，確保沒有任何漏網的 'P0 RACE' 資料。
  (SELECT count(*) FROM families WHERE family_name LIKE 'P0 RACE%')                    AS named_families_left,
  (SELECT count(*) FROM tasks    WHERE name LIKE 'P0 RACE%')                           AS named_tasks_left,
  (SELECT count(*) FROM children WHERE nickname LIKE 'P0 RACE%')                       AS named_children_left;
