DO $$
DECLARE
  v_goal_count integer;
BEGIN
  UPDATE public.tasks t
  SET category = 'D',
      day_type = 'custom',
      recurrence_days = ARRAY[1,2,3,4,5],
      long_term_type = 'habit',
      is_long_term = true,
      base_time_min = 15,
      difficulty = 1,
      coin_override = 0,
      allow_repeat = false,
      min_age = 6,
      max_age = 9,
      is_active = true
  FROM public.children c
  WHERE c.nickname = '承恩'
    AND t.family_id = c.family_id
    AND t.name = '自主閱讀計畫';

  UPDATE public.child_tasks ct
  SET is_active = true
  FROM public.children c, public.tasks t
  WHERE c.nickname = '承恩'
    AND t.family_id = c.family_id
    AND t.name = '自主閱讀計畫'
    AND ct.child_id = c.id
    AND ct.task_id = t.id;

  UPDATE public.long_term_goals g
  SET goal_type = 'habit',
      total_days = 20,
      status = 'active',
      checkpoint_rewards = '{"5": 10}'::jsonb,
      motivation_note = '自己選一本喜歡的書，閱讀 15 分鐘',
      active_days = ARRAY[1,2,3,4,5],
      preferred_time_window = 'after_dinner',
      next_review_at = COALESCE(g.next_review_at, current_date + 7)
  FROM public.children c, public.tasks t
  WHERE c.nickname = '承恩'
    AND t.family_id = c.family_id
    AND t.name = '自主閱讀計畫'
    AND g.child_id = c.id
    AND g.task_id = t.id;

  SELECT count(*) INTO v_goal_count
  FROM public.long_term_goals g
  JOIN public.children c ON c.id = g.child_id
  JOIN public.tasks t ON t.id = g.task_id
  WHERE c.nickname = '承恩'
    AND t.name = '自主閱讀計畫'
    AND g.status = 'active';

  IF v_goal_count = 0 THEN
    RAISE EXCEPTION 'Cheng-en reading demo was not created';
  END IF;

  RAISE NOTICE 'Verified % active Cheng-en reading demo goal(s)', v_goal_count;
END;
$$;
