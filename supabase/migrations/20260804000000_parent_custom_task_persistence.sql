-- Shadow Wallet — parent_custom 任務的持久化契約（第九階段 B）
--
-- ─────────────────────────────────────────────────────────────────────────
-- 第九階段 A 證明了「自己建立任務」可以共用 TaskDraft、五種 editor 與
-- 整套驗證。它卡在最後一段：**命令與 RPC 表達不了 parent_custom。**
--
-- 具體是四件事：
--   1. command.preset 必填
--   2. metadata.createdFromPreset 的型別是字面量 true
--   3. create_parent_task_v1 的 INSERT 把 created_from_preset 寫死 true
--   4. 稽核事件的 event_type 寫死 'created_from_preset'
--
-- 這一支解決它們，另外處理三件在盤點時浮出來的事：
--
--   · 家庭參與的回饋方式（舊規則連 record_only 都擋）
--   · 回饋支持意圖（成長幣是暫時支持還是家庭既有約定）
--   · complete_task 讓 category 暗中覆蓋 reward_policy
--
-- ⚠️ **不刪任何欄位、不清任何資料、不改 coin-policy.json。**
--    created_from_preset 保留為相容欄位，creation_source 才是新的
--    source of truth。舊查詢一行都不必改。
--
-- ⚠️ 這支不會讓 A／B 類發幣變成可能。B 類擋在
--    B_COIN_POLICY_NOT_CONFIGURED，而那需要產品拍板的幣值數字。
-- ─────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. creation_source
--
-- 為什麼不是 boolean：created_from_preset 只分得出「是不是預設卡片」。
-- 未來還會有 child_proposal、wish_plan、copied_task ——
-- 那時候再加第二個 boolean 會變成一組互斥旗標，而互斥旗標一定會出現
-- 兩個同時為 true 的資料列。
--
-- 為什麼允許 'legacy'（策略 B）：
--
--   抽屜上線前建立的任務，created_from_preset 是 false，但它們**不是**
--   parent_custom —— 它們來自舊的 taskActions、system_task_templates 或
--   onboarding 推薦。把它們標成 parent_custom 是在偽造歷史。
--
--   為了讓欄位 NOT NULL 而假裝知道舊資料的來源，代價是永遠分不出
--   「家長自己寫的」與「系統當年塞的」。'legacy' 誠實得多。
--
--   新資料只會是 preset 或 parent_custom —— RPC 只接受這兩個值。
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS creation_source text;

-- 回填。順序重要：先填值再加 NOT NULL，否則既有列會擋住 ALTER。
UPDATE tasks
   SET creation_source = CASE WHEN created_from_preset THEN 'preset' ELSE 'legacy' END
 WHERE creation_source IS NULL;

ALTER TABLE tasks
  ALTER COLUMN creation_source SET DEFAULT 'legacy';

ALTER TABLE tasks
  ALTER COLUMN creation_source SET NOT NULL;

-- DEFAULT 'legacy' 是給**非 RPC 的插入路徑**用的（舊的 taskActions、
-- onboarding 推薦、system_task_templates）。那些路徑確實不是抽屜建立的，
-- 標成 legacy 是正確的描述，不是遷就。
COMMENT ON COLUMN tasks.creation_source IS
  '建立來源：preset（預設抽屜）/ parent_custom（家長自訂）/ legacy（抽屜上線前或非抽屜路徑）。'
  'created_from_preset 是相容欄位，這一欄才是 source of truth。';

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_creation_source_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_creation_source_check
  CHECK (creation_source IN ('preset', 'parent_custom', 'legacy'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. created_from_preset 一致性
--
-- 禁止的兩種組合：
--   creation_source = 'parent_custom' 而 created_from_preset = true
--   creation_source = 'preset'        而 created_from_preset = false
--
-- 不一致的資料列會讓**兩邊的查詢各自說一套**，而且都看起來正常。
-- legacy 不受限制：那些列的 created_from_preset 是歷史事實，不該被改寫。
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_creation_source_preset_consistency;
ALTER TABLE tasks ADD CONSTRAINT tasks_creation_source_preset_consistency
  CHECK (
    creation_source = 'legacy'
    OR (creation_source = 'preset'        AND created_from_preset)
    OR (creation_source = 'parent_custom' AND NOT created_from_preset)
  );

-- preset 一定有家族與版本；parent_custom 一定沒有。
-- 這是「不使用假的 preset id」在資料庫層的落實 ——
-- 型別擋得住我們自己的程式碼，擋不住手動 INSERT。
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_creation_source_preset_ids;
ALTER TABLE tasks ADD CONSTRAINT tasks_creation_source_preset_ids
  CHECK (
    creation_source <> 'parent_custom'
    OR (preset_family_id IS NULL AND preset_variant_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS tasks_creation_source_idx
  ON tasks (creation_source);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Reward support metadata
--
-- 為什麼是 tasks 的正式欄位，而不是只放 audit snapshot：
--
--   snapshot 是「當時送出的是什麼」，它不該被查詢當成現況來源。
--   而這兩個值需要出現在列表、詳情、週報，並且在到期時提醒回顧 ——
--   那些都是 SELECT，不是稽核回溯。放在 snapshot 裡等於要求每個查詢
--   去解一包 JSON，而且改不了（snapshot 是不可變的）。
--
--   家長之後要能修改支持意圖，那更不可能改 snapshot。
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS reward_support_intent            text,
  ADD COLUMN IF NOT EXISTS reward_support_review_after_days integer;

COMMENT ON COLUMN tasks.reward_support_intent IS
  '以成長幣回饋時的支持意圖：default / temporary_startup_support / family_defined_agreement。'
  '暫時支持會提醒回顧；家庭自訂約定不提醒 —— 那是家庭既有的制度，不是待修正的狀態。';

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_reward_support_intent_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_reward_support_intent_check
  CHECK (
    reward_support_intent IS NULL
    OR reward_support_intent IN
       ('default', 'temporary_startup_support', 'family_defined_agreement')
  );

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_reward_support_review_positive;
ALTER TABLE tasks ADD CONSTRAINT tasks_reward_support_review_positive
  CHECK (
    reward_support_review_after_days IS NULL
    OR reward_support_review_after_days > 0
  );

-- 暫時支持一定要有回顧時間 —— 沒有回顧的「暫時」就是永久。
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_reward_support_temporary_needs_review;
ALTER TABLE tasks ADD CONSTRAINT tasks_reward_support_temporary_needs_review
  CHECK (
    reward_support_intent IS DISTINCT FROM 'temporary_startup_support'
    OR reward_support_review_after_days IS NOT NULL
  );

-- 反過來也要成立：回顧天數只屬於暫時支持。
-- 掛在別的意圖上會變成一個沒有人知道意義的數字，而週報會照著它提醒。
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_reward_support_review_scope;
ALTER TABLE tasks ADD CONSTRAINT tasks_reward_support_review_scope
  CHECK (
    reward_support_review_after_days IS NULL
    OR reward_support_intent = 'temporary_startup_support'
  );

-- 不發幣的任務沒有「外在支持」可言。
-- 允許 default 是為了讓呼叫端可以無條件帶這個欄位。
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_reward_support_requires_coin;
ALTER TABLE tasks ADD CONSTRAINT tasks_reward_support_requires_coin
  CHECK (
    reward_support_intent IS NULL
    OR reward_support_intent = 'default'
    OR reward_policy = 'coin_eligible'
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. 稽核事件型別
--
-- 保留 created_from_preset，新增 created_parent_custom。
--
-- 為什麼不直接統一成 task_created + payload.creationSource（那是更好的
-- 長期形狀）：改名需要動歷史資料列，而歷史稽核紀錄是最不該被改寫的東西。
-- 統一的時機是 child_proposal / wish_plan 真的出現時 ——
-- 屆時一次處理，新增的值才不會又是一個一次性的補丁。
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE task_change_events DROP CONSTRAINT IF EXISTS task_change_events_type_check;
ALTER TABLE task_change_events ADD CONSTRAINT task_change_events_type_check
  CHECK (event_type IN (
    'created_from_preset',
    'created_parent_custom',
    'updated_from_preset',
    'archived'
  ));



-- ═══════════════════════════════════════════════════════════════════════════
-- 5. preset_task_replay_payload
--
-- 只多一件事：relatedIds 要把 created_parent_custom 也算進去。
-- 其餘與 20260730000000 完全相同。
-- ═══════════════════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION public.preset_task_replay_payload(
  p_request_id uuid,
  p_child_id   uuid,
  p_family_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task    uuid;
  v_family  uuid;
  v_related uuid[] := ARRAY[]::uuid[];
  v_id      uuid;
BEGIN
  SELECT t.id, t.family_id INTO v_task, v_family
  FROM tasks t
  WHERE t.creation_request_id = p_request_id;

  -- 沒建立過 → 呼叫端照常往下走。
  IF v_task IS NULL THEN
    RETURN NULL;
  END IF;

  -- 同一個識別碼落在別的家庭：這不是重送，是有人拿別人的（或猜到的）識別碼
  -- 來換取任務資訊。回 42501，而且**不要**在訊息裡透露那筆任務的任何內容。
  IF v_family IS DISTINCT FROM p_family_id THEN
    RAISE EXCEPTION 'Not authorized: creation request % belongs to another family',
                    p_request_id
      USING ERRCODE = '42501';
  END IF;

  -- family 對、child 不對：同一家庭裡換了孩子重送同一個識別碼。
  -- 一樣不建立第二筆，也不回傳另一個孩子的任務。
  IF NOT EXISTS (
    SELECT 1 FROM child_tasks ct
    WHERE ct.task_id = v_task AND ct.child_id = p_child_id
  ) THEN
    RAISE EXCEPTION 'Not authorized: creation request % belongs to another child',
                    p_request_id
      USING ERRCODE = '42501';
  END IF;

  -- relatedIds 的組成與建立當下一致：child_tasks → long_term_goals → 稽核事件。
  FOR v_id IN SELECT ct.id FROM child_tasks ct WHERE ct.task_id = v_task ORDER BY ct.id
  LOOP
    v_related := v_related || v_id;
  END LOOP;
  FOR v_id IN SELECT g.id FROM long_term_goals g WHERE g.task_id = v_task ORDER BY g.id
  LOOP
    v_related := v_related || v_id;
  END LOOP;
  FOR v_id IN
    SELECT e.id FROM task_change_events e
    -- 兩種建立事件都要算進去。只認 preset 的話，自訂任務重送時
    -- 回傳的 relatedIds 會比第一次少一筆 —— 呼叫端會以為東西不見了。
    WHERE e.task_id = v_task
      AND e.event_type IN ('created_from_preset', 'created_parent_custom')
    ORDER BY e.id
  LOOP
    v_related := v_related || v_id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'taskId', v_task,
    'relatedIds', to_jsonb(v_related),
    'idempotentReplay', true
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. create_parent_task_v1
--
-- 與 20260731000000 的差別：
--   · 讀取並驗證 creationSource，preset payload 與來源必須一致
--   · created_from_preset 由來源推導，不接受 client 指定
--   · 寫入 creation_source 與 reward support metadata
--   · 家庭參與的回饋方式修訂（B ＋ coin 改為政策未設定，而非永遠禁止）
--   · 選項答案只在 preset 來源寫入
--   · 稽核事件依來源選 event_type，snapshot 多記來源與支持意圖
--
-- **沒有分岔出第二份 INSERT。** 共用同一組 canonical 變數，
-- 只在 preset selection 那一段分支 —— 兩份 INSERT 遲早會有一份忘了更新。
-- ═══════════════════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION public.create_parent_task_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child_id        uuid;
  v_family_id       uuid;
  v_child_family    uuid;
  v_schema_version  int;

  v_meta_early      jsonb;
  v_request_raw     text;
  v_request_id      uuid;
  v_replay          jsonb;

  v_editor_kind     text;
  v_purpose         text;
  v_category        text;
  v_duration_type   text;
  v_plan_mode       text;
  v_source          text;
  v_reward          text;
  v_completion      text;
  v_completion_db   text;
  v_preset_family   text;
  v_preset          jsonb;
  v_creation_source text;
  v_support_intent  text;
  v_support_review  int;
  v_event_type      text;
  v_preset_variant  text;

  v_schedule        jsonb;
  v_review          jsonb;
  v_plan            jsonb;
  v_role            jsonb;
  v_content         jsonb;
  v_meta            jsonb;

  v_decision        jsonb;
  v_decision_policy text;
  v_eligibility     text;
  v_coin            jsonb;
  v_coin_final      int;
  v_coin_suggested  int;
  v_coin_min        int;
  v_coin_max        int;
  v_task_policy_version   text;
  v_reward_policy_version text;

  v_schedule_mode   text;
  v_weekly_freq     int;
  v_start_date      date;
  v_scheduled_date  date;
  v_end_date        date;
  v_recurrence      integer[];
  v_estimated_min   int;
  v_support_level   text;

  v_claim_period    text;
  v_max_claims      int;
  v_day_type        text;
  v_long_term_type  text;

  v_task_id         uuid;
  v_child_task_id   uuid;
  v_goal_id         uuid;
  v_event_id        uuid;
  v_related         uuid[] := ARRAY[]::uuid[];

  v_item            jsonb;
  v_idx             int;
  v_group           text;
  v_option          text;
  v_custom          text;
  v_selections      jsonb;
  v_customs         jsonb;
BEGIN
  -- ── 1. 呼叫者 ────────────────────────────────────────────────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized: create_parent_task_v1 requires an authenticated parent'
      USING ERRCODE = '42501';
  END IF;

  v_meta_early := COALESCE(p_command -> 'metadata', '{}'::jsonb);

  -- ── 2. 命令版本 ──────────────────────────────────────────────────────────
  v_schema_version := COALESCE((p_command ->> 'schemaVersion')::int, 0);
  IF v_schema_version <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('不支援的命令版本：%s', COALESCE(p_command ->> 'schemaVersion', 'null'))
    );
  END IF;

  v_child_id  := NULLIF(p_command ->> 'childId', '')::uuid;
  v_family_id := NULLIF(p_command ->> 'familyId', '')::uuid;

  IF v_child_id IS NULL OR v_family_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少 childId 或 familyId'
    );
  END IF;

  -- ── 3-5. child 存在、family_id 一致 ──────────────────────────────────────
  SELECT c.family_id INTO v_child_family FROM children c WHERE c.id = v_child_id;
  IF v_child_family IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '找不到這個孩子'
    );
  END IF;

  IF v_child_family <> v_family_id THEN
    RAISE EXCEPTION 'Not authorized: command familyId does not match child %', v_child_id
      USING ERRCODE = '42501';
  END IF;

  -- ── 6. 呼叫者對這個 family 有權限 ────────────────────────────────────────
  -- 集合比對，不是 LIMIT 1：一個 auth 帳號可能有多筆 parents。
  IF NOT EXISTS (
    SELECT 1 FROM parents p
    WHERE p.user_id = auth.uid() AND p.family_id = v_child_family
  ) THEN
    RAISE EXCEPTION 'Not authorized: caller does not belong to family %', v_child_family
      USING ERRCODE = '42501';
  END IF;

  -- ── 6b. 建立請求識別碼（idempotency）─────────────────────────────────────
  -- 放在授權之後、任何寫入之前。
  --
  -- 順序是刻意的：先確定呼叫者屬於這個家庭，再拿 requestId 去查既有任務。
  -- 反過來的話，一個沒有權限的呼叫者可以用「有沒有查到」當作探測手段。
  v_request_raw := NULLIF(btrim(COALESCE(v_meta_early ->> 'clientRequestId', '')), '');

  IF v_request_raw IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少建立請求識別碼'
    );
  END IF;

  -- 先用正規表達式擋，不要直接 ::uuid ——
  -- 格式錯誤的字串會拋 22P02，那對呼叫端來說是一個看不懂的資料庫錯誤，
  -- 而這其實是「命令有問題」，該回 VALIDATION_FAILED。
  IF v_request_raw !~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('建立請求識別碼格式不正確：%s', v_request_raw)
    );
  END IF;

  v_request_id := v_request_raw::uuid;

  -- 同一個識別碼已經建立過 → 回傳原本那一筆，不再新增。
  -- 這是「RPC 成功但 response 沒回到 client」之後家長再按一次的情況。
  v_replay := public.preset_task_replay_payload(v_request_id, v_child_id, v_family_id);
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  -- ── 取出各區塊 ──────────────────────────────────────────────────────────
  v_schedule := COALESCE(p_command -> 'schedule', '{}'::jsonb);
  v_review   := p_command -> 'review';
  v_plan     := p_command -> 'plan';
  v_role     := p_command -> 'role';
  v_content  := COALESCE(p_command -> 'content', '{}'::jsonb);
  v_meta     := COALESCE(p_command -> 'metadata', '{}'::jsonb);
  v_decision := p_command -> 'reward' -> 'decision';

  v_editor_kind    := v_meta ->> 'editorKind';
  v_purpose        := p_command -> 'task' ->> 'purposeCategory';
  v_duration_type  := p_command -> 'task' ->> 'durationType';
  v_plan_mode      := p_command -> 'task' ->> 'planMode';
  v_source         := p_command -> 'task' ->> 'source';
  v_reward         := p_command -> 'task' ->> 'rewardPolicy';
  v_completion     := p_command -> 'task' ->> 'completionPolicy';
  v_preset         := p_command -> 'preset';
  v_preset_family  := v_preset ->> 'familyId';
  v_preset_variant := v_preset ->> 'variantId';

  -- 建立來源。舊命令沒有這個欄位 —— 帶著 preset payload 的一律視為 preset，
  -- 兩者都沒有的則要求明講，不猜。
  v_creation_source := NULLIF(btrim(COALESCE(p_command ->> 'creationSource', '')), '');
  IF v_creation_source IS NULL AND v_preset IS NOT NULL THEN
    v_creation_source := 'preset';
  END IF;

  v_support_intent := NULLIF(btrim(COALESCE(p_command -> 'rewardSupport' ->> 'intent', '')), '');
  v_support_review := NULLIF(btrim(COALESCE(p_command -> 'rewardSupport' ->> 'reviewAfterDays', '')), '')::int;

  v_schedule_mode  := v_schedule ->> 'mode';
  v_weekly_freq    := NULLIF(v_schedule ->> 'weeklyFrequency', '')::int;
  v_start_date     := NULLIF(v_schedule ->> 'startDate', '')::date;
  v_scheduled_date := NULLIF(v_schedule ->> 'scheduledDate', '')::date;
  v_end_date       := NULLIF(v_schedule ->> 'endDate', '')::date;
  v_estimated_min  := NULLIF(v_schedule ->> 'estimatedMinutes', '')::int;
  v_support_level  := p_command -> 'support' ->> 'level';

  SELECT COALESCE(array_agg(value::int ORDER BY value::int), ARRAY[]::integer[])
  INTO v_recurrence
  FROM jsonb_array_elements_text(COALESCE(v_schedule -> 'recurrenceDays', '[]'::jsonb));

  -- ── 7. purposeCategory → category ────────────────────────────────────────
  v_category := public.map_purpose_category(v_purpose);
  IF v_category IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('未知的任務目的：%s', COALESCE(v_purpose, 'null'))
    );
  END IF;

  v_completion_db := public.map_completion_policy(v_completion);
  IF v_completion_db IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('未知的結束方式：%s', COALESCE(v_completion, 'null'))
    );
  END IF;

  -- ── 基本必填 ────────────────────────────────────────────────────────────
  IF COALESCE(btrim(p_command -> 'task' ->> 'title'), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VALIDATION_FAILED', 'message', '缺少任務名稱');
  END IF;

  IF COALESCE(btrim(p_command -> 'task' ->> 'completionDescription'), '') = '' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '缺少完成標準'
    );
  END IF;

  IF v_duration_type IS NULL OR v_schedule_mode IS NULL OR v_reward IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少期間形式、排程方式或回饋方式'
    );
  END IF;

  IF v_start_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VALIDATION_FAILED', 'message', '缺少開始日期');
  END IF;

  -- ══ 7b. 建立來源 ════════════════════════════════════════════════════════
  --
  -- 來源決定「有沒有 preset payload」，而且是**互斥**的。
  -- 兩者不一致時一律拒絕 —— 一筆 creation_source = parent_custom 卻帶著
  -- preset_family_id 的任務，之後沒有任何查詢分得出它到底是什麼。
  IF v_creation_source IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少建立來源'
    );
  END IF;

  IF v_creation_source NOT IN ('preset', 'parent_custom') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('未知的建立來源：%s', v_creation_source)
    );
  END IF;

  IF v_creation_source = 'preset' THEN
    IF v_preset IS NULL
      OR COALESCE(btrim(COALESCE(v_preset_family, '')), '') = ''
      OR COALESCE(btrim(COALESCE(v_preset_variant, '')), '') = '' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'message', '預設任務必須帶 preset 的家族與版本'
      );
    END IF;
    IF COALESCE(btrim(COALESCE(v_meta ->> 'presetCatalogVersion', '')), '') = '' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'message', '預設任務必須帶 catalog 版本'
      );
    END IF;
  ELSE
    -- 自訂任務：**不接受任何 preset 痕跡**，包含空字串。
    -- 空字串比 NULL 更危險 —— 它看起來像「有填」，查詢時卻對不到任何家族。
    IF v_preset IS NOT NULL OR v_preset_family IS NOT NULL OR v_preset_variant IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'message', '自訂任務不可帶 preset 家族或版本'
      );
    END IF;
    IF COALESCE(btrim(COALESCE(v_meta ->> 'presetCatalogVersion', '')), '') <> '' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'message', '自訂任務不屬於任何 catalog 版本'
      );
    END IF;
    IF jsonb_typeof(v_content -> 'selectedOptions') = 'object'
      AND (SELECT count(*) FROM jsonb_object_keys(v_content -> 'selectedOptions')) > 0 THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'message', '自訂任務沒有預設選項，不可帶 selectedOptions'
      );
    END IF;
  END IF;

  -- ══ 8. 政策 guard（全部在 insert 之前）══════════════════════════════════════════════════════════════════

  -- E. 時間儲蓄：完成與兌換鏈路尚未打通，不可先建立起來慢慢累積。
  IF v_reward = 'time_saving_eligible' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'message', '時間儲蓄建立流程尚未啟用'
    );
  END IF;

  -- A. 家庭參與的回饋方式（第九階段 B 修訂）
  --
  -- 舊規則是「只能 family_contribution」，連 record_only 與 progress_only
  -- 都會被擋。那條規則把一個**教養主張**寫成了技術限制 ——
  -- 它擋住的不是壞決定，是那些家裡本來就有零用錢制度的家庭。
  --
  -- 修訂後：家庭貢獻仍是預設做法，記錄與進度肯定也合法。
  -- 成長幣在**產品概念上允許**，但目前沒有 B 類幣值政策 ——
  -- coin-policy.json 四個年齡段都只定義 C 與 D。
  --
  -- 所以這裡擋的理由是「政策尚未設定」，不是「永遠禁止」。
  IF v_category = 'B' AND v_reward = 'coin_eligible' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'B_COIN_POLICY_NOT_CONFIGURED',
      'message', '家庭參與的成長幣政策尚未設定，目前無法以成長幣建立這種任務'
    );
  END IF;

  -- A2. 回饋支持意圖。
  --
  -- 這個欄位存在的理由：一筆「家庭參與 ＋ 成長幣」的任務，半年後回頭看
  -- 有兩種完全不同的讀法 ——「當時孩子需要一點動力，說好三週後再看」，
  -- 或「我們家的家事本來就有零用錢」。前者該被提醒回顧，後者不該。
  IF v_support_intent IS NOT NULL THEN
    IF v_support_intent NOT IN
       ('default', 'temporary_startup_support', 'family_defined_agreement') THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'message', format('未知的回饋支持意圖：%s', v_support_intent)
      );
    END IF;

    -- 不發幣的任務沒有「外在支持」可言。允許 default 只是為了讓
    -- 呼叫端可以無條件帶這個欄位，不必自己判斷要不要省略。
    IF v_reward <> 'coin_eligible' AND v_support_intent <> 'default' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'message', '只有以成長幣回饋的任務才需要說明支持意圖'
      );
    END IF;

    IF v_support_intent = 'temporary_startup_support'
      AND (v_support_review IS NULL OR v_support_review <= 0) THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'message', '暫時的起步支持必須設定回顧時間'
      );
    END IF;
  END IF;

  -- 沒有意圖就不該有回顧天數 —— 那個數字會變成沒有人知道意義的孤兒欄位。
  IF v_support_review IS NOT NULL
    AND COALESCE(v_support_intent, 'default') <> 'temporary_startup_support' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '只有暫時的起步支持才需要回顧時間'
    );
  END IF;

  -- C. 家庭角色。
  IF v_plan_mode = 'family_role' THEN
    IF v_category <> 'B' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '家庭角色必須屬於家庭參與'
      );
    END IF;
    IF v_reward <> 'family_contribution' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '家庭角色的回饋固定為家庭貢獻'
      );
    END IF;
    IF v_completion_db <> 'review_and_continue' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '家庭角色必須期滿回顧後再決定'
      );
    END IF;
    IF v_role IS NULL
      OR jsonb_array_length(COALESCE(v_role -> 'responsibilities', '[]'::jsonb)) = 0 THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '家庭角色至少要有一項負責內容'
      );
    END IF;
  END IF;

  -- B. 生活小計畫（短期支援）。
  IF v_plan_mode = 'short_support' THEN
    IF v_reward <> 'progress_only' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '短期支援只以進度與肯定回饋'
      );
    END IF;
    IF v_completion_db <> 'stabilize_and_exit' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '短期支援必須穩定後結束'
      );
    END IF;
    IF v_end_date IS NULL OR COALESCE((v_plan ->> 'durationDays')::int, 0) <= 0 THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '短期支援必須有明確的期間與結束日'
      );
    END IF;
    IF jsonb_array_length(COALESCE(v_plan -> 'supportSteps', '[]'::jsonb)) = 0
      AND COALESCE(btrim(p_command -> 'task' ->> 'completionDescription'), '') = '' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '短期支援需要支援步驟或具體的完成標準'
      );
    END IF;
  END IF;

  -- D. 學校作業：本來就該完成的事，不作為固定幣源。
  IF v_preset_family = 'learn-school-assignment'
    AND v_reward NOT IN ('record_only', 'progress_only') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'message', '學校作業只能留下紀錄或以進度與肯定回饋'
    );
  END IF;

  -- F. 單次任務。
  IF v_duration_type = 'one_time' THEN
    IF v_completion_db <> 'complete_once' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '單次任務完成一次後即結束'
      );
    END IF;
    IF v_scheduled_date IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED', 'message', '單次任務需要安排日期'
      );
    END IF;
  END IF;

  IF v_duration_type = 'long_term' AND (v_end_date IS NULL OR v_end_date < v_start_date) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '長期任務的結束日不正確'
    );
  END IF;

  IF v_schedule_mode = 'weekly_frequency'
    AND (v_weekly_freq IS NULL OR v_weekly_freq < 1 OR v_weekly_freq > 7) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '每週次數必須在 1–7 之間'
    );
  END IF;

  IF v_schedule_mode = 'fixed_days' AND COALESCE(array_length(v_recurrence, 1), 0) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '固定星期模式必須至少選一天'
    );
  END IF;

  -- ══ G. 回饋決策 ═════════════════════════════════════════════════════════
  -- 命令一定要帶決策。沒有決策就沒有「這個數字是誰算的、依據什麼」，
  -- 之後政策改版時也分不出舊任務是依哪一版定價的。
  v_decision_policy := v_decision ->> 'rewardPolicy';
  v_eligibility     := v_decision ->> 'eligibility';
  v_task_policy_version   := v_meta ->> 'taskPolicyVersion';
  v_reward_policy_version := v_decision ->> 'rewardPolicyVersion';

  IF v_decision IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少回饋決策'
    );
  END IF;

  -- 畫面顯示的回饋方式與決策的必須是同一個，否則家長看到的與實際會發的不同。
  IF v_decision_policy IS DISTINCT FROM v_reward THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'message', format('任務的回饋方式是 %s，決策的是 %s',
                        COALESCE(v_reward, 'null'), COALESCE(v_decision_policy, 'null'))
    );
  END IF;

  IF v_eligibility <> 'allowed' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'message', COALESCE(NULLIF(btrim(COALESCE(v_decision ->> 'explanation', '')), ''),
                          '這個回饋方式目前不能使用')
    );
  END IF;

  -- 兩個版本都是必填，而且是分開檢查的。
  --
  -- taskPolicyVersion  = 「目的怎麼分、來源要求什麼、怎麼結束」的規則版本
  -- rewardPolicyVersion = 「這筆回饋決策是哪一份政策做的」
  --
  -- 只存一個的話，半年後改了其中一份政策，就分不出舊任務是依哪一版建立的。
  -- 不發幣的任務同樣要有 rewardPolicyVersion —— 它記的是回饋資格政策的版本，
  -- 不是幣值政策的版本，不可以拿 taskPolicyVersion 冒充。
  IF COALESCE(btrim(COALESCE(v_task_policy_version, '')), '') = '' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少任務政策版本'
    );
  END IF;

  IF COALESCE(btrim(COALESCE(v_reward_policy_version, '')), '') = '' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '回饋決策缺少回饋政策版本'
    );
  END IF;

  -- ══ H. 成長幣 ═══════════════════════════════════════════════════════════
  v_coin := v_decision -> 'coin';

  IF v_reward = 'coin_eligible' THEN
    IF v_coin IS NULL OR jsonb_typeof(v_coin) <> 'object' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '可獲得成長幣的任務缺少幣值'
      );
    END IF;

    v_coin_final     := NULLIF(v_coin ->> 'finalAmount', '')::int;
    v_coin_suggested := NULLIF(v_coin ->> 'suggestedAmount', '')::int;
    v_coin_min       := NULLIF(v_coin ->> 'minAllowed', '')::int;
    v_coin_max       := NULLIF(v_coin ->> 'maxAllowed', '')::int;

    IF v_coin_final IS NULL OR v_coin_final <= 0 THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'message', '不建立 0 幣的成長幣任務：家長看到可獲得成長幣、孩子卻拿不到，等於系統壞了'
      );
    END IF;

    IF v_coin_min IS NULL OR v_coin_max IS NULL OR v_coin_min > v_coin_max THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '幣值缺少政策允許範圍'
      );
    END IF;

    IF v_coin_final < v_coin_min OR v_coin_final > v_coin_max THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'message', format('幣值 %s 不在政策允許的 %s–%s 範圍內',
                          v_coin_final, v_coin_min, v_coin_max)
      );
    END IF;
  ELSE
    -- 不發幣的政策不得夾帶金額 —— 就算命令裡有，也不寫進去。
    v_coin_final     := NULL;
    v_coin_suggested := NULL;
    v_coin_min       := NULL;
    v_coin_max       := NULL;
  END IF;

  -- ══ 9. claim 規則推導 ═══════════════════════════════════════════════════
  IF v_schedule_mode = 'one_time' THEN
    v_claim_period := 'once';
    v_max_claims   := 1;
    v_day_type     := 'once';
  ELSIF v_schedule_mode = 'weekly_frequency' THEN
    v_claim_period := 'week';
    v_max_claims   := v_weekly_freq;
    v_day_type     := 'both';
  ELSE
    v_claim_period := 'day';
    v_max_claims   := 1;
    v_day_type     := 'custom';
  END IF;

  -- 'responsibility' 不是 'family'：tasks.long_term_type 與 long_term_goals.goal_type
  -- 的 CHECK 只允許 habit / skill / responsibility / challenge。
  -- 寫 'family' 會在 INSERT 當下被 check constraint 擋下 —— 見檔頭說明。
  v_long_term_type := CASE v_plan_mode
    WHEN 'growth_plan'   THEN 'skill'
    WHEN 'short_support' THEN 'habit'
    WHEN 'family_role'   THEN 'responsibility'
    ELSE NULL
  END;

  -- ══ 10. tasks ═══════════════════════════════════════════════════════════
  -- base_time_min 仍然寫 0：它是舊公式的輸入，新任務的幣值一律走 reward_coin_amount。
  -- 兩條路徑不共用欄位，才不會有人改了其中一邊而另一邊悄悄跟著變。
  -- 競態：兩個 request 幾乎同時進來時，前面那段查詢兩邊都查不到，
  -- 於是兩邊都會走到這裡。unique index 讓其中一個拿到 23505，
  -- 那一個要回傳對方建立的結果，而不是 PERSISTENCE_FAILED。
  --
  -- 例外處理**只包住 tasks 這一個 INSERT**。子表（task_preset_selections 等）
  -- 的 unique 違反是真的資料問題，必須照樣往外拋、讓整筆回滾。
  BEGIN
    INSERT INTO tasks (
      family_id, name, category, day_type, recurrence_days, due_date,
      base_time_min, difficulty, coin_override, time_saving_min,
      is_system_default, allow_repeat, min_age, max_age, is_active,
      is_long_term, long_term_type,
      claim_period, max_claims_per_period,
      duration_type, plan_mode, task_source, reward_policy, completion_policy,
      original_expectation, completion_description, task_details, notes,
      schedule_mode, weekly_frequency, start_date, scheduled_date,
      preferred_time, preferred_time_custom, estimated_minutes,
      review_enabled, review_after_days, support_level,
      task_policy_version, reward_policy_version,
      preset_family_id, preset_variant_id, preset_catalog_version,
      command_schema_version, created_from_preset, creation_request_id,
      creation_source, reward_support_intent, reward_support_review_after_days,
      reward_coin_amount, reward_coin_suggested_amount, reward_coin_min, reward_coin_max
    ) VALUES (
      v_family_id,
      btrim(p_command -> 'task' ->> 'title'),
      v_category,
      v_day_type,
      CASE WHEN v_day_type = 'custom' THEN v_recurrence ELSE NULL END,
      NULL,                      -- due_date 不用來裝 scheduled_date
      0, 1, NULL, 0,
      false,
      (v_max_claims > 1),
      0, 99, true,
      (v_duration_type = 'long_term'),
      v_long_term_type,
      v_claim_period, v_max_claims,
      v_duration_type, v_plan_mode, v_source, v_reward, v_completion_db,
      NULLIF(btrim(COALESCE(p_command -> 'task' ->> 'originalExpectation', '')), ''),
      btrim(p_command -> 'task' ->> 'completionDescription'),
      NULLIF(btrim(COALESCE(v_content ->> 'taskDetails', '')), ''),
      NULLIF(btrim(COALESCE(p_command -> 'task' ->> 'notes', '')), ''),
      v_schedule_mode, v_weekly_freq, v_start_date, v_scheduled_date,
      v_schedule ->> 'preferredTime',
      NULLIF(btrim(COALESCE(v_schedule ->> 'preferredTimeCustom', '')), ''),
      v_estimated_min,
      (v_review ->> 'reviewEnabled')::boolean,
      NULLIF(v_review ->> 'reviewAfterDays', '')::smallint,
      v_support_level,
      -- 政策版本以決策上的為準：它才是真正算出這個金額的那一版。
      v_task_policy_version, v_reward_policy_version,
      v_preset_family, v_preset_variant,
      v_meta ->> 'presetCatalogVersion',
      -- created_from_preset 由來源推導，**不接受 client 直接指定** ——
      -- 兩個欄位不一致的資料列會讓所有既有查詢說謊。CHECK 也會再擋一次。
      v_schema_version, (v_creation_source = 'preset'), v_request_id,
      v_creation_source, v_support_intent, v_support_review,
      v_coin_final, v_coin_suggested, v_coin_min, v_coin_max
    )
    RETURNING id INTO v_task_id;
  EXCEPTION WHEN unique_violation THEN
    v_replay := public.preset_task_replay_payload(v_request_id, v_child_id, v_family_id);
    -- 撞的不是 creation_request_id（查不到對應任務）→ 不是 replay，照原樣拋出。
    IF v_replay IS NULL THEN
      RAISE;
    END IF;
    RETURN v_replay;
  END;

  -- ══ 11. child_tasks ═════════════════════════════════════════════════════
  INSERT INTO child_tasks (child_id, task_id, is_active)
  VALUES (v_child_id, v_task_id, true)
  RETURNING id INTO v_child_task_id;
  v_related := v_related || v_child_task_id;

  -- ══ 12. long_term_goals ═════════════════════════════════════════════════
  IF v_duration_type = 'long_term' THEN
    INSERT INTO long_term_goals (
      child_id, task_id, goal_type, status, current_day,
      total_days, started_at, end_date,
      first_review_after_days, weekend_review_enabled,
      role_title, interrupt_count
    ) VALUES (
      v_child_id, v_task_id, v_long_term_type, 'active', 0,
      COALESCE((v_plan ->> 'durationDays')::int, (v_schedule ->> 'durationDays')::int),
      v_start_date, v_end_date,
      NULLIF(v_review ->> 'firstReviewAfterDays', '')::smallint,
      (v_review ->> 'weekendReviewEnabled')::boolean,
      CASE WHEN v_plan_mode = 'family_role'
        THEN COALESCE(NULLIF(btrim(COALESCE(v_role ->> 'customValue', '')), ''),
                      v_role ->> 'optionId')
        ELSE NULL END,
      0
    )
    RETURNING id INTO v_goal_id;
    v_related := v_related || v_goal_id;
  END IF;

  -- ══ 13. 選項答案 ════════════════════════════════════════════════════════
  v_selections := COALESCE(v_content -> 'selectedOptions', '{}'::jsonb);
  v_customs    := COALESCE(v_content -> 'customOptionValues', '{}'::jsonb);

  -- 自訂任務沒有預設選項組，所以一列都不寫。
  -- 上面的來源 guard 已經擋掉「custom 卻帶 selectedOptions」的情況，
  -- 這裡再包一層是因為**零列**才是這一段真正的契約：
  -- 任何依賴 task_preset_selections 的查詢都不可以用 inner join。
  FOR v_group IN
    SELECT k FROM jsonb_object_keys(v_selections) AS k
    WHERE v_creation_source = 'preset'
  LOOP
    v_custom := NULLIF(btrim(COALESCE(v_customs ->> v_group, '')), '');
    FOR v_option IN
      SELECT value FROM jsonb_array_elements_text(v_selections -> v_group)
    LOOP
      INSERT INTO task_preset_selections (task_id, option_group_id, option_id, custom_value)
      VALUES (
        v_task_id, v_group, v_option,
        CASE WHEN v_option = 'other' THEN v_custom ELSE NULL END
      );
    END LOOP;
  END LOOP;

  -- ══ 14-15. 里程碑與支援步驟 ═════════════════════════════════════════════
  IF v_plan IS NOT NULL THEN
    v_idx := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_plan -> 'milestones', '[]'::jsonb))
    LOOP
      INSERT INTO task_plan_milestones (task_id, long_term_goal_id, title, target_day, sort_order)
      VALUES (
        v_task_id, v_goal_id,
        btrim(v_item ->> 'title'),
        NULLIF(v_item ->> 'targetDay', '')::int,
        v_idx
      );
      v_idx := v_idx + 1;
    END LOOP;

    v_idx := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_plan -> 'supportSteps', '[]'::jsonb))
    LOOP
      INSERT INTO task_plan_support_steps (task_id, long_term_goal_id, text, sort_order, is_custom)
      VALUES (
        v_task_id, v_goal_id,
        btrim(v_item ->> 'text'),
        v_idx,
        COALESCE((v_item ->> 'id') LIKE 'custom-%', false)
      );
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  -- ══ 16. 負責內容 ════════════════════════════════════════════════════════
  IF v_role IS NOT NULL THEN
    v_idx := 0;
    FOR v_item IN
      SELECT * FROM jsonb_array_elements(COALESCE(v_role -> 'responsibilities', '[]'::jsonb))
    LOOP
      INSERT INTO task_role_responsibilities
        (task_id, long_term_goal_id, text, sort_order, is_custom)
      VALUES (
        v_task_id, v_goal_id,
        btrim(v_item ->> 'text'),
        v_idx,
        COALESCE((v_item ->> 'isCustom')::boolean, false)
      );
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  -- ══ 17. 稽核事件 ════════════════════════════════════════════════════════
  --
  -- 兩種來源用兩種 event_type，而不是共用一個 task_created。
  --
  -- 理由是相容性：preset_task_replay_payload 與既有測試都依賴
  -- 'created_from_preset' 這個字面值。把既有事件改名需要動歷史資料，
  -- 而歷史稽核紀錄是最不該被改寫的東西。
  --
  -- 未來統一成 task_created + payload.creationSource 的計畫寫在
  -- docs/CUSTOM_TASK_PERSISTENCE.md。
  v_event_type := CASE
    WHEN v_creation_source = 'preset' THEN 'created_from_preset'
    ELSE 'created_parent_custom'
  END;
-- ══════════════════════════════════════════════════════
  -- reward 這一段刻意攤平成獨立鍵，而不是只靠 command 裡那份：
  -- 「這筆任務當初定價多少、依據什麼」要能用一句 SQL 查出來，不必解整包命令。
  INSERT INTO task_change_events (
    task_id, event_type, actor_user_id,
    task_policy_version, reward_policy_version, command_schema_version, snapshot
  ) VALUES (
    v_task_id, v_event_type, auth.uid(),
    v_task_policy_version, v_reward_policy_version, v_schema_version,
    jsonb_build_object(
      'command', p_command,
      -- 四種版本攤平成一個區塊。它們的變更頻率與影響範圍都不同：
      -- 加一個任務家族只動 catalog、改幣值只動 reward、改分類規則才動 task policy。
      -- 擠在同一個欄位的話，事後根本分不出「這筆任務為什麼跟現在的規則不一樣」。
      'versions', jsonb_build_object(
        'commandSchemaVersion',  v_schema_version,
        'presetCatalogVersion',  v_meta ->> 'presetCatalogVersion',
        'taskPolicyVersion',     v_task_policy_version,
        'rewardPolicyVersion',   v_reward_policy_version
      ),
      'creationSource', v_creation_source,
      'rewardSupport', jsonb_build_object(
        'intent',          v_support_intent,
        'reviewAfterDays', v_support_review
      ),
      'derived', jsonb_build_object(
        'category',         v_category,
        'completionPolicy', v_completion_db,
        'claimPeriod',      v_claim_period,
        'maxClaims',        v_max_claims,
        'dayType',          v_day_type
      ),
      'reward', jsonb_build_object(
        'rewardPolicy',        v_reward,
        'eligibility',         v_eligibility,
        'rewardPolicyVersion', v_reward_policy_version,
        'explanation',         v_decision ->> 'explanation',
        'suggestedAmount',     v_coin_suggested,
        'finalAmount',         v_coin_final,
        'minAllowed',          v_coin_min,
        'maxAllowed',          v_coin_max,
        'calculationBasis',    v_coin -> 'calculationBasis'
      )
    )
  )
  RETURNING id INTO v_event_id;
  v_related := v_related || v_event_id;

  -- ══ 18. 結果 ════════════════════════════════════════════════════════════
  RETURN jsonb_build_object(
    'ok', true,
    'taskId', v_task_id,
    'relatedIds', to_jsonb(v_related),
    -- false = 這一次真的建立了。true 只會從 preset_task_replay_payload 出來。
    'idempotentReplay', false
  );
END;
$$;


COMMENT ON FUNCTION public.create_parent_task_v1(jsonb) IS
  '從 CreateParentTaskCommand 原子建立任務，支援 preset 與 parent_custom 兩種來源。'
  '政策 guard（含成長幣決策）全部跑在 insert 之前；任何錯誤都回滾。'
  '以 metadata.clientRequestId 做 idempotency。'
  'created_from_preset 由 creationSource 推導，不接受 client 指定。';

REVOKE ALL ON FUNCTION public.create_parent_task_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_parent_task_v1(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_parent_task_v1(jsonb) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. complete_task —— 改為 reward-policy-driven
--
-- 只改幣值那一段。舊任務（reward_policy IS NULL）一個字沒動。
-- ═══════════════════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION complete_task(
  p_task_id             uuid,
  p_child_id            uuid,
  p_completed_at        timestamptz,
  p_is_prerequisite_met boolean,
  p_goal_id             uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task           record;
  v_child_family   uuid;
  v_coin_earned    int;
  v_time_saved     int;
  v_wallet_id      uuid;
  v_completion_id  uuid;
  v_new_day        int;
  v_rewards        jsonb;
  v_milestone_coin int;
  v_period_start   date;
  v_claim_count    int;
  v_legacy         boolean;
BEGIN
  -- ── 授權 ────────────────────────────────────────────────────────────────
  -- 先取這個孩子的 family，再問「呼叫者是不是這個 family 的家長」。
  -- 舊寫法是 `c.family_id = (SELECT family_id FROM parents WHERE user_id = auth.uid() LIMIT 1)`：
  -- 那是「取這個帳號的任意一筆 parents」，同一個帳號在兩個家庭時會挑錯，
  -- 而且它比對的是某個 family 而不是這個孩子的 family。
  SELECT c.family_id INTO v_child_family FROM children c WHERE c.id = p_child_id;
  IF v_child_family IS NULL THEN
    RAISE EXCEPTION 'Child not found: %', p_child_id USING ERRCODE = '42501';
  END IF;

  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM parents p
      WHERE p.user_id = auth.uid() AND p.family_id = v_child_family
    ) THEN
      RAISE EXCEPTION 'Not authorized: child % is not in the caller''s family', p_child_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Read task
  SELECT category, base_time_min, difficulty, coin_override,
         time_saving_min, long_term_type, day_type, allow_repeat,
         claim_period, max_claims_per_period, reward_policy,
         reward_coin_amount, family_id
  INTO v_task
  FROM tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  -- 任務與孩子必須同家庭。舊版只驗孩子，於是「自己家的孩子 ＋ 別人家的任務」過得去。
  IF v_task.family_id IS DISTINCT FROM v_child_family THEN
    RAISE EXCEPTION 'Not authorized: task % does not belong to child %''s family', p_task_id, p_child_id
      USING ERRCODE = '42501';
  END IF;

  v_legacy := (v_task.reward_policy IS NULL);

  IF NOT v_legacy AND v_task.reward_policy = 'time_saving_eligible' THEN
    RETURN jsonb_build_object('error', 'time_saving_not_enabled');
  END IF;

  -- Coin calculation
  IF v_legacy THEN
    -- 舊路徑：一個字沒改，包含前置解鎖 ×0.7。
    IF v_task.category IN ('A', 'B') THEN
      v_coin_earned := 0;
    ELSE
      v_coin_earned := ROUND(
        COALESCE(
          v_task.coin_override,
          ROUND(v_task.base_time_min::numeric * v_task.difficulty::numeric)
        )::numeric
        * CASE WHEN p_is_prerequisite_met THEN 1.0 ELSE 0.7 END
      );
    END IF;

    v_time_saved := CASE
      WHEN v_task.category = 'B' THEN COALESCE(v_task.time_saving_min, 0)
      ELSE 0
    END;
  ELSE
    -- 新路徑：金額在建立時就由 coin-policy.json 決定並凍結，這裡只讀不算。
    --
    -- 刻意不套前置解鎖 ×0.7：那個折扣的立足點已經被 2026-07 新分類動搖
    -- （6 歲以上 A 類退場、B 類不再商品化，「前置任務」實際只剩 B 類，見 DELTA §5），
    -- 而且把政策決定的金額打七折會直接掉出政策允許範圍 min–max。
    -- 舊任務維持原本的折扣行為，這個決定只影響新任務。
    -- ── 改為 reward-policy-driven（第九階段 B）──
    --
    -- 舊版是 `reward_policy = 'coin_eligible' AND category NOT IN ('A','B')`。
    -- 那個 AND 讓 **category 暗中覆蓋 reward_policy**：一筆
    -- reward_policy = coin_eligible 的 A 或 B 類任務，建立端說會發幣、
    -- 完成端卻給 0，而且沒有任何錯誤訊息。家長看到「完成後給予成長幣」，
    -- 孩子拿到 0 —— 兩邊都會覺得系統壞了。
    --
    -- 現在只看 reward_policy。category 只說明任務目的，不再參與發幣判斷。
    --
    -- 這不會立刻放行 A／B 發幣：建立端仍然擋著（B 類是
    -- B_COIN_POLICY_NOT_CONFIGURED）。這一步是為了讓那一天真的到來時，
    -- 不會出現「建得出來但完成拿 0」的隱性 bug。
    IF v_task.reward_policy = 'coin_eligible' THEN
      v_coin_earned := COALESCE(v_task.reward_coin_amount, 0);

      -- 0 幣的 coin_eligible 任務是不該存在的狀態（建立端的 guard H 要求
      -- 金額在政策範圍內且為正整數）。真的出現就是資料被繞過寫進去的，
      -- 這時**不要安靜地發 0** —— 那會讓孩子完成了卻什麼都沒拿到，
      -- 而紀錄上看起來一切正常。
      IF v_coin_earned <= 0 THEN
        RETURN jsonb_build_object('error', 'coin_amount_not_configured');
      END IF;
    ELSE
      v_coin_earned := 0;
    END IF;

    -- 新任務一律不寫 time_savings（SPEC 2026-07：家庭參與改以貢獻紀錄被看見）。
    v_time_saved := 0;
  END IF;

  -- Frequency guard
  IF v_task.claim_period = 'once' THEN
    SELECT count(*) INTO v_claim_count
    FROM task_completions
    WHERE child_id = p_child_id
      AND task_id  = p_task_id
      AND status   = 'completed';
  ELSE
    v_period_start := CASE
      WHEN v_task.claim_period = 'week'
        THEN date_trunc('week', (p_completed_at AT TIME ZONE 'Asia/Taipei'))::date
      ELSE (p_completed_at AT TIME ZONE 'Asia/Taipei')::date
    END;

    SELECT count(*) INTO v_claim_count
    FROM task_completions
    WHERE child_id = p_child_id
      AND task_id  = p_task_id
      AND status   = 'completed'
      AND (
        CASE
          WHEN v_task.claim_period = 'week'
            THEN date_trunc('week', (completed_at AT TIME ZONE 'Asia/Taipei'))::date
          ELSE (completed_at AT TIME ZONE 'Asia/Taipei')::date
        END
      ) = v_period_start;
  END IF;

  IF v_claim_count >= COALESCE(v_task.max_claims_per_period, 1) THEN
    RETURN jsonb_build_object('error', 'already_completed');
  END IF;

  -- 1. Insert task_completion
  INSERT INTO task_completions
    (task_id, child_id, completed_at, reported_by, status, coin_earned, time_saved_min)
  VALUES
    (p_task_id, p_child_id, p_completed_at, 'child', 'completed', v_coin_earned, v_time_saved)
  RETURNING id INTO v_completion_id;

  -- 2. award completion coins
  IF v_coin_earned > 0 THEN
    UPDATE wallets
    SET    balance = balance + v_coin_earned
    WHERE  child_id    = p_child_id
      AND  wallet_type = 'spending'
    RETURNING id INTO v_wallet_id;

    IF v_wallet_id IS NULL THEN
      RAISE EXCEPTION 'Spending wallet not found for child %', p_child_id;
    END IF;

    INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
    VALUES (v_wallet_id, v_coin_earned, 'earn', v_completion_id, 'task_completion');
  END IF;

  -- 3. legacy Task-B: record time savings（新任務 v_time_saved 恆為 0）
  IF v_task.category = 'B' AND v_time_saved > 0 THEN
    INSERT INTO time_savings (child_id, completion_id, minutes_saved)
    VALUES (p_child_id, v_completion_id, v_time_saved);
  END IF;

  -- 4. once task: deactivate from child's list
  IF v_task.day_type = 'once' THEN
    UPDATE child_tasks
    SET    is_active = false
    WHERE  task_id = p_task_id AND child_id = p_child_id;
  END IF;

  -- 5. Task-D habit: advance current_day, check for milestone reward
  v_milestone_coin := NULL;
  IF v_task.category = 'D'
    AND v_task.long_term_type = 'habit'
    AND p_goal_id IS NOT NULL
  THEN
    UPDATE long_term_goals
    SET    current_day = current_day + 1
    WHERE  id = p_goal_id
    RETURNING current_day, checkpoint_rewards INTO v_new_day, v_rewards;

    IF v_rewards IS NOT NULL THEN
      v_milestone_coin := (v_rewards->>(v_new_day::text))::int;
    END IF;

    IF v_milestone_coin IS NOT NULL THEN
      IF v_wallet_id IS NULL THEN
        SELECT id INTO v_wallet_id
        FROM wallets
        WHERE child_id = p_child_id AND wallet_type = 'spending';
      END IF;

      IF v_wallet_id IS NOT NULL THEN
        UPDATE wallets SET balance = balance + v_milestone_coin WHERE id = v_wallet_id;
        INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
        VALUES (v_wallet_id, v_milestone_coin, 'earn', p_goal_id, 'long_term_goal_milestone');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'completionId',  v_completion_id,
    'coinEarned',    v_coin_earned,
    'timeSavedMin',  v_time_saved,
    'milestone',     CASE
                       WHEN v_milestone_coin IS NOT NULL THEN jsonb_build_object(
                         'goalId',     p_goal_id,
                         'day',        v_new_day,
                         'coinReward', v_milestone_coin
                       )
                       ELSE NULL
                     END
  );
END;
$$;


COMMENT ON FUNCTION public.complete_task(uuid, uuid, timestamptz, boolean, uuid) IS
  '完成任務。新任務（reward_policy 有值）的成長幣只看 reward_policy 與 reward_coin_amount，'
  'category 不再參與判斷；金額為 0 時回 coin_amount_not_configured 而不是安靜發 0。'
  '舊任務（reward_policy IS NULL）維持 base_time_min × difficulty 與前置解鎖 ×0.7。';
