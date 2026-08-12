-- 20260819 staging verification：共同版本快照的 payout basis 以 tasks.payout_basis
-- 為 canonical truth（self-rolling-back；所有 fixture 寫入都會被丟棄）。
--
--   supabase db query --linked -f supabase/verify/staging/p0_snapshot_payout_basis.sql
--   （跑之前先確認 linked project 是 growbook-staging）
--
-- HOW TO READ THE RESULT
--   整個檔案是一個 DO block，而且**一定**以 RAISE EXCEPTION 結束。那就是 rollback
--   機制：supabase db query 把檔案當成單一 statement 送出，處理不了 psql
--   meta-command，自己中止是唯一可攜的「保證沒有 fixture 留下來」的做法。
--
--   PASS => 訊息正好是 'P0 SNAPSHOT PAYOUT BASIS VERIFY PASS ...'
--   FAIL => 任何其他訊息；訊息會指名是哪一個 case 失敗。
--
--   所以 non-zero exit code 在這裡不代表失敗。要讀訊息。
--
-- 快照走的是 canonical 寫入路徑 transition_child_proposal_v1（家長確認 →
-- 形成共同版本），不是直接 INSERT 一列版本 —— 直接 INSERT 只證得了 trigger 會動，
-- 證不了真正的寫入者會經過它。
--
-- ⚠️ 幣值說明：本檔用的 7 幣純粹是測試資料，不代表任何 pricing policy
--    （GrowBook 目前沒有正式的 per-period pricing policy，見
--    docs/LONG_TERM_REWARD_SETTLEMENT.md §8.2）。
DO $p0_snapshot$
DECLARE
  v_family uuid := gen_random_uuid();
  v_user   uuid := gen_random_uuid();
  v_child  uuid := gen_random_uuid();

  v_amount int  := 7;    -- fixture only. NOT a pricing policy. See header.

  v_task     uuid;
  v_proposal uuid;
  v_version  uuid;
  v_result   jsonb;
  v_snapshot text;
  v_basis    text;
  v_target   smallint;
  v_period   text;
  v_blocked  text;

  -- CASE 8 要沿用 CASE 2 的共同計畫，所以那組 id 得單獨留著。
  v_c2_task     uuid;
  v_c2_proposal uuid;
  v_c2_version  uuid;
  v_request     uuid;
  v_new_version uuid;

  v_snap_target smallint;
  v_snap_claims integer;
BEGIN
  -- ── 共用 fixture ──────────────────────────────────────────────────────────
  INSERT INTO auth.users (id) VALUES (v_user);
  INSERT INTO families (id, family_name) VALUES (v_family, 'P0 snapshot rollback family');
  INSERT INTO parents (family_id, name, user_id)
    VALUES (v_family, 'P0 snapshot parent', v_user);
  INSERT INTO children (id, family_id, nickname, birth_date, age_group)
    VALUES (v_child, v_family, 'P0 snapshot child', '2018-01-01', '6-9');
  INSERT INTO wallets (child_id, wallet_type, balance)
    VALUES (v_child, 'spending', 0);

  -- 家長身分。transition_child_proposal_v1 的授權讀的是 auth.uid()。
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  -- ═════════════════════════════════════════════════════════════════════════
  -- CASE 1｜long_term + weekly_frequency → 快照 per_period
  -- ═════════════════════════════════════════════════════════════════════════
  v_task     := gen_random_uuid();
  v_proposal := gen_random_uuid();
  v_version  := gen_random_uuid();

  INSERT INTO tasks (
    id, family_id, name, category, day_type, is_active, is_long_term, long_term_type,
    claim_period, max_claims_per_period, reward_policy, reward_coin_amount,
    reward_coin_min, reward_coin_max, reward_policy_version,
    duration_type, schedule_mode, weekly_frequency, progress_model
  ) VALUES (
    -- max_claims_per_period 刻意給 5 而 weekly_frequency 給 3：兩個數字不一樣，
    -- 「拿 claim 上限當達標次數」才驗得出來。
    v_task, v_family, 'P0 snapshot weekly', 'D', 'both', true, true, 'habit',
    'week', 5, 'coin_eligible', v_amount, 1, 30, 'p0-snapshot-fixture',
    'long_term', 'weekly_frequency', 3, 'weekly_rhythm'
  );
  -- child_proposal_guard_linked_task：共同版本的任務必須真的指派給這個孩子。
  INSERT INTO child_tasks (child_id, task_id, is_active) VALUES (v_child, v_task, true);

  -- 建立 trigger 應該自己推出 per_period / 3。先確認這個前提成立，
  -- 否則後面的快照斷言會在錯誤的理由下通過。
  SELECT payout_basis, period_target_count INTO v_basis, v_target
    FROM tasks WHERE id = v_task;
  IF v_basis IS DISTINCT FROM 'per_period' OR v_target IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'CASE 1 前提失敗：tasks.payout_basis=% target=%（預期 per_period / 3）',
      v_basis, v_target;
  END IF;

  INSERT INTO child_proposals (id, family_id, child_id, status,
                               child_original_goal, current_plan_version_id, proposed_at)
    VALUES (v_proposal, v_family, v_child, 'proposed', '我想每週讀三次', NULL, now());
  INSERT INTO child_proposal_plan_versions (id, proposal_id, version_no, authored_by)
    VALUES (v_version, v_proposal, 1, 'parent');
  UPDATE child_proposals SET current_plan_version_id = v_version WHERE id = v_proposal;

  v_result := transition_child_proposal_v1(jsonb_build_object(
    'schemaVersion', 1, 'proposalId', v_proposal,
    'toStatus', 'active', 'actorRole', 'parent', 'taskId', v_task
  ));
  IF COALESCE((v_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CASE 1 轉換失敗：%', v_result;
  END IF;

  SELECT confirmed_payout_basis, confirmed_period_target_count, confirmed_max_claims_per_period
    INTO v_snapshot, v_snap_target, v_snap_claims
    FROM child_proposal_plan_versions WHERE id = v_version;
  IF v_snapshot IS DISTINCT FROM 'per_period' THEN
    RAISE EXCEPTION 'CASE 1 失敗：weekly_frequency 的快照是 %，預期 per_period', v_snapshot;
  END IF;
  -- 達標次數要跟著被記下來，而且必須是 3（cadence），不是 5（claim 上限）。
  IF v_snap_target IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'CASE 1 失敗：快照的達標次數是 %，預期 3（claim 上限是 %）',
      v_snap_target, v_snap_claims;
  END IF;
  IF v_snap_claims IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'CASE 1 前提失敗：confirmed_max_claims_per_period 是 %，預期 5', v_snap_claims;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- CASE 6｜payout_basis / period_target_count 仍受 renegotiation guard
  --
  -- 放在這裡是因為 CASE 1 的任務現在正是一個 active shared plan task ——
  -- 這正是 guard 該生效的狀態，不必再造一個。
  -- ═══════════════════════════════════════════════════════════════════════
  IF NOT is_active_shared_plan_task_v1(v_task) THEN
    RAISE EXCEPTION 'CASE 6 前提失敗：CASE 1 的任務不是 active shared plan task';
  END IF;

  v_blocked := NULL;
  BEGIN
    -- 兩欄一起改，否則會先撞 tasks_period_target_scope_check 而不是 guard。
    UPDATE tasks SET payout_basis = 'per_completion', period_target_count = NULL
     WHERE id = v_task;
  EXCEPTION WHEN OTHERS THEN
    v_blocked := SQLERRM;
  END;
  IF v_blocked IS NULL OR v_blocked NOT LIKE '%SHARED_PLAN_REQUIRES_RENEGOTIATION%' THEN
    RAISE EXCEPTION 'CASE 6a 失敗：改 payout_basis 得到 %，預期 SHARED_PLAN_REQUIRES_RENEGOTIATION',
      COALESCE(v_blocked, '（沒有被擋下）');
  END IF;

  v_blocked := NULL;
  BEGIN
    UPDATE tasks SET period_target_count = 2 WHERE id = v_task;
  EXCEPTION WHEN OTHERS THEN
    v_blocked := SQLERRM;
  END;
  IF v_blocked IS NULL OR v_blocked NOT LIKE '%SHARED_PLAN_REQUIRES_RENEGOTIATION%' THEN
    RAISE EXCEPTION 'CASE 6b 失敗：改 period_target_count 得到 %，預期 SHARED_PLAN_REQUIRES_RENEGOTIATION',
      COALESCE(v_blocked, '（沒有被擋下）');
  END IF;

  -- ═════════════════════════════════════════════════════════════════════════
  -- CASE 2｜long_term + fixed_days → 快照 per_period
  --
  -- 這一個是有鑑別力的：claim_period = 'day'，legacy 推導會說 per_completion。
  -- 快照若還是 per_completion，就代表 canonical truth 沒有生效。
  -- ═════════════════════════════════════════════════════════════════════════
  v_task     := gen_random_uuid();
  v_proposal := gen_random_uuid();
  v_version  := gen_random_uuid();

  INSERT INTO tasks (
    id, family_id, name, category, day_type, is_active, is_long_term, long_term_type,
    claim_period, max_claims_per_period, reward_policy, reward_coin_amount,
    reward_coin_min, reward_coin_max, reward_policy_version,
    duration_type, schedule_mode, recurrence_days
  ) VALUES (
    v_task, v_family, 'P0 snapshot fixed days', 'D', 'both', true, true, 'habit',
    'day', 1, 'coin_eligible', v_amount, 1, 30, 'p0-snapshot-fixture',
    'long_term', 'fixed_days', ARRAY[1, 3, 5]
  );
  INSERT INTO child_tasks (child_id, task_id, is_active) VALUES (v_child, v_task, true);

  IF child_proposal_payout_basis('day') IS DISTINCT FROM 'per_completion' THEN
    RAISE EXCEPTION 'CASE 2 前提失敗：legacy 推導不再把 day 映成 per_completion，本 case 失去鑑別力';
  END IF;

  INSERT INTO child_proposals (id, family_id, child_id, status,
                               child_original_goal, proposed_at)
    VALUES (v_proposal, v_family, v_child, 'proposed', '我想一三五練琴', now());
  INSERT INTO child_proposal_plan_versions (id, proposal_id, version_no, authored_by)
    VALUES (v_version, v_proposal, 1, 'parent');
  UPDATE child_proposals SET current_plan_version_id = v_version WHERE id = v_proposal;

  v_result := transition_child_proposal_v1(jsonb_build_object(
    'schemaVersion', 1, 'proposalId', v_proposal,
    'toStatus', 'active', 'actorRole', 'parent', 'taskId', v_task
  ));
  IF COALESCE((v_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CASE 2 轉換失敗：%', v_result;
  END IF;

  SELECT confirmed_payout_basis, confirmed_claim_period, confirmed_period_target_count
    INTO v_snapshot, v_period, v_snap_target
    FROM child_proposal_plan_versions WHERE id = v_version;
  IF v_snapshot IS DISTINCT FROM 'per_period' THEN
    RAISE EXCEPTION 'CASE 2 失敗：fixed_days 的快照是 %，預期 per_period（claim_period=%）',
      v_snapshot, v_period;
  END IF;
  -- 三個固定日 → 達標次數 3；claim 上限是 1，兩者不能混。
  IF v_snap_target IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'CASE 2 失敗：fixed_days 的達標次數是 %，預期 3', v_snap_target;
  END IF;
  -- claim_period 本身仍然照抄，它是另一個維度，不該被連帶改掉。
  IF v_period IS DISTINCT FROM 'day' THEN
    RAISE EXCEPTION 'CASE 2 失敗：confirmed_claim_period 被動到了（%）', v_period;
  END IF;

  v_c2_task     := v_task;
  v_c2_proposal := v_proposal;
  v_c2_version  := v_version;

  -- ═════════════════════════════════════════════════════════════════════════
  -- CASE 3｜per_completion → 快照 per_completion
  --
  -- 同樣有鑑別力，方向相反：claim_period = 'week'，legacy 推導會說 per_period。
  -- ═════════════════════════════════════════════════════════════════════════
  v_task     := gen_random_uuid();
  v_proposal := gen_random_uuid();
  v_version  := gen_random_uuid();

  INSERT INTO tasks (
    id, family_id, name, category, day_type, is_active,
    claim_period, max_claims_per_period, reward_policy, reward_coin_amount,
    reward_coin_min, reward_coin_max, reward_policy_version,
    duration_type, schedule_mode, weekly_frequency
  ) VALUES (
    v_task, v_family, 'P0 snapshot recurring', 'C', 'both', true,
    'week', 3, 'coin_eligible', v_amount, 1, 30, 'p0-snapshot-fixture',
    'recurring', 'weekly_frequency', 3
  );
  INSERT INTO child_tasks (child_id, task_id, is_active) VALUES (v_child, v_task, true);

  SELECT payout_basis INTO v_basis FROM tasks WHERE id = v_task;
  IF v_basis IS DISTINCT FROM 'per_completion' THEN
    RAISE EXCEPTION 'CASE 3 前提失敗：recurring 的 payout_basis 是 %，預期 per_completion', v_basis;
  END IF;
  IF child_proposal_payout_basis('week') IS DISTINCT FROM 'per_period' THEN
    RAISE EXCEPTION 'CASE 3 前提失敗：legacy 推導不再把 week 映成 per_period，本 case 失去鑑別力';
  END IF;

  INSERT INTO child_proposals (id, family_id, child_id, status,
                               child_original_goal, proposed_at)
    VALUES (v_proposal, v_family, v_child, 'proposed', '我想一週澆三次花', now());
  INSERT INTO child_proposal_plan_versions (id, proposal_id, version_no, authored_by)
    VALUES (v_version, v_proposal, 1, 'parent');
  UPDATE child_proposals SET current_plan_version_id = v_version WHERE id = v_proposal;

  v_result := transition_child_proposal_v1(jsonb_build_object(
    'schemaVersion', 1, 'proposalId', v_proposal,
    'toStatus', 'active', 'actorRole', 'parent', 'taskId', v_task
  ));
  IF COALESCE((v_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CASE 3 轉換失敗：%', v_result;
  END IF;

  SELECT confirmed_payout_basis, confirmed_period_target_count
    INTO v_snapshot, v_snap_target
    FROM child_proposal_plan_versions WHERE id = v_version;
  IF v_snapshot IS DISTINCT FROM 'per_completion' THEN
    RAISE EXCEPTION 'CASE 3 失敗：per_completion 任務的快照是 %（claim_period=week 的推導值贏了）',
      v_snapshot;
  END IF;
  -- 達標次數只屬於 per_period。這裡有值就代表憑空多了一個數字。
  IF v_snap_target IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 3 失敗：per_completion 快照帶了達標次數 %', v_snap_target;
  END IF;

  -- ═════════════════════════════════════════════════════════════════════════
  -- CASE 4｜legacy（payout_basis IS NULL）→ 維持 claim_period 推導
  --
  -- 遷移零列的另一面：既有任務的快照行為一個字都不能變。
  -- ═════════════════════════════════════════════════════════════════════════
  v_task     := gen_random_uuid();
  v_proposal := gen_random_uuid();
  v_version  := gen_random_uuid();

  -- 沒有 duration_type → 建立 trigger 留 NULL，這就是 legacy 任務的形狀。
  INSERT INTO tasks (
    id, family_id, name, category, day_type, is_active,
    claim_period, max_claims_per_period, reward_policy, reward_coin_amount,
    reward_coin_min, reward_coin_max, reward_policy_version
  ) VALUES (
    v_task, v_family, 'P0 snapshot legacy', 'C', 'both', true,
    'week', 3, 'coin_eligible', v_amount, 1, 30, 'p0-snapshot-fixture'
  );
  INSERT INTO child_tasks (child_id, task_id, is_active) VALUES (v_child, v_task, true);

  SELECT payout_basis INTO v_basis FROM tasks WHERE id = v_task;
  IF v_basis IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 4 前提失敗：legacy 任務被填了 payout_basis = %', v_basis;
  END IF;

  INSERT INTO child_proposals (id, family_id, child_id, status,
                               child_original_goal, proposed_at)
    VALUES (v_proposal, v_family, v_child, 'proposed', '舊制的想法', now());
  INSERT INTO child_proposal_plan_versions (id, proposal_id, version_no, authored_by)
    VALUES (v_version, v_proposal, 1, 'parent');
  UPDATE child_proposals SET current_plan_version_id = v_version WHERE id = v_proposal;

  v_result := transition_child_proposal_v1(jsonb_build_object(
    'schemaVersion', 1, 'proposalId', v_proposal,
    'toStatus', 'active', 'actorRole', 'parent', 'taskId', v_task
  ));
  IF COALESCE((v_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CASE 4 轉換失敗：%', v_result;
  END IF;

  SELECT confirmed_payout_basis, confirmed_period_target_count
    INTO v_snapshot, v_snap_target
    FROM child_proposal_plan_versions WHERE id = v_version;
  -- claim_period = 'week' → legacy 推導 = per_period。逐字不變。
  IF v_snapshot IS DISTINCT FROM 'per_period' THEN
    RAISE EXCEPTION 'CASE 4 失敗：legacy 任務的快照是 %，預期沿用推導值 per_period', v_snapshot;
  END IF;
  -- legacy 的 per_period 是推導出來的，家庭從來沒有確認過任何達標次數。
  -- 這裡塞一個數字進去就是替他們補簽一份沒發生過的約定。
  IF v_snap_target IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 4 失敗：legacy 快照被 backfill 了達標次數 %', v_snap_target;
  END IF;

  -- ═════════════════════════════════════════════════════════════════════════
  -- CASE 5｜claim_period 單獨變動不能改 payout semantics
  --
  -- 任務在還不是 shared plan 的時候把 claim_period 從 week 改成 day
  -- （legacy 推導會因此從 per_period 翻成 per_completion），然後才形成共同版本。
  -- 快照必須仍然是 per_period。
  -- ═════════════════════════════════════════════════════════════════════════
  v_task     := gen_random_uuid();
  v_proposal := gen_random_uuid();
  v_version  := gen_random_uuid();

  INSERT INTO tasks (
    id, family_id, name, category, day_type, is_active, is_long_term, long_term_type,
    claim_period, max_claims_per_period, reward_policy, reward_coin_amount,
    reward_coin_min, reward_coin_max, reward_policy_version,
    duration_type, schedule_mode, weekly_frequency, progress_model
  ) VALUES (
    v_task, v_family, 'P0 snapshot claim flip', 'D', 'both', true, true, 'habit',
    'week', 4, 'coin_eligible', v_amount, 1, 30, 'p0-snapshot-fixture',
    'long_term', 'weekly_frequency', 4, 'weekly_rhythm'
  );
  INSERT INTO child_tasks (child_id, task_id, is_active) VALUES (v_child, v_task, true);

  UPDATE tasks SET claim_period = 'day', max_claims_per_period = 1 WHERE id = v_task;

  SELECT payout_basis, period_target_count INTO v_basis, v_target
    FROM tasks WHERE id = v_task;
  IF v_basis IS DISTINCT FROM 'per_period' OR v_target IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'CASE 5 失敗：改 claim_period 之後 payout semantics 變成 % / %',
      v_basis, v_target;
  END IF;

  INSERT INTO child_proposals (id, family_id, child_id, status,
                               child_original_goal, proposed_at)
    VALUES (v_proposal, v_family, v_child, 'proposed', '我想每週跑四次', now());
  INSERT INTO child_proposal_plan_versions (id, proposal_id, version_no, authored_by)
    VALUES (v_version, v_proposal, 1, 'parent');
  UPDATE child_proposals SET current_plan_version_id = v_version WHERE id = v_proposal;

  v_result := transition_child_proposal_v1(jsonb_build_object(
    'schemaVersion', 1, 'proposalId', v_proposal,
    'toStatus', 'active', 'actorRole', 'parent', 'taskId', v_task
  ));
  IF COALESCE((v_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CASE 5 轉換失敗：%', v_result;
  END IF;

  SELECT confirmed_payout_basis, confirmed_claim_period,
         confirmed_period_target_count, confirmed_max_claims_per_period
    INTO v_snapshot, v_period, v_snap_target, v_snap_claims
    FROM child_proposal_plan_versions WHERE id = v_version;
  IF v_snapshot IS DISTINCT FROM 'per_period' OR v_period IS DISTINCT FROM 'day' THEN
    RAISE EXCEPTION 'CASE 5 失敗：快照 payout=% claim=%（預期 per_period / day）',
      v_snapshot, v_period;
  END IF;
  -- claim 上限已經被改成 1，達標次數必須仍然是 4。
  -- 這一條是「不得用 max_claims_per_period 代替」最直接的證據。
  IF v_snap_target IS DISTINCT FROM 4 OR v_snap_claims IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CASE 5 失敗：達標次數 % / claim 上限 %（預期 4 / 1）',
      v_snap_target, v_snap_claims;
  END IF;

  -- ═════════════════════════════════════════════════════════════════════════
  -- CASE 7｜既有 confirmed 版本不被改寫
  --
  -- 不在必要清單裡，但它是「不 backfill」在執行期的證據：對一列已經 confirmed
  -- 的版本做無關欄位的 UPDATE（superseded_at，P0-8M 的接受流程每次都會做），
  -- 本 trigger 不得因此重算快照，也不得害那個 UPDATE 撞上 write-once guard。
  -- ═════════════════════════════════════════════════════════════════════════
  v_blocked := NULL;
  BEGIN
    UPDATE child_proposal_plan_versions SET superseded_at = now() WHERE id = v_version;
  EXCEPTION WHEN OTHERS THEN
    v_blocked := SQLERRM;
  END;
  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 7 失敗：無關欄位的 UPDATE 被擋下了（%）', v_blocked;
  END IF;

  SELECT confirmed_payout_basis INTO v_snapshot
    FROM child_proposal_plan_versions WHERE id = v_version;
  IF v_snapshot IS DISTINCT FROM 'per_period' THEN
    RAISE EXCEPTION 'CASE 7 失敗：既有 confirmed 快照被動到了（%）', v_snapshot;
  END IF;

  -- ═════════════════════════════════════════════════════════════════════════
  -- CASE 8｜第二條寫入路徑：P0-8M 的換時段再協商（INSERT 新版本）
  --
  -- 上面七個 case 走的都是 transition_child_proposal_v1（UPDATE 既有版本列）。
  -- accept_child_proposal_adjustment_v1 是**另一條**寫入路徑，它 INSERT 一整列
  -- 新版本、並在 INSERT 裡直接呼叫 child_proposal_payout_basis(claim_period)。
  -- trigger 若只在 UPDATE 上生效，這條路徑會繼續產生錯的快照 —— 而且是在
  -- 「孩子提出換時段、家長按下同意」這個最常見的日常操作上。
  --
  -- 沿用 CASE 2 的共同計畫：claim_period = 'day'（推導 per_completion）、
  -- canonical = per_period。新版本必須拿到 per_period。
  -- ═════════════════════════════════════════════════════════════════════════
  v_result := create_child_proposal_adjustment_request_v1(jsonb_build_object(
    'schemaVersion', 1, 'proposalId', v_c2_proposal,
    'expectedPlanVersionId', v_c2_version,
    'adjustmentKind', 'preferred_time', 'reason', '晚餐後比較有精神',
    'requestedChanges', jsonb_build_object('preferredTime', 'after_dinner')
  ));
  IF COALESCE((v_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CASE 8 建立調整請求失敗：%', v_result;
  END IF;
  v_request := (v_result ->> 'adjustmentRequestId')::uuid;

  v_result := accept_child_proposal_adjustment_v1(jsonb_build_object(
    'schemaVersion', 1, 'adjustmentRequestId', v_request,
    'expectedPlanVersionId', v_c2_version
  ));
  IF COALESCE((v_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CASE 8 接受調整失敗：%', v_result;
  END IF;
  v_new_version := (v_result ->> 'planVersionId')::uuid;

  IF v_new_version IS NULL OR v_new_version = v_c2_version THEN
    RAISE EXCEPTION 'CASE 8 前提失敗：沒有產生新的版本列（%）', v_new_version;
  END IF;

  SELECT confirmed_payout_basis, confirmed_claim_period, confirmed_period_target_count
    INTO v_snapshot, v_period, v_snap_target
    FROM child_proposal_plan_versions WHERE id = v_new_version;
  IF v_snapshot IS DISTINCT FROM 'per_period' THEN
    RAISE EXCEPTION
      'CASE 8 失敗：換時段產生的新版本快照是 %（claim_period=% 的推導值贏了，INSERT 路徑沒被涵蓋）',
      v_snapshot, v_period;
  END IF;
  -- 換時段不動回饋，達標次數要原樣帶到新版本。
  IF v_snap_target IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'CASE 8 失敗：新版本的達標次數是 %，預期 3', v_snap_target;
  END IF;

  -- 舊版本仍然是原來那個值，沒有被這次 INSERT 連帶改寫。
  SELECT confirmed_payout_basis INTO v_snapshot
    FROM child_proposal_plan_versions WHERE id = v_c2_version;
  IF v_snapshot IS DISTINCT FROM 'per_period' THEN
    RAISE EXCEPTION 'CASE 8 失敗：上一版的快照被動到了（%）', v_snapshot;
  END IF;

  -- ═════════════════════════════════════════════════════════════════════════
  -- CASE 9｜達標次數與其他 confirmed 證據一樣是 write-once
  --
  -- 「當初講好一週幾次」被事後改掉，跟幣值被事後改掉是同一件事。
  -- ═════════════════════════════════════════════════════════════════════════
  v_blocked := NULL;
  BEGIN
    UPDATE child_proposal_plan_versions
       SET confirmed_period_target_count = 1
     WHERE id = v_new_version;
  EXCEPTION WHEN OTHERS THEN
    v_blocked := SQLERRM;
  END;
  IF v_blocked IS NULL THEN
    RAISE EXCEPTION 'CASE 9 失敗：已確認版本的達標次數被改掉了';
  END IF;

  SELECT confirmed_period_target_count INTO v_snap_target
    FROM child_proposal_plan_versions WHERE id = v_new_version;
  IF v_snap_target IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'CASE 9 失敗：達標次數變成了 %', v_snap_target;
  END IF;

  -- ═════════════════════════════════════════════════════════════════════════
  -- CASE 10｜P0-8M 本身的結果沒有被這幾支 migration 影響
  --
  -- CASE 8 證的是「新版本的快照對」，這裡證的是「換時段這件事真的成立了」：
  -- 任務的時段有移動、請求收斂成 accepted、current 指標指到新版本。
  -- P0-8G 的 guard 若把 preferred_time 當成 material change，accept 會整個失敗
  -- （那正是 20260818 差點造成的回歸），所以這一組斷言同時是那道 guard 的回歸測試。
  -- ═════════════════════════════════════════════════════════════════════════
  SELECT preferred_time INTO v_period FROM tasks WHERE id = v_c2_task;
  IF v_period IS DISTINCT FROM 'after_dinner' THEN
    RAISE EXCEPTION 'CASE 10 失敗：任務的時段沒有移動（%）', v_period;
  END IF;

  SELECT status INTO v_period FROM child_proposal_adjustment_requests WHERE id = v_request;
  IF v_period IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'CASE 10 失敗：調整請求的狀態是 %，預期 accepted', v_period;
  END IF;

  IF (SELECT current_plan_version_id FROM child_proposals WHERE id = v_c2_proposal)
     IS DISTINCT FROM v_new_version THEN
    RAISE EXCEPTION 'CASE 10 失敗：current 指標沒有移到新版本';
  END IF;

  -- 上一版被收掉了 —— 而那個 superseded_at 的 UPDATE 正好會經過本輪新加的
  -- 兩支 trigger。它沒炸，就是 CASE 7 / CASE 9 的 guard 沒有波及無關寫入的證據。
  IF (SELECT superseded_at FROM child_proposal_plan_versions WHERE id = v_c2_version)
     IS NULL THEN
    RAISE EXCEPTION 'CASE 10 失敗：上一版沒有被標記 superseded';
  END IF;

  RAISE EXCEPTION
    'P0 SNAPSHOT PAYOUT BASIS VERIFY PASS — 1 weekly_frequency→per_period / '
    '2 fixed_days→per_period(claim=day) / 3 recurring→per_completion(claim=week) / '
    '4 legacy→推導值不變 / 5 claim_period 單獨變動不改語意 / '
    '6 payout_basis 與 period_target_count 仍受 renegotiation guard / '
    '7 既有 confirmed 快照不被改寫 / '
    '8 P0-8M 換時段的 INSERT 路徑也拿到 canonical per_period / '
    '9 達標次數 write-once / 10 P0-8M 換時段的結果本身不受影響。'
    'period target 快照：case 1 = 3（claim 上限 5）、case 2 = 3、case 5 = 4（claim 上限 1）、'
    'case 8 = 3；per_completion 與 legacy 皆為 NULL。所有 fixture 已回滾。';
END
$p0_snapshot$;
