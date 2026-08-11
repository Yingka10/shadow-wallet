-- P0-8G: active Shared Plans may only change through a future renegotiation flow.
-- The active Proposal link is authoritative; task provenance alone is not.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_active_shared_plan_task_v1(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM child_proposals cp
    WHERE cp.task_id = p_task_id
      AND cp.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_shared_plan_task_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_shared_plan_task_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_active_shared_plan_task_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  v_material_changed boolean := false;
BEGIN
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
    OR NEW.preferred_time               IS DISTINCT FROM OLD.preferred_time
    OR NEW.preferred_time_custom        IS DISTINCT FROM OLD.preferred_time_custom
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_active_shared_plan_guard ON tasks;
CREATE TRIGGER tasks_active_shared_plan_guard
  BEFORE UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_shared_plan_task_v1();

CREATE OR REPLACE FUNCTION public.guard_active_shared_plan_goal_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.task_id ELSE NEW.task_id END;
BEGIN
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

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'SHARED_PLAN_REQUIRES_RENEGOTIATION'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS long_term_goals_active_shared_plan_guard ON long_term_goals;
CREATE TRIGGER long_term_goals_active_shared_plan_guard
  BEFORE UPDATE OR DELETE ON long_term_goals
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_shared_plan_goal_v1();

CREATE OR REPLACE FUNCTION public.guard_active_shared_plan_assignment_delete_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_active_shared_plan_task_v1(OLD.task_id) THEN
    RAISE EXCEPTION 'SHARED_PLAN_REQUIRES_RENEGOTIATION'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS child_tasks_active_shared_plan_delete_guard ON child_tasks;
CREATE TRIGGER child_tasks_active_shared_plan_delete_guard
  BEFORE DELETE ON child_tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_shared_plan_assignment_delete_v1();

ALTER TABLE child_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS child_tasks_shared_plan_update_guard ON child_tasks;
CREATE POLICY child_tasks_shared_plan_update_guard
  ON child_tasks
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (
    is_active = true
    OR NOT public.is_active_shared_plan_task_v1(task_id)
  );

DROP POLICY IF EXISTS child_tasks_shared_plan_delete_guard ON child_tasks;
CREATE POLICY child_tasks_shared_plan_delete_guard
  ON child_tasks
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (NOT public.is_active_shared_plan_task_v1(task_id));

CREATE OR REPLACE FUNCTION public.update_task_schedule(
  p_task_id uuid,
  p_claim_period text,
  p_max_claims_per_period integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id uuid;
  v_task_name text;
  v_old_period text;
  v_old_max int;
  v_parent_id uuid;
  v_child_id uuid;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM tasks t
      JOIN parents p ON p.family_id = t.family_id
      WHERE t.id = p_task_id
        AND p.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Not authorized: caller is not a parent of task %''s family', p_task_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_claim_period NOT IN ('day', 'week', 'once') THEN
    RETURN jsonb_build_object('error', 'invalid_claim_period');
  END IF;
  IF p_max_claims_per_period IS NULL OR p_max_claims_per_period <= 0 THEN
    RETURN jsonb_build_object('error', 'invalid_max_claims');
  END IF;

  SELECT claim_period, max_claims_per_period, family_id, name
  INTO v_old_period, v_old_max, v_family_id, v_task_name
  FROM tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  IF public.is_active_shared_plan_task_v1(p_task_id) THEN
    RETURN jsonb_build_object('error', 'SHARED_PLAN_REQUIRES_RENEGOTIATION');
  END IF;

  UPDATE tasks
  SET claim_period = p_claim_period,
      max_claims_per_period = p_max_claims_per_period
  WHERE id = p_task_id;

  SELECT id INTO v_parent_id FROM parents WHERE user_id = auth.uid() LIMIT 1;
  SELECT child_id INTO v_child_id
  FROM child_tasks
  WHERE task_id = p_task_id
    AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_child_id IS NOT NULL THEN
    INSERT INTO intervention_log
      (family_id, child_id, parent_id, task_id, task_name_snapshot,
       event_type, trigger_source, parent_decision)
    VALUES (
      v_family_id, v_child_id, v_parent_id, p_task_id, v_task_name,
      'task_schedule_adjusted', 'parent_manual',
      jsonb_build_object(
        'old_claim_period', v_old_period,
        'new_claim_period', p_claim_period,
        'old_max_claims_per_period', v_old_max,
        'new_max_claims_per_period', p_max_claims_per_period
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'taskId', p_task_id,
    'claimPeriod', p_claim_period,
    'maxClaimsPerPeriod', p_max_claims_per_period
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_task_recurrence_days(
  p_task_id uuid,
  p_recurrence_days integer[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id uuid;
  v_task_name text;
  v_day_type text;
  v_old_days integer[];
  v_parent_id uuid;
  v_child_id uuid;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM tasks t
      JOIN parents p ON p.family_id = t.family_id
      WHERE t.id = p_task_id
        AND p.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Not authorized: caller is not a parent of task %''s family', p_task_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_recurrence_days IS NULL OR array_length(p_recurrence_days, 1) IS NULL THEN
    RETURN jsonb_build_object('error', 'empty_days');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_recurrence_days) d WHERE d < 0 OR d > 6) THEN
    RETURN jsonb_build_object('error', 'invalid_day_value');
  END IF;
  IF array_length(p_recurrence_days, 1)
    <> array_length(ARRAY(SELECT DISTINCT unnest(p_recurrence_days)), 1) THEN
    RETURN jsonb_build_object('error', 'duplicate_day_value');
  END IF;

  SELECT family_id, name, day_type, recurrence_days
  INTO v_family_id, v_task_name, v_day_type, v_old_days
  FROM tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  IF public.is_active_shared_plan_task_v1(p_task_id) THEN
    RETURN jsonb_build_object('error', 'SHARED_PLAN_REQUIRES_RENEGOTIATION');
  END IF;

  IF v_day_type <> 'custom' THEN
    RETURN jsonb_build_object('error', 'not_fixed_days_task');
  END IF;

  UPDATE tasks
  SET recurrence_days = p_recurrence_days
  WHERE id = p_task_id;

  SELECT id INTO v_parent_id FROM parents WHERE user_id = auth.uid() LIMIT 1;
  SELECT child_id INTO v_child_id
  FROM child_tasks
  WHERE task_id = p_task_id
    AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_child_id IS NOT NULL THEN
    INSERT INTO intervention_log
      (family_id, child_id, parent_id, task_id, task_name_snapshot,
       event_type, trigger_source, parent_decision)
    VALUES (
      v_family_id, v_child_id, v_parent_id, p_task_id, v_task_name,
      'task_recurrence_updated', 'parent_manual',
      jsonb_build_object(
        'old_recurrence_days', v_old_days,
        'new_recurrence_days', p_recurrence_days
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'taskId', p_task_id,
    'recurrenceDays', p_recurrence_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_task_schedule(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_task_schedule(uuid, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.update_task_recurrence_days(uuid, integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_task_recurrence_days(uuid, integer[]) TO authenticated;

COMMIT;
