-- Shadow Wallet — parent_custom 建立與完成的真實 schema 驗證（第九階段 B）
--
-- ─────────────────────────────────────────────────────────────────────────
-- 這一支跑在 supabase/baseline/public_schema.sql（正式專案的 schema dump）
-- 之上，所以它碰到的是真的 40 多欄、真的 CHECK、真的外鍵。
--
-- 為什麼不用 supabase/verify/task_reward_verification.sql 的簡化 harness：
-- 20260731 那支 migration 就是被簡化 harness 漏掉的 —— 它自己建的 tasks 表
-- 沒有 long_term_type 的 CHECK，93 條 assertion 全過，而家庭角色任務在
-- 真實資料庫上完全建不出來。
--
-- ⚠️ 這仍然不能取代 staging E2E：這裡沒有 PostgREST、沒有真的 JWT，
--    RLS 也沒有以 authenticated 身分執行過。auth.uid() 是替身。
--
-- 前提：
--   psql -f supabase/baseline/public_schema.sql
--   psql -f supabase/migrations/20260730000000_create_parent_task_idempotency.sql
--   psql -f supabase/migrations/20260731000000_fix_family_role_long_term_type.sql
--   psql -f supabase/migrations/20260804000000_parent_custom_task_persistence.sql
--   psql -f supabase/verify/parent_custom_persistence.sql
-- ─────────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.uid', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION eassert(p_ok boolean, p_label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok THEN
    RAISE NOTICE '  ok   %', p_label;
  ELSE
    RAISE EXCEPTION 'FAIL: %', p_label;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 種子
-- ═══════════════════════════════════════════════════════════════════════════

DO $seed$
DECLARE
  v_user   uuid := gen_random_uuid();
  v_user2  uuid := gen_random_uuid();
  v_fam    uuid;
  v_fam2   uuid;
  v_child  uuid;
  v_child2 uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_user, 'a@example.invalid'), (v_user2, 'b@example.invalid');

  INSERT INTO families (family_name) VALUES ('驗證家庭 A') RETURNING id INTO v_fam;
  INSERT INTO families (family_name) VALUES ('驗證家庭 B') RETURNING id INTO v_fam2;

  INSERT INTO parents (family_id, name, user_id) VALUES (v_fam, '家長 A', v_user);
  INSERT INTO parents (family_id, name, user_id) VALUES (v_fam2, '家長 B', v_user2);

  INSERT INTO children (family_id, nickname, birth_date, age_group)
  VALUES (v_fam, '小安', DATE '2018-04-01', '6-9') RETURNING id INTO v_child;
  INSERT INTO children (family_id, nickname, birth_date, age_group)
  VALUES (v_fam2, '小北', DATE '2018-04-01', '6-9') RETURNING id INTO v_child2;

  INSERT INTO wallets (child_id, wallet_type) VALUES (v_child, 'spending');

  CREATE TEMP TABLE ctx (k text PRIMARY KEY, v uuid);
  INSERT INTO ctx VALUES
    ('user', v_user), ('user2', v_user2),
    ('fam', v_fam), ('fam2', v_fam2),
    ('child', v_child), ('child2', v_child2);
END;
$seed$;

-- 建立命令的組裝器。共用一份，讓每個案例只描述差異 ——
-- 每個案例各抄一份 200 行 JSON 的話，之後改契約要改三十處。
CREATE OR REPLACE FUNCTION mk_command(
  p_child        uuid,
  p_source       text,
  p_purpose      text,
  p_reward       text,
  p_editor       text     DEFAULT 'one_time',
  p_request      uuid     DEFAULT NULL,
  p_with_preset  boolean  DEFAULT NULL,
  p_intent       text     DEFAULT NULL,
  p_review_days  int      DEFAULT NULL,
  p_coin         int      DEFAULT NULL,
  p_selections   jsonb    DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_preset     jsonb;
  v_meta       jsonb;
  v_decision   jsonb;
  v_duration   text;
  v_plan_mode  text;
  v_completion text;
  v_schedule   jsonb;
  v_plan       jsonb;
  v_role       jsonb;
  v_review     jsonb;
  v_use_preset boolean := COALESCE(p_with_preset, p_source = 'preset');
BEGIN
  v_duration := CASE p_editor
    WHEN 'one_time' THEN 'one_time'
    WHEN 'recurring' THEN 'recurring'
    ELSE 'long_term' END;

  v_plan_mode := CASE WHEN v_duration = 'long_term' THEN p_editor ELSE NULL END;

  v_completion := CASE p_editor
    WHEN 'one_time' THEN 'complete_once'
    WHEN 'recurring' THEN 'ongoing'
    WHEN 'growth_plan' THEN 'plan_complete'
    WHEN 'family_role' THEN 'review_and_continue'
    ELSE 'stabilize_and_exit' END;

  v_schedule := jsonb_build_object(
    'mode', CASE WHEN p_editor = 'one_time' THEN 'one_time' ELSE 'fixed_days' END,
    'startDate', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
    'preferredTime', 'after_school',
    'reminderMode', 'none',
    'estimatedMinutes', 20
  );

  IF p_editor = 'one_time' THEN
    v_schedule := v_schedule || jsonb_build_object(
      'scheduledDate', to_char(CURRENT_DATE, 'YYYY-MM-DD'));
  ELSE
    v_schedule := v_schedule || jsonb_build_object('recurrenceDays', '[1,3,5]'::jsonb);
  END IF;

  IF v_duration = 'long_term' THEN
    v_schedule := v_schedule || jsonb_build_object(
      'durationDays', 14,
      'endDate', to_char(CURRENT_DATE + 13, 'YYYY-MM-DD'));
    v_plan := jsonb_build_object(
      'durationDays', 14,
      'milestones', CASE WHEN p_editor = 'growth_plan'
        THEN '[{"id":"m1","title":"第一週","targetDay":7}]'::jsonb ELSE '[]'::jsonb END,
      'supportSteps', CASE WHEN p_editor = 'short_support'
        THEN '[{"id":"s1","text":"睡前把書包放門邊"}]'::jsonb ELSE '[]'::jsonb END,
      'focusOptionIds', '[]'::jsonb);
    v_review := jsonb_build_object('reviewEnabled', true, 'firstReviewAfterDays', 7,
                                   'weekendReviewEnabled', true);
  END IF;

  IF p_editor = 'family_role' THEN
    v_role := jsonb_build_object(
      'optionId', 'role-table',
      'responsibilities', '[{"id":"r1","text":"開飯前擺好碗筷","isCustom":false}]'::jsonb,
      'scopeDescription', '平日晚餐',
      'exceptionDescription', '外食那天不算',
      'contributionDescription', '讓晚餐可以準時開始');
  END IF;

  IF v_use_preset THEN
    v_preset := jsonb_build_object('familyId', 'fam-demo', 'variantId', 'var-demo');
  END IF;

  v_meta := jsonb_build_object(
    'ageGroup', '6-9',
    'taskPolicyVersion', 'task-taxonomy-2026-07',
    'editorKind', p_editor,
    'clientRequestId', COALESCE(p_request, gen_random_uuid()));

  IF v_use_preset THEN
    v_meta := v_meta || jsonb_build_object('presetCatalogVersion', '2026-07-28');
  END IF;

  v_decision := jsonb_build_object(
    'rewardPolicy', p_reward,
    'eligibility', 'allowed',
    'rewardPolicyVersion', 'eligibility-policy-2026-07',
    'explanation', '驗證用');

  IF p_reward = 'coin_eligible' THEN
    v_decision := v_decision || jsonb_build_object(
      'rewardPolicyVersion', 'coin-policy-1.0.0',
      'coin', jsonb_build_object(
        'suggestedAmount', COALESCE(p_coin, 12),
        'finalAmount',     COALESCE(p_coin, 12),
        'minAllowed',      1,
        'maxAllowed',      99,
        'calculationBasis', jsonb_build_object('ageGroup', '6-9')));
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'schemaVersion', 1,
    'creationSource', p_source,
    'childId', p_child,
    'familyId', (SELECT v FROM ctx WHERE k = 'fam'),
    'preset', v_preset,
    'task', jsonb_build_object(
      'title', '驗證任務',
      'purposeCategory', p_purpose,
      'durationType', v_duration,
      'planMode', v_plan_mode,
      'source', 'parent',
      'rewardPolicy', p_reward,
      'completionPolicy', v_completion,
      'originalExpectation', '希望他能自己完成',
      'completionDescription', '做完並自己確認一次'),
    'schedule', v_schedule,
    'content', jsonb_build_object(
      'selectedOptions', COALESCE(p_selections,
        CASE WHEN v_use_preset THEN '{"g1":["o1"]}'::jsonb ELSE '{}'::jsonb END),
      'customOptionValues', '{}'::jsonb),
    'review', v_review,
    'plan', v_plan,
    'role', v_role,
    'support', jsonb_build_object('level', 'check_after'),
    'rewardSupport', CASE WHEN p_intent IS NULL THEN NULL
      ELSE jsonb_strip_nulls(jsonb_build_object(
        'intent', p_intent, 'reviewAfterDays', p_review_days)) END,
    'metadata', v_meta,
    'reward', jsonb_build_object('decision', v_decision)));
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 驗證
-- ═══════════════════════════════════════════════════════════════════════════

DO $verify$
DECLARE
  v_child  uuid := (SELECT v FROM ctx WHERE k = 'child');
  v_child2 uuid := (SELECT v FROM ctx WHERE k = 'child2');
  v_user   uuid := (SELECT v FROM ctx WHERE k = 'user');
  v_user2  uuid := (SELECT v FROM ctx WHERE k = 'user2');
  r        jsonb;
  r2       jsonb;
  v_task   uuid;
  v_req    uuid;
  v_n      int;
  v_txt    text;
BEGIN
  PERFORM set_config('test.uid', v_user::text, true);

  -- ── 1-6. 六種建立情境 ──────────────────────────────────────────────────
  r := create_parent_task_v1(mk_command(v_child, 'preset', 'learning_skill', 'record_only', 'one_time'));
  PERFORM eassert(r ->> 'ok' = 'true', '1. preset one_time 建立');
  v_task := (r ->> 'taskId')::uuid;

  PERFORM eassert(
    (SELECT count(*) FROM task_preset_selections WHERE task_id = v_task) = 1,
    '7. preset 任務有 1 筆 selection');
  PERFORM eassert(
    (SELECT creation_source FROM tasks WHERE id = v_task) = 'preset',
    '9a. preset 的 creation_source');
  PERFORM eassert(
    (SELECT created_from_preset FROM tasks WHERE id = v_task),
    '10a. preset 的 created_from_preset = true');

  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'learning_skill', 'record_only', 'one_time'));
  PERFORM eassert(r ->> 'ok' = 'true', '2. custom one_time 建立');
  v_task := (r ->> 'taskId')::uuid;

  PERFORM eassert(
    (SELECT count(*) FROM task_preset_selections WHERE task_id = v_task) = 0,
    '8. custom 任務 0 筆 selection');
  PERFORM eassert(
    (SELECT creation_source FROM tasks WHERE id = v_task) = 'parent_custom',
    '9b. custom 的 creation_source');
  PERFORM eassert(
    NOT (SELECT created_from_preset FROM tasks WHERE id = v_task),
    '10b. custom 的 created_from_preset = false');
  PERFORM eassert(
    (SELECT preset_family_id IS NULL AND preset_variant_id IS NULL FROM tasks WHERE id = v_task),
    '13. custom 沒有 preset id（不是空字串，是 NULL）');
  PERFORM eassert(
    (SELECT count(*) FROM task_change_events
      WHERE task_id = v_task AND event_type = 'created_parent_custom') = 1,
    '4a. custom 的稽核事件型別');
  PERFORM eassert(
    (SELECT snapshot -> 'creationSource' ->> 0 IS NOT NULL
       OR snapshot ->> 'creationSource' = 'parent_custom'
     FROM task_change_events WHERE task_id = v_task LIMIT 1),
    '4b. snapshot 記下 creationSource');

  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'learning_skill', 'record_only', 'recurring'));
  PERFORM eassert(r ->> 'ok' = 'true', '3. custom recurring 建立');

  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'learning_skill', 'record_only', 'growth_plan'));
  PERFORM eassert(r ->> 'ok' = 'true', '4. custom growth_plan 建立');

  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'life_routine', 'progress_only', 'short_support'));
  PERFORM eassert(r ->> 'ok' = 'true', '5. custom short_support 建立');

  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'family_participation', 'family_contribution', 'family_role'));
  PERFORM eassert(r ->> 'ok' = 'true', '6. custom family_role 建立');

  -- ── 11-13. 來源與 payload 必須一致 ─────────────────────────────────────
  r := create_parent_task_v1(mk_command(v_child, 'preset', 'learning_skill', 'record_only',
                                        'one_time', NULL, false));
  PERFORM eassert(r ->> 'ok' = 'false' AND r ->> 'code' = 'VALIDATION_FAILED',
                  '11. preset 缺 preset payload 被拒');

  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'learning_skill', 'record_only',
                                        'one_time', NULL, true));
  PERFORM eassert(r ->> 'ok' = 'false' AND r ->> 'code' = 'VALIDATION_FAILED',
                  '12. custom 帶 preset payload 被拒');

  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'learning_skill', 'record_only',
                                        'one_time', NULL, false, NULL, NULL, NULL,
                                        '{"g1":["o1"]}'::jsonb));
  PERFORM eassert(r ->> 'ok' = 'false',
                  '12b. custom 帶 selectedOptions 被拒');

  -- ── 14-15. Reward support metadata ─────────────────────────────────────
  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'learning_skill', 'coin_eligible',
                                        'one_time', NULL, false,
                                        'temporary_startup_support', 21, 12));
  PERFORM eassert(r ->> 'ok' = 'true', '14a. 暫時支持 ＋ 回顧時間可建立');
  v_task := (r ->> 'taskId')::uuid;
  PERFORM eassert(
    (SELECT reward_support_intent = 'temporary_startup_support'
        AND reward_support_review_after_days = 21
     FROM tasks WHERE id = v_task),
    '14b. reward support metadata 有存下來');

  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'learning_skill', 'coin_eligible',
                                        'one_time', NULL, false,
                                        'temporary_startup_support', NULL, 12));
  PERFORM eassert(r ->> 'ok' = 'false' AND r ->> 'code' = 'POLICY_REJECTED',
                  '15. 暫時支持缺回顧時間被拒');

  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'learning_skill', 'record_only',
                                        'one_time', NULL, false,
                                        'family_defined_agreement', NULL, NULL));
  PERFORM eassert(r ->> 'ok' = 'false',
                  '15b. 不發幣卻帶非 default 意圖被拒');

  -- ── 16-19. B 類回饋矩陣 ────────────────────────────────────────────────
  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'family_participation',
                                        'family_contribution', 'recurring'));
  PERFORM eassert(r ->> 'ok' = 'true', '16. B ＋ family_contribution 建立');

  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'family_participation',
                                        'progress_only', 'recurring'));
  PERFORM eassert(r ->> 'ok' = 'true', '17. B ＋ progress_only 建立（舊規則會擋）');

  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'family_participation',
                                        'record_only', 'recurring'));
  PERFORM eassert(r ->> 'ok' = 'true', '18. B ＋ record_only 建立（舊規則會擋）');

  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'family_participation',
                                        'coin_eligible', 'recurring', NULL, false,
                                        'family_defined_agreement', NULL, 12));
  PERFORM eassert(r ->> 'ok' = 'false' AND r ->> 'reason' = 'B_COIN_POLICY_NOT_CONFIGURED',
                  '19. B ＋ coin 被 policy-missing 擋下（理由不是「永遠禁止」）');

  -- ── 20-22. A 類回饋 ────────────────────────────────────────────────────
  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'life_routine',
                                        'record_only', 'one_time'));
  PERFORM eassert(r ->> 'ok' = 'true', '20. A ＋ record_only 建立');

  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'life_routine',
                                        'progress_only', 'recurring'));
  PERFORM eassert(r ->> 'ok' = 'true', '21. A ＋ progress_only 建立');

  -- A 類的成長幣沒有專屬 guard，它擋在幣值決策那一層（App 端算不出金額）。
  -- 這裡送一個「決策說 allowed 但沒有 coin 區塊」的命令，確認 RPC 仍然擋下。
  r := create_parent_task_v1(jsonb_set(
    mk_command(v_child, 'parent_custom', 'life_routine', 'coin_eligible', 'one_time', NULL, false),
    '{reward,decision,coin}', 'null'::jsonb));
  PERFORM eassert(r ->> 'ok' = 'false', '22. A ＋ coin 缺金額被拒');

  -- ── 23-24. C/D coin 與完成 ─────────────────────────────────────────────
  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'autonomous_challenge',
                                        'coin_eligible', 'one_time', NULL, false, NULL, NULL, 15));
  PERFORM eassert(r ->> 'ok' = 'true', '23. C ＋ coin 建立');
  v_task := (r ->> 'taskId')::uuid;
  PERFORM eassert(
    (SELECT reward_coin_amount = 15 FROM tasks WHERE id = v_task),
    '23b. 金額寫進 reward_coin_amount');

  r2 := complete_task(v_task, v_child, now(), true, NULL);
  PERFORM eassert(COALESCE((r2 ->> 'coinEarned')::int, -1) = 15,
                  '24a. 完成後依 reward_policy 發 15 幣');
  PERFORM eassert(
    (SELECT balance FROM wallets WHERE child_id = v_child AND wallet_type = 'spending') = 15,
    '10. 錢包餘額正確');

  -- 非 coin 的完成不動錢包。
  r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'family_participation',
                                        'family_contribution', 'one_time'));
  v_task := (r ->> 'taskId')::uuid;
  r2 := complete_task(v_task, v_child, now(), true, NULL);
  PERFORM eassert(COALESCE((r2 ->> 'coinEarned')::int, -1) = 0,
                  '24b. family_contribution 完成發 0 幣');
  PERFORM eassert(
    (SELECT balance FROM wallets WHERE child_id = v_child AND wallet_type = 'spending') = 15,
    '11. 非 coin 任務不動錢包');

  -- ── 24c. category 不再暗中覆蓋 reward_policy ───────────────────────────
  --
  -- 手動塞一筆「B 類 ＋ coin_eligible ＋ 有金額」的任務 —— 建立端擋得住，
  -- 但如果有人直接寫資料庫，完成端必須依 reward_policy 處理，
  -- 而不是因為 category = 'B' 就安靜發 0。
  --
  -- 金額欄位要湊齊：tasks_coin_eligible_needs_amount_check 要求
  -- amount / min / max / reward_policy_version 同時存在且落在範圍內。
  INSERT INTO tasks (
    family_id, name, category, day_type, is_system_default, allow_repeat,
    min_age, max_age, is_active, base_time_min, difficulty,
    reward_policy, reward_policy_version,
    reward_coin_amount, reward_coin_min, reward_coin_max,
    creation_source, created_from_preset, claim_period, max_claims_per_period
  ) VALUES (
    (SELECT v FROM ctx WHERE k = 'fam'), '手動 B coin', 'B', 'both', false, false,
    0, 99, true, 0, 1,
    'coin_eligible', 'manual-verification',
    7, 1, 99,
    'legacy', false, 'day', 1
  ) RETURNING id INTO v_task;
  INSERT INTO child_tasks (child_id, task_id, is_active) VALUES (v_child, v_task, true);

  r2 := complete_task(v_task, v_child, now(), true, NULL);
  PERFORM eassert(COALESCE((r2 ->> 'coinEarned')::int, -1) = 7,
                  '24c. B 類 ＋ coin_eligible 完成時依 reward_policy 發幣，不被 category 歸零');

  -- 0 幣的 coin_eligible 根本插不進去 —— tasks_coin_eligible_needs_amount_check
  -- 已經擋在資料庫層。complete_task 裡的 coin_amount_not_configured 是第二道，
  -- 目前**到不了**，那是刻意的：兩道都在才叫 fail-closed。
  BEGIN
    INSERT INTO tasks (
      family_id, name, category, day_type, is_system_default, allow_repeat,
      min_age, max_age, is_active, base_time_min, difficulty,
      reward_policy, reward_coin_amount,
      creation_source, created_from_preset, claim_period, max_claims_per_period
    ) VALUES (
      (SELECT v FROM ctx WHERE k = 'fam'), '手動 0 幣', 'D', 'both', false, false,
      0, 99, true, 0, 1,
      'coin_eligible', 0,
      'legacy', false, 'day', 1
    );
    PERFORM eassert(false, '24d. 0 幣的 coin_eligible 應該被 constraint 擋下');
  EXCEPTION WHEN check_violation THEN
    PERFORM eassert(true, '24d. 0 幣的 coin_eligible 被 constraint 擋下（不會走到完成端）');
  END;

  -- ── 25. legacy 完成行為不變 ────────────────────────────────────────────
  INSERT INTO tasks (
    family_id, name, category, day_type, is_system_default, allow_repeat,
    min_age, max_age, is_active, base_time_min, difficulty,
    claim_period, max_claims_per_period
  ) VALUES (
    (SELECT v FROM ctx WHERE k = 'fam'), 'legacy 任務', 'D', 'both', false, false,
    0, 99, true, 10, 2, 'day', 1
  ) RETURNING id INTO v_task;
  INSERT INTO child_tasks (child_id, task_id, is_active) VALUES (v_child, v_task, true);

  PERFORM eassert(
    (SELECT reward_policy IS NULL AND creation_source = 'legacy' FROM tasks WHERE id = v_task),
    '25a. legacy 任務的 reward_policy 是 NULL、來源是 legacy');

  r2 := complete_task(v_task, v_child, now(), true, NULL);
  -- 舊公式：base_time_min × difficulty = 10 × 2 = 20，前置滿足所以不打折。
  PERFORM eassert(COALESCE((r2 ->> 'coinEarned')::int, -1) = 20,
                  '25b. legacy 完成仍走 base_time_min × difficulty');

  -- ── 26-28. Idempotency ─────────────────────────────────────────────────
  v_req := gen_random_uuid();
  r  := create_parent_task_v1(mk_command(v_child, 'preset', 'learning_skill', 'record_only', 'one_time', v_req));
  r2 := create_parent_task_v1(mk_command(v_child, 'preset', 'learning_skill', 'record_only', 'one_time', v_req));
  PERFORM eassert(r ->> 'taskId' = r2 ->> 'taskId' AND r2 ->> 'idempotentReplay' = 'true',
                  '26a. preset 重送回同一筆');
  PERFORM eassert(
    (SELECT count(*) FROM tasks WHERE creation_request_id = v_req) = 1,
    '26b. preset 重送只有一筆任務');
  PERFORM eassert(
    (SELECT count(*) FROM task_preset_selections WHERE task_id = (r ->> 'taskId')::uuid) = 1,
    '26c. preset 重送仍是 1 筆 selection');

  v_req := gen_random_uuid();
  r  := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'learning_skill', 'record_only', 'one_time', v_req));
  r2 := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'learning_skill', 'record_only', 'one_time', v_req));
  PERFORM eassert(r ->> 'taskId' = r2 ->> 'taskId' AND r2 ->> 'idempotentReplay' = 'true',
                  '27a. custom 重送回同一筆');
  PERFORM eassert(
    (SELECT count(*) FROM task_preset_selections WHERE task_id = (r ->> 'taskId')::uuid) = 0,
    '27b. custom 重送仍是 0 筆 selection —— replay 不會補出假的 preset row');
  PERFORM eassert(
    jsonb_array_length(r -> 'relatedIds') = jsonb_array_length(r2 -> 'relatedIds'),
    '27c. custom 重送的 relatedIds 數量與第一次相同（稽核事件也算得進去）');

  -- 28. 同一個 request id 換來源重送：回放的是原本那一筆，不會建出第二種來源。
  v_req := gen_random_uuid();
  r  := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'learning_skill', 'record_only', 'one_time', v_req));
  r2 := create_parent_task_v1(mk_command(v_child, 'preset', 'learning_skill', 'record_only', 'one_time', v_req));
  PERFORM eassert(r2 ->> 'idempotentReplay' = 'true' AND r ->> 'taskId' = r2 ->> 'taskId',
                  '28a. 換來源重送回放原本那一筆');
  PERFORM eassert(
    (SELECT creation_source FROM tasks WHERE id = (r ->> 'taskId')::uuid) = 'parent_custom',
    '28b. 回放不會把來源改寫成另一種');
  PERFORM eassert(
    (SELECT count(*) FROM tasks WHERE creation_request_id = v_req) = 1,
    '28c. 換來源重送不會建出第二筆');

  -- ── 29. 跨家庭 ─────────────────────────────────────────────────────────
  PERFORM set_config('test.uid', v_user2::text, true);
  BEGIN
    r := create_parent_task_v1(mk_command(v_child, 'parent_custom', 'learning_skill', 'record_only', 'one_time', v_req));
    PERFORM eassert(false, '29. 跨家庭應該被拒');
  EXCEPTION WHEN insufficient_privilege THEN
    v_txt := SQLERRM;
    PERFORM eassert(v_txt NOT LIKE '%' || (r ->> 'taskId') || '%', '29. 跨家庭被拒且不洩漏 task id');
  END;
  PERFORM set_config('test.uid', v_user::text, true);

  RAISE NOTICE '── 全部通過 ──';
END;
$verify$;
