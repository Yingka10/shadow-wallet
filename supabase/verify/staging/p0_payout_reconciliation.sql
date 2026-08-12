-- P0 payout settlement — DB 對帳（self-rolling-back）。
--
--   supabase db query --linked -f supabase/verify/staging/p0_payout_reconciliation.sql
--
-- 與 p0_payout_settlement.sql 的差別：那一支只回答「有沒有通過」，
-- 這一支把每一步的**實際數字**吐出來 —— wallet balance、settlement 筆數、
-- transaction 筆數、completion 筆數、該次 completion 的 coin_earned。
--
-- 一樣以 RAISE EXCEPTION 收尾來回滾；訊息本體是一段 JSON。
-- PASS/FAIL 由讀的人對照數字判斷，不由這支檔案宣稱。
--
-- ⚠️ 幣值 7 是測試資料，不是 per-period pricing policy。
DO $p0_recon$
DECLARE
  v_family  uuid := gen_random_uuid();
  v_user    uuid := gen_random_uuid();
  v_child   uuid := gen_random_uuid();
  v_wallet  uuid := gen_random_uuid();
  v_task    uuid := gen_random_uuid();
  v_goal    uuid := gen_random_uuid();

  v_monday  date := date_trunc('week', DATE '2026-08-12')::date;
  v_amount  int  := 7;
  v_target  int  := 4;

  v_result  jsonb;
  v_steps   jsonb := '[]'::jsonb;
  v_report  jsonb;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_user);
  INSERT INTO families (id, family_name) VALUES (v_family, 'P0 recon family');
  INSERT INTO parents (family_id, name, user_id) VALUES (v_family, 'P0 recon parent', v_user);
  INSERT INTO children (id, family_id, nickname, birth_date, age_group)
  VALUES (v_child, v_family, 'P0 recon child', '2018-01-01', '6-9');
  INSERT INTO wallets (id, child_id, wallet_type, balance)
  VALUES (v_wallet, v_child, 'spending', 0);

  INSERT INTO tasks (
    id, family_id, name, category, day_type, is_active, is_long_term, long_term_type,
    claim_period, max_claims_per_period, reward_policy, reward_coin_amount,
    reward_coin_min, reward_coin_max, reward_policy_version,
    duration_type, schedule_mode, weekly_frequency, progress_model,
    payout_basis, period_target_count, payout_basis_effective_from
  ) VALUES (
    v_task, v_family, 'P0 recon weekly reading', 'D', 'both', true, true, 'habit',
    'week', 5, 'coin_eligible', v_amount, 1, 30, 'p0-recon',
    'long_term', 'weekly_frequency', 4, 'weekly_rhythm',
    'per_period', v_target, v_monday
  );

  INSERT INTO child_tasks (child_id, task_id, is_active) VALUES (v_child, v_task, true);
  INSERT INTO long_term_goals (id, child_id, task_id, goal_type, current_day, status)
  VALUES (v_goal, v_child, v_task, 'habit', 0, 'active');

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  -- 五次完成，每次都把當下的四張表狀態記下來。
  FOR i IN 0..4 LOOP
    v_result := complete_task(
      v_task, v_child, ((v_monday + i)::text || ' 09:00+08')::timestamptz, true, v_goal
    );

    v_steps := v_steps || jsonb_build_array(jsonb_build_object(
      'completion', i + 1,
      'rpcCoinEarned', (v_result->>'coinEarned')::int,
      'settled', COALESCE((v_result->'period'->>'settled')::boolean, false),
      'periodDone', (v_result->'period'->>'done')::int,
      'walletBalance', (SELECT balance FROM wallets WHERE id = v_wallet),
      'completionRows', (SELECT count(*) FROM task_completions
                          WHERE task_id = v_task AND child_id = v_child),
      'settlementRows', (SELECT count(*) FROM reward_settlements
                          WHERE task_id = v_task AND child_id = v_child),
      'rewardTxRows', (SELECT count(*) FROM transactions t
                        JOIN reward_settlements rs ON rs.transaction_id = t.id
                        WHERE rs.task_id = v_task AND rs.child_id = v_child),
      'thisCompletionCoinEarned', (SELECT coin_earned FROM task_completions
                                    WHERE id = (v_result->>'completionId')::uuid)
    ));
  END LOOP;

  -- 重試（同一天再打一次）
  v_result := complete_task(
    v_task, v_child, ((v_monday + 3)::text || ' 21:00+08')::timestamptz, true, v_goal
  );

  v_report := jsonb_build_object(
    'fixtureAmountX', v_amount,
    'periodTarget', v_target,
    'periodStart', v_monday,
    'steps', v_steps,
    'retry', jsonb_build_object(
      'error', v_result->>'error',
      'walletBalance', (SELECT balance FROM wallets WHERE id = v_wallet),
      'settlementRows', (SELECT count(*) FROM reward_settlements
                          WHERE task_id = v_task AND child_id = v_child)
    ),
    'reconciliation', jsonb_build_object(
      'walletBalance', (SELECT balance FROM wallets WHERE id = v_wallet),
      'settlementSum', (SELECT COALESCE(sum(coin_amount), 0) FROM reward_settlements
                         WHERE task_id = v_task AND child_id = v_child),
      'rewardTxSum', (SELECT COALESCE(sum(t.amount), 0) FROM transactions t
                       JOIN reward_settlements rs ON rs.transaction_id = t.id
                       WHERE rs.task_id = v_task AND rs.child_id = v_child),
      'completionCoinSum', (SELECT COALESCE(sum(coin_earned), 0) FROM task_completions
                             WHERE task_id = v_task AND child_id = v_child)
    )
  );

  RAISE EXCEPTION 'P0 PAYOUT RECONCILIATION %', v_report;
END
$p0_recon$;
