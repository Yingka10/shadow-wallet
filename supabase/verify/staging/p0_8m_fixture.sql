-- P0-8M staging 驗收 — 隔離用的「另一個家庭」。
--
-- 只為了證明一件事：DB/RPC 的 family boundary 是活的，不是只有 UI 的
-- selected-child filter 在擋。所以這個家庭裡要有一張**別人家的** open
-- adjustment request，讓 Demo 家長拿真憑證去踩。
--
-- 刻意不建 auth user：要證明的是「A 家的家長動不了 B 家的請求」，
-- 用 Demo 家長的真 JWT 去踩 B 家的資料就足夠，而且更接近真實攻擊面。
--
-- 全部 id 以 f0e80000 開頭，cleanup 靠這個前綴一次刪乾淨。
DO $fixture$
DECLARE
  v_family   uuid := 'f0e80000-0000-4000-8000-000000000001';
  v_child    uuid := 'f0e80000-0000-4000-8000-000000000021';
  v_task     uuid := 'f0e80000-0000-4000-8000-000000000041';
  v_proposal uuid := 'f0e80000-0000-4000-8000-000000000051';
  v_v1       uuid := 'f0e80000-0000-4000-8000-000000000061';
  v_v2       uuid := 'f0e80000-0000-4000-8000-000000000062';
  v_request  uuid := 'f0e80000-0000-4000-8000-000000000071';
  v_now      timestamptz := now();
BEGIN
  INSERT INTO families (id, family_name) VALUES (v_family, 'P0-8M Boundary Family')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO children (id, family_id, nickname, birth_date, age_group)
    VALUES (v_child, v_family, '隔壁小孩', '2018-05-01', '6-9')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (
    id, family_id, name, category, day_type, is_long_term, long_term_type,
    base_time_min, difficulty, is_active, schedule_mode, weekly_frequency,
    preferred_time, progress_model, creation_source, start_date
  ) VALUES (
    v_task, v_family, '隔壁家的閱讀計畫', 'D', 'custom', true, 'habit',
    15, 1, true, 'weekly_frequency', 3,
    'before_bed', 'weekly_rhythm', 'child_proposal', current_date
  ) ON CONFLICT (id) DO NOTHING;

  -- child_proposal_guard_linked_task 要求提案的任務真的指派給那個孩子。
  INSERT INTO child_tasks (task_id, child_id, is_active)
    VALUES (v_task, v_child, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO child_proposals (
    id, family_id, child_id, task_id, status, child_original_goal,
    current_plan_version_id
  ) VALUES (
    v_proposal, v_family, v_child, NULL, 'draft', '我想每週讀三次', NULL
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO child_proposal_plan_versions (
    id, proposal_id, version_no, authored_by, cadence_mode,
    cadence_weekly_frequency, preferred_time, requires_child_review
  ) VALUES
    (v_v1, v_proposal, 1, 'ai', 'weekly_frequency', 3, NULL, false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO child_proposal_plan_versions (
    id, proposal_id, version_no, authored_by, cadence_mode,
    cadence_weekly_frequency, preferred_time, requires_child_review,
    adopted_from_plan_version_id, parent_confirmed_at, effective_at,
    confirmed_source_task_id, confirmed_at, confirmed_reward_policy,
    -- child_proposal_plan_versions_confirmed_atomic：confirmed_at 一有值，
    -- 整組 confirmed_* 就必須齊全。
    confirmed_by_user_id, confirmed_payout_basis, confirmed_claim_period,
    confirmed_max_claims_per_period, confirmed_reward_policy_version,
    confirmed_task_policy_version
  ) VALUES (
    v_v2, v_proposal, 2, 'parent', 'weekly_frequency', 3, 'before_bed', false,
    v_v1, v_now, v_now, v_task, v_now, 'record_only',
    (SELECT user_id FROM parents WHERE family_id = 'd0e70000-0000-4000-8000-000000000001' LIMIT 1),
    'per_completion', 'day', 1, 'p0-8m-fixture', 'p0-8m-fixture'
  ) ON CONFLICT (id) DO NOTHING;

  -- 狀態機不允許 draft → active 直接跳，照正式路徑先到 proposed。
  UPDATE child_proposals SET status = 'proposed' WHERE id = v_proposal;

  -- child_proposals_task_requires_active：task_id 只能在 active 時存在，
  -- 所以三個欄位一起設。
  UPDATE child_proposals
     SET current_plan_version_id = v_v2, status = 'active', task_id = v_task
   WHERE id = v_proposal;

  INSERT INTO child_proposal_adjustment_requests (
    id, proposal_id, family_id, requested_by, based_on_plan_version_id,
    adjustment_kind, reason, requested_changes, status
  ) VALUES (
    v_request, v_proposal, v_family, 'child', v_v2,
    'preferred_time', '隔壁小孩想改成晚餐後',
    jsonb_build_object('preferredTime', 'after_dinner', 'preferredTimeCustom', NULL),
    'open'
  ) ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'P0-8M boundary fixture ready: request=%', v_request;
END
$fixture$;
