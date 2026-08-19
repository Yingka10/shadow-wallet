-- ═══════════════════════════════════════════════════════════════════════════
-- P1-A4A.1 — 正式的 policy evidence（把 ai_snapshot 從決策路徑上拿掉）
--
-- ─────────────────────────────────────────────────────────────────────────
-- A4A 出貨時，家長同意那一步的幣值錨點讀的是：
--
--     ai_snapshot -> 'policy' ->> 'sessionCoinReference'
--     ai_snapshot -> 'policy' ->> 'payoutType'
--
-- 那違反這個 repo 一條既有的界線：
--
--     **ai_snapshot 是稽核證據，不是 canonical policy authority。**
--
-- 差別不是潔癖。snapshot 的形狀由「某一次 enrichment 回了什麼」決定，
-- 沒有 CHECK、沒有 append-only 以外的保護、也沒有承諾哪個鍵一定在。
-- 正式任務與 confirmed reward 建不建得起來，不可以取決於一坨稽核 JSON
-- 裡剛好有沒有某個鍵 —— 那條相依一旦成立，snapshot 就再也不能改形狀，
-- 而它本來就是「會隨模型與版本演化」的那一欄。
--
-- 所以這一包把同一組數字**升格成正式欄位**：
--
--     policy_session_coin_reference  A3 enrichment 當時由既有 deterministic
--                                    reward evaluator 算出的一次投入參考價
--     policy_payout_type             當時政策**支援**的結算語意
--
-- 它們不是孩子決定的、不是模型生成的、也不是最終確認的幣值。
-- 它們是這份正式計畫上的 deterministic policy evidence，僅此而已。
--
-- ⚠️ 為什麼不塞進 ai_suggested_coin_amount（省一次 migration）：
--    因為那個數字不是 AI 算的。P0 legacy 那一欄的語意與行為在這一包
--    完全不變 —— 兩條線共用一個名字不對的欄位，之後每次讀都要先問
--    「這一列是哪一條線寫的」。
--
-- ⚠️ 這是 follow-up migration。20260825 / 20260826 已經套過 staging，
--    改它們會讓 history 分岔。
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. 欄位 ───────────────────────────────────────────────────────────────

ALTER TABLE child_proposal_plan_versions
  ADD COLUMN IF NOT EXISTS policy_session_coin_reference integer;

ALTER TABLE child_proposal_plan_versions
  ADD COLUMN IF NOT EXISTS policy_payout_type text;

COMMENT ON COLUMN child_proposal_plan_versions.policy_session_coin_reference IS
  'P1：既有 deterministic reward evaluator（rewardEligibility → coinPolicy）'
  '算出的一次投入參考價。不是 AI 決定的金額，也不是最終發放金額 —— '
  '最終金額在 confirmed_coin_amount。';

COMMENT ON COLUMN child_proposal_plan_versions.policy_payout_type IS
  'P1：這份計畫當時政策支援的結算語意。目前只可能是 per_completion。'
  '不由 progressionKind 推導：staged 不是 per_milestone。';


-- ── 2. CHECK ──────────────────────────────────────────────────────────────
--
-- per_completion 是目前唯一有結算路徑的方式，所以 CHECK 就寫這麼窄。
--
-- 窄 CHECK 的好處是：哪天要支援 per_milestone，會先撞到這一行，
-- 而不是安靜地把一個沒有人實作過的結算語意寫進正式計畫，等到孩子
-- 完成第一個里程碑那天才發現沒有人會發幣。

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_policy_payout_type_check;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_policy_payout_type_check
  CHECK (policy_payout_type IS NULL OR policy_payout_type = 'per_completion');

-- 沒有結算語意的參考價是一個沒有意義的數字：不知道它是一次的、
-- 一期的、還是整份完成才發的。所以兩欄的合法組合只有三種 ——
-- 都沒有、只有 payout type、兩個都有且價格為正。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_policy_evidence_shape;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_policy_evidence_shape
  CHECK (
    policy_session_coin_reference IS NULL
    OR (policy_payout_type IS NOT NULL AND policy_session_coin_reference > 0)
  );


-- ── 3. append-only ────────────────────────────────────────────────────────
--
-- policy evidence 是 Plan Version 的內容。建版之後原地改它，等於改掉
-- 「當時的政策憑什麼算出這個數字」—— 而 A4A 的 freshness 比對正是拿
-- 現在的 evaluator 跟這一欄對帳。可以原地改的話，那個比對就沒有意義了。
--
-- 政策後來變了要走 POLICY_CHANGED，不是回頭修這一列。

CREATE OR REPLACE FUNCTION public.child_proposal_plan_version_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
    OR NEW.version_no IS DISTINCT FROM OLD.version_no
    OR NEW.authored_by IS DISTINCT FROM OLD.authored_by
    OR NEW.plan_title IS DISTINCT FROM OLD.plan_title
    OR NEW.plan_summary IS DISTINCT FROM OLD.plan_summary
    OR NEW.purpose_category IS DISTINCT FROM OLD.purpose_category
    OR NEW.completion_description IS DISTINCT FROM OLD.completion_description
    OR NEW.progress_model IS DISTINCT FROM OLD.progress_model
    OR NEW.next_step IS DISTINCT FROM OLD.next_step
    OR NEW.cadence_mode IS DISTINCT FROM OLD.cadence_mode
    OR NEW.cadence_weekly_frequency IS DISTINCT FROM OLD.cadence_weekly_frequency
    OR NEW.cadence_days IS DISTINCT FROM OLD.cadence_days
    OR NEW.preferred_time IS DISTINCT FROM OLD.preferred_time
    OR NEW.preferred_time_custom IS DISTINCT FROM OLD.preferred_time_custom
    OR NEW.estimated_minutes IS DISTINCT FROM OLD.estimated_minutes
    OR NEW.duration_type IS DISTINCT FROM OLD.duration_type
    OR NEW.duration_days IS DISTINCT FROM OLD.duration_days
    OR NEW.reward_policy IS DISTINCT FROM OLD.reward_policy
    OR NEW.ai_snapshot IS DISTINCT FROM OLD.ai_snapshot
    OR NEW.ai_suggested_coin_amount IS DISTINCT FROM OLD.ai_suggested_coin_amount
    OR NEW.adopted_from_plan_version_id IS DISTINCT FROM OLD.adopted_from_plan_version_id
    OR NEW.requires_child_review IS DISTINCT FROM OLD.requires_child_review
    -- P1-A3：planning lineage 與 canonical child plan 一樣是內容，不是生命週期。
    -- 尤其 child_confirmed_plan —— 它是孩子點頭的那一份，改它等於改他同意的東西。
    OR NEW.source_planning_session_id IS DISTINCT FROM OLD.source_planning_session_id
    OR NEW.planning_schema_version IS DISTINCT FROM OLD.planning_schema_version
    OR NEW.child_confirmed_plan IS DISTINCT FROM OLD.child_confirmed_plan
    OR NEW.requires_parent_decision IS DISTINCT FROM OLD.requires_parent_decision
    OR NEW.enrichment_status IS DISTINCT FROM OLD.enrichment_status
    -- P1-A4A.1：policy evidence 是內容。改它等於改掉 freshness 比對的對象。
    OR NEW.policy_session_coin_reference IS DISTINCT FROM OLD.policy_session_coin_reference
    OR NEW.policy_payout_type IS DISTINCT FROM OLD.policy_payout_type THEN
    RAISE EXCEPTION
      'plan version immutable content or lineage cannot be changed (version %)', OLD.id
      USING ERRCODE = '23514';
  END IF;

  -- Lifecycle fields effective_at, child_accepted_at, and parent_confirmed_at
  -- retain their existing legal transition paths. Confirmed reward evidence is
  -- write-once: transition may fill it while confirmed_at is NULL, never later.
  IF OLD.confirmed_at IS NOT NULL AND (
       NEW.confirmed_at                    IS DISTINCT FROM OLD.confirmed_at
    OR NEW.confirmed_reward_policy         IS DISTINCT FROM OLD.confirmed_reward_policy
    OR NEW.confirmed_coin_amount           IS DISTINCT FROM OLD.confirmed_coin_amount
    OR NEW.confirmed_payout_basis          IS DISTINCT FROM OLD.confirmed_payout_basis
    OR NEW.confirmed_claim_period          IS DISTINCT FROM OLD.confirmed_claim_period
    OR NEW.confirmed_max_claims_per_period IS DISTINCT FROM OLD.confirmed_max_claims_per_period
    OR NEW.confirmed_reward_policy_version IS DISTINCT FROM OLD.confirmed_reward_policy_version
    OR NEW.confirmed_task_policy_version   IS DISTINCT FROM OLD.confirmed_task_policy_version
    OR NEW.confirmed_source_task_id        IS DISTINCT FROM OLD.confirmed_source_task_id
    OR NEW.confirmed_by_user_id            IS DISTINCT FROM OLD.confirmed_by_user_id
  ) THEN
    RAISE EXCEPTION
      'confirmed reward evidence is write-once (version %)', OLD.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;


-- ── 4. A3 bridge：policy evidence 改成 canonical write ────────────────────
--
-- 與 20260825 的差別只有一處：enrichment 的 reward 區塊多收兩個
-- deterministic 欄位，並寫進上面那兩個正式欄位。
--
-- 收不到、或收到的結算語意目前不支援 → **兩欄都留 NULL，而且把
-- reward 列進 requires_parent_decision。不猜。**
--
-- 「猜」在這裡會長成這樣：payoutType 是 per_milestone，但目前只有
-- per_completion 有結算路徑，於是有人把 session 價直接當成里程碑價寫進去。
-- 家長會同意一個看起來很正常的數字，孩子會完成第一個里程碑，然後
-- 沒有任何人發幣 —— 因為那條結算路徑根本不存在。

CREATE OR REPLACE FUNCTION public.publish_child_confirmed_plan_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal_id uuid;
  v_session_id  uuid;
  v_proposal    child_proposals%ROWTYPE;
  v_session     child_goal_planning_sessions%ROWTYPE;
  v_existing    child_proposal_plan_versions%ROWTYPE;
  v_enrich      jsonb;
  v_plan        jsonb;
  v_progression text;
  v_outcome     text;
  v_summary     text;
  v_next_step   text;
  v_title       text;
  v_cadence     jsonb;
  v_cadence_mode text;
  v_weekly      smallint;
  v_days        integer[];
  v_minutes     integer;
  v_duration    text;
  v_duration_days integer;
  v_purpose     text;
  v_completion  text;
  v_progress    text;
  v_policy      text;
  v_eligibility text;
  v_policy_ver  text;
  v_task_ver    text;
  v_coin_ref    integer;
  v_payout      text;
  v_enriched    boolean;
  v_pending     text[] := ARRAY[]::text[];
  v_version_no  integer;
  v_version_id  uuid;
  v_now         timestamptz := now();
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本');
  END IF;

  -- ── 計畫本體不接受呼叫端傳值，一個字都不接受 ──────────────────────────
  --
  -- 與 add_child_proposal_plan_version_v1 擋 coinAmount 同一個作法：
  -- 有一個「看起來很方便」的鍵存在，遲早會有人用它送一份別的計畫進來。
  IF p_command ?| ARRAY[
       'plan', 'confirmedPlan', 'childConfirmedPlan',
       'planTitle', 'planSummary', 'nextStep', 'desiredOutcome', 'actionPlanSummary'
     ] THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'PLAN_NOT_CLIENT_SUPPLIED',
      'message', '正式計畫的內容由伺服器從孩子確認過的對話複製，不接受呼叫端傳入');
  END IF;

  v_enrich := p_command -> 'enrichment';
  IF v_enrich IS NOT NULL AND jsonb_typeof(v_enrich) <> 'object' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', 'enrichment 形狀不對');
  END IF;

  -- ── enrichment 只能補政策欄位，不可以覆蓋孩子 ─────────────────────────
  --
  -- P0 Plan Draft 也會產 planTitle / planSummary / nextStepSuggestion /
  -- 建議 cadence，而且它們常常「看起來更漂亮」。整包複製過來的話，
  -- 孩子確認的那份計畫會被一份他沒看過的東西取代。
  IF v_enrich IS NOT NULL AND v_enrich ?| ARRAY[
       'planTitle', 'planSummary', 'nextStep', 'nextStepSuggestion',
       'cadence', 'desiredOutcome', 'actionPlanSummary', 'currentFocus',
       'phases', 'targetValue', 'progressionKind', 'provenance'
     ] THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'ENRICHMENT_MAY_NOT_OVERRIDE_CHILD',
      'message', 'enrichment 只補 GrowBook 的政策欄位，不得覆蓋孩子確認過的計畫內容');
  END IF;

  -- 決定好的幣值一個都不收。這支不發幣，也不替家長先決定金額。
  --
  -- ⚠️ policy evidence（reward.sessionCoinReference / reward.payoutType）
  --    不在這個清單裡，而且是刻意的。兩者語意差得很遠：
  --
  --      參考價     既有規則引擎對「這樣一次投入值多少」的判定
  --      確認的幣值 家長同意之後真的會發的錢（在 confirmed_coin_amount）
  --
  --    前者是這份計畫的政策證據，後者是一筆承諾。這支只寫前者。
  --    頂層的 payoutType 仍然擋掉：evidence 只能從 reward 區塊進來，
  --    才不會有兩個地方各自說一次結算方式。
  IF p_command ?| ARRAY['coinAmount', 'confirmedReward']
    OR (v_enrich IS NOT NULL AND v_enrich ?| ARRAY[
         'coinAmount', 'finalAmount', 'confirmedCoinAmount', 'aiSuggestedCoinAmount',
         'payoutType', 'payoutBasis'
       ]) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'REWARD_NOT_CLIENT_DECIDED',
      'message', '這一步不決定幣值與結算方式');
  END IF;

  v_proposal_id := NULLIF(p_command ->> 'proposalId', '')::uuid;
  v_session_id  := NULLIF(p_command ->> 'sessionId', '')::uuid;
  IF v_proposal_id IS NULL OR v_session_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId 或 sessionId');
  END IF;

  -- 先鎖提案再鎖對話。順序與 submit_child_proposal_without_planning_v1
  -- 一致，兩支才不會互鎖。
  SELECT * INTO v_proposal FROM child_proposals WHERE id = v_proposal_id FOR UPDATE;
  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: proposal % is not visible to the caller', v_proposal_id
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

  SELECT * INTO v_session FROM child_goal_planning_sessions
   WHERE id = v_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: planning session is not visible to the caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_session.proposal_id IS DISTINCT FROM v_proposal_id THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'SESSION_PROPOSAL_MISMATCH',
      'message', '這場規劃對話不屬於這份提案');
  END IF;

  -- ── 冪等：在所有狀態檢查**之前** ──────────────────────────────────────
  --
  -- 「其實已經成功了，但回應掉了」的重試必須拿回原本那一版，
  -- 而不是撞到「提案已經是 proposed」然後看到紅字。
  SELECT * INTO v_existing FROM child_proposal_plan_versions
   WHERE source_planning_session_id = v_session_id;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'proposalId', v_existing.proposal_id,
      'sessionId', v_session_id,
      'planVersionId', v_existing.id,
      'versionNo', v_existing.version_no,
      'authoredBy', v_existing.authored_by,
      'proposalStatus', v_proposal.status,
      'requiresParentDecision', to_jsonb(v_existing.requires_parent_decision),
      'enrichmentStatus', v_existing.enrichment_status,
      'idempotentReplay', true);
  END IF;

  IF v_session.status <> 'child_confirmed' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'PLANNING_NOT_CONFIRMED',
      'message', format('這場對話目前是 %s，還沒有孩子確認過的計畫', v_session.status));
  END IF;

  IF v_proposal.status <> 'draft' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'ILLEGAL_TRANSITION',
      'message', format('提案目前是 %s，不能再送出', v_proposal.status));
  END IF;

  -- ── server-side copy ──────────────────────────────────────────────────
  v_plan := v_session.confirmed_plan;
  IF v_plan IS NULL OR jsonb_typeof(v_plan) <> 'object' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'NO_CONFIRMED_PLAN',
      'message', '這場對話裡沒有已確認的計畫');
  END IF;

  v_progression := v_plan ->> 'progressionKind';
  IF v_progression IS NULL OR v_progression NOT IN ('rhythm', 'staged', 'accumulation') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'INVALID_CONFIRMED_PLAN',
      'message', format('未知的前進方式：%s', COALESCE(v_progression, 'null')));
  END IF;

  -- ── 孩子擁有的欄位 ────────────────────────────────────────────────────
  --
  -- plan_title 只做 presentation normalization（去頭尾空白）。
  --
  -- **不重新替孩子命名目標** —— 「國文考 100 分」不會變成
  -- 「每天複習國文」，那是換掉他的目標，不是整理。
  --
  -- 也不截斷：desiredOutcome 在契約上已經有 40 字上限，而中文截字會
  -- 從中間切開一個詞（「暑假前把第三冊練完」→「暑假前把第三」），
  -- 那是改意義，不是排版。要縮的是畫面，不是資料。
  v_outcome := NULLIF(btrim(v_plan ->> 'desiredOutcome'), '');
  IF v_outcome IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'INVALID_CONFIRMED_PLAN',
      'message', '確認過的計畫沒有目標');
  END IF;
  v_title := v_outcome;

  v_summary := NULLIF(btrim(v_plan ->> 'actionPlanSummary'), '');

  -- next_step 的內容規則（結果導向、系統語言、長度）在孩子看到這份計畫
  -- **之前**就跑過了：planGuards 對 nextAction 走的是既有的
  -- validateNextStep，過不了的計畫根本不會變成 ready，也就不可能被確認。
  -- 這裡只做長度與空值的防線，不重寫一套關鍵字清單 —— 兩份清單一定會分岔。
  v_next_step := NULLIF(btrim(v_plan -> 'nextAction' ->> 'text'), '');
  IF v_next_step IS NOT NULL AND char_length(v_next_step) > 40 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'INVALID_CONFIRMED_PLAN',
      'message', '下一步過長');
  END IF;

  -- ── 節奏：孩子 > 孩子原提案 > 未決定 ─────────────────────────────────
  --
  -- ⚠️ **「計畫裡有節奏」不等於「孩子決定了節奏」。**
  --
  --   模型在孩子沒表態時仍然可以提一個節奏（契約允許，provenance 會標成
  --   ai_suggested）。孩子按下確認是同意「這份計畫的方向」，不是逐欄
  --   拍板每一個細節 —— 把 ai_suggested 的節奏直接寫進正式欄位，
  --   家長看到的會是一句「孩子想一週三次」，而他從來沒這樣說過。
  --
  --   所以判準是 provenance，不是「這一欄有沒有值」。孩子自己講的
  --   （child_stated）與從他的話直接推導的（derived_from_child）才算數；
  --   ai_suggested 一律退回下一順位。這與契約裡的 EVIDENCE_PRIORITY
  --   是同一條規則，只是執法點搬到了正式版本這一層。
  IF v_progression = 'rhythm'
    AND jsonb_typeof(v_plan -> 'cadence') = 'object'
    AND (v_plan -> 'provenance' -> 'fields' ->> 'cadence')
        IN ('child_stated', 'derived_from_child') THEN
    v_cadence := v_plan -> 'cadence';
    v_cadence_mode := NULLIF(btrim(v_cadence ->> 'mode'), '');
    v_weekly := NULLIF(btrim(COALESCE(v_cadence ->> 'weeklyFrequency', '')), '')::smallint;
    SELECT array_agg(value::int ORDER BY value::int) INTO v_days
      FROM jsonb_array_elements_text(COALESCE(v_cadence -> 'days', '[]'::jsonb));
  END IF;

  IF v_cadence_mode IS NULL AND v_proposal.cadence_mode IS NOT NULL
    AND v_proposal.cadence_mode <> 'plan_schedule' THEN
    v_cadence_mode := v_proposal.cadence_mode;
    v_weekly := v_proposal.cadence_weekly_frequency;
    v_days := v_proposal.cadence_days;
  END IF;

  IF v_cadence_mode IS NOT NULL
    AND v_cadence_mode NOT IN ('one_time', 'fixed_days', 'weekly_frequency') THEN
    v_cadence_mode := NULL;
    v_weekly := NULL;
    v_days := NULL;
  END IF;

  -- 「一週 N 次」沒有星期幾。兩種語意混在一起時丟掉 days，不是丟掉 mode。
  IF v_cadence_mode = 'weekly_frequency' THEN v_days := NULL; END IF;

  -- ── 單次份量：孩子講過就照他的 ───────────────────────────────────────
  --
  -- 同樣看 provenance，理由與節奏完全一樣：模型估的「每次 20 分鐘」
  -- 不是孩子的約定。它退回 enrichment（那是 GrowBook 政策層估的投入量，
  -- 而且會被記在 requires_parent_decision 之外的正式欄位裡）。
  IF (v_plan -> 'sessionSize' ->> 'kind') = 'minutes'
    AND (v_plan -> 'provenance' -> 'fields' ->> 'sessionSize')
        IN ('child_stated', 'derived_from_child') THEN
    v_minutes := NULLIF(btrim(v_plan -> 'sessionSize' ->> 'minutes'), '')::integer;
  END IF;

  -- ── GrowBook enrichment（政策層）─────────────────────────────────────
  v_purpose    := NULLIF(btrim(COALESCE(v_enrich ->> 'purposeCategory', '')), '');
  v_completion := NULLIF(btrim(COALESCE(v_enrich ->> 'completionDescription', '')), '');
  v_duration   := NULLIF(btrim(COALESCE(v_enrich ->> 'durationType', '')), '');
  v_duration_days := NULLIF(btrim(COALESCE(v_enrich ->> 'durationDays', '')), '')::integer;
  v_policy     := NULLIF(btrim(COALESCE(v_enrich -> 'reward' ->> 'policy', '')), '');
  v_eligibility := COALESCE(
    NULLIF(btrim(COALESCE(v_enrich -> 'reward' ->> 'eligibility', '')), ''), 'not_evaluated');
  v_policy_ver := NULLIF(btrim(COALESCE(v_enrich -> 'reward' ->> 'policyVersion', '')), '');
  v_task_ver   := NULLIF(btrim(COALESCE(v_enrich ->> 'taskPolicyVersion', '')), '');

  IF v_minutes IS NULL THEN
    v_minutes := NULLIF(btrim(COALESCE(v_enrich ->> 'estimatedMinutes', '')), '')::integer;
  END IF;

  IF v_purpose IS NOT NULL AND v_purpose NOT IN ('A', 'B', 'C', 'D') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('未知的任務目的分類：%s', v_purpose));
  END IF;

  IF v_duration IS NOT NULL AND v_duration NOT IN ('one_time', 'recurring', 'long_term') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('未知的執行期間：%s', v_duration));
  END IF;

  -- 判定一定要有依據的政策版本，否則整欄退回 not_evaluated。
  IF v_eligibility <> 'not_evaluated' AND v_policy_ver IS NULL THEN
    v_eligibility := 'not_evaluated';
    v_policy := NULL;
  END IF;

  v_enriched := v_purpose IS NOT NULL;

  -- ── policy evidence ──────────────────────────────────────────────────
  --
  -- 這兩欄是這份正式計畫的 deterministic policy evidence：既有的
  -- rewardEligibility → coinPolicy 規則鏈當時算出的一次投入參考價，
  -- 與當時政策支援的結算語意。**不是孩子決定的、不是模型寫的、
  -- 也不是最終會發的金額**（那一個在 confirmed_coin_amount）。
  --
  -- 只有真的可以發幣的計畫才有參考價可言。不發幣的留兩個 NULL ——
  -- 一個沒有人會付的數字放在正式欄位上，遲早會被誰讀去用。
  --
  -- payoutType 只認 per_completion，而且**不從 progressionKind 推導**：
  -- staged 不是 per_milestone、accumulation 不是 final_completion。
  -- 那兩種結算方式現在沒有實作，猜一個寫進去只會讓一份沒有結算路徑的
  -- 計畫看起來完全正常 —— 直到孩子完成第一個里程碑、而沒有人發幣。
  v_payout := NULL;
  v_coin_ref := NULL;
  IF v_policy = 'coin_eligible' AND v_eligibility = 'allowed'
    AND NULLIF(btrim(COALESCE(v_enrich -> 'reward' ->> 'payoutType', '')), '')
        = 'per_completion' THEN
    v_payout := 'per_completion';
    v_coin_ref := NULLIF(btrim(COALESCE(
      v_enrich -> 'reward' ->> 'sessionCoinReference', '')), '')::integer;
    IF v_coin_ref IS NOT NULL AND v_coin_ref <= 0 THEN
      v_coin_ref := NULL;
    END IF;
  END IF;

  -- ── progression → progress_model ─────────────────────────────────────
  --
  -- ⚠️ **progressionKind 不是 progress_model。**
  --
  --   progress_model 目前只有一個合法值 weekly_rhythm，而它的語意是
  --   「本週 X / Y 次」。staged 的進度是「走到第幾階段」，accumulation 的
  --   進度是「5 本裡的第 2 本」—— 兩個都塞進 weekly_rhythm 的話，
  --   孩子的畫面會顯示一個沒有依據的週次數。
  --
  --   所以 staged 與 accumulation 一律 NULL，完整結構留在
  --   child_confirmed_plan。LongTerm UI 之後直接讀那份結構，
  --   不靠往 progress_model 裡亂塞值。
  v_progress := NULL;
  IF v_progression = 'rhythm'
    AND v_duration = 'long_term'
    AND v_cadence_mode IN ('weekly_frequency', 'fixed_days') THEN
    v_progress := 'weekly_rhythm';
  END IF;

  -- ── 還沒決定的共同條件 ───────────────────────────────────────────────
  --
  -- 這裡**不**捏資料。缺什麼就講缺什麼，Direct Confirm 暫時不能用是
  -- 可以接受的 —— 自己生一個 durationDays = 30 才是真的錯。
  -- array_append 而不是 `||`：後者對 text[] || 'literal' 是有歧義的，
  -- Postgres 會挑 anyarray || anyarray 那個 overload，然後試著把
  -- 'cadence' 解析成一個 array literal 並丟 22P02。
  -- （staging acceptance 抓到的 —— 第一個案例剛好每一欄都有值，
  --   一個分支都沒走到，所以本機測試全綠。）
  IF v_cadence_mode IS NULL THEN v_pending := array_append(v_pending, 'cadence'); END IF;
  IF v_minutes IS NULL THEN v_pending := array_append(v_pending, 'session_size'); END IF;
  IF v_duration IS NULL THEN v_pending := array_append(v_pending, 'duration'); END IF;
  IF v_purpose IS NULL THEN v_pending := array_append(v_pending, 'purpose_category'); END IF;
  -- 可以發幣、卻算不出正式的參考價（或結算語意目前不支援）時，
  -- 「怎麼給回饋」就是還沒說定的共同條件。
  --
  -- 這比讓計畫看起來完整、等家長按下確認才回 POLICY_CHANGED 誠實：
  -- 那個訊息會讓家長以為是自己太慢，其實這份計畫從一開始就沒有
  -- 可用的回饋依據。
  IF v_eligibility <> 'allowed' OR v_policy IS NULL
    OR (v_policy = 'coin_eligible' AND v_coin_ref IS NULL) THEN
    v_pending := array_append(v_pending, 'reward');
  END IF;

  SELECT COALESCE(MAX(v.version_no), 0) + 1 INTO v_version_no
    FROM child_proposal_plan_versions v WHERE v.proposal_id = v_proposal_id;

  INSERT INTO child_proposal_plan_versions (
    proposal_id, version_no, authored_by, author_user_id,
    plan_title, plan_summary,
    purpose_category, completion_description, progress_model, next_step,
    cadence_mode, cadence_weekly_frequency, cadence_days,
    preferred_time, preferred_time_custom, estimated_minutes,
    duration_type, duration_days,
    reward_policy, reward_eligibility, reward_policy_version, task_policy_version,
    policy_session_coin_reference, policy_payout_type,
    ai_snapshot, ai_model,
    source_planning_session_id, planning_schema_version, child_confirmed_plan,
    requires_parent_decision, enrichment_status,
    requires_child_review,
    -- effective_at / parent_confirmed_at 一律 NULL。
    --
    -- effective_at IS NOT NULL 在 P0-8 的調整路徑上等於「這是已經生效的
    -- 家庭共同版本」。家長還沒確認就填它，等於讓一份沒有人同意過的計畫
    -- 出現在共同版本的調整流程裡。
    effective_at, parent_confirmed_at
  ) VALUES (
    v_proposal_id, v_version_no, 'child', auth.uid(),
    v_title, v_summary,
    v_purpose, v_completion, v_progress, v_next_step,
    v_cadence_mode, v_weekly, v_days,
    v_proposal.preferred_time, v_proposal.preferred_time_custom, v_minutes,
    v_duration, v_duration_days,
    v_policy, v_eligibility, v_policy_ver, v_task_ver,
    v_coin_ref, v_payout,
    v_enrich -> 'aiSnapshot', NULLIF(btrim(COALESCE(v_enrich ->> 'aiModel', '')), ''),
    v_session_id, v_session.schema_version, v_plan,
    v_pending, CASE WHEN v_enriched THEN 'enriched' ELSE 'unavailable' END,
    false,
    NULL, NULL
  )
  RETURNING id INTO v_version_id;

  UPDATE child_proposals
     SET current_plan_version_id = v_version_id,
         status      = 'proposed',
         proposed_at = COALESCE(proposed_at, v_now)
   WHERE id = v_proposal_id;

  INSERT INTO child_proposal_status_events
    (proposal_id, from_status, to_status, actor_role, actor_user_id, plan_version_id, reason)
  VALUES
    (v_proposal_id, 'draft', 'proposed', 'child', auth.uid(), v_version_id,
     NULLIF(btrim(COALESCE(p_command ->> 'reason', '')), ''));

  RETURN jsonb_build_object(
    'ok', true,
    'proposalId', v_proposal_id,
    'sessionId', v_session_id,
    'planVersionId', v_version_id,
    'versionNo', v_version_no,
    'authoredBy', 'child',
    'proposalStatus', 'proposed',
    'requiresParentDecision', to_jsonb(v_pending),
    'enrichmentStatus', CASE WHEN v_enriched THEN 'enriched' ELSE 'unavailable' END,
    'idempotentReplay', false);
END;
$$;

COMMENT ON FUNCTION public.publish_child_confirmed_plan_v1(jsonb) IS
  'P1-A3：孩子確認過的規劃 → child-authored 正式 Plan Version ＋ draft → proposed。'
  '計畫內容由伺服器從 session.confirmed_plan 複製；不建任務、不發幣、不碰 payout。'
  'P1-A4A.1：deterministic policy evidence 寫進正式欄位，不再只留在 ai_snapshot。';


-- ── 5. A4A：改讀正式欄位 ─────────────────────────────────────────────────
--
-- 與 20260826 的差別只有三處：
--
--   · 錨點改讀 policy_session_coin_reference / policy_payout_type
--   · 共同約定版本一併複製這兩欄
--   · 事後驗證多比對這兩欄
--
-- ai_snapshot 從此不出現在任何決策條件裡。**snapshot = NULL 的計畫
-- 只要正式欄位齊、freshness 過，就必須可以確認** —— 稽核證據存不存在
-- 不該決定一個家庭能不能開始執行他們的約定。

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

COMMENT ON FUNCTION public.confirm_child_planning_proposal_v1(jsonb) IS
  'P1-A4A：家長同意孩子已經確認且完整的計畫 → 家庭共同約定版本 ＋ 正式任務。'
  'confirm_child_proposal_v1 的 sibling（那一支只收 AI-authored，一個字都沒改）。'
  '共同條件未決定一律 SHARED_DECISION_REQUIRED，不自動補值。'
  'P1-A4A.1：幣值錨點改讀 policy_* 正式欄位，決策路徑不再依賴 ai_snapshot。';


-- ── 6. 權限 ───────────────────────────────────────────────────────────────
--
-- 這一包沒有建新表，但把同一組授權再寫一次是刻意的（P1-A2.5 staging
-- 抓到的缺口就是「以為前一支已經收好了」）。

REVOKE ALL ON child_proposal_plan_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON child_proposal_plan_versions TO authenticated;

REVOKE ALL ON FUNCTION public.publish_child_confirmed_plan_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_child_confirmed_plan_v1(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.confirm_child_planning_proposal_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_child_planning_proposal_v1(jsonb) TO authenticated;
