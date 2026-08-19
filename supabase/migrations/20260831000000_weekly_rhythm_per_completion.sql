-- ═══════════════════════════════════════════════════════════════════════════
-- P1-REWARD-FIX｜每週節奏的共同計畫，完成一次就結算一次
--
-- ─────────────────────────────────────────────────────────────────────────
-- 家庭在畫面上同意的是「完成一次給成長幣」。資料庫實際做的是
-- 「一週做滿 N 次，給一次的錢」——「每週 3 次、每次 8 幣」的計畫，
-- 說好 24 幣，實際 8 幣。差三倍，而且沒有任何一個畫面講過「每週達標」。
-- 完整證據見 docs/LONG_TERM_REWARD_SEMANTIC_MISMATCH.md。
--
-- 產品判定：weekly_rhythm ＋ coin_eligible 的 payout_basis 是 per_completion。
-- 「每週 3 次」是 progression target，不是發幣門檻。
--
-- ── 四個維度從此分開，不互推 ────────────────────────────────────────────
--
--     progression target   一週想做幾次      weekly_frequency
--     completion cap       同一天能記幾次    claim_period / max_claims
--     payout basis         什麼事件結算      payout_basis
--     payout amount        一次多少          reward_coin_amount
--
-- weekly_frequency 不再推導 payout_basis，也不再變成 max_claims_per_period。
--
-- ── 這支 migration 做三件事 ─────────────────────────────────────────────
--
--   1. create_parent_task_v1 接受呼叫端**明講**的 payoutBasis，並在
--      child_proposal 分支連 claim 規則一起寫定，寫完再讀回來驗。
--   2. 兩支 P1 activation RPC 把共同版本的 policy_payout_type 明講進去。
--   3. resolve_payout_basis_v1 標記為 legacy 相容路徑（行為一字未改）。
--
-- ── 明確不做的事 ────────────────────────────────────────────────────────
--
--   * 不 backfill。既有列一列都不改 —— 那是已經簽下去的歷史，
--     而 production 的 P1 是零筆，沒有補發問題。
--   * 不改 resolve_payout_basis_v1 的行為。家長自建抽屜那條路徑仍然
--     依賴它的預設值，為了修 P1 去破壞 legacy 不是修，是換一個壞法。
--     P1 從此不經過它（明講 ＋ 寫入後驗證）。
--   * 不改 complete_task。它對 per_completion 的處理一直是對的。
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

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
  -- 呼叫端**明講**的結算語意。P1 一律帶（值來自共同版本的 policy evidence）；
  -- 沒帶就是 legacy 呼叫端，維持既有行為（trigger 由 cadence 推導）。
  v_payout_basis text := NULLIF(btrim(COALESCE(p_command ->> 'payoutBasis', '')), '');
  v_written_basis  text;
  v_written_target smallint;
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

  -- per_completion 是目前唯一有執行路徑的明講值。收到別的就擋下建立，
  -- **不要**默默退回 cadence 推導 —— 那正是這一輪要消滅的行為。
  IF v_payout_basis IS NOT NULL AND v_payout_basis <> 'per_completion' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'PAYOUT_BASIS_NOT_IMPLEMENTED',
      'message', '這種結算方式還沒有實作：階段完成與整段計畫完成的結算屬於下一輪'
    );
  END IF;

  v_core_command := jsonb_set(p_command, '{creationSource}', '"parent_custom"'::jsonb, true);
  v_result := public.create_parent_task_core_v1(v_core_command);
  IF COALESCE((v_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  v_task_id := NULLIF(v_result ->> 'taskId', '')::uuid;

  -- ⚠️ 四個維度分開，不互推（P1-REWARD-FIX）：
  --
  --      progression target   一週想做幾次      weekly_frequency
  --      completion cap       同一天能記幾次    claim_period / max_claims
  --      payout basis         什麼事件結算      payout_basis
  --      payout amount        一次多少          reward_coin_amount
  --
  --    在此之前 weekly_frequency 同時推導了後面三個：它變成 per_period 的
  --    週目標，也變成 max_claims_per_period。結果是「每週 3 次、每次 8 幣」
  --    的計畫實際上做滿 3 次才給 8 幣 —— 而家庭同意的那句話是「完成一次
  --    給成長幣」。差三倍，而且沒有任何一個畫面講過「每週達標」。
  --
  --    明講的 basis 一律連 claim 規則一起寫定：per_completion 的完成上限是
  --    「同一天一次」，不是「一週 N 次」。一週做第 4 次仍然是合法完成，
  --    仍然照正式金額結算 —— 不存在沒有被家庭確認過的隱形週上限。
  UPDATE tasks
     SET creation_source = 'child_proposal',
         progress_model = v_progress,
         next_step = v_next_step,
         long_term_type = CASE WHEN v_progress = 'weekly_rhythm' THEN 'habit'
                               ELSE long_term_type END,
         payout_basis = COALESCE(v_payout_basis, payout_basis),
         period_target_count = CASE WHEN v_payout_basis = 'per_completion'
                                    THEN NULL ELSE period_target_count END,
         claim_period = CASE WHEN v_payout_basis = 'per_completion'
                             THEN 'day' ELSE claim_period END,
         max_claims_per_period = CASE WHEN v_payout_basis = 'per_completion'
                                      THEN 1 ELSE max_claims_per_period END
   WHERE id = v_task_id;

  -- 從寫下去的那一列讀回來確認。少了這一段，哪天 UPDATE 被改壞或被 trigger
  -- 覆寫，任務會安靜地回到 per_period，而唯一看得出來的地方是幾週後的錢包。
  IF v_payout_basis IS NOT NULL THEN
    SELECT t.payout_basis, t.period_target_count
      INTO v_written_basis, v_written_target
      FROM tasks t WHERE t.id = v_task_id;
    IF v_written_basis IS DISTINCT FROM v_payout_basis
      OR v_written_target IS NOT NULL THEN
      RAISE EXCEPTION 'PAYOUT_BASIS_NOT_PERSISTED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

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
    IF SQLERRM = 'PAYOUT_BASIS_NOT_PERSISTED' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'PERSISTENCE_FAILED',
        'message', '結算語意沒有正確寫入，這筆任務不建立'
      );
    END IF;
    IF SQLERRM = 'PAYOUT_BASIS_NOT_IMPLEMENTED' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'PAYOUT_BASIS_NOT_IMPLEMENTED',
        'message', '這種長期任務的結算方式還沒有實作：階段完成與整段計畫完成的結算屬於下一輪'
      );
    END IF;
    RAISE;
END;
$$;

-- ── legacy 相容路徑，非 canonical ──────────────────────────────────────────
--
-- 行為一字未改，但語意降級：它的 long_term → per_period 預設**不再是
-- 「這種計畫就是這樣結算」的答案**，只是「這個呼叫端沒有明講，而它是
-- 本欄位存在之前就有的路徑」。
--
-- 新的語意化建立路徑必須自己講清楚 payout basis。P1 已經如此
-- （見 create_parent_task_v1 的 payoutBasis ＋ 寫入後驗證），
-- 所以 P1 不會再經過這裡。
COMMENT ON FUNCTION public.resolve_payout_basis_v1(text, text, text, smallint, integer[]) IS
  '**legacy 相容用的預設值，不是 canonical 判定。** 只服務沒有明講 payout basis 的'
  '既有呼叫端（家長自建抽屜）。long_term + weekly cadence 推出 per_period 這條'
  '在 P1-REWARD-FIX 之後不再代表產品判定 —— 每週節奏的共同計畫是 per_completion，'
  '而「每週幾次」是 progression target，不是發幣門檻。'
  '新的建立路徑一律自己明講 payout basis。';

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

    -- ── 錨點：正式的 policy evidence 欄位 ───────────────────────────────
    --
    -- **不讀 ai_snapshot。** 那一欄是稽核證據：形狀由某一次 enrichment
    -- 回了什麼決定，沒有 CHECK 保護，也沒有承諾哪個鍵一定在。正式任務
    -- 建不建得起來不可以取決於它。
    --
    -- 這兩欄由 A3 在建版時寫入，之後 append-only guard 擋住原地修改 ——
    -- 所以「現在用同一套規則再算一次，跟當時的證據對帳」這件事才有意義。
    v_coin_ref := v_plan.policy_session_coin_reference;
    v_payout   := v_plan.policy_payout_type;

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
      policy_session_coin_reference, policy_payout_type,
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
      -- policy evidence 跟著走：之後要回答「這個金額憑什麼」時，
      -- 依據要在共同版本上就找得到，不必再回頭翻孩子那一版。
      v_plan.policy_session_coin_reference, v_plan.policy_payout_type,
      -- enrichment 的稽核快照也跟著走，理由與 legacy 相同：之後要回答
      -- 「當時的政策判定憑什麼」時，證據要在共同版本上找得到。
      -- 但它只是證據 —— 上面的判斷一條都沒有讀它。
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
      -- 結算語意由**共同版本的正式證據**決定，不讓建立端從 cadence 猜。
      -- 上面的 coin_eligible 分支已經確認 v_payout = 'per_completion'；
      -- 不發幣的計畫沒有 policy evidence（沒有東西要定價），而 per_completion
      -- 是唯一有執行路徑的值 —— 寫一個沒有人約定過的每週目標更糟。
      'payoutBasis', COALESCE(v_payout, 'per_completion'),
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
           -- policy evidence 也不可以在確認時被改寫。
           AND c.policy_session_coin_reference
               IS NOT DISTINCT FROM v_plan.policy_session_coin_reference
           AND c.policy_payout_type IS NOT DISTINCT FROM v_plan.policy_payout_type
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
      OR v_parent_plan.policy_session_coin_reference
         IS DISTINCT FROM v_plan.policy_session_coin_reference
      OR v_parent_plan.policy_payout_type IS DISTINCT FROM v_plan.policy_payout_type
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

CREATE OR REPLACE FUNCTION public.accept_child_planning_terms_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal     child_proposals%ROWTYPE;
  v_plan         child_proposal_plan_versions%ROWTYPE;
  v_source       child_proposal_plan_versions%ROWTYPE;
  v_root         child_proposal_plan_versions%ROWTYPE;
  v_verified     child_proposals%ROWTYPE;
  v_latest_event child_proposal_status_events%ROWTYPE;
  v_root_id      uuid;
  v_expected_plan_id uuid;
  v_task_id      uuid;
  v_start_date   date;
  v_end_date     date;
  v_decision     jsonb;
  v_coin_ref     integer;
  v_payout       text;
  v_task_command jsonb;
  v_create_result     jsonb;
  v_transition_result jsonb;
  v_failure_text text;
  v_related      jsonb;
  v_purpose      text;
  v_completion_policy text;
  v_pending      text[];
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本');
  END IF;

  -- 孩子在這一步只能說「可以」。他不是在編輯計畫，任何內容欄位都不收。
  IF p_command ?| ARRAY[
       'planTitle', 'planSummary', 'nextStep', 'desiredOutcome', 'actionPlanSummary',
       'childConfirmedPlan', 'progressionKind', 'phases', 'targetValue', 'targetUnit',
       'cadenceMode', 'cadenceWeeklyFrequency', 'cadenceDays',
       'preferredTime', 'estimatedMinutes', 'durationDays',
       'coinAmount', 'confirmedReward'
     ] THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'REVIEW_IS_NOT_AN_EDITOR',
      'message', '這一步只能回覆可不可以，不能同時改內容');
  END IF;

  v_expected_plan_id := NULLIF(p_command ->> 'expectedPlanVersionId', '')::uuid;
  IF NULLIF(p_command ->> 'proposalId', '') IS NULL OR v_expected_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId 或 expectedPlanVersionId');
  END IF;

  BEGIN
    SELECT * INTO v_proposal FROM child_proposals
     WHERE id = (p_command ->> 'proposalId')::uuid FOR UPDATE;
    IF v_proposal.id IS NULL THEN
      RAISE EXCEPTION 'Not authorized: proposal is not visible to the caller'
        USING ERRCODE = '42501';
    END IF;
    PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

    -- ── 冪等 1：已經正式成立（final accept 的重送）─────────────────────
    IF v_proposal.status = 'active' THEN
      SELECT * INTO v_plan FROM child_proposal_plan_versions
       WHERE id = v_proposal.current_plan_version_id AND proposal_id = v_proposal.id;

      IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id
        OR v_plan.id IS NULL
        OR v_plan.authored_by <> 'parent'
        OR v_proposal.task_id IS NULL
        OR v_plan.confirmed_source_task_id IS DISTINCT FROM v_proposal.task_id
        OR v_plan.child_accepted_at IS NULL
        OR v_plan.effective_at IS NULL THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'STALE_PLAN_VERSION', 'reason', 'STALE_PLAN_VERSION',
          'message', '這份提案已由另一個版本成立');
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
        'status', 'active', 'activated', true,
        'taskId', v_proposal.task_id, 'relatedIds', v_related,
        'requiresParentDecision', to_jsonb(v_plan.requires_parent_decision),
        'confirmedReward', public.child_proposal_confirmed_reward_v1(v_plan.id),
        'idempotentReplay', true);
    END IF;

    -- ── 冪等 2：這一輪已經接受過，但還沒談完（partial accept 的重送）───
    --
    -- 證據是**最後一筆狀態事件**：needs_child_review → proposed、孩子、
    -- 同一版、而且動作語意正是「接受了這一輪」。少了 action 這一欄，
    -- 這裡就分不出「他上次是同意還是不同意」。
    IF v_proposal.status = 'proposed'
      AND v_proposal.current_plan_version_id IS NOT DISTINCT FROM v_expected_plan_id THEN
      SELECT * INTO v_latest_event FROM child_proposal_status_events
       WHERE proposal_id = v_proposal.id
       ORDER BY created_at DESC, id DESC LIMIT 1;

      IF v_latest_event.from_status = 'needs_child_review'
        AND v_latest_event.to_status = 'proposed'
        AND v_latest_event.actor_role = 'child'
        AND v_latest_event.plan_version_id IS NOT DISTINCT FROM v_expected_plan_id
        AND v_latest_event.action = 'accepted_shared_terms_pending_more' THEN
        SELECT * INTO v_plan FROM child_proposal_plan_versions WHERE id = v_expected_plan_id;
        RETURN jsonb_build_object(
          'ok', true, 'proposalId', v_proposal.id, 'planVersionId', v_expected_plan_id,
          'status', 'proposed', 'activated', false, 'taskId', NULL,
          'requiresParentDecision', to_jsonb(v_plan.requires_parent_decision),
          'confirmedReward', NULL,
          'idempotentReplay', true);
      END IF;
    END IF;

    IF v_proposal.status <> 'needs_child_review' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'PROPOSAL_NOT_IN_REVIEW',
        'message', '這份安排目前不在等你看看');
    END IF;
    IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'STALE_PLAN_VERSION', 'reason', 'STALE_PLAN_VERSION',
        'message', '安排剛剛更新了，重新看看就好');
    END IF;
    IF v_proposal.task_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'REVIEW_MUST_NOT_HAVE_TASK',
        'message', '已經有正式任務的提案不走這一步');
    END IF;

    SELECT * INTO v_plan FROM child_proposal_plan_versions
     WHERE id = v_expected_plan_id AND proposal_id = v_proposal.id
     FOR UPDATE;

    IF v_plan.id IS NULL
      OR v_plan.authored_by <> 'parent'
      OR v_plan.requires_child_review IS DISTINCT FROM TRUE
      OR v_plan.parent_confirmed_at IS NULL
      OR v_plan.child_accepted_at IS NOT NULL
      OR v_plan.effective_at IS NOT NULL
      OR v_plan.adopted_from_plan_version_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'PLAN_NOT_REVIEWABLE',
        'message', '目前版本不是等你看看的家庭安排');
    END IF;

    -- ── 整條 chain 必須回得到孩子自己規劃的那一份 ────────────────────────
    --
    -- 這是與 P0 parent revision 的分界。少了它，一份普通的 P0 調整版
    -- 也會出現在孩子的 P1 畫面上，而那個畫面說的是「你的做法沒有被改」——
    -- 對 P0 的版本來說那句話不成立。
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
     ORDER BY chain.depth DESC LIMIT 1;

    IF v_root_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'NOT_CHILD_PLANNING_LINEAGE',
        'message', '這份安排不是從你自己的計畫來的');
    END IF;
    SELECT * INTO v_root FROM child_proposal_plan_versions WHERE id = v_root_id;
    SELECT * INTO v_source FROM child_proposal_plan_versions
     WHERE id = v_plan.adopted_from_plan_version_id;

    -- ── 孩子擁有的欄位必須原封不動 ──────────────────────────────────────
    --
    -- 家長那一輪只該碰共同條件。這幾欄如果與來源不一致，那不是一次
    -- 合法的協商，是資料錯了 —— 不可以拿去問孩子「這樣可以嗎」，
    -- 因為畫面上那句「你的做法沒有被改掉」會是假的。
    IF v_source.id IS NULL
      OR v_plan.plan_title IS DISTINCT FROM v_source.plan_title
      OR v_plan.plan_summary IS DISTINCT FROM v_source.plan_summary
      OR v_plan.next_step IS DISTINCT FROM v_source.next_step
      OR v_plan.completion_description IS DISTINCT FROM v_source.completion_description
      OR v_plan.purpose_category IS DISTINCT FROM v_source.purpose_category
      OR v_plan.duration_type IS DISTINCT FROM v_source.duration_type
      -- 整條鏈的頭尾也要對得上：中間任何一版改掉標題或下一步都算。
      OR v_plan.plan_title IS DISTINCT FROM v_root.plan_title
      OR v_plan.next_step IS DISTINCT FROM v_root.next_step
      OR v_root.child_confirmed_plan IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'CHILD_PLAN_INTEGRITY_VIOLATION',
        'message', '這份安排和你原本的計畫對不起來，先不要接受');
    END IF;

    v_pending := v_plan.requires_parent_decision;

    -- 系統還沒整理完的事不該出現在孩子面前。理論上 A4B1 就擋掉了；
    -- 真的出現在這裡是上游漏掉，不要翻譯成「任務分類還沒選」問孩子。
    IF 'purpose_category' = ANY (v_pending) THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'SYSTEM_ENRICHMENT_REQUIRED',
        'message', 'GrowBook 還在整理這件事，等一下再看看');
    END IF;

    -- ══════════════════════════════════════════════════════════════════
    -- B｜這一輪同意了，但還有事沒說完
    -- ══════════════════════════════════════════════════════════════════
    --
    -- **不填 child_accepted_at。** 那一欄在這個 repo 的既有語意是
    -- 「孩子接受了即將成為共同計畫的版本」，而且一向與 effective_at、
    -- 正式任務一起出現。在這裡填它，之後每一個讀者都要重新理解它。
    --
    -- 這件事記在狀態事件上就夠了：他看過、他同意這一輪。
    IF cardinality(v_pending) > 0 THEN
      v_transition_result := public.transition_child_proposal_v1(jsonb_build_object(
        'schemaVersion', 1,
        'proposalId', v_proposal.id,
        'toStatus', 'proposed',
        'actorRole', 'child',
        'action', 'accepted_shared_terms_pending_more'
      ));
      IF COALESCE((v_transition_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001',
          MESSAGE = 'partial accept transition failed', DETAIL = v_transition_result::text;
      END IF;

      SELECT * INTO v_verified FROM child_proposals WHERE id = v_proposal.id;
      SELECT * INTO v_plan FROM child_proposal_plan_versions WHERE id = v_expected_plan_id;
      IF v_verified.status <> 'proposed'
        OR v_verified.task_id IS NOT NULL
        OR v_verified.current_plan_version_id IS DISTINCT FROM v_expected_plan_id
        OR v_plan.child_accepted_at IS NOT NULL
        OR v_plan.effective_at IS NOT NULL
        OR v_plan.confirmed_at IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001',
          MESSAGE = 'partial accept verification failed',
          DETAIL = jsonb_build_object(
            'ok', false, 'code', 'PERSISTENCE_FAILED',
            'reason', 'PARTIAL_ACCEPT_VERIFICATION_FAILED',
            'message', '你的回覆沒有完整存下來，再試一次'
          )::text;
      END IF;

      RETURN jsonb_build_object(
        'ok', true, 'proposalId', v_proposal.id, 'planVersionId', v_expected_plan_id,
        'status', 'proposed', 'activated', false, 'taskId', NULL,
        'requiresParentDecision', to_jsonb(v_pending),
        'confirmedReward', NULL,
        'idempotentReplay', false);
    END IF;

    -- ══════════════════════════════════════════════════════════════════
    -- A｜共同條件都齊了 → 正式成立
    -- ══════════════════════════════════════════════════════════════════

    -- 走到這裡 v_pending 一定是空的。再驗一次是刻意的：哪天有人讓
    -- 呼叫端挑路徑，這一行會擋住「UI 藏起按鈕就等於通過檢查」。
    IF cardinality(v_pending) > 0 THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'SHARED_DECISION_REQUIRED',
        'pending', to_jsonb(v_pending),
        'message', '還有安排沒有說定，先不要開始');
    END IF;

    IF COALESCE(btrim(v_plan.plan_title), '') = ''
      OR v_plan.purpose_category IS NULL
      OR COALESCE(btrim(v_plan.completion_description), '') = ''
      OR COALESCE(btrim(v_plan.next_step), '') = ''
      OR v_plan.duration_type IS NULL
      OR (v_plan.duration_type = 'long_term'
          AND (v_plan.duration_days IS NULL OR v_plan.duration_days <= 0))
      OR v_plan.cadence_mode NOT IN ('weekly_frequency', 'fixed_days', 'one_time')
      OR v_plan.estimated_minutes IS NULL OR v_plan.estimated_minutes <= 0
      OR v_plan.reward_policy IS NULL
      OR v_plan.reward_eligibility <> 'allowed'
      OR COALESCE(btrim(v_plan.reward_policy_version), '') = ''
      OR COALESCE(btrim(v_plan.task_policy_version), '') = '' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'SHARED_DECISION_REQUIRED',
        'pending', '[]'::jsonb,
        'message', '這份安排還缺正式任務需要的資料，先不要開始');
    END IF;

    IF v_plan.cadence_mode = 'weekly_frequency' AND (
      v_plan.cadence_weekly_frequency IS NULL
      OR v_plan.cadence_weekly_frequency NOT BETWEEN 1 AND 7
      OR v_plan.cadence_days IS NOT NULL
    ) THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'WEEKLY_RHYTHM_INVALID',
        'message', '每週節奏的資料不完整');
    END IF;

    -- ── Policy freshness ────────────────────────────────────────────────
    --
    -- 家長提出到孩子接受可能隔了幾天，所以 App 端用**現在的**政策重算
    -- 一次，這裡再驗那份判定與這一版上的 canonical policy evidence 一致。
    --
    -- **不讀 ai_snapshot**（P1-A4A.1）。也**不因為對不上就順手改掉這一版
    -- 的證據**：家長草案是 append-only 的家庭提案，孩子按下「可以」的
    -- 那一刻偷偷換一個金額，是這條路徑上最不該發生的事。
    v_decision := p_command -> 'rewardDecision';
    IF v_decision IS NULL
      OR v_decision ->> 'eligibility' IS DISTINCT FROM 'allowed'
      OR v_decision ->> 'rewardPolicy' IS DISTINCT FROM v_plan.reward_policy
      OR v_decision ->> 'rewardPolicyVersion' IS DISTINCT FROM v_plan.reward_policy_version THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_CHANGED',
        'message', '回饋規則更新了，請重新整理後再看一次');
    END IF;

    IF v_plan.purpose_category = 'B' AND v_plan.reward_policy = 'coin_eligible' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_CHANGED',
        'message', '家庭參與目前不能建立成成長幣任務');
    END IF;

    v_coin_ref := v_plan.policy_session_coin_reference;
    v_payout   := v_plan.policy_payout_type;

    IF v_plan.reward_policy = 'coin_eligible' THEN
      IF v_payout IS DISTINCT FROM 'per_completion' THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_CHANGED',
          'message', '這份安排的回饋方式還沒有正式的結算規則');
      END IF;
      IF v_coin_ref IS NULL OR v_coin_ref <= 0
        OR NULLIF(v_decision -> 'coin' ->> 'suggestedAmount', '')::int IS DISTINCT FROM v_coin_ref
        OR NULLIF(v_decision -> 'coin' ->> 'finalAmount', '')::int IS DISTINCT FROM v_coin_ref THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_CHANGED',
          'message', '成長幣的算法更新了，請重新整理後再看一次');
      END IF;
    ELSIF v_coin_ref IS NOT NULL OR v_decision -> 'coin' IS DISTINCT FROM 'null'::jsonb THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_CHANGED',
        'message', '不發幣的安排帶有不一致的幣值');
    END IF;

    -- ── 正式任務 ────────────────────────────────────────────────────────
    v_start_date := timezone('Asia/Taipei', now())::date;
    v_end_date := CASE
      WHEN v_plan.duration_days IS NOT NULL THEN v_start_date + (v_plan.duration_days - 1)
      ELSE NULL END;

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
      -- 結算語意由**共同版本的正式證據**決定，不讓建立端從 cadence 猜。
      -- 上面的 coin_eligible 分支已經確認 v_payout = 'per_completion'；
      -- 不發幣的計畫沒有 policy evidence（沒有東西要定價），而 per_completion
      -- 是唯一有執行路徑的值 —— 寫一個沒有人約定過的每週目標更糟。
      'payoutBasis', COALESCE(v_payout, 'per_completion'),
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

    -- child_accepted_at / effective_at / confirmed reward 全部由既有的
    -- transition 寫。這裡不手組第二套 confirmedReward。
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

    -- ── 驗證 ────────────────────────────────────────────────────────────
    SELECT * INTO v_verified FROM child_proposals WHERE id = v_proposal.id;
    SELECT * INTO v_plan FROM child_proposal_plan_versions WHERE id = v_expected_plan_id;

    IF v_verified.status <> 'active'
      OR v_verified.task_id IS DISTINCT FROM v_task_id
      OR v_verified.current_plan_version_id IS DISTINCT FROM v_expected_plan_id
      OR v_verified.activated_at IS NULL
      OR v_plan.child_accepted_at IS NULL
      OR v_plan.effective_at IS NULL
      OR v_plan.confirmed_source_task_id IS DISTINCT FROM v_task_id
      -- ⚠️ CASE 一定要包在括號裡。PL/pgSQL 讀 IF 的條件時會讀到**第一個
      --    paren depth 0 的 THEN** 為止 —— 裸 CASE 的內層 THEN 會把條件
      --    提前結束，整支 function 連建都建不起來（42601 syntax error at
      --    end of input），而錯誤位置還會指到幾十行以外的地方。
      --    （legacy accept 那一支也踩過同一顆地雷，註解在 20260815。）
      OR v_plan.confirmed_coin_amount IS DISTINCT FROM (
         CASE WHEN v_plan.reward_policy = 'coin_eligible' THEN v_coin_ref ELSE NULL END)
      -- **沒有新增一版**。接受是 lifecycle，不是內容修訂。
      OR EXISTS (
        SELECT 1 FROM child_proposal_plan_versions v
         WHERE v.proposal_id = v_proposal.id AND v.version_no > v_plan.version_no
      )
      -- 孩子那一份 canonical 計畫仍然原封不動。
      OR NOT EXISTS (
        SELECT 1 FROM child_proposal_plan_versions c
         WHERE c.id = v_root.id
           AND c.authored_by = 'child'
           AND c.child_confirmed_plan IS NOT DISTINCT FROM v_root.child_confirmed_plan
           AND c.plan_title IS NOT DISTINCT FROM v_root.plan_title
           AND c.next_step IS NOT DISTINCT FROM v_root.next_step
           AND c.source_planning_session_id IS NOT DISTINCT FROM v_root.source_planning_session_id
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'child accept verification failed',
        DETAIL = jsonb_build_object(
          'ok', false, 'code', 'PERSISTENCE_FAILED',
          'reason', 'ACCEPT_VERIFICATION_FAILED', 'message', '共同計畫建立後驗證失敗'
        )::text;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'proposalId', v_proposal.id,
      'planVersionId', v_expected_plan_id,
      'childPlanVersionId', v_root.id,
      'status', 'active',
      'activated', true,
      'taskId', v_task_id,
      'relatedIds', COALESCE(v_create_result -> 'relatedIds', '[]'::jsonb),
      'requiresParentDecision', '[]'::jsonb,
      'confirmedReward', v_transition_result -> 'confirmedReward',
      'idempotentReplay', COALESCE((v_create_result ->> 'idempotentReplay')::boolean, false));
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_failure_text = PG_EXCEPTION_DETAIL;
    RETURN COALESCE(v_failure_text::jsonb, jsonb_build_object(
      'ok', false, 'code', 'PERSISTENCE_FAILED', 'reason', 'ACCEPT_TRANSACTION_FAILED',
      'message', '你的回覆沒有完整存下來，再試一次'));
  END;
END;
$$;

COMMENT ON FUNCTION public.create_parent_task_v1(jsonb) IS
  '建立任務的唯一入口。孩子提案走 child_proposal 分支，其餘轉給 core。'
  '呼叫端明講 payoutBasis 時連 claim 規則一起寫定，並在寫入後讀回驗證；'
  '沒有明講時維持 legacy 行為（由 cadence 推導）。'
  '未實作的 payout basis 回 typed error PAYOUT_BASIS_NOT_IMPLEMENTED，不建立任何資料。';

COMMENT ON FUNCTION public.confirm_child_planning_proposal_v1(jsonb) IS
  'P1-A4A：家長同意孩子已規劃並確認過的計畫 → 正式任務 ＋ active。'
  '結算語意由共同版本的 policy_payout_type 明講進 tasks.payout_basis，'
  '不由 cadence 推導（P1-REWARD-FIX）。';

COMMENT ON FUNCTION public.accept_child_planning_terms_v1(jsonb) IS
  'P1-A4B2：孩子回覆家庭共同條件。共同條件都齊了才成立正式任務；'
  '還有未決條件時只記下他同意這一輪，回 proposed、不建任務。'
  '結算語意同 A4A：由 policy_payout_type 明講，不由 cadence 推導。';

COMMIT;
