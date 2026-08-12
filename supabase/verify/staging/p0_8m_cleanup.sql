-- P0-8M staging acceptance — 清除隔離 fixture。
--
-- 刪除順序沿用 P0-10A demo_reset.sql 推導出來的那一套：決定順序的不是
-- 「由葉到根」，而是**非 CASCADE 的外鍵**。特別是 child_proposals 必須排在
-- tasks 之前 —— child_proposals.task_id 與
-- child_proposal_plan_versions.confirmed_source_task_id 都是 ON DELETE SET NULL，
-- 先刪 task 會把它們設成 NULL，然後撞上 child_proposals_active_consistency（23514）。
--
-- 這支只碰 'P0-8M Verify Family'。Demo Family 與 QA Family 完全不在範圍內。

DO $cleanup$
DECLARE
  v_email  text := 'p0-8m-verify@example.invalid';
  v_family uuid;
  v_user   uuid;
  v_kids   uuid[];
  v_tasks  uuid[];
  v_left   int;
BEGIN
  SELECT id INTO v_family FROM families WHERE family_name = 'P0-8M Verify Family';
  SELECT id INTO v_user   FROM auth.users WHERE email = v_email;

  IF v_family IS NULL AND v_user IS NULL THEN
    RAISE EXCEPTION 'P0-8M CLEANUP：沒有東西要清（fixture 不存在）';
  END IF;

  IF v_family IS NOT NULL THEN
    SELECT array_agg(id) INTO v_kids  FROM children WHERE family_id = v_family;
    SELECT array_agg(id) INTO v_tasks FROM tasks    WHERE family_id = v_family;
    v_kids  := COALESCE(v_kids,  '{}');
    v_tasks := COALESCE(v_tasks, '{}');

    DELETE FROM intervention_log           WHERE family_id = v_family;
    DELETE FROM child_proposals            WHERE family_id = v_family;

    DELETE FROM redemption_requests        WHERE child_id = ANY(v_kids);
    DELETE FROM reward_items               WHERE child_id = ANY(v_kids);

    UPDATE task_completions SET override_id = NULL
      WHERE task_id = ANY(v_tasks) AND override_id IS NOT NULL;
    DELETE FROM overrides WHERE completion_id IN (
      SELECT id FROM task_completions WHERE task_id = ANY(v_tasks));
    DELETE FROM time_savings               WHERE child_id = ANY(v_kids);
    DELETE FROM task_completions           WHERE task_id  = ANY(v_tasks);

    DELETE FROM transactions WHERE wallet_id IN (
      SELECT id FROM wallets WHERE child_id = ANY(v_kids));

    DELETE FROM task_role_responsibilities WHERE task_id = ANY(v_tasks);
    DELETE FROM task_preset_selections     WHERE task_id = ANY(v_tasks);
    DELETE FROM task_plan_milestones       WHERE task_id = ANY(v_tasks);
    DELETE FROM task_plan_support_steps    WHERE task_id = ANY(v_tasks);
    DELETE FROM task_change_events         WHERE task_id = ANY(v_tasks);
    DELETE FROM parent_observations        WHERE task_id = ANY(v_tasks);
    DELETE FROM child_tasks                WHERE task_id = ANY(v_tasks);
    DELETE FROM long_term_goals            WHERE task_id = ANY(v_tasks);
    DELETE FROM tasks                      WHERE family_id = v_family;

    DELETE FROM weekly_reports             WHERE family_id = v_family;
    DELETE FROM monthly_reports            WHERE family_id = v_family;
    DELETE FROM growth_moments             WHERE child_id = ANY(v_kids);
    DELETE FROM parent_observations        WHERE child_id = ANY(v_kids);
    DELETE FROM credit_logs                WHERE child_id = ANY(v_kids);
    DELETE FROM sibling_relations          WHERE family_id = v_family;

    DELETE FROM wallets                    WHERE child_id = ANY(v_kids);
    DELETE FROM child_profiles             WHERE child_id = ANY(v_kids);
    DELETE FROM children                   WHERE family_id = v_family;
    DELETE FROM parents                    WHERE family_id = v_family;
    DELETE FROM families                   WHERE id = v_family;
  END IF;

  IF v_user IS NOT NULL THEN
    DELETE FROM auth.identities WHERE user_id = v_user;
    DELETE FROM auth.users      WHERE id = v_user;
  END IF;

  -- 自我驗證：清乾淨才算過，不是「跑完沒噴錯」就算過。
  SELECT
      (SELECT count(*) FROM families   WHERE family_name = 'P0-8M Verify Family')
    + (SELECT count(*) FROM auth.users WHERE email = v_email)
    + (SELECT count(*) FROM child_proposals p
        WHERE NOT EXISTS (SELECT 1 FROM families f WHERE f.id = p.family_id))
    + (SELECT count(*) FROM child_proposal_plan_versions v
        WHERE NOT EXISTS (SELECT 1 FROM child_proposals p WHERE p.id = v.proposal_id))
    + (SELECT count(*) FROM tasks t
        WHERE NOT EXISTS (SELECT 1 FROM families f WHERE f.id = t.family_id))
    + (SELECT count(*) FROM child_tasks ct
        WHERE NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = ct.task_id))
    + (SELECT count(*) FROM long_term_goals g
        WHERE NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = g.task_id))
    INTO v_left;

  -- 這裡**故意不 RAISE EXCEPTION**。P0-6 那支驗收腳本用主動中止來丟棄 fixture，
  -- 這一支的目的相反：刪除必須真的 commit。只有在沒清乾淨時才中止。
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'P0-8M CLEANUP 失敗：還有 % 筆殘留或孤兒（整包已回滾）', v_left;
  END IF;

  RAISE NOTICE 'P0-8M CLEANUP 完成，殘留與孤兒皆為 0';
END
$cleanup$;
