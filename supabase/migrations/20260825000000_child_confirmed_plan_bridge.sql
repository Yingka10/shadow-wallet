-- ═══════════════════════════════════════════════════════════════════════════
-- P1-A3 — 孩子確認過的規劃 → 正式 Plan Version
--
-- ─────────────────────────────────────────────────────────────────────────
-- 這支把 P1-A2 的終點接到 P0-1 的正式版本線上，而且**只接這一段**：
--
--     planning session (child_confirmed)
--         ↓  這支
--     formal plan version (authored_by = 'child')
--     proposal draft → proposed
--         ↓  STOP
--     P1-A4：家長確認語意（不在這支）
--
-- 三件事在這支裡是結構性的，不是靠呼叫端自律：
--
--   1. **正式計畫的「做法」作者是孩子。** authored_by = 'child'，而且
--      帶 planning lineage 的列在 CHECK 上寫不出別的作者。
--
--      目前 P0 Direct Confirm 硬性要求 current plan 是 authored_by='ai'，
--      所以這種版本送進去會被 PLAN_NOT_CONFIRMABLE 擋下 —— **那是對的**。
--      我們還沒有重新定義 Parent Confirmation 的語意（P1-A4），
--      在那之前用一個假的 authorship 繞過它，等於把「這是孩子想的」
--      這件事從資料裡抹掉，只為了讓一個還沒設計好的按鈕變成可按。
--
--   2. **計畫本體由 RPC 自己從 session 複製。** 命令裡出現任何一份計畫
--      文字都整筆拒絕 —— 呼叫端送得進來的話，家長看到的就不一定是
--      孩子點頭的那一份。與 confirm_child_goal_planning_session_v1
--      從 latest_result 複製、confirmed_reward 從 tasks 複製同一條原則。
--
--   3. **一場對話最多變成一個正式版本。** unique index，不是先查再寫。
--      重送是同一個版本，不是第二版。
--
-- ⚠️ 這支**不建立任務、不發幣、不寫錢包、不碰 payout**。
--    progressionKind（rhythm / staged / accumulation）與 payout type
--    之間**沒有**任何對應關係，這支裡一個字都沒有。
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Planning lineage ───────────────────────────────────────────────────
--
-- 最窄的一條線：這一版正式計畫，是從哪一場孩子確認過的對話來的。
--
-- ON DELETE SET NULL 而不是 RESTRICT：session 與 version 都掛在同一份
-- proposal 上、同時被 cascade 刪掉。RESTRICT 會讓刪除順序決定成不成功。

ALTER TABLE child_proposal_plan_versions
  ADD COLUMN IF NOT EXISTS source_planning_session_id uuid
    REFERENCES child_goal_planning_sessions(id) ON DELETE SET NULL;

-- ── 2. Canonical child plan ───────────────────────────────────────────────
--
-- 為什麼不能只靠既有的扁平欄位：
--
--   plan_title / plan_summary / progress_model / next_step 表達得了
--   「每週三次、每次 15 分鐘」，但表達不了
--
--     · staged 的階段與各自的可觀察完成條件
--     · accumulation 的 target value / unit
--     · goalControlType 與它底下的 controllableActions
--     · 逐欄的 provenance（這句是孩子講的？他選的？系統算的？）
--
--   把這些洗掉之後，「做一本漫畫」與「暑假讀五本書」在資料上會
--   長得一模一樣 —— 兩個都變成一句話加一個 null。
--
-- ⚠️ **這不是 ai_snapshot。** 兩欄語意必須分得開：
--
--     child_confirmed_plan  已驗證、孩子確認過、產品的 canonical data
--     ai_snapshot           某一次模型／enrichment 回了什麼的稽核證據
--
--   「AI snapshot 不能當 canonical source」這條原則完全沒有鬆動 ——
--   這一欄之所以是 canonical，正是因為它不是模型的輸出，而是
--   孩子在螢幕上看過並且點頭的那一份。

ALTER TABLE child_proposal_plan_versions
  ADD COLUMN IF NOT EXISTS planning_schema_version smallint;

ALTER TABLE child_proposal_plan_versions
  ADD COLUMN IF NOT EXISTS child_confirmed_plan jsonb;

-- ── 3. 還沒決定的共同條件 ─────────────────────────────────────────────────
--
-- P1-A3 **不要求**每一份正式計畫都立刻是 Direct Confirm-able。
--
-- 孩子可以很清楚地知道「先決定故事 → 畫角色 → 畫頁面」，同時完全沒有
-- 決定一週幾次、多久完成、有沒有幣。那份計畫仍然成立 —— 沒有決定的
-- 是**家庭共同條件**，而共同條件本來就不該由孩子一個人或 AI 決定。
--
-- 這一欄的存在是為了讓「還沒決定」有地方講。沒有它，唯一能讓計畫
-- 看起來完整的作法就是捏一個 durationDays = 30 出來。

ALTER TABLE child_proposal_plan_versions
  ADD COLUMN IF NOT EXISTS requires_parent_decision text[] NOT NULL DEFAULT '{}'::text[];

-- enrichment 掛掉不可以把孩子已經確認的提案永遠鎖在 draft，
-- 但也不可以假裝 enrichment 成功。所以狀態要寫下來。
ALTER TABLE child_proposal_plan_versions
  ADD COLUMN IF NOT EXISTS enrichment_status text;

COMMENT ON COLUMN child_proposal_plan_versions.child_confirmed_plan IS
  'P1 孩子確認過的 canonical 計畫（含 progression 結構與逐欄 provenance）。'
  '這是產品資料，不是稽核快照 —— 稽核快照在 ai_snapshot。';

COMMENT ON COLUMN child_proposal_plan_versions.requires_parent_decision IS
  '還沒決定、而且屬於家庭共同條件的欄位。空陣列不代表可以直接確認。';

COMMENT ON COLUMN child_proposal_plan_versions.enrichment_status IS
  'enriched = 政策欄位算完了；unavailable = 政策 helper 當時不可用，'
  '孩子的計畫照樣成立，缺的欄位列在 requires_parent_decision。';


-- ── 4. 形狀 CHECK ─────────────────────────────────────────────────────────

-- 四欄同進同出。只有 lineage 沒有計畫、或只有計畫沒有 lineage，
-- 兩種都是半套資料，而半套資料會在讀取端變成一堆 optional chaining。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_planning_shape;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_planning_shape
  CHECK (
    (source_planning_session_id IS NULL)
      = (child_confirmed_plan IS NULL)
    AND (source_planning_session_id IS NULL)
      = (planning_schema_version IS NULL)
    AND (source_planning_session_id IS NULL)
      = (enrichment_status IS NULL)
  );

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_planning_payload_object;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_planning_payload_object
  CHECK (child_confirmed_plan IS NULL OR jsonb_typeof(child_confirmed_plan) = 'object');

-- **正式計畫的做法作者是孩子。** 寫在 CHECK 而不是只寫在 RPC：
-- 之後任何一條路徑想用 authored_by='ai' 帶著 planning lineage 插一列，
-- 會在資料庫層就失敗。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_planning_authored_by_child;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_planning_authored_by_child
  CHECK (source_planning_session_id IS NULL OR authored_by = 'child');

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_enrichment_status_check;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_enrichment_status_check
  CHECK (enrichment_status IS NULL OR enrichment_status IN ('enriched', 'unavailable'));

-- 封閉列舉。自由字串會在半年後長出 'reward?' 與 'rewards' 兩個值。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_requires_parent_decision_check;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_requires_parent_decision_check
  CHECK (
    requires_parent_decision
      <@ ARRAY['cadence', 'session_size', 'duration', 'reward', 'purpose_category']::text[]
  );

-- 沒有 planning lineage 的版本（P0 的 ai / parent 版本）不該有這一欄的內容。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_requires_parent_decision_scope;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_requires_parent_decision_scope
  CHECK (
    source_planning_session_id IS NOT NULL
    OR cardinality(requires_parent_decision) = 0
  );


-- ── 5. 一場對話最多一個正式版本 ───────────────────────────────────────────
--
-- 重送 publish 不是第二版。用 unique index 而不是「先查再寫」的理由與
-- P1-A2 的 one_active_idx 一樣：兩個裝置同時按下去時，先查再寫會兩個都過。

CREATE UNIQUE INDEX IF NOT EXISTS child_proposal_plan_versions_planning_source_unique
  ON child_proposal_plan_versions (source_planning_session_id)
  WHERE source_planning_session_id IS NOT NULL;


-- ── 6. 新欄位一併納入 append-only ─────────────────────────────────────────
--
-- P0-5B staging 那次的教訓：新增結構化內容欄位而忘了加進 guard，
-- 等於開了一條「改內容不必新增版本」的後門。

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
    OR NEW.enrichment_status IS DISTINCT FROM OLD.enrichment_status THEN
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


-- ── 7. Bridge RPC ─────────────────────────────────────────────────────────
--
-- 一個交易裡做完：鎖提案 → 鎖對話 → 驗證 → server-side 複製計畫 →
-- 建 child-authored 正式版本 → 指定 current → draft 轉 proposed →
-- 寫狀態事件。任何一步失敗整筆 rollback。
--
-- 拆成兩次 App 呼叫的話，中間斷掉會留下「有正式版本但提案還在 draft」
-- 或「提案送出了但沒有計畫」—— 而那兩步之間正好是孩子按下按鈕、
-- 畫面在轉圈的那一刻。

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

  -- 幣值一個都不收。這支不發幣，也不替家長先決定金額。
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
  IF v_eligibility <> 'allowed' OR v_policy IS NULL THEN
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
  '計畫內容由伺服器從 session.confirmed_plan 複製；不建任務、不發幣、不碰 payout。';


-- ── 8. 權限 ───────────────────────────────────────────────────────────────
--
-- P1-A2.5 staging 抓到的缺口是「建表時忘了收回 public schema 的預設授權」。
-- 這支沒有建新表，但把同一組授權再寫一次是刻意的：讀這支的人不必翻回
-- 20260810 才知道這張表的寫入只能走 RPC。

REVOKE ALL ON child_proposal_plan_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON child_proposal_plan_versions TO authenticated;

REVOKE ALL ON FUNCTION public.publish_child_confirmed_plan_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_child_confirmed_plan_v1(jsonb) TO authenticated;
