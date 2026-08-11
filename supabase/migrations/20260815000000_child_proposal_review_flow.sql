-- GrowBook P0-5B — Parent material edit → child review.
--
-- Four narrow orchestration RPCs keep proposal/version/task writes in one
-- transaction. The existing transition_child_proposal_v1 remains the only
-- owner of activation timestamps, child acceptance and confirmed reward
-- snapshots. This migration has no completion or wallet side effects.

BEGIN;

COMMENT ON COLUMN child_proposal_plan_versions.parent_confirmed_at IS
  '家長完成自己對這一版的決定；不代表家庭共同版本已生效。共同成立須看 proposal active 與 effective_at，經孩子確認時另須 child_accepted_at。';

CREATE OR REPLACE FUNCTION public.revise_child_proposal_plan_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal child_proposals%ROWTYPE;
  v_source child_proposal_plan_versions%ROWTYPE;
  v_parent child_proposal_plan_versions%ROWTYPE;
  v_verified child_proposals%ROWTYPE;
  v_proposal_id uuid;
  v_expected_plan_id uuid;
  v_parent_plan_id uuid;
  v_material jsonb;
  v_mode text;
  v_weekly_frequency int;
  v_days int[];
  v_preferred_time text;
  v_preferred_time_custom text;
  v_completion_description text;
  v_next_version int;
  v_transition_result jsonb;
  v_constraint_name text;
  v_now timestamptz := now();
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本'
    );
  END IF;

  v_proposal_id := NULLIF(p_command ->> 'proposalId', '')::uuid;
  v_expected_plan_id := NULLIF(p_command ->> 'expectedPlanVersionId', '')::uuid;
  v_material := p_command -> 'materialEdits';
  IF v_proposal_id IS NULL OR v_expected_plan_id IS NULL
    OR jsonb_typeof(v_material) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId、expectedPlanVersionId 或 materialEdits'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(v_material) AS key
     WHERE key NOT IN (
       'cadenceMode', 'cadenceWeeklyFrequency', 'cadenceDays',
       'preferredTime', 'preferredTimeCustom', 'completionDescription'
     )
  ) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'reason', 'READONLY_FIELD_NOT_EDITABLE', 'message', '這一欄目前不能在共同確認前調整'
    );
  END IF;

  v_mode := NULLIF(btrim(COALESCE(v_material ->> 'cadenceMode', '')), '');
  v_weekly_frequency := NULLIF(v_material ->> 'cadenceWeeklyFrequency', '')::int;
  v_preferred_time := NULLIF(btrim(COALESCE(v_material ->> 'preferredTime', '')), '');
  v_preferred_time_custom := NULLIF(
    btrim(COALESCE(v_material ->> 'preferredTimeCustom', '')), ''
  );
  v_completion_description := NULLIF(
    btrim(COALESCE(v_material ->> 'completionDescription', '')), ''
  );

  IF v_material ? 'cadenceDays' AND v_material -> 'cadenceDays' <> 'null'::jsonb THEN
    IF jsonb_typeof(v_material -> 'cadenceDays') IS DISTINCT FROM 'array' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'CADENCE_INVALID', 'message', '固定星期格式不正確'
      );
    END IF;
    SELECT array_agg(DISTINCT value::int ORDER BY value::int)
      INTO v_days
      FROM jsonb_array_elements_text(v_material -> 'cadenceDays');
  END IF;

  IF v_mode = 'weekly_frequency' THEN
    IF v_weekly_frequency NOT BETWEEN 1 AND 7 OR v_days IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'CADENCE_INVALID', 'message', '每週次數必須是 1 到 7，且不能指定固定星期'
      );
    END IF;
  ELSIF v_mode = 'fixed_days' THEN
    IF v_weekly_frequency IS NOT NULL OR v_days IS NULL OR cardinality(v_days) = 0
      OR EXISTS (SELECT 1 FROM unnest(v_days) AS day WHERE day NOT BETWEEN 0 AND 6) THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'CADENCE_INVALID', 'message', '固定星期必須至少選一天，且不能同時帶每週次數'
      );
    END IF;
  ELSE
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'reason', 'CADENCE_INVALID', 'message', '目前只支援每週次數或固定星期'
    );
  END IF;

  IF (v_preferred_time IS NOT NULL AND v_preferred_time NOT IN (
    'before_school', 'after_school', 'after_dinner', 'before_bed',
    'weekend', 'when_needed', 'custom'
  )) OR (v_preferred_time = 'custom' AND v_preferred_time_custom IS NULL)
    OR (v_preferred_time IS DISTINCT FROM 'custom' AND v_preferred_time_custom IS NOT NULL)
    OR length(COALESCE(v_preferred_time_custom, '')) > 60 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'reason', 'PREFERRED_TIME_INVALID', 'message', '請選擇或填寫適合的時段'
    );
  END IF;

  IF v_completion_description IS NULL OR length(v_completion_description) > 120 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'reason', 'COMPLETION_DESCRIPTION_INVALID', 'message', '請用 120 字內描述怎樣算完成'
    );
  END IF;

  SELECT * INTO v_proposal
    FROM child_proposals
   WHERE id = v_proposal_id
   FOR UPDATE;

  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: proposal is not visible to the caller'
      USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

  -- Replay after the first transaction committed. The exact lineage and exact
  -- normalized material are the proof that this is the same request.
  IF v_proposal.status = 'needs_child_review' THEN
    SELECT * INTO v_parent
      FROM child_proposal_plan_versions
     WHERE id = v_proposal.current_plan_version_id
       AND proposal_id = v_proposal.id
       AND authored_by = 'parent'
       AND requires_child_review = true
       AND adopted_from_plan_version_id = v_expected_plan_id;

    IF v_parent.id IS NOT NULL
      AND v_parent.cadence_mode IS NOT DISTINCT FROM v_mode
      AND v_parent.cadence_weekly_frequency IS NOT DISTINCT FROM v_weekly_frequency
      AND v_parent.cadence_days IS NOT DISTINCT FROM v_days
      AND v_parent.preferred_time IS NOT DISTINCT FROM v_preferred_time
      AND v_parent.preferred_time_custom IS NOT DISTINCT FROM v_preferred_time_custom
      AND v_parent.completion_description IS NOT DISTINCT FROM v_completion_description THEN
      RETURN jsonb_build_object(
        'ok', true, 'proposalId', v_proposal.id, 'planVersionId', v_parent.id,
        'status', 'needs_child_review', 'idempotentReplay', true
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', false, 'code', 'STALE_PLAN_VERSION',
      'reason', 'STALE_PLAN_VERSION', 'message', '計畫已更新，請重新整理後再調整'
    );
  END IF;

  IF v_proposal.status <> 'proposed' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'PROPOSAL_NOT_PROPOSED', 'message', '目前提案狀態不能再調整'
    );
  END IF;
  IF v_proposal.task_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'REVIEW_MUST_NOT_HAVE_TASK', 'message', '已有正式任務的提案不能走首次共同確認'
    );
  END IF;
  IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'STALE_PLAN_VERSION',
      'reason', 'STALE_PLAN_VERSION', 'message', '計畫已更新，請重新整理後再調整'
    );
  END IF;

  SELECT * INTO v_source
    FROM child_proposal_plan_versions
   WHERE id = v_expected_plan_id
     AND proposal_id = v_proposal.id;
  IF v_source.id IS NULL OR v_source.authored_by NOT IN ('ai', 'parent') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'reason', 'PLAN_NOT_CONFIRMABLE', 'message', '目前版本不是可調整的完整計畫'
    );
  END IF;

  IF v_source.cadence_mode IS NOT DISTINCT FROM v_mode
    AND v_source.cadence_weekly_frequency IS NOT DISTINCT FROM v_weekly_frequency
    AND v_source.cadence_days IS NOT DISTINCT FROM v_days
    AND v_source.preferred_time IS NOT DISTINCT FROM v_preferred_time
    AND v_source.preferred_time_custom IS NOT DISTINCT FROM v_preferred_time_custom
    AND v_source.completion_description IS NOT DISTINCT FROM v_completion_description THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'NO_MATERIAL_CHANGE',
      'reason', 'NO_MATERIAL_CHANGE', 'message', '這些安排和目前計畫一樣'
    );
  END IF;

  SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next_version
    FROM child_proposal_plan_versions WHERE proposal_id = v_proposal.id;

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
      requires_child_review, child_accepted_at, parent_confirmed_at, effective_at
    ) VALUES (
      v_proposal.id, v_next_version, 'parent', auth.uid(),
      v_source.plan_title, v_source.plan_summary,
      v_source.purpose_category, v_completion_description,
      CASE
        WHEN v_source.purpose_category = 'D'
          AND v_source.duration_type = 'long_term'
          AND v_mode IN ('weekly_frequency', 'fixed_days')
          THEN 'weekly_rhythm'
        ELSE NULL
      END,
      v_source.next_step,
      v_mode, v_weekly_frequency, v_days,
      v_preferred_time, v_preferred_time_custom, v_source.estimated_minutes,
      v_source.duration_type, v_source.duration_days, NULL, NULL,
      v_source.reward_policy, v_source.reward_eligibility,
      v_source.reward_policy_version, v_source.task_policy_version,
      v_source.ai_snapshot, v_source.ai_model,
      NULL, v_source.ai_suggested_coin_amount,
      v_expected_plan_id,
      TRUE, NULL, v_now, NULL
    ) RETURNING id INTO v_parent_plan_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
    IF v_constraint_name = 'child_proposal_plan_versions_one_adoption_per_source' THEN
      SELECT * INTO v_parent
        FROM child_proposal_plan_versions
       WHERE proposal_id = v_proposal.id
         AND adopted_from_plan_version_id = v_expected_plan_id;
      IF v_parent.id IS NOT NULL
        AND v_parent.cadence_mode IS NOT DISTINCT FROM v_mode
        AND v_parent.cadence_weekly_frequency IS NOT DISTINCT FROM v_weekly_frequency
        AND v_parent.cadence_days IS NOT DISTINCT FROM v_days
        AND v_parent.preferred_time IS NOT DISTINCT FROM v_preferred_time
        AND v_parent.preferred_time_custom IS NOT DISTINCT FROM v_preferred_time_custom
        AND v_parent.completion_description IS NOT DISTINCT FROM v_completion_description THEN
        RETURN jsonb_build_object(
          'ok', true, 'proposalId', v_proposal.id, 'planVersionId', v_parent.id,
          'status', 'needs_child_review', 'idempotentReplay', true
        );
      END IF;
      RETURN jsonb_build_object(
        'ok', false, 'code', 'STALE_PLAN_VERSION',
        'reason', 'REVISION_ALREADY_EXISTS', 'message', '已有另一份調整版本，請重新整理'
      );
    END IF;
    RAISE;
  END;

  UPDATE child_proposal_plan_versions
     SET superseded_at = v_now
   WHERE proposal_id = v_proposal.id
     AND id <> v_parent_plan_id
     AND superseded_at IS NULL;
  UPDATE child_proposals
     SET current_plan_version_id = v_parent_plan_id
   WHERE id = v_proposal.id;

  v_transition_result := public.transition_child_proposal_v1(jsonb_build_object(
    'schemaVersion', 1,
    'proposalId', v_proposal.id,
    'toStatus', 'needs_child_review',
    'actorRole', 'parent'
  ));
  IF COALESCE((v_transition_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'proposal review transition failed', DETAIL = v_transition_result::text;
  END IF;

  SELECT * INTO v_verified FROM child_proposals WHERE id = v_proposal.id;
  SELECT * INTO v_parent FROM child_proposal_plan_versions WHERE id = v_parent_plan_id;
  IF v_verified.status <> 'needs_child_review'
    OR v_verified.current_plan_version_id IS DISTINCT FROM v_parent_plan_id
    OR v_verified.task_id IS NOT NULL
    OR v_parent.adopted_from_plan_version_id IS DISTINCT FROM v_expected_plan_id
    OR v_parent.parent_confirmed_at IS NULL
    OR v_parent.effective_at IS NOT NULL
    OR v_parent.child_accepted_at IS NOT NULL
    OR v_parent.start_date IS NOT NULL
    OR v_parent.end_date IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'proposal review verification failed';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'proposalId', v_proposal.id, 'planVersionId', v_parent_plan_id,
    'status', 'needs_child_review', 'idempotentReplay', false
  );
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object(
    'ok', false, 'code', 'PERSISTENCE_FAILED',
    'reason', 'REVISION_TRANSACTION_FAILED', 'message', '調整沒有完整存下來，請再試一次'
  );
END;
$$;

COMMENT ON FUNCTION public.revise_child_proposal_plan_v1(jsonb) IS
  'Atomically appends an exact parent material revision and moves a proposed child proposal to child review. No task or wallet effect.';


CREATE OR REPLACE FUNCTION public.accept_child_proposal_plan_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal child_proposals%ROWTYPE;
  v_plan child_proposal_plan_versions%ROWTYPE;
  v_verified child_proposals%ROWTYPE;
  v_expected_plan_id uuid;
  v_task_id uuid;
  v_start_date date;
  v_end_date date;
  v_decision jsonb;
  v_task_command jsonb;
  v_create_result jsonb;
  v_transition_result jsonb;
  v_failure_text text;
  v_related jsonb;
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

  -- A controlled P0001 turns any nested RPC failure into a rollback of this
  -- subtransaction before its typed JSON detail is returned.
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

    SELECT * INTO v_plan
      FROM child_proposal_plan_versions
     WHERE id = v_proposal.current_plan_version_id
       AND proposal_id = v_proposal.id;

    -- Retry after a successful accept is decided before the normal review-state
    -- guard. The accepted current version and its task snapshot are the proof.
    IF v_proposal.status = 'active' THEN
      IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id
        OR v_plan.id IS NULL
        OR v_plan.authored_by <> 'parent'
        OR v_plan.requires_child_review IS DISTINCT FROM TRUE
        OR v_proposal.task_id IS NULL
        OR v_plan.confirmed_source_task_id IS DISTINCT FROM v_proposal.task_id
        OR v_plan.child_accepted_at IS NULL
        OR v_plan.effective_at IS NULL THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'STALE_PLAN_VERSION',
          'reason', 'STALE_PLAN_VERSION', 'message', '這份提案已由另一個版本成立'
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
        'ok', true, 'proposalId', v_proposal.id, 'planVersionId', v_plan.id,
        'taskId', v_proposal.task_id, 'relatedIds', v_related,
        'confirmedReward', jsonb_build_object(
          'rewardPolicy', v_plan.confirmed_reward_policy,
          'coinAmount', v_plan.confirmed_coin_amount,
          'payoutBasis', v_plan.confirmed_payout_basis,
          'claimPeriod', v_plan.confirmed_claim_period,
          'maxClaimsPerPeriod', v_plan.confirmed_max_claims_per_period,
          'rewardPolicyVersion', v_plan.confirmed_reward_policy_version,
          'taskPolicyVersion', v_plan.confirmed_task_policy_version,
          'sourceTaskId', v_plan.confirmed_source_task_id
        ),
        'idempotentReplay', true
      );
    END IF;

    IF v_proposal.status <> 'needs_child_review' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'PROPOSAL_NOT_IN_REVIEW', 'message', '這份計畫目前不在等孩子確認'
      );
    END IF;
    IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'STALE_PLAN_VERSION',
        'reason', 'STALE_PLAN_VERSION', 'message', '計畫已更新，請重新整理後再確認'
      );
    END IF;
    IF v_plan.id IS NULL OR v_plan.authored_by <> 'parent'
      OR v_plan.requires_child_review IS DISTINCT FROM TRUE
      OR v_plan.parent_confirmed_at IS NULL
      OR v_plan.effective_at IS NOT NULL
      OR v_plan.child_accepted_at IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'PLAN_NOT_CONFIRMABLE', 'message', '目前版本不是可由孩子確認的家長調整版'
      );
    END IF;

    IF COALESCE(btrim(v_plan.plan_title), '') = ''
      OR v_plan.purpose_category IS NULL
      OR COALESCE(btrim(v_plan.completion_description), '') = ''
      OR COALESCE(btrim(v_plan.next_step), '') = ''
      OR v_plan.duration_type IS NULL
      OR (v_plan.duration_type = 'long_term'
          AND (v_plan.duration_days IS NULL OR v_plan.duration_days <= 0))
      OR v_plan.cadence_mode NOT IN ('weekly_frequency', 'fixed_days')
      OR v_plan.estimated_minutes IS NULL OR v_plan.estimated_minutes <= 0
      OR v_plan.reward_policy IS NULL
      OR v_plan.reward_eligibility <> 'allowed'
      OR COALESCE(btrim(v_plan.reward_policy_version), '') = ''
      OR COALESCE(btrim(v_plan.task_policy_version), '') = '' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'PLAN_NOT_CONFIRMABLE', 'message', '計畫缺少正式任務需要的結構化資料'
      );
    END IF;
    IF v_plan.cadence_mode = 'weekly_frequency' AND (
      v_plan.cadence_weekly_frequency NOT BETWEEN 1 AND 7
      OR v_plan.cadence_days IS NOT NULL
    ) THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'WEEKLY_RHYTHM_INVALID', 'message', '彈性每週節奏資料不完整'
      );
    ELSIF v_plan.cadence_mode = 'fixed_days' AND (
      v_plan.cadence_weekly_frequency IS NOT NULL
      OR v_plan.cadence_days IS NULL
      OR cardinality(v_plan.cadence_days) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(v_plan.cadence_days) AS day
         WHERE day NOT BETWEEN 0 AND 6
      )
    ) THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'FIXED_DAYS_INVALID', 'message', '固定星期節奏資料不完整'
      );
    END IF;
    IF v_plan.progress_model IS DISTINCT FROM CASE
      WHEN v_plan.purpose_category = 'D'
        AND v_plan.duration_type = 'long_term'
        AND v_plan.cadence_mode IN ('weekly_frequency', 'fixed_days')
        THEN 'weekly_rhythm'
      ELSE NULL
    END THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'WEEKLY_RHYTHM_INVALID', 'message', '長期節奏的進度模式與計畫證據不一致'
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
      WHEN v_plan.duration_type = 'long_term'
        THEN v_start_date + (v_plan.duration_days - 1)
      ELSE v_start_date
    END;

    -- Dates are the only plan columns this orchestrator writes. The existing
    -- append-only guard permits lifecycle dates; transition owns all activation
    -- and confirmed reward fields.
    UPDATE child_proposal_plan_versions
       SET start_date = v_start_date, end_date = v_end_date
     WHERE id = v_plan.id;

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
        'reviewEnabled', true,
        'firstReviewAfterDays', LEAST(7, v_plan.duration_days),
        'weekendReviewEnabled', false
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

    -- P0-5A's live wrapper originally admitted weekly_rhythm only for
    -- weekly_frequency. For a canonical fixed-days D/long-term review plan,
    -- create the same canonical rows without that wrapper-only flag, then apply
    -- the deterministic P0-3 rhythm mapping inside this transaction.
    v_create_result := public.create_parent_task_v1(
      CASE
        WHEN v_plan.cadence_mode = 'fixed_days'
          AND v_plan.progress_model = 'weekly_rhythm'
          THEN v_task_command - 'progressModel'
        ELSE v_task_command
      END
    );
    IF COALESCE((v_create_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'canonical task creation failed', DETAIL = v_create_result::text;
    END IF;
    v_task_id := NULLIF(v_create_result ->> 'taskId', '')::uuid;

    IF v_plan.cadence_mode = 'fixed_days'
      AND v_plan.progress_model = 'weekly_rhythm' THEN
      UPDATE tasks
         SET progress_model = 'weekly_rhythm', long_term_type = 'habit'
       WHERE id = v_task_id;
      UPDATE long_term_goals
         SET goal_type = 'habit'
       WHERE task_id = v_task_id;
      UPDATE task_change_events
         SET snapshot = jsonb_set(
           snapshot, '{command,progressModel}', to_jsonb('weekly_rhythm'::text), true
         )
       WHERE task_id = v_task_id
         AND event_type = 'created_from_child_proposal';
    END IF;

    v_transition_result := public.transition_child_proposal_v1(jsonb_build_object(
      'schemaVersion', 1,
      'proposalId', v_proposal.id,
      'toStatus', 'active',
      'actorRole', 'child',
      'taskId', v_task_id
    ));
    IF COALESCE((v_transition_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'proposal activation failed', DETAIL = v_transition_result::text;
    END IF;

    SELECT * INTO v_verified FROM child_proposals WHERE id = v_proposal.id;
    SELECT * INTO v_plan FROM child_proposal_plan_versions WHERE id = v_expected_plan_id;
    IF v_verified.status <> 'active'
      OR v_verified.task_id IS DISTINCT FROM v_task_id
      OR v_verified.current_plan_version_id IS DISTINCT FROM v_expected_plan_id
      OR v_verified.activated_at IS NULL
      OR v_plan.start_date IS DISTINCT FROM v_start_date
      OR v_plan.end_date IS DISTINCT FROM v_end_date
      OR v_plan.effective_at IS NULL
      OR v_plan.child_accepted_at IS NULL
      OR v_plan.confirmed_source_task_id IS DISTINCT FROM v_task_id
      OR (
        v_plan.cadence_mode = 'fixed_days'
        AND v_plan.progress_model = 'weekly_rhythm'
        AND NOT EXISTS (
          SELECT 1
            FROM tasks t
            JOIN long_term_goals g ON g.task_id = t.id
           WHERE t.id = v_task_id
             AND t.progress_model = 'weekly_rhythm'
             AND t.long_term_type = 'habit'
             AND g.goal_type = 'habit'
        )
      ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'accept verification failed',
        DETAIL = jsonb_build_object(
          'ok', false, 'code', 'PERSISTENCE_FAILED',
          'reason', 'ACCEPT_VERIFICATION_FAILED', 'message', '共同計畫建立後驗證失敗'
        )::text;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'proposalId', v_proposal.id,
      'planVersionId', v_expected_plan_id,
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

COMMENT ON FUNCTION public.accept_child_proposal_plan_v1(jsonb) IS
  'Atomically verifies fresh application reward evidence, creates the canonical task, then delegates child activation and confirmed snapshots to transition_child_proposal_v1.';


CREATE OR REPLACE FUNCTION public.request_child_proposal_changes_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal child_proposals%ROWTYPE;
  v_plan child_proposal_plan_versions%ROWTYPE;
  v_latest_event child_proposal_status_events%ROWTYPE;
  v_expected_plan_id uuid;
  v_reason text;
  v_transition_result jsonb;
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本'
    );
  END IF;
  v_expected_plan_id := NULLIF(p_command ->> 'expectedPlanVersionId', '')::uuid;
  v_reason := NULLIF(btrim(COALESCE(p_command ->> 'reason', '')), '');
  IF NULLIF(p_command ->> 'proposalId', '') IS NULL OR v_expected_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId 或 expectedPlanVersionId'
    );
  END IF;

  SELECT * INTO v_proposal
    FROM child_proposals
   WHERE id = (p_command ->> 'proposalId')::uuid
   FOR UPDATE;
  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: proposal is not visible to the caller'
      USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

  IF v_proposal.status = 'proposed'
    AND v_proposal.current_plan_version_id IS NOT DISTINCT FROM v_expected_plan_id THEN
    SELECT * INTO v_latest_event
      FROM child_proposal_status_events
     WHERE proposal_id = v_proposal.id
     ORDER BY created_at DESC, id DESC
     LIMIT 1;
    IF v_latest_event.from_status = 'needs_child_review'
      AND v_latest_event.to_status = 'proposed'
      AND v_latest_event.actor_role = 'child'
      AND v_latest_event.plan_version_id IS NOT DISTINCT FROM v_expected_plan_id
      AND v_latest_event.reason IS NOT DISTINCT FROM v_reason THEN
      RETURN jsonb_build_object(
        'ok', true, 'proposalId', v_proposal.id,
        'planVersionId', v_expected_plan_id, 'status', 'proposed',
        'idempotentReplay', true
      );
    END IF;
  END IF;

  IF v_proposal.status <> 'needs_child_review' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'PROPOSAL_NOT_IN_REVIEW', 'message', '這份計畫目前不在等孩子確認'
    );
  END IF;
  IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'STALE_PLAN_VERSION',
      'reason', 'STALE_PLAN_VERSION', 'message', '計畫已更新，請重新整理後再說說看'
    );
  END IF;
  IF v_proposal.task_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'REVIEW_MUST_NOT_HAVE_TASK', 'message', '已有正式任務的提案不能回到首次討論'
    );
  END IF;
  SELECT * INTO v_plan
    FROM child_proposal_plan_versions
   WHERE id = v_expected_plan_id AND proposal_id = v_proposal.id;
  IF v_plan.id IS NULL OR v_plan.authored_by <> 'parent'
    OR v_plan.requires_child_review IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'reason', 'PLAN_NOT_CONFIRMABLE', 'message', '目前版本不是家長調整版'
    );
  END IF;

  v_transition_result := public.transition_child_proposal_v1(jsonb_strip_nulls(jsonb_build_object(
    'schemaVersion', 1,
    'proposalId', v_proposal.id,
    'toStatus', 'proposed',
    'actorRole', 'child',
    'reason', v_reason
  )));
  IF COALESCE((v_transition_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_transition_result;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'proposalId', v_proposal.id,
    'planVersionId', v_expected_plan_id, 'status', 'proposed',
    'idempotentReplay', false
  );
END;
$$;

COMMENT ON FUNCTION public.request_child_proposal_changes_v1(jsonb) IS
  'Moves the exact current parent review version back to proposed for more family discussion, without changing the current version or creating a task.';


CREATE OR REPLACE FUNCTION public.close_child_proposal_unsuitable_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal child_proposals%ROWTYPE;
  v_expected_plan_id uuid;
  v_reason text;
  v_transition_result jsonb;
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本'
    );
  END IF;
  IF NULLIF(p_command ->> 'proposalId', '') IS NULL
    OR NOT (p_command ? 'expectedPlanVersionId') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId 或明確的 expectedPlanVersionId'
    );
  END IF;
  v_expected_plan_id := NULLIF(p_command ->> 'expectedPlanVersionId', '')::uuid;
  v_reason := NULLIF(btrim(COALESCE(p_command ->> 'reason', '')), '');
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'CLOSE_REQUIRES_REASON', 'message', '請留一句話給孩子'
    );
  END IF;

  SELECT * INTO v_proposal
    FROM child_proposals
   WHERE id = (p_command ->> 'proposalId')::uuid
   FOR UPDATE;
  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: proposal is not visible to the caller'
      USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

  IF v_proposal.status = 'closed_unsuitable' THEN
    IF v_proposal.current_plan_version_id IS NOT DISTINCT FROM v_expected_plan_id
      AND v_proposal.closed_reason IS NOT DISTINCT FROM v_reason
      AND v_proposal.task_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', true, 'proposalId', v_proposal.id,
        'planVersionId', v_expected_plan_id, 'status', 'closed_unsuitable',
        'idempotentReplay', true
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', false, 'code', 'STALE_PLAN_VERSION',
      'reason', 'STALE_PLAN_VERSION', 'message', '這份提案已由另一個狀態結束'
    );
  END IF;

  IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'STALE_PLAN_VERSION',
      'reason', 'STALE_PLAN_VERSION', 'message', '計畫已更新，請重新整理後再決定'
    );
  END IF;
  IF v_proposal.status NOT IN ('proposed', 'needs_child_review') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'PROPOSAL_NOT_CLOSABLE', 'message', '目前提案狀態不能關閉'
    );
  END IF;
  IF v_proposal.task_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'CLOSE_MUST_NOT_HAVE_TASK', 'message', '已有正式任務的提案不能在這裡關閉'
    );
  END IF;

  v_transition_result := public.transition_child_proposal_v1(jsonb_build_object(
    'schemaVersion', 1,
    'proposalId', v_proposal.id,
    'toStatus', 'closed_unsuitable',
    'actorRole', 'parent',
    'reason', v_reason
  ));
  IF COALESCE((v_transition_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_transition_result;
  END IF;

  SELECT * INTO v_proposal FROM child_proposals WHERE id = v_proposal.id;
  IF v_proposal.status <> 'closed_unsuitable'
    OR v_proposal.closed_reason IS DISTINCT FROM v_reason
    OR v_proposal.closed_at IS NULL
    OR v_proposal.task_id IS NOT NULL THEN
    RAISE EXCEPTION 'close verification failed' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'proposalId', v_proposal.id,
    'planVersionId', v_expected_plan_id, 'status', 'closed_unsuitable',
    'idempotentReplay', false
  );
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object(
    'ok', false, 'code', 'PERSISTENCE_FAILED',
    'reason', 'CLOSE_VERIFICATION_FAILED', 'message', '提案沒有完整關閉，請再試一次'
  );
END;
$$;

COMMENT ON FUNCTION public.close_child_proposal_unsuitable_v1(jsonb) IS
  'Closes a proposed or child-review proposal with an explicit reason and exact nullable current-version guard. No task or wallet effect.';


REVOKE ALL ON FUNCTION public.revise_child_proposal_plan_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revise_child_proposal_plan_v1(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_child_proposal_plan_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_child_proposal_plan_v1(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.request_child_proposal_changes_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_child_proposal_changes_v1(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.close_child_proposal_unsuitable_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_child_proposal_unsuitable_v1(jsonb) TO authenticated;

COMMIT;
