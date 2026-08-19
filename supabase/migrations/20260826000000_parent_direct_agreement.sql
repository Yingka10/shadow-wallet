-- ═══════════════════════════════════════════════════════════════════════════
-- P1-A4A — 家長對「孩子已經想清楚的完整計畫」的直接同意
--
-- ─────────────────────────────────────────────────────────────────────────
-- 產品語意不是「家長批准 AI 計畫」，也不是「家長接管孩子的 Plan」：
--
--     孩子已經確認「我要怎麼做到」；
--     家長現在只確認這份**已經完整**的安排能不能成為家庭共同約定。
--
-- ⚠️ 這支是 confirm_child_proposal_v1 的 **sibling，不是它的擴充**。
--
--    把那一支的 `authored_by = 'ai'` 放寬成 `IN ('ai','child')` 會得到一支
--    看似通用、其實語意分叉的 function：一條線的意思是「採用 GrowBook 的
--    建議」，另一條是「同意孩子的安排」。它們的 lineage、可確認條件、
--    reward 錨點都不一樣，合在一起之後每加一個條件都要問「這是哪一條的」。
--
--    **這支 migration 一個字都沒有動 confirm_child_proposal_v1。**
--
-- ⚠️ 只處理**完整**的 child plan。requires_parent_decision 非空的一律
--    SHARED_DECISION_REQUIRED —— 家長直接填一個 cadence 然後立刻 active，
--    等於孩子從來沒答應過那個節奏。那是 A4B 的協商流程。
--
-- ⚠️ 不新增任何建立任務的路徑。任務仍然只由 create_parent_task_v1 建立，
--    creationSource = 'child_proposal'。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.confirm_child_planning_proposal_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal     child_proposals%ROWTYPE;
  v_plan         child_proposal_plan_versions%ROWTYPE;
  v_parent_plan  child_proposal_plan_versions%ROWTYPE;
  v_verified     child_proposals%ROWTYPE;
  v_expected_plan_id uuid;
  v_parent_plan_id   uuid;
  v_task_id      uuid;
  v_start_date   date;
  v_end_date     date;
  v_now          timestamptz := now();
  v_decision     jsonb;
  v_coin_ref     int;
  v_payout       text;
  v_task_command jsonb;
  v_create_result     jsonb;
  v_transition_result jsonb;
  v_failure_text text;
  v_related      jsonb;
  v_next_version int;
  v_purpose      text;
  v_completion_policy text;
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本');
  END IF;

  -- ── 家長這顆「確認」不能同時偷偷編計畫 ──────────────────────────────────
  --
  -- 孩子已經對著螢幕上那一份點過頭了。命令裡多帶一個 nextStep 或
  -- cadence，家長按下去之後成立的就是另一份他從來沒看過的安排。
  IF p_command ?| ARRAY[
       'planTitle', 'planSummary', 'nextStep', 'desiredOutcome', 'actionPlanSummary',
       'childConfirmedPlan', 'progressionKind', 'phases', 'targetValue', 'targetUnit',
       'cadence', 'cadenceMode', 'cadenceWeeklyFrequency', 'cadenceDays',
       'duration', 'durationType', 'durationDays',
       'estimatedMinutes', 'preferredTime', 'completionDescription',
       'purposeCategory', 'progressModel'
     ] THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'CHILD_PLAN_NOT_CLIENT_SUPPLIED',
      'message', '共同約定的內容一律從孩子確認過的計畫複製，不接受呼叫端傳入');
  END IF;

  v_expected_plan_id := NULLIF(p_command ->> 'expectedPlanVersionId', '')::uuid;
  IF NULLIF(p_command ->> 'proposalId', '') IS NULL OR v_expected_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId 或 expectedPlanVersionId');
  END IF;

  -- 這個區塊是一個 PL/pgSQL subtransaction。把巢狀 RPC 的 {ok:false}
  -- 轉成 P0001，區塊內每一筆寫入都會在回傳 JSON 之前 rollback。
  BEGIN
    SELECT * INTO v_proposal FROM child_proposals
     WHERE id = (p_command ->> 'proposalId')::uuid FOR UPDATE;

    IF v_proposal.id IS NULL THEN
      RAISE EXCEPTION 'Not authorized: proposal is not visible to the caller'
        USING ERRCODE = '42501';
    END IF;
    PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

    -- ── 冪等：commit 之後的連點／重送 ─────────────────────────────────────
    --
    -- 證據是 lineage，不是「這份提案剛好是 active」。與 legacy 同一個作法：
    -- adopted_from_plan_version_id 指向家長當時看的那一版，才算同一次確認。
    IF v_proposal.status = 'active' THEN
      SELECT * INTO v_parent_plan FROM child_proposal_plan_versions
       WHERE id = v_proposal.current_plan_version_id
         AND proposal_id = v_proposal.id
         AND authored_by = 'parent'
         AND adopted_from_plan_version_id = v_expected_plan_id;

      IF v_parent_plan.id IS NULL OR v_proposal.task_id IS NULL
        OR v_parent_plan.confirmed_source_task_id IS DISTINCT FROM v_proposal.task_id THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'STALE_PLAN_VERSION',
          'reason', 'STALE_PLAN_VERSION', 'message', '這份提案已由另一個版本確認');
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
        'sourcePlanVersionId', v_expected_plan_id,
        'taskId', v_proposal.task_id,
        'relatedIds', v_related,
        'confirmedReward', public.child_proposal_confirmed_reward_v1(v_parent_plan.id),
        'idempotentReplay', true);
    END IF;

    IF v_proposal.status <> 'proposed' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'PROPOSAL_NOT_PROPOSED', 'message', '只有待一起確認的提案可以建立共同約定');
    END IF;

    IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'STALE_PLAN_VERSION',
        'reason', 'STALE_PLAN_VERSION', 'message', '這份計畫已經更新，請重新整理後再確認');
    END IF;

    SELECT * INTO v_plan FROM child_proposal_plan_versions
     WHERE id = v_expected_plan_id AND proposal_id = v_proposal.id
     FOR UPDATE;

    -- ── 這條路徑只處理 P1 的 child planning 版本 ─────────────────────────
    --
    -- 判準只有 authorship 與 lineage。標題、snapshot、model 都不看 ——
    -- 內容看起來像什麼，都不能決定一份計畫走哪一條確認路徑。
    IF v_plan.id IS NULL
      OR v_plan.authored_by <> 'child'
      OR v_plan.source_planning_session_id IS NULL
      OR v_plan.planning_schema_version IS NULL
      OR v_plan.child_confirmed_plan IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'PLAN_NOT_CHILD_PLANNING', 'message', '目前版本不是孩子自己規劃的計畫');
    END IF;

    -- ── 還有共同條件沒決定 → 這一包不處理 ───────────────────────────────
    --
    -- **不是錯誤，是「還有事要一起決定」。** 家長直接填一個 cadence 然後
    -- 立刻 active，等於孩子從來沒答應過那個節奏。A4B 才做協商。
    IF cardinality(v_plan.requires_parent_decision) > 0 THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'SHARED_DECISION_REQUIRED',
        'pending', to_jsonb(v_plan.requires_parent_decision),
        'message', '還有幾個安排需要一起確認');
    END IF;

    IF v_plan.enrichment_status IS DISTINCT FROM 'enriched' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'SHARED_DECISION_REQUIRED',
        'pending', '[]'::jsonb,
        'message', 'GrowBook 還在整理這份計畫，請稍後再確認');
    END IF;

    -- ── 正式任務需要的系統欄位 ───────────────────────────────────────────
    --
    -- 缺任何一個都**不自動補值**。生一個 durationDays = 30 出來，
    -- 等於家長確認了一個沒有人提過的期限。
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
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'SHARED_DECISION_REQUIRED',
        'pending', '[]'::jsonb,
        'message', '這份計畫還缺正式任務需要的資料，先不建立共同約定');
    END IF;

    IF v_plan.cadence_mode = 'weekly_frequency' AND (
      v_plan.progress_model IS DISTINCT FROM 'weekly_rhythm'
      OR v_plan.cadence_weekly_frequency IS NULL
      OR v_plan.cadence_weekly_frequency NOT BETWEEN 1 AND 7
      OR v_plan.cadence_days IS NOT NULL
    ) THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'WEEKLY_RHYTHM_INVALID', 'message', '彈性每週節奏資料不完整');
    END IF;

    IF v_plan.cadence_mode NOT IN ('weekly_frequency', 'fixed_days', 'one_time') THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'SHARED_DECISION_REQUIRED',
        'pending', '[]'::jsonb,
        'message', '目前的進行方式還需要一起討論');
    END IF;

    -- ── Reward freshness ─────────────────────────────────────────────────
    --
    -- 家長可能是幾天後才按確認，所以 App 端用**現在的**政策重算一次，
    -- 這裡再驗那份判定與計畫上記著的證據一致。
    v_decision := p_command -> 'rewardDecision';
    IF v_decision IS NULL
      OR v_decision ->> 'eligibility' IS DISTINCT FROM 'allowed'
      OR v_decision ->> 'rewardPolicy' IS DISTINCT FROM v_plan.reward_policy
      OR v_decision ->> 'rewardPolicyVersion' IS DISTINCT FROM v_plan.reward_policy_version THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED',
        'reason', 'POLICY_CHANGED', 'message', '回饋政策已更新，請重新整理後再確認');
    END IF;

    IF v_plan.purpose_category = 'B' AND v_plan.reward_policy = 'coin_eligible' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED',
        'reason', 'POLICY_CHANGED', 'message', '家庭參與目前不能建立成成長幣任務');
    END IF;

    -- 幣值的錨點是 A3 enrichment 當時記在 snapshot 裡的 session 價。
    --
    -- A3 刻意不在 child formal plan 上存幣值（那一步不發幣、也不替家長
    -- 先決定金額），但它的 enrichment 走的就是既有的
    -- rewardEligibility → coinPolicy 規則鏈 —— 那條鏈算出來的 session 價
    -- 有被記進 ai_snapshot.policy。那是一個**伺服器端存著的、規則引擎
    -- 產生的**數字，所以拿它當錨點。沒有錨點的話，呼叫端送什麼金額
    -- 都沒有東西可以比對。
    v_coin_ref := NULLIF(btrim(COALESCE(
      v_plan.ai_snapshot -> 'policy' ->> 'sessionCoinReference', '')), '')::int;
    v_payout := NULLIF(btrim(COALESCE(
      v_plan.ai_snapshot -> 'policy' ->> 'payoutType', '')), '');

    IF v_plan.reward_policy = 'coin_eligible' THEN
      -- progressionKind 不推 payout。staged 不是 per_milestone，
      -- accumulation 不是 final_completion —— payoutType 只有真的是
      -- per_completion 時，session 價才等於這份計畫會發的金額。
      IF v_payout IS DISTINCT FROM 'per_completion' THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_CHANGED',
          'message', '這份計畫的回饋方式還沒有正式的結算規則');
      END IF;
      IF v_coin_ref IS NULL OR v_coin_ref <= 0
        OR NULLIF(v_decision -> 'coin' ->> 'suggestedAmount', '')::int IS DISTINCT FROM v_coin_ref
        -- 家長不改金額。這一包確認的是「GrowBook 已經算好的合法回饋」，
        -- 不是一個可以自由輸入的欄位。
        OR NULLIF(v_decision -> 'coin' ->> 'finalAmount', '')::int IS DISTINCT FROM v_coin_ref THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_CHANGED',
          'message', '顯示的成長幣建議已不是目前政策結果');
      END IF;
    ELSIF v_coin_ref IS NOT NULL OR v_decision -> 'coin' IS DISTINCT FROM 'null'::jsonb THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_CHANGED',
        'message', '不發幣的計畫帶有不一致幣值');
    END IF;

    -- ── 家庭共同約定版本 ─────────────────────────────────────────────────
    --
    -- ⚠️ 逐欄從 v_plan 複製，一欄都不從 p_command 讀。家長確認的是
    --    螢幕上那一版。
    --
    -- ⚠️ **不複製 child_confirmed_plan。** canonical child plan 只有一份，
    --    掛在孩子那一版上（DB CHECK 也不允許 parent 版帶 planning lineage）。
    --    家長這一版透過 adopted_from_plan_version_id 指回去 ——
    --    「孩子原本怎麼想」永遠只有一個答案。
    v_start_date := timezone('Asia/Taipei', now())::date;
    v_end_date := CASE
      WHEN v_plan.duration_days IS NOT NULL THEN v_start_date + (v_plan.duration_days - 1)
      ELSE NULL END;
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
      -- enrichment 的稽核快照跟著走，理由與 legacy 相同：之後要回答
      -- 「當時的政策判定憑什麼」時，證據要在共同版本上找得到。
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

    -- ── 正式任務 ─────────────────────────────────────────────────────────
    --
    -- 走既有的 create_parent_task_v1，creationSource = 'child_proposal'。
    -- 這裡不寫 INSERT INTO tasks —— 那會變成第三條建立任務的路徑。
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
      -- firstReviewAfterDays 不可以是 0（long_term_goals_first_review_check
      -- 要求 NULL 或 > 0）。7 與家長抽屜的預設同值，並夾住不超過計畫長度。
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

    -- ── 驗證 ─────────────────────────────────────────────────────────────
    --
    -- 除了 legacy 那幾項，多驗一條 A4A 專屬的：**孩子那一版沒有被動過。**
    -- authored_by、planning lineage、canonical child plan 都必須原封不動 ——
    -- 家長同意這件事不可以改寫孩子確認過的東西。
    SELECT * INTO v_verified FROM child_proposals WHERE id = v_proposal.id;
    SELECT * INTO v_parent_plan FROM child_proposal_plan_versions WHERE id = v_parent_plan_id;

    IF v_verified.status <> 'active'
      OR v_verified.task_id IS DISTINCT FROM v_task_id
      OR v_verified.current_plan_version_id IS DISTINCT FROM v_parent_plan_id
      OR v_verified.activated_at IS NULL
      OR v_parent_plan.confirmed_source_task_id IS DISTINCT FROM v_task_id
      OR v_parent_plan.adopted_from_plan_version_id IS DISTINCT FROM v_expected_plan_id
      -- 共同版本不得帶 planning lineage：canonical child plan 只有一份。
      OR v_parent_plan.source_planning_session_id IS NOT NULL
      OR v_parent_plan.child_confirmed_plan IS NOT NULL
      -- 孩子那一版逐欄未改。
      OR NOT EXISTS (
        SELECT 1 FROM child_proposal_plan_versions c
         WHERE c.id = v_expected_plan_id
           AND c.authored_by = 'child'
           AND c.source_planning_session_id = v_plan.source_planning_session_id
           AND c.child_confirmed_plan IS NOT DISTINCT FROM v_plan.child_confirmed_plan
           AND c.plan_title IS NOT DISTINCT FROM v_plan.plan_title
           AND c.plan_summary IS NOT DISTINCT FROM v_plan.plan_summary
           AND c.next_step IS NOT DISTINCT FROM v_plan.next_step
           AND c.cadence_mode IS NOT DISTINCT FROM v_plan.cadence_mode
           AND c.cadence_weekly_frequency IS NOT DISTINCT FROM v_plan.cadence_weekly_frequency
           AND c.cadence_days IS NOT DISTINCT FROM v_plan.cadence_days
      )
      -- 共同版本的執行內容逐欄等於孩子那一版。
      OR v_parent_plan.plan_title   IS DISTINCT FROM v_plan.plan_title
      OR v_parent_plan.plan_summary IS DISTINCT FROM v_plan.plan_summary
      OR v_parent_plan.next_step    IS DISTINCT FROM v_plan.next_step
      OR v_parent_plan.completion_description IS DISTINCT FROM v_plan.completion_description
      OR v_parent_plan.progress_model IS DISTINCT FROM v_plan.progress_model
      OR v_parent_plan.purpose_category IS DISTINCT FROM v_plan.purpose_category
      OR v_parent_plan.cadence_mode IS DISTINCT FROM v_plan.cadence_mode
      OR v_parent_plan.cadence_weekly_frequency IS DISTINCT FROM v_plan.cadence_weekly_frequency
      OR v_parent_plan.cadence_days IS DISTINCT FROM v_plan.cadence_days
      OR v_parent_plan.preferred_time IS DISTINCT FROM v_plan.preferred_time
      OR v_parent_plan.preferred_time_custom IS DISTINCT FROM v_plan.preferred_time_custom
      OR v_parent_plan.estimated_minutes IS DISTINCT FROM v_plan.estimated_minutes
      OR v_parent_plan.duration_type IS DISTINCT FROM v_plan.duration_type
      OR v_parent_plan.duration_days IS DISTINCT FROM v_plan.duration_days
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'agreement verification failed',
        DETAIL = jsonb_build_object(
          'ok', false, 'code', 'PERSISTENCE_FAILED',
          'reason', 'AGREEMENT_VERIFICATION_FAILED',
          'message', '共同約定建立後驗證失敗'
        )::text;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'proposalId', v_proposal.id,
      'planVersionId', v_parent_plan_id,
      -- 孩子那一版的 id。lineage 的起點，之後回查 canonical child plan 用。
      'sourcePlanVersionId', v_expected_plan_id,
      'taskId', v_task_id,
      'relatedIds', COALESCE(v_create_result -> 'relatedIds', '[]'::jsonb),
      'confirmedReward', v_transition_result -> 'confirmedReward',
      'idempotentReplay', COALESCE((v_create_result ->> 'idempotentReplay')::boolean, false));
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_failure_text = PG_EXCEPTION_DETAIL;
    RETURN v_failure_text::jsonb;
  END;
END;
$$;

COMMENT ON FUNCTION public.confirm_child_planning_proposal_v1(jsonb) IS
  'P1-A4A：家長同意孩子已經確認且完整的計畫 → 家庭共同約定版本 ＋ 正式任務。'
  'confirm_child_proposal_v1 的 sibling（那一支只收 AI-authored，一個字都沒改）。'
  '共同條件未決定一律 SHARED_DECISION_REQUIRED，不自動補值。';

REVOKE ALL ON FUNCTION public.confirm_child_planning_proposal_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_child_planning_proposal_v1(jsonb) TO authenticated;
