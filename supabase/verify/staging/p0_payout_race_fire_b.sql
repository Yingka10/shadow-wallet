-- P0 payout settlement — 真實並發測試 ②B：連線 B（**會 commit**）。
--
--   supabase db query --linked -f supabase/verify/staging/p0_payout_race_fire_b.sql
--
-- 與 fire_a 只差日期位移（B 用第 5 天）。說明見 fire_a。
DO $p0_race_b$
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
    RAISE EXCEPTION 'P0 RACE B: seed 沒跑過，p0_race_ctl 是空的';
  END IF;

  PERFORM pg_sleep(GREATEST(0, extract(epoch FROM (v_go - clock_timestamp()))));
  v_wake := clock_timestamp();

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  v_result := complete_task(
    v_task, v_child, ((v_monday + 4)::text || ' 09:00+08')::timestamptz, true, v_goal
  );

  INSERT INTO p0_race_log (session, wake_at, done_at, result)
  VALUES ('B', v_wake, clock_timestamp(), v_result);
END
$p0_race_b$;
