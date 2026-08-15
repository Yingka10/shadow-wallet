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

-- 把命令的排程起點挪到指定日期。
--
-- 背景歷史要能被畫面看見，長期計畫的 plan window 就必須涵蓋那些完成日：
-- buildGoalPresentation 的 validRhythmCompletions 會把 planStart 之前的
-- 完成整個丟掉。起點若還是 CURRENT_DATE，上週的紀錄在孩子端會消失，
-- 但在週報裡還在（週報不看 plan window）—— 兩邊對不上是最難查的那種錯。
CREATE FUNCTION pg_temp.demo_from(p_cmd jsonb, p_start date)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$
  SELECT jsonb_set(p_cmd, '{schedule}',
    (p_cmd -> 'schedule') || jsonb_build_object('startDate', p_start));
$fn$;

-- endDate 從命令自己的 startDate 算，不要再回頭讀 CURRENT_DATE ——
-- 起點被 demo_from 挪過之後，那兩個值就不是同一天了。
CREATE FUNCTION pg_temp.demo_long(p_cmd jsonb, p_days int)
RETURNS jsonb LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_set(
    jsonb_set(p_cmd, '{schedule}',
      (p_cmd -> 'schedule') || jsonb_build_object(
        'endDate', ((p_cmd -> 'schedule' ->> 'startDate')::date + p_days - 1),
        'durationDays', p_days)),
    '{plan}', jsonb_build_object(
      'durationDays', p_days,
      'milestones', '[]'::jsonb,
      'supportSteps', '[]'::jsonb,
      'focusOptionIds', '[]'::jsonb));
$fn$;

-- 這一週的週一（Asia/Taipei）。App 端的週界一律以週一為首
-- （useParentWeeklyReport 的 startOf('isoWeek')、longTermGoalPresentation
-- 的 weekStart 都是），date_trunc('week') 的定義剛好相同。
CREATE FUNCTION pg_temp.demo_this_monday() RETURNS date
LANGUAGE sql STABLE AS $fn$
  SELECT date_trunc('week', (now() AT TIME ZONE 'Asia/Taipei'))::date;
$fn$;

/*
 * 背景完成紀錄：走正式 RPC，不直接寫表。
 *
 * P0-6 已經把 completion / transaction / wallet 收斂進 complete_task。
 * 這裡若改用 INSERT，等於在 seed 裡複製一份發幣規則，幣值、唯一索引、
 * checkpoint 範圍任何一條之後改動，Demo 資料都會安靜地跟產品脫節。
 *
 * 順序照 App 真正做的：complete_task → record_completion_context
 * （見 src/lib/taskActions.ts）。
 */
CREATE FUNCTION pg_temp.demo_complete(
  p_task uuid, p_child uuid, p_on date, p_hour int,
  p_window text, p_mode text
) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  v_goal uuid;
  v_res  jsonb;
BEGIN
  SELECT id INTO v_goal
  FROM long_term_goals
  WHERE task_id = p_task AND child_id = p_child AND status = 'active';

  v_res := complete_task(
    p_task, p_child,
    (p_on::text || ' ' || lpad(p_hour::text, 2, '0') || ':00+08')::timestamptz,
    true, v_goal);

  IF v_res ? 'error' THEN
    RAISE EXCEPTION '背景紀錄失敗（task %，% 日）：%',
      p_task, p_on, v_res ->> 'error';
  END IF;

  PERFORM record_completion_context(
    (v_res ->> 'completionId')::uuid, p_window, p_mode);
END
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
  --
  -- 長度下限只是「有人傳了空字串或一個字元」的絆線，**不是密碼強度政策**。
  -- 這是 staging 上 .invalid 網域的展示帳號，密碼就放在 .env.local 裡。
  -- 原本寫 12，但專案實際設定的 DEMO_PASSWORD 只有 6 個字元 —— 也就是說
  -- 這支 seed 從來不可能用現行設定跑起來。與其偷偷換掉大家記得的密碼，
  -- 不如把下限調成這條規則真正在防的東西。
  IF d.pw = '__DEMO' || '_PASSWORD__' OR length(d.pw) < 6 THEN
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
  -- 週期性與長期任務都從「上週一」開始，這個家庭才會像是已經運作了一段時間，
  -- 而且背景完成紀錄（下一個區塊）落得進各自的 plan window。
  -- 單次任務不挪：它就是要當成「今天還沒做的那一件」。
  v_start date := pg_temp.demo_this_monday() - 7;
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
  v_res := create_parent_task_v1(pg_temp.demo_from(pg_temp.demo_command(
    d.child_id, d.family_id, '餐後整理', 'recurring', 'family_participation',
    'recurring', NULL, 'family_contribution', 'ongoing', 'fixed_days',
    pg_temp.demo_plain('family_contribution'), 'd0e70000-0000-4000-8000-0000000000a2'::uuid,
    '吃完飯一起收拾', '把自己的碗筷拿到水槽、擦好自己的位子'), v_start));
  PERFORM pg_temp.demo_expect(v_res, '餐後整理');

  -- 3. 運動練習｜固定｜成長幣回饋
  --    幣值 12 來自正式的 coin policy（6-9 歲、每次 20 分鐘）。
  v_res := create_parent_task_v1(pg_temp.demo_from(pg_temp.demo_command(
    d.child_id, d.family_id, '運動練習', 'recurring', 'learning_skill',
    'recurring', NULL, 'coin_eligible', 'ongoing', 'fixed_days',
    pg_temp.demo_coin(12, 5, 25), 'd0e70000-0000-4000-8000-0000000000a3'::uuid,
    '每週三次的運動習慣', '完成當天的練習內容'), v_start));
  PERFORM pg_temp.demo_expect(v_res, '運動練習');

  -- 4. 四週閱讀計畫｜成長計畫｜五個里程碑
  --    刻意不標記任何里程碑為已完成 —— 目前沒有 milestone completion model，
  --    任何「已完成」都會是編的。
  v_res := create_parent_task_v1(jsonb_set(
    pg_temp.demo_long(pg_temp.demo_from(pg_temp.demo_command(
      d.child_id, d.family_id, '四週閱讀計畫', 'growth_plan', 'learning_skill',
      'long_term', 'growth_plan', 'progress_only', 'plan_complete', 'fixed_days',
      pg_temp.demo_plain('progress_only'), 'd0e70000-0000-4000-8000-0000000000a4'::uuid,
      '一起把閱讀變成日常', '每次讀完和家人說一段'), v_start), 28),
    '{plan,milestones}', jsonb_build_array(
      jsonb_build_object('title', '找到想讀的第一本書', 'targetDay', 3),
      jsonb_build_object('title', '連續三天各讀一段',   'targetDay', 7),
      jsonb_build_object('title', '讀完第一本',         'targetDay', 14),
      jsonb_build_object('title', '和家人分享讀到的事', 'targetDay', 21),
      jsonb_build_object('title', '挑好下一本想讀的',   'targetDay', 28))));
  PERFORM pg_temp.demo_expect(v_res, '四週閱讀計畫');

  -- 5. 整理書包 14 天｜短期支援｜有支援步驟
  v_res := create_parent_task_v1(jsonb_set(
    pg_temp.demo_long(pg_temp.demo_from(pg_temp.demo_command(
      d.child_id, d.family_id, '整理書包 14 天', 'short_support', 'life_routine',
      'long_term', 'short_support', 'progress_only', 'stabilize_and_exit', 'fixed_days',
      pg_temp.demo_plain('progress_only'), 'd0e70000-0000-4000-8000-0000000000a5'::uuid,
      '出門前不再手忙腳亂', '前一晚把書包整理好'), v_start), 14),
    '{plan,supportSteps}', jsonb_build_array(
      jsonb_build_object('id', 'step-1', 'text', '睡前對照隔天的課表'),
      jsonb_build_object('id', 'step-2', 'text', '把要帶的東西放進書包'),
      jsonb_build_object('id', 'step-3', 'text', '書包放在門邊固定的位置'))));
  PERFORM pg_temp.demo_expect(v_res, '整理書包 14 天');

  -- 6. 四週餐桌小幫手｜家庭角色｜有負責內容
  v_res := create_parent_task_v1(jsonb_set(
    pg_temp.demo_long(pg_temp.demo_from(pg_temp.demo_command(
      d.child_id, d.family_id, '四週餐桌小幫手', 'family_role', 'family_participation',
      'long_term', 'family_role', 'family_contribution', 'review_and_continue', 'fixed_days',
      pg_temp.demo_plain('family_contribution'), 'd0e70000-0000-4000-8000-0000000000a6'::uuid,
      '成為餐桌上固定的一份力', '開飯前後照約定完成'), v_start), 28),
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

-- ── 第七筆：技能學習類（staged progression）─────────────────────────────────
--
-- create_parent_task_v1 的 plan_mode CHECK 只允許 growth_plan / short_support /
-- family_role（見 20260728000000_task_drawer_persistence_v1.sql），不支援
-- skill —— 這是全產品共通的洞，不是這支腳本特有的，所以這一筆沒有 RPC 可走。
--
-- 欄位形狀對齊 createSkillGoal()（src/lib/taskActions.ts）：tasks
-- （is_long_term/long_term_type='skill'）+ long_term_goals（里程碑存於
-- level_definitions）+ child_tasks。少了 child_tasks，孩子端連「記下今天的
-- 完成」都按不下去（complete_task 會回 task_not_assigned）—— LT-FINAL-1.1
-- 之前 createSkillGoal 故意不建這張，是這包順便修掉的產品層級的洞。
--
-- reward_policy 刻意留 NULL，跟 createSkillGoal() 現況一致：技能類的幣值
-- 由 level_definitions 各階段管理，透過里程碑確認發放（P5b，尚未實作）；
-- 每次 session check-in 本身不發幣，不是漏了設定。
DO $skill$
DECLARE
  d demo_input%ROWTYPE;
  v_task_id uuid;
BEGIN
  SELECT * INTO d FROM demo_input;

  INSERT INTO tasks (
    family_id, name, category, day_type, is_long_term, long_term_type,
    base_time_min, difficulty, coin_override, time_saving_min,
    is_system_default, allow_repeat, min_age, max_age, is_active,
    recurrence_days
  ) VALUES (
    d.family_id, '學會騎腳踏車', 'D', 'both', true, 'skill',
    0, 1, NULL, 0,
    false, false, 0, 99, true,
    ARRAY[1, 3, 5]
  ) RETURNING id INTO v_task_id;

  INSERT INTO long_term_goals (
    child_id, task_id, goal_type, status, current_day, total_days,
    checkpoint_rewards, level_definitions, current_level, level_count,
    started_at, interrupt_count
  ) VALUES (
    d.child_id, v_task_id, 'skill', 'active', 0, 90,
    NULL,
    jsonb_build_array(
      jsonb_build_object('id', 'lv-1', 'name', '認識腳踏車與安全裝備', 'coin', 10),
      jsonb_build_object('id', 'lv-2', 'name', '扶著慢慢滑行、抓平衡', 'coin', 23),
      jsonb_build_object('id', 'lv-3', 'name', '能自己踩踏板前進',     'coin', 37),
      jsonb_build_object('id', 'lv-4', 'name', '能自己上下車、轉彎',   'coin', 50)
    ),
    0, 4,
    pg_temp.demo_this_monday() - 7, 0
  );

  INSERT INTO child_tasks (child_id, task_id, is_active)
    VALUES (d.child_id, v_task_id, true);
END
$skill$;

-- ── State A：背景生活紀錄 ───────────────────────────────────────────────────
--
-- 這一段讓 Demo 家庭看起來「已經運作了一陣子」，週報有得比、AI 顧問答得出
-- 「這禮拜」、錢包不是 0。核心的閱讀故事**不在這裡** —— 那要留給現場 live 跑。
--
-- 日期全部相對「執行當下的 Asia/Taipei ISO 週一」推導，沒有任何寫死的日曆日。
-- 只落在週一／週三／週五：六筆任務的 recurrence_days 就是 [1,3,5]，
-- 排定日以外的完成會被 validRhythmCompletions 丟掉，孩子端看不到、
-- 週報卻算得到 —— 那種不一致比少一筆紀錄糟得多。
--
-- 上週固定三天都在，本週只用「已經過去的」週一/三/五：
-- 所以週一執行時本週只有一天可用，四筆就疊在那一天（不同任務、合法），
-- 週日執行時則自然攤成三天。哪一天跑都拿得到合理資料。
--
-- 「完成學校作業」刻意不完成 —— 它是 day_type='once'，完成後 child_tasks
-- 會被停用，孩子端今天就少一件事可做。留著它當「今天還沒做的那一件」。
--
-- 類別覆蓋：A（整理書包）、B（餐後整理、餐桌小幫手）、D（運動練習、閱讀計畫、
-- 學會騎腳踏車）。
-- **C（自主挑戰）本來就沒有**，背景任務裡沒有 C —— 而這是對的：
-- C 依定義來自孩子自己提出，那正是 Demo 要現場 live 跑的那條故事線。
-- State A 的 C 是空的，代表「孩子還沒提出想法」，不是資料缺漏。

DO $history$
DECLARE
  d demo_input%ROWTYPE;
  v_today       date := (now() AT TIME ZONE 'Asia/Taipei')::date;
  v_this_monday date := pg_temp.demo_this_monday();
  v_last_monday date := pg_temp.demo_this_monday() - 7;
  v_elapsed     date[] := ARRAY[]::date[];
  v_day         date;
  v_exercise uuid;
  v_dinner   uuid;
  v_reading  uuid;
  v_bag      uuid;
  v_helper   uuid;
  v_bike     uuid;
  v_n        int;
BEGIN
  SELECT * INTO d FROM demo_input;

  -- create_parent_task_v1 用過的同一個身分；complete_task 的家庭授權
  -- 也是看 auth.uid()。set_config 是 transaction-local，這裡重設一次比較明確。
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', d.parent_user::text,
                                       'role', 'authenticated')::text, true);

  SELECT id INTO v_exercise FROM tasks WHERE family_id = d.family_id AND name = '運動練習';
  SELECT id INTO v_dinner   FROM tasks WHERE family_id = d.family_id AND name = '餐後整理';
  SELECT id INTO v_reading  FROM tasks WHERE family_id = d.family_id AND name = '四週閱讀計畫';
  SELECT id INTO v_bag      FROM tasks WHERE family_id = d.family_id AND name = '整理書包 14 天';
  SELECT id INTO v_helper   FROM tasks WHERE family_id = d.family_id AND name = '四週餐桌小幫手';
  SELECT id INTO v_bike     FROM tasks WHERE family_id = d.family_id AND name = '學會騎腳踏車';

  IF v_exercise IS NULL OR v_dinner IS NULL OR v_reading IS NULL
     OR v_bag IS NULL OR v_helper IS NULL OR v_bike IS NULL THEN
    RAISE EXCEPTION '背景紀錄找不到對應任務，seed 的任務名稱可能被改過了';
  END IF;

  -- ── 上週：三天、五筆 ──────────────────────────────────────────────────────
  PERFORM pg_temp.demo_complete(v_exercise, d.child_id, v_last_monday,     19, 'after_dinner', 'self_started');
  PERFORM pg_temp.demo_complete(v_bag,      d.child_id, v_last_monday,     21, 'before_bed',   'reminded');
  PERFORM pg_temp.demo_complete(v_dinner,   d.child_id, v_last_monday + 2, 19, 'after_dinner', 'self_started');
  PERFORM pg_temp.demo_complete(v_reading,  d.child_id, v_last_monday + 2, 21, 'before_bed',   'reminded');
  PERFORM pg_temp.demo_complete(v_exercise, d.child_id, v_last_monday + 4, 19, 'after_dinner', 'self_started');

  -- 技能類：兩次練習紀錄，只是「今天有練」的 session check-in，不會推進
  -- current_level（LT-FINAL-1.1 §D：session check-in ≠ progress advancement，
  -- 階段前進要靠家長之後確認，不是自動累加）。
  --
  -- planned_time_window 是既有的窄欄位（20260727000000），CHECK 只允許
  -- after_dinner / before_bed 兩種值 —— 不是這一筆才有的限制。
  PERFORM pg_temp.demo_complete(v_bike, d.child_id, v_last_monday,     19, 'after_dinner', 'self_started');
  PERFORM pg_temp.demo_complete(v_bike, d.child_id, v_last_monday + 2, 19, 'after_dinner', 'reminded');

  -- ── 本週：已經過去的週一/三/五，四筆 ─────────────────────────────────────
  FOREACH v_day IN ARRAY ARRAY[v_this_monday, v_this_monday + 2, v_this_monday + 4] LOOP
    IF v_day <= v_today THEN
      v_elapsed := v_elapsed || v_day;
    END IF;
  END LOOP;

  v_n := array_length(v_elapsed, 1);
  IF v_n IS NULL OR v_n < 1 THEN
    RAISE EXCEPTION '本週沒有任何已經過去的排定日，日期推導有問題';
  END IF;

  -- 四筆輪流落在那些日子上。週一到週二執行時 v_n = 1，四筆就疊在同一天 ——
  -- 不同任務不會撞 idx_unique_task_per_day，所以合法；週日執行則自然攤成三天。
  PERFORM pg_temp.demo_complete(v_exercise, d.child_id, v_elapsed[(0 % v_n) + 1], 19, 'after_dinner', 'self_started');
  PERFORM pg_temp.demo_complete(v_reading,  d.child_id, v_elapsed[(1 % v_n) + 1], 21, 'before_bed',   'reminded');
  PERFORM pg_temp.demo_complete(v_dinner,   d.child_id, v_elapsed[(2 % v_n) + 1], 19, 'after_dinner', 'self_started');
  PERFORM pg_temp.demo_complete(v_helper,   d.child_id, v_elapsed[(3 % v_n) + 1], 19, 'after_dinner', 'reminded');
END
$history$;

-- 背景紀錄的自我驗證：錢包必須等於 transaction 之和，而且每一筆 earn
-- 都要指得回一次真的完成。有餘額沒交易，是這份 seed 最不該出現的東西。
DO $wallet_check$
DECLARE
  v_child  CONSTANT uuid := 'd0e70000-0000-4000-8000-000000000021';
  v_balance int;
  v_sum     int;
  v_orphan  int;
  v_count   int;
BEGIN
  SELECT balance INTO v_balance FROM wallets
   WHERE child_id = v_child AND wallet_type = 'spending';

  SELECT COALESCE(sum(t.amount), 0) INTO v_sum
  FROM transactions t
  WHERE t.wallet_id IN (SELECT id FROM wallets WHERE child_id = v_child);

  IF v_balance IS DISTINCT FROM v_sum THEN
    RAISE EXCEPTION '錢包餘額 % 與交易總和 % 不符', v_balance, v_sum;
  END IF;

  SELECT count(*) INTO v_orphan
  FROM transactions t
  WHERE t.wallet_id IN (SELECT id FROM wallets WHERE child_id = v_child)
    AND t.type = 'earn'
    AND NOT EXISTS (
      SELECT 1 FROM task_completions tc
      WHERE tc.id = t.reference_id AND t.reference_type = 'task_completion');

  IF v_orphan <> 0 THEN
    RAISE EXCEPTION '有 % 筆 earn 交易追不回任何一次完成', v_orphan;
  END IF;

  SELECT count(*) INTO v_count FROM task_completions WHERE child_id = v_child;
  IF v_count <> 11 THEN
    RAISE EXCEPTION '背景完成紀錄應該是 11 筆（上週 5 + 本週 4 + 技能練習 2），實際 %', v_count;
  END IF;
END
$wallet_check$;

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

-- State A 的背景紀錄：哪一天、哪個任務、幾枚幣。
SELECT (tc.completed_at AT TIME ZONE 'Asia/Taipei')::date AS on_date,
       to_char((tc.completed_at AT TIME ZONE 'Asia/Taipei'), 'Dy') AS weekday,
       t.name, t.category, tc.coin_earned, tc.start_mode, tc.planned_time_window
FROM task_completions tc
JOIN tasks t ON t.id = tc.task_id
WHERE tc.child_id = 'd0e70000-0000-4000-8000-000000000021'::uuid
ORDER BY tc.completed_at;
