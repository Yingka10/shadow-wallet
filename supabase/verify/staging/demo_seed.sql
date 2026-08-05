-- ═══════════════════════════════════════════════════════════════════════════
-- GrowBook Demo 資料：建立
-- ═══════════════════════════════════════════════════════════════════════════
--
-- **只在 staging 執行。不是 production seed。**
-- 這支腳本不含密碼、金鑰或 project ref。Demo 帳號的密碼由 run_demo.sh
-- 從 DEMO_PASSWORD 環境變數替換掉 `__DEMO_PASSWORD__`；沒有替換就會在
-- 建立帳號之前被擋下來，不會造出一個密碼是佔位符的帳號。
--
-- 與 qa_seed.sql 的分工：
--
--   qa_seed.sql   regression 用。名稱刻意帶技術性（QA Child 8、
--                 QA idempotency 測試），因為 E2E 會斷言那些字串。
--                 **不要為了畫面好看去改它** —— 那會弄壞 regression。
--
--   這一支         給人看的。獨立的 family / parent / child，
--                 與 QA 那組完全不共用，所以 reset 一邊不會動到另一邊。
--
-- 任務全部走 `create_parent_task_v1` 建立，而不是手寫 INSERT ——
-- Demo 看到的東西必須和 App 實際建立出來的一模一樣。手寫 INSERT 會在
-- schema 或 RPC 改動時默默漂移，然後 Demo 展示的是一個沒人跑過的路徑。
--
-- 執行前先跑 demo_reset.sql。連跑 reset → seed → reset → seed 結果一致。

-- 純 SQL，沒有 psql meta-command —— `psql -f` 與 `supabase db query --linked`
-- 都跑得動（後者走 CLI 的臨時登入角色，不需要資料庫密碼）。

BEGIN;

-- Demo 身分：固定 id，僅供 staging demo，與正式資料無關。
-- 前綴 d0 是人眼可辨識的標記，一眼看出「這是 demo 造出來的」。
-- 放在 temp table 而不是 psql 變數 —— dollar-quoted 區塊裡讀得到。
CREATE TEMP TABLE demo_input AS SELECT
  'd0e70000-0000-4000-8000-000000000001'::uuid AS family_id,
  'd0e70000-0000-4000-8000-000000000011'::uuid AS parent_user,
  'd0e70000-0000-4000-8000-000000000012'::uuid AS parent_id,
  'd0e70000-0000-4000-8000-000000000021'::uuid AS child_id,
  'd0e70000-0000-4000-8000-000000000031'::uuid AS wallet_id,
  'demo.parent@growbook-demo.invalid'::text   AS email,
  '__DEMO_PASSWORD__'::text                   AS pw;

-- ── 命令樣板 ────────────────────────────────────────────────────────────────
-- 建在 pg_temp：隨 session 消失，不會在 staging 的 public schema 留下殘骸，
-- 也不可能和正式函式撞名。

CREATE FUNCTION pg_temp.demo_command(
  p_child uuid, p_family uuid,
  p_title text, p_editor text, p_purpose text, p_duration text, p_plan_mode text,
  p_reward text, p_completion text, p_schedule_mode text,
  p_decision jsonb, p_request uuid,
  p_expectation text, p_completion_desc text
) RETURNS jsonb LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'childId', p_child,
    'familyId', p_family,
    'preset', jsonb_build_object('familyId', 'demo-preset', 'variantId', 'demo-variant'),
    'task', jsonb_build_object(
      'title', p_title,
      'purposeCategory', p_purpose,
      'durationType', p_duration,
      'planMode', p_plan_mode,
      'source', 'co_created',
      'rewardPolicy', p_reward,
      'completionPolicy', p_completion,
      'originalExpectation', p_expectation,
      'completionDescription', p_completion_desc
    ),
    'schedule', jsonb_build_object(
      'mode', p_schedule_mode,
      'startDate', CURRENT_DATE,
      'scheduledDate', CASE WHEN p_schedule_mode = 'one_time' THEN CURRENT_DATE END,
      'recurrenceDays', CASE WHEN p_schedule_mode = 'fixed_days'
                             THEN '[1,3,5]'::jsonb ELSE '[]'::jsonb END,
      'preferredTime', 'after_school',
      'estimatedMinutes', 20,
      'reminderMode', 'none'
    ),
    'content', jsonb_build_object('selectedOptions', '{}'::jsonb,
                                  'customOptionValues', '{}'::jsonb),
    'review', jsonb_build_object('reviewEnabled', true, 'firstReviewAfterDays', 7),
    'reward', jsonb_build_object('decision', p_decision),
    'metadata', jsonb_build_object(
      'ageGroup', '6-9', 'createdFromPreset', true,
      'taskPolicyVersion', 'task-taxonomy-2026-07',
      'presetCatalogVersion', '2026-07-28',
      'editorKind', p_editor,
      'clientRequestId', p_request
    )
  );
$fn$;

CREATE FUNCTION pg_temp.demo_long(p_cmd jsonb, p_days int)
RETURNS jsonb LANGUAGE sql STABLE AS $fn$
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
$fn$;

-- 不發幣的三種：coin 一律 null，型別上就不可能夾帶金額。
CREATE FUNCTION pg_temp.demo_plain(p_policy text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$
  SELECT jsonb_build_object(
    'rewardPolicy', p_policy, 'eligibility', 'allowed', 'coin', NULL,
    'rewardPolicyVersion', 'reward-eligibility-2026-07',
    'explanation', '不發成長幣');
$fn$;

CREATE FUNCTION pg_temp.demo_coin(p_final int, p_min int, p_max int)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$
  SELECT jsonb_build_object(
    'rewardPolicy', 'coin_eligible', 'eligibility', 'allowed',
    'rewardPolicyVersion', 'coin-policy-1.0.0',
    'explanation', '6-9 歲段、每次約 20 分鐘',
    'coin', jsonb_build_object(
      'suggestedAmount', p_final, 'finalAmount', p_final,
      'minAllowed', p_min, 'maxAllowed', p_max,
      'calculationBasis', jsonb_build_object(
        'ageGroup', '6-9', 'purposeCategory', 'learning_skill',
        'estimatedMinutes', 20, 'durationType', 'recurring',
        'scheduleMode', 'fixed_days', 'difficulty', 'standard', 'band', '11-20')));
$fn$;

-- RPC 失敗時要當場停下來。回了 ok:false 卻繼續，Demo 會少一筆而沒人發現。
CREATE FUNCTION pg_temp.demo_expect(p_res jsonb, p_what text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF COALESCE(p_res ->> 'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION '建立「%」失敗：% / %',
      p_what, p_res ->> 'code', p_res ->> 'message';
  END IF;
END
$fn$;

-- ── 帳號、家庭、孩子 ────────────────────────────────────────────────────────

DO $seed$
DECLARE
  d demo_input%ROWTYPE;
BEGIN
  SELECT * INTO d FROM demo_input;

  -- 佔位符沒有被替換掉就停手。造一個密碼是 __DEMO_PASSWORD__ 的帳號，
  -- 比沒有帳號更糟 —— 它會一直能登入，而且沒有人知道。
  IF d.pw = '__DEMO' || '_PASSWORD__' OR length(d.pw) < 12 THEN
    RAISE EXCEPTION '請透過 run_demo.sh 執行：DEMO_PASSWORD 未提供或太短';
  END IF;

  IF EXISTS (SELECT 1 FROM families WHERE id = d.family_id) THEN
    RAISE EXCEPTION 'Demo 資料已存在，請先執行 demo_reset.sql';
  END IF;

  -- GoTrue 以非 nullable 的 Go 字串掃這幾個 token 欄位，NULL 會讓登入回
  -- 「Database error querying schema」。手動建 user 時一定要補成空字串。
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', d.parent_user,
    'authenticated', 'authenticated', d.email,
    extensions.crypt(d.pw, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', '', '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), d.parent_user::text, d.parent_user,
    jsonb_build_object('sub', d.parent_user::text, 'email', d.email,
                       'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  INSERT INTO families (id, family_name, created_by)
    VALUES (d.family_id, 'GrowBook Demo Family', d.parent_user);

  INSERT INTO parents (id, family_id, user_id, name, email)
    VALUES (d.parent_id, d.family_id, d.parent_user, 'Demo Parent', d.email);

  -- 承恩，8 歲。虛構人物，與正式 Demo 的真實帳號無關。
  INSERT INTO children (id, family_id, nickname, birth_date, age_group)
    VALUES (d.child_id, d.family_id, '承恩',
            (CURRENT_DATE - INTERVAL '8 years 4 months')::date, '6-9');

  INSERT INTO wallets (id, child_id, wallet_type, balance)
    VALUES (d.wallet_id, d.child_id, 'spending', 0);
END
$seed$;

-- ── 六筆展示任務 ────────────────────────────────────────────────────────────
-- 名稱與說明都是家長會唸出口的話，沒有 QA / test / idempotency / debug 字眼。

DO $tasks$
DECLARE
  d     demo_input%ROWTYPE;
  v_res jsonb;
BEGIN
  SELECT * INTO d FROM demo_input;

  -- 讓 create_parent_task_v1 的 auth.uid() 認得這位家長。
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', d.parent_user::text)::text, true);

  -- 1. 完成學校作業｜單次｜一般紀錄
  v_res := create_parent_task_v1(pg_temp.demo_command(
    d.child_id, d.family_id, '完成學校作業', 'one_time', 'learning_skill',
    'one_time', NULL, 'record_only', 'complete_once', 'one_time',
    pg_temp.demo_plain('record_only'), 'd0e70000-0000-4000-8000-0000000000a1'::uuid,
    '今天的作業自己完成', '寫完並收進書包'));
  PERFORM pg_temp.demo_expect(v_res, '完成學校作業');

  -- 2. 餐後整理｜固定｜家庭參與
  v_res := create_parent_task_v1(pg_temp.demo_command(
    d.child_id, d.family_id, '餐後整理', 'recurring', 'family_participation',
    'recurring', NULL, 'family_contribution', 'ongoing', 'fixed_days',
    pg_temp.demo_plain('family_contribution'), 'd0e70000-0000-4000-8000-0000000000a2'::uuid,
    '吃完飯一起收拾', '把自己的碗筷拿到水槽、擦好自己的位子'));
  PERFORM pg_temp.demo_expect(v_res, '餐後整理');

  -- 3. 運動練習｜固定｜成長幣回饋
  --    幣值 12 來自正式的 coin policy（6-9 歲、每次 20 分鐘）。
  v_res := create_parent_task_v1(pg_temp.demo_command(
    d.child_id, d.family_id, '運動練習', 'recurring', 'learning_skill',
    'recurring', NULL, 'coin_eligible', 'ongoing', 'fixed_days',
    pg_temp.demo_coin(12, 5, 25), 'd0e70000-0000-4000-8000-0000000000a3'::uuid,
    '每週三次的運動習慣', '完成當天的練習內容'));
  PERFORM pg_temp.demo_expect(v_res, '運動練習');

  -- 4. 四週閱讀計畫｜成長計畫｜五個里程碑
  --    刻意不標記任何里程碑為已完成 —— 目前沒有 milestone completion model，
  --    任何「已完成」都會是編的。
  v_res := create_parent_task_v1(jsonb_set(
    pg_temp.demo_long(pg_temp.demo_command(
      d.child_id, d.family_id, '四週閱讀計畫', 'growth_plan', 'learning_skill',
      'long_term', 'growth_plan', 'progress_only', 'plan_complete', 'fixed_days',
      pg_temp.demo_plain('progress_only'), 'd0e70000-0000-4000-8000-0000000000a4'::uuid,
      '一起把閱讀變成日常', '每次讀完和家人說一段'), 28),
    '{plan,milestones}', jsonb_build_array(
      jsonb_build_object('title', '找到想讀的第一本書', 'targetDay', 3),
      jsonb_build_object('title', '連續三天各讀一段',   'targetDay', 7),
      jsonb_build_object('title', '讀完第一本',         'targetDay', 14),
      jsonb_build_object('title', '和家人分享讀到的事', 'targetDay', 21),
      jsonb_build_object('title', '挑好下一本想讀的',   'targetDay', 28))));
  PERFORM pg_temp.demo_expect(v_res, '四週閱讀計畫');

  -- 5. 整理書包 14 天｜短期支援｜有支援步驟
  v_res := create_parent_task_v1(jsonb_set(
    pg_temp.demo_long(pg_temp.demo_command(
      d.child_id, d.family_id, '整理書包 14 天', 'short_support', 'life_routine',
      'long_term', 'short_support', 'progress_only', 'stabilize_and_exit', 'fixed_days',
      pg_temp.demo_plain('progress_only'), 'd0e70000-0000-4000-8000-0000000000a5'::uuid,
      '出門前不再手忙腳亂', '前一晚把書包整理好'), 14),
    '{plan,supportSteps}', jsonb_build_array(
      jsonb_build_object('id', 'step-1', 'text', '睡前對照隔天的課表'),
      jsonb_build_object('id', 'step-2', 'text', '把要帶的東西放進書包'),
      jsonb_build_object('id', 'step-3', 'text', '書包放在門邊固定的位置'))));
  PERFORM pg_temp.demo_expect(v_res, '整理書包 14 天');

  -- 6. 四週餐桌小幫手｜家庭角色｜有負責內容
  v_res := create_parent_task_v1(jsonb_set(
    pg_temp.demo_long(pg_temp.demo_command(
      d.child_id, d.family_id, '四週餐桌小幫手', 'family_role', 'family_participation',
      'long_term', 'family_role', 'family_contribution', 'review_and_continue', 'fixed_days',
      pg_temp.demo_plain('family_contribution'), 'd0e70000-0000-4000-8000-0000000000a6'::uuid,
      '成為餐桌上固定的一份力', '開飯前後照約定完成'), 28),
    '{role}', jsonb_build_object(
      'optionId', 'table_helper',
      'responsibilities', jsonb_build_array(
        jsonb_build_object('id', 'r1', 'text', '開飯前擺好碗筷', 'isCustom', false),
        jsonb_build_object('id', 'r2', 'text', '飯後把自己的碗拿到水槽', 'isCustom', false),
        jsonb_build_object('id', 'r3', 'text', '提醒大家洗手', 'isCustom', false)),
      'scopeDescription', '負責晚餐時段的餐桌準備',
      'exceptionDescription', '外食或生病的日子可以跳過',
      'contributionDescription', '每週回顧時一起看看這段時間的變化')));
  PERFORM pg_temp.demo_expect(v_res, '四週餐桌小幫手');
END
$tasks$;

-- ── 編碼守門 ────────────────────────────────────────────────────────────────
-- 這一段抓的是一個真的發生過、而且很安靜的錯：腳本在送進資料庫的路上被
-- 轉成本機 codepage，於是 seed 成功、筆數正確、只有中文名稱是亂碼。
--
-- 比對「內容」抓不到它 —— SQL 裡的字串和寫進去的值會一起壞掉，兩邊仍然相等。
-- 所以這裡比對**位元組長度**：期望值是檔案裡的 ASCII 數字，不會被一起轉換。
-- 「承恩」= 2 個中文字 = UTF-8 的 6 個位元組。

DO $encoding$
DECLARE
  v_bytes int;
BEGIN
  SELECT octet_length(nickname) INTO v_bytes
  FROM children WHERE id = 'd0e70000-0000-4000-8000-000000000021';

  IF v_bytes IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION
      '中文編碼在傳輸中損壞：孩子名稱佔 % 個位元組，UTF-8 應該是 6。'
      '請確認執行路徑沒有經過本機 codepage 轉換。', v_bytes;
  END IF;
END
$encoding$;

DROP TABLE demo_input;

COMMIT;

-- ── 結果 ────────────────────────────────────────────────────────────────────
SELECT c.nickname AS child, c.age_group, w.balance AS wallet
FROM children c JOIN wallets w ON w.child_id = c.id
WHERE c.family_id = 'd0e70000-0000-4000-8000-000000000001'::uuid;

SELECT t.name, t.duration_type, t.reward_policy,
       COALESCE(t.reward_coin_amount, 0) AS coins,
       (SELECT count(*) FROM task_plan_milestones m WHERE m.task_id = t.id) AS milestones,
       (SELECT count(*) FROM task_plan_support_steps sp WHERE sp.task_id = t.id) AS steps,
       (SELECT count(*) FROM task_role_responsibilities r WHERE r.task_id = t.id) AS duties
FROM tasks t
WHERE t.family_id = 'd0e70000-0000-4000-8000-000000000001'::uuid
ORDER BY t.created_at;
