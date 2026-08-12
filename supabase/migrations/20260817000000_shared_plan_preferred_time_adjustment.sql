-- P0-8M: the one renegotiation an active Shared Plan may go through —
-- the child asks to move the reading window, the parent confirms, and GrowBook
-- appends the next shared version.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Why the authorization is state-backed rather than a bypass flag
--
-- P0-8G froze active Shared Plans: tasks_active_shared_plan_guard rejects every
-- material change while an active proposal points at the task. P0-8M needs one
-- narrow hole, and the dangerous way to cut it would be a flag — a GUC, a
-- service_role escape, a boolean in the command — because then "may I mutate the
-- shared plan?" is answered by whoever sets the flag.
--
-- Instead the guard asks the database a question it can verify on its own:
--
--     is the task's current shared version a freshly confirmed parent version
--     that is identical to its own parent except for the preferred time, and
--     does it already say exactly what this UPDATE is trying to write?
--
-- Only the official RPCs can produce that state. Every child_proposal table is
-- SELECT-only for `authenticated` (no INSERT/UPDATE/DELETE policy exists), so a
-- client cannot append a plan version or move current_plan_version_id to forge
-- the precondition. The authorization therefore comes from "the family already
-- has a new agreed version on record", not from "some function claims it may".
--
-- Scope: preferred_time / preferred_time_custom only. Cadence, duration, reward,
-- completion description, pause and stop stay frozen — those need the full
-- renegotiation flow, not this one.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ═══ 1. Adjustment request becomes a real workflow row ═══════════════════════

ALTER TABLE child_proposal_adjustment_requests
  DROP CONSTRAINT IF EXISTS child_proposal_adjustment_requests_kind_check;
ALTER TABLE child_proposal_adjustment_requests
  ADD CONSTRAINT child_proposal_adjustment_requests_kind_check
  CHECK (adjustment_kind IN (
    'preferred_time', 'cadence', 'scope', 'support', 'reward', 'pause', 'stop', 'other'));

-- Network retries are not "a request that happens to look the same". The client
-- names the attempt, and the same name is the same attempt.
ALTER TABLE child_proposal_adjustment_requests
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS child_proposal_adjustment_requests_client_request_idx
  ON child_proposal_adjustment_requests (proposal_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- One open time request per shared version. Three taps must not become three
-- cards on the parent's home screen.
CREATE UNIQUE INDEX IF NOT EXISTS child_proposal_adjustment_requests_one_open_time_idx
  ON child_proposal_adjustment_requests (proposal_id, based_on_plan_version_id)
  WHERE status = 'open' AND adjustment_kind = 'preferred_time';

COMMENT ON COLUMN child_proposal_adjustment_requests.client_request_id IS
  'P0-8M：同一次送出的識別碼。重送同一個 id 回原本那筆，不新增。';


-- ═══ 2. The authorization predicate the guard can verify by itself ═══════════

CREATE OR REPLACE FUNCTION public.is_authorized_preferred_time_renegotiation_v1(
  p_task_id uuid,
  p_old_time text,
  p_old_custom text,
  p_new_time text,
  p_new_custom text
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
      -- The new current version is a confirmed, effective parent version that
      -- needs no further child review, and it is bound to this exact task.
      AND cur.authored_by = 'parent'
      AND cur.requires_child_review = false
      AND cur.parent_confirmed_at IS NOT NULL
      AND cur.effective_at IS NOT NULL
      AND cur.confirmed_source_task_id = p_task_id
      -- It already records exactly what this UPDATE wants to write, and the row
      -- it is replacing still holds exactly what is being replaced.
      AND cur.preferred_time IS NOT DISTINCT FROM p_new_time
      AND cur.preferred_time_custom IS NOT DISTINCT FROM p_new_custom
      AND src.preferred_time IS NOT DISTINCT FROM p_old_time
      AND src.preferred_time_custom IS NOT DISTINCT FROM p_old_custom
      -- And it differs from its own parent in nothing else. This is what keeps
      -- the hole the size of one field: a version that also moved the cadence
      -- cannot authorize anything at all.
      AND cur.plan_title              IS NOT DISTINCT FROM src.plan_title
      AND cur.plan_summary            IS NOT DISTINCT FROM src.plan_summary
      AND cur.purpose_category        IS NOT DISTINCT FROM src.purpose_category
      AND cur.completion_description  IS NOT DISTINCT FROM src.completion_description
      AND cur.progress_model          IS NOT DISTINCT FROM src.progress_model
      AND cur.next_step               IS NOT DISTINCT FROM src.next_step
      AND cur.cadence_mode            IS NOT DISTINCT FROM src.cadence_mode
      AND cur.cadence_weekly_frequency IS NOT DISTINCT FROM src.cadence_weekly_frequency
      AND cur.cadence_days            IS NOT DISTINCT FROM src.cadence_days
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

REVOKE ALL ON FUNCTION public.is_authorized_preferred_time_renegotiation_v1(
  uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_authorized_preferred_time_renegotiation_v1(
  uuid, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.is_authorized_preferred_time_renegotiation_v1(
  uuid, text, text, text, text) IS
  'P0-8M：唯一允許動 active Shared Plan 的條件 —— 家庭已經有一份「只差時段」的'
  '正式新共同版本，而且它記的正是這次要寫的值。授權來自 DB 狀態，不是旗標。';


-- ═══ 3. P0-8G guard keeps everything frozen except that one field ════════════

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

  -- Everything P0-8G froze stays frozen. preferred_time / preferred_time_custom
  -- are deliberately absent from this list and handled separately below.
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
    OR NEW.weekly_frequency             IS DISTINCT FROM OLD.weekly_frequency
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

  -- Note what is *not* being asked here: no flag, no caller identity, no role.
  -- Having an open adjustment request is not enough either — the family must
  -- already have the agreed next version on record.
  IF v_time_changed
    AND NOT public.is_authorized_preferred_time_renegotiation_v1(
      v_task_id, OLD.preferred_time, OLD.preferred_time_custom,
      NEW.preferred_time, NEW.preferred_time_custom) THEN
    RAISE EXCEPTION 'SHARED_PLAN_REQUIRES_RENEGOTIATION'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


-- ═══ 4. Creating the request ═════════════════════════════════════════════════

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

  -- P0-8M only opens the preferred-time lane. Everything else still has no
  -- workflow behind it, so accepting it here would create a request nobody can
  -- ever resolve.
  IF v_kind <> 'preferred_time' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'reason', 'ADJUSTMENT_KIND_NOT_SUPPORTED',
      'message', '目前只能一起調整時段');
  END IF;

  IF jsonb_typeof(v_changes) IS DISTINCT FROM 'object'
    OR EXISTS (
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

  -- The two reading windows the child screen and long_term_goals both speak.
  IF v_new_time NOT IN ('after_dinner', 'before_bed') OR v_new_custom IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'reason', 'PREFERRED_TIME_INVALID',
      'message', '目前只能選晚餐後或睡覺前');
  END IF;

  SELECT * INTO v_proposal FROM child_proposals
   WHERE id = (p_command ->> 'proposalId')::uuid
   FOR UPDATE;
  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: proposal is not visible to the caller'
      USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

  -- Same clientRequestId is the same attempt. Decided before any state guard so
  -- a retry after a committed success still returns the original request.
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

  IF v_plan.preferred_time IS NOT DISTINCT FROM v_new_time
    AND v_plan.preferred_time_custom IS NOT DISTINCT FROM v_new_custom THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'NO_MATERIAL_CHANGE',
      'reason', 'NO_MATERIAL_CHANGE', 'message', '這個時段和目前的安排一樣');
  END IF;

  -- One open time request per shared version. Returning the existing one is
  -- friendlier than an error and keeps the parent's home screen to one card.
  SELECT * INTO v_existing FROM child_proposal_adjustment_requests
   WHERE proposal_id = v_proposal.id
     AND based_on_plan_version_id = v_expected
     AND adjustment_kind = 'preferred_time'
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
    v_expected, 'preferred_time', v_reason,
    jsonb_build_object('preferredTime', v_new_time, 'preferredTimeCustom', v_new_custom),
    v_client_id
  ) RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'ok', true, 'adjustmentRequestId', v_request_id,
    'status', 'open', 'idempotentReplay', false);
END;
$$;

COMMENT ON FUNCTION public.create_child_proposal_adjustment_request_v1(jsonb) IS
  'P0-8M：孩子對進行中的共同計畫提出換時段。只建立 open 請求，不改計畫也不改任務。';


-- ═══ 5. Parent accepts — one transaction, one new shared version ═════════════

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
  v_new_time  text;
  v_new_custom text;
  v_next_no   int;
  v_new_id    uuid;
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

  -- Retry after a committed accept. The resolved version on the request is the
  -- proof, so a replay returns the original result instead of appending a
  -- second version.
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
  IF v_request.adjustment_kind <> 'preferred_time' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'reason', 'ADJUSTMENT_KIND_NOT_SUPPORTED', 'message', '目前只能一起調整時段');
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

  SELECT * INTO v_task FROM tasks WHERE id = v_proposal.task_id FOR UPDATE;
  IF v_task.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'SHARED_TASK_MISSING', 'message', '找不到這份計畫的正式任務');
  END IF;

  SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next_no
    FROM child_proposal_plan_versions WHERE proposal_id = v_proposal.id;

  -- Everything the family already agreed on carries over untouched. Only the
  -- time moves. authored_by is 'parent' because the parent is who confirms a
  -- canonical shared plan — the child stays recorded as the initiator on the
  -- adjustment request itself.
  --
  -- requires_child_review = false: the child proposed this exact structured
  -- change and the parent accepted it unmodified, so asking the child to accept
  -- their own words again would be theatre.
  --
  -- child_accepted_at stays NULL. The honest evidence that the child agreed is
  -- the adjustment request; back-filling a timestamp here would claim the child
  -- pressed accept on a version that did not exist when they asked.
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
    v_src.cadence_mode, v_src.cadence_weekly_frequency, v_src.cadence_days,
    v_new_time, v_new_custom, v_src.estimated_minutes,
    v_src.duration_type, v_src.duration_days, v_src.start_date, v_src.end_date,
    v_src.reward_policy, v_src.reward_eligibility,
    v_src.reward_policy_version, v_src.task_policy_version,
    v_src.ai_snapshot, v_src.ai_model, NULL, v_src.ai_suggested_coin_amount,
    v_src.id,
    FALSE, NULL, v_now, v_now,
    -- Reward is untouched by this package, but a shared version without its own
    -- reconcilable evidence is a version nobody can audit. Rebuilt from tasks,
    -- the same authority transition_child_proposal_v1 copies from.
    v_task.reward_policy,
    CASE WHEN v_task.reward_policy = 'coin_eligible'
         THEN v_task.reward_coin_amount END,
    public.child_proposal_payout_basis(v_task.claim_period),
    v_task.claim_period, v_task.max_claims_per_period,
    v_task.reward_policy_version, v_task.task_policy_version,
    v_task.id, auth.uid(), v_now
  ) RETURNING id INTO v_new_id;
EXCEPTION WHEN unique_violation THEN
  -- child_proposal_plan_versions_one_adoption_per_source. Two accepts that got
  -- past the row lock in different transactions cannot both append a child of
  -- the same version — and that is exactly right: one of them is working from a
  -- plan that has already moved on.
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

  -- The pointer moves first. That is what makes the task UPDATE below legal:
  -- the guard verifies the agreed version already exists, not that some caller
  -- asked nicely.
  UPDATE child_proposals
     SET current_plan_version_id = v_new_id
   WHERE id = v_proposal.id;

  UPDATE tasks
     SET preferred_time = v_new_time,
         preferred_time_custom = v_new_custom
   WHERE id = v_task.id;

  -- long_term_goals.preferred_time_window is what the child's reading plan
  -- screen actually displays (LongTermGoalDetailView reads it through
  -- buildGoalPresentation). Its CHECK allows exactly the two windows this
  -- package supports, so keeping it in step is maintaining the runtime mirror,
  -- not inventing a second source of truth.
  UPDATE long_term_goals
     SET preferred_time_window = v_new_time
   WHERE task_id = v_task.id;

  UPDATE child_proposal_adjustment_requests
     SET status = 'accepted',
         resolved_plan_version_id = v_new_id,
         resolved_at = v_now
   WHERE id = v_request.id;

  INSERT INTO child_proposal_status_events
    (proposal_id, from_status, to_status, actor_role, actor_user_id,
     plan_version_id, reason)
  VALUES
    (v_proposal.id, 'active', 'active', 'parent', auth.uid(), v_new_id,
     format('接受孩子提出的時段調整（%s → %s）', v_src.preferred_time, v_new_time));

  SELECT * INTO v_new FROM child_proposal_plan_versions WHERE id = v_new_id;
  SELECT * INTO v_task FROM tasks WHERE id = v_task.id;
  SELECT * INTO v_proposal FROM child_proposals WHERE id = v_proposal.id;
  IF v_proposal.status <> 'active'
    OR v_proposal.task_id IS DISTINCT FROM v_task.id
    OR v_proposal.current_plan_version_id IS DISTINCT FROM v_new_id
    OR v_new.adopted_from_plan_version_id IS DISTINCT FROM v_src.id
    OR v_new.preferred_time IS DISTINCT FROM v_new_time
    OR v_task.preferred_time IS DISTINCT FROM v_new_time
    OR v_new.cadence_weekly_frequency IS DISTINCT FROM v_src.cadence_weekly_frequency
    OR v_task.weekly_frequency IS DISTINCT FROM v_src.cadence_weekly_frequency THEN
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
  'P0-8M：家長接受孩子提出的時段調整，append 下一版共同計畫並同步正式任務。'
  '不改頻率、期間、回饋，也不動任何既有完成紀錄與錢包。';


-- ═══ 6. Parent declines ══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.decline_child_proposal_adjustment_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request  child_proposal_adjustment_requests%ROWTYPE;
  v_proposal child_proposals%ROWTYPE;
  v_note     text;
  v_now      timestamptz := now();
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本');
  END IF;
  IF NULLIF(p_command ->> 'adjustmentRequestId', '') IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少 adjustmentRequestId');
  END IF;
  v_note := NULLIF(btrim(COALESCE(p_command ->> 'resolutionNote', '')), '');

  SELECT * INTO v_request FROM child_proposal_adjustment_requests
   WHERE id = (p_command ->> 'adjustmentRequestId')::uuid
   FOR UPDATE;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: adjustment request is not visible to the caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_proposal FROM child_proposals WHERE id = v_request.proposal_id;
  PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

  IF v_request.status = 'declined' THEN
    RETURN jsonb_build_object(
      'ok', true, 'adjustmentRequestId', v_request.id,
      'status', 'declined', 'idempotentReplay', true);
  END IF;
  IF v_request.status <> 'open' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'ADJUSTMENT_NOT_OPEN', 'message', '這個調整已經處理過了');
  END IF;

  -- Declining changes nothing but the request: no version, no task, no wallet.
  UPDATE child_proposal_adjustment_requests
     SET status = 'declined', resolved_at = v_now, resolution_note = v_note
   WHERE id = v_request.id;

  RETURN jsonb_build_object(
    'ok', true, 'adjustmentRequestId', v_request.id,
    'status', 'declined', 'idempotentReplay', false);
END;
$$;

COMMENT ON FUNCTION public.decline_child_proposal_adjustment_v1(jsonb) IS
  'P0-8M：家長先維持原本的安排。只結案請求，不建立版本、不改任務、不動錢包。';


REVOKE ALL ON FUNCTION public.accept_child_proposal_adjustment_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_child_proposal_adjustment_v1(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.decline_child_proposal_adjustment_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_child_proposal_adjustment_v1(jsonb) TO authenticated;

COMMIT;
