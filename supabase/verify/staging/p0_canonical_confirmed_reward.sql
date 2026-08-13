-- 20260821 staging verification：confirmedReward 回應 = replay 回應 = 持久化快照。
-- （self-rolling-back；所有 fixture 寫入都會被丟棄）
--
--   supabase db query --linked -f supabase/verify/staging/p0_canonical_confirmed_reward.sql
--   （跑之前先確認 linked project 是 growbook-staging）
--
-- PASS => 訊息正好是 'P0 CANONICAL CONFIRMED REWARD VERIFY PASS ...'
-- FAIL => 任何其他訊息；訊息會指名是哪一個 case 失敗。
-- non-zero exit code 在這裡不代表失敗，要讀訊息。
--
-- CASE A / B 走的是**真正的家長直接確認路徑** confirm_child_proposal_v1
-- （孩子提案 → 家長確認 → 建立正式任務 → 形成共同版本），而且各呼叫兩次：
-- 第一次成功與 idempotent replay 的回應必須逐鍵相同，也必須等於資料列。
-- 只比對其中一次證不了本輪要修的東西 —— 這個 bug 的本體就是「兩次不一樣」。
--
-- ⚠️ 幣值說明：本檔用的 7 幣純粹是測試資料，不代表任何 pricing policy。
DO $p0_canonical$
DECLARE
  v_family uuid := gen_random_uuid();
  v_user   uuid := gen_random_uuid();
  v_child  uuid := gen_random_uuid();

  v_amount int  := 7;    -- fixture only. NOT a pricing policy.
  v_start  date := DATE '2026-08-17';

  v_proposal uuid;
  v_plan     uuid;
  v_first    jsonb;
  v_replay   jsonb;
  v_row      jsonb;
  v_version  uuid;
  v_task     uuid;
  v_basis    text;
  v_target   smallint;
  v_result   jsonb;

  -- 建立一份「已送出、有一版計畫」的提案，回傳 plan version id。
  -- 每個 case 都要一份，所以參數化。
  v_claim    text;
BEGIN
  -- ── 共用 fixture ──────────────────────────────────────────────────────────
  INSERT INTO auth.users (id) VALUES (v_user);
  INSERT INTO families (id, family_name) VALUES (v_family, 'P0 canonical rollback family');
  INSERT INTO parents (family_id, name, user_id)
    VALUES (v_family, 'P0 canonical parent', v_user);
  INSERT INTO children (id, family_id, nickname, birth_date, age_group)
    VALUES (v_child, v_family, 'P0 canonical child', '2018-01-01', '6-9');
  INSERT INTO wallets (child_id, wallet_type, balance)
    VALUES (v_child, 'spending', 0);

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  -- ═════════════════════════════════════════════════════════════════════════
  -- CASE A｜long_term + fixed_days
  --
  -- 有鑑別力：任務的 claim_period 會是 'day'，legacy 推導說 per_completion，
  -- canonical 是 per_period。修好之前，第一次成功的回應必然是 per_completion。
  -- ═════════════════════════════════════════════════════════════════════════
  v_proposal := gen_random_uuid();
  v_plan     := gen_random_uuid();

  INSERT INTO child_proposals (id, family_id, child_id, status,
                               child_original_goal, proposed_at)
    VALUES (v_proposal, v_family, v_child, 'proposed', '我想一三五練琴', now());

  INSERT INTO child_proposal_plan_versions (
    id, proposal_id, version_no, authored_by,
    plan_title, purpose_category, completion_description, progress_model, next_step,
    cadence_mode, cadence_days, preferred_time, estimated_minutes,
    duration_type, duration_days, start_date,
    reward_policy, reward_eligibility, reward_policy_version, task_policy_version,
    -- ai_suggested_coin_amount 有值就一定要有 snapshot
    -- （child_proposal_plan_versions_ai_suggestion_needs_snapshot）：
    -- 「AI 建議了 7」而查不到它當時說了什麼，等於一個沒有來源的數字。
    ai_snapshot, ai_model, ai_suggested_coin_amount
  ) VALUES (
    v_plan, v_proposal, 1, 'ai',
    -- progress_model 留 NULL：weekly_rhythm 只允許配 long_term + weekly_frequency，
    -- 這裡是 fixed_days。
    '一三五練琴', 'D', '每次練 20 分鐘', NULL, '先練音階',
    'fixed_days', ARRAY[1, 3, 5], 'after_dinner', 20,
    'long_term', 14, v_start,
    'coin_eligible', 'allowed', 'p0-canonical-fixture', 'task-2026-07',
    jsonb_build_object('fixture', 'p0-canonical'), 'fixture-model', v_amount
  );
  UPDATE child_proposals SET current_plan_version_id = v_plan WHERE id = v_proposal;

  -- 第一次確認。
  v_first := confirm_child_proposal_v1(jsonb_build_object(
    'schemaVersion', 1,
    'proposalId', v_proposal,
    'expectedPlanVersionId', v_plan,
    'rewardDecision', jsonb_build_object(
      'eligibility', 'allowed',
      'rewardPolicy', 'coin_eligible',
      'rewardPolicyVersion', 'p0-canonical-fixture',
      -- minAllowed / maxAllowed 是 create_parent_task_v1 要的政策允許範圍。
      -- 這裡的 1–30 是 fixture 值，不代表任何 pricing policy。
      'coin', jsonb_build_object(
        'suggestedAmount', v_amount, 'finalAmount', v_amount,
        'minAllowed', 1, 'maxAllowed', 30)
    )
  ));
  IF COALESCE((v_first ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CASE A 第一次確認失敗：%', v_first;
  END IF;

  v_version := (v_first ->> 'planVersionId')::uuid;
  v_task    := (v_first ->> 'taskId')::uuid;

  -- 前提：任務走的是新制 per_period，而 claim_period 會讓 legacy 推導說別的。
  SELECT payout_basis, period_target_count, claim_period
    INTO v_basis, v_target, v_claim
    FROM tasks WHERE id = v_task;
  IF v_basis IS DISTINCT FROM 'per_period' OR v_target IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'CASE A 前提失敗：tasks payout=% target=%（預期 per_period / 3）',
      v_basis, v_target;
  END IF;
  IF child_proposal_payout_basis(v_claim) IS NOT DISTINCT FROM 'per_period' THEN
    RAISE EXCEPTION
      'CASE A 前提失敗：claim_period=% 的推導值剛好也是 per_period，本 case 失去鑑別力',
      v_claim;
  END IF;

  -- 第二次同樣的命令 = idempotent replay。
  v_replay := confirm_child_proposal_v1(jsonb_build_object(
    'schemaVersion', 1,
    'proposalId', v_proposal,
    'expectedPlanVersionId', v_plan,
    'rewardDecision', jsonb_build_object(
      'eligibility', 'allowed',
      'rewardPolicy', 'coin_eligible',
      'rewardPolicyVersion', 'p0-canonical-fixture',
      -- minAllowed / maxAllowed 是 create_parent_task_v1 要的政策允許範圍。
      -- 這裡的 1–30 是 fixture 值，不代表任何 pricing policy。
      'coin', jsonb_build_object(
        'suggestedAmount', v_amount, 'finalAmount', v_amount,
        'minAllowed', 1, 'maxAllowed', 30)
    )
  ));
  IF COALESCE((v_replay ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CASE A replay 失敗：%', v_replay;
  END IF;
  IF COALESCE((v_replay ->> 'idempotentReplay')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CASE A 前提失敗：第二次呼叫沒有走 replay 分支：%', v_replay;
  END IF;

  v_row := child_proposal_confirmed_reward_v1(v_version);

  -- ── 本輪的核心斷言 ───────────────────────────────────────────────────────
  IF (v_first -> 'confirmedReward') IS DISTINCT FROM v_row THEN
    RAISE EXCEPTION 'CASE A 失敗：第一次回應 ≠ 快照。第一次 = % ／ 快照 = %',
      v_first -> 'confirmedReward', v_row;
  END IF;
  IF (v_replay -> 'confirmedReward') IS DISTINCT FROM v_row THEN
    RAISE EXCEPTION 'CASE A 失敗：replay 回應 ≠ 快照。replay = % ／ 快照 = %',
      v_replay -> 'confirmedReward', v_row;
  END IF;

  IF (v_row ->> 'payoutBasis') IS DISTINCT FROM 'per_period' THEN
    RAISE EXCEPTION 'CASE A 失敗：回應的 payoutBasis 是 %（claim_period=% 的推導值贏了）',
      v_row ->> 'payoutBasis', v_claim;
  END IF;
  IF (v_row ->> 'periodTargetCount')::int IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'CASE A 失敗：回應的 periodTargetCount 是 %，預期 3',
      v_row ->> 'periodTargetCount';
  END IF;
  -- 達標次數不是 claim 上限。
  IF (v_row ->> 'periodTargetCount') IS NOT DISTINCT FROM (v_row ->> 'maxClaimsPerPeriod') THEN
    RAISE EXCEPTION 'CASE A 前提失敗：達標次數與 claim 上限剛好相同，驗不出兩者有沒有混用';
  END IF;

  -- 回應的每一個值都要對得上資料列本身，不只是對得上 helper。
  IF (v_row ->> 'payoutBasis') IS DISTINCT FROM
     (SELECT confirmed_payout_basis FROM child_proposal_plan_versions WHERE id = v_version)
    OR (v_row ->> 'periodTargetCount')::int IS DISTINCT FROM
     (SELECT confirmed_period_target_count FROM child_proposal_plan_versions WHERE id = v_version)
  THEN
    RAISE EXCEPTION 'CASE A 失敗：helper 的輸出與版本列本身對不上';
  END IF;

  -- ═════════════════════════════════════════════════════════════════════════
  -- CASE B｜one_time
  --
  -- 方向相反的鑑別力：claim_period 會是 'once'，legacy 推導說 'one_time'
  -- （快照舊詞彙），canonical 是 per_completion。
  --
  -- 不用 recurring + weekly_frequency：直接確認路徑要求 weekly_frequency 必須配
  -- progress_model = 'weekly_rhythm'，而 weekly_rhythm 只允許 long_term ——
  -- 那個組合根本進不了這條路徑。one_time 同樣有鑑別力而且是合法的計畫。
  -- ═════════════════════════════════════════════════════════════════════════
  v_proposal := gen_random_uuid();
  v_plan     := gen_random_uuid();

  INSERT INTO child_proposals (id, family_id, child_id, status,
                               child_original_goal, proposed_at)
    VALUES (v_proposal, v_family, v_child, 'proposed', '我想把書桌整理好', now());

  INSERT INTO child_proposal_plan_versions (
    id, proposal_id, version_no, authored_by,
    plan_title, purpose_category, completion_description, next_step,
    cadence_mode, preferred_time, estimated_minutes,
    duration_type, start_date,
    reward_policy, reward_eligibility, reward_policy_version, task_policy_version,
    ai_snapshot, ai_model, ai_suggested_coin_amount
  ) VALUES (
    v_plan, v_proposal, 1, 'ai',
    '整理書桌', 'C', '桌面清空、東西歸位', '先把書收回書櫃',
    'one_time', 'after_dinner', 10,
    'one_time', v_start,
    'coin_eligible', 'allowed', 'p0-canonical-fixture', 'task-2026-07',
    jsonb_build_object('fixture', 'p0-canonical'), 'fixture-model', v_amount
  );
  UPDATE child_proposals SET current_plan_version_id = v_plan WHERE id = v_proposal;

  v_first := confirm_child_proposal_v1(jsonb_build_object(
    'schemaVersion', 1, 'proposalId', v_proposal, 'expectedPlanVersionId', v_plan,
    'rewardDecision', jsonb_build_object(
      'eligibility', 'allowed', 'rewardPolicy', 'coin_eligible',
      'rewardPolicyVersion', 'p0-canonical-fixture',
      'coin', jsonb_build_object(
        'suggestedAmount', v_amount, 'finalAmount', v_amount,
        'minAllowed', 1, 'maxAllowed', 30))
  ));
  IF COALESCE((v_first ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CASE B 第一次確認失敗：%', v_first;
  END IF;

  v_version := (v_first ->> 'planVersionId')::uuid;
  v_task    := (v_first ->> 'taskId')::uuid;

  SELECT payout_basis, claim_period INTO v_basis, v_claim FROM tasks WHERE id = v_task;
  IF v_basis IS DISTINCT FROM 'per_completion' THEN
    RAISE EXCEPTION 'CASE B 前提失敗：tasks.payout_basis 是 %，預期 per_completion', v_basis;
  END IF;
  IF child_proposal_payout_basis(v_claim) IS NOT DISTINCT FROM 'per_completion' THEN
    RAISE EXCEPTION
      'CASE B 前提失敗：claim_period=% 的推導值剛好也是 per_completion，本 case 失去鑑別力',
      v_claim;
  END IF;

  v_replay := confirm_child_proposal_v1(jsonb_build_object(
    'schemaVersion', 1, 'proposalId', v_proposal, 'expectedPlanVersionId', v_plan,
    'rewardDecision', jsonb_build_object(
      'eligibility', 'allowed', 'rewardPolicy', 'coin_eligible',
      'rewardPolicyVersion', 'p0-canonical-fixture',
      'coin', jsonb_build_object(
        'suggestedAmount', v_amount, 'finalAmount', v_amount,
        'minAllowed', 1, 'maxAllowed', 30))
  ));
  IF COALESCE((v_replay ->> 'idempotentReplay')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CASE B 前提失敗：第二次呼叫沒有走 replay 分支：%', v_replay;
  END IF;

  v_row := child_proposal_confirmed_reward_v1(v_version);

  IF (v_first -> 'confirmedReward') IS DISTINCT FROM v_row
    OR (v_replay -> 'confirmedReward') IS DISTINCT FROM v_row THEN
    RAISE EXCEPTION 'CASE B 失敗：三者不一致。第一次 = % ／ replay = % ／ 快照 = %',
      v_first -> 'confirmedReward', v_replay -> 'confirmedReward', v_row;
  END IF;
  IF (v_row ->> 'payoutBasis') IS DISTINCT FROM 'per_completion' THEN
    RAISE EXCEPTION 'CASE B 失敗：回應的 payoutBasis 是 %（claim_period=% 的推導值贏了）',
      v_row ->> 'payoutBasis', v_claim;
  END IF;
  -- per_completion 不得帶達標次數。
  IF v_row -> 'periodTargetCount' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'CASE B 失敗：per_completion 的回應帶了達標次數 %',
      v_row -> 'periodTargetCount';
  END IF;

  -- ═════════════════════════════════════════════════════════════════════════
  -- CASE C｜legacy 任務的回應逐字不變
  --
  -- legacy（tasks.payout_basis IS NULL）產不出來自新的建立路徑，所以直接造一筆
  -- 舊形狀的任務，走 transition_child_proposal_v1 形成共同版本。
  -- 回應必須仍然是 claim_period 的推導值，達標次數必須是 null（不 backfill）。
  -- ═════════════════════════════════════════════════════════════════════════
  v_proposal := gen_random_uuid();
  v_plan     := gen_random_uuid();
  v_task     := gen_random_uuid();

  INSERT INTO tasks (
    id, family_id, name, category, day_type, is_active,
    claim_period, max_claims_per_period, reward_policy, reward_coin_amount,
    reward_coin_min, reward_coin_max, reward_policy_version
  ) VALUES (
    v_task, v_family, 'P0 canonical legacy', 'C', 'both', true,
    'week', 3, 'coin_eligible', v_amount, 1, 30, 'p0-canonical-fixture'
  );
  INSERT INTO child_tasks (child_id, task_id, is_active) VALUES (v_child, v_task, true);

  SELECT payout_basis INTO v_basis FROM tasks WHERE id = v_task;
  IF v_basis IS NOT NULL THEN
    RAISE EXCEPTION 'CASE C 前提失敗：legacy 任務被填了 payout_basis = %', v_basis;
  END IF;

  INSERT INTO child_proposals (id, family_id, child_id, status,
                               child_original_goal, proposed_at)
    VALUES (v_proposal, v_family, v_child, 'proposed', '舊制的想法', now());
  INSERT INTO child_proposal_plan_versions (id, proposal_id, version_no, authored_by)
    VALUES (v_plan, v_proposal, 1, 'parent');
  UPDATE child_proposals SET current_plan_version_id = v_plan WHERE id = v_proposal;

  v_result := transition_child_proposal_v1(jsonb_build_object(
    'schemaVersion', 1, 'proposalId', v_proposal,
    'toStatus', 'active', 'actorRole', 'parent', 'taskId', v_task
  ));
  IF COALESCE((v_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CASE C 轉換失敗：%', v_result;
  END IF;

  v_row := child_proposal_confirmed_reward_v1(v_plan);
  IF (v_result -> 'confirmedReward') IS DISTINCT FROM v_row THEN
    RAISE EXCEPTION 'CASE C 失敗：回應 ≠ 快照。回應 = % ／ 快照 = %',
      v_result -> 'confirmedReward', v_row;
  END IF;
  -- claim_period='week' → 推導值 per_period，逐字不變。
  IF (v_row ->> 'payoutBasis') IS DISTINCT FROM 'per_period' THEN
    RAISE EXCEPTION 'CASE C 失敗：legacy 的回應是 %，預期沿用推導值 per_period',
      v_row ->> 'payoutBasis';
  END IF;
  IF v_row -> 'periodTargetCount' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'CASE C 失敗：legacy 的回應被 backfill 了達標次數 %',
      v_row -> 'periodTargetCount';
  END IF;

  -- ═════════════════════════════════════════════════════════════════════════
  -- CASE D｜快照還沒成立時 helper 回 NULL，不回半成品
  -- ═════════════════════════════════════════════════════════════════════════
  v_proposal := gen_random_uuid();
  v_plan     := gen_random_uuid();
  INSERT INTO child_proposals (id, family_id, child_id, status, child_original_goal)
    VALUES (v_proposal, v_family, v_child, 'draft', '還沒送出');
  INSERT INTO child_proposal_plan_versions (id, proposal_id, version_no, authored_by)
    VALUES (v_plan, v_proposal, 1, 'ai');

  IF child_proposal_confirmed_reward_v1(v_plan) IS NOT NULL THEN
    RAISE EXCEPTION 'CASE D 失敗：尚未確認的版本回了一包東西：%',
      child_proposal_confirmed_reward_v1(v_plan);
  END IF;

  RAISE EXCEPTION
    'P0 CANONICAL CONFIRMED REWARD VERIFY PASS — '
    'A long_term+fixed_days（claim_period=day，推導值 per_completion）：'
    '第一次 = replay = 快照 = per_period，periodTargetCount 3 且 ≠ claim 上限 / '
    'B one_time（claim_period=once，推導值 one_time）：'
    '第一次 = replay = 快照 = per_completion，periodTargetCount 為 null / '
    'C legacy：回應 = 快照，維持推導值且達標次數為 null / '
    'D 未確認的版本回 NULL。所有 fixture 已回滾。';
END
$p0_canonical$;
