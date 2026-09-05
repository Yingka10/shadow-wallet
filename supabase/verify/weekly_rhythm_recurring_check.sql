-- GrowBook — 驗證：recurring + weekly_frequency 必須能有 weekly_rhythm
--
-- 套用 20260906000000_weekly_rhythm_recurring.sql **之前**跑 → 應該失敗（紅燈）
-- 套用之後跑                                              → 應該全部 PASS
--
-- 跑法：
--   psql "$DATABASE_URL" -f supabase/verify/weekly_rhythm_recurring_check.sql
--
-- 全程在交易內，結尾 ROLLBACK —— 不留下任何資料。

BEGIN;

-- ── 檢查一：約束本身的定義 ───────────────────────────────────────────────
--
-- 直接讀 pg_constraint 而不是只靠 INSERT 的成敗：INSERT 可能因為別的
-- 原因失敗（缺欄位、FK、RLS），那會讓紅燈的意義變得不確定。
-- 這一項只回答「那條 CHECK 現在長什麼樣」。
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conname = 'child_proposal_plan_versions_progress_model_evidence';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'FAIL: 找不到 child_proposal_plan_versions_progress_model_evidence';
  END IF;

  RAISE NOTICE '約束定義：%', v_def;

  IF v_def LIKE '%duration_type = ''long_term''%' THEN
    RAISE EXCEPTION 'FAIL（預期中的紅燈）: 約束仍然要求 duration_type = long_term';
  END IF;

  IF v_def NOT LIKE '%duration_type <> ''one_time''%' THEN
    RAISE EXCEPTION 'FAIL: 約束沒有改成排除 one_time';
  END IF;

  RAISE NOTICE 'PASS 1/3: 約束已改成排除 one_time';
END $$;

-- ── 檢查二：recurring 的節奏計畫寫得進去 ─────────────────────────────────
--
-- 借用一筆既有的 child_proposals 當 FK 目標，而不是自己建一筆 ——
-- 建立需要猜對整組 NOT NULL 欄位，猜錯會讓這支腳本因為不相干的理由失敗。
-- version_no 用 9999 避開既有版本號的 unique 衝突。
DO $$
DECLARE
  v_prop uuid;
BEGIN
  SELECT id INTO v_prop FROM child_proposals ORDER BY created_at LIMIT 1;
  IF v_prop IS NULL THEN
    RAISE EXCEPTION 'SKIP: 這個資料庫沒有 child_proposals，無法驗證寫入';
  END IF;

  INSERT INTO child_proposal_plan_versions (
    proposal_id, version_no, authored_by,
    plan_title, completion_description, next_step,
    purpose_category, duration_type, duration_days,
    cadence_mode, cadence_weekly_frequency, cadence_days,
    progress_model, estimated_minutes
  ) VALUES (
    v_prop, 9999, 'child',
    '每週練琴三次', '完成一次約定的練習時段', '今天先練 15 分鐘',
    'D', 'recurring', NULL,
    'weekly_frequency', 3, NULL,
    'weekly_rhythm', 15
  );

  RAISE NOTICE 'PASS 2/3: recurring + weekly_frequency + weekly_rhythm 可以寫入';
END $$;

-- ── 檢查三：one_time 仍然被擋下 ──────────────────────────────────────────
--
-- 放寬不等於拿掉。one_time 沒有每週節奏可看，畫面會算出永遠 0/0 的「本週」
-- —— 那正是這條約束當初要防的事，必須還在。
DO $$
DECLARE
  v_prop uuid;
BEGIN
  SELECT id INTO v_prop FROM child_proposals ORDER BY created_at LIMIT 1;

  BEGIN
    INSERT INTO child_proposal_plan_versions (
      proposal_id, version_no, authored_by,
      plan_title, completion_description, next_step,
      purpose_category, duration_type, duration_days,
      cadence_mode, cadence_weekly_frequency, cadence_days,
      progress_model, estimated_minutes
    ) VALUES (
      v_prop, 9998, 'child',
      '先試一次', '完成一次約定的時段', '今天先做 15 分鐘',
      'D', 'one_time', NULL,
      'one_time', NULL, NULL,
      'weekly_rhythm', 15
    );
    RAISE EXCEPTION 'FAIL: one_time 竟然可以宣稱 weekly_rhythm —— 放寬過頭了';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PASS 3/3: one_time 仍然被擋下';
  END;
END $$;

ROLLBACK;
