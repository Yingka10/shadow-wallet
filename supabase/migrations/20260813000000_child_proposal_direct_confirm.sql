-- P0-5A Parent Direct Confirm Vertical Slice
--
-- One database transaction adopts the current AI plan into a parent-authored
-- version, creates the canonical task through the existing task creation
-- contract, activates the proposal, and verifies the shared reward snapshot.

BEGIN;

-- Parent adoption has its own lineage. ai_request_id remains exclusive to the
-- AI request that created the source version and is never copied.
ALTER TABLE child_proposal_plan_versions
  ADD COLUMN IF NOT EXISTS adopted_from_plan_version_id uuid
  REFERENCES child_proposal_plan_versions(id);

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_adoption_parent_only;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_adoption_parent_only CHECK (
    adopted_from_plan_version_id IS NULL
    OR (authored_by = 'parent' AND adopted_from_plan_version_id <> id)
  );

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_one_adoption_per_source;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_one_adoption_per_source
  UNIQUE (adopted_from_plan_version_id);

CREATE OR REPLACE FUNCTION public.child_proposal_adoption_lineage_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.adopted_from_plan_version_id
       IS DISTINCT FROM OLD.adopted_from_plan_version_id THEN
    RAISE EXCEPTION 'adoption lineage is immutable for plan version %', OLD.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS child_proposal_adoption_lineage_immutable
  ON child_proposal_plan_versions;
CREATE TRIGGER child_proposal_adoption_lineage_immutable
  BEFORE UPDATE ON child_proposal_plan_versions
  FOR EACH ROW EXECUTE FUNCTION public.child_proposal_adoption_lineage_guard();

-- P0 only needs one structured progress model and a structured next step.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress_model text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS next_step text;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_progress_model_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_progress_model_check
  CHECK (progress_model IS NULL OR progress_model = 'weekly_rhythm');

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_next_step_not_blank;
ALTER TABLE tasks ADD CONSTRAINT tasks_next_step_not_blank
  CHECK (next_step IS NULL OR btrim(next_step) <> '');

-- child_proposal is a non-preset canonical creation source.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_creation_source_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_creation_source_check
  CHECK (creation_source IN ('preset', 'parent_custom', 'child_proposal', 'legacy'));

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_creation_source_preset_consistency;
ALTER TABLE tasks ADD CONSTRAINT tasks_creation_source_preset_consistency CHECK (
  creation_source = 'legacy'
  OR (creation_source = 'preset' AND created_from_preset)
  OR (creation_source IN ('parent_custom', 'child_proposal') AND NOT created_from_preset)
);

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_creation_source_preset_ids;
ALTER TABLE tasks ADD CONSTRAINT tasks_creation_source_preset_ids CHECK (
  creation_source NOT IN ('parent_custom', 'child_proposal')
  OR (preset_family_id IS NULL AND preset_variant_id IS NULL)
);

ALTER TABLE task_change_events DROP CONSTRAINT IF EXISTS task_change_events_type_check;
ALTER TABLE task_change_events ADD CONSTRAINT task_change_events_type_check CHECK (
  event_type IN (
    'created_from_preset',
    'created_parent_custom',
    'created_from_child_proposal',
    'updated_from_preset',
    'archived'
  )
);

-- Preserve the existing canonical implementation as an internal core. The new
-- public wrapper changes no preset/parent_custom behavior.
ALTER FUNCTION public.create_parent_task_v1(jsonb)
  RENAME TO create_parent_task_core_v1;

REVOKE ALL ON FUNCTION public.create_parent_task_core_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_parent_task_core_v1(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_parent_task_core_v1(jsonb) FROM authenticated;

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

  -- The core already owns all canonical validation, idempotency and inserts.
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

  -- P0-7.1 reads habit + weekly_frequency as a flexible weekly rhythm. This is
  -- deterministic structured mapping, never title parsing.
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
END;
$$;

COMMENT ON FUNCTION public.create_parent_task_v1(jsonb) IS
  'Canonical task creation wrapper. Existing sources use the unchanged core; '
  'child_proposal is normalized to a non-preset task and preserves structured progress.';

REVOKE ALL ON FUNCTION public.create_parent_task_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_parent_task_v1(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_parent_task_v1(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_child_proposal_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal child_proposals%ROWTYPE;
  v_plan child_proposal_plan_versions%ROWTYPE;
  v_parent_plan child_proposal_plan_versions%ROWTYPE;
  v_verified child_proposals%ROWTYPE;
  v_expected_plan_id uuid;
  v_parent_plan_id uuid;
  v_task_id uuid;
  v_start_date date;
  v_end_date date;
  v_now timestamptz := now();
  v_decision jsonb;
  v_task_command jsonb;
  v_create_result jsonb;
  v_transition_result jsonb;
  v_failure_text text;
  v_related jsonb;
  v_next_version int;
  v_purpose text;
  v_completion_policy text;
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本'
    );
  END IF;

  v_expected_plan_id := NULLIF(p_command ->> 'expectedPlanVersionId', '')::uuid;
  IF NULLIF(p_command ->> 'proposalId', '') IS NULL OR v_expected_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId 或 expectedPlanVersionId'
    );
  END IF;

  -- This block is a PL/pgSQL subtransaction. Converting an inner {ok:false}
  -- into P0001 rolls back every write in the block before returning its JSON.
  BEGIN
    SELECT * INTO v_proposal
      FROM child_proposals
     WHERE id = (p_command ->> 'proposalId')::uuid
     FOR UPDATE;

    IF v_proposal.id IS NULL THEN
      RAISE EXCEPTION 'Not authorized: proposal is not visible to the caller'
        USING ERRCODE = '42501';
    END IF;
    PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

    -- Network retry / double click after commit: the lineage is the proof that
    -- this is the same confirmation, not an arbitrary active proposal.
    IF v_proposal.status = 'active' THEN
      SELECT * INTO v_parent_plan
        FROM child_proposal_plan_versions
       WHERE id = v_proposal.current_plan_version_id
         AND proposal_id = v_proposal.id
         AND authored_by = 'parent'
         AND adopted_from_plan_version_id = v_expected_plan_id;

      IF v_parent_plan.id IS NULL OR v_proposal.task_id IS NULL
        OR v_parent_plan.confirmed_source_task_id IS DISTINCT FROM v_proposal.task_id THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'STALE_PLAN_VERSION',
          'reason', 'STALE_PLAN_VERSION', 'message', '這份提案已由另一個版本確認'
        );
      END IF;

      SELECT COALESCE(jsonb_agg(rows.id ORDER BY rows.kind, rows.id), '[]'::jsonb)
        INTO v_related
        FROM (
          SELECT ct.id, 1 AS kind FROM child_tasks ct WHERE ct.task_id = v_proposal.task_id
          UNION ALL
          SELECT g.id, 2 AS kind FROM long_term_goals g WHERE g.task_id = v_proposal.task_id
          UNION ALL
          SELECT e.id, 3 AS kind FROM task_change_events e
           WHERE e.task_id = v_proposal.task_id
             AND e.event_type = 'created_from_child_proposal'
        ) AS rows;

      RETURN jsonb_build_object(
        'ok', true,
        'proposalId', v_proposal.id,
        'planVersionId', v_parent_plan.id,
        'taskId', v_proposal.task_id,
        'relatedIds', v_related,
        'confirmedReward', jsonb_build_object(
          'rewardPolicy', v_parent_plan.confirmed_reward_policy,
          'coinAmount', v_parent_plan.confirmed_coin_amount,
          'payoutBasis', v_parent_plan.confirmed_payout_basis,
          'claimPeriod', v_parent_plan.confirmed_claim_period,
          'maxClaimsPerPeriod', v_parent_plan.confirmed_max_claims_per_period,
          'rewardPolicyVersion', v_parent_plan.confirmed_reward_policy_version,
          'taskPolicyVersion', v_parent_plan.confirmed_task_policy_version,
          'sourceTaskId', v_parent_plan.confirmed_source_task_id
        ),
        'idempotentReplay', true
      );
    END IF;

    IF v_proposal.status <> 'proposed' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'PROPOSAL_NOT_PROPOSED', 'message', '只有待一起確認的提案可以建立共同計畫'
      );
    END IF;

    IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'STALE_PLAN_VERSION',
        'reason', 'STALE_PLAN_VERSION', 'message', 'GrowBook 計畫已更新，請重新整理後再確認'
      );
    END IF;

    SELECT * INTO v_plan
      FROM child_proposal_plan_versions
     WHERE id = v_expected_plan_id AND proposal_id = v_proposal.id;

    IF v_plan.id IS NULL OR v_plan.authored_by <> 'ai' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'PLAN_NOT_CONFIRMABLE', 'message', '目前版本不是可採用的 GrowBook 計畫'
      );
    END IF;

    IF COALESCE(btrim(v_plan.plan_title), '') = ''
      OR v_plan.purpose_category IS NULL
      OR COALESCE(btrim(v_plan.completion_description), '') = ''
      OR COALESCE(btrim(v_plan.next_step), '') = ''
      OR v_plan.duration_type IS NULL
      OR (v_plan.duration_type = 'long_term'
          AND (v_plan.duration_days IS NULL OR v_plan.duration_days <= 0))
      OR v_plan.cadence_mode IS NULL
      OR v_plan.estimated_minutes IS NULL OR v_plan.estimated_minutes <= 0
      OR v_plan.reward_policy IS NULL
      OR v_plan.reward_eligibility <> 'allowed'
      OR COALESCE(btrim(v_plan.reward_policy_version), '') = ''
      OR COALESCE(btrim(v_plan.task_policy_version), '') = '' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'PLAN_NOT_CONFIRMABLE', 'message', 'GrowBook 計畫缺少正式任務需要的結構化資料'
      );
    END IF;

    IF v_plan.cadence_mode = 'weekly_frequency' AND (
      v_plan.progress_model IS DISTINCT FROM 'weekly_rhythm'
      OR v_plan.cadence_weekly_frequency IS NULL
      OR v_plan.cadence_weekly_frequency NOT BETWEEN 1 AND 7
      OR v_plan.cadence_days IS NOT NULL
    ) THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'WEEKLY_RHYTHM_INVALID', 'message', '彈性每週節奏資料不完整'
      );
    END IF;

    IF v_plan.cadence_mode NOT IN ('weekly_frequency', 'fixed_days', 'one_time') THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'PLAN_NOT_CONFIRMABLE', 'message', '目前排程模式尚不能直接確認'
      );
    END IF;

    v_decision := p_command -> 'rewardDecision';
    IF v_decision IS NULL
      OR v_decision ->> 'eligibility' IS DISTINCT FROM 'allowed'
      OR v_decision ->> 'rewardPolicy' IS DISTINCT FROM v_plan.reward_policy
      OR v_decision ->> 'rewardPolicyVersion' IS DISTINCT FROM v_plan.reward_policy_version THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED',
        'reason', 'POLICY_CHANGED', 'message', '回饋政策已更新，請重新整理後再確認'
      );
    END IF;

    IF v_plan.purpose_category = 'B' AND v_plan.reward_policy = 'coin_eligible' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED',
        'reason', 'POLICY_CHANGED', 'message', '家庭參與目前不能建立成成長幣任務'
      );
    END IF;

    IF v_plan.reward_policy = 'coin_eligible' THEN
      IF v_plan.ai_suggested_coin_amount IS NULL
        OR NULLIF(v_decision -> 'coin' ->> 'suggestedAmount', '')::int
             IS DISTINCT FROM v_plan.ai_suggested_coin_amount
        OR NULLIF(v_decision -> 'coin' ->> 'finalAmount', '')::int
             IS DISTINCT FROM v_plan.ai_suggested_coin_amount THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'POLICY_CHANGED',
          'reason', 'POLICY_CHANGED', 'message', '顯示的成長幣建議已不是目前政策結果'
        );
      END IF;
    ELSIF v_plan.ai_suggested_coin_amount IS NOT NULL
      OR v_decision -> 'coin' IS DISTINCT FROM 'null'::jsonb THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED',
        'reason', 'POLICY_CHANGED', 'message', '不發幣的計畫帶有不一致幣值'
      );
    END IF;

    v_start_date := timezone('Asia/Taipei', now())::date;
    v_end_date := CASE
      WHEN v_plan.duration_days IS NOT NULL
        THEN v_start_date + (v_plan.duration_days - 1)
      ELSE NULL
    END;
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next_version
      FROM child_proposal_plan_versions WHERE proposal_id = v_proposal.id;

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
      requires_child_review, parent_confirmed_at, effective_at
    ) VALUES (
      v_proposal.id, v_next_version, 'parent', auth.uid(),
      v_plan.plan_title, v_plan.plan_summary,
      v_plan.purpose_category, v_plan.completion_description,
      v_plan.progress_model, v_plan.next_step,
      v_plan.cadence_mode, v_plan.cadence_weekly_frequency, v_plan.cadence_days,
      v_plan.preferred_time, v_plan.preferred_time_custom, v_plan.estimated_minutes,
      v_plan.duration_type, v_plan.duration_days, v_start_date, v_end_date,
      v_plan.reward_policy, v_plan.reward_eligibility,
      v_plan.reward_policy_version, v_plan.task_policy_version,
      v_plan.ai_snapshot, v_plan.ai_model,
      NULL, v_plan.ai_suggested_coin_amount,
      v_expected_plan_id,
      false, v_now, v_now
    ) RETURNING id INTO v_parent_plan_id;

    UPDATE child_proposal_plan_versions
       SET superseded_at = v_now
     WHERE proposal_id = v_proposal.id AND id <> v_parent_plan_id
       AND superseded_at IS NULL;
    UPDATE child_proposals
       SET current_plan_version_id = v_parent_plan_id
     WHERE id = v_proposal.id;

    v_purpose := CASE v_plan.purpose_category
      WHEN 'A' THEN 'life_routine'
      WHEN 'B' THEN 'family_participation'
      WHEN 'C' THEN 'autonomous_challenge'
      WHEN 'D' THEN 'learning_skill'
    END;
    v_completion_policy := CASE v_plan.duration_type
      WHEN 'one_time' THEN 'complete_once'
      WHEN 'long_term' THEN 'review_and_continue'
      ELSE 'ongoing'
    END;

    v_task_command := jsonb_strip_nulls(jsonb_build_object(
      'schemaVersion', 1,
      'creationSource', 'child_proposal',
      'childId', v_proposal.child_id,
      'familyId', v_proposal.family_id,
      'rewardSupport', jsonb_build_object('intent', 'default'),
      'progressModel', v_plan.progress_model,
      'nextStep', v_plan.next_step,
      'task', jsonb_strip_nulls(jsonb_build_object(
        'title', v_plan.plan_title,
        'purposeCategory', v_purpose,
        'durationType', v_plan.duration_type,
        'planMode', CASE WHEN v_plan.duration_type = 'long_term' THEN 'growth_plan' END,
        'source', v_proposal.proposal_source,
        'rewardPolicy', v_plan.reward_policy,
        'completionPolicy', v_completion_policy,
        'originalExpectation', v_proposal.child_original_goal,
        'completionDescription', v_plan.completion_description
      )),
      'schedule', jsonb_strip_nulls(jsonb_build_object(
        'mode', v_plan.cadence_mode,
        'startDate', v_start_date,
        'scheduledDate', CASE WHEN v_plan.cadence_mode = 'one_time' THEN v_start_date END,
        'endDate', v_end_date,
        'durationDays', v_plan.duration_days,
        'weeklyFrequency', v_plan.cadence_weekly_frequency,
        'recurrenceDays', to_jsonb(v_plan.cadence_days),
        'preferredTime', COALESCE(v_plan.preferred_time, 'when_needed'),
        'preferredTimeCustom', v_plan.preferred_time_custom,
        'estimatedMinutes', v_plan.estimated_minutes,
        'reminderMode', 'none'
      )),
      'content', jsonb_build_object(
        'selectedOptions', '{}'::jsonb, 'customOptionValues', '{}'::jsonb
      ),
      'review', CASE WHEN v_plan.duration_type = 'long_term' THEN jsonb_build_object(
        'reviewEnabled', true, 'firstReviewAfterDays', 0, 'weekendReviewEnabled', false
      ) END,
      'plan', CASE WHEN v_plan.duration_type = 'long_term' THEN jsonb_build_object(
        'durationDays', v_plan.duration_days,
        'milestones', '[]'::jsonb,
        'supportSteps', '[]'::jsonb,
        'focusOptionIds', '[]'::jsonb
      ) END,
      'metadata', jsonb_build_object(
        'ageGroup', (SELECT c.age_group FROM children c WHERE c.id = v_proposal.child_id),
        'createdFromPreset', false,
        'taskPolicyVersion', v_plan.task_policy_version,
        'editorKind', CASE WHEN v_plan.duration_type = 'long_term' THEN 'growth_plan'
                           WHEN v_plan.duration_type = 'one_time' THEN 'one_time'
                           ELSE 'recurring' END,
        'clientRequestId', v_proposal.id
      ),
      'reward', jsonb_build_object('decision', v_decision)
    ));

    v_create_result := public.create_parent_task_v1(v_task_command);
    IF COALESCE((v_create_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'canonical task creation failed', DETAIL = v_create_result::text;
    END IF;
    v_task_id := NULLIF(v_create_result ->> 'taskId', '')::uuid;

    v_transition_result := public.transition_child_proposal_v1(jsonb_build_object(
      'schemaVersion', 1,
      'proposalId', v_proposal.id,
      'toStatus', 'active',
      'actorRole', 'parent',
      'taskId', v_task_id
    ));
    IF COALESCE((v_transition_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'proposal activation failed', DETAIL = v_transition_result::text;
    END IF;

    SELECT * INTO v_verified FROM child_proposals WHERE id = v_proposal.id;
    SELECT * INTO v_parent_plan
      FROM child_proposal_plan_versions WHERE id = v_parent_plan_id;
    IF v_verified.status <> 'active'
      OR v_verified.task_id IS DISTINCT FROM v_task_id
      OR v_verified.current_plan_version_id IS DISTINCT FROM v_parent_plan_id
      OR v_verified.activated_at IS NULL
      OR v_parent_plan.confirmed_source_task_id IS DISTINCT FROM v_task_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'confirmation verification failed',
        DETAIL = jsonb_build_object(
          'ok', false, 'code', 'PERSISTENCE_FAILED',
          'reason', 'CONFIRMATION_VERIFICATION_FAILED',
          'message', '共同計畫建立後驗證失敗'
        )::text;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'proposalId', v_proposal.id,
      'planVersionId', v_parent_plan_id,
      'taskId', v_task_id,
      'relatedIds', COALESCE(v_create_result -> 'relatedIds', '[]'::jsonb),
      'confirmedReward', v_transition_result -> 'confirmedReward',
      'idempotentReplay', COALESCE((v_create_result ->> 'idempotentReplay')::boolean, false)
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_failure_text = PG_EXCEPTION_DETAIL;
    RETURN v_failure_text::jsonb;
  END;
END;
$$;

COMMENT ON FUNCTION public.confirm_child_proposal_v1(jsonb) IS
  'Atomically adopts the exact current AI plan, creates one canonical task, '
  'activates the proposal and verifies the shared reward snapshot. No wallet side effects.';

REVOKE ALL ON FUNCTION public.confirm_child_proposal_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_child_proposal_v1(jsonb) TO authenticated;

COMMIT;
