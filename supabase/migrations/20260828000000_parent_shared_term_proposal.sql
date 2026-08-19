-- ═══════════════════════════════════════════════════════════════════════════
-- P1-A4B1 — 家長提出家庭共同條件（不直接生效）
--
-- ─────────────────────────────────────────────────────────────────────────
-- 產品語意不是「家長修改孩子的計畫」，而是：
--
--     你想怎麼做到的那一段我保留；
--     這幾個需要家庭一起配合的條件，我想這樣安排，你再看看可不可以。
--
-- 所以這一支的終點是 needs_child_review，**不是** active：
-- 不建任務、不發幣、不寫 confirmed reward。
--
-- ⚠️ 這支是 revise_child_proposal_plan_v1 的 **sibling**。那一支的來源是
--    authored_by ∈ (ai, parent)，服務的是 P0 的世界（material edit 的定義、
--    completion_description 可改、reward 語意都不一樣）。
--    **這支 migration 一個字都沒有動它。**
--
-- ⚠️ 家長能碰的只有家庭共同條件：節奏、時段、每次多久、先試多久、
--    怎麼給回饋。孩子擁有的欄位（目標、做法、下一步、progression 結構）
--    連在命令型別上都不存在；真的送進來一律整筆拒絕，不是忽略。
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. 未決條件可以跟著共同版本走 ────────────────────────────────────────
--
-- 既有的 scope CHECK 是「沒有 planning lineage 的列不准帶 requires_parent_decision」，
-- 用意是不要讓 P0 的 ai / parent 版本長出 P1 的未決集合。
--
-- 但 P1 的家長草案**必須**帶著它：家長這一輪只處理了 cadence 與 duration，
-- reward 仍然沒說定 —— 一按「送給孩子看看」就把未決集合清空，等於宣稱
-- 一件從來沒有人決定的事已經決定了。
--
-- 家長草案一定有 adoption lineage（它是從某一版採過來的），所以放寬到
-- 「有 planning lineage，或有 adoption lineage」剛好涵蓋它，而 P0 legacy
-- 的路徑從來不寫這一欄（預設 '{}'），行為不變。

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_requires_parent_decision_scope;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_requires_parent_decision_scope
  CHECK (
    source_planning_session_id IS NOT NULL
    OR adopted_from_plan_version_id IS NOT NULL
    OR cardinality(requires_parent_decision) = 0
  );


-- ── 2. A3：先試多久沒決定，就要說出來 ────────────────────────────────────
--
-- 原本 'duration' 只在 duration_type 為 NULL 時進未決集合。但 duration_type
-- 是**系統判定**（家長不選、也猜不出來，見 §3 的 audit），真正需要家庭
-- 一起說定的是「先試多久」這個 trial window。
--
-- 而 long_term 沒有天數的計畫在 A4A 會被擋下（系統欄位不齊），卻因為未決
-- 集合是空的，家長端連要補什麼都看不到 —— 一個沒有出口的死角。
--
-- 這裡只改判斷條件，不改任何既有欄位的語意。

CREATE OR REPLACE FUNCTION public.child_planning_pending_duration(
  p_duration_type text, p_duration_days integer
) RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_duration_type IS NULL
      OR (p_duration_type = 'long_term'
          AND (p_duration_days IS NULL OR p_duration_days <= 0));
$$;

COMMENT ON FUNCTION public.child_planning_pending_duration(text, integer) IS
  'P1：「先試多久」還沒說定嗎。長期計畫沒有天數也算沒說定 —— '
  '那種計畫在家長端會卡住，而未決集合是空的話家長看不到要補什麼。';


-- ── 2b. A3 bridge：套用上面那條判斷 ──────────────────────────────────────
--
-- 與 20260827 的差別只有 'duration' 的進場條件一行。其餘一字未動 ——
-- 這一支已經套過 staging，內容從既有定義原樣搬過來再改那一處。

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
  '計畫內容由伺服器從 session.confirmed_plan 複製；不建任務、不發幣、不碰 payout。'
  'P1-A4A.1：deterministic policy evidence 寫進正式欄位，不再只留在 ai_snapshot。'
  'P1-A4B1：長期計畫沒有天數時，「先試多久」也算沒說定。';


-- ── 3. 家長共同條件草案 RPC ──────────────────────────────────────────────

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

  IF v_choice = 'no_coin' THEN
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
  IF NOT (v_choice = 'no_coin' OR (v_policy = 'coin_eligible' AND v_coin_ref IS NOT NULL)) THEN
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
  '一個字都沒改）。不建任務、不發幣、不寫 confirmed reward。';


-- ── 4. 權限 ───────────────────────────────────────────────────────────────

REVOKE ALL ON child_proposal_plan_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON child_proposal_plan_versions TO authenticated;

REVOKE ALL ON FUNCTION public.propose_child_planning_terms_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_child_planning_terms_v1(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.child_planning_pending_duration(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.child_planning_pending_duration(text, integer) TO authenticated;
