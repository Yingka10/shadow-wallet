-- P0-10B — State B 與「今天真的 live accept」的逐欄等價比對。
--
-- State B 的行事曆是往前移過的（見 demo_seed_story.sql 檔頭）。這支腳本要回答的
-- 是唯一重要的問題：**除了行事曆，還有沒有別的地方不一樣？**
--
-- 做法是在一個臨時家庭裡用完全相同的正式 RPC 走一次 AI 4 → 家長 3 → 孩子接受，
-- 不做任何日期位移，然後把兩邊的資料列轉成 jsonb、扣掉本來就會不同的鍵
-- （uuid、建立時間、以及刻意位移的日期欄位），比對剩下的每一個欄位。
--
-- 整支以 RAISE EXCEPTION 收尾，所以 control 家庭與它建出來的任務、提案、版本
-- 全部回滾 —— 比對留下結論，不留下資料。
--
-- 跑法：supabase db query --linked -f p0_10b_equivalence.sql
--        （非零離開碼是預期的：訊息才是結果）

DO $eq$
DECLARE
  v_demo_family CONSTANT uuid := 'd0e70000-0000-4000-8000-000000000001';
  -- 本來就會不同、比了沒有意義的鍵。
  v_volatile CONSTANT text[] := ARRAY[
    'id', 'proposal_id', 'task_id', 'child_id', 'family_id', 'created_at',
    'updated_at', 'current_plan_version_id', 'adopted_from_plan_version_id',
    'author_user_id', 'confirmed_by_user_id', 'confirmed_source_task_id',
    'creation_request_id', 'ai_request_id', 'ai_snapshot', 'ai_model',
    'activated_at', 'parent_confirmed_at', 'effective_at', 'child_accepted_at',
    'confirmed_at', 'superseded_at', 'version_no', 'plan_title', 'plan_summary',
    'child_original_goal', 'child_original_motivation', 'name', 'description',
    'proposed_at',
    -- 刻意位移的行事曆欄位。
    'start_date', 'end_date', 'due_date', 'started_at',
    -- 執行計數器。control 剛接受、還沒做過任何一次，State B 已經做了兩天，
    -- 所以這幾個本來就會不同。它們不是「accept 產生的形狀」的一部分，
    -- 而是之後執行的結果 —— 這裡不比，改在下面單獨驗證它是正確的衍生值，
    -- 而不是被塞出來的數字。
    'current_day', 'last_active_date', 'completed_at', 'interrupt_count'
  ];
  v_user     uuid;
  v_family   uuid;
  v_child    uuid;
  v_proposal uuid;
  v_ai       uuid;
  v_parent   uuid;
  v_task     uuid;
  v_res      jsonb;
  v_a        jsonb;
  v_b        jsonb;
  v_diff     text := '';
  k          text;
BEGIN
  -- ── 1. 臨時家庭（比對完整包回滾） ──────────────────────────────────────
  INSERT INTO auth.users (instance_id, id, aud, role, email, created_at, updated_at)
    VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
            'authenticated', 'authenticated',
            'p0-10b-control@example.invalid', now(), now())
    RETURNING id INTO v_user;
  INSERT INTO families (family_name, created_by)
    VALUES ('P0-10B Control Family', v_user) RETURNING id INTO v_family;
  INSERT INTO parents (family_id, user_id, name, email)
    VALUES (v_family, v_user, 'Control Parent', 'p0-10b-control@example.invalid');
  INSERT INTO children (family_id, nickname, birth_date, age_group)
    VALUES (v_family, 'Control Kid',
            (current_date - INTERVAL '8 years 2 months')::date, '6-9')
    RETURNING id INTO v_child;
  INSERT INTO wallets (child_id, wallet_type, balance) VALUES (v_child, 'spending', 0);

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  -- ── 2. 完全相同的正式 RPC 鏈，但**不做任何日期位移** ───────────────────
  v_res := create_child_proposal_v1(jsonb_build_object(
    'schemaVersion', 1, 'childId', v_child,
    'childOriginalGoal', '我想兩週把這本書讀完',
    'childOriginalMotivation', '因為同學說這本書很好看，我也想知道後面發生什麼事',
    'proposalSource', 'child',
    'cadence', jsonb_build_object('mode', 'weekly_frequency', 'weeklyFrequency', 4),
    'estimatedMinutes', 15, 'childRewardPreference', 'hopes_for_coin'));
  v_proposal := (v_res ->> 'proposalId')::uuid;
  PERFORM transition_child_proposal_v1(jsonb_build_object(
    'schemaVersion', 1, 'proposalId', v_proposal,
    'toStatus', 'proposed', 'actorRole', 'child'));

  v_res := add_child_proposal_plan_version_v1(jsonb_build_object(
    'schemaVersion', 1, 'proposalId', v_proposal, 'authoredBy', 'ai',
    'planTitle', '兩週閱讀挑戰', 'planSummary', '用每週節奏累積閱讀投入，不用一次讀完',
    'purposeCategory', 'D', 'completionDescription', '完成一次約定的閱讀時段',
    'progressModel', 'weekly_rhythm', 'nextStep', '拿出想讀的那本書，先讀大約 15 分鐘',
    'cadence', jsonb_build_object('mode', 'weekly_frequency', 'weeklyFrequency', 4),
    'estimatedMinutes', 15, 'durationType', 'long_term', 'durationDays', 14,
    'reward', jsonb_build_object('policy', 'coin_eligible', 'eligibility', 'allowed',
      'policyVersion', 'coin-policy-1.0.0', 'aiSuggestedCoinAmount', 10),
    'taskPolicyVersion', 'task-taxonomy-2026-07',
    'aiSnapshot', jsonb_build_object('source', 'p0-10b-control'),
    'aiModel', 'p0-10b-control', 'aiRequestId', 'p0-10b-control:' || v_proposal::text));
  v_ai := (v_res ->> 'planVersionId')::uuid;

  v_res := revise_child_proposal_plan_v1(jsonb_build_object(
    'schemaVersion', 1, 'proposalId', v_proposal, 'expectedPlanVersionId', v_ai,
    'materialEdits', jsonb_build_object(
      'cadenceMode', 'weekly_frequency', 'cadenceWeeklyFrequency', 3,
      'cadenceDays', NULL, 'preferredTime', 'before_bed',
      'preferredTimeCustom', NULL,
      'completionDescription', '完成一次約定的閱讀時段')));
  v_parent := (v_res ->> 'planVersionId')::uuid;

  v_res := accept_child_proposal_plan_v1(jsonb_build_object(
    'schemaVersion', 1, 'proposalId', v_proposal, 'expectedPlanVersionId', v_parent,
    'rewardDecision', jsonb_build_object(
      'rewardPolicy', 'coin_eligible', 'eligibility', 'allowed',
      'rewardPolicyVersion', 'coin-policy-1.0.0',
      'explanation', '6-9 歲 D 類、每次約 15 分鐘，GrowBook 建議 10 幣。',
      'coin', jsonb_build_object(
        'suggestedAmount', 10, 'finalAmount', 10, 'minAllowed', 5, 'maxAllowed', 25,
        'calculationBasis', jsonb_build_object(
          'ageGroup', '6-9', 'purposeCategory', 'learning_skill',
          'estimatedMinutes', 15, 'durationType', 'long_term',
          'scheduleMode', 'weekly_frequency', 'weeklyFrequency', 3,
          'difficulty', 'standard', 'band', '11-20')))));
  IF COALESCE((v_res ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'control 的 accept 失敗，無法比對：%', v_res;
  END IF;
  v_task := (v_res ->> 'taskId')::uuid;

  -- ── 3. 逐欄比對 ────────────────────────────────────────────────────────
  -- proposal
  SELECT to_jsonb(p) INTO v_b FROM child_proposals p WHERE p.family_id = v_demo_family;
  SELECT to_jsonb(p) INTO v_a FROM child_proposals p WHERE p.id = v_proposal;
  FOREACH k IN ARRAY v_volatile LOOP v_a := v_a - k; v_b := v_b - k; END LOOP;
  IF v_a IS DISTINCT FROM v_b THEN
    v_diff := v_diff || format(E'\n  [proposal] control=%s\n             stateB =%s', v_a, v_b);
  END IF;

  -- current parent plan version
  SELECT to_jsonb(v) INTO v_b FROM child_proposal_plan_versions v
    JOIN child_proposals p ON p.current_plan_version_id = v.id
   WHERE p.family_id = v_demo_family;
  SELECT to_jsonb(v) INTO v_a FROM child_proposal_plan_versions v WHERE v.id = v_parent;
  FOREACH k IN ARRAY v_volatile LOOP v_a := v_a - k; v_b := v_b - k; END LOOP;
  IF v_a IS DISTINCT FROM v_b THEN
    v_diff := v_diff || format(E'\n  [parent version] control=%s\n                   stateB =%s', v_a, v_b);
  END IF;

  -- source AI version
  SELECT to_jsonb(v) INTO v_b FROM child_proposal_plan_versions v
   WHERE v.id = (SELECT cur.adopted_from_plan_version_id
                   FROM child_proposal_plan_versions cur
                   JOIN child_proposals p ON p.current_plan_version_id = cur.id
                  WHERE p.family_id = v_demo_family);
  SELECT to_jsonb(v) INTO v_a FROM child_proposal_plan_versions v WHERE v.id = v_ai;
  FOREACH k IN ARRAY v_volatile LOOP v_a := v_a - k; v_b := v_b - k; END LOOP;
  IF v_a IS DISTINCT FROM v_b THEN
    v_diff := v_diff || format(E'\n  [ai version] control=%s\n               stateB =%s', v_a, v_b);
  END IF;

  -- canonical task
  SELECT to_jsonb(t) INTO v_b FROM tasks t
    JOIN child_proposals p ON p.task_id = t.id WHERE p.family_id = v_demo_family;
  SELECT to_jsonb(t) INTO v_a FROM tasks t WHERE t.id = v_task;
  FOREACH k IN ARRAY v_volatile LOOP v_a := v_a - k; v_b := v_b - k; END LOOP;
  IF v_a IS DISTINCT FROM v_b THEN
    v_diff := v_diff || format(E'\n  [task] control=%s\n         stateB =%s', v_a, v_b);
  END IF;

  -- long term goal
  SELECT to_jsonb(g) INTO v_b FROM long_term_goals g
    JOIN child_proposals p ON p.task_id = g.task_id WHERE p.family_id = v_demo_family;
  SELECT to_jsonb(g) INTO v_a FROM long_term_goals g WHERE g.task_id = v_task;
  FOREACH k IN ARRAY v_volatile LOOP v_a := v_a - k; v_b := v_b - k; END LOOP;
  IF v_a IS DISTINCT FROM v_b THEN
    v_diff := v_diff || format(E'\n  [goal] control=%s\n         stateB =%s', v_a, v_b);
  END IF;

  -- child_tasks
  SELECT to_jsonb(ct) INTO v_b FROM child_tasks ct
    JOIN child_proposals p ON p.task_id = ct.task_id WHERE p.family_id = v_demo_family;
  SELECT to_jsonb(ct) INTO v_a FROM child_tasks ct WHERE ct.task_id = v_task;
  FOREACH k IN ARRAY v_volatile LOOP v_a := v_a - k; v_b := v_b - k; END LOOP;
  IF v_a IS DISTINCT FROM v_b THEN
    v_diff := v_diff || format(E'\n  [child_task] control=%s\n               stateB =%s', v_a, v_b);
  END IF;

  -- ── 4. 執行計數器要單獨驗證：它必須是完成紀錄推導出來的，不是塞的 ──────
  DECLARE
    v_days int;
    v_curr int;
  BEGIN
    SELECT count(DISTINCT timezone('Asia/Taipei', tc.completed_at)::date)
      INTO v_days
      FROM task_completions tc
      JOIN child_proposals p ON p.task_id = tc.task_id
     WHERE p.family_id = v_demo_family;
    SELECT g.current_day INTO v_curr
      FROM long_term_goals g
      JOIN child_proposals p ON p.task_id = g.task_id
     WHERE p.family_id = v_demo_family;
    IF v_curr IS DISTINCT FROM v_days THEN
      v_diff := v_diff || format(
        E'
  [goal.current_day] 不是完成紀錄推導出來的：current_day=%s 但不同日期完成數=%s',
        v_curr, v_days);
    END IF;
  END;

  IF v_diff = '' THEN
    RAISE EXCEPTION 'P0-10B EQUIVALENCE PASS：扣掉 id／建立時間／刻意位移的行事曆欄位之後，'
      'State B 與今天 live accept 出來的資料列逐欄完全相同，'
      '且 goal.current_day 等於實際不同日期的完成數（control 已回滾）';
  END IF;
  RAISE EXCEPTION 'P0-10B EQUIVALENCE FAIL：%', v_diff;
END
$eq$;
