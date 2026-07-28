-- Shadow Wallet — 預設任務抽屜｜schema snapshot
--
-- 對一個已經跑過 task_reward_verification.sql 的暫存資料庫執行，
-- 把 migration 真正建出來的東西印出來，用來對照 src/types/database.ts。
--
--   psql -d growbook_task_verify -At -f supabase/verify/task_drawer_schema_snapshot.sql
--
-- 只列 migration 產生的物件。harness 自己建的核心表欄位（families / parents /
-- children 的簡化版）刻意不列 —— 那些不是這兩支 migration 的產出，
-- 列出來只會讓人誤以為 harness 的簡化 schema 是真相。

\pset format unaligned
\pset tuples_only on
\pset fieldsep ' | '

\echo '## tasks — migration 新增的欄位'
SELECT column_name, data_type, is_nullable, coalesce(column_default, '')
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'tasks'
  AND column_name IN (
    'duration_type','plan_mode','task_source','reward_policy','completion_policy',
    'original_expectation','completion_description','task_details','notes',
    'schedule_mode','weekly_frequency','start_date','scheduled_date',
    'preferred_time','preferred_time_custom','estimated_minutes',
    'review_enabled','review_after_days','support_level',
    'task_policy_version','reward_policy_version',
    'preset_family_id','preset_variant_id','preset_catalog_version',
    'command_schema_version','created_from_preset',
    'reward_coin_amount','reward_coin_suggested_amount',
    'reward_coin_min','reward_coin_max')
ORDER BY column_name;

\echo ''
\echo '## long_term_goals — migration 新增的欄位'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'long_term_goals'
  AND column_name IN ('end_date','first_review_after_days','weekend_review_enabled')
ORDER BY column_name;

\echo ''
\echo '## 五張子表'
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('task_preset_selections','task_plan_milestones',
                     'task_plan_support_steps','task_role_responsibilities',
                     'task_change_events')
ORDER BY table_name, ordinal_position;

\echo ''
\echo '## CHECK constraint'
SELECT conrelid::regclass::text, conname
FROM pg_constraint
WHERE contype = 'c'
  AND conrelid::regclass::text IN (
    'tasks','long_term_goals','task_preset_selections','task_plan_milestones',
    'task_plan_support_steps','task_role_responsibilities','task_change_events')
ORDER BY 1, 2;

\echo ''
\echo '## RLS'
SELECT c.relname, c.relrowsecurity::text, coalesce(p.policyname, '(no policy)'), coalesce(p.cmd, '')
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
WHERE n.nspname = 'public'
  AND c.relname IN ('task_preset_selections','task_plan_milestones',
                    'task_plan_support_steps','task_role_responsibilities',
                    'task_change_events')
ORDER BY 1, 3;

\echo ''
\echo '## 函式簽章'
SELECT p.proname,
       pg_get_function_arguments(p.oid),
       pg_get_function_result(p.oid),
       p.prosecdef::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('create_parent_task_v1','complete_task','mark_task_atomic',
                    'redeem_wish','map_purpose_category','map_completion_policy')
ORDER BY p.proname;

\echo ''
\echo '## 函式 EXECUTE 權限'
SELECT p.proname, r.rolname,
       has_function_privilege(r.rolname, p.oid, 'EXECUTE')::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname)
WHERE n.nspname = 'public' AND p.proname = 'create_parent_task_v1'
ORDER BY 2;

\echo ''
\echo '## 子表 client 權限'
SELECT t.tablename, r.rolname,
       has_table_privilege(r.rolname, t.tablename, 'SELECT')::text AS can_select,
       has_table_privilege(r.rolname, t.tablename, 'INSERT')::text AS can_insert
FROM (VALUES ('task_preset_selections'),('task_plan_milestones'),
             ('task_plan_support_steps'),('task_role_responsibilities'),
             ('task_change_events')) AS t(tablename)
CROSS JOIN (VALUES ('anon'),('authenticated')) AS r(rolname)
ORDER BY 1, 2;
