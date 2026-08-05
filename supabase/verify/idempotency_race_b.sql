-- Shadow Wallet — idempotency 競態驗證｜Session B
--
-- 在 A 還沒 commit 的時候，用**同一個識別碼**送出建立。
--
-- 預期發生的事，依序是：
--   1. B 的 replay 查詢看不到 A 的 row（A 還沒 commit）→ 回 NULL，往下走
--   2. B 的 INSERT 撞上 unique index，卡住等 A
--   3. A commit → B 收到 23505 unique_violation
--   4. B 的例外處理重查一次，這次看得到 A 的 row → 回傳 A 建立的那筆
--
-- 也就是說：兩個「同時」的請求，資料庫裡只會有一筆任務，而且兩邊都拿到成功。
-- 沒有這段處理的話，B 會收到 PERSISTENCE_FAILED —— 家長看到失敗、任務卻建好了，
-- 於是再按一次。
--
-- b_start / b_end 各自 autocommit，所以時間立刻可見；assert 會用它們證明
-- B 的整段執行確實跨過了 A 的 commit。

\set ON_ERROR_STOP on
-- 建立請求識別碼由呼叫端指定（psql -v req=...）。
-- 寫死一個的話，第二次跑這支腳本會撞到上一次留下的任務，
-- A 直接走 replay 而不 insert —— B 就沒有東西可以撞，競態根本沒發生。

INSERT INTO race_log (label) VALUES ('b_start');

SELECT set_config('test.uid',
  (SELECT v::text FROM fixture WHERE k = 'user_1'), false);

SELECT create_parent_task_v1(vreq(vcmd(
  (SELECT v FROM fixture WHERE k = 'child_a'),
  (SELECT v FROM fixture WHERE k = 'fam_a'),
  'recurring', 'learning_skill', 'recurring', NULL,
  'record_only', 'ongoing', 'fixed_days', vplain('record_only')),
  :'req'::uuid)) AS session_b_result;

INSERT INTO race_log (label) VALUES ('b_end');
