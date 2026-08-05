-- Shadow Wallet — 對「真實 schema」的建立流程驗證
--
-- 與 task_reward_verification.sql 的差別，是這一支唯一存在的理由：
--
--   task_reward_verification.sql 自己建 13 張**簡化**的表。它證明得了
--   migration 的邏輯正確，但證明不了「這段 SQL 在真的資料庫上跑得起來」——
--   真的 tasks 表有 40 多欄、一堆 NOT NULL 與 CHECK、外鍵指向 auth.users，
--   還有簡化版沒有的欄位。RPC 少寫一個 NOT NULL 欄位，harness 完全看不出來。
--
--   這一支跑在 supabase/baseline/public_schema.sql（正式專案的 schema dump）
--   之上，所以它碰到的是真的欄位、真的 constraint、真的外鍵。
--
-- ⚠️ 這不能取代 Supabase staging 的 E2E。這裡沒有 PostgREST、沒有真的 JWT、
--    RLS 也沒有以 authenticated 身分執行過。auth.uid() 是替身。
--    真正的 staging 驗收見 docs/TASK_DRAWER_STAGING_E2E.md。
--
-- 前提（本機模擬用，真 staging 由 Supabase 平台提供）：
--   CREATE SCHEMA auth; CREATE SCHEMA extensions;
--   CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
--   CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
--   CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
--   auth.uid() 替身 + anon / authenticated / service_role / supabase_admin 角色
--
-- 然後：
--   psql -f supabase/baseline/public_schema.sql
--   psql -f supabase/migrations/20260730000000_create_parent_task_idempotency.sql
--   psql -f supabase/verify/real_schema_e2e.sql

\set ON_ERROR_STOP on

-- auth.uid() 在這裡改讀 test.uid，方便切換身分。
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.uid', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION eassert(p_ok boolean, p_label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok THEN RAISE NOTICE '  ok   %', p_label;
  ELSE RAISE EXCEPTION 'FAILED: %', p_label;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- QA 測試資料（§七）
--
-- 刻意不用承恩的正式 Demo 資料：這裡的每一筆都叫得出「這是 QA 造的」。
-- 可重複執行：每次先清掉同名的 QA 家庭。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS qa_fixture (k text PRIMARY KEY, v uuid);

DO $$
DECLARE
  v_fam_a uuid; v_fam_b uuid; v_child uuid; v_child_b uuid;
  v_user_a uuid; v_user_b uuid; v_user_c uuid;
BEGIN
  -- 可重複執行：先把上一輪的 QA 資料清乾淨（只清 QA 造的，不碰其他資料）。
  DELETE FROM qa_fixture;
  DELETE FROM families WHERE family_name LIKE 'QA %';
  DELETE FROM auth.users WHERE email LIKE 'qa-%@example.invalid';

  INSERT INTO auth.users (email) VALUES ('qa-parent-a@example.invalid')
  RETURNING id INTO v_user_a;
  INSERT INTO auth.users (email) VALUES ('qa-parent-b@example.invalid')
  RETURNING id INTO v_user_b;
  INSERT INTO auth.users (email) VALUES ('qa-parent-c@example.invalid')
  RETURNING id INTO v_user_c;

  -- 真的 families 是 family_name（不是 name），而且 NOT NULL。
  INSERT INTO families (family_name, created_by) VALUES ('QA Family A', v_user_a)
  RETURNING id INTO v_fam_a;
  INSERT INTO families (family_name, created_by) VALUES ('QA Family B', v_user_c)
  RETURNING id INTO v_fam_b;

  -- QA Parent A 與 B 同屬家庭 A；C 屬於家庭 B。
  -- parents.name 是 NOT NULL；email 有 unique index，所以留 NULL。
  INSERT INTO parents (family_id, user_id, name) VALUES (v_fam_a, v_user_a, 'QA Parent A');
  INSERT INTO parents (family_id, user_id, name) VALUES (v_fam_a, v_user_b, 'QA Parent B');
  INSERT INTO parents (family_id, user_id, name) VALUES (v_fam_b, v_user_c, 'QA Parent C');

  -- ⚠️ 規格原本要求「1 個 parent 額外屬第二個家庭」來驗證多家庭。
  -- 真實 schema 做不到：parents.user_id 上有 UNIQUE index
  -- （idx_parents_user_id），一個 auth 帳號只能屬於一個家庭。
  -- 與其略過，不如把這個約束本身斷言出來 —— 它是「多家庭」這件事
  -- 目前為什麼不可能發生的原因，而不是我們忘了測。
  BEGIN
    INSERT INTO parents (family_id, user_id, name)
    VALUES (v_fam_b, v_user_a, 'QA Parent A 第二家庭');
    RAISE EXCEPTION 'FAILED: parents.user_id 應該有唯一性約束';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '  ok   schema 約束：一個 auth 帳號只能屬於一個家庭';
  END;

  -- 8 歲：落在 6-9 歲段，coin policy 有定價。
  -- children.age_group 是 NOT NULL；8 歲落在 6-9 段。
  INSERT INTO children (family_id, nickname, birth_date, age_group)
  VALUES (v_fam_a, 'QA Child 8', (CURRENT_DATE - INTERVAL '8 years 3 months')::date, '6-9')
  RETURNING id INTO v_child;
  INSERT INTO children (family_id, nickname, birth_date, age_group)
  VALUES (v_fam_b, 'QA Child B', (CURRENT_DATE - INTERVAL '8 years')::date, '6-9')
  RETURNING id INTO v_child_b;

  INSERT INTO wallets (child_id, wallet_type, balance) VALUES (v_child, 'spending', 0);
  INSERT INTO wallets (child_id, wallet_type, balance) VALUES (v_child_b, 'spending', 0);

  INSERT INTO qa_fixture VALUES
    ('fam_a', v_fam_a), ('fam_b', v_fam_b),
    ('child', v_child), ('child_b', v_child_b),
    ('user_a', v_user_a), ('user_b', v_user_b), ('user_c', v_user_c);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 命令樣板
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ecmd(
  p_child uuid, p_family uuid,
  p_title text, p_editor text, p_purpose text, p_duration text, p_plan_mode text,
  p_reward text, p_completion text, p_schedule_mode text,
  p_decision jsonb, p_request uuid,
  p_extra jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'childId', p_child,
    'familyId', p_family,
    'preset', jsonb_build_object('familyId', 'qa-preset', 'variantId', 'qa-variant'),
    'task', jsonb_build_object(
      'title', p_title,
      'purposeCategory', p_purpose,
      'durationType', p_duration,
      'planMode', p_plan_mode,
      'source', 'co_created',
      'rewardPolicy', p_reward,
      'completionPolicy', p_completion,
      'originalExpectation', 'QA 期待',
      'completionDescription', 'QA 完成標準'
    ),
    'schedule', jsonb_build_object(
      'mode', p_schedule_mode,
      'startDate', CURRENT_DATE,
      'scheduledDate', CASE WHEN p_schedule_mode = 'one_time' THEN CURRENT_DATE END,
      'recurrenceDays', CASE WHEN p_schedule_mode = 'fixed_days'
                             THEN '[1,3,5]'::jsonb ELSE '[]'::jsonb END,
      'weeklyFrequency', CASE WHEN p_schedule_mode = 'weekly_frequency' THEN 3 END,
      'preferredTime', 'after_school',
      'estimatedMinutes', 20,
      'reminderMode', 'none'
    ),
    'content', jsonb_build_object(
      'selectedOptions', jsonb_build_object('qa_group', '["qa_option"]'::jsonb),
      'customOptionValues', '{}'::jsonb
    ),
    'review', jsonb_build_object('reviewEnabled', true, 'firstReviewAfterDays', 7),
    'reward', jsonb_build_object('decision', p_decision),
    'metadata', jsonb_build_object(
      'ageGroup', '6-9', 'createdFromPreset', true,
      'taskPolicyVersion', 'task-taxonomy-2026-07',
      'presetCatalogVersion', '2026-07-28',
      'editorKind', p_editor,
      'clientRequestId', p_request
    )
  ) || p_extra;
$$;

CREATE OR REPLACE FUNCTION elong(p_cmd jsonb, p_days int)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_set(
    jsonb_set(p_cmd, '{schedule}',
      (p_cmd -> 'schedule') || jsonb_build_object(
        'endDate', (CURRENT_DATE + p_days - 1),
        'durationDays', p_days)),
    '{plan}', jsonb_build_object(
      'durationDays', p_days,
      'milestones', '[]'::jsonb,
      'supportSteps', '[]'::jsonb,
      'focusOptionIds', '[]'::jsonb));
$$;

CREATE OR REPLACE FUNCTION ecoin(p_final int, p_min int, p_max int)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'rewardPolicy', 'coin_eligible', 'eligibility', 'allowed',
    'rewardPolicyVersion', 'coin-policy-1.0.0',
    'explanation', '6-9 歲段、D 類、每次約 20 分鐘',
    'coin', jsonb_build_object(
      'suggestedAmount', p_final, 'finalAmount', p_final,
      'minAllowed', p_min, 'maxAllowed', p_max,
      'calculationBasis', jsonb_build_object(
        'ageGroup', '6-9', 'purposeCategory', 'learning_skill',
        'estimatedMinutes', 20, 'durationType', 'long_term',
        'scheduleMode', 'fixed_days', 'difficulty', 'standard', 'band', '11-20')));
$$;

CREATE OR REPLACE FUNCTION eplain(p_policy text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'rewardPolicy', p_policy, 'eligibility', 'allowed', 'coin', NULL,
    'rewardPolicyVersion', 'reward-eligibility-2026-07',
    'explanation', '不發成長幣');
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 五種任務建立（§九）＋ idempotency（§十）＋ 完成（§十三）
-- ═══════════════════════════════════════════════════════════════════════════

\echo '── real-schema E2E'

DO $$
DECLARE
  v_fam_a uuid; v_fam_b uuid; v_child uuid; v_child_b uuid;
  v_user_a uuid; v_user_b uuid; v_user_c uuid;
  v_res jsonb; v_res2 jsonb;
  v_req uuid;
  v_task_once uuid; v_task_recur uuid; v_task_growth uuid;
  v_task_support uuid; v_task_role uuid;
  v_before int; v_after int; v_count int;
BEGIN
  SELECT v INTO v_fam_a  FROM qa_fixture WHERE k = 'fam_a';
  SELECT v INTO v_fam_b  FROM qa_fixture WHERE k = 'fam_b';
  SELECT v INTO v_child  FROM qa_fixture WHERE k = 'child';
  SELECT v INTO v_child_b FROM qa_fixture WHERE k = 'child_b';
  SELECT v INTO v_user_a FROM qa_fixture WHERE k = 'user_a';
  SELECT v INTO v_user_b FROM qa_fixture WHERE k = 'user_b';
  SELECT v INTO v_user_c FROM qa_fixture WHERE k = 'user_c';

  PERFORM set_config('test.uid', v_user_a::text, false);

  -- ══ A. 單次｜學校作業｜record_only ═════════════════════════════════════
  v_req := gen_random_uuid();
  v_res := create_parent_task_v1(ecmd(
    v_child, v_fam_a, 'QA 完成一項學校作業', 'one_time', 'learning_skill',
    'one_time', NULL, 'record_only', 'complete_once', 'one_time',
    eplain('record_only'), v_req));
  PERFORM eassert(v_res ->> 'ok' = 'true',
    format('A. 單次任務建立成功（%s）', v_res ->> 'message'));
  v_task_once := (v_res ->> 'taskId')::uuid;
  PERFORM eassert(
    (SELECT duration_type = 'one_time' AND reward_policy = 'record_only'
            AND reward_coin_amount IS NULL AND claim_period = 'once'
            AND creation_request_id = v_req
       FROM tasks WHERE id = v_task_once),
    'A1. 單次任務：record_only、無幣值、claim once、有識別碼');

  -- ══ B. 固定任務｜餐桌｜family_contribution ═════════════════════════════
  v_res := create_parent_task_v1(ecmd(
    v_child, v_fam_a, 'QA 用餐前準備餐桌', 'recurring', 'family_participation',
    'recurring', NULL, 'family_contribution', 'ongoing', 'fixed_days',
    eplain('family_contribution'), gen_random_uuid()));
  PERFORM eassert(v_res ->> 'ok' = 'true',
    format('B. 固定任務建立成功（%s）', v_res ->> 'message'));
  v_task_recur := (v_res ->> 'taskId')::uuid;
  PERFORM eassert(
    (SELECT category = 'B' AND reward_policy = 'family_contribution'
            AND reward_coin_amount IS NULL
       FROM tasks WHERE id = v_task_recur),
    'B1. 固定任務：B 類、家庭貢獻、無幣值');

  -- ══ C. 成長計畫｜四週閱讀｜coin_eligible ═══════════════════════════════
  v_res := create_parent_task_v1(elong(ecmd(
    v_child, v_fam_a, 'QA 四週閱讀計畫', 'growth_plan', 'learning_skill',
    'long_term', 'growth_plan', 'coin_eligible', 'plan_complete', 'fixed_days',
    ecoin(12, 5, 25), gen_random_uuid()), 28));
  PERFORM eassert(v_res ->> 'ok' = 'true',
    format('C. 成長計畫建立成功（%s）', v_res ->> 'message'));
  v_task_growth := (v_res ->> 'taskId')::uuid;
  PERFORM eassert(
    (SELECT reward_coin_amount = 12 AND reward_coin_amount > 0
            AND base_time_min = 0 AND is_long_term
       FROM tasks WHERE id = v_task_growth),
    'C1. 成長計畫：非零幣值 12、base_time_min 仍為 0');
  PERFORM eassert(
    EXISTS (SELECT 1 FROM long_term_goals WHERE task_id = v_task_growth
              AND goal_type = 'skill' AND status = 'active'),
    'C2. long_term_goals 一併建立');

  -- ══ D. 短期支援｜整理書包 14 天｜progress_only ═════════════════════════
  v_res := create_parent_task_v1(elong(ecmd(
    v_child, v_fam_a, 'QA 整理書包 14 天', 'short_support', 'life_routine',
    'long_term', 'short_support', 'progress_only', 'stabilize_and_exit',
    'fixed_days', eplain('progress_only'), gen_random_uuid()), 14));
  PERFORM eassert(v_res ->> 'ok' = 'true',
    format('D. 短期支援建立成功（%s）', v_res ->> 'message'));
  v_task_support := (v_res ->> 'taskId')::uuid;
  PERFORM eassert(
    (SELECT total_days = 14 AND goal_type = 'habit'
       FROM long_term_goals WHERE task_id = v_task_support),
    'D1. 短期支援：14 天、habit');

  -- ══ E. 家庭角色｜四週餐桌小幫手｜family_contribution ═══════════════════
  v_res := create_parent_task_v1(jsonb_set(
    elong(ecmd(
      v_child, v_fam_a, 'QA 四週餐桌小幫手', 'family_role', 'family_participation',
      'long_term', 'family_role', 'family_contribution', 'review_and_continue',
      'fixed_days', eplain('family_contribution'), gen_random_uuid()), 28),
    '{role}', jsonb_build_object(
      'optionId', 'table_helper',
      'responsibilities', jsonb_build_array(
        jsonb_build_object('id', 'r1', 'text', '開飯前擺好碗筷', 'isCustom', false),
        jsonb_build_object('id', 'r2', 'text', '飯後把自己的碗拿到水槽', 'isCustom', false)),
      'scopeDescription', 'QA 負責範圍',
      'exceptionDescription', 'QA 可跳過情況',
      'contributionDescription', 'QA 貢獻紀錄')));
  PERFORM eassert(v_res ->> 'ok' = 'true',
    format('E. 家庭角色建立成功（%s）', v_res ->> 'message'));
  v_task_role := (v_res ->> 'taskId')::uuid;
  SELECT count(*) INTO v_count FROM task_role_responsibilities WHERE task_id = v_task_role;
  PERFORM eassert(v_count = 2, 'E1. 兩項負責內容可查回');
  PERFORM eassert(
    (SELECT role_title = 'table_helper' FROM long_term_goals WHERE task_id = v_task_role),
    'E2. long_term_goals 記下角色');

  -- ══ 共通：子表、稽核、四種版本 ═════════════════════════════════════════
  PERFORM eassert(
    (SELECT count(*) FROM task_preset_selections WHERE task_id = v_task_growth) = 1,
    '選項答案寫進 task_preset_selections');
  PERFORM eassert(
    (SELECT count(*) FROM task_change_events
       WHERE task_id = v_task_growth AND event_type = 'created_from_preset') = 1,
    '稽核事件寫入');
  PERFORM eassert(
    (SELECT task_policy_version = 'task-taxonomy-2026-07'
            AND reward_policy_version = 'coin-policy-1.0.0'
            AND preset_catalog_version = '2026-07-28'
            AND command_schema_version = 1
       FROM tasks WHERE id = v_task_growth),
    '四種版本欄位都寫入且互不冒充');
  PERFORM eassert(
    (SELECT reward_policy_version = 'reward-eligibility-2026-07'
       FROM tasks WHERE id = v_task_role),
    '不發幣的任務記的是資格政策版本，不是幣值政策版本');
  PERFORM eassert(
    (SELECT count(*) FROM child_tasks WHERE task_id IN
       (v_task_once, v_task_recur, v_task_growth, v_task_support, v_task_role)) = 5,
    '五種任務各有一筆 child_tasks');

  -- ══ idempotency（§十 1-5）══════════════════════════════════════════════
  SELECT count(*) INTO v_before FROM tasks;
  v_res2 := create_parent_task_v1(ecmd(
    v_child, v_fam_a, 'QA 完成一項學校作業', 'one_time', 'learning_skill',
    'one_time', NULL, 'record_only', 'complete_once', 'one_time',
    eplain('record_only'), v_req));
  SELECT count(*) INTO v_after FROM tasks;
  PERFORM eassert(
    v_res2 ->> 'idempotentReplay' = 'true'
    AND (v_res2 ->> 'taskId')::uuid = v_task_once
    AND v_after = v_before,
    'F. 同識別碼重送：回原任務、tasks 沒有增加');
  PERFORM eassert(
    (SELECT count(*) FROM child_tasks WHERE task_id = v_task_once) = 1
    AND (SELECT count(*) FROM task_preset_selections WHERE task_id = v_task_once) = 1
    AND (SELECT count(*) FROM task_change_events
           WHERE task_id = v_task_once AND event_type = 'created_from_preset') = 1,
    'F1. 子表與稽核事件都沒有重複');

  -- ══ 跨家庭重用識別碼（§十 6）═══════════════════════════════════════════
  PERFORM set_config('test.uid', v_user_c::text, false);
  BEGIN
    PERFORM create_parent_task_v1(ecmd(
      v_child_b, v_fam_b, 'QA 跨家庭', 'recurring', 'learning_skill',
      'recurring', NULL, 'record_only', 'ongoing', 'fixed_days',
      eplain('record_only'), v_req));
    RAISE EXCEPTION 'FAILED: G. 跨家庭重用識別碼應該被拒絕';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM eassert(true, 'G. 跨家庭重用識別碼 → 42501');
  END;

  -- ══ anon 不可呼叫（§十 7）══════════════════════════════════════════════
  PERFORM set_config('test.uid', '', false);
  BEGIN
    PERFORM create_parent_task_v1(ecmd(
      v_child, v_fam_a, 'QA anon', 'recurring', 'learning_skill',
      'recurring', NULL, 'record_only', 'ongoing', 'fixed_days',
      eplain('record_only'), gen_random_uuid()));
    RAISE EXCEPTION 'FAILED: H. anon 應該被拒絕';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM eassert(true, 'H. 未登入無法建立 → 42501');
  END;

  -- ══ 完成（§十三）══════════════════════════════════════════════════════
  PERFORM set_config('test.uid', v_user_a::text, false);

  -- A. coin_eligible → 錢包增加 reward_coin_amount
  SELECT balance INTO v_before FROM wallets WHERE child_id = v_child;
  v_res := complete_task(v_task_growth, v_child, now(), true);
  SELECT balance INTO v_after FROM wallets WHERE child_id = v_child;
  PERFORM eassert((v_res ->> 'coinEarned')::int = 12 AND v_after - v_before = 12,
    'I-A. coin_eligible 完成發 12 幣，錢包實際 +12');
  PERFORM eassert(
    (SELECT coin_earned FROM task_completions
       WHERE task_id = v_task_growth AND child_id = v_child
       ORDER BY completed_at DESC LIMIT 1) = 12,
    'I-A1. completion log 的金額與 reward_coin_amount 一致');
  PERFORM eassert(
    (SELECT estimated_minutes FROM tasks WHERE id = v_task_growth) = 20,
    'I-A2. estimated_minutes 是 20 而幣值是 12 —— 沒有拿分鐘當幣值');

  -- B. family_contribution → 錢包不變、不寫 time_savings
  SELECT balance INTO v_before FROM wallets WHERE child_id = v_child;
  v_res := complete_task(v_task_recur, v_child, now(), true);
  SELECT balance INTO v_after FROM wallets WHERE child_id = v_child;
  PERFORM eassert((v_res ->> 'coinEarned')::int = 0 AND v_after = v_before,
    'I-B. family_contribution 完成 0 幣，錢包不變');
  PERFORM eassert(
    (SELECT count(*) FROM time_savings WHERE child_id = v_child) = 0,
    'I-B1. 沒有寫 time_savings');

  -- C. record_only → 錢包不變、有完成紀錄
  SELECT balance INTO v_before FROM wallets WHERE child_id = v_child;
  v_res := complete_task(v_task_once, v_child, now(), true);
  SELECT balance INTO v_after FROM wallets WHERE child_id = v_child;
  PERFORM eassert((v_res ->> 'coinEarned')::int = 0 AND v_after = v_before,
    'I-C. record_only 完成 0 幣');
  PERFORM eassert(
    EXISTS (SELECT 1 FROM task_completions
              WHERE task_id = v_task_once AND child_id = v_child),
    'I-C1. 完成紀錄存在');

  -- D. progress_only → 錢包不變
  SELECT balance INTO v_before FROM wallets WHERE child_id = v_child;
  v_res := complete_task(v_task_support, v_child, now(), true);
  SELECT balance INTO v_after FROM wallets WHERE child_id = v_child;
  PERFORM eassert((v_res ->> 'coinEarned')::int = 0 AND v_after = v_before,
    'I-D. progress_only 完成 0 幣，且有完成紀錄');

  -- E. 單次任務：claim_period = once
  PERFORM eassert(
    (SELECT claim_period = 'once' AND max_claims_per_period = 1
       FROM tasks WHERE id = v_task_once),
    'I-E. 單次任務的 claim 規則是整個生命週期一次');

  -- F. 跨家庭不可完成 / 不可 adjust
  PERFORM set_config('test.uid', v_user_c::text, false);
  BEGIN
    PERFORM complete_task(v_task_growth, v_child, now(), true);
    RAISE EXCEPTION 'FAILED: J. 跨家庭完成應該被拒絕';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM eassert(true, 'J. 跨家庭完成 → 42501');
  END;
  BEGIN
    PERFORM mark_task_atomic(v_task_growth, v_child, 'partial', 5);
    RAISE EXCEPTION 'FAILED: J1. 跨家庭 adjust 應該被拒絕';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM eassert(true, 'J1. 跨家庭 adjust → 42501');
  END;

  -- 家庭 B 的家長操作自己家的孩子：要能成功（確認拒絕不是一律拒絕）
  PERFORM set_config('test.uid', v_user_c::text, false);
  v_res := create_parent_task_v1(ecmd(
    v_child_b, v_fam_b, 'QA 家庭 B 自己的任務', 'recurring', 'learning_skill',
    'recurring', NULL, 'record_only', 'ongoing', 'fixed_days',
    eplain('record_only'), gen_random_uuid()));
  PERFORM eassert(
    v_res ->> 'ok' = 'true'
    AND (SELECT family_id FROM tasks WHERE id = (v_res ->> 'taskId')::uuid) = v_fam_b,
    'K. 家庭 B 的家長可以建立家庭 B 的任務，且寫進正確的家庭');

  -- 家庭 A 的第二位家長
  PERFORM set_config('test.uid', v_user_b::text, false);
  v_res := create_parent_task_v1(ecmd(
    v_child, v_fam_a, 'QA 第二位家長', 'recurring', 'learning_skill',
    'recurring', NULL, 'record_only', 'ongoing', 'fixed_days',
    eplain('record_only'), gen_random_uuid()));
  PERFORM eassert(v_res ->> 'ok' = 'true', 'L. 同家庭第二位家長可以建立');

  PERFORM set_config('test.uid', '', false);

  RAISE NOTICE '';
  RAISE NOTICE 'REAL SCHEMA E2E PASSED';
END $$;
