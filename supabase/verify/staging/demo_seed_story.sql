-- GrowBook Demo — State B 的故事層（核心閱讀共同計畫）。
--
-- 在 demo_seed.sql（State A 背景歷史）之後執行。State B = State A ＋ 一條
-- 已經成立並執行了幾天的共同閱讀計畫，最終畫面是「本週 2/3」。
--
-- ─────────────────────────────────────────────────────────────────────────
-- 為什麼需要「歷史位移」，以及位移的邊界在哪裡
--
-- P0-5B 的 accept_child_proposal_plan_v1 會把 start_date 定成**台北的今天**。
-- 這是正確的產品語意（計畫從答應的那天開始），但也代表：今天才接受的計畫，
-- 它的 plan window 就是從今天起算，而 buildGoalPresentation 的
-- validRhythmCompletions 會丟掉 planStart 以前的完成紀錄。
--
-- 「本週 2/3」需要**本週兩個不同日期**各有一次完成。所以只要是今天才接受的
-- 計畫，2/3 在物理上就不可能由今天重播得到 —— 不是資料沒補齊，是時間語意
-- 本身不允許。
--
-- 這支腳本的處理方式是把兩件事分開：
--
--   **資料語意**：完全由正式程式碼產生。提案、AI 版本、家長調整、孩子接受、
--   兩筆完成紀錄，全部走正式 RPC，而且是用**真正的 Demo 家長身分**呼叫
--   （下面的 set_config 讓 auth.uid() 回傳真實 user id，所以
--   assert_child_in_caller_family 是真的通過，不是被繞過）。沒有任何一列是
--   手寫 INSERT，沒有放寬任何驗證，沒有改動 production code。
--
--   **行事曆**：只把「計畫的起訖日」往前移。也就是
--   long_term_goals.started_at / end_date，以及 current plan version 的
--   start_date / end_date。**tasks 的日期刻意不動** —— P0-8G 把它們凍結在
--   共同約定裡（改不動是對的），而孩子端的行事曆本來就只讀 goal，見第 5 段。
--
-- 刻意**不動**任何建立時間戳（activated_at / effective_at / child_accepted_at /
-- parent_confirmed_at / confirmed_at / created_at）。它們誠實記錄「這份快照是
-- 現在建的」。理由是：confirmed_at 被 child_proposal_plan_version_guard 保護成
-- write-once，改不動；如果只把其他時間戳往前移，就會做出一條**看起來一致、
-- 實際上在 confirmed_at 破口**的假時間線。與其留一個藏起來的矛盾，不如留一道
-- 說得清楚的接縫：行事曆是歷史的，建立軌跡是誠實的。
--
-- 沒有做的事：沒有 seed plan window 以外的完成、沒有未來日期、沒有改系統時間、
-- 沒有動 production RPC、沒有放寬 plan-window 驗證、沒有直接寫
-- task_completions / transactions，也沒有直接改 wallet 餘額。
-- ─────────────────────────────────────────────────────────────────────────

-- ── 日期推導：獨立成 function 才能對任意 reference day 測試 ─────────────────
--
-- d1 = 本週一，d2 = 本週二。兩者都保證落在當週（weekStart 是台北時間的週一），
-- 而且一定是兩個不同日期。
--
-- **為什麼 d2 是週二而不是「今天」**（P0-8M staging 驗收發現）：
--
-- 孩子端「今天預計」的第一順位是**今天那筆 completion 的 planned_time_window**
-- （見 LongTermDetailScreen 的 resolvePreferredWindow），而那是正確的產品語意 ——
-- 今天實際發生的事，優先於一份往後看的計畫。
--
-- d2 = 今天的話，State B 一定有一筆今天的完成、而且記著 before_bed。於是
-- 「家長確認換成晚餐後 → 回孩子端」這個 Demo 橋段永遠看不到晚餐後，
-- 因為今天的歷史證據壓過新計畫。把 d2 固定成週二之後，週三～週日錄影時
-- 今天沒有完成紀錄，卡片就會照新的共同版本顯示。
--
-- 這是改 Demo 的編排，**不是**改 production precedence。今天已完成時仍然
-- 顯示當天實際的時段，那條語意刻意保留（見 §4 的語意測試）。
--
-- 今天是週一時本週只過了一天，「本週兩個不同日期」在現實上不存在。那時回
-- feasible = false，由 runner 明確報 STATE_B_2_OF_3_NOT_CALENDAR_FEASIBLE，
-- 不編第二個日期出來。週二可以建立 State B（d2 = 今天），但 P0-8M 的
-- 「accept 後今天卡片直接換時段」要週三～週日才看得到。
CREATE OR REPLACE FUNCTION pg_temp.demo_state_b_dates(p_ref date)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$
  SELECT jsonb_build_object(
    'monday',      m,
    'today',       p_ref,
    'first_day',   m,
    'second_day',  m + 1,
    -- 週三以後今天才沒有完成紀錄，P0-8M 的 accept 才看得出畫面變化。
    'p0_8m_capture_ready', p_ref > m + 1,
    -- 計畫**行事曆**的起始日訂在上週五：早於兩筆完成，而且讓「計畫已經開始
    -- 了幾天」在週二到週日都成立，不會變成「昨天才開始」。
    --
    -- 這是行事曆日期，不是 audit 事實：Proposal / Plan Version 的 lifecycle
    -- timestamps 保留為建立 State B 當下，所以資料庫**沒有**聲稱孩子在上週五
    -- 按下接受。State B 是 reproducible review snapshot，不是 historically
    -- exact audit replay。
    'accept_date', m - 3,
    'plan_end',    m - 3 + 13,
    'feasible',    p_ref > m
  )
  FROM (SELECT date_trunc('week', p_ref::timestamp)::date AS m) AS w;
$fn$;

DO $story$
DECLARE
  v_family   CONSTANT uuid := 'd0e70000-0000-4000-8000-000000000001';
  v_child    CONSTANT uuid := 'd0e70000-0000-4000-8000-000000000021';
  v_user     uuid;
  v_dates    jsonb;
  v_accept   date;
  v_plan_end date;
  v_d1       date;
  v_d2       date;
  v_proposal uuid;
  v_ai       uuid;
  v_parent   uuid;
  v_task     uuid;
  v_goal     uuid;
  v_res      jsonb;
  v_decision jsonb;
  v_coin     CONSTANT int := 10;
  v_n        int;
BEGIN
  -- ── 前置：State A 必須已經在 ───────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM families WHERE id = v_family) THEN
    RAISE EXCEPTION 'State B 需要先有 State A：先跑 demo_seed.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM child_proposals WHERE family_id = v_family) THEN
    RAISE EXCEPTION 'Demo 家庭已經有提案了，先 reset 再跑 State B';
  END IF;

  v_dates := pg_temp.demo_state_b_dates(timezone('Asia/Taipei', now())::date);
  IF (v_dates ->> 'feasible')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'STATE_B_2_OF_3_NOT_CALENDAR_FEASIBLE：今天是週一，本週只過了一天，'
      '「本週兩個不同日期各完成一次」不存在。請在週二到週日之間重建 State B。';
  END IF;
  v_accept   := (v_dates ->> 'accept_date')::date;
  v_plan_end := (v_dates ->> 'plan_end')::date;
  v_d1       := (v_dates ->> 'first_day')::date;
  v_d2       := (v_dates ->> 'second_day')::date;

  -- ── 取得真正的 Demo 家長身分 ───────────────────────────────────────────
  -- auth.uid() 讀的是 request.jwt.claims 這個 GUC，所以這裡設定之後，
  -- assert_child_in_caller_family 是**真的**通過家庭比對，不是被繞過。
  SELECT user_id INTO v_user FROM parents WHERE family_id = v_family LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Demo 家長沒有連到 auth user，State B 無法用正式 RPC 建立';
  END IF;
  -- 只設 claims，**不要** SET ROLE authenticated：RPC 是 SECURITY DEFINER，
  -- 有 auth.uid() 就夠了；真的切到 authenticated 反而會讓後面那幾道
  -- 行事曆 UPDATE 撞上 RLS 與權限，變成用「權限不足」去發現寫錯了。
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  -- ── 1. 孩子提出（正式 RPC） ────────────────────────────────────────────
  v_res := create_child_proposal_v1(jsonb_build_object(
    'schemaVersion', 1,
    'childId', v_child,
    'childOriginalGoal', '我想兩週把這本書讀完',
    'childOriginalMotivation', '因為同學說這本書很好看，我也想知道後面發生什麼事',
    'proposalSource', 'child',
    'cadence', jsonb_build_object('mode', 'weekly_frequency', 'weeklyFrequency', 4),
    'estimatedMinutes', 15,
    'childRewardPreference', 'hopes_for_coin'
  ));
  IF COALESCE((v_res ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '建立提案失敗：%', v_res;
  END IF;
  v_proposal := (v_res ->> 'proposalId')::uuid;

  v_res := transition_child_proposal_v1(jsonb_build_object(
    'schemaVersion', 1, 'proposalId', v_proposal,
    'toStatus', 'proposed', 'actorRole', 'child'));
  IF COALESCE((v_res ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '轉 proposed 失敗：%', v_res;
  END IF;

  -- ── 2. AI 整理出一週 4 次的結構化計畫（正式 RPC） ──────────────────────
  v_res := add_child_proposal_plan_version_v1(jsonb_build_object(
    'schemaVersion', 1,
    'proposalId', v_proposal,
    'authoredBy', 'ai',
    'planTitle', '兩週閱讀挑戰',
    'planSummary', '用每週節奏累積閱讀投入，不用一次讀完',
    'purposeCategory', 'D',
    'completionDescription', '完成一次約定的閱讀時段',
    'progressModel', 'weekly_rhythm',
    'nextStep', '拿出想讀的那本書，先讀大約 15 分鐘',
    'cadence', jsonb_build_object('mode', 'weekly_frequency', 'weeklyFrequency', 4),
    'estimatedMinutes', 15,
    'durationType', 'long_term',
    'durationDays', 14,
    'reward', jsonb_build_object(
      'policy', 'coin_eligible', 'eligibility', 'allowed',
      'policyVersion', 'coin-policy-1.0.0', 'aiSuggestedCoinAmount', v_coin),
    'taskPolicyVersion', 'task-taxonomy-2026-07',
    'aiSnapshot', jsonb_build_object('source', 'growbook-demo-state-b'),
    'aiModel', 'demo-state-b',
    'aiRequestId', 'demo-state-b:' || v_proposal::text
  ));
  IF COALESCE((v_res ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '建立 AI 版本失敗：%', v_res;
  END IF;
  v_ai := (v_res ->> 'planVersionId')::uuid;

  -- ── 3. 媽媽把一週 4 次改成 3 次（正式 RPC） ────────────────────────────
  v_res := revise_child_proposal_plan_v1(jsonb_build_object(
    'schemaVersion', 1,
    'proposalId', v_proposal,
    'expectedPlanVersionId', v_ai,
    'materialEdits', jsonb_build_object(
      'cadenceMode', 'weekly_frequency',
      'cadenceWeeklyFrequency', 3,
      'cadenceDays', NULL,
      'preferredTime', 'before_bed',
      'preferredTimeCustom', NULL,
      'completionDescription', '完成一次約定的閱讀時段')
  ));
  IF COALESCE((v_res ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '家長調整失敗：%', v_res;
  END IF;
  v_parent := (v_res ->> 'planVersionId')::uuid;

  -- ── 4. 孩子接受（正式 RPC） ────────────────────────────────────────────
  v_decision := jsonb_build_object(
    'rewardPolicy', 'coin_eligible',
    'eligibility', 'allowed',
    'rewardPolicyVersion', 'coin-policy-1.0.0',
    'explanation', '6-9 歲 D 類、每次約 15 分鐘，GrowBook 建議 10 幣。',
    'coin', jsonb_build_object(
      'suggestedAmount', v_coin,
      'finalAmount', v_coin,
      'minAllowed', 5,
      'maxAllowed', 25,
      'calculationBasis', jsonb_build_object(
        'ageGroup', (SELECT age_group FROM children WHERE id = v_child),
        'purposeCategory', 'learning_skill',
        'estimatedMinutes', 15,
        'durationType', 'long_term',
        'scheduleMode', 'weekly_frequency',
        'weeklyFrequency', 3,
        'difficulty', 'standard',
        'band', '11-20')));

  v_res := accept_child_proposal_plan_v1(jsonb_build_object(
    'schemaVersion', 1,
    'proposalId', v_proposal,
    'expectedPlanVersionId', v_parent,
    'rewardDecision', v_decision));
  IF COALESCE((v_res ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '孩子接受失敗：%', v_res;
  END IF;
  v_task := (v_res ->> 'taskId')::uuid;

  SELECT id INTO v_goal FROM long_term_goals WHERE task_id = v_task;
  IF v_goal IS NULL THEN
    RAISE EXCEPTION '接受後沒有長期紀錄，State B 無法成立';
  END IF;

  -- ── 5. 只把行事曆往前移（見檔頭說明） ──────────────────────────────────
  --
  -- ⚠️ 這裡**不碰 tasks.start_date / due_date**。
  --
  -- P0-8G（20260816）把 start_date 與 due_date 列進 active shared plan 的
  -- 凍結欄位，所以那道 UPDATE 會被 tasks_active_shared_plan_guard 擋成
  -- SHARED_PLAN_REQUIRES_RENEGOTIATION —— 而那是**正確的**：計畫的起訖日
  -- 是雙方談定的內容，不該被任何人直接改掉。
  --
  -- 好消息是這支腳本從來不需要動它。孩子端的行事曆完全由 goal 決定：
  --   planStart = goal.started_at → goal.created_at → task.created_at
  --   planEnd   = goal.end_date ?? task.due_date
  -- （見 longTermGoalPresentation 的 getPlanStart / planEnd）
  -- goal.started_at 與 goal.end_date 都有值時，task 的兩個日期根本不會被讀到。
  --
  -- long_term_goals 的 guard 只凍結 status，plan version 的 guard 不含日期，
  -- 所以下面兩道是合法的，也足以做出「本週 2/3」。
  UPDATE long_term_goals
     SET started_at = v_accept, end_date = v_plan_end
   WHERE id = v_goal;
  UPDATE child_proposal_plan_versions
     SET start_date = v_accept, end_date = v_plan_end
   WHERE id = v_parent;

  -- ── 6. 兩筆完成走正式 complete_task ────────────────────────────────────
  -- 兩個不同的台北日期、都在本週、都在 plan window 內、都不是未來。
  FOREACH v_res IN ARRAY ARRAY[
    jsonb_build_object('d', v_d1::text, 'h', 20, 'mode', 'self_started'),
    jsonb_build_object('d', v_d2::text, 'h', 21, 'mode', 'reminded')
  ] LOOP
    DECLARE
      v_done jsonb;
      v_when timestamptz := ((v_res ->> 'd') || ' '
                             || lpad((v_res ->> 'h'), 2, '0') || ':00+08')::timestamptz;
    BEGIN
      IF (v_res ->> 'd')::date > timezone('Asia/Taipei', now())::date THEN
        RAISE EXCEPTION '拒絕建立未來的完成紀錄：%', v_res ->> 'd';
      END IF;
      v_done := complete_task(v_task, v_child, v_when, true, v_goal);
      IF v_done ? 'error' THEN
        RAISE EXCEPTION '閱讀完成紀錄失敗（%）：%', v_res ->> 'd', v_done ->> 'error';
      END IF;
      PERFORM record_completion_context(
        (v_done ->> 'completionId')::uuid, 'before_bed', v_res ->> 'mode');
    END;
  END LOOP;

  -- ── 7. 自我驗證：不是「跑完沒噴錯」就算過 ──────────────────────────────
  SELECT count(*) INTO v_n FROM child_proposals
   WHERE family_id = v_family AND status = 'active';
  IF v_n <> 1 THEN RAISE EXCEPTION 'State B 應該恰好一筆 active 提案，實際 %', v_n; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM child_proposals p
      JOIN child_proposal_plan_versions cur ON cur.id = p.current_plan_version_id
      JOIN child_proposal_plan_versions src ON src.id = cur.adopted_from_plan_version_id
     WHERE p.id = v_proposal
       AND p.status = 'active' AND p.task_id = v_task
       AND cur.authored_by = 'parent' AND cur.requires_child_review = true
       AND cur.child_accepted_at IS NOT NULL AND cur.effective_at IS NOT NULL
       AND cur.cadence_weekly_frequency = 3
       AND src.authored_by = 'ai' AND src.cadence_weekly_frequency = 4
  ) THEN
    RAISE EXCEPTION 'State B 的版本血緣或狀態不符合 P0-5B contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tasks
     WHERE id = v_task AND creation_source = 'child_proposal'
       AND schedule_mode = 'weekly_frequency' AND weekly_frequency = 3
       AND recurrence_days IS NULL AND progress_model = 'weekly_rhythm'
  ) THEN
    RAISE EXCEPTION 'State B 的正式任務不是 weekly_frequency=3 的週節奏任務';
  END IF;

  SELECT count(DISTINCT timezone('Asia/Taipei', completed_at)::date)
    INTO v_n FROM task_completions WHERE task_id = v_task;
  IF v_n <> 2 THEN
    RAISE EXCEPTION '閱讀完成應該落在 2 個不同日期，實際 %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM task_completions
   WHERE task_id = v_task
     AND timezone('Asia/Taipei', completed_at)::date
         NOT BETWEEN v_accept AND timezone('Asia/Taipei', now())::date;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '有 % 筆閱讀完成落在 plan window 之外或未來', v_n;
  END IF;

  RAISE NOTICE 'State B 完成：proposal=% task=% 接受日=% 完成日=% 與 %',
    v_proposal, v_task, v_accept, v_d1, v_d2;
END
$story$;
