-- P0 payout settlement — 真實並發測試 ②A：連線 A（**會 commit**）。
--
--   supabase db query --linked -f supabase/verify/staging/p0_payout_race_fire_a.sql
--
-- 與 fire_b 只差一個日期位移（A 用第 4 天、B 用第 5 天，同一週）。
-- 兩邊都會讓本期完成數 >= 4，於是兩邊都會嘗試結算同一個 (task, child, period)。
--
-- 會合方式：兩條連線都睡到 p0_race_ctl.go_at 才動作。
-- 這樣兩個交易的關鍵區段才會真的重疊 —— 先到的那個握著 unique key 未提交，
-- 後到的那個會卡住，然後在對方提交時拿到 23505。
--
-- 必須與 fire_b **同時**啟動（一個放背景、一個前景）。
DO $p0_race_a$
DECLARE
  v_user   uuid := 'aa000000-0000-4000-8000-000000000002';
  v_child  uuid := 'aa000000-0000-4000-8000-000000000003';
  v_task   uuid := 'aa000000-0000-4000-8000-000000000005';
  v_goal   uuid := 'aa000000-0000-4000-8000-000000000006';
  v_monday date := date_trunc('week', DATE '2026-08-12')::date;
  v_go     timestamptz;
  v_result jsonb;
  v_wake   timestamptz;
BEGIN
  SELECT go_at INTO v_go FROM p0_race_ctl;
  IF v_go IS NULL THEN
    RAISE EXCEPTION 'P0 RACE A: seed 沒跑過，p0_race_ctl 是空的';
  END IF;

  PERFORM pg_sleep(GREATEST(0, extract(epoch FROM (v_go - clock_timestamp()))));
  v_wake := clock_timestamp();

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  v_result := complete_task(
    v_task, v_child, ((v_monday + 3)::text || ' 09:00+08')::timestamptz, true, v_goal
  );

  INSERT INTO p0_race_log (session, wake_at, done_at, result)
  VALUES ('A', v_wake, clock_timestamp(), v_result);
END
$p0_race_a$;
