-- 週報「一鍵採用 AI 建議」核心鏈路：允許家長把 AI/家長自己決定的任務排程調整
-- （claim_period / max_claims_per_period）一鍵寫回 tasks，並留稽核紀錄。
--
-- 授權沿用 complete_task / mark_task_atomic 的 SECURITY DEFINER + JWT role pattern；
-- 稽核紀錄寫入 intervention_log（event_type = 'task_schedule_adjusted'）。intervention_log.child_id
-- 是 NOT NULL，但排程調整是任務層級、不是特定孩子的事件，因此取該任務目前指派的任一
-- active child_tasks 孩子代表；若任務目前沒有任何指派，則不寫這筆稽核紀錄（DB 更新仍會成功）。

CREATE OR REPLACE FUNCTION update_task_schedule(
  p_task_id             uuid,
  p_claim_period        text,
  p_max_claims_per_period integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id  uuid;
  v_task_name  text;
  v_old_period text;
  v_old_max    int;
  v_parent_id  uuid;
  v_child_id   uuid;
BEGIN
  -- 授權：service_role 略過；一般使用者需為該任務所屬家庭的家長
  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM tasks t
      JOIN parents p ON p.family_id = t.family_id
      WHERE t.id = p_task_id AND p.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Not authorized: caller is not a parent of task %''s family', p_task_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 輸入驗證（鏡射 tasks 的 CHECK constraint，給更友善的錯誤而非裸 constraint violation）
  IF p_claim_period NOT IN ('day', 'week', 'once') THEN
    RETURN jsonb_build_object('error', 'invalid_claim_period');
  END IF;
  IF p_max_claims_per_period IS NULL OR p_max_claims_per_period <= 0 THEN
    RETURN jsonb_build_object('error', 'invalid_max_claims');
  END IF;

  SELECT claim_period, max_claims_per_period, family_id, name
  INTO v_old_period, v_old_max, v_family_id, v_task_name
  FROM tasks WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  UPDATE tasks
  SET claim_period = p_claim_period,
      max_claims_per_period = p_max_claims_per_period
  WHERE id = p_task_id;

  SELECT id INTO v_parent_id FROM parents WHERE user_id = auth.uid() LIMIT 1;
  SELECT child_id INTO v_child_id
  FROM child_tasks WHERE task_id = p_task_id AND is_active = true
  ORDER BY created_at LIMIT 1;

  IF v_child_id IS NOT NULL THEN
    INSERT INTO intervention_log
      (family_id, child_id, parent_id, task_id, task_name_snapshot,
       event_type, trigger_source, parent_decision)
    VALUES (
      v_family_id, v_child_id, v_parent_id, p_task_id, v_task_name,
      'task_schedule_adjusted', 'parent_manual',
      jsonb_build_object(
        'old_claim_period', v_old_period, 'new_claim_period', p_claim_period,
        'old_max_claims_per_period', v_old_max, 'new_max_claims_per_period', p_max_claims_per_period
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'taskId', p_task_id,
    'claimPeriod', p_claim_period,
    'maxClaimsPerPeriod', p_max_claims_per_period
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_task_schedule(uuid, text, integer) TO authenticated;
