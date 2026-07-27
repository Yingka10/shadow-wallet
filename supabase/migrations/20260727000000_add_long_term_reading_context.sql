ALTER TABLE public.long_term_goals
  ADD COLUMN IF NOT EXISTS preferred_time_window text
  CHECK (
    preferred_time_window IS NULL
    OR preferred_time_window IN ('after_dinner', 'before_bed')
  );

ALTER TABLE public.task_completions
  ADD COLUMN IF NOT EXISTS planned_time_window text
  CHECK (
    planned_time_window IS NULL
    OR planned_time_window IN ('after_dinner', 'before_bed')
  ),
  ADD COLUMN IF NOT EXISTS start_mode text
  CHECK (
    start_mode IS NULL
    OR start_mode IN ('self_started', 'reminded')
  );

CREATE OR REPLACE FUNCTION public.record_completion_context(
  p_completion_id uuid,
  p_planned_time_window text,
  p_start_mode text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child_id uuid;
BEGIN
  IF p_planned_time_window NOT IN ('after_dinner', 'before_bed') THEN
    RAISE EXCEPTION 'Invalid planned time window';
  END IF;

  IF p_start_mode NOT IN ('self_started', 'reminded') THEN
    RAISE EXCEPTION 'Invalid start mode';
  END IF;

  SELECT child_id INTO v_child_id
  FROM task_completions
  WHERE id = p_completion_id;

  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'Completion not found';
  END IF;

  IF coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM children c
      WHERE c.id = v_child_id
        AND c.family_id = (
          SELECT family_id
          FROM parents
          WHERE user_id = auth.uid()
          LIMIT 1
        )
    ) THEN
      RAISE EXCEPTION 'Not authorized'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE task_completions
  SET planned_time_window = p_planned_time_window,
      start_mode = p_start_mode
  WHERE id = p_completion_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.record_completion_context(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_completion_context(uuid, text, text)
  TO authenticated, service_role;
