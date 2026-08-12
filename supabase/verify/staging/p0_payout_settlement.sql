-- P0 payout settlement staging verification (self-rolling-back; every fixture write is discarded).
--
-- Run only after explicitly targeting the staging project. Do not rely on the
-- linked project from supabase/config.toml — it points at production:
--   supabase db query --linked -f supabase/verify/staging/p0_payout_settlement.sql
--   (after `supabase projects list` shows growbook-staging as LINKED)
--
-- HOW TO READ THE RESULT
--   One DO block that ALWAYS ends in RAISE EXCEPTION. That is the rollback
--   mechanism: `supabase db query` sends the file as a single statement and
--   cannot process psql meta-commands, so aborting ourselves is the only
--   portable way to guarantee no fixture survives.
--
--   PASS  => the message is exactly 'P0 PAYOUT SETTLEMENT VERIFY PASS ...'
--   FAIL  => any other message; it names the case that failed.
--
--   A non-zero exit code therefore does NOT mean failure here. Read the message.
--
-- ⚠️ 幣值說明：本檔用的 7 幣純粹是測試資料。
--    GrowBook **目前沒有正式的 per-period pricing policy**（見
--    docs/LONG_TERM_REWARD_SETTLEMENT.md §8.2），這個數字不代表任何政策推導，
--    也不得被引用為 weekly pricing 的依據。
DO $p0_payout$
DECLARE
  v_family      uuid := gen_random_uuid();
  v_user        uuid := gen_random_uuid();
  v_child       uuid := gen_random_uuid();
  v_wallet      uuid := gen_random_uuid();
  v_task_period uuid := gen_random_uuid();
  v_task_legacy uuid := gen_random_uuid();
  v_task_future uuid := gen_random_uuid();
  v_task_unsup  uuid := gen_random_uuid();
  v_goal_period uuid := gen_random_uuid();

  v_monday      date := date_trunc('week', DATE '2026-08-12')::date;
  v_next_monday date;
  v_amount      int  := 7;    -- fixture only. NOT a pricing policy. See header.
  v_target      int  := 4;

  v_result      jsonb;
  v_balance     int;
  v_before      int;
  v_settlements int;
  v_tx_total    int;
  v_completions int;
  v_dupe_blocked boolean := false;
  v_immutable_blocked boolean := false;
  v_coin_earned int;
BEGIN
  v_next_monday := v_monday + 7;

  -- ── fixtures ──────────────────────────────────────────────────────────────
  INSERT INTO auth.users (id) VALUES (v_user);

  INSERT INTO families (id, family_name) VALUES (v_family, 'P0 payout rollback family');

  INSERT INTO parents (family_id, name, user_id)
  VALUES (v_family, 'P0 payout parent', v_user);

  INSERT INTO children (id, family_id, nickname, birth_date, age_group)
  VALUES (v_child, v_family, 'P0 payout child', '2018-01-01', '6-9');

  INSERT INTO wallets (id, child_id, wallet_type, balance)
  VALUES (v_wallet, v_child, 'spending', 0);

  -- 每週 4 次的長期閱讀計畫。max_claims 給 5，才驗得到「第 5 次不再發」。
  -- payout_basis 顯式給值 → BEFORE INSERT trigger 不覆寫。
  INSERT INTO tasks (
    id, family_id, name, category, day_type, is_active, is_long_term, long_term_type,
    claim_period, max_claims_per_period, reward_policy, reward_coin_amount,
    reward_coin_min, reward_coin_max, reward_policy_version,
    duration_type, schedule_mode, weekly_frequency, progress_model,
    payout_basis, period_target_count, payout_basis_effective_from
  ) VALUES (
    v_task_period, v_family, 'P0 weekly reading', 'D', 'both', true, true, 'habit',
    'week', 5, 'coin_eligible', v_amount, 1, 30, 'p0-payout-fixture',
    'long_term', 'weekly_frequency', 4, 'weekly_rhythm',
    'per_period', v_target, v_monday
  );

  -- legacy：payout_basis NULL，行為必須與這支 migration 之前逐字相同。
  INSERT INTO tasks (
    id, family_id, name, category, day_type, is_active,
    claim_period, max_claims_per_period, base_time_min, difficulty, coin_override
  ) VALUES (
    v_task_legacy, v_family, 'P0 legacy per-completion', 'C', 'both', true,
    'day', 1, 10, 1, 6
  );

  -- mid-period transition：新語意要到下週一才生效。
  INSERT INTO tasks (
    id, family_id, name, category, day_type, is_active,
    claim_period, max_claims_per_period, reward_policy, reward_coin_amount,
    reward_coin_min, reward_coin_max, reward_policy_version,
    duration_type, schedule_mode, weekly_frequency,
    payout_basis, period_target_count, payout_basis_effective_from
  ) VALUES (
    v_task_future, v_family, 'P0 switching next week', 'C', 'both', true,
    'day', 1, 'coin_eligible', v_amount, 1, 30, 'p0-payout-fixture',
    'long_term', 'weekly_frequency', 4,
    'per_period', v_target, v_next_monday
  );

  -- Phase 2 才實作的 basis：必須 fail closed。
  INSERT INTO tasks (
    id, family_id, name, category, day_type, is_active,
    claim_period, max_claims_per_period, reward_policy, reward_coin_amount,
    reward_coin_min, reward_coin_max, reward_policy_version,
    duration_type, schedule_mode,
    payout_basis, payout_basis_effective_from
  ) VALUES (
    v_task_unsup, v_family, 'P0 unsupported basis', 'D', 'both', true,
    'day', 1, 'coin_eligible', v_amount, 1, 30, 'p0-payout-fixture',
    'long_term', 'fixed_days',
    'per_milestone', v_monday
  );

  INSERT INTO child_tasks (child_id, task_id, is_active) VALUES
    (v_child, v_task_period, true),
    (v_child, v_task_legacy, true),
    (v_child, v_task_future, true),
    (v_child, v_task_unsup,  true);

  INSERT INTO long_term_goals (id, child_id, task_id, goal_type, current_day, status)
  VALUES (v_goal_period, v_child, v_task_period, 'habit', 0, 'active');

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  -- ══ A. 第 1–3 次：只記 progress，錢包不動 ═══════════════════════════════
  FOR i IN 0..2 LOOP
    v_result := complete_task(
      v_task_period, v_child, ((v_monday + i)::text || ' 09:00+08')::timestamptz, true, v_goal_period
    );

    SELECT balance INTO v_balance FROM wallets WHERE id = v_wallet;

    IF v_result->>'coinEarned' <> '0' OR v_balance <> 0 THEN
      RAISE EXCEPTION 'P0 payout verify: completion % minted coins before the period target (result %, balance %)',
        i + 1, v_result, v_balance;
    END IF;

    IF v_result->'settlement' <> 'null'::jsonb THEN
      RAISE EXCEPTION 'P0 payout verify: completion % produced a settlement: %', i + 1, v_result;
    END IF;

    IF (v_result->'period'->>'done')::int <> i + 1
      OR (v_result->'period'->>'target')::int <> v_target
      OR (v_result->'period'->>'settled')::boolean <> false
    THEN
      RAISE EXCEPTION 'P0 payout verify: period progress wrong at completion %: %', i + 1, v_result;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_completions
  FROM task_completions WHERE task_id = v_task_period AND child_id = v_child;
  SELECT count(*) INTO v_settlements
  FROM reward_settlements WHERE task_id = v_task_period AND child_id = v_child;

  IF v_completions <> 3 OR v_settlements <> 0 THEN
    RAISE EXCEPTION 'P0 payout verify: expected 3 progress rows and 0 settlements, got % / %',
      v_completions, v_settlements;
  END IF;

  -- ══ B. 第 4 次（達標）：結算一次 ════════════════════════════════════════
  v_result := complete_task(
    v_task_period, v_child, ((v_monday + 3)::text || ' 09:00+08')::timestamptz, true, v_goal_period
  );

  SELECT balance INTO v_balance FROM wallets WHERE id = v_wallet;

  IF (v_result->>'coinEarned')::int <> v_amount
    OR v_balance <> v_amount
    OR (v_result->'settlement'->>'coinAmount')::int <> v_amount
    OR v_result->'settlement'->>'basis' <> 'per_period'
    OR (v_result->'period'->>'settled')::boolean <> true
  THEN
    RAISE EXCEPTION 'P0 payout verify: target completion did not settle once: result %, balance %',
      v_result, v_balance;
  END IF;

  -- 達標那一次的 completion 記錄實際 mint 的金額（週報統計靠它）。
  SELECT coin_earned INTO v_coin_earned
  FROM task_completions WHERE id = (v_result->>'completionId')::uuid;
  IF v_coin_earned <> v_amount THEN
    RAISE EXCEPTION 'P0 payout verify: settling completion did not record coin_earned: %', v_coin_earned;
  END IF;

  -- 三者一致：wallet delta = settlement 金額 = transaction 金額。
  SELECT count(*) INTO v_settlements
  FROM reward_settlements WHERE task_id = v_task_period AND child_id = v_child;
  SELECT COALESCE(sum(t.amount), 0) INTO v_tx_total
  FROM transactions t
  JOIN reward_settlements rs ON rs.transaction_id = t.id
  WHERE rs.task_id = v_task_period AND rs.child_id = v_child;

  IF v_settlements <> 1 OR v_tx_total <> v_amount OR v_balance <> v_tx_total THEN
    RAISE EXCEPTION 'P0 payout verify: wallet/settlement/transaction disagree: % / % / %',
      v_balance, v_settlements, v_tx_total;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM reward_settlements
    WHERE task_id = v_task_period AND child_id = v_child
      AND reward_basis = 'per_period' AND period_start = v_monday
  ) THEN
    RAISE EXCEPTION 'P0 payout verify: settlement is not keyed to this period';
  END IF;

  -- ══ C. 第 5 次：留下紀錄，但不再發第二份本週回饋 ═══════════════════════
  SELECT balance INTO v_before FROM wallets WHERE id = v_wallet;
  v_result := complete_task(
    v_task_period, v_child, ((v_monday + 4)::text || ' 09:00+08')::timestamptz, true, v_goal_period
  );
  SELECT balance INTO v_balance FROM wallets WHERE id = v_wallet;
  SELECT count(*) INTO v_settlements
  FROM reward_settlements WHERE task_id = v_task_period AND child_id = v_child;

  IF v_balance <> v_before OR v_settlements <> 1 OR v_result->'settlement' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'P0 payout verify: the 5th completion paid again: %, balance % -> %',
      v_result, v_before, v_balance;
  END IF;

  -- 額外投入紀錄仍然留著。
  SELECT count(*) INTO v_completions
  FROM task_completions WHERE task_id = v_task_period AND child_id = v_child;
  IF v_completions <> 5 THEN
    RAISE EXCEPTION 'P0 payout verify: extra effort was not recorded: % completions', v_completions;
  END IF;

  -- ══ D. 重試同一天：typed error，且不動錢包 ═════════════════════════════
  SELECT balance INTO v_before FROM wallets WHERE id = v_wallet;
  v_result := complete_task(
    v_task_period, v_child, ((v_monday + 3)::text || ' 21:00+08')::timestamptz, true, v_goal_period
  );
  SELECT balance INTO v_balance FROM wallets WHERE id = v_wallet;

  IF v_result->>'error' <> 'already_completed' OR v_balance <> v_before THEN
    RAISE EXCEPTION 'P0 payout verify: same-day retry was not side-effect-free: %', v_result;
  END IF;

  -- ══ E. 併發：DB 層的 unique invariant 才是真正的守門員 ═════════════════
  -- 兩個 request 同時抵達第 4 次時，兩邊都會算出「達標」並各自 INSERT。
  -- 這裡直接模擬第二個 writer：同一個 (task, child, period) 的第二筆 settlement
  -- 必須被擋下來，而不是靠 UI 防雙擊。
  BEGIN
    INSERT INTO reward_settlements (
      task_id, child_id, reward_basis, period_start,
      completion_id, coin_amount, reward_policy_version, transaction_id
    )
    SELECT rs.task_id, rs.child_id, rs.reward_basis, rs.period_start,
           rs.completion_id, rs.coin_amount, rs.reward_policy_version, rs.transaction_id
    FROM reward_settlements rs
    WHERE rs.task_id = v_task_period AND rs.child_id = v_child
    LIMIT 1;
  EXCEPTION
    WHEN unique_violation THEN
      v_dupe_blocked := true;
  END;

  IF NOT v_dupe_blocked THEN
    RAISE EXCEPTION 'P0 payout verify: a second settlement for the same period was accepted';
  END IF;

  -- ══ F. 下一週：從 0/4 重新開始，上週的紀錄不動 ═════════════════════════
  SELECT balance INTO v_before FROM wallets WHERE id = v_wallet;
  v_result := complete_task(
    v_task_period, v_child, (v_next_monday::text || ' 09:00+08')::timestamptz, true, v_goal_period
  );
  SELECT balance INTO v_balance FROM wallets WHERE id = v_wallet;

  IF (v_result->'period'->>'done')::int <> 1
    OR v_result->'period'->>'start' <> v_next_monday::text
    OR v_balance <> v_before
  THEN
    RAISE EXCEPTION 'P0 payout verify: next period did not restart at 1/%: %', v_target, v_result;
  END IF;

  -- 上週的 settlement 與 completion 都還在。
  SELECT count(*) INTO v_settlements
  FROM reward_settlements
  WHERE task_id = v_task_period AND child_id = v_child AND period_start = v_monday;
  SELECT count(*) INTO v_completions
  FROM task_completions
  WHERE task_id = v_task_period AND child_id = v_child
    AND date_trunc('week', (completed_at AT TIME ZONE 'Asia/Taipei'))::date = v_monday;

  IF v_settlements <> 1 OR v_completions <> 5 THEN
    RAISE EXCEPTION 'P0 payout verify: last week was mutated: % settlements / % completions',
      v_settlements, v_completions;
  END IF;

  -- ══ G. 漏一天不歸零、不刪紀錄（B 情境）═════════════════════════════════
  -- 週一做了（上一段）、週二不做、週三做 → 本期必須是 2/4，不是 1/4。
  v_result := complete_task(
    v_task_period, v_child, ((v_next_monday + 2)::text || ' 09:00+08')::timestamptz, true, v_goal_period
  );

  IF (v_result->'period'->>'done')::int <> 2 THEN
    RAISE EXCEPTION 'P0 payout verify: a missed day reset the period count: %', v_result;
  END IF;

  -- ══ H. legacy 任務：行為不變 ═══════════════════════════════════════════
  SELECT balance INTO v_before FROM wallets WHERE id = v_wallet;
  v_result := complete_task(
    v_task_legacy, v_child, ((v_next_monday + 3)::text || ' 09:00+08')::timestamptz, true, NULL
  );
  SELECT balance INTO v_balance FROM wallets WHERE id = v_wallet;

  -- base_time_min 10 × difficulty 1 → coin_override 6 勝出；前置滿足 → ×1.0。
  IF (v_result->>'coinEarned')::int <> 6
    OR v_balance <> v_before + 6
    OR v_result->>'payoutBasis' IS NOT NULL
  THEN
    RAISE EXCEPTION 'P0 payout verify: legacy task behaviour changed: %, balance % -> %',
      v_result, v_before, v_balance;
  END IF;

  IF EXISTS (SELECT 1 FROM reward_settlements WHERE task_id = v_task_legacy) THEN
    RAISE EXCEPTION 'P0 payout verify: legacy completion wrote a settlement row';
  END IF;

  -- ══ I. mid-period transition：生效日之前仍走 legacy 每次發幣 ════════════
  SELECT balance INTO v_before FROM wallets WHERE id = v_wallet;
  v_result := complete_task(
    v_task_future, v_child, ((v_monday + 1)::text || ' 09:00+08')::timestamptz, true, NULL
  );
  SELECT balance INTO v_balance FROM wallets WHERE id = v_wallet;

  IF (v_result->>'coinEarned')::int <> v_amount
    OR v_balance <> v_before + v_amount
    OR v_result->'period' <> 'null'::jsonb
  THEN
    RAISE EXCEPTION 'P0 payout verify: a completion before effective_from did not use the old rule: %',
      v_result;
  END IF;

  IF EXISTS (
    SELECT 1 FROM reward_settlements
    WHERE task_id = v_task_future AND period_start = v_monday
  ) THEN
    RAISE EXCEPTION 'P0 payout verify: the in-flight period was settled under the new rule';
  END IF;

  -- ══ J. 未實作的 basis：fail closed ═════════════════════════════════════
  SELECT balance INTO v_before FROM wallets WHERE id = v_wallet;
  v_result := complete_task(
    v_task_unsup, v_child, ((v_monday + 2)::text || ' 09:00+08')::timestamptz, true, NULL
  );
  SELECT balance INTO v_balance FROM wallets WHERE id = v_wallet;

  IF (v_result->>'payoutBasisUnsupported')::boolean <> true
    OR (v_result->>'coinEarned')::int <> 0
    OR v_balance <> v_before
    OR v_result->>'completionId' IS NULL
  THEN
    RAISE EXCEPTION 'P0 payout verify: unsupported basis was not fail-closed: %', v_result;
  END IF;

  -- ══ K. rollout metadata 不可竄改 ═══════════════════════════════════════
  BEGIN
    UPDATE tasks
    SET payout_basis_effective_from = v_monday - 7
    WHERE id = v_task_future;
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM = 'PAYOUT_ROLLOUT_IMMUTABLE' THEN
        v_immutable_blocked := true;
      ELSE
        RAISE;
      END IF;
  END;

  IF NOT v_immutable_blocked THEN
    RAISE EXCEPTION 'P0 payout verify: payout_basis_effective_from was mutable';
  END IF;

  RAISE EXCEPTION 'P0 PAYOUT SETTLEMENT VERIFY PASS — progress/settlement split, period idempotency, next-period reset, missed-day tolerance, legacy unchanged, mid-period transition, fail-closed basis, immutable rollout metadata. All fixtures rolled back.';
END
$p0_payout$;
