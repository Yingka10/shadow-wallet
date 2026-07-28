-- Shadow Wallet — idempotency 競態驗證｜Session A
--
-- 單一 psql session 測不出競態：那需要「兩個 transaction 同時想插入同一個
-- creation_request_id」，而同一條連線上的兩次呼叫永遠是先後發生的。
-- 所以競態這一條要用兩個真的 session 跑。
--
-- Session A：開一個 transaction，建立任務，然後**故意不 commit**、睡 10 秒。
-- 這段時間內 Session B 會用同一個識別碼進來，撞在 unique index 上卡住；
-- 等 A commit，B 才會拿到 23505 並走進競態處理。
--
-- 兩邊都把時間寫進 race_log，事後才證明得出「B 真的在 A commit 之前就開始了」——
-- 沒有這個紀錄的話，跑得快一點就會變成「A 早就 commit、B 走的是普通查詢路徑」，
-- 而輸出看起來一模一樣。
--
-- 前提：先跑過 task_reward_verification.sql（fixture、vcmd、vreq 都在那裡建立）。

\set ON_ERROR_STOP on
-- 建立請求識別碼由呼叫端指定（psql -v req=...）。
-- 寫死一個的話，第二次跑這支腳本會撞到上一次留下的任務，
-- A 直接走 replay 而不 insert —— B 就沒有東西可以撞，競態根本沒發生。

-- 每次跑都從乾淨的紀錄開始，否則上一輪的時間會讓 assert 判斷錯誤。
DROP TABLE IF EXISTS race_log;
CREATE TABLE race_log (
  label text,
  at    timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- 識別碼另外存一份給 assert 讀。
-- psql 的 :'req' **不會**在 $$ ... $$ 裡展開，所以 assert 沒辦法直接用它。
DROP TABLE IF EXISTS race_request;
CREATE TABLE race_request (id uuid PRIMARY KEY);
INSERT INTO race_request (id) VALUES (:'req'::uuid);

BEGIN;

SELECT set_config('test.uid',
  (SELECT v::text FROM fixture WHERE k = 'user_1'), false);

SELECT create_parent_task_v1(vreq(vcmd(
  (SELECT v FROM fixture WHERE k = 'child_a'),
  (SELECT v FROM fixture WHERE k = 'fam_a'),
  'recurring', 'learning_skill', 'recurring', NULL,
  'record_only', 'ongoing', 'fixed_days', vplain('record_only')),
  :'req'::uuid)) AS session_a_result;

-- 讓 B 有足夠時間進來撞上 unique index。
SELECT pg_sleep(10);

-- 這一列在 commit 之後才看得見，時間是 commit 的前一刻。
INSERT INTO race_log (label) VALUES ('a_precommit');

COMMIT;
