-- ═══════════════════════════════════════════════════════════════════════════
-- CHILD-REVIEW-V2 — 孩子在回顧後提出「每週次數」的重新協商（cadence lane）
--
-- ─────────────────────────────────────────────────────────────────────────
-- 為什麼需要這一支
--
--   P0-8M 只開了 preferred_time 一條通道，而且擋得很徹底：
--     create  IF v_kind <> 'preferred_time' → ADJUSTMENT_KIND_NOT_SUPPORTED
--     accept  同上，且收尾驗證 cadence_weekly_frequency **不可以變**
--     guard   weekly_frequency 在凍結清單裡 → SHARED_PLAN_REQUIRES_RENEGOTIATION
--
--   P1-A4B2 的 request_child_planning_term_changes_v1 也不行 —— 那一支要求
--   status = 'needs_child_review' 且 task_id IS NULL，服務的是**還沒啟用**的
--   協商迴圈。進行中的計畫走不到。
--
--   所以「每週 3 次 → 每週 2 次」目前沒有任何一條合法路徑。這一支開它。
--
-- ─────────────────────────────────────────────────────────────────────────
-- 這一支**不做**的事
--
--   - 不從進度反推目標。完成 2 次 / 約定 3 次**不會**讓系統建議改成 2 次；
--     次數永遠來自孩子在回顧裡選的方向，由呼叫端帶進來。
--   - 不動時段、期間、回饋、任何既有完成紀錄或錢包。
--   - 不改 P0-8M 的 preferred_time 語意。那條通道的每一個判斷都原樣保留，
--     這裡只是在它旁邊開第二條，共用同一套版本 / 授權 / 冪等機制。
--   - 不碰 milestone schema 與結算。Review 與 milestone 是獨立的兩件事。
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 同一版本同時只能有一筆未決的次數請求 ──────────────────────────────
--
-- 與 preferred_time 那條**各自獨立**：送過換時段不該連帶把改次數也鎖住，
-- 兩者是不同的談判。

CREATE UNIQUE INDEX IF NOT EXISTS child_proposal_adjustment_requests_one_open_cadence_idx
  ON child_proposal_adjustment_requests (proposal_id, based_on_plan_version_id)
  WHERE status = 'open' AND adjustment_kind = 'cadence';


-- ── 2. guard 能自己驗證的授權述詞 ────────────────────────────────────────
--
-- 與 is_authorized_preferred_time_renegotiation_v1 同一個形狀，只是這次
-- 「唯一允許不同的那一欄」換成 cadence_weekly_frequency，而 preferred_time
-- 反過來被要求必須一致 —— 一份順便動了時段的版本，什麼都授權不了。

CREATE OR REPLACE FUNCTION public.is_authorized_cadence_renegotiation_v1(
  p_task_id uuid,
  p_old_frequency integer,
  p_new_frequency integer
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM child_proposals cp
    JOIN child_proposal_plan_versions cur
      ON cur.id = cp.current_plan_version_id
     AND cur.proposal_id = cp.id
    JOIN child_proposal_plan_versions src
      ON src.id = cur.adopted_from_plan_version_id
     AND src.proposal_id = cp.id
    WHERE cp.task_id = p_task_id
      AND cp.status = 'active'
      AND cur.authored_by = 'parent'
      AND cur.requires_child_review = false
      AND cur.parent_confirmed_at IS NOT NULL
      AND cur.effective_at IS NOT NULL
      AND cur.confirmed_source_task_id = p_task_id
      AND cur.cadence_weekly_frequency IS NOT DISTINCT FROM p_new_frequency
      AND src.cadence_weekly_frequency IS NOT DISTINCT FROM p_old_frequency
      -- 其餘一欄都不准動，preferred_time 也在其中。
      AND cur.plan_title              IS NOT DISTINCT FROM src.plan_title
      AND cur.plan_summary            IS NOT DISTINCT FROM src.plan_summary
      AND cur.purpose_category        IS NOT DISTINCT FROM src.purpose_category
      AND cur.completion_description  IS NOT DISTINCT FROM src.completion_description
      AND cur.progress_model          IS NOT DISTINCT FROM src.progress_model
      AND cur.next_step               IS NOT DISTINCT FROM src.next_step
      AND cur.cadence_mode            IS NOT DISTINCT FROM src.cadence_mode
      AND cur.cadence_days            IS NOT DISTINCT FROM src.cadence_days
      AND cur.preferred_time          IS NOT DISTINCT FROM src.preferred_time
      AND cur.preferred_time_custom   IS NOT DISTINCT FROM src.preferred_time_custom
      AND cur.estimated_minutes       IS NOT DISTINCT FROM src.estimated_minutes
      AND cur.duration_type           IS NOT DISTINCT FROM src.duration_type
      AND cur.duration_days           IS NOT DISTINCT FROM src.duration_days
      AND cur.reward_policy           IS NOT DISTINCT FROM src.reward_policy
      AND cur.reward_eligibility      IS NOT DISTINCT FROM src.reward_eligibility
      AND cur.reward_policy_version   IS NOT DISTINCT FROM src.reward_policy_version
      AND cur.task_policy_version     IS NOT DISTINCT FROM src.task_policy_version
      AND cur.ai_suggested_coin_amount IS NOT DISTINCT FROM src.ai_suggested_coin_amount
  );
$$;

REVOKE ALL ON FUNCTION public.is_authorized_cadence_renegotiation_v1(
  uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_authorized_cadence_renegotiation_v1(
  uuid, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.is_authorized_cadence_renegotiation_v1(
  uuid, integer, integer) IS
  'CHILD-REVIEW-V2：允許動 active Shared Plan 的 weekly_frequency 的唯一條件 ——'
  '家庭已經有一份「只差每週次數」的正式新共同版本，而且它記的正是這次要寫的值。';


-- ── 3. guard：把 weekly_frequency 從凍結清單移到有條件開放 ────────────────
--
-- 只有這一欄的位置改變。P0-8G 凍結的其餘每一欄、preferred_time 的既有
-- 判斷、DELETE 與停用的處理，一字未動。

CREATE OR REPLACE FUNCTION public.guard_active_shared_plan_task_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid;
  v_material_changed boolean := false;
  v_time_changed boolean := false;
  v_cadence_changed boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_task_id := OLD.id;
  ELSE
    v_task_id := NEW.id;
  END IF;

  IF NOT public.is_active_shared_plan_task_v1(v_task_id) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SHARED_PLAN_REQUIRES_RENEGOTIATION'
      USING ERRCODE = 'P0001';
  END IF;

  -- preferred_time / preferred_time_custom（P0-8M）與 weekly_frequency
  -- （本包）刻意不在這份清單裡，各自在下面單獨處理。
  v_material_changed :=
       NEW.name                         IS DISTINCT FROM OLD.name
    OR NEW.category                     IS DISTINCT FROM OLD.category
    OR NEW.day_type                     IS DISTINCT FROM OLD.day_type
    OR NEW.long_term_type               IS DISTINCT FROM OLD.long_term_type
    OR NEW.is_long_term                 IS DISTINCT FROM OLD.is_long_term
    OR NEW.base_time_min                IS DISTINCT FROM OLD.base_time_min
    OR NEW.difficulty                   IS DISTINCT FROM OLD.difficulty
    OR NEW.coin_override                IS DISTINCT FROM OLD.coin_override
    OR NEW.allow_repeat                 IS DISTINCT FROM OLD.allow_repeat
    OR NEW.min_age                      IS DISTINCT FROM OLD.min_age
    OR NEW.max_age                      IS DISTINCT FROM OLD.max_age
    OR NEW.time_saving_min              IS DISTINCT FROM OLD.time_saving_min
    OR NEW.recurrence_days              IS DISTINCT FROM OLD.recurrence_days
    OR NEW.due_date                     IS DISTINCT FROM OLD.due_date
    OR NEW.duration_type                IS DISTINCT FROM OLD.duration_type
    OR NEW.plan_mode                    IS DISTINCT FROM OLD.plan_mode
    OR NEW.task_source                  IS DISTINCT FROM OLD.task_source
    OR NEW.reward_policy                IS DISTINCT FROM OLD.reward_policy
    OR NEW.completion_policy            IS DISTINCT FROM OLD.completion_policy
    OR NEW.original_expectation         IS DISTINCT FROM OLD.original_expectation
    OR NEW.completion_description       IS DISTINCT FROM OLD.completion_description
    OR NEW.task_details                 IS DISTINCT FROM OLD.task_details
    OR NEW.notes                        IS DISTINCT FROM OLD.notes
    OR NEW.schedule_mode                IS DISTINCT FROM OLD.schedule_mode
    OR NEW.start_date                   IS DISTINCT FROM OLD.start_date
    OR NEW.scheduled_date               IS DISTINCT FROM OLD.scheduled_date
    OR NEW.estimated_minutes            IS DISTINCT FROM OLD.estimated_minutes
    OR NEW.claim_period                 IS DISTINCT FROM OLD.claim_period
    OR NEW.max_claims_per_period        IS DISTINCT FROM OLD.max_claims_per_period
    OR NEW.review_enabled               IS DISTINCT FROM OLD.review_enabled
    OR NEW.review_after_days            IS DISTINCT FROM OLD.review_after_days
    OR NEW.support_level                IS DISTINCT FROM OLD.support_level
    OR NEW.reward_coin_amount           IS DISTINCT FROM OLD.reward_coin_amount
    OR NEW.reward_coin_suggested_amount IS DISTINCT FROM OLD.reward_coin_suggested_amount
    OR NEW.reward_coin_min              IS DISTINCT FROM OLD.reward_coin_min
    OR NEW.reward_coin_max              IS DISTINCT FROM OLD.reward_coin_max
    OR NEW.task_policy_version          IS DISTINCT FROM OLD.task_policy_version
    OR NEW.reward_policy_version        IS DISTINCT FROM OLD.reward_policy_version
    OR NEW.creation_source              IS DISTINCT FROM OLD.creation_source
    OR NEW.progress_model               IS DISTINCT FROM OLD.progress_model
    OR NEW.next_step                    IS DISTINCT FROM OLD.next_step
    OR (OLD.is_active = true AND NEW.is_active = false);

  IF v_material_changed THEN
    RAISE EXCEPTION 'SHARED_PLAN_REQUIRES_RENEGOTIATION'
      USING ERRCODE = 'P0001';
  END IF;

  v_time_changed :=
       NEW.preferred_time        IS DISTINCT FROM OLD.preferred_time
    OR NEW.preferred_time_custom IS DISTINCT FROM OLD.preferred_time_custom;

  IF v_time_changed
    AND NOT public.is_authorized_preferred_time_renegotiation_v1(
      v_task_id, OLD.preferred_time, OLD.preferred_time_custom,
      NEW.preferred_time, NEW.preferred_time_custom) THEN
    RAISE EXCEPTION 'SHARED_PLAN_REQUIRES_RENEGOTIATION'
      USING ERRCODE = 'P0001';
  END IF;

  v_cadence_changed := NEW.weekly_frequency IS DISTINCT FROM OLD.weekly_frequency;

  -- 一次 UPDATE 同時動時段與次數是**兩個**談判的結果，不會有任何一份
  -- 「只差一欄」的版本能授權它 —— 兩個述詞都會回 false，這裡直接擋掉。
  IF v_cadence_changed
    AND NOT public.is_authorized_cadence_renegotiation_v1(
      v_task_id, OLD.weekly_frequency, NEW.weekly_frequency) THEN
    RAISE EXCEPTION 'SHARED_PLAN_REQUIRES_RENEGOTIATION'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


-- ── 4. 建立請求：多接受一種 kind ─────────────────────────────────────────
--
-- preferred_time 的每一個判斷原樣保留。cadence 走自己的欄位驗證，
-- 其餘（冪等、active 檢查、版本檢查、單一未決請求）兩者共用。

CREATE OR REPLACE FUNCTION public.create_child_proposal_adjustment_request_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal    child_proposals%ROWTYPE;
  v_plan        child_proposal_plan_versions%ROWTYPE;
  v_existing    child_proposal_adjustment_requests%ROWTYPE;
  v_expected    uuid;
  v_client_id   uuid;
  v_kind        text;
  v_reason      text;
  v_changes     jsonb;
  v_new_time    text;
  v_new_custom  text;
  v_new_freq    integer;
  v_payload     jsonb;
  v_request_id  uuid;
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本');
  END IF;

  v_expected  := NULLIF(p_command ->> 'expectedPlanVersionId', '')::uuid;
  v_client_id := NULLIF(p_command ->> 'clientRequestId', '')::uuid;
  v_kind      := NULLIF(btrim(COALESCE(p_command ->> 'adjustmentKind', '')), '');
  v_reason    := NULLIF(btrim(COALESCE(p_command ->> 'reason', '')), '');
  v_changes   := p_command -> 'requestedChanges';

  IF NULLIF(p_command ->> 'proposalId', '') IS NULL
    OR v_expected IS NULL OR v_kind IS NULL OR v_reason IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId、expectedPlanVersionId、adjustmentKind 或 reason');
  END IF;

  -- 其餘 kind（scope / support / reward / pause / stop / other）後面仍然沒有
  -- workflow，收下來只會建出沒人能結案的請求。
  IF v_kind NOT IN ('preferred_time', 'cadence') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'reason', 'ADJUSTMENT_KIND_NOT_SUPPORTED',
      'message', '目前只能一起調整時段或每週次數');
  END IF;

  IF jsonb_typeof(v_changes) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'reason', 'ADJUSTMENT_FIELD_TYPE_INVALID',
      'message', '調整內容的格式不正確');
  END IF;

  IF v_kind = 'preferred_time' THEN
    IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_changes) AS key
         WHERE key NOT IN ('preferredTime', 'preferredTimeCustom'))
      OR jsonb_typeof(v_changes -> 'preferredTime') IS DISTINCT FROM 'string'
      OR (
        jsonb_typeof(v_changes -> 'preferredTimeCustom') IS DISTINCT FROM 'string'
        AND jsonb_typeof(v_changes -> 'preferredTimeCustom') IS DISTINCT FROM 'null'
        AND v_changes ? 'preferredTimeCustom'
      ) THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'ADJUSTMENT_FIELD_TYPE_INVALID',
        'message', '調整內容的格式不正確');
    END IF;

    v_new_time   := NULLIF(btrim(COALESCE(v_changes ->> 'preferredTime', '')), '');
    v_new_custom := NULLIF(btrim(COALESCE(v_changes ->> 'preferredTimeCustom', '')), '');

    IF v_new_time NOT IN ('after_dinner', 'before_bed') OR v_new_custom IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'PREFERRED_TIME_INVALID',
        'message', '目前只能選晚餐後或睡覺前');
    END IF;
    v_payload := jsonb_build_object(
      'preferredTime', v_new_time, 'preferredTimeCustom', v_new_custom);
  ELSE
    IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_changes) AS key
         WHERE key NOT IN ('weeklyFrequency'))
      OR jsonb_typeof(v_changes -> 'weeklyFrequency') IS DISTINCT FROM 'number' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'ADJUSTMENT_FIELD_TYPE_INVALID',
        'message', '調整內容的格式不正確');
    END IF;

    v_new_freq := (v_changes ->> 'weeklyFrequency')::numeric;
    -- 一週 0 次不是「調整」，那是暫停，語意與退場都不一樣，走別條路。
    IF v_new_freq IS NULL OR v_new_freq < 1 OR v_new_freq > 7
      OR (v_changes ->> 'weeklyFrequency')::numeric <> v_new_freq THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'WEEKLY_FREQUENCY_INVALID',
        'message', '每週次數要在 1 到 7 之間');
    END IF;
    v_payload := jsonb_build_object('weeklyFrequency', v_new_freq);
  END IF;

  SELECT * INTO v_proposal FROM child_proposals
   WHERE id = (p_command ->> 'proposalId')::uuid
   FOR UPDATE;
  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: proposal is not visible to the caller'
      USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

  -- 同一個 clientRequestId 是同一次送出。在任何狀態檢查之前決定，
  -- 這樣「已經成功但回應掉了」的重試仍然拿回原本那筆。
  IF v_client_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM child_proposal_adjustment_requests
     WHERE proposal_id = v_proposal.id AND client_request_id = v_client_id;
    IF v_existing.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', true, 'adjustmentRequestId', v_existing.id,
        'status', v_existing.status, 'idempotentReplay', true);
    END IF;
  END IF;

  IF v_proposal.status <> 'active' OR v_proposal.task_id IS NULL
    OR v_proposal.current_plan_version_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'PROPOSAL_NOT_ACTIVE_SHARED_PLAN',
      'message', '這份計畫目前不是進行中的共同計畫');
  END IF;
  IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'STALE_PLAN_VERSION',
      'reason', 'STALE_PLAN_VERSION', 'message', '計畫已更新，請重新整理後再試');
  END IF;

  SELECT * INTO v_plan FROM child_proposal_plan_versions
   WHERE id = v_expected AND proposal_id = v_proposal.id;
  IF v_plan.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'STALE_PLAN_VERSION',
      'reason', 'STALE_PLAN_VERSION', 'message', '計畫已更新，請重新整理後再試');
  END IF;

  IF v_kind = 'preferred_time' THEN
    IF v_plan.preferred_time IS NOT DISTINCT FROM v_new_time
      AND v_plan.preferred_time_custom IS NOT DISTINCT FROM v_new_custom THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'NO_MATERIAL_CHANGE',
        'reason', 'NO_MATERIAL_CHANGE', 'message', '這個時段和目前的安排一樣');
    END IF;
  ELSE
    IF v_plan.cadence_weekly_frequency IS NOT DISTINCT FROM v_new_freq THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'NO_MATERIAL_CHANGE',
        'reason', 'NO_MATERIAL_CHANGE', 'message', '這個次數和目前的安排一樣');
    END IF;
    -- 沒有每週次數的計畫（階段型、固定日期）沒有這個東西可以談。
    IF v_plan.cadence_weekly_frequency IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'PLAN_HAS_NO_WEEKLY_CADENCE',
        'message', '這份計畫沒有每週次數可以調整');
    END IF;
  END IF;

  SELECT * INTO v_existing FROM child_proposal_adjustment_requests
   WHERE proposal_id = v_proposal.id
     AND based_on_plan_version_id = v_expected
     AND adjustment_kind = v_kind
     AND status = 'open';
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'ADJUSTMENT_ALREADY_OPEN',
      'reason', 'ADJUSTMENT_ALREADY_OPEN',
      'adjustmentRequestId', v_existing.id,
      'message', '已經送出過一次了，等爸媽一起確認');
  END IF;

  INSERT INTO child_proposal_adjustment_requests (
    proposal_id, family_id, requested_by, requester_user_id,
    based_on_plan_version_id, adjustment_kind, reason, requested_changes,
    client_request_id
  ) VALUES (
    v_proposal.id, v_proposal.family_id, 'child', auth.uid(),
    v_expected, v_kind, v_reason, v_payload, v_client_id
  ) RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'ok', true, 'adjustmentRequestId', v_request_id,
    'status', 'open', 'idempotentReplay', false);
END;
$$;

COMMENT ON FUNCTION public.create_child_proposal_adjustment_request_v1(jsonb) IS
  'P0-8M ＋ CHILD-REVIEW-V2：孩子對進行中的共同計畫提出換時段或改每週次數。'
  '只建立 open 請求，不改計畫也不改任務。次數由呼叫端帶入，不從進度反推。';


-- ── 5. 家長接受：一個 transaction，一個新共同版本 ────────────────────────

CREATE OR REPLACE FUNCTION public.accept_child_proposal_adjustment_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request   child_proposal_adjustment_requests%ROWTYPE;
  v_proposal  child_proposals%ROWTYPE;
  v_src       child_proposal_plan_versions%ROWTYPE;
  v_new       child_proposal_plan_versions%ROWTYPE;
  v_task      tasks%ROWTYPE;
  v_expected  uuid;
  v_kind      text;
  v_new_time  text;
  v_new_custom text;
  v_new_freq  integer;
  v_next_no   int;
  v_new_id    uuid;
  v_event     text;
  v_now       timestamptz := now();
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本');
  END IF;
  v_expected := NULLIF(p_command ->> 'expectedPlanVersionId', '')::uuid;
  IF NULLIF(p_command ->> 'adjustmentRequestId', '') IS NULL OR v_expected IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 adjustmentRequestId 或 expectedPlanVersionId');
  END IF;

  SELECT * INTO v_request FROM child_proposal_adjustment_requests
   WHERE id = (p_command ->> 'adjustmentRequestId')::uuid
   FOR UPDATE;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: adjustment request is not visible to the caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_proposal FROM child_proposals
   WHERE id = v_request.proposal_id
   FOR UPDATE;
  PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

  IF v_request.status = 'accepted' THEN
    IF v_request.resolved_plan_version_id IS NOT NULL
      AND v_proposal.current_plan_version_id = v_request.resolved_plan_version_id
      AND v_request.based_on_plan_version_id = v_expected THEN
      RETURN jsonb_build_object(
        'ok', true, 'adjustmentRequestId', v_request.id,
        'proposalId', v_proposal.id,
        'planVersionId', v_request.resolved_plan_version_id,
        'taskId', v_proposal.task_id, 'idempotentReplay', true);
    END IF;
    RETURN jsonb_build_object(
      'ok', false, 'code', 'STALE_PLAN_VERSION',
      'reason', 'STALE_PLAN_VERSION', 'message', '這個調整已經由另一個版本成立');
  END IF;

  IF v_request.status <> 'open' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'ADJUSTMENT_NOT_OPEN', 'message', '這個調整已經處理過了');
  END IF;

  v_kind := v_request.adjustment_kind;
  IF v_kind NOT IN ('preferred_time', 'cadence') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'reason', 'ADJUSTMENT_KIND_NOT_SUPPORTED',
      'message', '目前只能一起調整時段或每週次數');
  END IF;

  IF v_proposal.status <> 'active' OR v_proposal.task_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'PROPOSAL_NOT_ACTIVE_SHARED_PLAN',
      'message', '這份計畫目前不是進行中的共同計畫');
  END IF;
  IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected
    OR v_request.based_on_plan_version_id IS DISTINCT FROM v_expected THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'STALE_PLAN_VERSION',
      'reason', 'STALE_PLAN_VERSION', 'message', '計畫已更新，請重新整理後再確認');
  END IF;

  SELECT * INTO v_src FROM child_proposal_plan_versions
   WHERE id = v_expected AND proposal_id = v_proposal.id
   FOR UPDATE;
  IF v_src.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'STALE_PLAN_VERSION',
      'reason', 'STALE_PLAN_VERSION', 'message', '計畫已更新，請重新整理後再確認');
  END IF;

  IF v_kind = 'preferred_time' THEN
    v_new_time   := NULLIF(btrim(COALESCE(
      v_request.requested_changes ->> 'preferredTime', '')), '');
    v_new_custom := NULLIF(btrim(COALESCE(
      v_request.requested_changes ->> 'preferredTimeCustom', '')), '');
    IF v_new_time NOT IN ('after_dinner', 'before_bed') OR v_new_custom IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'PREFERRED_TIME_INVALID', 'message', '這個調整的時段格式不正確');
    END IF;
    IF v_src.preferred_time IS NOT DISTINCT FROM v_new_time
      AND v_src.preferred_time_custom IS NOT DISTINCT FROM v_new_custom THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'NO_MATERIAL_CHANGE',
        'reason', 'NO_MATERIAL_CHANGE', 'message', '這個時段和目前的安排一樣');
    END IF;
    -- 未變的那一欄一律沿用來源版本，讓下面的 INSERT 兩條路共用一份欄位清單。
    v_new_freq := v_src.cadence_weekly_frequency;
  ELSE
    IF jsonb_typeof(v_request.requested_changes -> 'weeklyFrequency')
        IS DISTINCT FROM 'number' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'WEEKLY_FREQUENCY_INVALID', 'message', '這個調整的次數格式不正確');
    END IF;
    v_new_freq := (v_request.requested_changes ->> 'weeklyFrequency')::numeric;
    IF v_new_freq IS NULL OR v_new_freq < 1 OR v_new_freq > 7 THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'WEEKLY_FREQUENCY_INVALID', 'message', '每週次數要在 1 到 7 之間');
    END IF;
    IF v_src.cadence_weekly_frequency IS NOT DISTINCT FROM v_new_freq THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'NO_MATERIAL_CHANGE',
        'reason', 'NO_MATERIAL_CHANGE', 'message', '這個次數和目前的安排一樣');
    END IF;
    v_new_time   := v_src.preferred_time;
    v_new_custom := v_src.preferred_time_custom;
  END IF;

  SELECT * INTO v_task FROM tasks WHERE id = v_proposal.task_id FOR UPDATE;
  IF v_task.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'SHARED_TASK_MISSING', 'message', '找不到這份計畫的正式任務');
  END IF;

  SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next_no
    FROM child_proposal_plan_versions WHERE proposal_id = v_proposal.id;

  -- 家庭已經談定的一切原樣帶過來，只有這次談的那一欄會動。
  -- authored_by = 'parent' 是因為確認 canonical 共同版本的是家長；
  -- 孩子作為發起人的證據留在 adjustment request 上。
  -- child_accepted_at 保持 NULL —— 補一個時間戳等於宣稱孩子對一份當時
  -- 還不存在的版本按過同意。
  BEGIN
  INSERT INTO child_proposal_plan_versions (
    proposal_id, version_no, authored_by, author_user_id,
    plan_title, plan_summary,
    purpose_category, completion_description, progress_model, next_step,
    cadence_mode, cadence_weekly_frequency, cadence_days,
    preferred_time, preferred_time_custom, estimated_minutes,
    duration_type, duration_days, start_date, end_date,
    reward_policy, reward_eligibility, reward_policy_version, task_policy_version,
    ai_snapshot, ai_model, ai_request_id, ai_suggested_coin_amount,
    adopted_from_plan_version_id,
    requires_child_review, child_accepted_at, parent_confirmed_at, effective_at,
    confirmed_reward_policy, confirmed_coin_amount, confirmed_payout_basis,
    confirmed_claim_period, confirmed_max_claims_per_period,
    confirmed_reward_policy_version, confirmed_task_policy_version,
    confirmed_source_task_id, confirmed_by_user_id, confirmed_at
  ) VALUES (
    v_proposal.id, v_next_no, 'parent', auth.uid(),
    v_src.plan_title, v_src.plan_summary,
    v_src.purpose_category, v_src.completion_description, v_src.progress_model,
    v_src.next_step,
    v_src.cadence_mode, v_new_freq, v_src.cadence_days,
    v_new_time, v_new_custom, v_src.estimated_minutes,
    v_src.duration_type, v_src.duration_days, v_src.start_date, v_src.end_date,
    v_src.reward_policy, v_src.reward_eligibility,
    v_src.reward_policy_version, v_src.task_policy_version,
    v_src.ai_snapshot, v_src.ai_model, NULL, v_src.ai_suggested_coin_amount,
    v_src.id,
    FALSE, NULL, v_now, v_now,
    v_task.reward_policy,
    CASE WHEN v_task.reward_policy = 'coin_eligible'
         THEN v_task.reward_coin_amount END,
    public.child_proposal_payout_basis(v_task.claim_period),
    v_task.claim_period, v_task.max_claims_per_period,
    v_task.reward_policy_version, v_task.task_policy_version,
    v_task.id, auth.uid(), v_now
  ) RETURNING id INTO v_new_id;
EXCEPTION WHEN unique_violation THEN
  -- child_proposal_plan_versions_one_adoption_per_source。兩筆各自談成的調整
  -- 不能都從同一版長出下一版 —— 後到的那一筆本來就是從已經過期的計畫出發。
  RETURN jsonb_build_object(
    'ok', false, 'code', 'STALE_PLAN_VERSION',
    'reason', 'ADJUSTMENT_ALREADY_RESOLVED',
    'message', '這個調整已經由另一個版本成立，請重新整理');
END;

  UPDATE child_proposal_plan_versions
     SET superseded_at = v_now
   WHERE proposal_id = v_proposal.id
     AND id <> v_new_id
     AND superseded_at IS NULL;

  -- 指標先移動。這是下面那個 task UPDATE 之所以合法的原因：guard 驗證的是
  -- 「談定的版本已經存在」，不是「有人好好地問了」。
  UPDATE child_proposals
     SET current_plan_version_id = v_new_id
   WHERE id = v_proposal.id;

  IF v_kind = 'preferred_time' THEN
    UPDATE tasks
       SET preferred_time = v_new_time,
           preferred_time_custom = v_new_custom
     WHERE id = v_task.id;

    -- long_term_goals.preferred_time_window 是孩子端畫面真正讀的那一欄
    -- （buildGoalPresentation）。維持 runtime mirror，不是第二個事實來源。
    UPDATE long_term_goals
       SET preferred_time_window = v_new_time
     WHERE task_id = v_task.id;

    v_event := format('接受孩子提出的時段調整（%s → %s）',
                      v_src.preferred_time, v_new_time);
  ELSE
    -- 孩子端的「本週 N / M 次」讀的是 tasks.weekly_frequency
    -- （buildGoalPresentation 的 weekTarget），所以同步這一欄就夠了。
    UPDATE tasks
       SET weekly_frequency = v_new_freq
     WHERE id = v_task.id;

    v_event := format('接受孩子提出的每週次數調整（%s → %s）',
                      v_src.cadence_weekly_frequency, v_new_freq);
  END IF;

  UPDATE child_proposal_adjustment_requests
     SET status = 'accepted',
         resolved_plan_version_id = v_new_id,
         resolved_at = v_now
   WHERE id = v_request.id;

  INSERT INTO child_proposal_status_events
    (proposal_id, from_status, to_status, actor_role, actor_user_id,
     plan_version_id, reason)
  VALUES
    (v_proposal.id, 'active', 'active', 'parent', auth.uid(), v_new_id, v_event);

  SELECT * INTO v_new FROM child_proposal_plan_versions WHERE id = v_new_id;
  SELECT * INTO v_task FROM tasks WHERE id = v_task.id;
  SELECT * INTO v_proposal FROM child_proposals WHERE id = v_proposal.id;

  -- 收尾驗證：這次談的那一欄真的動了，**而且沒有別的欄位跟著動**。
  IF v_proposal.status <> 'active'
    OR v_proposal.task_id IS DISTINCT FROM v_task.id
    OR v_proposal.current_plan_version_id IS DISTINCT FROM v_new_id
    OR v_new.adopted_from_plan_version_id IS DISTINCT FROM v_src.id
    OR v_new.preferred_time IS DISTINCT FROM v_new_time
    OR v_task.preferred_time IS DISTINCT FROM v_new_time
    OR v_new.cadence_weekly_frequency IS DISTINCT FROM v_new_freq
    OR v_task.weekly_frequency IS DISTINCT FROM v_new_freq THEN
    RAISE EXCEPTION 'shared plan adjustment verification failed'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'adjustmentRequestId', v_request.id,
    'proposalId', v_proposal.id, 'planVersionId', v_new_id,
    'taskId', v_task.id, 'idempotentReplay', false);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object(
    'ok', false, 'code', 'PERSISTENCE_FAILED',
    'reason', 'ADJUSTMENT_TRANSACTION_FAILED',
    'message', '調整沒有完整存下來，請再試一次');
END;
$$;

COMMENT ON FUNCTION public.accept_child_proposal_adjustment_v1(jsonb) IS
  'P0-8M ＋ CHILD-REVIEW-V2：家長接受孩子提出的時段或每週次數調整，'
  'append 下一版共同計畫並同步正式任務。一次只動談的那一欄；'
  '不改期間、回饋，也不動任何既有完成紀錄與錢包。';


-- ── 6. 權限（沿用既有，函式簽章沒變，這裡重申一次） ───────────────────────

REVOKE ALL ON FUNCTION public.create_child_proposal_adjustment_request_v1(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_child_proposal_adjustment_request_v1(jsonb)
  TO authenticated;

REVOKE ALL ON FUNCTION public.accept_child_proposal_adjustment_v1(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_child_proposal_adjustment_v1(jsonb)
  TO authenticated;

COMMIT;
