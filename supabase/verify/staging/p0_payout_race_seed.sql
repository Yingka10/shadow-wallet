-- P0 payout settlement — 真實並發測試 ①：seed（**會 commit**）。
--
--   supabase db query --linked -f supabase/verify/staging/p0_payout_race_seed.sql
--
-- 為什麼這一支不像其他 staging 資產那樣自我回滾：真正的並發需要兩條獨立連線
-- 看到同一批資料，而未提交的資料另一條連線看不到。所以這裡刻意留下已提交的
-- fixture，跑完由 p0_payout_race_cleanup.sql 清乾淨並驗證零殘留。
--
-- 隔離：專屬 family / child / task，UUID 全部固定且以 aa000000- 開頭，
-- 名稱一律 'P0 RACE ...'，不碰任何 Demo 或既有資料。
--
-- 場景：每週 4 次的長期計畫，已完成 3 次（尚未達標、錢包 0）。
-- 接著兩條連線同時送出第 4、第 5 次完成 —— 兩邊都會算出「本期已達標」，
-- 於是兩邊都會嘗試結算。unique index 必須讓其中一邊拿到 23505。
--
-- ⚠️ 幣值 7 是測試資料，不是 per-period pricing policy。

CREATE TABLE IF NOT EXISTS p0_race_ctl (go_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS p0_race_log (
  session  text PRIMARY KEY,
  wake_at  timestamptz,
  done_at  timestamptz,
  result   jsonb
);

DO $p0_race_seed$
DECLARE
  v_family uuid := 'aa000000-0000-4000-8000-000000000001';
  v_user   uuid := 'aa000000-0000-4000-8000-000000000002';
  v_child  uuid := 'aa000000-0000-4000-8000-000000000003';
  v_wallet uuid := 'aa000000-0000-4000-8000-000000000004';
  v_task   uuid := 'aa000000-0000-4000-8000-000000000005';
  v_goal   uuid := 'aa000000-0000-4000-8000-000000000006';
  v_monday date := date_trunc('week', DATE '2026-08-12')::date;
  v_result jsonb;
BEGIN
  DELETE FROM p0_race_ctl;
  DELETE FROM p0_race_log;

  INSERT INTO auth.users (id) VALUES (v_user) ON CONFLICT DO NOTHING;
  INSERT INTO families (id, family_name) VALUES (v_family, 'P0 RACE family');
  INSERT INTO parents (family_id, name, user_id) VALUES (v_family, 'P0 RACE parent', v_user);
  INSERT INTO children (id, family_id, nickname, birth_date, age_group)
  VALUES (v_child, v_family, 'P0 RACE child', '2018-01-01', '6-9');
  INSERT INTO wallets (id, child_id, wallet_type, balance)
  VALUES (v_wallet, v_child, 'spending', 0);

  INSERT INTO tasks (
    id, family_id, name, category, day_type, is_active, is_long_term, long_term_type,
    claim_period, max_claims_per_period, reward_policy, reward_coin_amount,
    reward_coin_min, reward_coin_max, reward_policy_version,
    duration_type, schedule_mode, weekly_frequency, progress_model,
    payout_basis, period_target_count, payout_basis_effective_from
  ) VALUES (
    v_task, v_family, 'P0 RACE weekly reading', 'D', 'both', true, true, 'habit',
    'week', 5, 'coin_eligible', 7, 1, 30, 'p0-race',
    'long_term', 'weekly_frequency', 4, 'weekly_rhythm',
    'per_period', 4, v_monday
  );

  INSERT INTO child_tasks (child_id, task_id, is_active) VALUES (v_child, v_task, true);
  INSERT INTO long_term_goals (id, child_id, task_id, goal_type, current_day, status)
  VALUES (v_goal, v_child, v_task, 'habit', 0, 'active');

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  -- 走 canonical 路徑完成 3 次（都不該發幣）。
  FOR i IN 0..2 LOOP
    v_result := complete_task(
      v_task, v_child, ((v_monday + i)::text || ' 09:00+08')::timestamptz, true, v_goal
    );
    IF (v_result->>'coinEarned')::int <> 0 THEN
      RAISE EXCEPTION 'P0 RACE seed: completion % minted before target: %', i + 1, v_result;
    END IF;
  END LOOP;

  IF (SELECT balance FROM wallets WHERE id = v_wallet) <> 0 THEN
    RAISE EXCEPTION 'P0 RACE seed: wallet is not 0 before the race';
  END IF;

  -- 兩條連線的會合點。給足 CLI 啟動與連線的時間。
  INSERT INTO p0_race_ctl (go_at) VALUES (clock_timestamp() + interval '30 seconds');
END
$p0_race_seed$;

SELECT go_at AS race_go_at,
       (SELECT count(*) FROM task_completions
         WHERE task_id = 'aa000000-0000-4000-8000-000000000005') AS seeded_completions,
       (SELECT balance FROM wallets
         WHERE id = 'aa000000-0000-4000-8000-000000000004') AS wallet_before
FROM p0_race_ctl;
