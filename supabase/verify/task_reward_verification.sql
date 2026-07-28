-- Shadow Wallet — 預設任務抽屜｜真實 PostgreSQL 驗證腳本
--
-- 用途：在**非 production** 的 Postgres 上實際執行 20260728000000 與 20260729000000，
--       並跑一輪 integration 檢查。這支腳本本身不會碰任何既有資料庫。
--
-- ─────────────────────────────────────────────────────────────────────────
-- 為什麼需要 harness
-- ─────────────────────────────────────────────────────────────────────────
-- supabase/migrations/ 裡**沒有任何一支建立核心表**（tasks / children / parents /
-- wallets / ...）。它們是在 Supabase 專案上直接建的，從來沒有回填進 migrations
-- （AUDIT P1-7 提過同類問題）。所以 `supabase db reset` 就算有 Docker 也跑不起來 ——
-- 缺的不是容器，是 schema 起點。
--
-- 這一段 harness 就是那個缺掉的起點：只建這兩支 migration 真的會碰到的表與欄位。
-- 它不是完整 schema，也不打算變成 schema 的真相來源 —— 真相仍在 live DB，
-- 把它回填進 migrations 是另一件待辦。
--
-- ⚠️ harness 的 DDL 只存在這支檔案，**不會**、也不該被搬進 production migration。
--
-- ─────────────────────────────────────────────────────────────────────────
-- 這支驗證的是什麼
-- ─────────────────────────────────────────────────────────────────────────
-- 「migration 在正確的歷史順序下可以一次套用成功，而且套完之後行為正確。」
--
-- 刻意**不**驗證「同一支 migration 重跑兩次」：正式的 Supabase migration 歷史
-- 不會重複套同一個檔案，把它當成需求只會逼出一堆遮蔽 schema 漂移的 IF NOT EXISTS。
-- 既有檔案裡的 IF NOT EXISTS 保留著（它們本來就在），但不是本腳本的驗收條件。
--
-- ─────────────────────────────────────────────────────────────────────────
-- 怎麼跑
-- ─────────────────────────────────────────────────────────────────────────
--   createdb -h localhost -p 5432 -U postgres growbook_task_verify
--   psql -h localhost -p 5432 -U postgres -d growbook_task_verify \
--        -v ON_ERROR_STOP=1 -f supabase/verify/task_reward_verification.sql
--   dropdb -h localhost -p 5432 -U postgres growbook_task_verify
--
-- 全部通過時最後一行是 `ALL CHECKS PASSED`。任何一項失敗會 RAISE EXCEPTION
-- 並因為 ON_ERROR_STOP=1 立刻中止。
--
-- ⚠️ 絕對不要對 production 專案執行。supabase/config.toml 的 project_id 與 .env
--    的 URL 是同一個正式專案，那裡有真的家庭資料。

\set ON_ERROR_STOP on

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Supabase 環境替身
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS auth;

-- 測試時用 session 變數扮演登入者。真實環境由 Supabase 的 JWT 提供。
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.uid', true), '')::uuid;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. 核心表（只建這兩支 migration 會碰到的部分）
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE parents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id),
  nickname text,
  birth_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id),
  name text NOT NULL,
  category text NOT NULL,
  day_type text,
  long_term_type text,
  is_long_term boolean NOT NULL DEFAULT false,
  base_time_min int NOT NULL DEFAULT 0,
  difficulty numeric NOT NULL DEFAULT 1,
  coin_override int,
  is_system_default boolean NOT NULL DEFAULT false,
  allow_repeat boolean NOT NULL DEFAULT false,
  min_age int NOT NULL DEFAULT 0,
  max_age int NOT NULL DEFAULT 99,
  is_active boolean NOT NULL DEFAULT true,
  time_saving_min int NOT NULL DEFAULT 0,
  recurrence_days integer[],
  due_date date,
  -- 20260724000000_task_frequency_cap.sql 帶進來的兩欄
  claim_period text NOT NULL DEFAULT 'day',
  max_claims_per_period int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE child_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id),
  task_id uuid NOT NULL REFERENCES tasks(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id),
  child_id uuid NOT NULL REFERENCES children(id),
  completed_at timestamptz NOT NULL DEFAULT now(),
  reported_at timestamptz NOT NULL DEFAULT now(),
  reported_by text NOT NULL DEFAULT 'child',
  status text NOT NULL DEFAULT 'completed',
  coin_earned int NOT NULL DEFAULT 0,
  time_saved_min int NOT NULL DEFAULT 0,
  override_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id uuid NOT NULL REFERENCES task_completions(id),
  parent_id uuid NOT NULL REFERENCES parents(id),
  override_type text NOT NULL,
  coin_deducted int NOT NULL DEFAULT 0,
  credit_flag boolean NOT NULL DEFAULT false,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id),
  wallet_type text NOT NULL,
  balance int NOT NULL DEFAULT 0,
  interest_rate numeric NOT NULL DEFAULT 0
);

CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES wallets(id),
  amount int NOT NULL,
  type text NOT NULL,
  reference_id uuid,
  reference_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE time_savings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id),
  completion_id uuid NOT NULL REFERENCES task_completions(id),
  minutes_saved int NOT NULL
);

CREATE TABLE long_term_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id),
  task_id uuid REFERENCES tasks(id),
  goal_type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_day int NOT NULL DEFAULT 0,
  total_days int,
  started_at date,
  next_review_at timestamptz,
  checkpoint_rewards jsonb,
  role_title text,
  interrupt_count int NOT NULL DEFAULT 0
);

CREATE TABLE reward_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id),
  child_id uuid REFERENCES children(id),
  name text,
  reward_type text,
  coin_cost int NOT NULL DEFAULT 0,
  added_by text,
  parent_approved boolean NOT NULL DEFAULT false,
  is_redeemed boolean NOT NULL DEFAULT false,
  redeemed_at timestamptz,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE intervention_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id),
  child_id uuid NOT NULL REFERENCES children(id),
  parent_id uuid REFERENCES parents(id),
  task_id uuid REFERENCES tasks(id),
  task_name_snapshot text,
  override_id uuid,
  event_type text NOT NULL,
  trigger_source text,
  ai_suggested jsonb,
  parent_decision jsonb,
  context_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. 套用要驗證的 migration（依正式順序，一次）
-- ═══════════════════════════════════════════════════════════════════════════

\echo '── applying 20260728000000_task_drawer_persistence_v1.sql'
\i supabase/migrations/20260728000000_task_drawer_persistence_v1.sql

\echo '── applying 20260729000000_task_reward_and_completion_authz.sql'
\i supabase/migrations/20260729000000_task_reward_and_completion_authz.sql

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. 測試資料：兩個家庭、四位家長（其中一位跨兩個家庭）
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE fixture (k text PRIMARY KEY, v uuid);

DO $$
DECLARE
  v_fam_a uuid; v_fam_b uuid;
  v_child_a uuid; v_child_b uuid;
  v_user_1 uuid := gen_random_uuid();  -- 家庭 A 的家長，同時也在家庭 B
  v_user_2 uuid := gen_random_uuid();  -- 家庭 A 的第二位家長
  v_user_3 uuid := gen_random_uuid();  -- 只屬於家庭 B
  v_item_b uuid;
BEGIN
  INSERT INTO families (name) VALUES ('家庭 A') RETURNING id INTO v_fam_a;
  INSERT INTO families (name) VALUES ('家庭 B') RETURNING id INTO v_fam_b;

  INSERT INTO parents (family_id, user_id) VALUES (v_fam_a, v_user_1);
  INSERT INTO parents (family_id, user_id) VALUES (v_fam_a, v_user_2);
  INSERT INTO parents (family_id, user_id) VALUES (v_fam_b, v_user_1);
  INSERT INTO parents (family_id, user_id) VALUES (v_fam_b, v_user_3);

  INSERT INTO children (family_id, nickname, birth_date)
  VALUES (v_fam_a, '承恩', '2018-03-05') RETURNING id INTO v_child_a;
  INSERT INTO children (family_id, nickname, birth_date)
  VALUES (v_fam_b, '小柔', '2017-08-20') RETURNING id INTO v_child_b;

  INSERT INTO wallets (child_id, wallet_type, balance) VALUES (v_child_a, 'spending', 100);
  INSERT INTO wallets (child_id, wallet_type, balance) VALUES (v_child_b, 'spending', 100);

  INSERT INTO reward_items (family_id, child_id, name, coin_cost)
  VALUES (v_fam_b, v_child_b, '家庭 B 的獎勵', 10) RETURNING id INTO v_item_b;

  INSERT INTO fixture VALUES
    ('fam_a', v_fam_a), ('fam_b', v_fam_b),
    ('child_a', v_child_a), ('child_b', v_child_b),
    ('user_1', v_user_1), ('user_2', v_user_2), ('user_3', v_user_3),
    ('item_b', v_item_b);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. 命令樣板
-- ═══════════════════════════════════════════════════════════════════════════

CREATE FUNCTION vcmd(
  p_child uuid, p_family uuid,
  p_editor text, p_purpose text, p_duration text, p_plan_mode text,
  p_reward text, p_completion text, p_schedule_mode text,
  p_decision jsonb,
  p_extra jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'childId', p_child,
    'familyId', p_family,
    'preset', jsonb_build_object('familyId', 'learn-reading', 'variantId', 'v1'),
    'task', jsonb_build_object(
      'title', '測試任務',
      'purposeCategory', p_purpose,
      'durationType', p_duration,
      'planMode', p_plan_mode,
      'source', 'co_created',
      'rewardPolicy', p_reward,
      'completionPolicy', p_completion,
      'originalExpectation', '期待',
      'completionDescription', '完成標準'
    ),
    'schedule', jsonb_build_object(
      'mode', p_schedule_mode,
      'startDate', '2026-07-29',
      'scheduledDate', CASE WHEN p_schedule_mode = 'one_time' THEN '2026-07-29' END,
      'recurrenceDays', CASE WHEN p_schedule_mode = 'fixed_days'
                             THEN '[1,3,5]'::jsonb ELSE '[]'::jsonb END,
      'weeklyFrequency', CASE WHEN p_schedule_mode = 'weekly_frequency' THEN 3 END,
      'preferredTime', 'after_school',
      'estimatedMinutes', 20,
      'reminderMode', 'none'
    ),
    'content', jsonb_build_object(
      'selectedOptions', jsonb_build_object('reading_method', '["alone"]'::jsonb),
      'customOptionValues', '{}'::jsonb
    ),
    'review', jsonb_build_object('reviewEnabled', true),
    'reward', jsonb_build_object('decision', p_decision),
    'metadata', jsonb_build_object(
      'ageGroup', '6-9', 'createdFromPreset', true,
      'taskPolicyVersion', 'task-taxonomy-2026-07',
      'presetCatalogVersion', '2026-07-28',
      'editorKind', p_editor
    )
  ) || p_extra;
$$;

/** 長期形式要補上 endDate 與 durationDays。 */
CREATE FUNCTION vlong(p_cmd jsonb, p_end date, p_days int)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_set(p_cmd, '{schedule}',
    (p_cmd -> 'schedule') || jsonb_build_object('endDate', p_end, 'durationDays', p_days));
$$;

CREATE FUNCTION vcoin(p_final int, p_min int, p_max int, p_version text DEFAULT 'coin-policy-1.0.0')
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'rewardPolicy', 'coin_eligible',
    'eligibility', 'allowed',
    'rewardPolicyVersion', p_version,
    'explanation', '6-9 歲段、D 類、每次約 20 分鐘',
    'coin', jsonb_build_object(
      'suggestedAmount', p_final, 'finalAmount', p_final,
      'minAllowed', p_min, 'maxAllowed', p_max,
      'calculationBasis', jsonb_build_object(
        'ageGroup', '6-9', 'purposeCategory', 'learning_skill',
        'estimatedMinutes', 20, 'durationType', 'recurring',
        'scheduleMode', 'fixed_days', 'difficulty', 'standard', 'band', '11-20'
      )
    )
  );
$$;

CREATE FUNCTION vplain(p_policy text, p_version text DEFAULT 'reward-eligibility-2026-07')
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'rewardPolicy', p_policy, 'eligibility', 'allowed', 'coin', NULL,
    'rewardPolicyVersion', p_version, 'explanation', '不發成長幣'
  );
$$;

CREATE FUNCTION vassert(p_ok boolean, p_label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok THEN RAISE NOTICE '  ok   %', p_label;
  ELSE RAISE EXCEPTION 'FAILED: %', p_label;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Schema 層檢查（4-7）
-- ═══════════════════════════════════════════════════════════════════════════

\echo '── schema checks'

DO $$
DECLARE v_count int;
BEGIN
  -- 5. CHECK constraint 建立成功
  SELECT count(*) INTO v_count FROM pg_constraint
  WHERE conname IN (
    'tasks_reward_coin_positive_check', 'tasks_reward_coin_range_check',
    'tasks_coin_eligible_needs_amount_check', 'tasks_non_coin_has_no_amount_check',
    'tasks_claim_period_check', 'tasks_reward_policy_check',
    'tasks_completion_policy_check', 'tasks_one_time_needs_date_check');
  PERFORM vassert(v_count = 8, format('CHECK constraint 建立成功（%s/8）', v_count));

  -- 6. RLS policy 建立成功
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE tablename IN ('task_preset_selections', 'task_plan_milestones',
                      'task_plan_support_steps', 'task_role_responsibilities',
                      'task_change_events');
  PERFORM vassert(v_count >= 5, format('RLS policy 建立成功（%s）', v_count));

  SELECT count(*) INTO v_count FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relrowsecurity
    AND c.relname IN ('task_preset_selections', 'task_plan_milestones',
                      'task_plan_support_steps', 'task_role_responsibilities',
                      'task_change_events');
  PERFORM vassert(v_count = 5, format('五張子表都啟用 RLS（%s/5）', v_count));

  -- 7. RPC 建立成功
  PERFORM vassert(
    EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_parent_task_v1'),
    'create_parent_task_v1 建立成功');
  PERFORM vassert(
    (SELECT prosecdef FROM pg_proc WHERE proname = 'create_parent_task_v1'),
    'create_parent_task_v1 是 SECURITY DEFINER');

  -- grants：authenticated 可執行，anon 不可
  PERFORM vassert(
    has_function_privilege('authenticated', 'public.create_parent_task_v1(jsonb)', 'EXECUTE'),
    'authenticated 可執行 create_parent_task_v1');
  PERFORM vassert(
    NOT has_function_privilege('anon', 'public.create_parent_task_v1(jsonb)', 'EXECUTE'),
    'anon 不可執行 create_parent_task_v1');
  PERFORM vassert(
    NOT has_function_privilege('service_role', 'public.create_parent_task_v1(jsonb)', 'EXECUTE'),
    'service_role 刻意未開通');

  -- 子表只給 SELECT，寫入一律走 SECURITY DEFINER
  PERFORM vassert(
    has_table_privilege('authenticated', 'task_change_events', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'task_change_events', 'INSERT'),
    '稽核表 client 只能讀不能寫');

  -- 四種版本欄位都在
  SELECT count(*) INTO v_count FROM information_schema.columns
  WHERE table_name = 'tasks'
    AND column_name IN ('task_policy_version', 'reward_policy_version',
                        'preset_catalog_version', 'command_schema_version');
  PERFORM vassert(v_count = 4, format('tasks 有四種版本欄位（%s/4）', v_count));

  PERFORM vassert(
    NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'tasks' AND column_name = 'policy_version'),
    '沒有殘留模糊的 tasks.policy_version');
  PERFORM vassert(
    NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'task_change_events' AND column_name = 'policy_version'),
    '沒有殘留模糊的 task_change_events.policy_version');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. 行為檢查（8-34）
-- ═══════════════════════════════════════════════════════════════════════════

\echo '── behaviour checks'

DO $$
DECLARE
  v_child_a uuid; v_child_b uuid; v_fam_a uuid; v_fam_b uuid;
  v_user_1 uuid; v_user_2 uuid; v_user_3 uuid; v_item_b uuid;
  v_res jsonb; v_task uuid; v_before int; v_after int;
  v_count int; v_snapshot jsonb; v_legacy_task uuid;
  v_tasks_before int; v_ct_before int; v_ltg_before int;
BEGIN
  SELECT v INTO v_child_a FROM fixture WHERE k = 'child_a';
  SELECT v INTO v_child_b FROM fixture WHERE k = 'child_b';
  SELECT v INTO v_fam_a   FROM fixture WHERE k = 'fam_a';
  SELECT v INTO v_fam_b   FROM fixture WHERE k = 'fam_b';
  SELECT v INTO v_user_1  FROM fixture WHERE k = 'user_1';
  SELECT v INTO v_user_2  FROM fixture WHERE k = 'user_2';
  SELECT v INTO v_user_3  FROM fixture WHERE k = 'user_3';
  SELECT v INTO v_item_b  FROM fixture WHERE k = 'item_b';

  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', false);
  PERFORM set_config('test.uid', v_user_1::text, false);

  -- ══ 8-9. 授權基本 ═══════════════════════════════════════════════════════
  PERFORM set_config('test.uid', '', false);
  BEGIN
    PERFORM create_parent_task_v1(vcmd(
      v_child_a, v_fam_a, 'recurring', 'learning_skill', 'recurring', NULL,
      'record_only', 'ongoing', 'fixed_days', vplain('record_only')));
    RAISE EXCEPTION 'FAILED: 9. anon 應該被拒絕';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM vassert(true, '9. anon 建立被拒絕（42501）');
  END;

  PERFORM set_config('test.uid', v_user_1::text, false);

  -- ══ 12. 單次任務 ════════════════════════════════════════════════════════
  v_res := create_parent_task_v1(vcmd(
    v_child_a, v_fam_a, 'one_time', 'learning_skill', 'one_time', NULL,
    'record_only', 'complete_once', 'one_time', vplain('record_only')));
  PERFORM vassert(v_res ->> 'ok' = 'true', '12. 單次任務建立成功');
  v_task := (v_res ->> 'taskId')::uuid;
  PERFORM vassert(
    (SELECT claim_period FROM tasks WHERE id = v_task) = 'once',
    '12b. 單次任務 claim_period = once（不是 day + due_date 假裝的）');
  PERFORM vassert(
    (SELECT due_date FROM tasks WHERE id = v_task) IS NULL
    AND (SELECT scheduled_date FROM tasks WHERE id = v_task) IS NOT NULL,
    '12c. scheduled_date 沒有被寫進 due_date');

  -- ══ 13. 固定星期 ════════════════════════════════════════════════════════
  v_res := create_parent_task_v1(vcmd(
    v_child_a, v_fam_a, 'recurring', 'learning_skill', 'recurring', NULL,
    'coin_eligible', 'ongoing', 'fixed_days', vcoin(10, 5, 25)));
  PERFORM vassert(v_res ->> 'ok' = 'true', '13. 固定星期建立成功');
  v_task := (v_res ->> 'taskId')::uuid;
  PERFORM vassert(
    (SELECT recurrence_days FROM tasks WHERE id = v_task) = ARRAY[1,3,5],
    '13b. recurrence_days 寫入正確');
  PERFORM vassert(
    (SELECT reward_coin_amount FROM tasks WHERE id = v_task) = 10
    AND (SELECT base_time_min FROM tasks WHERE id = v_task) = 0,
    '13c. 幣值寫進 reward_coin_amount，base_time_min 仍為 0');

  -- ══ 20/34. 四種版本 ═════════════════════════════════════════════════════
  PERFORM vassert(
    (SELECT task_policy_version FROM tasks WHERE id = v_task) = 'task-taxonomy-2026-07'
    AND (SELECT reward_policy_version FROM tasks WHERE id = v_task) = 'coin-policy-1.0.0'
    AND (SELECT preset_catalog_version FROM tasks WHERE id = v_task) = '2026-07-28'
    AND (SELECT command_schema_version FROM tasks WHERE id = v_task) = 1,
    '20. tasks 保存四種版本，且任務政策與幣值政策不同值');

  SELECT snapshot INTO v_snapshot FROM task_change_events WHERE task_id = v_task;
  PERFORM vassert(
    v_snapshot -> 'versions' ->> 'commandSchemaVersion' = '1'
    AND v_snapshot -> 'versions' ->> 'presetCatalogVersion' = '2026-07-28'
    AND v_snapshot -> 'versions' ->> 'taskPolicyVersion' = 'task-taxonomy-2026-07'
    AND v_snapshot -> 'versions' ->> 'rewardPolicyVersion' = 'coin-policy-1.0.0',
    '34. audit snapshot 四種版本齊全');
  PERFORM vassert(
    v_snapshot -> 'reward' ->> 'finalAmount' = '10'
    AND v_snapshot -> 'reward' ->> 'suggestedAmount' = '10'
    AND v_snapshot -> 'reward' -> 'calculationBasis' ->> 'band' = '11-20',
    '19. task_change_events 保存定價依據');

  -- ══ 14. 每週次數 ════════════════════════════════════════════════════════
  v_res := create_parent_task_v1(vcmd(
    v_child_a, v_fam_a, 'recurring', 'learning_skill', 'recurring', NULL,
    'coin_eligible', 'ongoing', 'weekly_frequency', vcoin(10, 5, 25)));
  PERFORM vassert(v_res ->> 'ok' = 'true', '14. 每週次數建立成功');
  v_task := (v_res ->> 'taskId')::uuid;
  PERFORM vassert(
    (SELECT claim_period FROM tasks WHERE id = v_task) = 'week'
    AND (SELECT max_claims_per_period FROM tasks WHERE id = v_task) = 3
    AND (SELECT weekly_frequency FROM tasks WHERE id = v_task) = 3,
    '14b. 每週三次 → claim_period=week / max=3，次數沒有被丟掉');

  -- ══ 15. 成長計畫 ════════════════════════════════════════════════════════
  v_res := create_parent_task_v1(vlong(vcmd(
    v_child_a, v_fam_a, 'growth_plan', 'learning_skill', 'long_term', 'growth_plan',
    'coin_eligible', 'plan_complete', 'fixed_days', vcoin(15, 5, 25),
    jsonb_build_object('plan', jsonb_build_object(
      'durationDays', 28,
      'milestones', '[{"id":"m1","title":"第一週","targetDay":7},{"id":"m2","title":"第四週","targetDay":28}]'::jsonb,
      'supportSteps', '[]'::jsonb, 'focusOptionIds', '[]'::jsonb))),
    '2026-08-25', 28));
  PERFORM vassert(v_res ->> 'ok' = 'true', '15. 成長計畫建立成功');
  v_task := (v_res ->> 'taskId')::uuid;
  SELECT count(*) INTO v_count FROM task_plan_milestones WHERE task_id = v_task;
  PERFORM vassert(v_count = 2, '15b. 兩個里程碑寫進子表');
  PERFORM vassert(
    EXISTS (SELECT 1 FROM long_term_goals WHERE task_id = v_task AND goal_type = 'skill'),
    '15c. long_term_goals 一併建立');

  -- ══ 16. 短期支援 ════════════════════════════════════════════════════════
  v_res := create_parent_task_v1(vlong(vcmd(
    v_child_a, v_fam_a, 'short_support', 'life_routine', 'long_term', 'short_support',
    'progress_only', 'stabilize_and_exit', 'fixed_days', vplain('progress_only'),
    jsonb_build_object('plan', jsonb_build_object(
      'durationDays', 14, 'milestones', '[]'::jsonb,
      'supportSteps', '[{"id":"s1","text":"睡前放好書包"}]'::jsonb,
      'focusOptionIds', '[]'::jsonb))),
    '2026-08-11', 14));
  PERFORM vassert(v_res ->> 'ok' = 'true', '16. 短期支援建立成功');
  PERFORM vassert(
    (SELECT count(*) FROM task_plan_support_steps
      WHERE task_id = (v_res ->> 'taskId')::uuid) = 1,
    '16b. 支援步驟寫進子表');

  -- ══ 17. 家庭角色 ════════════════════════════════════════════════════════
  v_res := create_parent_task_v1(vlong(vcmd(
    v_child_a, v_fam_a, 'family_role', 'family_participation', 'long_term', 'family_role',
    'family_contribution', 'review_and_continue', 'fixed_days', vplain('family_contribution'),
    jsonb_build_object('role', jsonb_build_object(
      'optionId', 'plant',
      'responsibilities', '[{"id":"r1","text":"每天澆水","isCustom":false}]'::jsonb,
      'scopeDescription', '', 'exceptionDescription', '', 'contributionDescription', ''))),
    '2026-08-25', 28));
  PERFORM vassert(v_res ->> 'ok' = 'true', '17. 家庭角色建立成功');
  v_task := (v_res ->> 'taskId')::uuid;
  PERFORM vassert(
    (SELECT count(*) FROM task_role_responsibilities WHERE task_id = v_task) = 1,
    '17b. 負責內容寫進子表');
  PERFORM vassert(
    (SELECT reward_coin_amount FROM tasks WHERE id = v_task) IS NULL
    AND (SELECT reward_policy_version FROM tasks WHERE id = v_task) = 'reward-eligibility-2026-07',
    '17c. 不發幣的任務沒有幣值，且版本是資格政策而非幣值政策');

  -- ══ 10-11 / 政策拒絕 ════════════════════════════════════════════════════
  SELECT count(*) INTO v_tasks_before FROM tasks;
  SELECT count(*) INTO v_ct_before    FROM child_tasks;
  SELECT count(*) INTO v_ltg_before   FROM long_term_goals;

  v_res := create_parent_task_v1(vcmd(
    v_child_a, v_fam_a, 'recurring', 'learning_skill', 'recurring', NULL,
    'time_saving_eligible', 'ongoing', 'fixed_days', vplain('time_saving_eligible')));
  PERFORM vassert(v_res ->> 'code' = 'POLICY_REJECTED', '26. 時間儲蓄建立被拒絕');

  v_res := create_parent_task_v1(vcmd(
    v_child_a, v_fam_a, 'recurring', 'learning_skill', 'recurring', NULL,
    'coin_eligible', 'ongoing', 'fixed_days', vcoin(0, 5, 25)));
  PERFORM vassert(v_res ->> 'code' = 'POLICY_REJECTED', '0 幣被拒絕');

  v_res := create_parent_task_v1(vcmd(
    v_child_a, v_fam_a, 'recurring', 'learning_skill', 'recurring', NULL,
    'coin_eligible', 'ongoing', 'fixed_days', vcoin(999, 5, 25)));
  PERFORM vassert(v_res ->> 'code' = 'POLICY_REJECTED', '25. 超出 min/max 被拒絕');

  v_res := create_parent_task_v1(vcmd(
    v_child_a, v_fam_a, 'recurring', 'learning_skill', 'recurring', NULL,
    'coin_eligible', 'ongoing', 'fixed_days', vplain('record_only')));
  PERFORM vassert(v_res ->> 'code' = 'POLICY_REJECTED', '決策與命令不一致被拒絕');

  v_res := create_parent_task_v1(vcmd(
    v_child_a, v_fam_a, 'recurring', 'learning_skill', 'recurring', NULL,
    'coin_eligible', 'ongoing', 'fixed_days', vcoin(10, 5, 25, '')));
  PERFORM vassert(v_res ->> 'code' = 'VALIDATION_FAILED', '缺 rewardPolicyVersion 被拒絕');

  v_res := create_parent_task_v1(
    (vcmd(v_child_a, v_fam_a, 'recurring', 'learning_skill', 'recurring', NULL,
          'coin_eligible', 'ongoing', 'fixed_days', vcoin(10, 5, 25)))
    #- '{metadata,taskPolicyVersion}');
  PERFORM vassert(v_res ->> 'code' = 'VALIDATION_FAILED', '缺 taskPolicyVersion 被拒絕');

  v_res := create_parent_task_v1(vcmd(
    v_child_a, v_fam_a, 'recurring', 'family_participation', 'recurring', NULL,
    'coin_eligible', 'ongoing', 'fixed_days', vcoin(10, 5, 25)));
  PERFORM vassert(v_res ->> 'code' = 'POLICY_REJECTED', '家庭參與不可發幣');

  -- 11. command.familyId 與孩子不符
  BEGIN
    PERFORM create_parent_task_v1(vcmd(
      v_child_a, v_fam_b, 'recurring', 'learning_skill', 'recurring', NULL,
      'record_only', 'ongoing', 'fixed_days', vplain('record_only')));
    RAISE EXCEPTION 'FAILED: 11. familyId 不符應該被拒絕';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM vassert(true, '11. command.familyId 與孩子不符被拒絕');
  END;

  -- 33. 被拒絕的建立完全沒有留下任何列
  PERFORM vassert(
    (SELECT count(*) FROM tasks) = v_tasks_before
    AND (SELECT count(*) FROM child_tasks) = v_ct_before
    AND (SELECT count(*) FROM long_term_goals) = v_ltg_before,
    '33. 政策拒絕沒有留下孤兒 task / child_tasks / long_term_goals');

  -- ══ 18. 子表失敗 → 整個 transaction rollback ════════════════════════════
  -- 同一個選項組送兩次相同的 option，違反 task_preset_selections 的 unique。
  -- 它發生在 tasks / child_tasks / long_term_goals 都已經 insert 之後。
  SELECT count(*) INTO v_tasks_before FROM tasks;
  SELECT count(*) INTO v_ct_before    FROM child_tasks;
  BEGIN
    PERFORM create_parent_task_v1(jsonb_set(
      vcmd(v_child_a, v_fam_a, 'recurring', 'learning_skill', 'recurring', NULL,
           'record_only', 'ongoing', 'fixed_days', vplain('record_only')),
      '{content,selectedOptions,reading_method}', '["alone","alone"]'::jsonb));
    RAISE EXCEPTION 'FAILED: 18. 子表 unique 違反應該讓整筆失敗';
  EXCEPTION WHEN unique_violation THEN
    PERFORM vassert(true, '18. 子表失敗時拋出例外');
  END;
  PERFORM vassert(
    (SELECT count(*) FROM tasks) = v_tasks_before
    AND (SELECT count(*) FROM child_tasks) = v_ct_before,
    '18b. 子表失敗後 tasks 與 child_tasks 一起回滾，沒有孤兒');

  -- ══ 10 / 30-31. 跨家庭與多家長 ══════════════════════════════════════════
  PERFORM set_config('test.uid', v_user_3::text, false);  -- 只屬於家庭 B
  BEGIN
    PERFORM create_parent_task_v1(vcmd(
      v_child_a, v_fam_a, 'recurring', 'learning_skill', 'recurring', NULL,
      'record_only', 'ongoing', 'fixed_days', vplain('record_only')));
    RAISE EXCEPTION 'FAILED: 10. 跨家庭建立應該被拒絕';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM vassert(true, '10. 跨家庭建立被拒絕');
  END;

  PERFORM set_config('test.uid', v_user_1::text, false);
  v_res := create_parent_task_v1(vcmd(
    v_child_b, v_fam_b, 'recurring', 'learning_skill', 'recurring', NULL,
    'record_only', 'ongoing', 'fixed_days', vplain('record_only')));
  PERFORM vassert(
    v_res ->> 'ok' = 'true'
    AND (SELECT family_id FROM tasks WHERE id = (v_res ->> 'taskId')::uuid) = v_fam_b,
    '30. 同 user 多 family：寫進正確的家庭');

  PERFORM set_config('test.uid', v_user_2::text, false);
  v_res := create_parent_task_v1(vcmd(
    v_child_a, v_fam_a, 'recurring', 'learning_skill', 'recurring', NULL,
    'record_only', 'ongoing', 'fixed_days', vplain('record_only')));
  PERFORM vassert(v_res ->> 'ok' = 'true', '31. 同 family 第二位家長可操作');

  -- ══ 21-25. 完成 ═════════════════════════════════════════════════════════
  PERFORM set_config('test.uid', v_user_1::text, false);

  -- 24-25. coin_eligible
  SELECT id INTO v_task FROM tasks
  WHERE reward_policy = 'coin_eligible' AND reward_coin_amount = 10
    AND family_id = v_fam_a AND claim_period = 'day' LIMIT 1;
  SELECT balance INTO v_before FROM wallets WHERE child_id = v_child_a;
  v_res := complete_task(v_task, v_child_a, now(), true);
  SELECT balance INTO v_after FROM wallets WHERE child_id = v_child_a;
  PERFORM vassert((v_res ->> 'coinEarned')::int = 10 AND v_after - v_before = 10,
    '24. coin_eligible 完成發 10 幣，錢包實際增加');
  PERFORM vassert(
    (SELECT reward_coin_amount BETWEEN reward_coin_min AND reward_coin_max
       FROM tasks WHERE id = v_task),
    '25. 發出的金額落在政策 min/max 之間');

  -- 21. family_contribution
  SELECT id INTO v_task FROM tasks
  WHERE reward_policy = 'family_contribution' AND family_id = v_fam_a LIMIT 1;
  SELECT balance INTO v_before FROM wallets WHERE child_id = v_child_a;
  v_res := complete_task(v_task, v_child_a, now(), true);
  SELECT balance INTO v_after FROM wallets WHERE child_id = v_child_a;
  PERFORM vassert((v_res ->> 'coinEarned')::int = 0 AND v_after = v_before,
    '21. family_contribution 完成 0 幣');
  PERFORM vassert((SELECT count(*) FROM time_savings WHERE child_id = v_child_a) = 0,
    '21b. 新任務不寫 time_savings');

  -- 22. record_only
  SELECT id INTO v_task FROM tasks
  WHERE reward_policy = 'record_only' AND family_id = v_fam_a
    AND claim_period = 'day' LIMIT 1;
  v_res := complete_task(v_task, v_child_a, now(), true);
  PERFORM vassert((v_res ->> 'coinEarned')::int = 0, '22. record_only 完成 0 幣');

  -- 23. progress_only
  SELECT id INTO v_task FROM tasks
  WHERE reward_policy = 'progress_only' AND family_id = v_fam_a LIMIT 1;
  v_res := complete_task(v_task, v_child_a, now(), true);
  PERFORM vassert((v_res ->> 'coinEarned')::int = 0, '23. progress_only 完成 0 幣');

  -- 26b. time_saving 完成被拒絕（直接造一筆，因為建立端擋得死）
  INSERT INTO tasks (family_id, name, category, day_type, reward_policy,
                     task_policy_version, reward_policy_version)
  VALUES (v_fam_a, '時間儲蓄任務', 'D', 'both', 'time_saving_eligible',
          'task-taxonomy-2026-07', 'reward-eligibility-2026-07')
  RETURNING id INTO v_task;
  INSERT INTO child_tasks (child_id, task_id) VALUES (v_child_a, v_task);
  v_res := complete_task(v_task, v_child_a, now(), true);
  PERFORM vassert(v_res ->> 'error' = 'time_saving_not_enabled',
    '26b. time_saving 完成被拒絕，不降級成 coin 或 record_only');

  -- ══ 27-28. legacy ═══════════════════════════════════════════════════════
  INSERT INTO tasks (family_id, name, category, day_type, base_time_min, difficulty)
  VALUES (v_fam_a, '舊任務', 'D', 'both', 20, 1) RETURNING id INTO v_legacy_task;
  INSERT INTO child_tasks (child_id, task_id) VALUES (v_child_a, v_legacy_task);
  v_res := complete_task(v_legacy_task, v_child_a, now(), true);
  PERFORM vassert((v_res ->> 'coinEarned')::int = 20,
    '27. legacy 任務仍走 base_time_min × difficulty');

  INSERT INTO tasks (family_id, name, category, day_type, base_time_min, difficulty)
  VALUES (v_fam_a, '舊任務 2', 'D', 'both', 20, 1) RETURNING id INTO v_task;
  INSERT INTO child_tasks (child_id, task_id) VALUES (v_child_a, v_task);
  v_res := complete_task(v_task, v_child_a, now(), false);
  PERFORM vassert((v_res ->> 'coinEarned')::int = 14,
    '28. legacy 前置未完成仍打 0.7（20 → 14）');

  -- ══ 完成端授權 ══════════════════════════════════════════════════════════
  PERFORM set_config('test.uid', v_user_3::text, false);
  BEGIN
    PERFORM complete_task(v_legacy_task, v_child_a, now(), true);
    RAISE EXCEPTION 'FAILED: 跨家庭完成應該被拒絕';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM vassert(true, '跨家庭完成被拒絕');
  END;

  PERFORM set_config('test.uid', v_user_1::text, false);
  BEGIN
    PERFORM complete_task(v_legacy_task, v_child_b, now(), true);
    RAISE EXCEPTION 'FAILED: 任務與孩子不同家庭應該被拒絕';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM vassert(true, '任務與孩子不同家庭被拒絕');
  END;

  PERFORM set_config('test.uid', '', false);
  BEGIN
    PERFORM complete_task(v_legacy_task, v_child_a, now(), true);
    RAISE EXCEPTION 'FAILED: anon 完成應該被拒絕';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM vassert(true, 'anon 完成被拒絕');
  END;

  -- ══ 29. override 夾制 ═══════════════════════════════════════════════════
  PERFORM set_config('test.uid', v_user_1::text, false);
  SELECT id INTO v_task FROM tasks
  WHERE reward_policy = 'coin_eligible' AND reward_coin_max = 25
    AND family_id = v_fam_a LIMIT 1;
  v_res := mark_task_atomic(v_task, v_child_a, 'partial', 9999);
  PERFORM vassert((v_res ->> 'coinEarned')::int = 25,
    'override 被政策上限夾住（9999 → 25）');

  SELECT id INTO v_task FROM tasks
  WHERE reward_policy = 'family_contribution' AND family_id = v_fam_a LIMIT 1;
  SELECT balance INTO v_before FROM wallets WHERE child_id = v_child_a;
  v_res := mark_task_atomic(v_task, v_child_a, 'partial', 50);
  SELECT balance INTO v_after FROM wallets WHERE child_id = v_child_a;
  PERFORM vassert((v_res ->> 'coinEarned')::int = 0 AND v_after = v_before,
    '29. 家庭參與無法用 override 補幣');

  -- 舊任務不受夾制
  v_res := mark_task_atomic(v_legacy_task, v_child_a, 'partial', 7);
  PERFORM vassert((v_res ->> 'coinEarned')::int = 7, 'legacy 任務的 override 行為不變');

  -- ══ 32. redeem_wish 不可跨 family ═══════════════════════════════════════
  BEGIN
    PERFORM redeem_wish(v_child_a, v_item_b, 10);
    RAISE EXCEPTION 'FAILED: 32. 跨家庭兌換應該被拒絕';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM vassert(true, '32. 拿別人家的獎勵兌換自己的錢包被拒絕');
  END;

  PERFORM set_config('test.uid', v_user_3::text, false);
  BEGIN
    PERFORM redeem_wish(v_child_a, v_item_b, 10);
    RAISE EXCEPTION 'FAILED: 32b. 跨家庭孩子兌換應該被拒絕';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM vassert(true, '32b. 對別人家的孩子兌換被拒絕');
  END;

  -- ══ 33b. 最終盤點：沒有孤兒 ═════════════════════════════════════════════
  PERFORM vassert(
    NOT EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.created_from_preset
        AND NOT EXISTS (SELECT 1 FROM child_tasks ct WHERE ct.task_id = t.id)
    ),
    '33b. 每一筆 preset 任務都有 child_tasks');
  PERFORM vassert(
    NOT EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.created_from_preset AND t.duration_type = 'long_term'
        AND NOT EXISTS (SELECT 1 FROM long_term_goals g WHERE g.task_id = t.id)
    ),
    '33c. 每一筆長期任務都有 long_term_goals');
  PERFORM vassert(
    NOT EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.created_from_preset
        AND NOT EXISTS (SELECT 1 FROM task_change_events e WHERE e.task_id = t.id)
    ),
    '19b. 每一筆 preset 任務都有稽核事件');

  RAISE NOTICE '';
  RAISE NOTICE 'ALL CHECKS PASSED';
END $$;
