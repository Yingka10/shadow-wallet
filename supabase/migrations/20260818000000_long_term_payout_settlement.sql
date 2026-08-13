-- P0：長期任務的 check-in 與 reward event 分離。
--
-- 在此之前，complete_task 只認得「一次完成 = 一次結算」：一個「每週 4 次」的
-- coin_eligible 計畫一週 mint 四次，而共同版本快照上的
-- confirmed_payout_basis = 'per_period' 對錢包毫無約束力（它本身還是從
-- claim_period 推導出來的）。
--
-- 這支 migration 做四件事：
--   1. tasks.payout_basis 成為獨立的「什麼事件結算」欄位，不再由 claim_period 推導。
--   2. reward_settlements 成為 canonical settlement record，並用 unique index
--      在資料庫層保證每個 reward event 只能 mint 一次。
--   3. complete_task 拆成 progress 與 settlement 兩件事。
--   4. payout_basis / period_target_count 進入 active shared plan 的凍結欄位。
--
-- **既有任務遷移零列。** payout_basis 一律留 NULL = legacy，行為逐字不變。
-- 理由見 docs/LONG_TERM_REWARD_SETTLEMENT.md §7.0：家長確認畫面上寫的是
-- 「建議：每次完成 N 成長幣」，所以歷史的 confirmed_payout_basis='per_period'
-- 不構成「家庭已知情共同確認 per-period」的證據。既有任務只能經正式重新協商進新制。

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. tasks：payout semantics
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS payout_basis                text,
  ADD COLUMN IF NOT EXISTS period_target_count         smallint,
  ADD COLUMN IF NOT EXISTS payout_basis_effective_from date;

COMMENT ON COLUMN tasks.payout_basis IS
  '什麼事件才結算。NULL = legacy（本欄位之前建立的任務，每次完成即結算）。'
  '**不得由 claim_period 推導** —— claim_period 是「每期可以 claim 幾次」的頻率上限，'
  '兩者是不同維度，見 docs/CLAIM_PERIOD_VS_PAYOUT_BASIS.md。';

COMMENT ON COLUMN tasks.period_target_count IS
  '一個 period 內達成幾次才形成一次 reward event。**這是建立共同版本當下約定的次數**，'
  '結算只讀這一欄，永遠不從 weekly_frequency / recurrence_days 重新推導 ——'
  'cadence 會被重新協商改寫，而「講好幾次算達標」是簽下去的那個數字。';

COMMENT ON COLUMN tasks.payout_basis_effective_from IS
  '新結算語意從哪一天起適用。**這是 technical rollout metadata，不是家庭的共同約定內容。**'
  '存在的唯一理由是避免既有任務在 period 中途切換造成 double-pay（見 §7.2 的證明）。'
  '因此它受 DB immutability guard 保護、可稽核，但**不進 material diff、'
  '不觸發孩子重新確認**。未來若需要「新的家庭約定從某日生效」，那是 agreement-level '
  'effective time，另建欄位，不與本欄混用。';

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_payout_basis_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_payout_basis_check
  CHECK (payout_basis IS NULL OR payout_basis IN
    ('per_completion', 'per_period', 'per_milestone', 'final_completion'));

-- per_milestone / final_completion 在值域裡但**沒有執行路徑**（Phase 2）。
-- 先放進 CHECK 是為了 Phase 2 不必再動一次 constraint；
-- 建立路徑會用 typed error 擋下來，complete_task 遇到則 fail closed。
-- 這不是「假裝已經支援」——見 resolve_payout_basis_v1 與 complete_task。

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_period_target_count_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_period_target_count_check
  CHECK (period_target_count IS NULL OR (period_target_count BETWEEN 1 AND 7));

-- per_period 一定要有 target；其他 basis 一定不能有。
-- 少了前半，「達標」沒有分母；少了後半，一個 per_completion 任務會帶著一個
-- 沒有意義的目標次數，而總有一天會有畫面把它顯示出來。
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_period_target_scope_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_period_target_scope_check
  CHECK (
    CASE WHEN payout_basis = 'per_period'
      THEN period_target_count IS NOT NULL
      ELSE period_target_count IS NULL
    END
  );

-- 有 payout_basis 就一定要說得出從哪天開始適用。
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_payout_effective_from_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_payout_effective_from_check
  CHECK (payout_basis IS NULL OR payout_basis_effective_from IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. payout basis 的 default resolution
--
-- 抽成一支函式而不是寫在 RPC 裡：建立路徑不只一條（create_parent_task_core_v1、
-- 孩子提案的包裝、未來的路徑），寫兩份就會有一份先過期。
-- 它同時是 trigger 的填值來源與 RPC 的前置驗證來源。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.resolve_payout_basis_v1(
  p_duration_type    text,
  p_progress_model   text,
  p_schedule_mode    text,
  p_weekly_frequency smallint,
  p_recurrence_days  integer[]
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_target int;
BEGIN
  -- duration_type IS NULL = 本欄位之前的舊寫入路徑（client 直接 insert 的
  -- createLongTermGoal / createChildTask、demo seed）。這些不進新制，留 legacy。
  IF p_duration_type IS NULL THEN
    RETURN jsonb_build_object('basis', NULL, 'periodTargetCount', NULL);
  END IF;

  IF p_duration_type IN ('one_time', 'recurring') THEN
    RETURN jsonb_build_object('basis', 'per_completion', 'periodTargetCount', NULL);
  END IF;

  IF p_duration_type = 'long_term' THEN
    -- 主要意圖是 progress_model = 'weekly_rhythm'（它蘊含 weekly_frequency）。
    -- fixed_days 是 fallback：家長自建的長期任務目前 progress_model 是 NULL，
    -- 沒有這條 fallback 它們會退回 per_completion —— 那正是本輪要消滅的行為。
    -- ⚠️ 這條 fallback **不是**把 progress_model = NULL 重新定義成一種正式的
    --    進度模型；它現在的意思仍然只是「這條路徑沒有寫入它」。
    --    讓家長自建路徑也顯式決定 progress model 是另一輪的事。
    v_target := CASE
      WHEN p_schedule_mode = 'weekly_frequency' THEN p_weekly_frequency::int
      WHEN p_schedule_mode = 'fixed_days'       THEN array_length(p_recurrence_days, 1)
      ELSE NULL
    END;

    IF v_target IS NOT NULL AND v_target BETWEEN 1 AND 7 THEN
      RETURN jsonb_build_object('basis', 'per_period', 'periodTargetCount', v_target);
    END IF;

    -- 週目標推不出來時**寧可擋下建立**，不退回每次發幣。
    -- 這種長期任務要的是 per_milestone / final_completion，而那是 Phase 2。
    RETURN jsonb_build_object('error', 'PAYOUT_BASIS_NOT_IMPLEMENTED');
  END IF;

  RETURN jsonb_build_object('error', 'PAYOUT_BASIS_NOT_IMPLEMENTED');
END;
$$;

COMMENT ON FUNCTION public.resolve_payout_basis_v1(text, text, text, smallint, integer[]) IS
  '建立當下的 payout basis 預設值。**不是永久映射** —— payout_basis 是共同約定的內容，'
  'Phase 2 打開 creation path 後，同一個 cadence 仍可經正式共同版本改成 '
  'per_milestone / final_completion。回 error 代表這一輪沒有實作的模式，呼叫端必須擋下建立。';

REVOKE ALL ON FUNCTION public.resolve_payout_basis_v1(text, text, text, smallint, integer[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_payout_basis_v1(text, text, text, smallint, integer[])
  TO authenticated, service_role;

-- ── 建立時自動填值 ──────────────────────────────────────────────────────────
-- 放 trigger 而不是只改 RPC：建立路徑不只一條，trigger 讓「沒有一條路徑會忘記」
-- 成為結構保證。已經帶值進來的 INSERT 不覆寫（未來 Phase 2 的顯式指定）。

CREATE OR REPLACE FUNCTION public.tasks_resolve_payout_basis_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resolved jsonb;
BEGIN
  IF NEW.payout_basis IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_resolved := public.resolve_payout_basis_v1(
    NEW.duration_type, NEW.progress_model, NEW.schedule_mode,
    NEW.weekly_frequency, NEW.recurrence_days
  );

  IF v_resolved ->> 'error' IS NOT NULL THEN
    RAISE EXCEPTION 'PAYOUT_BASIS_NOT_IMPLEMENTED' USING ERRCODE = 'P0001';
  END IF;

  IF v_resolved ->> 'basis' IS NULL THEN
    RETURN NEW;                       -- legacy 寫入路徑，維持 NULL
  END IF;

  NEW.payout_basis        := v_resolved ->> 'basis';
  NEW.period_target_count := NULLIF(v_resolved ->> 'periodTargetCount', '')::smallint;

  -- 新任務沒有 legacy 付款歷史，所以「起始日所屬的那一個 period」就可以生效，
  -- 不需要等到下一個邊界。
  NEW.payout_basis_effective_from := date_trunc(
    'week',
    COALESCE(NEW.start_date, NEW.scheduled_date, (now() AT TIME ZONE 'Asia/Taipei')::date)
  )::date;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_resolve_payout_basis ON tasks;
CREATE TRIGGER tasks_resolve_payout_basis
  BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_resolve_payout_basis_v1();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. reward_settlements：canonical settlement record
--
-- 為什麼不是「看 transactions 就好」：transactions 記的是錢動了，
-- 記不住「這筆錢是哪一個 reward event」。少了這張表，
-- 「這一週結算過了沒」只能用金額與時間去猜，而猜不出來的那一次就是 double mint。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reward_settlements (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id               uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  child_id              uuid        NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  reward_basis          text        NOT NULL,

  -- 三選一的 event key，由 reward_basis 決定哪一個必須有值。
  period_start          date,
  milestone_id          uuid,
  goal_id               uuid        REFERENCES long_term_goals(id) ON DELETE SET NULL,

  -- 觸發這次結算的那一次完成。source event 必須可追蹤。
  completion_id         uuid        NOT NULL REFERENCES task_completions(id) ON DELETE CASCADE,
  coin_amount           integer     NOT NULL,
  reward_policy_version text,
  transaction_id        uuid        NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reward_settlements_basis_check CHECK (reward_basis IN
    ('per_completion', 'per_period', 'per_milestone', 'final_completion')),
  CONSTRAINT reward_settlements_amount_check CHECK (coin_amount > 0),

  -- 每一種 basis 都必須帶著自己的 event key，而且不能帶別人的。
  -- 少了這條，一筆 per_period 可以不帶 period_start —— 那 unique index 就攔不住它。
  CONSTRAINT reward_settlements_event_key_check CHECK (
    CASE reward_basis
      WHEN 'per_period'       THEN period_start IS NOT NULL AND milestone_id IS NULL AND goal_id IS NULL
      WHEN 'per_milestone'    THEN milestone_id IS NOT NULL AND period_start IS NULL
      WHEN 'final_completion' THEN goal_id      IS NOT NULL AND period_start IS NULL AND milestone_id IS NULL
      ELSE period_start IS NULL AND milestone_id IS NULL AND goal_id IS NULL
    END
  )
);

COMMENT ON TABLE reward_settlements IS
  '每一次 reward event 的 canonical 紀錄。一列 = 一次真的動了錢包的結算。'
  'task_completions 記的是 progress event，兩者刻意分開 —— 見 '
  'docs/LONG_TERM_REWARD_SETTLEMENT.md §1。';

COMMENT ON COLUMN reward_settlements.transaction_id IS
  'ON DELETE RESTRICT：settlement 是「這筆錢為什麼發」的證據，'
  '不可以因為 transaction 被刪掉就跟著消失、留下一筆無主的餘額變動。';

-- ── idempotency：DB 保證，不靠 UI ───────────────────────────────────────────
-- 四道 partial unique index。complete_task 撞到 23505 就把那次完成降級為
-- 「只記 progress」，不 raise、不回滾 completion。

CREATE UNIQUE INDEX IF NOT EXISTS reward_settlements_period_unique
  ON reward_settlements (task_id, child_id, period_start)
  WHERE reward_basis = 'per_period';

CREATE UNIQUE INDEX IF NOT EXISTS reward_settlements_completion_unique
  ON reward_settlements (completion_id)
  WHERE reward_basis = 'per_completion';

CREATE UNIQUE INDEX IF NOT EXISTS reward_settlements_milestone_unique
  ON reward_settlements (milestone_id, child_id)
  WHERE reward_basis = 'per_milestone';

CREATE UNIQUE INDEX IF NOT EXISTS reward_settlements_goal_unique
  ON reward_settlements (goal_id, child_id)
  WHERE reward_basis = 'final_completion';

CREATE INDEX IF NOT EXISTS reward_settlements_task_child_idx
  ON reward_settlements (task_id, child_id);

ALTER TABLE reward_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family members can view reward settlements" ON reward_settlements;
CREATE POLICY "family members can view reward settlements"
  ON reward_settlements FOR SELECT TO authenticated
  USING (child_id IN (
    SELECT c.id FROM children c
    WHERE c.family_id IN (SELECT p.family_id FROM parents p WHERE p.user_id = auth.uid())
  ));

-- 沒有 INSERT / UPDATE / DELETE policy：settlement 只由 SECURITY DEFINER 的
-- 結算函式寫入。任何人都不能手動補一筆「已結算」把自己的錢包墊高，
-- 也不能刪掉一筆讓同一個 period 可以再領一次。
GRANT SELECT ON reward_settlements TO authenticated;
GRANT ALL    ON reward_settlements TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. shared plan guard
--
-- payout_basis / period_target_count 是共同約定的內容 → material change。
-- payout_basis_effective_from 是 rollout metadata → **不是** material change，
-- 但一旦寫下就不可改（它是 double-pay 證明的前提，改掉等於推翻證明）。
--
-- ⚠️ 這裡刻意**不去 CREATE OR REPLACE guard_active_shared_plan_task_v1**。
--
--    那支函式是一份會被多個工作包同時修改的欄位清單：P0-8G（20260816）建立它，
--    P0-8M（20260817）又把 preferred_time / preferred_time_custom 從清單裡拿掉
--    ——因為換時段變成可以個別協商的欄位。任何人「forward-derive 一份再加自己的
--    兩欄」，都會把當時還沒 merge 的那一版默默改回去。
--    staging 上就已經套了 20260817，用衍生法會當場打壞 P0-8M 的換時段流程。
--
--    所以本工單只掛一支**只認自己三個欄位**的獨立 trigger。兩支 BEFORE trigger
--    都會擋下違規的 UPDATE，誰先跑不影響結果；而清單的所有權留在原本那支函式，
--    不會有兩份互相覆蓋的版本。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.guard_payout_semantics_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- rollout metadata 的不可變性與「是不是 active shared plan」無關。
  IF OLD.payout_basis_effective_from IS NOT NULL
    AND NEW.payout_basis_effective_from IS DISTINCT FROM OLD.payout_basis_effective_from
  THEN
    RAISE EXCEPTION 'PAYOUT_ROLLOUT_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_active_shared_plan_task_v1(NEW.id) THEN
    RETURN NEW;
  END IF;

  IF NEW.payout_basis        IS DISTINCT FROM OLD.payout_basis
    OR NEW.period_target_count IS DISTINCT FROM OLD.period_target_count
  THEN
    RAISE EXCEPTION 'SHARED_PLAN_REQUIRES_RENEGOTIATION'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_payout_semantics_v1() IS
  '結算語意的守門：payout_basis / period_target_count 屬於共同約定，'
  'active shared plan 下不得 silent mutation；payout_basis_effective_from 是 '
  'rollout metadata，不進 material diff、不觸發孩子重新確認，但寫下後不可改。'
  '刻意與 guard_active_shared_plan_task_v1 分開 —— 那份欄位清單由 P0-8 系列擁有。';

DROP TRIGGER IF EXISTS tasks_payout_semantics_guard ON tasks;
CREATE TRIGGER tasks_payout_semantics_guard
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_payout_semantics_v1();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. complete_task：拆開 progress 與 settlement
--
-- 本函式 forward-derive 自 20260814000000（P0-6 hardening）的定義，
-- 只加上 payout semantics。**legacy 路徑逐字不變** ——
-- payout_basis IS NULL 的任務走的是與 P0-6 之後完全相同的程式碼。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.complete_task(
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
  v_task            record;
  v_goal            record;
  v_child_family    uuid;
  v_coin_earned     int;
  v_time_saved      int;
  v_wallet_id       uuid;
  v_completion_id   uuid;
  v_new_day         int;
  v_rewards         jsonb;
  v_milestone_coin  int;
  v_period_start    date;
  v_claim_count     int;
  v_legacy          boolean;
  v_constraint_name text;
  -- payout semantics
  v_new_semantics   boolean := false;
  v_unsupported     boolean := false;
  v_settle_period   date;
  v_period_done     int     := 0;
  v_should_settle   boolean := false;
  v_settled         boolean := false;
  v_settle_amount   int     := 0;
  v_tx_id           uuid;
BEGIN
  SELECT c.family_id
  INTO v_child_family
  FROM children c
  WHERE c.id = p_child_id;

  IF v_child_family IS NULL THEN
    RAISE EXCEPTION 'Child not found: %', p_child_id USING ERRCODE = '42501';
  END IF;

  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM parents p
      WHERE p.user_id = auth.uid()
        AND p.family_id = v_child_family
    ) THEN
      RAISE EXCEPTION 'Not authorized: child % is not in the caller''s family', p_child_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT category, base_time_min, difficulty, coin_override,
         time_saving_min, long_term_type, day_type, allow_repeat,
         claim_period, max_claims_per_period, reward_policy,
         reward_coin_amount, reward_coin_min, reward_coin_max,
         family_id, is_active, schedule_mode,
         payout_basis, period_target_count, payout_basis_effective_from,
         reward_policy_version
  INTO v_task
  FROM tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  IF v_task.family_id IS DISTINCT FROM v_child_family THEN
    RAISE EXCEPTION 'Not authorized: task % does not belong to child %''s family', p_task_id, p_child_id
      USING ERRCODE = '42501';
  END IF;

  IF v_task.is_active IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('error', 'task_inactive');
  END IF;

  IF p_goal_id IS NOT NULL THEN
    SELECT ltg.child_id, ltg.task_id, ltg.status,
           ltg.current_day, ltg.checkpoint_rewards
    INTO v_goal
    FROM long_term_goals ltg
    WHERE ltg.id = p_goal_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'invalid_goal');
    END IF;

    IF v_goal.child_id IS DISTINCT FROM p_child_id
      OR v_goal.task_id IS DISTINCT FROM p_task_id
    THEN
      RETURN jsonb_build_object('error', 'invalid_goal');
    END IF;

    IF v_goal.status IS DISTINCT FROM 'active' THEN
      RETURN jsonb_build_object('error', 'goal_inactive');
    END IF;
  END IF;

  IF v_task.claim_period = 'once' THEN
    SELECT count(*)
    INTO v_claim_count
    FROM task_completions
    WHERE child_id = p_child_id
      AND task_id = p_task_id
      AND status = 'completed';
  ELSE
    v_period_start := CASE
      WHEN v_task.claim_period = 'week'
        THEN date_trunc('week', (p_completed_at AT TIME ZONE 'Asia/Taipei'))::date
      ELSE (p_completed_at AT TIME ZONE 'Asia/Taipei')::date
    END;

    SELECT count(*)
    INTO v_claim_count
    FROM task_completions
    WHERE child_id = p_child_id
      AND task_id = p_task_id
      AND status = 'completed'
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

  IF NOT EXISTS (
    SELECT 1
    FROM child_tasks ct
    WHERE ct.child_id = p_child_id
      AND ct.task_id = p_task_id
      AND ct.is_active = true
  ) THEN
    RETURN jsonb_build_object('error', 'task_not_assigned');
  END IF;

  -- ── payout semantics 的生效判斷 ───────────────────────────────────────────
  -- settlement period 一律以 Asia/Taipei 的週一為界，與上面 claim window
  -- 用的是同一個表達式，不另立一套。
  v_settle_period := date_trunc('week', (p_completed_at AT TIME ZONE 'Asia/Taipei'))::date;

  IF v_task.payout_basis IS NOT NULL THEN
    v_new_semantics := CASE
      WHEN v_task.payout_basis = 'per_period'
        THEN v_settle_period >= v_task.payout_basis_effective_from
      ELSE (p_completed_at AT TIME ZONE 'Asia/Taipei')::date >= v_task.payout_basis_effective_from
    END;
  END IF;

  v_legacy := (v_task.reward_policy IS NULL);

  IF NOT v_legacy AND v_task.reward_policy = 'time_saving_eligible' THEN
    RETURN jsonb_build_object('error', 'time_saving_not_enabled');
  END IF;

  IF v_legacy THEN
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
    IF v_task.reward_policy = 'coin_eligible' THEN
      v_coin_earned := COALESCE(v_task.reward_coin_amount, 0);

      IF v_coin_earned <= 0 THEN
        RETURN jsonb_build_object('error', 'coin_amount_not_configured');
      END IF;
    ELSE
      v_coin_earned := 0;
    END IF;

    v_time_saved := 0;
  END IF;

  -- 新語意下，完成本身不再等於結算：completion 一律先記 0，
  -- 真的形成 reward event 時再回填。
  IF v_new_semantics THEN
    v_settle_amount := v_coin_earned;
    v_coin_earned   := 0;
  END IF;

  BEGIN
    INSERT INTO task_completions
      (task_id, child_id, completed_at, reported_by, status, coin_earned, time_saved_min)
    VALUES
      (p_task_id, p_child_id, p_completed_at, 'child', 'completed', v_coin_earned, v_time_saved)
    RETURNING id INTO v_completion_id;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name = 'idx_unique_task_per_day' THEN
        RETURN jsonb_build_object('error', 'already_completed');
      ELSE
        RAISE;
      END IF;
  END;

  IF v_coin_earned > 0 THEN
    UPDATE wallets
    SET balance = balance + v_coin_earned
    WHERE child_id = p_child_id
      AND wallet_type = 'spending'
    RETURNING id INTO v_wallet_id;

    IF v_wallet_id IS NULL THEN
      RAISE EXCEPTION 'Spending wallet not found for child %', p_child_id;
    END IF;

    INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
    VALUES (v_wallet_id, v_coin_earned, 'earn', v_completion_id, 'task_completion');
  END IF;

  IF v_task.category = 'B' AND v_time_saved > 0 THEN
    INSERT INTO time_savings (child_id, completion_id, minutes_saved)
    VALUES (p_child_id, v_completion_id, v_time_saved);
  END IF;

  -- ── settlement ────────────────────────────────────────────────────────────
  IF v_new_semantics THEN
    IF v_task.payout_basis = 'per_period' THEN
      SELECT count(*)
      INTO v_period_done
      FROM task_completions
      WHERE child_id = p_child_id
        AND task_id  = p_task_id
        AND status   = 'completed'
        AND date_trunc('week', (completed_at AT TIME ZONE 'Asia/Taipei'))::date = v_settle_period;
    END IF;

    IF v_task.reward_policy = 'coin_eligible' AND v_settle_amount > 0 THEN
      IF v_task.payout_basis = 'per_completion' THEN
        v_should_settle := true;
      ELSIF v_task.payout_basis = 'per_period' THEN
        v_should_settle := v_task.period_target_count IS NOT NULL
                           AND v_period_done >= v_task.period_target_count;
      ELSE
        -- per_milestone / final_completion：Phase 1 沒有執行路徑。
        -- fail closed —— 記 progress、不 mint、不擋孩子打卡。
        v_unsupported := true;
      END IF;
    END IF;

    IF v_should_settle THEN
      -- 錢包、transaction、settlement 三個寫入在同一個 subtransaction 裡。
      -- 撞到 unique index 就整組回滾，該次完成降級為只記 progress ——
      -- 這就是重試／雙擊／併發不可能 double mint 的地方。
      BEGIN
        UPDATE wallets
        SET balance = balance + v_settle_amount
        WHERE child_id = p_child_id
          AND wallet_type = 'spending'
        RETURNING id INTO v_wallet_id;

        IF v_wallet_id IS NULL THEN
          RAISE EXCEPTION 'Spending wallet not found for child %', p_child_id;
        END IF;

        INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
        VALUES (v_wallet_id, v_settle_amount, 'earn', v_completion_id, 'task_completion')
        RETURNING id INTO v_tx_id;

        INSERT INTO reward_settlements (
          task_id, child_id, reward_basis, period_start,
          completion_id, coin_amount, reward_policy_version, transaction_id
        ) VALUES (
          p_task_id, p_child_id, v_task.payout_basis,
          CASE WHEN v_task.payout_basis = 'per_period' THEN v_settle_period ELSE NULL END,
          v_completion_id, v_settle_amount, v_task.reward_policy_version, v_tx_id
        );

        UPDATE task_completions
        SET coin_earned = v_settle_amount
        WHERE id = v_completion_id;

        v_coin_earned := v_settle_amount;
        v_settled     := true;
      EXCEPTION
        WHEN unique_violation THEN
          v_coin_earned := 0;
          v_settled     := false;
      END;
    END IF;
  END IF;

  IF v_task.day_type = 'once' THEN
    UPDATE child_tasks
    SET is_active = false
    WHERE task_id = p_task_id
      AND child_id = p_child_id;
  END IF;

  -- checkpoint_rewards 是 legacy 的節點式發幣。新語意的任務不走這條 ——
  -- 它們的階段回饋屬於 per_milestone，而那是 Phase 2。
  v_milestone_coin := NULL;
  IF NOT v_new_semantics
    AND v_task.category = 'D'
    AND v_task.long_term_type = 'habit'
    AND p_goal_id IS NOT NULL
  THEN
    UPDATE long_term_goals
    SET current_day = current_day + 1
    WHERE id = p_goal_id
    RETURNING current_day, checkpoint_rewards
    INTO v_new_day, v_rewards;

    IF v_rewards IS NOT NULL THEN
      v_milestone_coin := (v_rewards->>(v_new_day::text))::int;
    END IF;

    IF v_milestone_coin IS NOT NULL
      AND v_task.reward_policy = 'coin_eligible'
      AND v_task.schedule_mode IS DISTINCT FROM 'weekly_frequency'
      AND v_milestone_coin > 0
      AND v_task.reward_coin_min IS NOT NULL
      AND v_task.reward_coin_max IS NOT NULL
      AND v_milestone_coin BETWEEN v_task.reward_coin_min AND v_task.reward_coin_max
    THEN
      IF v_wallet_id IS NULL THEN
        SELECT id
        INTO v_wallet_id
        FROM wallets
        WHERE child_id = p_child_id
          AND wallet_type = 'spending';
      END IF;

      IF v_wallet_id IS NOT NULL THEN
        UPDATE wallets
        SET balance = balance + v_milestone_coin
        WHERE id = v_wallet_id;

        INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
        VALUES (v_wallet_id, v_milestone_coin, 'earn', p_goal_id, 'long_term_goal_milestone');
      END IF;
    ELSE
      v_milestone_coin := NULL;
    END IF;
  ELSIF v_new_semantics
    AND v_task.category = 'D'
    AND v_task.long_term_type = 'habit'
    AND p_goal_id IS NOT NULL
  THEN
    -- 新語意仍然要推進 current_day（它是投入紀錄），只是不再發 checkpoint 幣。
    UPDATE long_term_goals
    SET current_day = current_day + 1
    WHERE id = p_goal_id
    RETURNING current_day INTO v_new_day;
  END IF;

  RETURN jsonb_build_object(
    'completionId', v_completion_id,
    'coinEarned', v_coin_earned,
    'timeSavedMin', v_time_saved,
    'payoutBasis', v_task.payout_basis,
    'payoutBasisUnsupported', v_unsupported,
    'period', CASE
      WHEN v_new_semantics AND v_task.payout_basis = 'per_period' THEN jsonb_build_object(
        'start', v_settle_period,
        'done', v_period_done,
        'target', v_task.period_target_count,
        'settled', v_settled
      )
      ELSE NULL
    END,
    'settlement', CASE
      WHEN v_settled THEN jsonb_build_object(
        'basis', v_task.payout_basis,
        'coinAmount', v_settle_amount
      )
      ELSE NULL
    END,
    'milestone', CASE
      WHEN v_milestone_coin IS NOT NULL THEN jsonb_build_object(
        'goalId', p_goal_id,
        'day', v_new_day,
        'coinReward', v_milestone_coin
      )
      ELSE NULL
    END
  );
END;
$$;

COMMENT ON FUNCTION public.complete_task(uuid, uuid, timestamptz, boolean, uuid) IS
  'Atomically records a progress event and, only when payout_basis says so, a reward event. '
  'payout_basis IS NULL 的任務走與 P0-6 逐字相同的 legacy 路徑。'
  'Reward events are idempotent at the database level via reward_settlements'' unique indexes.';

REVOKE EXECUTE ON FUNCTION public.complete_task(uuid, uuid, timestamptz, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_task(uuid, uuid, timestamptz, boolean, uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. 建立閘門：未實作的 payout basis 回 typed error
--
-- trigger 用 RAISE 擋下來（那是唯一能覆蓋所有建立路徑的位置），
-- 但呼叫端拿到的必須是與其他失敗一致的 { ok:false, code } —— 而不是一個
-- 裸的資料庫錯誤。本函式 forward-derive 自 20260813000000，只加上這層轉譯。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_parent_task_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text := NULLIF(btrim(COALESCE(p_command ->> 'creationSource', '')), '');
  v_core_command jsonb;
  v_result jsonb;
  v_task_id uuid;
  v_event_id uuid;
  v_related jsonb;
  v_progress text := NULLIF(btrim(COALESCE(p_command ->> 'progressModel', '')), '');
  v_next_step text := NULLIF(btrim(COALESCE(p_command ->> 'nextStep', '')), '');
BEGIN
  IF v_source IS DISTINCT FROM 'child_proposal' THEN
    RETURN public.create_parent_task_core_v1(p_command);
  END IF;

  IF p_command -> 'preset' IS NOT NULL
    OR COALESCE(btrim(COALESCE(p_command -> 'metadata' ->> 'presetCatalogVersion', '')), '') <> '' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '孩子提案是 non-preset source，不可帶 preset identity'
    );
  END IF;

  IF v_progress IS NOT NULL AND v_progress <> 'weekly_rhythm' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '未知的進度模型'
    );
  END IF;

  IF v_progress = 'weekly_rhythm' AND (
    p_command -> 'task' ->> 'durationType' IS DISTINCT FROM 'long_term'
    OR p_command -> 'schedule' ->> 'mode' IS DISTINCT FROM 'weekly_frequency'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', 'weekly_rhythm 必須是 long_term + weekly_frequency'
    );
  END IF;

  v_core_command := jsonb_set(p_command, '{creationSource}', '"parent_custom"'::jsonb, true);
  v_result := public.create_parent_task_core_v1(v_core_command);
  IF COALESCE((v_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  v_task_id := NULLIF(v_result ->> 'taskId', '')::uuid;

  UPDATE tasks
     SET creation_source = 'child_proposal',
         progress_model = v_progress,
         next_step = v_next_step,
         long_term_type = CASE WHEN v_progress = 'weekly_rhythm' THEN 'habit'
                               ELSE long_term_type END
   WHERE id = v_task_id;

  IF v_progress = 'weekly_rhythm' THEN
    UPDATE long_term_goals
       SET goal_type = 'habit'
     WHERE task_id = v_task_id;
  END IF;

  UPDATE task_change_events
     SET event_type = 'created_from_child_proposal',
         snapshot = jsonb_set(
           jsonb_set(COALESCE(snapshot, '{}'::jsonb),
                     '{creationSource}', to_jsonb('child_proposal'::text), true),
           '{command}', p_command, true
         )
   WHERE task_id = v_task_id
     AND event_type = 'created_parent_custom'
  RETURNING id INTO v_event_id;

  SELECT COALESCE(jsonb_agg(rows.id ORDER BY rows.kind, rows.id), '[]'::jsonb)
    INTO v_related
    FROM (
      SELECT ct.id, 1 AS kind FROM child_tasks ct WHERE ct.task_id = v_task_id
      UNION ALL
      SELECT g.id, 2 AS kind FROM long_term_goals g WHERE g.task_id = v_task_id
      UNION ALL
      SELECT e.id, 3 AS kind FROM task_change_events e
       WHERE e.task_id = v_task_id AND e.event_type = 'created_from_child_proposal'
    ) AS rows;

  RETURN jsonb_set(v_result, '{relatedIds}', v_related, true);
EXCEPTION
  -- 只轉譯這一種，其餘原樣拋出 —— 把所有例外都吃掉會讓
  -- SHARED_PLAN_REQUIRES_RENEGOTIATION 之類的守門訊息消失。
  WHEN OTHERS THEN
    IF SQLERRM = 'PAYOUT_BASIS_NOT_IMPLEMENTED' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'PAYOUT_BASIS_NOT_IMPLEMENTED',
        'message', '這種長期任務的結算方式還沒有實作：階段完成與整段計畫完成的結算屬於下一輪'
      );
    END IF;
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.create_parent_task_v1(jsonb) IS
  '建立任務的唯一入口。孩子提案走 child_proposal 分支，其餘轉給 core。'
  '未實作的 payout basis 回 typed error PAYOUT_BASIS_NOT_IMPLEMENTED，不建立任何資料。';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. 收掉家長端的發幣後門
--
-- parentCompleteTaskForChild 原本在 client 端直接 insert completion、
-- 加錢包、寫 transaction，金額來自家長的輸入框：不檢查 reward_policy、
-- 不檢查 min/max、沒有 idempotency，而且三個寫入不是原子的。
-- 只修 complete_task 而留著這條路，等於新制上線第一天就有一個繞道。
--
-- 這支 RPC 取而代之：
--   * 新語意任務（payout_basis IS NOT NULL）→ **完全忽略家長輸入的金額**，
--     轉呼叫 complete_task 走同一套結算與 idempotency，只把 reported_by 改成 parent。
--   * legacy 任務 → 維持家長輸入金額的既有行為（§14：不改既有共同約定），
--     但把三個寫入收進同一個 transaction。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.parent_complete_task_for_child_v1(
  p_task_id        uuid,
  p_child_id       uuid,
  p_completed_at   timestamptz,
  p_coin_amount    integer,
  p_time_saved_min integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child_family  uuid;
  v_task          record;
  v_goal_id       uuid;
  v_result        jsonb;
  v_completion_id uuid;
  v_wallet_id     uuid;
  v_amount        int;
BEGIN
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

  SELECT id, family_id, is_active, payout_basis, category, time_saving_min
  INTO v_task
  FROM tasks WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  IF v_task.family_id IS DISTINCT FROM v_child_family THEN
    RAISE EXCEPTION 'Not authorized: task % does not belong to child %''s family', p_task_id, p_child_id
      USING ERRCODE = '42501';
  END IF;

  IF v_task.is_active IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('error', 'task_inactive');
  END IF;

  -- ── 新語意：金額由伺服器決定，家長輸入的數字丟掉 ──────────────────────────
  IF v_task.payout_basis IS NOT NULL THEN
    SELECT ltg.id INTO v_goal_id
    FROM long_term_goals ltg
    WHERE ltg.task_id = p_task_id
      AND ltg.child_id = p_child_id
      AND ltg.status = 'active'
    LIMIT 1;

    v_result := public.complete_task(p_task_id, p_child_id, p_completed_at, true, v_goal_id);

    v_completion_id := NULLIF(v_result ->> 'completionId', '')::uuid;
    IF v_completion_id IS NOT NULL THEN
      -- 是誰回報的是事實，不該因為走了哪支函式而失真。
      UPDATE task_completions SET reported_by = 'parent' WHERE id = v_completion_id;
    END IF;

    RETURN v_result || jsonb_build_object('coinInputIgnored', true);
  END IF;

  -- ── legacy：維持家長輸入金額的既有行為，但收進同一個 transaction ─────────
  v_amount := GREATEST(0, COALESCE(p_coin_amount, 0));

  BEGIN
    INSERT INTO task_completions
      (task_id, child_id, completed_at, reported_at, reported_by, status,
       coin_earned, time_saved_min, mentor_child_id)
    VALUES
      (p_task_id, p_child_id, p_completed_at, p_completed_at, 'parent', 'completed',
       v_amount, COALESCE(p_time_saved_min, 0), NULL)
    RETURNING id INTO v_completion_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('error', 'already_completed');
  END;

  IF v_amount > 0 THEN
    UPDATE wallets
    SET balance = balance + v_amount
    WHERE child_id = p_child_id AND wallet_type = 'spending'
    RETURNING id INTO v_wallet_id;

    IF v_wallet_id IS NULL THEN
      RAISE EXCEPTION 'Spending wallet not found for child %', p_child_id;
    END IF;

    INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
    VALUES (v_wallet_id, v_amount, 'earn', v_completion_id, 'task_completion');
  END IF;

  RETURN jsonb_build_object(
    'completionId', v_completion_id,
    'coinEarned', v_amount,
    'timeSavedMin', COALESCE(p_time_saved_min, 0),
    'payoutBasis', NULL,
    'coinInputIgnored', false
  );
END;
$$;

COMMENT ON FUNCTION public.parent_complete_task_for_child_v1(uuid, uuid, timestamptz, integer, integer) IS
  '家長代替孩子標記完成。新語意任務忽略家長輸入的金額，改走 complete_task 的結算與'
  ' idempotency；legacy 任務維持既有的家長輸入行為，但三個寫入變成原子的。';

REVOKE EXECUTE ON FUNCTION public.parent_complete_task_for_child_v1(uuid, uuid, timestamptz, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parent_complete_task_for_child_v1(uuid, uuid, timestamptz, integer, integer)
  TO authenticated, service_role;

COMMIT;
