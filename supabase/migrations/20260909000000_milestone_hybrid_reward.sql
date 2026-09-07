-- ═══════════════════════════════════════════════════════════════════════════
-- P1-M1B §2.4｜staged 計畫的混合制回饋 —— 啟用層
--
-- mini-spec: docs/MINI_SPEC_staged-milestone-hybrid-reward.md §2.4
--
-- ─────────────────────────────────────────────────────────────────────────
-- §2.1（expectedWeeks，7759ccc）與 §2.2（拆站公式 ＋ flat_per_completion
-- 型別，dc46ef8）已經完成，都停在 App 端。這一支讓 milestone_agreements
-- 真的在啟用那一刻被建出來 —— 之前這件事在整個產品裡從來沒有發生過一次。
--
-- ── 這一支做四件事 ──────────────────────────────────────────────────────
--
--   1. child_proposal_plan_versions 加 milestone_reward_choice 欄位
--      （家長明講 flat_per_completion，還是沿用 GrowBook 預設判定）。
--   2. 新的 internal-only 函式 apply_milestone_split_v1：算拆法、建站，
--      與 task/goal 同一個 transaction。
--   3. publish_child_confirmed_plan_v1 補一條規則：staged 計畫只要算得出
--      拆站方案，就強制把 'reward' 放進 requires_parent_decision ——
--      逼進協商路徑，不會再讓 Direct Confirm 默默套用預設拆法。
--   4. propose_child_planning_terms_v1 收 flat_per_completion，並把這個
--      選擇存進新欄位（沒提就沿用來源版本，跟其他共同條件同一個語意）。
--      confirm_child_planning_proposal_v1／accept_child_planning_terms_v1
--      在建完 task/goal 後呼叫 apply_milestone_split_v1，讀回來驗
--      （MILESTONE_SPLIT_NOT_PERSISTED，與既有 PAYOUT_BASIS_NOT_PERSISTED
--      同一個模式）。
--
-- ── ⚠️ 為什麼不能走 create_milestone_agreement_v1（既有的公開 RPC）─────
--
-- 那支用 auth.uid() 認家長身分，但 accept_child_planning_terms_v1 的
-- 呼叫者是孩子 —— auth.uid() 在那裡是孩子的 id，SECURITY DEFINER 不會
-- 改變這件事。apply_milestone_split_v1 改成明講的 p_confirmed_by_parent_id
-- 參數：confirm 那支自己就是家長在呼叫，直接查 auth.uid() 對應的 parents.id；
-- accept 那支要讀 v_plan.author_user_id（propose_child_planning_terms_v1
-- 當初是家長呼叫的，那一版的 author_user_id 就是家長）。
--
-- ── ⚠️ 基準檔（三支各自最新，不在同一個檔案裡）───────────────────────────
--
--   publish_child_confirmed_plan_v1        20260907000000（自己的 §2 migration）
--   propose_child_planning_terms_v1        20260906000000（Plan 1 解 weekly_rhythm 死結）
--   confirm_child_planning_proposal_v1     20260831000000（唯一定義）
--   accept_child_planning_terms_v1         20260831000000（唯一定義）
--
-- CREATE OR REPLACE 是整支置換，四支各自從上面那個檔案逐字複製再貼片，
-- 不是從隨便一個看起來含有這個函式名字的檔案抄。
--
-- ── 明確不做的事 ────────────────────────────────────────────────────────
--
--   * 不 backfill。既有計畫一列都不改。
--   * 不改 payout_basis。拆站計畫的 tasks.payout_basis 仍然是
--     per_completion，milestone 走獨立的 settle_milestone_reward_v1() 那條
--     trigger 鏈，兩者不互相干擾。
--   * 不動 record_child_goal_planning_round_v1（20260908 已經處理，
--     跟這一支無關，這一支不碰對話那條線）。
--   * 不讓家長輸入金額。折扣公式的 0.4 是政策常數，寫死在
--     apply_milestone_split_v1 裡，跟 App 端 milestoneSplit.ts 的
--     MILESTONE_SPLIT_POLICY_RATIO 保持一致——兩邊由
--     childPlanningSqlParity.test.ts 機器對齊（400feec），不再是只能
--     靠人工記得的地方。
--
-- ⚠️ 這支 migration 寫完但**還沒套進資料庫**——A/B 驗收還在跑，混進另一支
-- 還沒被使用者驗證過的 RPC 版本，會讓任何失敗的歸因變得不清楚。等 A/B
-- 通過、且與 app-7c 一起複驗過才套用。
--
-- ⚠️ 套用方式：一定要用 `supabase db push`（或等價的交易式遷移工具），
-- 不要把內容分段貼進 SQL Editor。這支一次動四支函式＋一個新欄位，
-- 分段貼失敗會留下半套狀態——20260907 就是分段貼只套了內容、沒記帳
-- 才被發現的，這支影響面比它大，風險更高。db push 是整包一個交易，
-- 語法錯就整包回滾，不會有「套了一半」的中間狀態。
--
-- 冪等：全部 CREATE OR REPLACE ／ ADD COLUMN IF NOT EXISTS ／
-- DROP CONSTRAINT IF EXISTS，可重跑——但「可重跑」是給 db push 失敗後
-- 重試用的，不是拿來當作可以分段貼的理由。
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 新欄位 ─────────────────────────────────────────────────────────────

-- ── 新欄位：家長要不要拆站 ────────────────────────────────────────────────
--
-- NULL = 沒有明講（沿用 GrowBook 的預設判定，staged 計畫預設拆站）。
-- 'flat_per_completion' = 家長明講不拆，全額 per_completion（P1-M1B §1 決定 #4）。
--
-- 跟 cadence_mode 等其他共同條件同一個「沒提出就不動」語意：
-- propose_child_planning_terms_v1 沒收到 rewardChoice='flat_per_completion'
-- 就沿用來源版本的這一欄，不是每輪重問。
ALTER TABLE child_proposal_plan_versions
  ADD COLUMN IF NOT EXISTS milestone_reward_choice text;

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_milestone_reward_choice_check;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_milestone_reward_choice_check
  CHECK (milestone_reward_choice IS NULL OR milestone_reward_choice = 'flat_per_completion');

COMMENT ON COLUMN child_proposal_plan_versions.milestone_reward_choice IS
  'P1-M1B：家長是否明講拒絕拆站。NULL＝沿用 GrowBook 預設判定，'
  '''flat_per_completion''＝全額 per_completion，不建 milestone_agreements。'
  '只在 staged 計畫、且算得出拆站方案時才有意義；rhythm 計畫這一欄恆為 NULL。';


-- ── 2. apply_milestone_split_v1 ──────────────────────────────────────────

-- ── apply_milestone_split_v1：staged 計畫的混合制回饋，同一 transaction 建站 ──
--
-- ⚠️ internal-only。刻意不走 create_milestone_agreement_v1 那支公開 RPC ——
--    那支用 auth.uid() 認家長身分，而 accept_child_planning_terms_v1 的
--    呼叫者是孩子，auth.uid() 在那裡是孩子的 id，會被判 not_authorized。
--    家長身分改成明講的參數，由呼叫端從 plan version 上讀出來再傳進來。
--
-- 算不出來就是「這裡沒有東西可以建」，逐條 RETURN 0，不猜、不建一半：
--   不是 staged                     沒有階段可拆
--   沒有 phases 陣列                 同上
--   cadence 還沒定（target_per_week） 不知道一站算幾次
--   沒有 session 參考價               不知道要折現多少
--   家長選 flat_per_completion       家庭決定不拆
--
-- 折扣公式（方案 A，預算守恆）與
-- src/lib/childPlanning/sharedTerms/milestoneSplit.ts 的
-- computeMilestoneSplit() 同一條：discountedSession = max(1, round(session*0.6))，
-- milestoneCoin = (session-discountedSession) × (week_count × target_per_week)。
-- 兩邊的 0.4／0.6 是同一個政策常數，改一邊沒改另一邊，家長在畫面上看到的
-- 折扣跟資料庫實際結算的折扣就會對不起來——這是**唯一**兩邊都要一起改的地方。
--
-- 沒有 expectedWeeks 的站**不建 milestone_agreements**：completion_criterion
-- 需要 week_count 才知道「什麼時候算走到這一站」，連 criterion 都建不出來，
-- 跟「建了但沒有錢」是兩件事（那一種是 reward_coin_amount 寫 NULL，
-- 這裡是那一列根本不存在）。那一站仍然留在 child_confirmed_plan.phases
-- 裡給孩子看，只是不會被正式追蹤、不會觸發 achievement/settlement。
--
-- 回傳實際建了幾筆，呼叫端要讀回來驗（見兩支 activation RPC 裡
-- MILESTONE_SPLIT_NOT_PERSISTED 那段，與既有的 PAYOUT_BASIS_NOT_PERSISTED
-- 同一個模式）。

CREATE OR REPLACE FUNCTION public.apply_milestone_split_v1(
  p_task_id                    uuid,
  p_goal_id                    uuid,
  p_child_confirmed_plan       jsonb,
  p_cadence_mode                text,
  p_cadence_weekly_frequency    smallint,
  p_cadence_days                 integer[],
  p_session_coin_reference      integer,
  p_milestone_reward_choice     text,
  p_start_date                  date,
  p_effective_plan_version_id   uuid,
  p_confirmed_by_parent_id      uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_progression      text;
  v_target_per_week  int;
  v_discounted       int;
  v_segment_cursor   timestamptz;
  v_phase            jsonb;
  v_phase_weeks      int;
  v_phase_title      text;
  v_phase_coin       int;
  v_created          int := 0;
  v_now              timestamptz := now();
BEGIN
  -- 家長選了不拆站，全額 per_completion —— 不建任何 milestone agreement。
  IF p_milestone_reward_choice = 'flat_per_completion' THEN RETURN 0; END IF;

  -- 不是 staged 計畫，沒有東西可以拆。
  IF p_child_confirmed_plan IS NULL OR jsonb_typeof(p_child_confirmed_plan) <> 'object' THEN
    RETURN 0;
  END IF;
  v_progression := p_child_confirmed_plan ->> 'progressionKind';
  IF v_progression IS DISTINCT FROM 'staged' THEN RETURN 0; END IF;
  IF jsonb_typeof(p_child_confirmed_plan -> 'phases') IS DISTINCT FROM 'array' THEN RETURN 0; END IF;

  -- cadence 還沒定，算不出 target_per_week —— 不猜。與
  -- resolve_payout_basis_v1 的 fallback 同一個規則
  -- （weekly_frequency 用次數，fixed_days 用星期數）。
  v_target_per_week := CASE
    WHEN p_cadence_mode = 'weekly_frequency' THEN p_cadence_weekly_frequency
    WHEN p_cadence_mode = 'fixed_days' THEN array_length(p_cadence_days, 1)
    ELSE NULL
  END;
  IF v_target_per_week IS NULL OR v_target_per_week <= 0 THEN RETURN 0; END IF;

  -- 不發幣的計畫、或還沒有正式的參考價，沒有東西可以折現。
  IF p_session_coin_reference IS NULL OR p_session_coin_reference <= 0 THEN RETURN 0; END IF;

  -- 方案 A：discountedSession = max(1, round(session*(1-0.4)))。
  v_discounted := GREATEST(1, ROUND(p_session_coin_reference * 0.6)::int);

  -- 第一站從計畫開始日對齊到 Asia/Taipei 週一 —— 與
  -- create_milestone_agreement_v1／evaluate_milestone_achievements_v1
  -- 同一套 taipeiWeekStart() 語意，不讓這裡另外發明一套算法。
  v_segment_cursor := date_trunc(
    'week', p_start_date::timestamptz AT TIME ZONE 'Asia/Taipei'
  ) AT TIME ZONE 'Asia/Taipei';

  FOR v_phase IN SELECT * FROM jsonb_array_elements(p_child_confirmed_plan -> 'phases')
  LOOP
    v_phase_weeks := NULLIF(v_phase ->> 'expectedWeeks', '')::int;

    -- 沒有 expectedWeeks（或超出 1-8 的邊界）就連 criterion 都建不出來——
    -- 這一站不進 milestone_agreements，不是「進去但金額是 null」。
    CONTINUE WHEN v_phase_weeks IS NULL OR v_phase_weeks NOT BETWEEN 1 AND 8;

    v_phase_title := NULLIF(btrim(v_phase ->> 'title'), '');
    CONTINUE WHEN v_phase_title IS NULL;

    v_phase_coin := (p_session_coin_reference - v_discounted) * v_phase_weeks * v_target_per_week;

    INSERT INTO milestone_agreements (
      task_id, goal_id, title, completion_criterion,
      reward_coin_amount, agreement_source,
      parent_confirmed_at, parent_confirmed_by_parent_id,
      effective_at, effective_plan_version_id
    ) VALUES (
      p_task_id, p_goal_id, v_phase_title,
      jsonb_build_object(
        'type', 'weekly_rhythm_window',
        'segment_start_at', v_segment_cursor,
        'week_count', v_phase_weeks,
        'target_per_week', v_target_per_week,
        'timezone', 'Asia/Taipei'
      ),
      -- 算出來是 0 或負值就是純慶祝站：criterion 追蹤得到、真的可以走到，
      -- 只是這一站沒有額外的錢。
      CASE WHEN v_phase_coin > 0 THEN v_phase_coin ELSE NULL END,
      'p1_plan_version',
      v_now, p_confirmed_by_parent_id,
      v_now, p_effective_plan_version_id
    );
    v_created := v_created + 1;

    v_segment_cursor := v_segment_cursor + (v_phase_weeks * interval '7 days');
  END LOOP;

  RETURN v_created;
END;
$$;

COMMENT ON FUNCTION public.apply_milestone_split_v1(
  uuid, uuid, jsonb, text, smallint, integer[], integer, text, date, uuid, uuid
) IS
  'P1-M1B：staged 計畫的混合制回饋，與 task/goal 同一個 transaction 建立。'
  'internal-only —— 家長身分是明講的參數，不是 auth.uid()，因為呼叫端'
  '（accept_child_planning_terms_v1）的呼叫者可能是孩子。'
  '算不出來（不是 staged／沒有 cadence／沒有 session 參考價／家長選'
  'flat_per_completion）一律回 0，不猜、不建一半。';

-- 與 child_planning_pending_duration 同一個模式：純內部 helper，仍然
-- grant 給 authenticated —— 兩支 activation RPC 是 SECURITY DEFINER，
-- 呼叫這支時的有效角色不保證是函式擁有者，不能只靠 REVOKE 擋外部呼叫端，
-- 那不是這支要防的事（p_confirmed_by_parent_id 由呼叫端決定就已經是
-- 信任邊界）。
REVOKE ALL ON FUNCTION public.apply_milestone_split_v1(
  uuid, uuid, jsonb, text, smallint, integer[], integer, text, date, uuid, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_milestone_split_v1(
  uuid, uuid, jsonb, text, smallint, integer[], integer, text, date, uuid, uuid
) TO authenticated;


-- ── 3. publish_child_confirmed_plan_v1（基準 20260907）───────────────────

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

  -- ── P1-M1B：staged 計畫的拆站方案要讓家長看過、核可 ────────────────────
  --
  -- v_progression／v_plan 已經在上面解出來（v_plan := v_session.confirmed_plan;
  -- v_progression := v_plan ->> 'progressionKind';）。
  --
  -- 沒有這一條，一份 staged 計畫只要其他系統欄位都齊了就會符合 Direct
  -- Confirm 資格——家長按下「確認」的那一刻，從沒看過拆站方案，
  -- GrowBook 就會用預設判定默默套用。決定 #2「規則鏈算完，家長核可」
  -- 的「核可」是要看得到才核可，不是有得選但沒被問過。
  --
  -- 只在真的算得出東西可拆時才擋（staged ＋ 至少一站帶 expectedWeeks，
  -- 而且已經確定要發幣）；rhythm／accumulation、或 staged 但 AI 沒判斷
  -- 出任何一站的 expectedWeeks，都不受影響——沒有東西可以拆，逼進協商
  -- 也問不出結果。
  IF v_progression = 'staged'
    AND jsonb_typeof(v_plan -> 'phases') = 'array'
    AND v_policy = 'coin_eligible'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_plan -> 'phases') AS phase
       WHERE phase ? 'expectedWeeks'
    )
    AND NOT ('reward' = ANY(v_pending))
  THEN
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

-- ── 4a. propose_child_planning_terms_v1（基準 20260906）──────────────────

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
  v_milestone_choice text;
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

  IF v_choice IS NOT NULL
    AND v_choice NOT IN ('growbook_default', 'no_coin', 'flat_per_completion') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'REWARD_CHOICE_INVALID',
      'message', '目前只能選擇沿用 GrowBook 的判定、不給成長幣，或不拆站全額結算');
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

  -- P1-M1B：家長要不要拆站，跟其他共同條件同一個「沒提出就不動」語意。
  -- 明講 flat_per_completion 就記下來；明講 growbook_default／no_coin
  -- 是清掉之前的 flat 選擇，回到預設判定；完全沒提這個欄位就沿用來源版本
  -- 上一輪留下的值 —— 不是每一輪都要重新問一次「要不要拆站」。
  v_milestone_choice := CASE
    WHEN v_choice = 'flat_per_completion' THEN 'flat_per_completion'
    WHEN v_choice IS NOT NULL THEN NULL
    ELSE v_source.milestone_reward_choice
  END;

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
    AND v_source.duration_type IS NOT NULL
    AND v_source.duration_type <> 'one_time'
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
      milestone_reward_choice,
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
      v_milestone_choice,
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

-- ── 4b. confirm_child_planning_proposal_v1（基準 20260831，唯一定義）────

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
  v_goal_id      uuid;
  v_parent_id    uuid;
  v_milestone_count int;
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

    -- ── P1-M1B：staged 計畫的混合制回饋 ────────────────────────────────
    --
    -- 與 task/goal 同一個 transaction、家長身分不是 auth.uid()（那正是
    -- accept_child_planning_terms_v1 讀不到的東西——這裡先用同一套邏輯，
    -- 這一支剛好呼叫者本來就是家長）。v_plan 就是孩子原版本（這條路徑
    -- 沒有協商過），phases 直接讀得到，不需要像 accept 那樣走 lineage。
    IF v_plan.duration_type = 'long_term' THEN
      SELECT g.id INTO v_goal_id FROM long_term_goals g WHERE g.task_id = v_task_id;
    END IF;
    SELECT p.id INTO v_parent_id FROM parents p WHERE p.user_id = auth.uid();

    IF v_goal_id IS NOT NULL AND v_parent_id IS NOT NULL THEN
      v_milestone_count := public.apply_milestone_split_v1(
        p_task_id => v_task_id,
        p_goal_id => v_goal_id,
        p_child_confirmed_plan => v_plan.child_confirmed_plan,
        p_cadence_mode => v_plan.cadence_mode,
        p_cadence_weekly_frequency => v_plan.cadence_weekly_frequency,
        p_cadence_days => v_plan.cadence_days,
        p_session_coin_reference => v_coin_ref,
        p_milestone_reward_choice => NULL,
        p_start_date => v_start_date,
        p_effective_plan_version_id => v_parent_plan_id,
        p_confirmed_by_parent_id => v_parent_id
      );
      -- 讀回來驗：函式自己講建了幾站，跟資料庫裡真的躺著幾筆對不上，
      -- 就整筆 rollback。少了這一段，哪天它安靜地少建一站，唯一看得出來
      -- 的地方是幾週後的錢包（與 PAYOUT_BASIS_NOT_PERSISTED 同一個模式）。
      IF v_milestone_count IS DISTINCT FROM (
        SELECT COUNT(*)::int FROM milestone_agreements
         WHERE effective_plan_version_id = v_parent_plan_id AND superseded_at IS NULL
      ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001',
          MESSAGE = 'milestone split not persisted',
          DETAIL = jsonb_build_object(
            'ok', false, 'code', 'PERSISTENCE_FAILED',
            'reason', 'MILESTONE_SPLIT_NOT_PERSISTED',
            'message', '混合制回饋的站數建立後驗證失敗'
          )::text;
      END IF;
    END IF;

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

-- ── 4c. accept_child_planning_terms_v1（基準 20260831，唯一定義）────────

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
  v_goal_id      uuid;
  v_parent_id    uuid;
  v_milestone_count int;
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

    -- ── P1-M1B：staged 計畫的混合制回饋 ────────────────────────────────
    --
    -- ⚠️ phases 讀 v_root（孩子原版本），不是 v_plan（可能是家長草案，
    --    不複製 child_confirmed_plan）。cadence／milestone_reward_choice
    --    讀 v_plan——那是這一輪真正談定、即將生效的版本。
    --
    -- ⚠️ 家長身分讀 v_plan.author_user_id，不是 auth.uid()：這支 RPC
    --    的呼叫者是孩子，auth.uid() 在這裡是孩子的 id。
    IF v_plan.duration_type = 'long_term' THEN
      SELECT g.id INTO v_goal_id FROM long_term_goals g WHERE g.task_id = v_task_id;
    END IF;
    SELECT p.id INTO v_parent_id FROM parents p WHERE p.user_id = v_plan.author_user_id;

    IF v_goal_id IS NOT NULL AND v_parent_id IS NOT NULL THEN
      v_milestone_count := public.apply_milestone_split_v1(
        p_task_id => v_task_id,
        p_goal_id => v_goal_id,
        p_child_confirmed_plan => v_root.child_confirmed_plan,
        p_cadence_mode => v_plan.cadence_mode,
        p_cadence_weekly_frequency => v_plan.cadence_weekly_frequency,
        p_cadence_days => v_plan.cadence_days,
        p_session_coin_reference => v_coin_ref,
        p_milestone_reward_choice => v_plan.milestone_reward_choice,
        p_start_date => v_start_date,
        p_effective_plan_version_id => v_expected_plan_id,
        p_confirmed_by_parent_id => v_parent_id
      );
      IF v_milestone_count IS DISTINCT FROM (
        SELECT COUNT(*)::int FROM milestone_agreements
         WHERE effective_plan_version_id = v_expected_plan_id AND superseded_at IS NULL
      ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001',
          MESSAGE = 'milestone split not persisted',
          DETAIL = jsonb_build_object(
            'ok', false, 'code', 'PERSISTENCE_FAILED',
            'reason', 'MILESTONE_SPLIT_NOT_PERSISTED',
            'message', '混合制回饋的站數建立後驗證失敗'
          )::text;
      END IF;
    END IF;

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

COMMIT;
