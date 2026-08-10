-- Shadow Wallet — idempotency 競態驗證｜結果斷言
--
-- A 與 B 都跑完之後執行。這支不印查詢結果讓人用眼睛看，它自己會失敗。

\set ON_ERROR_STOP on

DO $$
DECLARE
  -- 識別碼由 session A 寫進 race_request。
  -- 不用 psql 變數，因為 psql 的變數不會在 dollar-quoted 區塊裡展開。
  v_req uuid := (SELECT id FROM race_request);
  v_count int;
  v_task uuid;
  v_b_start timestamptz;
  v_b_end timestamptz;
  v_a_commit timestamptz;
BEGIN
  -- ── 先證明這真的是一場競態 ────────────────────────────────────────────
  -- 沒有這一段的話，「A 早就 commit、B 走的是普通查詢路徑」看起來會一模一樣，
  -- 而那條路徑根本沒有測到例外處理。
  SELECT at INTO v_b_start   FROM race_log WHERE label = 'b_start';
  SELECT at INTO v_b_end     FROM race_log WHERE label = 'b_end';
  SELECT at INTO v_a_commit  FROM race_log WHERE label = 'a_precommit';

  IF v_b_start IS NULL OR v_b_end IS NULL OR v_a_commit IS NULL THEN
    RAISE EXCEPTION 'RACE FAILED: race_log 不完整，兩個 session 沒有都跑到';
  END IF;

  IF v_b_start >= v_a_commit THEN
    RAISE EXCEPTION
      'RACE FAILED: B 在 A commit 之後才開始（b_start=%, a_precommit=%），這不是競態',
      v_b_start, v_a_commit;
  END IF;

  IF v_b_end <= v_a_commit THEN
    RAISE EXCEPTION
      'RACE FAILED: B 在 A commit 之前就結束（b_end=%, a_precommit=%），代表它沒有被 index 擋住',
      v_b_end, v_a_commit;
  END IF;

  RAISE NOTICE '  ok   競態成立：B 於 A commit 前 % 開始，被擋住 %',
    v_a_commit - v_b_start, v_b_end - v_b_start;

  SELECT count(*) INTO v_count FROM tasks WHERE creation_request_id = v_req;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RACE FAILED: 同一個識別碼產生了 % 筆任務（應該是 1）', v_count;
  END IF;

  SELECT id INTO v_task FROM tasks WHERE creation_request_id = v_req;

  SELECT count(*) INTO v_count FROM child_tasks WHERE task_id = v_task;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RACE FAILED: child_tasks 有 % 筆（應該是 1）', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM task_change_events
  WHERE task_id = v_task AND event_type = 'created_from_preset';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RACE FAILED: 稽核事件有 % 筆（應該是 1）', v_count;
  END IF;

  RAISE NOTICE '  ok   競態：兩個同時的請求只建立一筆任務';
  RAISE NOTICE 'RACE CHECKS PASSED';
END $$;
