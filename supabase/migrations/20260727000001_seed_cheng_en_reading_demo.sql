DO $$
DECLARE
  v_child record;
  v_task_id uuid;
BEGIN
  FOR v_child IN
    SELECT c.id, c.family_id
    FROM public.children c
    WHERE c.nickname = '承恩'
  LOOP
    SELECT t.id INTO v_task_id
    FROM public.tasks t
    WHERE t.family_id = v_child.family_id
      AND t.name = '自主閱讀計畫'
    ORDER BY t.created_at
    LIMIT 1;

    IF v_task_id IS NULL THEN
      INSERT INTO public.tasks (
        family_id,
        name,
        category,
        day_type,
        recurrence_days,
        long_term_type,
        is_long_term,
        base_time_min,
        difficulty,
        coin_override,
        is_system_default,
        allow_repeat,
        min_age,
        max_age,
        is_active,
        time_saving_min
      ) VALUES (
        v_child.family_id,
        '自主閱讀計畫',
        'D',
        'custom',
        ARRAY[1,2,3,4,5],
        'habit',
        true,
        15,
        1,
        null,
        false,
        false,
        6,
        9,
        true,
        0
      )
      RETURNING id INTO v_task_id;
    ELSE
      UPDATE public.tasks
      SET recurrence_days = ARRAY[1,2,3,4,5],
          day_type = 'custom',
          is_long_term = true,
          long_term_type = 'habit',
          base_time_min = 15,
          allow_repeat = false,
          is_active = true
      WHERE id = v_task_id;
    END IF;

    INSERT INTO public.child_tasks (child_id, task_id, is_active)
    SELECT v_child.id, v_task_id, true
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.child_tasks ct
      WHERE ct.child_id = v_child.id
        AND ct.task_id = v_task_id
    );

    IF EXISTS (
      SELECT 1
      FROM public.long_term_goals g
      WHERE g.child_id = v_child.id
        AND g.task_id = v_task_id
    ) THEN
      UPDATE public.long_term_goals
      SET total_days = 20,
          active_days = ARRAY[1,2,3,4,5],
          preferred_time_window = 'after_dinner',
          checkpoint_rewards = '{"5": 10}'::jsonb,
          status = 'active'
      WHERE child_id = v_child.id
        AND task_id = v_task_id;
    ELSE
      INSERT INTO public.long_term_goals (
        child_id,
        task_id,
        goal_type,
        total_days,
        current_day,
        status,
        checkpoint_rewards,
        motivation_note,
        started_at,
        active_days,
        preferred_time_window,
        interrupt_count
      ) VALUES (
        v_child.id,
        v_task_id,
        'habit',
        20,
        0,
        'active',
        '{"5": 10}'::jsonb,
        '自己選一本喜歡的書，閱讀 15 分鐘',
        current_date,
        ARRAY[1,2,3,4,5],
        'after_dinner',
        0
      );
    END IF;
  END LOOP;
END;
$$;
