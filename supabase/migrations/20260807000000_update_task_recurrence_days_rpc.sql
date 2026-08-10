-- 週報一鍵採用 AI 建議：把 update_task_schedule 的 pattern 複製一份給 recurrence_days
-- （任務排定在哪幾天出現）。只有 day_type = 'custom'（固定星期）的任務這欄位才有意義，
-- 其餘排程模式一律 NULL、不適用這個 RPC。

CREATE OR REPLACE FUNCTION update_task_recurrence_days(
  p_task_id          uuid,
  p_recurrence_days  integer[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id uuid;
  v_task_name text;
  v_day_type  text;
  v_old_days  integer[];
  v_parent_id uuid;
  v_child_id  uuid;
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

  -- 輸入驗證：陣列不可空、值域 0(週日)~6(週六)、不可重複
  IF p_recurrence_days IS NULL OR array_length(p_recurrence_days, 1) IS NULL THEN
    RETURN jsonb_build_object('error', 'empty_days');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_recurrence_days) d WHERE d < 0 OR d > 6) THEN
    RETURN jsonb_build_object('error', 'invalid_day_value');
  END IF;
  IF array_length(p_recurrence_days, 1) <> array_length(ARRAY(SELECT DISTINCT unnest(p_recurrence_days)), 1) THEN
    RETURN jsonb_build_object('error', 'duplicate_day_value');
  END IF;

  SELECT family_id, name, day_type, recurrence_days
  INTO v_family_id, v_task_name, v_day_type, v_old_days
  FROM tasks WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  IF v_day_type <> 'custom' THEN
    RETURN jsonb_build_object('error', 'not_fixed_days_task');
  END IF;

  UPDATE tasks
  SET recurrence_days = p_recurrence_days
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
      'task_recurrence_updated', 'parent_manual',
      jsonb_build_object(
        'old_recurrence_days', v_old_days, 'new_recurrence_days', p_recurrence_days
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'taskId', p_task_id,
    'recurrenceDays', p_recurrence_days
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_task_recurrence_days(uuid, integer[]) TO authenticated;
