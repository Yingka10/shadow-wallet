-- 第七階段 A｜預設任務抽屜的持久化層
--
-- 背景見 docs/TASK_DRAWER_PERSISTENCE_PLAN.md。抽屜（家長平板端的預設任務抽屜）
-- 產生的 CreateParentTaskCommand 帶著十幾個現有 schema 放不下的語意欄位；
-- 而現行建立流程是前端多次 insert（ParentTaskCreateScreen / taskActions.ts），
-- 家庭角色一次要寫五張表，任何一步失敗都會留下孤兒 task。
--
-- 這支 migration 做三件事：
--   1. 補上語意欄位與四張子表 + 一張 append-only 稽核表
--   2. 新增 create_parent_task_v1：整段在同一個交易裡完成的原子建立
--   3. 讓 complete_task / mark_task_atomic 讀得懂新的 reward_policy，
--      且對舊資料（reward_policy IS NULL）行為完全不變
--
-- 設計上的幾個明確決定（不是省事，是刻意的）：
--
--   * 不新增 purpose_category。tasks.category 仍是 canonical，
--     命令的四種 purposeCategory 在 RPC 裡映射成 A/B/C/D。
--     兩個欄位並存必然會有一天不同步，而 fn_complete_task 讀的是 category。
--
--   * estimated_minutes 是新欄位，不寫 base_time_min。
--     base_time_min 同時是幣值計算的乘數基礎，把家長的時間估計寫進去
--     等於偷偷改了這個任務值多少幣。
--
--   * scheduled_date 是新欄位，不寫 due_date。
--     due_date 的語義是「過了就從孩子清單隱藏」，scheduled_date 是「安排在這一天」。
--
--   * reminder_mode 不存。通知排程還不存在，存一個沒有人讀的欄位
--     只會讓畫面看起來會提醒、實際不會。
--
--   * 新欄位一律 nullable。舊 task 沒有這些資訊，也沒有可靠依據可以猜；
--     完整性由 create_parent_task_v1 對新資料保證，不用 NOT NULL 回頭懲罰舊資料。
--
-- 可重複套用：欄位用 IF NOT EXISTS、constraint 先 DROP IF EXISTS、
-- 表用 CREATE TABLE IF NOT EXISTS、policy 先 DROP IF EXISTS、函式用 CREATE OR REPLACE。

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. tasks：語意欄位
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS duration_type          text,
  ADD COLUMN IF NOT EXISTS plan_mode              text,
  ADD COLUMN IF NOT EXISTS task_source            text,
  ADD COLUMN IF NOT EXISTS reward_policy          text,
  ADD COLUMN IF NOT EXISTS completion_policy      text,
  ADD COLUMN IF NOT EXISTS original_expectation   text,
  ADD COLUMN IF NOT EXISTS completion_description text,
  ADD COLUMN IF NOT EXISTS task_details           text,
  ADD COLUMN IF NOT EXISTS notes                  text,
  ADD COLUMN IF NOT EXISTS schedule_mode          text,
  ADD COLUMN IF NOT EXISTS weekly_frequency       smallint,
  ADD COLUMN IF NOT EXISTS start_date             date,
  ADD COLUMN IF NOT EXISTS scheduled_date         date,
  ADD COLUMN IF NOT EXISTS preferred_time         text,
  ADD COLUMN IF NOT EXISTS preferred_time_custom  text,
  ADD COLUMN IF NOT EXISTS estimated_minutes      integer,
  ADD COLUMN IF NOT EXISTS review_enabled         boolean,
  ADD COLUMN IF NOT EXISTS review_after_days      smallint,
  ADD COLUMN IF NOT EXISTS support_level          text,
  ADD COLUMN IF NOT EXISTS task_policy_version    text,
  ADD COLUMN IF NOT EXISTS reward_policy_version  text,
  ADD COLUMN IF NOT EXISTS preset_family_id       text,
  ADD COLUMN IF NOT EXISTS preset_variant_id      text,
  ADD COLUMN IF NOT EXISTS preset_catalog_version text,
  ADD COLUMN IF NOT EXISTS command_schema_version smallint,
  ADD COLUMN IF NOT EXISTS created_from_preset    boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tasks.estimated_minutes IS
  '家長估計的投入分鐘。刻意與 base_time_min 分開：base_time_min 參與幣值計算，'
  '把時間估計寫進去會連帶改變這個任務值多少幣。';
COMMENT ON COLUMN tasks.scheduled_date IS
  '單次任務安排在哪一天。與 due_date 不同：due_date 是「過了就隱藏」的截止語義。';
COMMENT ON COLUMN tasks.reward_policy IS
  'NULL = 本欄位之前建立的舊任務，完成流程沿用 category 判斷（legacy path）。';
COMMENT ON COLUMN tasks.task_policy_version IS
  '任務政策的版本：目的怎麼分、來源要求什麼、哪些回饋方式合法、怎麼結束與退場。'
  '對應 docs/SPEC_task-taxonomy-2026-07.md。**不是幣值版本** —— 幣值在 '
  'reward_policy_version。兩者各自進版，共用一個欄位會讓稽核失去意義。';
COMMENT ON COLUMN tasks.reward_policy_version IS
  '做出這筆任務回饋決策的政策版本。可發幣的任務是 coin-policy.json 的 policyVersion；'
  '不發幣的任務是回饋資格政策的版本（它沒有經過幣值計算，蓋上幣值版本是假的）。';
COMMENT ON COLUMN tasks.preset_catalog_version IS
  'catalog 是 TypeScript 常數不是 DB master table，所以 preset id 不設外鍵；'
  '改為記下產生這筆資料的 catalog 版本，讓之後能分辨是哪一版的定義。';

-- ── constraint ──────────────────────────────────────────────────────────────
-- 全部允許 NULL（舊資料），有值時才檢查。

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_duration_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_duration_type_check
  CHECK (duration_type IS NULL OR duration_type IN ('one_time', 'recurring', 'long_term'));

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_plan_mode_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_plan_mode_check
  CHECK (plan_mode IS NULL OR plan_mode IN ('growth_plan', 'short_support', 'family_role'));

-- system_suggested 目前的 TypeScript TaskSource 還沒有這個值（只有 system），
-- 先放進允許集合，之後 catalog 要用時不必再動 constraint。
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_source_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_task_source_check
  CHECK (task_source IS NULL OR task_source IN
    ('parent', 'child', 'co_created', 'system', 'system_suggested'));

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_reward_policy_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_reward_policy_check
  CHECK (reward_policy IS NULL OR reward_policy IN
    ('record_only', 'family_contribution', 'progress_only',
     'coin_eligible', 'time_saving_eligible'));

-- DB canonical 用 keep_recurring / finish_project；
-- TypeScript catalog 用 ongoing / plan_complete，由 RPC 映射（見 map_completion_policy）。
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_completion_policy_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_completion_policy_check
  CHECK (completion_policy IS NULL OR completion_policy IN
    ('complete_once', 'keep_recurring', 'finish_project',
     'review_and_continue', 'stabilize_and_exit'));

-- plan_schedule 目前不會被寫入（長期形式一樣走 fixed_days），
-- 保留給之後「依計畫階段排程」用。
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_schedule_mode_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_schedule_mode_check
  CHECK (schedule_mode IS NULL OR schedule_mode IN
    ('one_time', 'fixed_days', 'weekly_frequency', 'plan_schedule'));

-- 五種 draft 實際用到的協助程度：前三個是家庭角色，後三個是單次任務。
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_support_level_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_support_level_check
  CHECK (support_level IS NULL OR support_level IN
    ('together_first', 'remind_then_check', 'independent_with_help',
     'independent', 'check_after', 'do_together'));

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_weekly_frequency_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_weekly_frequency_check
  CHECK (weekly_frequency IS NULL OR (weekly_frequency BETWEEN 1 AND 7));

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_estimated_minutes_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_estimated_minutes_check
  CHECK (estimated_minutes IS NULL OR estimated_minutes > 0);

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_review_after_days_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_review_after_days_check
  CHECK (review_after_days IS NULL OR review_after_days > 0);

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_command_schema_version_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_command_schema_version_check
  CHECK (command_schema_version IS NULL OR command_schema_version > 0);

-- 單次任務一定要有安排日期；這條只約束「已經標成 one_time」的新資料。
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_one_time_needs_date_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_one_time_needs_date_check
  CHECK (duration_type IS DISTINCT FROM 'one_time' OR scheduled_date IS NOT NULL);

-- ── claim_period：新增 once ────────────────────────────────────────────────
-- 單次任務的「只能完成一次」不是「每天一次」。用 due_date 假裝單次語義會出錯：
-- 沒有 due_date 的一次性任務隔天仍可再 claim。
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_claim_period_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_claim_period_check
  CHECK (claim_period IN ('day', 'week', 'once'));

COMMENT ON COLUMN tasks.claim_period IS
  'Window a claim frequency cap resets over. day / week 沿用 coin-policy.json；'
  'once = 整個任務生命週期只能完成 max_claims_per_period 次（單次任務）。';

CREATE INDEX IF NOT EXISTS tasks_preset_family_idx
  ON tasks (preset_family_id) WHERE preset_family_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. long_term_goals：三種長期形式的共同資料
--
-- 不拆表。goal_type / total_days / started_at 都已經有等價欄位，沿用；
-- 只補上現有 schema 真的沒有的三個。plan_mode 的 canonical 位置是 tasks.plan_mode，
-- 這裡不再存一份。
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE long_term_goals
  ADD COLUMN IF NOT EXISTS end_date                date,
  ADD COLUMN IF NOT EXISTS first_review_after_days smallint,
  ADD COLUMN IF NOT EXISTS weekend_review_enabled  boolean;

COMMENT ON COLUMN long_term_goals.end_date IS
  '期間最後一天（含）。由 command.schedule.endDate 帶入，不在 DB 重算。';
COMMENT ON COLUMN long_term_goals.first_review_after_days IS
  '第一次回顧在第幾天。既有的 next_review_at 存的是時間點，重排時要反推容易算錯。';

ALTER TABLE long_term_goals DROP CONSTRAINT IF EXISTS long_term_goals_date_range_check;
ALTER TABLE long_term_goals ADD CONSTRAINT long_term_goals_date_range_check
  CHECK (end_date IS NULL OR started_at IS NULL OR started_at::date <= end_date);

ALTER TABLE long_term_goals DROP CONSTRAINT IF EXISTS long_term_goals_first_review_check;
ALTER TABLE long_term_goals ADD CONSTRAINT long_term_goals_first_review_check
  CHECK (first_review_after_days IS NULL OR first_review_after_days > 0);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. 子表
--
-- 為什麼是子表而不是一包 JSONB：這些東西要被查詢、排序、逐項顯示與逐項調整。
-- 「多少家庭讓孩子自己閱讀」應該是一句 group by，不是全表掃 JSONB。
-- 唯一的 JSONB 是 task_change_events.snapshot，它是稽核快照、不是現況查詢來源。
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A. 選項答案（現況，非歷史）────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_preset_selections (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  option_group_id text        NOT NULL,
  option_id       text        NOT NULL,
  custom_value    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_preset_selections_unique
    UNIQUE (task_id, option_group_id, option_id),
  CONSTRAINT task_preset_selections_custom_value_len
    CHECK (custom_value IS NULL OR char_length(custom_value) <= 200)
);

COMMENT ON TABLE task_preset_selections IS
  '任務目前生效的選項答案。更新時採同一交易內 delete + insert（replace），'
  '不在這裡保留歷史 —— 歷史走 task_change_events。';

CREATE INDEX IF NOT EXISTS task_preset_selections_task_idx
  ON task_preset_selections (task_id);
CREATE INDEX IF NOT EXISTS task_preset_selections_group_idx
  ON task_preset_selections (option_group_id, option_id);

-- ── B. 里程碑（成長計畫）───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_plan_milestones (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  long_term_goal_id uuid        REFERENCES long_term_goals(id) ON DELETE CASCADE,
  title             text        NOT NULL,
  target_day        integer,
  sort_order        integer     NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_plan_milestones_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT task_plan_milestones_target_day CHECK (target_day IS NULL OR target_day > 0),
  CONSTRAINT task_plan_milestones_order UNIQUE (task_id, sort_order)
);

COMMENT ON TABLE task_plan_milestones IS
  '成長計畫的里程碑。刻意不用 long_term_goals.level_definitions —— 那個形狀綁著幣值，'
  '而里程碑刻意沒有幣值（回饋的是投入與持續，不是達標）。';

CREATE INDEX IF NOT EXISTS task_plan_milestones_task_idx ON task_plan_milestones (task_id);

-- ── C. 支援步驟（短期支援）─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_plan_support_steps (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  long_term_goal_id uuid        REFERENCES long_term_goals(id) ON DELETE CASCADE,
  text              text        NOT NULL,
  sort_order        integer     NOT NULL,
  is_custom         boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_plan_support_steps_text_len CHECK (char_length(text) BETWEEN 1 AND 300),
  CONSTRAINT task_plan_support_steps_order UNIQUE (task_id, sort_order)
);

CREATE INDEX IF NOT EXISTS task_plan_support_steps_task_idx ON task_plan_support_steps (task_id);

-- ── D. 負責內容（家庭角色）─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_role_responsibilities (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  long_term_goal_id uuid        REFERENCES long_term_goals(id) ON DELETE CASCADE,
  text              text        NOT NULL,
  sort_order        integer     NOT NULL,
  is_custom         boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_role_responsibilities_text_len CHECK (char_length(text) BETWEEN 1 AND 300),
  CONSTRAINT task_role_responsibilities_order UNIQUE (task_id, sort_order)
);

CREATE INDEX IF NOT EXISTS task_role_responsibilities_task_idx
  ON task_role_responsibilities (task_id);

-- ── E. 變更事件（append-only 稽核）─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_change_events (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id                uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  event_type             text        NOT NULL,
  actor_user_id          uuid,
  task_policy_version    text,
  reward_policy_version  text,
  command_schema_version smallint,
  snapshot               jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_change_events_type_check
    CHECK (event_type IN ('created_from_preset', 'updated_from_preset', 'archived'))
);

COMMENT ON TABLE task_change_events IS
  'append-only。snapshot 是稽核用的當下摘要，不是 production 的現況來源 —— '
  '現況一律讀 tasks 與各子表。';

CREATE INDEX IF NOT EXISTS task_change_events_task_idx ON task_change_events (task_id, created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS
--
-- 寫入一律走 SECURITY DEFINER 函式，所以這五張表只給 SELECT policy，
-- 不給任何 INSERT / UPDATE / DELETE policy。一般 client 改不動這些資料。
--
-- 存取邊界跟著 task → family 走。既有表用 my_family_id()（家庭成員，含孩子裝置）；
-- 這裡改成明確的 parents 子查詢：它是集合比對而不是 LIMIT 1，
-- 雙家長帳號不會挑錯家，也不依賴目前只存在 live DB 的 my_family_id()。
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE task_preset_selections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_plan_milestones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_plan_support_steps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_role_responsibilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_change_events         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family members can view preset selections" ON task_preset_selections;
CREATE POLICY "family members can view preset selections"
  ON task_preset_selections FOR SELECT TO authenticated
  USING (task_id IN (
    SELECT t.id FROM tasks t
    WHERE t.family_id IN (SELECT p.family_id FROM parents p WHERE p.user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "family members can view plan milestones" ON task_plan_milestones;
CREATE POLICY "family members can view plan milestones"
  ON task_plan_milestones FOR SELECT TO authenticated
  USING (task_id IN (
    SELECT t.id FROM tasks t
    WHERE t.family_id IN (SELECT p.family_id FROM parents p WHERE p.user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "family members can view support steps" ON task_plan_support_steps;
CREATE POLICY "family members can view support steps"
  ON task_plan_support_steps FOR SELECT TO authenticated
  USING (task_id IN (
    SELECT t.id FROM tasks t
    WHERE t.family_id IN (SELECT p.family_id FROM parents p WHERE p.user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "family members can view role responsibilities" ON task_role_responsibilities;
CREATE POLICY "family members can view role responsibilities"
  ON task_role_responsibilities FOR SELECT TO authenticated
  USING (task_id IN (
    SELECT t.id FROM tasks t
    WHERE t.family_id IN (SELECT p.family_id FROM parents p WHERE p.user_id = auth.uid())
  ));

-- 稽核事件只給家長讀，且沒有任何 insert policy —— client 不能自己寫 audit log。
DROP POLICY IF EXISTS "parents can view task change events" ON task_change_events;
CREATE POLICY "parents can view task change events"
  ON task_change_events FOR SELECT TO authenticated
  USING (task_id IN (
    SELECT t.id FROM tasks t
    WHERE t.family_id IN (SELECT p.family_id FROM parents p WHERE p.user_id = auth.uid())
  ));

REVOKE ALL ON task_preset_selections, task_plan_milestones, task_plan_support_steps,
              task_role_responsibilities, task_change_events
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON task_preset_selections, task_plan_milestones, task_plan_support_steps,
                task_role_responsibilities, task_change_events
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. 映射 helper
--
-- 抽成 IMMUTABLE 函式而不是在 RPC 裡寫兩段 CASE：映射規則只有一份，
-- 之後要加值時不會有一邊改了另一邊沒改。
-- ═══════════════════════════════════════════════════════════════════════════

-- purposeCategory → category。DB canonical 仍是 A/B/C/D（fn_complete_task 讀它）。
CREATE OR REPLACE FUNCTION public.map_purpose_category(p_purpose text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_purpose
    WHEN 'life_routine'         THEN 'A'
    WHEN 'family_participation' THEN 'B'
    WHEN 'autonomous_challenge' THEN 'C'
    WHEN 'learning_skill'       THEN 'D'
    ELSE NULL
  END;
$$;

-- TypeScript catalog 的結束方式 → DB canonical。
-- 兩邊名稱不同是既有事實（catalog 用 ongoing / plan_complete），
-- 與其改動 26 family / 36 variant 的資料，不如在這裡映射一次。
CREATE OR REPLACE FUNCTION public.map_completion_policy(p_policy text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_policy
    WHEN 'complete_once'       THEN 'complete_once'
    WHEN 'ongoing'             THEN 'keep_recurring'
    WHEN 'keep_recurring'      THEN 'keep_recurring'
    WHEN 'plan_complete'       THEN 'finish_project'
    WHEN 'finish_project'      THEN 'finish_project'
    WHEN 'review_and_continue' THEN 'review_and_continue'
    WHEN 'stabilize_and_exit'  THEN 'stabilize_and_exit'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.map_purpose_category(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.map_completion_policy(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.map_purpose_category(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.map_completion_policy(text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. create_parent_task_v1
--
-- 整支在同一個 transaction 裡。任何 RAISE 都會回滾全部 insert ——
-- 不需要（也不該有）taskActions.ts 那種手寫 delete 補償，
-- 因為補償本身也會失敗，而且中間狀態對其他讀取者是可見的。
--
-- 政策 guard 全部跑在任何 insert 之前：被拒絕時不會留下半成品，
-- 也不必靠回滾來清理。
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
  v_preset_variant  text;

  v_schedule        jsonb;
  v_review          jsonb;
  v_plan            jsonb;
  v_role            jsonb;
  v_content         jsonb;
  v_meta            jsonb;

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
  -- anon 與未登入的 auth.uid() 是 NULL，直接擋掉。
  -- 這支刻意不給 service_role 旁路：預設任務一律由家長在自己的裝置上建立。
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized: create_parent_task_v1 requires an authenticated parent'
      USING ERRCODE = '42501';
  END IF;

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
  -- family_id 只由 childId 查 children.family_id 得出，
  -- 不使用 parents.limit(1)（那會在雙家長或多家庭時挑到別人家）。
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

  -- ── 取出各區塊 ──────────────────────────────────────────────────────────
  v_schedule := COALESCE(p_command -> 'schedule', '{}'::jsonb);
  v_review   := p_command -> 'review';
  v_plan     := p_command -> 'plan';
  v_role     := p_command -> 'role';
  v_content  := COALESCE(p_command -> 'content', '{}'::jsonb);
  v_meta     := COALESCE(p_command -> 'metadata', '{}'::jsonb);

  v_editor_kind    := v_meta ->> 'editorKind';
  v_purpose        := p_command -> 'task' ->> 'purposeCategory';
  v_duration_type  := p_command -> 'task' ->> 'durationType';
  v_plan_mode      := p_command -> 'task' ->> 'planMode';
  v_source         := p_command -> 'task' ->> 'source';
  v_reward         := p_command -> 'task' ->> 'rewardPolicy';
  v_completion     := p_command -> 'task' ->> 'completionPolicy';
  v_preset_family  := p_command -> 'preset' ->> 'familyId';
  v_preset_variant := p_command -> 'preset' ->> 'variantId';

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

  -- ── 基本必填（不在 SQL 複製整份 catalog，只擋核心欄位） ──────────────────
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

  -- ══ 8. 政策 guard（全部在 insert 之前）══════════════════════════════════
  -- 前端 validator 不是防線，只是體驗。這裡重驗一次同樣的硬規則。

  -- E. 時間儲蓄：完成與兌換鏈路尚未打通，不可先建立起來慢慢累積。
  IF v_reward = 'time_saving_eligible' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'message', '時間儲蓄建立流程尚未啟用'
    );
  END IF;

  -- A. 家庭參與：只有家庭貢獻一種回饋，連「一般留下紀錄」都不適用。
  IF v_category = 'B' AND v_reward <> 'family_contribution' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'message', '家庭參與只能以家庭貢獻回饋，不發成長幣、不記時間儲蓄'
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
    -- 「至少一個支援步驟，或具體的任務內容」——
    -- 有些生活小計畫沒有預設步驟清單，那時完成標準就是它的具體內容。
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

  -- 長期形式一定要有結束日與期間。
  IF v_duration_type = 'long_term' AND (v_end_date IS NULL OR v_end_date < v_start_date) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '長期任務的結束日不正確'
    );
  END IF;

  -- 每週次數模式一定要有次數。
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

  -- ══ 9. claim 規則推導 ═══════════════════════════════════════════════════
  -- 由排程推導，不接受前端傳入 —— 否則「每週三次」的上限就變成前端說了算。
  IF v_schedule_mode = 'one_time' THEN
    -- once = 整個任務生命週期一次。不是 day + due_date 假裝的單次。
    v_claim_period := 'once';
    v_max_claims   := 1;
    v_day_type     := 'once';
  ELSIF v_schedule_mode = 'weekly_frequency' THEN
    v_claim_period := 'week';
    v_max_claims   := v_weekly_freq;
    -- 不指定星期，所以每天都看得到，由每週上限控制次數。
    v_day_type     := 'both';
  ELSE
    -- fixed_days / plan_schedule：每個排定日最多一次。
    v_claim_period := 'day';
    v_max_claims   := 1;
    v_day_type     := 'custom';
  END IF;

  -- goal_type 是既有 NOT NULL 欄位，由 plan_mode 決定；
  -- tasks.plan_mode 才是 canonical，這裡只是滿足舊欄位。
  v_long_term_type := CASE v_plan_mode
    WHEN 'growth_plan'   THEN 'skill'
    WHEN 'short_support' THEN 'habit'
    WHEN 'family_role'   THEN 'family'
    ELSE NULL
  END;

  -- ══ 10. tasks ═══════════════════════════════════════════════════════════
  -- base_time_min 刻意寫 0：抽屜這一輪還不決定幣值，
  -- 而把 estimated_minutes 寫進 base_time_min 會直接變成幣值。
  -- 也就是說 coin_eligible 的 preset 任務目前完成時得到 0 幣 ——
  -- 這是尚未接上 coin-policy 的已知狀態，不是靜靜給了一個編出來的數字。
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
    task_policy_version, preset_family_id, preset_variant_id, preset_catalog_version,
    command_schema_version, created_from_preset
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
    v_meta ->> 'taskPolicyVersion',
    v_preset_family, v_preset_variant,
    v_meta ->> 'presetCatalogVersion',
    v_schema_version, true
  )
  RETURNING id INTO v_task_id;

  -- ══ 11. child_tasks ═════════════════════════════════════════════════════
  INSERT INTO child_tasks (child_id, task_id, is_active)
  VALUES (v_child_id, v_task_id, true)
  RETURNING id INTO v_child_task_id;
  v_related := v_related || v_child_task_id;

  -- ══ 12. long_term_goals（只有三種長期形式） ═════════════════════════════
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
      -- 家庭角色的顯示名稱；自訂角色優先，其次是選到的 option id。
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

  FOR v_group IN SELECT k FROM jsonb_object_keys(v_selections) AS k LOOP
    v_custom := NULLIF(btrim(COALESCE(v_customs ->> v_group, '')), '');
    FOR v_option IN
      SELECT value FROM jsonb_array_elements_text(v_selections -> v_group)
    LOOP
      INSERT INTO task_preset_selections (task_id, option_group_id, option_id, custom_value)
      VALUES (
        v_task_id, v_group, v_option,
        -- 自填內容只掛在 'other' 那一列，不是整組每一列都複製一份。
        CASE WHEN v_option = 'other' THEN v_custom ELSE NULL END
      );
    END LOOP;
  END LOOP;

  -- ══ 14. 里程碑（只寫 command 帶來的，也就是 enabled 的） ════════════════
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

    -- ══ 15. 支援步驟 ═════════════════════════════════════════════════════
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
  -- snapshot 是當下的完整命令，供之後回溯「當時家長送出的是什麼」。
  -- 它不是現況查詢來源 —— 現況一律讀 tasks 與子表。
  INSERT INTO task_change_events (
    task_id, event_type, actor_user_id, task_policy_version, command_schema_version, snapshot
  ) VALUES (
    v_task_id, 'created_from_preset', auth.uid(),
    v_meta ->> 'taskPolicyVersion', v_schema_version,
    jsonb_build_object(
      'command', p_command,
      'derived', jsonb_build_object(
        'category',         v_category,
        'completionPolicy', v_completion_db,
        'claimPeriod',      v_claim_period,
        'maxClaims',        v_max_claims,
        'dayType',          v_day_type
      )
    )
  )
  RETURNING id INTO v_event_id;
  v_related := v_related || v_event_id;

  -- ══ 18. 結果 ════════════════════════════════════════════════════════════
  RETURN jsonb_build_object(
    'ok', true,
    'taskId', v_task_id,
    'relatedIds', to_jsonb(v_related)
  );
END;
$$;

COMMENT ON FUNCTION public.create_parent_task_v1(jsonb) IS
  '從預設任務抽屜的 CreateParentTaskCommand 原子建立任務。'
  '政策 guard 全部跑在 insert 之前；任何錯誤都回滾，不留孤兒 task。';

REVOKE ALL ON FUNCTION public.create_parent_task_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_parent_task_v1(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_parent_task_v1(jsonb) TO authenticated;
-- 刻意不 grant service_role：預設任務是家長在自己裝置上建立的動作，
-- 沒有後端流程需要代為建立。之後真的需要時再明確開通。

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. complete_task：認得 reward_policy 與 claim_period = 'once'
--
-- 只加 policy guard，不重寫完成系統。
-- reward_policy IS NULL（本 migration 之前建立的任務）走原本那條路，一個字沒改。
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
  v_task          record;
  v_coin_earned   int;
  v_time_saved    int;
  v_wallet_id     uuid;
  v_completion_id uuid;
  v_new_day       int;
  v_rewards       jsonb;
  v_milestone_coin int;
  v_period_start  date;
  v_claim_count   int;
  v_legacy        boolean;
BEGIN
  -- Authorization (P1-6): a user-authenticated caller may only act on children
  -- in their own family. service_role bypasses; anon / cross-family rejected.
  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM children c
      WHERE c.id = p_child_id
        AND c.family_id = (SELECT family_id FROM parents WHERE user_id = auth.uid() LIMIT 1)
    ) THEN
      RAISE EXCEPTION 'Not authorized: child % is not in the caller''s family', p_child_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Read task
  SELECT category, base_time_min, difficulty, coin_override,
         time_saving_min, long_term_type, day_type, allow_repeat,
         claim_period, max_claims_per_period, reward_policy
  INTO v_task
  FROM tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  -- reward_policy 為 NULL = 舊任務。走 legacy path，行為與本 migration 之前完全相同。
  v_legacy := (v_task.reward_policy IS NULL);

  -- 時間儲蓄的完成與兌換鏈路尚未打通。建立端已經擋掉，這裡是第二道 ——
  -- 不可默默當成 coin 或 record_only 處理。
  IF NOT v_legacy AND v_task.reward_policy = 'time_saving_eligible' THEN
    RETURN jsonb_build_object('error', 'time_saving_not_enabled');
  END IF;

  -- Coin calculation
  IF v_legacy THEN
    -- 舊路徑：A/B 不發幣，其餘依 base_time_min × difficulty。
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
    -- 新路徑：由 reward_policy 決定，category 仍是第二道界線。
    --   family_contribution / record_only / progress_only → 只留下完成紀錄，不發幣
    --   coin_eligible                                     → 才進入幣值流程
    IF v_task.reward_policy = 'coin_eligible' AND v_task.category NOT IN ('A', 'B') THEN
      v_coin_earned := ROUND(
        COALESCE(
          v_task.coin_override,
          ROUND(v_task.base_time_min::numeric * v_task.difficulty::numeric)
        )::numeric
        * CASE WHEN p_is_prerequisite_met THEN 1.0 ELSE 0.7 END
      );
    ELSE
      v_coin_earned := 0;
    END IF;

    -- 新任務一律不寫 time_savings：家庭參與改以貢獻紀錄被看見（SPEC 2026-07），
    -- 而時間儲蓄本身還沒有兌換路徑。
    v_time_saved := 0;
  END IF;

  -- Frequency guard. claim_period = 'once' 代表整個任務生命週期的上限，
  -- 不分日期 —— 單次任務隔天不能再 claim 一次。
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

  -- 1. Insert task_completion (part of the transaction)
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. mark_task_atomic：不讓 override 繞過 reward_policy
--
-- 這支可以「調整」完成的幣值，而 v_coin_diff < 0 時是加幣（type = 'adjust'）。
-- 也就是家長可以對一個家庭參與任務用 override 補幣，繞過「不發成長幣」。
-- 這裡只加一道夾制：非 coin_eligible 的新任務一律夾到 0。舊任務行為不變。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION mark_task_atomic(
  p_task_id       uuid,
  p_child_id      uuid,
  p_override_type text,
  p_adjusted_coin int,
  p_note          text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id      uuid;
  v_family_id      uuid;
  v_task_name      text;
  v_task_category  text;
  v_reward_policy  text;
  v_adjusted_coin  int;
  v_completion_id  uuid;
  v_original_coin  int;
  v_override_id    uuid;
  v_coin_deducted  int;
  v_coin_diff      int;
  v_wallet_id      uuid;
  v_balance_before int;
  v_event_type     text;
BEGIN
  IF p_override_type NOT IN ('partial', 'none', 'renegotiate') THEN
    RAISE EXCEPTION 'Invalid override_type: %', p_override_type;
  END IF;

  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM children c
      WHERE c.id = p_child_id
        AND c.family_id = (SELECT family_id FROM parents WHERE user_id = auth.uid() LIMIT 1)
    ) THEN
      RAISE EXCEPTION 'Not authorized: child % is not in the caller''s family', p_child_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT id INTO v_parent_id FROM parents WHERE user_id = auth.uid() LIMIT 1;
  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION 'Parent not found for caller';
  END IF;

  SELECT family_id, name, category, reward_policy
  INTO v_family_id, v_task_name, v_task_category, v_reward_policy
  FROM tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  -- 新任務（reward_policy 有值）若不是 coin_eligible，override 不得成為發幣後門。
  -- 舊任務（NULL）維持原本行為。
  v_adjusted_coin := CASE
    WHEN v_reward_policy IS NOT NULL AND v_reward_policy <> 'coin_eligible' THEN 0
    ELSE p_adjusted_coin
  END;

  SELECT id, coin_earned INTO v_completion_id, v_original_coin
  FROM task_completions
  WHERE task_id  = p_task_id
    AND child_id = p_child_id
    AND (completed_at AT TIME ZONE 'Asia/Taipei')::date = (now() AT TIME ZONE 'Asia/Taipei')::date
  LIMIT 1;

  IF v_completion_id IS NULL THEN
    INSERT INTO task_completions
      (task_id, child_id, completed_at, reported_at, reported_by, status, coin_earned, time_saved_min)
    VALUES (
      p_task_id, p_child_id, now(), now(), 'parent',
      CASE WHEN p_override_type = 'none' THEN 'flagged' ELSE 'completed' END,
      0, 0
    )
    RETURNING id, coin_earned INTO v_completion_id, v_original_coin;
  END IF;

  v_coin_deducted := GREATEST(v_original_coin - v_adjusted_coin, 0);

  INSERT INTO overrides (completion_id, parent_id, override_type, coin_deducted, credit_flag, reason)
  VALUES (v_completion_id, v_parent_id, p_override_type, v_coin_deducted, false, p_note)
  RETURNING id INTO v_override_id;

  SELECT id, balance INTO v_wallet_id, v_balance_before
  FROM wallets WHERE child_id = p_child_id AND wallet_type = 'spending';

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Spending wallet not found for child %', p_child_id;
  END IF;

  v_coin_diff := v_original_coin - v_adjusted_coin;
  IF v_coin_diff <> 0 THEN
    UPDATE wallets SET balance = balance - v_coin_diff WHERE id = v_wallet_id;

    INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
    VALUES (
      v_wallet_id, abs(v_coin_diff),
      CASE WHEN v_coin_diff > 0 THEN 'deduct' ELSE 'adjust' END,
      v_override_id, 'override'
    );
  END IF;

  UPDATE task_completions
  SET coin_earned = v_adjusted_coin,
      override_id = v_override_id,
      status = CASE WHEN p_override_type = 'none' THEN 'flagged' ELSE status END
  WHERE id = v_completion_id;

  v_event_type := CASE p_override_type
    WHEN 'partial'     THEN 'parent_override_partial'
    WHEN 'none'        THEN 'parent_override_none'
    WHEN 'renegotiate' THEN 'parent_override_renegotiate'
  END;

  INSERT INTO intervention_log
    (family_id, child_id, parent_id, task_id, task_name_snapshot, override_id,
     event_type, trigger_source, parent_decision, context_snapshot)
  VALUES (
    v_family_id, p_child_id, v_parent_id, p_task_id, v_task_name, v_override_id,
    v_event_type, 'parent_manual',
    jsonb_build_object('override_type', p_override_type, 'coin_deducted', v_coin_deducted, 'credit_flag', false, 'reason', p_note),
    jsonb_build_object('coin_earned_original', v_original_coin, 'wallet_balance_before', v_balance_before, 'task_category', v_task_category, 'reward_policy', v_reward_policy)
  );

  RETURN jsonb_build_object('completionId', v_completion_id, 'overrideId', v_override_id, 'coinEarned', v_adjusted_coin);
END;
$$;
