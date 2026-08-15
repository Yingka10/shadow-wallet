-- ═══════════════════════════════════════════════════════════════════════════
-- P1-A4B1 修正 — 沒選回饋方式時，reward 不可以從未決集合裡消失
--
-- ─────────────────────────────────────────────────────────────────────────
-- 20260828 的未決重算裡有一行三值邏輯的錯：
--
--     IF NOT (v_choice = 'no_coin' OR (...)) THEN append 'reward'
--
-- 家長沒有選回饋方式時 v_choice 是 NULL，而 `NULL = 'no_coin'` 的結果是
-- **NULL 不是 false**。NULL OR false 仍是 NULL、NOT NULL 還是 NULL，
-- 於是 `IF NULL THEN` 整段不執行 —— 一個真的還沒說定的 reward
-- 就這樣從未決集合裡消失，而孩子端會看到一份「都說好了」的安排。
--
-- 這正是這條路徑最想防的事：按一次送出，就把沒有人決定過的事宣告成
-- 已經決定。staging acceptance 在 P1-A4B2 主線第一輪抓到。
--
-- 與 20260828 的差別只有那兩處 COALESCE。其餘一字未動 ——
-- 那一支已經套過 staging，內容從既有定義原樣搬過來再改。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.propose_child_planning_terms_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal    child_proposals%ROWTYPE;
  v_source      child_proposal_plan_versions%ROWTYPE;
  v_root        child_proposal_plan_versions%ROWTYPE;
  v_parent      child_proposal_plan_versions%ROWTYPE;
  v_verified    child_proposals%ROWTYPE;
  v_root_id     uuid;
  v_proposal_id uuid;
  v_expected_plan_id uuid;
  v_parent_plan_id   uuid;
  v_terms       jsonb;
  v_eval        jsonb;
  v_mode        text;
  v_weekly      smallint;
  v_days        integer[];
  v_time        text;
  v_time_custom text;
  v_minutes     integer;
  v_duration_days integer;
  v_choice      text;
  v_policy      text;
  v_eligibility text;
  v_policy_ver  text;
  v_task_ver    text;
  v_coin_ref    integer;
  v_payout      text;
  v_progression text;
  v_progress    text;
  v_pending     text[] := ARRAY[]::text[];
  v_next_version int;
  v_transition_result jsonb;
  v_constraint_name text;
  v_now         timestamptz := now();
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本');
  END IF;

  -- ── 孩子擁有的欄位，一個都不接受 ──────────────────────────────────────
  --
  -- **拒絕，不是忽略。** 忽略的話，家長端送出去的畫面顯示「已送出」，
  -- 而他以為自己改掉的那一句話其實沒有變 —— 兩邊看到的是兩份計畫。
  v_terms := p_command -> 'sharedTerms';
  IF p_command ?| ARRAY[
       'desiredOutcome', 'actionPlanSummary', 'nextAction', 'childConfirmedPlan',
       'planTitle', 'planSummary', 'nextStep',
       'progressionKind', 'phases', 'targetValue', 'targetUnit', 'goalControlType'
     ]
    OR (jsonb_typeof(v_terms) = 'object' AND v_terms ?| ARRAY[
         'desiredOutcome', 'actionPlanSummary', 'nextAction', 'childConfirmedPlan',
         'planTitle', 'planSummary', 'nextStep',
         'progressionKind', 'phases', 'targetValue', 'targetUnit', 'goalControlType'
       ]) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'CHILD_PLAN_FIELD_NOT_EDITABLE',
      'message', '孩子想怎麼做到的部分不能在這裡調整');
  END IF;

  IF jsonb_typeof(v_terms) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少 sharedTerms');
  END IF;

  -- 白名單。共同條件之外的欄位（例如 purposeCategory、completionDescription）
  -- 都不是家長在這一步該決定的事。
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(v_terms) AS key
     WHERE key NOT IN (
       'cadenceMode', 'cadenceWeeklyFrequency', 'cadenceDays',
       'preferredTime', 'preferredTimeCustom',
       'sessionMinutes', 'durationDays', 'rewardChoice'
     )
  ) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'SHARED_TERM_NOT_EDITABLE',
      'message', '這一項目前不能在共同條件裡調整');
  END IF;

  -- 幣值一個都不收。家長提出的是條件，不是金額。
  IF p_command ?| ARRAY['coinAmount', 'confirmedReward', 'rewardDecision']
    OR v_terms ?| ARRAY['coinAmount', 'finalAmount', 'confirmedCoinAmount'] THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'REWARD_NOT_CLIENT_DECIDED',
      'message', '這一步不決定幣值');
  END IF;

  v_proposal_id      := NULLIF(p_command ->> 'proposalId', '')::uuid;
  v_expected_plan_id := NULLIF(p_command ->> 'expectedPlanVersionId', '')::uuid;
  IF v_proposal_id IS NULL OR v_expected_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId 或 expectedPlanVersionId');
  END IF;

  SELECT * INTO v_proposal FROM child_proposals WHERE id = v_proposal_id FOR UPDATE;
  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: proposal is not visible to the caller'
      USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

  -- ── 先解析與驗證條件（replay 對帳要用同一組正規化後的值）──────────────
  v_mode := NULLIF(btrim(COALESCE(v_terms ->> 'cadenceMode', '')), '');
  v_weekly := NULLIF(btrim(COALESCE(v_terms ->> 'cadenceWeeklyFrequency', '')), '')::smallint;
  IF jsonb_typeof(v_terms -> 'cadenceDays') = 'array' THEN
    SELECT array_agg(DISTINCT value::integer ORDER BY value::integer)
      INTO v_days FROM jsonb_array_elements_text(v_terms -> 'cadenceDays');
  END IF;
  v_time        := NULLIF(btrim(COALESCE(v_terms ->> 'preferredTime', '')), '');
  v_time_custom := NULLIF(btrim(COALESCE(v_terms ->> 'preferredTimeCustom', '')), '');
  v_minutes     := NULLIF(btrim(COALESCE(v_terms ->> 'sessionMinutes', '')), '')::integer;
  v_duration_days := NULLIF(btrim(COALESCE(v_terms ->> 'durationDays', '')), '')::integer;
  v_choice      := NULLIF(btrim(COALESCE(v_terms ->> 'rewardChoice', '')), '');

  IF v_mode IS NOT NULL THEN
    IF v_mode = 'weekly_frequency' THEN
      IF v_weekly IS NULL OR v_weekly NOT BETWEEN 1 AND 7 OR v_days IS NOT NULL THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'CADENCE_INVALID',
          'message', '每週次數必須是 1 到 7，且不能同時指定固定星期');
      END IF;
    ELSIF v_mode = 'fixed_days' THEN
      IF v_weekly IS NOT NULL OR v_days IS NULL OR cardinality(v_days) = 0
        OR EXISTS (SELECT 1 FROM unnest(v_days) AS day WHERE day NOT BETWEEN 0 AND 6) THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'CADENCE_INVALID',
          'message', '固定星期必須至少選一天，且不能同時帶每週次數');
      END IF;
    ELSE
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'CADENCE_INVALID',
        'message', '目前只支援每週次數或固定星期');
    END IF;
  ELSIF v_weekly IS NOT NULL OR v_days IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'CADENCE_INVALID',
      'message', '沒有指定進行方式時不能帶次數或星期');
  END IF;

  IF (v_time IS NOT NULL AND v_time NOT IN (
        'before_school', 'after_school', 'after_dinner', 'before_bed',
        'weekend', 'when_needed', 'custom'))
    OR (v_time = 'custom' AND v_time_custom IS NULL)
    OR (v_time IS DISTINCT FROM 'custom' AND v_time_custom IS NOT NULL)
    OR length(COALESCE(v_time_custom, '')) > 60 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'PREFERRED_TIME_INVALID',
      'message', '請選擇或填寫適合的時段');
  END IF;

  -- 既有 canonical range（與家長抽屜、Plan Draft 同一組）。
  IF v_minutes IS NOT NULL AND v_minutes NOT BETWEEN 5 AND 120 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'SESSION_SIZE_INVALID',
      'message', '每次時間請落在 5 到 120 分鐘');
  END IF;

  IF v_duration_days IS NOT NULL AND v_duration_days NOT BETWEEN 1 AND 180 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'DURATION_INVALID',
      'message', '先試多久請落在 1 到 180 天');
  END IF;

  IF v_choice IS NOT NULL AND v_choice NOT IN ('growbook_default', 'no_coin') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'REWARD_CHOICE_INVALID',
      'message', '目前只能選擇沿用 GrowBook 的判定或不給成長幣');
  END IF;

  -- ── 冪等：commit 之後的連點／重送 ─────────────────────────────────────
  --
  -- 證據是 lineage ＋ 正規化後的條件本身。內容不一樣卻想覆蓋第一份草案，
  -- 是 STALE —— 孩子可能已經在看那一份了。
  IF v_proposal.status = 'needs_child_review' THEN
    SELECT * INTO v_parent FROM child_proposal_plan_versions
     WHERE id = v_proposal.current_plan_version_id
       AND proposal_id = v_proposal.id
       AND authored_by = 'parent'
       AND requires_child_review = true
       AND adopted_from_plan_version_id = v_expected_plan_id;

    IF v_parent.id IS NOT NULL
      AND v_parent.cadence_mode IS NOT DISTINCT FROM COALESCE(v_mode, v_parent.cadence_mode)
      AND (v_mode IS NULL
           OR (v_parent.cadence_weekly_frequency IS NOT DISTINCT FROM v_weekly
               AND v_parent.cadence_days IS NOT DISTINCT FROM v_days))
      AND (v_time IS NULL OR v_parent.preferred_time IS NOT DISTINCT FROM v_time)
      AND (v_minutes IS NULL OR v_parent.estimated_minutes IS NOT DISTINCT FROM v_minutes)
      AND (v_duration_days IS NULL
           OR v_parent.duration_days IS NOT DISTINCT FROM v_duration_days) THEN
      RETURN jsonb_build_object(
        'ok', true, 'proposalId', v_proposal.id, 'planVersionId', v_parent.id,
        'sourcePlanVersionId', v_expected_plan_id,
        'status', 'needs_child_review',
        'requiresParentDecision', to_jsonb(v_parent.requires_parent_decision),
        'idempotentReplay', true);
    END IF;

    RETURN jsonb_build_object(
      'ok', false, 'code', 'STALE_PLAN_VERSION', 'reason', 'STALE_PLAN_VERSION',
      'message', '這份提案已經送給孩子看了，請重新整理');
  END IF;

  IF v_proposal.status <> 'proposed' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'PROPOSAL_NOT_PROPOSED',
      'message', '目前提案狀態不能提出共同條件');
  END IF;
  IF v_proposal.task_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'REVIEW_MUST_NOT_HAVE_TASK',
      'message', '已經有正式任務的提案不走這一步');
  END IF;
  IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'STALE_PLAN_VERSION', 'reason', 'STALE_PLAN_VERSION',
      'message', '這份計畫已經更新，請重新整理');
  END IF;

  SELECT * INTO v_source FROM child_proposal_plan_versions
   WHERE id = v_expected_plan_id AND proposal_id = v_proposal.id
   FOR UPDATE;
  IF v_source.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'NOT_CHILD_PLANNING_LINEAGE',
      'message', '找不到要協商的計畫版本');
  END IF;

  -- ── 整條 adoption chain 必須回得到 P1 的 child plan ───────────────────
  --
  -- 這是這條路徑與 P0 parent revision 的分界。少了它，一份普通的 P0
  -- 家長調整版也能走進來，然後被當成「孩子自己規劃過的計畫」在談。
  WITH RECURSIVE chain AS (
    SELECT v.id, v.adopted_from_plan_version_id, v.authored_by,
           v.source_planning_session_id, v.child_confirmed_plan, 0 AS depth
      FROM child_proposal_plan_versions v
     WHERE v.id = v_expected_plan_id
    UNION ALL
    SELECT p.id, p.adopted_from_plan_version_id, p.authored_by,
           p.source_planning_session_id, p.child_confirmed_plan, chain.depth + 1
      FROM chain
      JOIN child_proposal_plan_versions p ON p.id = chain.adopted_from_plan_version_id
     WHERE chain.depth < 20
  )
  SELECT chain.id INTO v_root_id FROM chain
   WHERE chain.authored_by = 'child'
     AND chain.source_planning_session_id IS NOT NULL
     AND chain.child_confirmed_plan IS NOT NULL
   ORDER BY chain.depth DESC
   LIMIT 1;

  IF v_root_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'NOT_CHILD_PLANNING_LINEAGE',
      'message', '這份提案不是孩子自己規劃的計畫');
  END IF;
  SELECT * INTO v_root FROM child_proposal_plan_versions WHERE id = v_root_id;

  -- ── 系統還沒整理完的事，不能丟給家長 ─────────────────────────────────
  --
  -- purpose_category 是 GrowBook 自己要判定的分類（它決定回饋規則）。
  -- 讓家長在畫面上選 A/B/C/D，等於請他當分類器 —— 而且那個選擇會直接
  -- 影響孩子拿不拿得到幣。
  IF 'purpose_category' = ANY (v_source.requires_parent_decision) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'ENRICHMENT_REQUIRED',
      'message', 'GrowBook 還需要先整理這件事的回饋規則');
  END IF;

  -- duration_type 同理：它是系統判定，家長既不選也猜不出來。
  -- 家長能提出的是「先試多久」這個天數，不是把長期目標改成一次性任務。
  IF v_source.duration_type IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'ENRICHMENT_REQUIRED',
      'message', 'GrowBook 還需要先整理這件事的執行期間');
  END IF;

  -- ── 生效值：沒提出的條件沿用來源 ─────────────────────────────────────
  IF v_mode IS NULL THEN
    v_mode   := v_source.cadence_mode;
    v_weekly := v_source.cadence_weekly_frequency;
    v_days   := v_source.cadence_days;
  END IF;
  IF v_time IS NULL THEN
    v_time        := v_source.preferred_time;
    v_time_custom := v_source.preferred_time_custom;
  END IF;
  v_minutes := COALESCE(v_minutes, v_source.estimated_minutes);
  v_duration_days := COALESCE(v_duration_days, v_source.duration_days);
  IF v_source.duration_type <> 'long_term' THEN
    v_duration_days := v_source.duration_days;
  END IF;

  -- ── Reward ───────────────────────────────────────────────────────────
  --
  -- 家長能提出的只有「沿用 GrowBook 的判定」或「這件事不給成長幣」。
  -- **只准往下，不准往上**：資格閘門說不能發幣的計畫，家長勾一個選項
  -- 不會讓它變成可以發幣。
  v_eligibility := v_source.reward_eligibility;
  v_policy_ver  := v_source.reward_policy_version;
  v_task_ver    := v_source.task_policy_version;
  v_eval        := p_command -> 'rewardEvaluation';

  IF COALESCE(v_choice, '') = 'no_coin' THEN
    v_policy := CASE WHEN v_source.reward_policy = 'coin_eligible'
                     THEN 'progress_only' ELSE v_source.reward_policy END;
    v_coin_ref := NULL;
    v_payout   := NULL;
  ELSE
    v_policy := v_source.reward_policy;

    IF v_policy <> 'coin_eligible' THEN
      -- 來源不是可發幣的計畫。帶著一份 coin 判定進來就是想升級。
      IF jsonb_typeof(v_eval) = 'object'
        AND v_eval ->> 'rewardPolicy' = 'coin_eligible' THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'REWARD_UPGRADE_NOT_ALLOWED',
          'message', '這件事目前的回饋規則不能改成發成長幣');
      END IF;
      v_coin_ref := NULL;
      v_payout   := NULL;

    ELSIF jsonb_typeof(v_eval) = 'object' THEN
      -- 帶了新的判定：形狀嚴格驗。
      IF v_eval ->> 'rewardPolicy' IS DISTINCT FROM 'coin_eligible'
        OR v_eval ->> 'eligibility' IS DISTINCT FROM 'allowed'
        OR NULLIF(btrim(COALESCE(v_eval ->> 'payoutType', '')), '') IS DISTINCT FROM
           'per_completion'
        OR NULLIF(btrim(COALESCE(v_eval ->> 'rewardPolicyVersion', '')), '') IS NULL THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_CHANGED',
          'message', '這份計畫的回饋規則需要重新整理後再提出');
      END IF;
      v_coin_ref := NULLIF(btrim(COALESCE(
        v_eval ->> 'sessionCoinReference', '')), '')::integer;
      IF v_coin_ref IS NULL OR v_coin_ref <= 0 THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_CHANGED',
          'message', '這份計畫算不出成長幣的參考值');
      END IF;
      v_payout := 'per_completion';
      v_policy_ver := NULLIF(btrim(v_eval ->> 'rewardPolicyVersion'), '');
      v_task_ver := COALESCE(
        NULLIF(btrim(COALESCE(v_eval ->> 'taskPolicyVersion', '')), ''), v_task_ver);

      -- 沒有任何會影響定價的條件變動時，重算的結果必須跟來源一模一樣。
      -- 這一條擋的是「什麼都沒改、只把幣值報高一點」這條路徑。
      IF v_minutes IS NOT DISTINCT FROM v_source.estimated_minutes
        AND v_source.policy_session_coin_reference IS NOT NULL
        AND v_coin_ref IS DISTINCT FROM v_source.policy_session_coin_reference THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_EVIDENCE_MISMATCH',
          'message', '沒有改動會影響回饋的條件，成長幣參考值不該變');
      END IF;

    ELSE
      -- 沒帶新的判定。**只有在定價相關的條件沒變時**才可以沿用來源的證據。
      --
      -- 這條路徑是刻意留的：家長常常只是要補一個節奏，而這份計畫的
      -- reward 本來就還沒說定（來源證據是 NULL）。那種情況要求他先解決
      -- 幣值才能送出，等於把一件系統還沒算出來的事推給他。
      --
      -- 但每次多久一改，pricing band 可能就換了 —— 這時沿用舊數字，
      -- 孩子會看到一個依據已經不存在的金額。
      IF v_minutes IS DISTINCT FROM v_source.estimated_minutes THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'REWARD_REEVALUATION_REQUIRED',
          'message', '改了每次要做多久，成長幣要重新算過');
      END IF;
      v_coin_ref := v_source.policy_session_coin_reference;
      v_payout   := v_source.policy_payout_type;
    END IF;
  END IF;

  IF v_source.purpose_category = 'B' AND v_policy = 'coin_eligible' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_CHANGED',
      'message', '家庭參與目前不能建立成成長幣任務');
  END IF;

  -- ── progression → progress_model ─────────────────────────────────────
  --
  -- 依據是**孩子確認過的** progressionKind，不是 purpose_category。
  -- staged 的進度是「走到第幾階段」、accumulation 是「5 本裡的第 2 本」——
  -- 塞進 weekly_rhythm 會讓孩子的畫面顯示一個沒有依據的週次數。
  v_progression := v_root.child_confirmed_plan ->> 'progressionKind';
  v_progress := NULL;
  IF v_progression = 'rhythm'
    AND v_source.duration_type = 'long_term'
    AND v_mode IN ('weekly_frequency', 'fixed_days') THEN
    v_progress := 'weekly_rhythm';
  END IF;

  -- ── 還沒說定的共同條件：重算，不是照抄 ───────────────────────────────
  --
  -- 家長這一輪處理了 cadence 與 duration，reward 仍然沒說定 —— 新版本
  -- 要誠實地只留下 reward。反過來，一按送出就全部清空，等於宣稱一件
  -- 從來沒有人決定的事已經決定了。
  IF v_mode IS NULL THEN v_pending := array_append(v_pending, 'cadence'); END IF;
  IF v_minutes IS NULL OR v_minutes <= 0 THEN
    v_pending := array_append(v_pending, 'session_size');
  END IF;
  IF public.child_planning_pending_duration(v_source.duration_type, v_duration_days) THEN
    v_pending := array_append(v_pending, 'duration');
  END IF;
  -- reward 說定的兩種方式：家長明確選了不給幣，或現在真的算得出合法的
  -- 幣值依據。資格閘門說 blocked 而家長選了「不給幣」，那件事就是說定了。
  --
  -- ⚠️ COALESCE 不能省。家長沒有選回饋方式時 v_choice 是 NULL，而
  --    `NULL = 'no_coin'` 的結果是 **NULL 不是 false**；NULL OR false 仍是
  --    NULL，NOT NULL 還是 NULL，於是 `IF NULL THEN` 整段不執行 ——
  --    一個真的還沒說定的 reward 就這樣從未決集合裡消失了。
  --
  --    這正是這條路徑最想防的事：按一次送出，就把沒有人決定過的事
  --    宣告成已經決定。staging 抓到的（P1-A4B2 主線第一輪）。
  IF NOT (COALESCE(v_choice, '') = 'no_coin'
          OR (v_policy = 'coin_eligible' AND v_coin_ref IS NOT NULL)) THEN
    v_pending := array_append(v_pending, 'reward');
  END IF;

  -- ── 沒有實質改變就不要新增版本 ───────────────────────────────────────
  IF v_source.cadence_mode IS NOT DISTINCT FROM v_mode
    AND v_source.cadence_weekly_frequency IS NOT DISTINCT FROM v_weekly
    AND v_source.cadence_days IS NOT DISTINCT FROM v_days
    AND v_source.preferred_time IS NOT DISTINCT FROM v_time
    AND v_source.preferred_time_custom IS NOT DISTINCT FROM v_time_custom
    AND v_source.estimated_minutes IS NOT DISTINCT FROM v_minutes
    AND v_source.duration_days IS NOT DISTINCT FROM v_duration_days
    AND v_source.reward_policy IS NOT DISTINCT FROM v_policy THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'NO_MATERIAL_CHANGE', 'reason', 'NO_MATERIAL_CHANGE',
      'message', '這些安排和目前的計畫一樣');
  END IF;

  SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next_version
    FROM child_proposal_plan_versions WHERE proposal_id = v_proposal.id;

  BEGIN
    INSERT INTO child_proposal_plan_versions (
      proposal_id, version_no, authored_by, author_user_id,
      -- 孩子擁有的欄位逐欄從來源複製，一欄都不從 p_command 讀。
      plan_title, plan_summary,
      purpose_category, completion_description, progress_model, next_step,
      -- 家庭共同條件。
      cadence_mode, cadence_weekly_frequency, cadence_days,
      preferred_time, preferred_time_custom, estimated_minutes,
      duration_type, duration_days, start_date, end_date,
      reward_policy, reward_eligibility, reward_policy_version, task_policy_version,
      policy_session_coin_reference, policy_payout_type,
      ai_snapshot, ai_model, ai_request_id, ai_suggested_coin_amount,
      adopted_from_plan_version_id, requires_parent_decision,
      -- ⚠️ child_confirmed_plan / source_planning_session_id 一律 NULL：
      --    canonical child plan 只有一份，掛在孩子那一版上。
      --    這一版透過 adopted_from_plan_version_id 指回去。
      requires_child_review, child_accepted_at, parent_confirmed_at, effective_at
    ) VALUES (
      v_proposal.id, v_next_version, 'parent', auth.uid(),
      v_source.plan_title, v_source.plan_summary,
      v_source.purpose_category, v_source.completion_description,
      v_progress, v_source.next_step,
      v_mode, v_weekly, v_days,
      v_time, v_time_custom, v_minutes,
      v_source.duration_type, v_duration_days, NULL, NULL,
      v_policy, v_eligibility, v_policy_ver, v_task_ver,
      v_coin_ref, v_payout,
      v_source.ai_snapshot, v_source.ai_model, NULL, v_source.ai_suggested_coin_amount,
      v_expected_plan_id, v_pending,
      -- 這一版是草案，不是有效計畫：孩子還沒看過。
      TRUE, NULL, v_now, NULL
    ) RETURNING id INTO v_parent_plan_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
    IF v_constraint_name = 'child_proposal_plan_versions_one_adoption_per_source' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'STALE_PLAN_VERSION', 'reason', 'REVISION_ALREADY_EXISTS',
        'message', '已經有另一份共同條件草案，請重新整理');
    END IF;
    RAISE;
  END;

  UPDATE child_proposal_plan_versions
     SET superseded_at = v_now
   WHERE proposal_id = v_proposal.id AND id <> v_parent_plan_id
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
      MESSAGE = 'shared term proposal transition failed', DETAIL = v_transition_result::text;
  END IF;

  -- ── 驗證 ─────────────────────────────────────────────────────────────
  --
  -- 除了狀態與 lineage，還驗兩件 A4B1 專屬的：
  -- **孩子那一版沒有被動過**，而且這一版真的沒有生效。
  SELECT * INTO v_verified FROM child_proposals WHERE id = v_proposal.id;
  SELECT * INTO v_parent FROM child_proposal_plan_versions WHERE id = v_parent_plan_id;

  IF v_verified.status <> 'needs_child_review'
    OR v_verified.current_plan_version_id IS DISTINCT FROM v_parent_plan_id
    OR v_verified.task_id IS NOT NULL
    OR v_parent.adopted_from_plan_version_id IS DISTINCT FROM v_expected_plan_id
    OR v_parent.requires_child_review IS NOT TRUE
    OR v_parent.parent_confirmed_at IS NULL
    OR v_parent.child_accepted_at IS NOT NULL
    OR v_parent.effective_at IS NOT NULL
    OR v_parent.start_date IS NOT NULL OR v_parent.end_date IS NOT NULL
    -- 這一版沒有任何確認過的回饋 —— 那要等孩子接受。
    OR v_parent.confirmed_at IS NOT NULL
    OR v_parent.confirmed_coin_amount IS NOT NULL
    OR v_parent.confirmed_reward_policy IS NOT NULL
    OR v_parent.confirmed_payout_basis IS NOT NULL
    OR v_parent.confirmed_source_task_id IS NOT NULL
    -- canonical child plan 只有一份。
    OR v_parent.child_confirmed_plan IS NOT NULL
    OR v_parent.source_planning_session_id IS NOT NULL
    -- 孩子那一版逐欄未改。
    OR NOT EXISTS (
      SELECT 1 FROM child_proposal_plan_versions c
       WHERE c.id = v_root.id
         AND c.authored_by = 'child'
         AND c.source_planning_session_id IS NOT DISTINCT FROM v_root.source_planning_session_id
         AND c.child_confirmed_plan IS NOT DISTINCT FROM v_root.child_confirmed_plan
         AND c.plan_title IS NOT DISTINCT FROM v_root.plan_title
         AND c.next_step IS NOT DISTINCT FROM v_root.next_step
         AND c.cadence_mode IS NOT DISTINCT FROM v_root.cadence_mode
         AND c.cadence_weekly_frequency IS NOT DISTINCT FROM v_root.cadence_weekly_frequency
         AND c.cadence_days IS NOT DISTINCT FROM v_root.cadence_days
         AND c.preferred_time IS NOT DISTINCT FROM v_root.preferred_time
         AND c.estimated_minutes IS NOT DISTINCT FROM v_root.estimated_minutes
         AND c.duration_days IS NOT DISTINCT FROM v_root.duration_days
         AND c.policy_session_coin_reference
             IS NOT DISTINCT FROM v_root.policy_session_coin_reference
         AND c.requires_parent_decision IS NOT DISTINCT FROM v_root.requires_parent_decision
    )
    -- 孩子擁有的欄位在新版本上與來源一致。
    OR v_parent.plan_title IS DISTINCT FROM v_source.plan_title
    OR v_parent.plan_summary IS DISTINCT FROM v_source.plan_summary
    OR v_parent.next_step IS DISTINCT FROM v_source.next_step
    OR v_parent.completion_description IS DISTINCT FROM v_source.completion_description
    OR v_parent.purpose_category IS DISTINCT FROM v_source.purpose_category
    OR v_parent.duration_type IS DISTINCT FROM v_source.duration_type
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'shared term proposal verification failed';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'proposalId', v_proposal.id,
    'planVersionId', v_parent_plan_id,
    'sourcePlanVersionId', v_expected_plan_id,
    'childPlanVersionId', v_root.id,
    'status', 'needs_child_review',
    'requiresParentDecision', to_jsonb(v_pending),
    'idempotentReplay', false);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object(
    'ok', false, 'code', 'PERSISTENCE_FAILED', 'reason', 'SHARED_TERM_TRANSACTION_FAILED',
    'message', '共同條件沒有完整存下來，請再試一次');
END;
$$;

COMMENT ON FUNCTION public.propose_child_planning_terms_v1(jsonb) IS
  'P1-A4B1：家長對孩子已規劃的計畫提出家庭共同條件 → 家長草案版本 ＋ '
  'needs_child_review。revise_child_proposal_plan_v1 的 sibling（那一支服務 P0，'
  '一個字都沒改）。不建任務、不發幣、不寫 confirmed reward。'
  '未決集合重算時對 NULL 選擇是 NULL-safe 的（見 20260830）。';

REVOKE ALL ON FUNCTION public.propose_child_planning_terms_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_child_planning_terms_v1(jsonb) TO authenticated;
