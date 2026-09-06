-- ═══════════════════════════════════════════════════════════════════════════
-- P1-A1 §2｜期限由孩子決定 —— RPC 端
--
-- ─────────────────────────────────────────────────────────────────────────
-- 「把哈利波特讀完」有終點，但孩子不會主動說「兩週」。durationDays 是 null
-- → duration_type='recurring' → is_long_term=false → 建出來是日常任務。
--
-- §1（契約層，已完成於 a3446d5）讓孩子在 needs_duration 那一輪自己選期限。
-- 這一支讓 RPC 採用他選的答案。
--
--   { kind: 'days', days: N }  → long_term ＋ N 天
--   { kind: 'open_ended' }     → recurring ＋ 沒有天數
--
-- ── 這一支做兩件事 ──────────────────────────────────────────────────────
--
--   1. publish_child_confirmed_plan_v1：期限改讀 child_confirmed_plan 的
--      goalDuration，停止採用 enrichment 的 durationType / durationDays。
--   2. record_child_goal_planning_round_v1：status 白名單收 needs_duration，
--      否則那一輪根本記不起來，整條路徑走不到 ready。
--
-- ── ⚠️ 基準檔 ───────────────────────────────────────────────────────────
--
-- publish 的函式本體從 **20260906000000_weekly_rhythm_recurring.sql:47-485**
-- 逐字複製，**不是**從 20260828000000:79-516。
--
-- CREATE OR REPLACE 是全體置換，而 migration 依檔名順序套用 —— 這一支排在
-- 20260906 之後，從舊版複製會把 §3 的 weekly_rhythm 修正**靜默蓋掉**。
-- 那是資料庫端行為，本機 jest 測不出來，childGoalPlanningParity 也擋不住。
-- childGoalDurationMigration.test.ts 用「本體裡有沒有 v_duration <> 'one_time'」
-- 把這件事釘住。
--
-- record 的本體從 20260823000000:114-236 逐字複製（沒有更新的定義）。
--
-- ── 明確不做的事 ────────────────────────────────────────────────────────
--
--   * 不 backfill。既有的 child_confirmed_plan 沒有 goalDuration，
--     一律拒絕發布（§5），要求重跑規劃。目前沒有真實使用者資料。
--   * 不動 propose_child_planning_terms_v1（20260906:500-1077）。
--   * 不動 resolveDurationType —— 它繼續服務 P0 那條鏈。
--   * 不 bump planning_schema_version。那是另一個決定，見交接說明。
--
-- 冪等：兩支都是 CREATE OR REPLACE，可重跑。
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;


-- ── 1. publish_child_confirmed_plan_v1 ───────────────────────────────────

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
  v_goal_duration jsonb;
  v_goal_duration_kind text;
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
  -- ── 期限：由孩子決定，不採用 enrichment 的判斷（P1-A1 §2）────────────
  --
  -- enrichment 的 durationType 走的是 P0 plan draft 那條鏈，而那條鏈的輸入
  -- 只有孩子最初打的那段話 —— 他沒講「兩週」就一律 recurring，於是
  -- is_long_term = false，一個有終點的目標被建成日常任務。
  --
  -- 期限現在走 planning 契約：孩子在 needs_duration 那一輪自己選，而且
  -- 每一個選項都帶著他看得到的天數。**這一層不推導、不補值，只讀他選的。**
  v_goal_duration := v_plan -> 'goalDuration';
  IF jsonb_typeof(v_goal_duration) <> 'object' THEN
    -- §5：舊的 child_confirmed_plan 沒有這一欄，一律不放行。不做相容分支 ——
    -- 有的話「這份計畫的期限是誰決定的」之後永遠會有兩個答案。
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'GOAL_DURATION_MISSING',
      'message', '這份計畫還沒有決定要花多久，請重新規劃一次。');
  END IF;

  v_goal_duration_kind := v_goal_duration ->> 'kind';
  IF v_goal_duration_kind = 'open_ended' THEN
    -- 「這件事沒有終點，我想一直做下去」是**孩子的判斷**，不是算不出天數
    -- 的預設值。所以它進 recurring，而且沒有天數可寫。
    v_duration := 'recurring';
    v_duration_days := NULL;
  ELSIF v_goal_duration_kind = 'days' THEN
    IF jsonb_typeof(v_goal_duration -> 'days') <> 'number'
      OR (v_goal_duration ->> 'days') !~ '^[0-9]+$' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'GOAL_DURATION_INVALID',
        'message', format('看不懂的期限：%s', v_goal_duration ->> 'days'));
    END IF;
    v_duration_days := (v_goal_duration ->> 'days')::integer;
    -- 1-180 與家長透過共同條件設定期限時的檢查同一組值。孩子若能選 300 天，
    -- 家長之後想調整會被自己的 RPC 擋下來，變成一個建得起來但改不動的值。
    --
    -- 超出範圍**擋下，不收斂到邊界** —— 把 200 悄悄改成 180，就是讓孩子
    -- 確認一個他沒說過的期限。
    IF v_duration_days NOT BETWEEN 1 AND 180 THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'GOAL_DURATION_OUT_OF_RANGE',
        'message', format('期限要在 1-180 天之間，收到 %s', v_duration_days));
    END IF;
    v_duration := 'long_term';
  ELSE
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'GOAL_DURATION_INVALID',
      'message', format('看不懂的期限形式：%s', COALESCE(v_goal_duration_kind, 'null')));
  END IF;
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
    AND v_duration IS NOT NULL
    AND v_duration <> 'one_time'
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
  -- 'duration' 講的是「先試多久」這個 trial window，不是 duration_type。
  -- duration_type 是系統判定（家長不選、也猜不出來）；長期計畫沒有天數
  -- 一樣是沒說定 —— 那種計畫在 A4A 會被擋下，而未決集合是空的話，
  -- 家長端連要補什麼都看不到，變成一個沒有出口的死角。
  IF public.child_planning_pending_duration(v_duration, v_duration_days) THEN
    v_pending := array_append(v_pending, 'duration');
  END IF;
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
  'P1-A1 §2：duration_type / duration_days 由 child_confirmed_plan.goalDuration 決定，'
  '不再採用 enrichment 的判斷 —— 那條鏈的輸入只有孩子最初打的那段話，'
  '他沒講期間就一律 recurring，有終點的目標會被建成日常任務。'
  '沒有 goalDuration 的舊計畫一律拒絕發布，不補預設值。';


-- ── 2. record_child_goal_planning_round_v1 ───────────────────────────────
--
-- needs_duration 在其餘邏輯上與 needs_clarification / needs_choice 同一類：
-- 消耗一輪、session 留在 in_progress。只有白名單需要放它進來。

CREATE OR REPLACE FUNCTION public.record_child_goal_planning_round_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session    child_goal_planning_sessions%ROWTYPE;
  v_proposal   child_proposals%ROWTYPE;
  v_expected   integer;
  v_response   jsonb;
  v_result     jsonb;
  v_status     text;
  v_failed     boolean;
  v_context    jsonb;
  v_rounds     smallint;
  v_attempts   smallint;
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本');
  END IF;

  SELECT * INTO v_session FROM child_goal_planning_sessions
   WHERE id = NULLIF(p_command ->> 'sessionId', '')::uuid
   FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: planning session is not visible to the caller'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_child_in_caller_family(v_session.child_id);

  IF NOT (p_command ? 'expectedRevision') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少 expectedRevision');
  END IF;
  v_expected := (p_command ->> 'expectedRevision')::integer;

  IF v_expected IS DISTINCT FROM v_session.revision THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'STALE_SESSION', 'reason', 'REVISION_MISMATCH',
      'revision', v_session.revision,
      'message', '這場對話已經往前走了，這一次的結果不採用');
  END IF;

  IF v_session.status = 'child_confirmed' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'SESSION_CONFIRMED',
      'message', '孩子已經確認過了，這場對話結束了');
  END IF;

  IF v_session.status = 'abandoned' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'SESSION_ABANDONED',
      'message', '這場對話已經結束了，想法已經送給爸媽');
  END IF;

  SELECT * INTO v_proposal FROM child_proposals WHERE id = v_session.proposal_id;
  IF v_proposal.status <> 'draft' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'PROPOSAL_NOT_DRAFT',
      'message', format('提案已經是 %s，不能再改規劃', v_proposal.status));
  END IF;

  v_result := p_command -> 'result';
  IF v_result IS NULL OR jsonb_typeof(v_result) <> 'object' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少 result');
  END IF;

  v_status := v_result ->> 'status';
  IF v_status IS NULL
    OR v_status NOT IN (
      'needs_clarification', 'needs_choice', 'needs_duration', 'ready', 'unavailable'
    ) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('未知的規劃結果狀態：%s', COALESCE(v_status, 'null')));
  END IF;

  v_failed := v_status = 'unavailable';

  IF NOT v_failed AND v_session.rounds_used >= public.child_goal_planning_max_rounds() THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'ROUND_LIMIT_REACHED',
      'message', '這場對話已經問夠多了');
  END IF;
  IF v_session.attempts_used >= public.child_goal_planning_max_attempts() THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'ATTEMPT_LIMIT_REACHED',
      'message', '這場對話已經試夠多次了');
  END IF;

  v_context := v_session.conversation_context;
  v_response := p_command -> 'childResponse';
  IF v_response IS NOT NULL AND jsonb_typeof(v_response) = 'object' THEN
    IF (v_response ->> 'type') NOT IN
       ('clarification_answer', 'choice_selection', 'custom_choice') THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED', 'message', '未知的孩子回應類型');
    END IF;
    v_context := v_context || jsonb_build_array(v_response);
  END IF;

  v_rounds   := v_session.rounds_used + (CASE WHEN v_failed THEN 0 ELSE 1 END);
  v_attempts := v_session.attempts_used + 1;

  UPDATE child_goal_planning_sessions
     SET conversation_context = v_context,
         latest_result        = v_result,
         rounds_used          = v_rounds,
         attempts_used        = v_attempts,
         status               = CASE WHEN v_status = 'ready' THEN 'ready' ELSE 'in_progress' END,
         revision             = v_session.revision + 1
   WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'ok', true, 'sessionId', v_session.id,
    'status', CASE WHEN v_status = 'ready' THEN 'ready' ELSE 'in_progress' END,
    'revision', v_session.revision + 1,
    'roundsUsed', v_rounds, 'attemptsUsed', v_attempts);
END;
$$;


COMMENT ON FUNCTION public.record_child_goal_planning_round_v1(jsonb) IS
  'P1-A2：記一輪規劃對話。P1-A1：status 白名單收 needs_duration —— '
  '期限那一輪與其他對話輪一樣消耗一輪，session 留在 in_progress。';


COMMIT;
