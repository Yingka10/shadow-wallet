

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."calc_task_coin"("base_time_min" integer, "difficulty" numeric, "coin_override" integer) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
begin
  if coin_override is not null then
    return coin_override;
  end if;
  return round(base_time_min * difficulty)::int;
end;
$$;


ALTER FUNCTION "public"."calc_task_coin"("base_time_min" integer, "difficulty" numeric, "coin_override" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_task"("p_task_id" "uuid", "p_child_id" "uuid", "p_completed_at" timestamp with time zone, "p_is_prerequisite_met" boolean, "p_goal_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_task           record;
  v_child_family   uuid;
  v_coin_earned    int;
  v_time_saved     int;
  v_wallet_id      uuid;
  v_completion_id  uuid;
  v_new_day        int;
  v_rewards        jsonb;
  v_milestone_coin int;
  v_period_start   date;
  v_claim_count    int;
  v_legacy         boolean;
BEGIN
  -- ── 授權 ────────────────────────────────────────────────────────────────
  -- 先取這個孩子的 family，再問「呼叫者是不是這個 family 的家長」。
  -- 舊寫法是 `c.family_id = (SELECT family_id FROM parents WHERE user_id = auth.uid() LIMIT 1)`：
  -- 那是「取這個帳號的任意一筆 parents」，同一個帳號在兩個家庭時會挑錯，
  -- 而且它比對的是某個 family 而不是這個孩子的 family。
  SELECT c.family_id INTO v_child_family FROM children c WHERE c.id = p_child_id;
  IF v_child_family IS NULL THEN
    RAISE EXCEPTION 'Child not found: %', p_child_id USING ERRCODE = '42501';
  END IF;

  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM parents p
      WHERE p.user_id = auth.uid() AND p.family_id = v_child_family
    ) THEN
      RAISE EXCEPTION 'Not authorized: child % is not in the caller''s family', p_child_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Read task
  SELECT category, base_time_min, difficulty, coin_override,
         time_saving_min, long_term_type, day_type, allow_repeat,
         claim_period, max_claims_per_period, reward_policy,
         reward_coin_amount, family_id
  INTO v_task
  FROM tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  -- 任務與孩子必須同家庭。舊版只驗孩子，於是「自己家的孩子 ＋ 別人家的任務」過得去。
  IF v_task.family_id IS DISTINCT FROM v_child_family THEN
    RAISE EXCEPTION 'Not authorized: task % does not belong to child %''s family', p_task_id, p_child_id
      USING ERRCODE = '42501';
  END IF;

  v_legacy := (v_task.reward_policy IS NULL);

  IF NOT v_legacy AND v_task.reward_policy = 'time_saving_eligible' THEN
    RETURN jsonb_build_object('error', 'time_saving_not_enabled');
  END IF;

  -- Coin calculation
  IF v_legacy THEN
    -- 舊路徑：一個字沒改，包含前置解鎖 ×0.7。
    IF v_task.category IN ('A', 'B') THEN
      v_coin_earned := 0;
    ELSE
      v_coin_earned := ROUND(
        COALESCE(
          v_task.coin_override,
          ROUND(v_task.base_time_min::numeric * v_task.difficulty::numeric)
        )::numeric
        * CASE WHEN p_is_prerequisite_met THEN 1.0 ELSE 0.7 END
      );
    END IF;

    v_time_saved := CASE
      WHEN v_task.category = 'B' THEN COALESCE(v_task.time_saving_min, 0)
      ELSE 0
    END;
  ELSE
    -- 新路徑：金額在建立時就由 coin-policy.json 決定並凍結，這裡只讀不算。
    --
    -- 刻意不套前置解鎖 ×0.7：那個折扣的立足點已經被 2026-07 新分類動搖
    -- （6 歲以上 A 類退場、B 類不再商品化，「前置任務」實際只剩 B 類，見 DELTA §5），
    -- 而且把政策決定的金額打七折會直接掉出政策允許範圍 min–max。
    -- 舊任務維持原本的折扣行為，這個決定只影響新任務。
    IF v_task.reward_policy = 'coin_eligible' AND v_task.category NOT IN ('A', 'B') THEN
      v_coin_earned := COALESCE(v_task.reward_coin_amount, 0);
    ELSE
      v_coin_earned := 0;
    END IF;

    -- 新任務一律不寫 time_savings（SPEC 2026-07：家庭參與改以貢獻紀錄被看見）。
    v_time_saved := 0;
  END IF;

  -- Frequency guard
  IF v_task.claim_period = 'once' THEN
    SELECT count(*) INTO v_claim_count
    FROM task_completions
    WHERE child_id = p_child_id
      AND task_id  = p_task_id
      AND status   = 'completed';
  ELSE
    v_period_start := CASE
      WHEN v_task.claim_period = 'week'
        THEN date_trunc('week', (p_completed_at AT TIME ZONE 'Asia/Taipei'))::date
      ELSE (p_completed_at AT TIME ZONE 'Asia/Taipei')::date
    END;

    SELECT count(*) INTO v_claim_count
    FROM task_completions
    WHERE child_id = p_child_id
      AND task_id  = p_task_id
      AND status   = 'completed'
      AND (
        CASE
          WHEN v_task.claim_period = 'week'
            THEN date_trunc('week', (completed_at AT TIME ZONE 'Asia/Taipei'))::date
          ELSE (completed_at AT TIME ZONE 'Asia/Taipei')::date
        END
      ) = v_period_start;
  END IF;

  IF v_claim_count >= COALESCE(v_task.max_claims_per_period, 1) THEN
    RETURN jsonb_build_object('error', 'already_completed');
  END IF;

  -- 1. Insert task_completion
  INSERT INTO task_completions
    (task_id, child_id, completed_at, reported_by, status, coin_earned, time_saved_min)
  VALUES
    (p_task_id, p_child_id, p_completed_at, 'child', 'completed', v_coin_earned, v_time_saved)
  RETURNING id INTO v_completion_id;

  -- 2. award completion coins
  IF v_coin_earned > 0 THEN
    UPDATE wallets
    SET    balance = balance + v_coin_earned
    WHERE  child_id    = p_child_id
      AND  wallet_type = 'spending'
    RETURNING id INTO v_wallet_id;

    IF v_wallet_id IS NULL THEN
      RAISE EXCEPTION 'Spending wallet not found for child %', p_child_id;
    END IF;

    INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
    VALUES (v_wallet_id, v_coin_earned, 'earn', v_completion_id, 'task_completion');
  END IF;

  -- 3. legacy Task-B: record time savings（新任務 v_time_saved 恆為 0）
  IF v_task.category = 'B' AND v_time_saved > 0 THEN
    INSERT INTO time_savings (child_id, completion_id, minutes_saved)
    VALUES (p_child_id, v_completion_id, v_time_saved);
  END IF;

  -- 4. once task: deactivate from child's list
  IF v_task.day_type = 'once' THEN
    UPDATE child_tasks
    SET    is_active = false
    WHERE  task_id = p_task_id AND child_id = p_child_id;
  END IF;

  -- 5. Task-D habit: advance current_day, check for milestone reward
  v_milestone_coin := NULL;
  IF v_task.category = 'D'
    AND v_task.long_term_type = 'habit'
    AND p_goal_id IS NOT NULL
  THEN
    UPDATE long_term_goals
    SET    current_day = current_day + 1
    WHERE  id = p_goal_id
    RETURNING current_day, checkpoint_rewards INTO v_new_day, v_rewards;

    IF v_rewards IS NOT NULL THEN
      v_milestone_coin := (v_rewards->>(v_new_day::text))::int;
    END IF;

    IF v_milestone_coin IS NOT NULL THEN
      IF v_wallet_id IS NULL THEN
        SELECT id INTO v_wallet_id
        FROM wallets
        WHERE child_id = p_child_id AND wallet_type = 'spending';
      END IF;

      IF v_wallet_id IS NOT NULL THEN
        UPDATE wallets SET balance = balance + v_milestone_coin WHERE id = v_wallet_id;
        INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
        VALUES (v_wallet_id, v_milestone_coin, 'earn', p_goal_id, 'long_term_goal_milestone');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'completionId',  v_completion_id,
    'coinEarned',    v_coin_earned,
    'timeSavedMin',  v_time_saved,
    'milestone',     CASE
                       WHEN v_milestone_coin IS NOT NULL THEN jsonb_build_object(
                         'goalId',     p_goal_id,
                         'day',        v_new_day,
                         'coinReward', v_milestone_coin
                       )
                       ELSE NULL
                     END
  );
END;
$$;


ALTER FUNCTION "public"."complete_task"("p_task_id" "uuid", "p_child_id" "uuid", "p_completed_at" timestamp with time zone, "p_is_prerequisite_met" boolean, "p_goal_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."complete_task"("p_task_id" "uuid", "p_child_id" "uuid", "p_completed_at" timestamp with time zone, "p_is_prerequisite_met" boolean, "p_goal_id" "uuid") IS '完成任務。新任務（reward_policy 有值）的成長幣讀 tasks.reward_coin_amount；舊任務（reward_policy IS NULL）維持 base_time_min × difficulty 與前置解鎖 ×0.7。';



CREATE OR REPLACE FUNCTION "public"."create_parent_task_v1"("p_command" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_child_id        uuid;
  v_family_id       uuid;
  v_child_family    uuid;
  v_schema_version  int;

  v_editor_kind     text;
  v_purpose         text;
  v_category        text;
  v_duration_type   text;
  v_plan_mode       text;
  v_source          text;
  v_reward          text;
  v_completion      text;
  v_completion_db   text;
  v_preset_family   text;
  v_preset_variant  text;

  v_schedule        jsonb;
  v_review          jsonb;
  v_plan            jsonb;
  v_role            jsonb;
  v_content         jsonb;
  v_meta            jsonb;

  v_decision        jsonb;
  v_decision_policy text;
  v_eligibility     text;
  v_coin            jsonb;
  v_coin_final      int;
  v_coin_suggested  int;
  v_coin_min        int;
  v_coin_max        int;
  v_task_policy_version   text;
  v_reward_policy_version text;

  v_schedule_mode   text;
  v_weekly_freq     int;
  v_start_date      date;
  v_scheduled_date  date;
  v_end_date        date;
  v_recurrence      integer[];
  v_estimated_min   int;
  v_support_level   text;

  v_claim_period    text;
  v_max_claims      int;
  v_day_type        text;
  v_long_term_type  text;

  v_task_id         uuid;
  v_child_task_id   uuid;
  v_goal_id         uuid;
  v_event_id        uuid;
  v_related         uuid[] := ARRAY[]::uuid[];

  v_item            jsonb;
  v_idx             int;
  v_group           text;
  v_option          text;
  v_custom          text;
  v_selections      jsonb;
  v_customs         jsonb;
BEGIN
  -- ── 1. 呼叫者 ────────────────────────────────────────────────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized: create_parent_task_v1 requires an authenticated parent'
      USING ERRCODE = '42501';
  END IF;

  -- ── 2. 命令版本 ──────────────────────────────────────────────────────────
  v_schema_version := COALESCE((p_command ->> 'schemaVersion')::int, 0);
  IF v_schema_version <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('不支援的命令版本：%s', COALESCE(p_command ->> 'schemaVersion', 'null'))
    );
  END IF;

  v_child_id  := NULLIF(p_command ->> 'childId', '')::uuid;
  v_family_id := NULLIF(p_command ->> 'familyId', '')::uuid;

  IF v_child_id IS NULL OR v_family_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少 childId 或 familyId'
    );
  END IF;

  -- ── 3-5. child 存在、family_id 一致 ──────────────────────────────────────
  SELECT c.family_id INTO v_child_family FROM children c WHERE c.id = v_child_id;
  IF v_child_family IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '找不到這個孩子'
    );
  END IF;

  IF v_child_family <> v_family_id THEN
    RAISE EXCEPTION 'Not authorized: command familyId does not match child %', v_child_id
      USING ERRCODE = '42501';
  END IF;

  -- ── 6. 呼叫者對這個 family 有權限 ────────────────────────────────────────
  -- 集合比對，不是 LIMIT 1：一個 auth 帳號可能有多筆 parents。
  IF NOT EXISTS (
    SELECT 1 FROM parents p
    WHERE p.user_id = auth.uid() AND p.family_id = v_child_family
  ) THEN
    RAISE EXCEPTION 'Not authorized: caller does not belong to family %', v_child_family
      USING ERRCODE = '42501';
  END IF;

  -- ── 取出各區塊 ──────────────────────────────────────────────────────────
  v_schedule := COALESCE(p_command -> 'schedule', '{}'::jsonb);
  v_review   := p_command -> 'review';
  v_plan     := p_command -> 'plan';
  v_role     := p_command -> 'role';
  v_content  := COALESCE(p_command -> 'content', '{}'::jsonb);
  v_meta     := COALESCE(p_command -> 'metadata', '{}'::jsonb);
  v_decision := p_command -> 'reward' -> 'decision';

  v_editor_kind    := v_meta ->> 'editorKind';
  v_purpose        := p_command -> 'task' ->> 'purposeCategory';
  v_duration_type  := p_command -> 'task' ->> 'durationType';
  v_plan_mode      := p_command -> 'task' ->> 'planMode';
  v_source         := p_command -> 'task' ->> 'source';
  v_reward         := p_command -> 'task' ->> 'rewardPolicy';
  v_completion     := p_command -> 'task' ->> 'completionPolicy';
  v_preset_family  := p_command -> 'preset' ->> 'familyId';
  v_preset_variant := p_command -> 'preset' ->> 'variantId';

  v_schedule_mode  := v_schedule ->> 'mode';
  v_weekly_freq    := NULLIF(v_schedule ->> 'weeklyFrequency', '')::int;
  v_start_date     := NULLIF(v_schedule ->> 'startDate', '')::date;
  v_scheduled_date := NULLIF(v_schedule ->> 'scheduledDate', '')::date;
  v_end_date       := NULLIF(v_schedule ->> 'endDate', '')::date;
  v_estimated_min  := NULLIF(v_schedule ->> 'estimatedMinutes', '')::int;
  v_support_level  := p_command -> 'support' ->> 'level';

  SELECT COALESCE(array_agg(value::int ORDER BY value::int), ARRAY[]::integer[])
  INTO v_recurrence
  FROM jsonb_array_elements_text(COALESCE(v_schedule -> 'recurrenceDays', '[]'::jsonb));

  -- ── 7. purposeCategory → category ────────────────────────────────────────
  v_category := public.map_purpose_category(v_purpose);
  IF v_category IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('未知的任務目的：%s', COALESCE(v_purpose, 'null'))
    );
  END IF;

  v_completion_db := public.map_completion_policy(v_completion);
  IF v_completion_db IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('未知的結束方式：%s', COALESCE(v_completion, 'null'))
    );
  END IF;

  -- ── 基本必填 ────────────────────────────────────────────────────────────
  IF COALESCE(btrim(p_command -> 'task' ->> 'title'), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VALIDATION_FAILED', 'message', '缺少任務名稱');
  END IF;

  IF COALESCE(btrim(p_command -> 'task' ->> 'completionDescription'), '') = '' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '缺少完成標準'
    );
  END IF;

  IF v_duration_type IS NULL OR v_schedule_mode IS NULL OR v_reward IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少期間形式、排程方式或回饋方式'
    );
  END IF;

  IF v_start_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VALIDATION_FAILED', 'message', '缺少開始日期');
  END IF;

  -- ══ 8. 政策 guard（全部在 insert 之前）══════════════════════════════════

  -- E. 時間儲蓄：完成與兌換鏈路尚未打通，不可先建立起來慢慢累積。
  IF v_reward = 'time_saving_eligible' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'message', '時間儲蓄建立流程尚未啟用'
    );
  END IF;

  -- A. 家庭參與：只有家庭貢獻一種回饋。
  IF v_category = 'B' AND v_reward <> 'family_contribution' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'message', '家庭參與只能以家庭貢獻回饋，不發成長幣、不記時間儲蓄'
    );
  END IF;

  -- C. 家庭角色。
  IF v_plan_mode = 'family_role' THEN
    IF v_category <> 'B' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '家庭角色必須屬於家庭參與'
      );
    END IF;
    IF v_reward <> 'family_contribution' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '家庭角色的回饋固定為家庭貢獻'
      );
    END IF;
    IF v_completion_db <> 'review_and_continue' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '家庭角色必須期滿回顧後再決定'
      );
    END IF;
    IF v_role IS NULL
      OR jsonb_array_length(COALESCE(v_role -> 'responsibilities', '[]'::jsonb)) = 0 THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '家庭角色至少要有一項負責內容'
      );
    END IF;
  END IF;

  -- B. 生活小計畫（短期支援）。
  IF v_plan_mode = 'short_support' THEN
    IF v_reward <> 'progress_only' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '短期支援只以進度與肯定回饋'
      );
    END IF;
    IF v_completion_db <> 'stabilize_and_exit' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '短期支援必須穩定後結束'
      );
    END IF;
    IF v_end_date IS NULL OR COALESCE((v_plan ->> 'durationDays')::int, 0) <= 0 THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '短期支援必須有明確的期間與結束日'
      );
    END IF;
    IF jsonb_array_length(COALESCE(v_plan -> 'supportSteps', '[]'::jsonb)) = 0
      AND COALESCE(btrim(p_command -> 'task' ->> 'completionDescription'), '') = '' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '短期支援需要支援步驟或具體的完成標準'
      );
    END IF;
  END IF;

  -- D. 學校作業：本來就該完成的事，不作為固定幣源。
  IF v_preset_family = 'learn-school-assignment'
    AND v_reward NOT IN ('record_only', 'progress_only') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'message', '學校作業只能留下紀錄或以進度與肯定回饋'
    );
  END IF;

  -- F. 單次任務。
  IF v_duration_type = 'one_time' THEN
    IF v_completion_db <> 'complete_once' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '單次任務完成一次後即結束'
      );
    END IF;
    IF v_scheduled_date IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED', 'message', '單次任務需要安排日期'
      );
    END IF;
  END IF;

  IF v_duration_type = 'long_term' AND (v_end_date IS NULL OR v_end_date < v_start_date) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '長期任務的結束日不正確'
    );
  END IF;

  IF v_schedule_mode = 'weekly_frequency'
    AND (v_weekly_freq IS NULL OR v_weekly_freq < 1 OR v_weekly_freq > 7) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '每週次數必須在 1–7 之間'
    );
  END IF;

  IF v_schedule_mode = 'fixed_days' AND COALESCE(array_length(v_recurrence, 1), 0) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '固定星期模式必須至少選一天'
    );
  END IF;

  -- ══ G. 回饋決策 ═════════════════════════════════════════════════════════
  -- 命令一定要帶決策。沒有決策就沒有「這個數字是誰算的、依據什麼」，
  -- 之後政策改版時也分不出舊任務是依哪一版定價的。
  v_decision_policy := v_decision ->> 'rewardPolicy';
  v_eligibility     := v_decision ->> 'eligibility';
  v_task_policy_version   := v_meta ->> 'taskPolicyVersion';
  v_reward_policy_version := v_decision ->> 'rewardPolicyVersion';

  IF v_decision IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少回饋決策'
    );
  END IF;

  -- 畫面顯示的回饋方式與決策的必須是同一個，否則家長看到的與實際會發的不同。
  IF v_decision_policy IS DISTINCT FROM v_reward THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'message', format('任務的回饋方式是 %s，決策的是 %s',
                        COALESCE(v_reward, 'null'), COALESCE(v_decision_policy, 'null'))
    );
  END IF;

  IF v_eligibility <> 'allowed' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'message', COALESCE(NULLIF(btrim(COALESCE(v_decision ->> 'explanation', '')), ''),
                          '這個回饋方式目前不能使用')
    );
  END IF;

  -- 兩個版本都是必填，而且是分開檢查的。
  --
  -- taskPolicyVersion  = 「目的怎麼分、來源要求什麼、怎麼結束」的規則版本
  -- rewardPolicyVersion = 「這筆回饋決策是哪一份政策做的」
  --
  -- 只存一個的話，半年後改了其中一份政策，就分不出舊任務是依哪一版建立的。
  -- 不發幣的任務同樣要有 rewardPolicyVersion —— 它記的是回饋資格政策的版本，
  -- 不是幣值政策的版本，不可以拿 taskPolicyVersion 冒充。
  IF COALESCE(btrim(COALESCE(v_task_policy_version, '')), '') = '' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少任務政策版本'
    );
  END IF;

  IF COALESCE(btrim(COALESCE(v_reward_policy_version, '')), '') = '' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '回饋決策缺少回饋政策版本'
    );
  END IF;

  -- ══ H. 成長幣 ═══════════════════════════════════════════════════════════
  v_coin := v_decision -> 'coin';

  IF v_reward = 'coin_eligible' THEN
    IF v_coin IS NULL OR jsonb_typeof(v_coin) <> 'object' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '可獲得成長幣的任務缺少幣值'
      );
    END IF;

    v_coin_final     := NULLIF(v_coin ->> 'finalAmount', '')::int;
    v_coin_suggested := NULLIF(v_coin ->> 'suggestedAmount', '')::int;
    v_coin_min       := NULLIF(v_coin ->> 'minAllowed', '')::int;
    v_coin_max       := NULLIF(v_coin ->> 'maxAllowed', '')::int;

    IF v_coin_final IS NULL OR v_coin_final <= 0 THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'message', '不建立 0 幣的成長幣任務：家長看到可獲得成長幣、孩子卻拿不到，等於系統壞了'
      );
    END IF;

    IF v_coin_min IS NULL OR v_coin_max IS NULL OR v_coin_min > v_coin_max THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'message', '幣值缺少政策允許範圍'
      );
    END IF;

    IF v_coin_final < v_coin_min OR v_coin_final > v_coin_max THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'message', format('幣值 %s 不在政策允許的 %s–%s 範圍內',
                          v_coin_final, v_coin_min, v_coin_max)
      );
    END IF;
  ELSE
    -- 不發幣的政策不得夾帶金額 —— 就算命令裡有，也不寫進去。
    v_coin_final     := NULL;
    v_coin_suggested := NULL;
    v_coin_min       := NULL;
    v_coin_max       := NULL;
  END IF;

  -- ══ 9. claim 規則推導 ═══════════════════════════════════════════════════
  IF v_schedule_mode = 'one_time' THEN
    v_claim_period := 'once';
    v_max_claims   := 1;
    v_day_type     := 'once';
  ELSIF v_schedule_mode = 'weekly_frequency' THEN
    v_claim_period := 'week';
    v_max_claims   := v_weekly_freq;
    v_day_type     := 'both';
  ELSE
    v_claim_period := 'day';
    v_max_claims   := 1;
    v_day_type     := 'custom';
  END IF;

  v_long_term_type := CASE v_plan_mode
    WHEN 'growth_plan'   THEN 'skill'
    WHEN 'short_support' THEN 'habit'
    WHEN 'family_role'   THEN 'family'
    ELSE NULL
  END;

  -- ══ 10. tasks ═══════════════════════════════════════════════════════════
  -- base_time_min 仍然寫 0：它是舊公式的輸入，新任務的幣值一律走 reward_coin_amount。
  -- 兩條路徑不共用欄位，才不會有人改了其中一邊而另一邊悄悄跟著變。
  INSERT INTO tasks (
    family_id, name, category, day_type, recurrence_days, due_date,
    base_time_min, difficulty, coin_override, time_saving_min,
    is_system_default, allow_repeat, min_age, max_age, is_active,
    is_long_term, long_term_type,
    claim_period, max_claims_per_period,
    duration_type, plan_mode, task_source, reward_policy, completion_policy,
    original_expectation, completion_description, task_details, notes,
    schedule_mode, weekly_frequency, start_date, scheduled_date,
    preferred_time, preferred_time_custom, estimated_minutes,
    review_enabled, review_after_days, support_level,
    task_policy_version, reward_policy_version,
    preset_family_id, preset_variant_id, preset_catalog_version,
    command_schema_version, created_from_preset,
    reward_coin_amount, reward_coin_suggested_amount, reward_coin_min, reward_coin_max
  ) VALUES (
    v_family_id,
    btrim(p_command -> 'task' ->> 'title'),
    v_category,
    v_day_type,
    CASE WHEN v_day_type = 'custom' THEN v_recurrence ELSE NULL END,
    NULL,                      -- due_date 不用來裝 scheduled_date
    0, 1, NULL, 0,
    false,
    (v_max_claims > 1),
    0, 99, true,
    (v_duration_type = 'long_term'),
    v_long_term_type,
    v_claim_period, v_max_claims,
    v_duration_type, v_plan_mode, v_source, v_reward, v_completion_db,
    NULLIF(btrim(COALESCE(p_command -> 'task' ->> 'originalExpectation', '')), ''),
    btrim(p_command -> 'task' ->> 'completionDescription'),
    NULLIF(btrim(COALESCE(v_content ->> 'taskDetails', '')), ''),
    NULLIF(btrim(COALESCE(p_command -> 'task' ->> 'notes', '')), ''),
    v_schedule_mode, v_weekly_freq, v_start_date, v_scheduled_date,
    v_schedule ->> 'preferredTime',
    NULLIF(btrim(COALESCE(v_schedule ->> 'preferredTimeCustom', '')), ''),
    v_estimated_min,
    (v_review ->> 'reviewEnabled')::boolean,
    NULLIF(v_review ->> 'reviewAfterDays', '')::smallint,
    v_support_level,
    -- 政策版本以決策上的為準：它才是真正算出這個金額的那一版。
    v_task_policy_version, v_reward_policy_version,
    v_preset_family, v_preset_variant,
    v_meta ->> 'presetCatalogVersion',
    v_schema_version, true,
    v_coin_final, v_coin_suggested, v_coin_min, v_coin_max
  )
  RETURNING id INTO v_task_id;

  -- ══ 11. child_tasks ═════════════════════════════════════════════════════
  INSERT INTO child_tasks (child_id, task_id, is_active)
  VALUES (v_child_id, v_task_id, true)
  RETURNING id INTO v_child_task_id;
  v_related := v_related || v_child_task_id;

  -- ══ 12. long_term_goals ═════════════════════════════════════════════════
  IF v_duration_type = 'long_term' THEN
    INSERT INTO long_term_goals (
      child_id, task_id, goal_type, status, current_day,
      total_days, started_at, end_date,
      first_review_after_days, weekend_review_enabled,
      role_title, interrupt_count
    ) VALUES (
      v_child_id, v_task_id, v_long_term_type, 'active', 0,
      COALESCE((v_plan ->> 'durationDays')::int, (v_schedule ->> 'durationDays')::int),
      v_start_date, v_end_date,
      NULLIF(v_review ->> 'firstReviewAfterDays', '')::smallint,
      (v_review ->> 'weekendReviewEnabled')::boolean,
      CASE WHEN v_plan_mode = 'family_role'
        THEN COALESCE(NULLIF(btrim(COALESCE(v_role ->> 'customValue', '')), ''),
                      v_role ->> 'optionId')
        ELSE NULL END,
      0
    )
    RETURNING id INTO v_goal_id;
    v_related := v_related || v_goal_id;
  END IF;

  -- ══ 13. 選項答案 ════════════════════════════════════════════════════════
  v_selections := COALESCE(v_content -> 'selectedOptions', '{}'::jsonb);
  v_customs    := COALESCE(v_content -> 'customOptionValues', '{}'::jsonb);

  FOR v_group IN SELECT k FROM jsonb_object_keys(v_selections) AS k LOOP
    v_custom := NULLIF(btrim(COALESCE(v_customs ->> v_group, '')), '');
    FOR v_option IN
      SELECT value FROM jsonb_array_elements_text(v_selections -> v_group)
    LOOP
      INSERT INTO task_preset_selections (task_id, option_group_id, option_id, custom_value)
      VALUES (
        v_task_id, v_group, v_option,
        CASE WHEN v_option = 'other' THEN v_custom ELSE NULL END
      );
    END LOOP;
  END LOOP;

  -- ══ 14-15. 里程碑與支援步驟 ═════════════════════════════════════════════
  IF v_plan IS NOT NULL THEN
    v_idx := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_plan -> 'milestones', '[]'::jsonb))
    LOOP
      INSERT INTO task_plan_milestones (task_id, long_term_goal_id, title, target_day, sort_order)
      VALUES (
        v_task_id, v_goal_id,
        btrim(v_item ->> 'title'),
        NULLIF(v_item ->> 'targetDay', '')::int,
        v_idx
      );
      v_idx := v_idx + 1;
    END LOOP;

    v_idx := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_plan -> 'supportSteps', '[]'::jsonb))
    LOOP
      INSERT INTO task_plan_support_steps (task_id, long_term_goal_id, text, sort_order, is_custom)
      VALUES (
        v_task_id, v_goal_id,
        btrim(v_item ->> 'text'),
        v_idx,
        COALESCE((v_item ->> 'id') LIKE 'custom-%', false)
      );
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  -- ══ 16. 負責內容 ════════════════════════════════════════════════════════
  IF v_role IS NOT NULL THEN
    v_idx := 0;
    FOR v_item IN
      SELECT * FROM jsonb_array_elements(COALESCE(v_role -> 'responsibilities', '[]'::jsonb))
    LOOP
      INSERT INTO task_role_responsibilities
        (task_id, long_term_goal_id, text, sort_order, is_custom)
      VALUES (
        v_task_id, v_goal_id,
        btrim(v_item ->> 'text'),
        v_idx,
        COALESCE((v_item ->> 'isCustom')::boolean, false)
      );
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  -- ══ 17. 稽核事件 ════════════════════════════════════════════════════════
  -- reward 這一段刻意攤平成獨立鍵，而不是只靠 command 裡那份：
  -- 「這筆任務當初定價多少、依據什麼」要能用一句 SQL 查出來，不必解整包命令。
  INSERT INTO task_change_events (
    task_id, event_type, actor_user_id,
    task_policy_version, reward_policy_version, command_schema_version, snapshot
  ) VALUES (
    v_task_id, 'created_from_preset', auth.uid(),
    v_task_policy_version, v_reward_policy_version, v_schema_version,
    jsonb_build_object(
      'command', p_command,
      -- 四種版本攤平成一個區塊。它們的變更頻率與影響範圍都不同：
      -- 加一個任務家族只動 catalog、改幣值只動 reward、改分類規則才動 task policy。
      -- 擠在同一個欄位的話，事後根本分不出「這筆任務為什麼跟現在的規則不一樣」。
      'versions', jsonb_build_object(
        'commandSchemaVersion',  v_schema_version,
        'presetCatalogVersion',  v_meta ->> 'presetCatalogVersion',
        'taskPolicyVersion',     v_task_policy_version,
        'rewardPolicyVersion',   v_reward_policy_version
      ),
      'derived', jsonb_build_object(
        'category',         v_category,
        'completionPolicy', v_completion_db,
        'claimPeriod',      v_claim_period,
        'maxClaims',        v_max_claims,
        'dayType',          v_day_type
      ),
      'reward', jsonb_build_object(
        'rewardPolicy',        v_reward,
        'eligibility',         v_eligibility,
        'rewardPolicyVersion', v_reward_policy_version,
        'explanation',         v_decision ->> 'explanation',
        'suggestedAmount',     v_coin_suggested,
        'finalAmount',         v_coin_final,
        'minAllowed',          v_coin_min,
        'maxAllowed',          v_coin_max,
        'calculationBasis',    v_coin -> 'calculationBasis'
      )
    )
  )
  RETURNING id INTO v_event_id;
  v_related := v_related || v_event_id;

  -- ══ 18. 結果 ════════════════════════════════════════════════════════════
  RETURN jsonb_build_object(
    'ok', true,
    'taskId', v_task_id,
    'relatedIds', to_jsonb(v_related)
  );
END;
$$;


ALTER FUNCTION "public"."create_parent_task_v1"("p_command" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_parent_task_v1"("p_command" "jsonb") IS '從預設任務抽屜的 CreateParentTaskCommand 原子建立任務。政策 guard（含成長幣決策）全部跑在 insert 之前；任何錯誤都回滾，不留孤兒 task。';



CREATE OR REPLACE FUNCTION "public"."get_age_group"("birth_date" "date") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  age_months int;
begin
  age_months := extract(year from age(now(), birth_date)) * 12
              + extract(month from age(now(), birth_date));
  if age_months < 48 then return '2-4';
  elsif age_months < 72 then return '4-6';
  elsif age_months < 108 then return '6-9';
  else return '9-12';
  end if;
end;
$$;


ALTER FUNCTION "public"."get_age_group"("birth_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."map_completion_policy"("p_policy" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE p_policy
    WHEN 'complete_once'       THEN 'complete_once'
    WHEN 'ongoing'             THEN 'keep_recurring'
    WHEN 'keep_recurring'      THEN 'keep_recurring'
    WHEN 'plan_complete'       THEN 'finish_project'
    WHEN 'finish_project'      THEN 'finish_project'
    WHEN 'review_and_continue' THEN 'review_and_continue'
    WHEN 'stabilize_and_exit'  THEN 'stabilize_and_exit'
    ELSE NULL
  END;
$$;


ALTER FUNCTION "public"."map_completion_policy"("p_policy" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."map_purpose_category"("p_purpose" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE p_purpose
    WHEN 'life_routine'         THEN 'A'
    WHEN 'family_participation' THEN 'B'
    WHEN 'autonomous_challenge' THEN 'C'
    WHEN 'learning_skill'       THEN 'D'
    ELSE NULL
  END;
$$;


ALTER FUNCTION "public"."map_purpose_category"("p_purpose" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_task_atomic"("p_task_id" "uuid", "p_child_id" "uuid", "p_override_type" "text", "p_adjusted_coin" integer, "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_parent_id      uuid;
  v_child_family   uuid;
  v_family_id      uuid;
  v_task_name      text;
  v_task_category  text;
  v_reward_policy  text;
  v_coin_max       int;
  v_adjusted_coin  int;
  v_completion_id  uuid;
  v_original_coin  int;
  v_override_id    uuid;
  v_coin_deducted  int;
  v_coin_diff      int;
  v_wallet_id      uuid;
  v_balance_before int;
  v_event_type     text;
BEGIN
  IF p_override_type NOT IN ('partial', 'none', 'renegotiate') THEN
    RAISE EXCEPTION 'Invalid override_type: %', p_override_type;
  END IF;

  -- ── 授權 ────────────────────────────────────────────────────────────────
  SELECT c.family_id INTO v_child_family FROM children c WHERE c.id = p_child_id;
  IF v_child_family IS NULL THEN
    RAISE EXCEPTION 'Child not found: %', p_child_id USING ERRCODE = '42501';
  END IF;

  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM parents p
      WHERE p.user_id = auth.uid() AND p.family_id = v_child_family
    ) THEN
      RAISE EXCEPTION 'Not authorized: child % is not in the caller''s family', p_child_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 記錄「是誰做的這次調整」時，取的是**這個家庭裡**屬於呼叫者的那一筆 parents。
  -- 舊寫法 `WHERE user_id = auth.uid() LIMIT 1` 在同一帳號有多個家庭時，
  -- 會把另一個家庭的 parent_id 寫進 overrides 與 intervention_log。
  SELECT p.id INTO v_parent_id
  FROM parents p
  WHERE p.user_id = auth.uid() AND p.family_id = v_child_family;

  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION 'Parent not found for caller in family %', v_child_family;
  END IF;

  SELECT family_id, name, category, reward_policy, reward_coin_max
  INTO v_family_id, v_task_name, v_task_category, v_reward_policy, v_coin_max
  FROM tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;

  IF v_family_id IS DISTINCT FROM v_child_family THEN
    RAISE EXCEPTION 'Not authorized: task % does not belong to child %''s family', p_task_id, p_child_id
      USING ERRCODE = '42501';
  END IF;

  -- ── 調整幅度 ────────────────────────────────────────────────────────────
  -- 這支可以「調整」完成的幣值，而 v_coin_diff < 0 時是加幣（type = 'adjust'）。
  -- 沒有夾制的話，override 就是一條繞過回饋政策的加幣後門。
  --
  --   非 coin_eligible 的新任務 → 一律 0
  --   coin_eligible 的新任務    → 夾在 0 與政策上限之間
  --   舊任務（reward_policy NULL）→ 行為不變
  --
  -- 下限刻意夾在 0 而不是 minAllowed：往下調整正是 override 的正當用途
  -- （partial 給部分、none 判定沒完成）。要擋的是往上超出政策，不是往下扣減。
  v_adjusted_coin := CASE
    WHEN v_reward_policy IS NULL THEN p_adjusted_coin
    WHEN v_reward_policy <> 'coin_eligible' THEN 0
    ELSE LEAST(GREATEST(p_adjusted_coin, 0), COALESCE(v_coin_max, p_adjusted_coin))
  END;

  SELECT id, coin_earned INTO v_completion_id, v_original_coin
  FROM task_completions
  WHERE task_id  = p_task_id
    AND child_id = p_child_id
    AND (completed_at AT TIME ZONE 'Asia/Taipei')::date = (now() AT TIME ZONE 'Asia/Taipei')::date
  ORDER BY completed_at DESC
  LIMIT 1;

  IF v_completion_id IS NULL THEN
    INSERT INTO task_completions
      (task_id, child_id, completed_at, reported_at, reported_by, status, coin_earned, time_saved_min)
    VALUES (
      p_task_id, p_child_id, now(), now(), 'parent',
      CASE WHEN p_override_type = 'none' THEN 'flagged' ELSE 'completed' END,
      0, 0
    )
    RETURNING id, coin_earned INTO v_completion_id, v_original_coin;
  END IF;

  v_coin_deducted := GREATEST(v_original_coin - v_adjusted_coin, 0);

  INSERT INTO overrides (completion_id, parent_id, override_type, coin_deducted, credit_flag, reason)
  VALUES (v_completion_id, v_parent_id, p_override_type, v_coin_deducted, false, p_note)
  RETURNING id INTO v_override_id;

  SELECT id, balance INTO v_wallet_id, v_balance_before
  FROM wallets WHERE child_id = p_child_id AND wallet_type = 'spending';

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Spending wallet not found for child %', p_child_id;
  END IF;

  v_coin_diff := v_original_coin - v_adjusted_coin;
  IF v_coin_diff <> 0 THEN
    UPDATE wallets SET balance = balance - v_coin_diff WHERE id = v_wallet_id;

    INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
    VALUES (
      v_wallet_id, abs(v_coin_diff),
      CASE WHEN v_coin_diff > 0 THEN 'deduct' ELSE 'adjust' END,
      v_override_id, 'override'
    );
  END IF;

  UPDATE task_completions
  SET coin_earned = v_adjusted_coin,
      override_id = v_override_id,
      status = CASE WHEN p_override_type = 'none' THEN 'flagged' ELSE status END
  WHERE id = v_completion_id;

  v_event_type := CASE p_override_type
    WHEN 'partial'     THEN 'parent_override_partial'
    WHEN 'none'        THEN 'parent_override_none'
    WHEN 'renegotiate' THEN 'parent_override_renegotiate'
  END;

  INSERT INTO intervention_log
    (family_id, child_id, parent_id, task_id, task_name_snapshot, override_id,
     event_type, trigger_source, parent_decision, context_snapshot)
  VALUES (
    v_family_id, p_child_id, v_parent_id, p_task_id, v_task_name, v_override_id,
    v_event_type, 'parent_manual',
    jsonb_build_object('override_type', p_override_type, 'coin_deducted', v_coin_deducted,
                       'credit_flag', false, 'reason', p_note,
                       'requested_coin', p_adjusted_coin, 'applied_coin', v_adjusted_coin),
    jsonb_build_object('coin_earned_original', v_original_coin,
                       'wallet_balance_before', v_balance_before,
                       'task_category', v_task_category,
                       'reward_policy', v_reward_policy,
                       'reward_coin_max', v_coin_max)
  );

  RETURN jsonb_build_object(
    'completionId', v_completion_id,
    'overrideId', v_override_id,
    'coinEarned', v_adjusted_coin
  );
END;
$$;


ALTER FUNCTION "public"."mark_task_atomic"("p_task_id" "uuid", "p_child_id" "uuid", "p_override_type" "text", "p_adjusted_coin" integer, "p_note" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_task_atomic"("p_task_id" "uuid", "p_child_id" "uuid", "p_override_type" "text", "p_adjusted_coin" integer, "p_note" "text") IS '家長調整完成紀錄。新任務的調整受 tasks.reward_coin_max 夾制，非 coin_eligible 一律 0；舊任務行為不變。';



CREATE OR REPLACE FUNCTION "public"."my_family_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select family_id from parents where user_id = auth.uid() limit 1;
$$;


ALTER FUNCTION "public"."my_family_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_parent_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select id from parents where user_id = auth.uid() limit 1;
$$;


ALTER FUNCTION "public"."my_parent_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_completion_context"("p_completion_id" "uuid", "p_planned_time_window" "text", "p_start_mode" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."record_completion_context"("p_completion_id" "uuid", "p_planned_time_window" "text", "p_start_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_wish"("p_child_id" "uuid", "p_item_id" "uuid", "p_cost" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_wallet_id    uuid;
  v_child_family uuid;
BEGIN
  SELECT c.family_id INTO v_child_family FROM children c WHERE c.id = p_child_id;
  IF v_child_family IS NULL THEN
    RAISE EXCEPTION 'Child not found: %', p_child_id USING ERRCODE = '42501';
  END IF;

  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM parents p
      WHERE p.user_id = auth.uid() AND p.family_id = v_child_family
    ) THEN
      RAISE EXCEPTION 'Not authorized: child % is not in the caller''s family', p_child_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 兌換品也必須是同一個家庭的，否則可以拿別人家的獎勵扣自己的錢包。
  IF NOT EXISTS (
    SELECT 1 FROM reward_items r
    WHERE r.id = p_item_id AND r.family_id = v_child_family
  ) THEN
    RAISE EXCEPTION 'Not authorized: reward item % is not in child %''s family', p_item_id, p_child_id
      USING ERRCODE = '42501';
  END IF;

  -- Idempotency: bail if item was already redeemed (handles double-tap retry)
  IF EXISTS (
    SELECT 1 FROM reward_items WHERE id = p_item_id AND is_redeemed = true
  ) THEN
    RETURN jsonb_build_object('error', 'already_redeemed');
  END IF;

  -- Conditional deduct — atomicity comes from the database.
  UPDATE wallets
  SET    balance = balance - p_cost
  WHERE  child_id    = p_child_id
    AND  wallet_type = 'spending'
    AND  balance     >= p_cost
  RETURNING id INTO v_wallet_id;

  IF v_wallet_id IS NULL THEN
    RETURN jsonb_build_object('error', 'insufficient_balance');
  END IF;

  INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
  VALUES (v_wallet_id, p_cost, 'redeem', p_item_id, 'reward_item');

  UPDATE reward_items
  SET  is_redeemed = true,
       redeemed_at = now(),
       is_active   = false
  WHERE id = p_item_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION "public"."redeem_wish"("p_child_id" "uuid", "p_item_id" "uuid", "p_cost" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_redemption_request"("p_request_id" "uuid", "p_decision" "text", "p_adjusted_coins" integer DEFAULT NULL::integer, "p_parent_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_req            record;
  v_final_cost     int;
  v_wallet_id      uuid;
  v_balance_before int;
BEGIN
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  SELECT * INTO v_req FROM redemption_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Redemption request not found: %', p_request_id;
  END IF;

  -- Authorization (P1-6 pattern): service_role bypasses; authenticated callers
  -- must own the request's family.
  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF v_req.family_id <> (SELECT family_id FROM parents WHERE user_id = auth.uid() LIMIT 1) THEN
      RAISE EXCEPTION 'Not authorized: request % is not in the caller''s family', p_request_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Idempotency: a request already reviewed cannot be reviewed again.
  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('error', 'already_reviewed');
  END IF;

  IF p_decision = 'reject' THEN
    UPDATE redemption_requests
    SET    status      = 'rejected',
           parent_note = p_parent_note,
           reviewed_at = now()
    WHERE  id = p_request_id;

    INSERT INTO intervention_log
      (family_id, child_id, event_type, trigger_source, ai_suggested, parent_decision)
    VALUES (
      v_req.family_id, v_req.child_id, 'redemption_reviewed', 'parent_manual',
      jsonb_build_object('verdict', v_req.ai_verdict, 'reason', v_req.ai_reason, 'suggestedCoins', v_req.ai_suggested_coins),
      jsonb_build_object('status', 'rejected', 'note', p_parent_note)
    );

    RETURN jsonb_build_object('ok', true, 'status', 'rejected');
  END IF;

  -- p_decision = 'approve'
  -- adjusted_coins semantics: an explicit parent-adjusted price wins; otherwise
  -- the child's original ask stands.
  v_final_cost := coalesce(p_adjusted_coins, v_req.coin_cost);

  SELECT balance INTO v_balance_before
  FROM wallets
  WHERE child_id = v_req.child_id AND wallet_type = 'spending';

  -- Conditional deduct — same race-safe pattern as redeem_wish.
  UPDATE wallets
  SET    balance = balance - v_final_cost
  WHERE  child_id    = v_req.child_id
    AND  wallet_type = 'spending'
    AND  balance     >= v_final_cost
  RETURNING id INTO v_wallet_id;

  IF v_wallet_id IS NULL THEN
    RETURN jsonb_build_object('error', 'insufficient_balance');
  END IF;

  UPDATE redemption_requests
  SET    status         = 'approved',
         adjusted_coins = p_adjusted_coins,
         parent_note    = p_parent_note,
         reviewed_at    = now()
  WHERE  id = p_request_id;

  INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
  VALUES (v_wallet_id, v_final_cost, 'redeem', p_request_id, 'redemption_request');

  INSERT INTO intervention_log
    (family_id, child_id, event_type, trigger_source, ai_suggested, parent_decision, context_snapshot)
  VALUES (
    v_req.family_id, v_req.child_id, 'redemption_reviewed', 'parent_manual',
    jsonb_build_object('verdict', v_req.ai_verdict, 'reason', v_req.ai_reason, 'suggestedCoins', v_req.ai_suggested_coins),
    jsonb_build_object('status', 'approved', 'finalCoins', v_final_cost, 'adjustedCoins', p_adjusted_coins, 'note', p_parent_note),
    jsonb_build_object('walletBalanceBefore', v_balance_before, 'originalCoinCost', v_req.coin_cost)
  );

  RETURN jsonb_build_object('ok', true, 'status', 'approved', 'finalCoins', v_final_cost);
END;
$$;


ALTER FUNCTION "public"."review_redemption_request"("p_request_id" "uuid", "p_decision" "text", "p_adjusted_coins" integer, "p_parent_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settle_weekly_interest"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  w                record;
  interest_amount  int;
  v_wallets_paid   int := 0;
  v_wallets_zero   int := 0;
  v_total_interest int := 0;
BEGIN
  FOR w IN
    SELECT * FROM wallets
    WHERE wallet_type = 'saving'
      AND balance > 0
      AND (last_interest_at IS NULL OR last_interest_at <= now() - interval '14 days')
  LOOP
    interest_amount := round(w.balance * w.interest_rate)::int;
    IF interest_amount > 0 THEN
      UPDATE wallets
        SET balance = balance + interest_amount,
            last_interest_at = now()
        WHERE id = w.id;
      INSERT INTO transactions (wallet_id, amount, type, note)
        VALUES (w.id, interest_amount, 'interest', '週日利息自動入帳');
      v_wallets_paid   := v_wallets_paid + 1;
      v_total_interest := v_total_interest + interest_amount;
    ELSE
      -- Balance too small to yield a non-zero interest amount this cycle.
      -- Deliberately do NOT advance last_interest_at here, so a wallet that
      -- crosses back above the rounding threshold next cycle isn't skipped.
      v_wallets_zero := v_wallets_zero + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'walletsPaid', v_wallets_paid,
    'walletsZeroInterest', v_wallets_zero,
    'totalInterest', v_total_interest,
    'settledAt', now()
  );
END;
$$;


ALTER FUNCTION "public"."settle_weekly_interest"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."setup_child_tasks"("p_family_id" "uuid", "p_child_id" "uuid", "p_template_ids" "uuid"[], "p_custom_tasks" "jsonb" DEFAULT '[]'::"jsonb", "p_reward_name" "text" DEFAULT ''::"text", "p_coin_cost" integer DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_task_id UUID;
  v_tmpl    system_task_templates%ROWTYPE;
  v_custom  JSONB;
BEGIN
  -- Authorization (P1-6): caller must be a parent of the target family, and the
  -- target child must belong to that family. service_role bypasses.
  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM parents
      WHERE user_id = auth.uid() AND family_id = p_family_id
    ) THEN
      RAISE EXCEPTION 'Not authorized: caller is not a parent of family %', p_family_id
        USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM children WHERE id = p_child_id AND family_id = p_family_id
    ) THEN
      RAISE EXCEPTION 'Not authorized: child % is not in family %', p_child_id, p_family_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 1. 複製模板任務
  FOR v_tmpl IN
    SELECT * FROM system_task_templates WHERE id = ANY(p_template_ids)
  LOOP
    INSERT INTO tasks (family_id, name, category, day_type,
                       base_time_min, difficulty, time_saving_min, is_system_default)
    VALUES (p_family_id, v_tmpl.name, v_tmpl.category, 'both',
            v_tmpl.base_time_min, v_tmpl.difficulty, v_tmpl.time_saving_min, false)
    RETURNING id INTO v_task_id;

    INSERT INTO child_tasks (child_id, task_id)
    VALUES (p_child_id, v_task_id);
  END LOOP;

  -- 2. 插入自訂任務
  FOR v_custom IN SELECT * FROM jsonb_array_elements(p_custom_tasks)
  LOOP
    INSERT INTO tasks (family_id, name, category, day_type,
                       base_time_min, difficulty, time_saving_min, is_system_default)
    VALUES (
      p_family_id,
      v_custom->>'name',
      v_custom->>'category',
      'both',
      (v_custom->>'base_time_min')::INT,
      (v_custom->>'difficulty')::NUMERIC,
      (v_custom->>'time_saving_min')::INT,
      false
    )
    RETURNING id INTO v_task_id;

    INSERT INTO child_tasks (child_id, task_id)
    VALUES (p_child_id, v_task_id);
  END LOOP;

  -- 3. 寫入兌換目標
  INSERT INTO reward_items
    (family_id, child_id, name, reward_type, coin_cost, added_by, parent_approved)
  VALUES
    (p_family_id, p_child_id, p_reward_name, 'item', p_coin_cost, 'parent', true);
END;
$$;


ALTER FUNCTION "public"."setup_child_tasks"("p_family_id" "uuid", "p_child_id" "uuid", "p_template_ids" "uuid"[], "p_custom_tasks" "jsonb", "p_reward_name" "text", "p_coin_cost" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_onboarding"("p_family_name" "text", "p_parent_name" "text", "p_baumrind_type" "text", "p_child_nickname" "text", "p_child_birth_date" "date", "p_child_age_group" "text", "p_child_account_type" "text", "p_child_pin" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_family_id uuid;
  v_child_id  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM parents WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'This account has already completed onboarding' USING ERRCODE = '23505';
  END IF;

  INSERT INTO families (family_name)
  VALUES (p_family_name)
  RETURNING id INTO v_family_id;

  INSERT INTO parents (family_id, user_id, name, baumrind_type)
  VALUES (v_family_id, auth.uid(), p_parent_name, p_baumrind_type);

  INSERT INTO children (family_id, nickname, birth_date, age_group, account_type, pin_code)
  VALUES (v_family_id, p_child_nickname, p_child_birth_date, p_child_age_group, p_child_account_type, p_child_pin)
  RETURNING id INTO v_child_id;

  INSERT INTO child_profiles (child_id, motivation_level)
  VALUES (v_child_id, 'external');

  INSERT INTO wallets (child_id, wallet_type, balance)
  VALUES (v_child_id, 'spending', 0);

  IF p_child_account_type = 'DOUBLE' THEN
    INSERT INTO wallets (child_id, wallet_type, balance)
    VALUES (v_child_id, 'saving', 0);
  END IF;

  RETURN jsonb_build_object('familyId', v_family_id, 'childId', v_child_id);
END;
$$;


ALTER FUNCTION "public"."submit_onboarding"("p_family_name" "text", "p_parent_name" "text", "p_baumrind_type" "text", "p_child_nickname" "text", "p_child_birth_date" "date", "p_child_age_group" "text", "p_child_account_type" "text", "p_child_pin" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."child_profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "motivation_level" "text" DEFAULT 'external'::"text" NOT NULL,
    "personality_type" "text",
    "interest_tags" "text"[],
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "child_profiles_motivation_level_check" CHECK (("motivation_level" = ANY (ARRAY['amotivation'::"text", 'external'::"text", 'introjected'::"text", 'internal'::"text"]))),
    CONSTRAINT "child_profiles_personality_type_check" CHECK (("personality_type" = ANY (ARRAY['competitive'::"text", 'relational'::"text", 'curious'::"text"])))
);


ALTER TABLE "public"."child_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."child_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."child_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."children" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "nickname" "text" NOT NULL,
    "birth_date" "date" NOT NULL,
    "age_group" "text" NOT NULL,
    "account_type" "text" DEFAULT 'SINGLE'::"text" NOT NULL,
    "pin_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "children_account_type_check" CHECK (("account_type" = ANY (ARRAY['SINGLE'::"text", 'DOUBLE'::"text"]))),
    CONSTRAINT "children_age_group_check" CHECK (("age_group" = ANY (ARRAY['2-4'::"text", '4-6'::"text", '6-9'::"text", '9-12'::"text"])))
);


ALTER TABLE "public"."children" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "month" "date" NOT NULL,
    "flagged_count" integer DEFAULT 0 NOT NULL,
    "repair_task_completed" boolean DEFAULT false NOT NULL,
    "current_score" integer DEFAULT 100 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."credit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."families" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "family_name" "text" NOT NULL,
    "timezone" "text" DEFAULT 'Asia/Taipei'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."families" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."growth_moments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."growth_moments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intervention_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "task_id" "uuid",
    "task_name_snapshot" "text",
    "override_id" "uuid",
    "correlation_id" "uuid",
    "event_type" "text" NOT NULL,
    "trigger_source" "text" NOT NULL,
    "ai_suggested" "jsonb",
    "parent_decision" "jsonb",
    "context_snapshot" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."intervention_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."long_term_goals" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "goal_type" "text" NOT NULL,
    "total_days" integer,
    "current_day" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "checkpoint_rewards" "jsonb",
    "motivation_note" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "next_review_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "min_age" integer DEFAULT 4,
    "interrupt_count" integer DEFAULT 0,
    "last_active_date" "date",
    "level_definitions" "jsonb",
    "current_level" integer DEFAULT 1,
    "level_count" integer DEFAULT 3,
    "role_title" "text",
    "salary_mode" boolean DEFAULT false,
    "base_salary" integer,
    "weekly_target_rate" numeric DEFAULT 0.8,
    "privilege_reward" "jsonb",
    "target_value" numeric,
    "current_value" numeric DEFAULT 0,
    "value_unit" "text",
    "family_time_per_completion" integer,
    "target_completions" integer,
    "active_days" integer[],
    "preferred_time_window" "text",
    "end_date" "date",
    "first_review_after_days" smallint,
    "weekend_review_enabled" boolean,
    CONSTRAINT "long_term_goals_date_range_check" CHECK ((("end_date" IS NULL) OR ("started_at" IS NULL) OR (("started_at")::"date" <= "end_date"))),
    CONSTRAINT "long_term_goals_first_review_check" CHECK ((("first_review_after_days" IS NULL) OR ("first_review_after_days" > 0))),
    CONSTRAINT "long_term_goals_goal_type_check" CHECK (("goal_type" = ANY (ARRAY['habit'::"text", 'skill'::"text", 'responsibility'::"text", 'challenge'::"text"]))),
    CONSTRAINT "long_term_goals_preferred_time_window_check" CHECK ((("preferred_time_window" IS NULL) OR ("preferred_time_window" = ANY (ARRAY['after_dinner'::"text", 'before_bed'::"text"])))),
    CONSTRAINT "long_term_goals_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."long_term_goals" OWNER TO "postgres";


COMMENT ON COLUMN "public"."long_term_goals"."end_date" IS '期間最後一天（含）。由 command.schedule.endDate 帶入，不在 DB 重算。';



COMMENT ON COLUMN "public"."long_term_goals"."first_review_after_days" IS '第一次回顧在第幾天。既有的 next_review_at 存的是時間點，重排時要反推容易算錯。';



CREATE TABLE IF NOT EXISTS "public"."monthly_reports" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "month" "date" NOT NULL,
    "growth_summary" "text",
    "parent_reflection" "jsonb",
    "meeting_agenda" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."monthly_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."overrides" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "completion_id" "uuid" NOT NULL,
    "parent_id" "uuid" NOT NULL,
    "override_type" "text" NOT NULL,
    "coin_deducted" integer DEFAULT 0 NOT NULL,
    "credit_flag" boolean DEFAULT false NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "overrides_override_type_check" CHECK (("override_type" = ANY (ARRAY['partial'::"text", 'none'::"text", 'renegotiate'::"text"])))
);


ALTER TABLE "public"."overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parent_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "obs_type" "text" NOT NULL,
    "note" "text",
    "reward_adj" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_id" "uuid",
    CONSTRAINT "parent_observations_obs_type_check" CHECK (("obs_type" = ANY (ARRAY['noaction'::"text", 'quality'::"text", 'bonus'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."parent_observations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parents" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "role" "text" DEFAULT 'primary'::"text" NOT NULL,
    "baumrind_type" "text",
    "ai_mode" "text" DEFAULT 'balanced'::"text" NOT NULL,
    "weekly_time_min" integer DEFAULT 15 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    CONSTRAINT "parents_ai_mode_check" CHECK (("ai_mode" = ANY (ARRAY['conservative'::"text", 'balanced'::"text", 'auto'::"text"]))),
    CONSTRAINT "parents_baumrind_type_check" CHECK (("baumrind_type" = ANY (ARRAY['elite_high_control'::"text", 'pragmatic_labor'::"text", 'guilt_compensate'::"text", 'free_fatigue'::"text"]))),
    CONSTRAINT "parents_role_check" CHECK (("role" = ANY (ARRAY['primary'::"text", 'co'::"text"])))
);


ALTER TABLE "public"."parents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."redemption_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "coin_cost" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "ai_verdict" "text",
    "ai_reason" "text",
    "ai_suggested_coins" integer,
    "adjusted_coins" integer,
    "parent_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    CONSTRAINT "redemption_requests_ai_verdict_check" CHECK (("ai_verdict" = ANY (ARRAY['ok'::"text", 'high'::"text"]))),
    CONSTRAINT "redemption_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."redemption_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reward_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "child_id" "uuid",
    "name" "text" NOT NULL,
    "reward_type" "text" NOT NULL,
    "coin_cost" integer NOT NULL,
    "added_by" "text" NOT NULL,
    "parent_approved" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_redeemed" boolean DEFAULT false NOT NULL,
    "redeemed_at" timestamp with time zone,
    CONSTRAINT "reward_items_added_by_check" CHECK (("added_by" = ANY (ARRAY['parent'::"text", 'child'::"text"]))),
    CONSTRAINT "reward_items_reward_type_check" CHECK (("reward_type" = ANY (ARRAY['item'::"text", 'privilege'::"text", 'screen_time'::"text"])))
);


ALTER TABLE "public"."reward_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sibling_relations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "mentor_child_id" "uuid" NOT NULL,
    "mentee_child_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sibling_relations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_task_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "age_group" "text" NOT NULL,
    "base_time_min" integer DEFAULT 15 NOT NULL,
    "difficulty" numeric(3,1) DEFAULT 1 NOT NULL,
    "time_saving_min" integer DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_task_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_change_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_user_id" "uuid",
    "task_policy_version" "text",
    "reward_policy_version" "text",
    "command_schema_version" smallint,
    "snapshot" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_change_events_type_check" CHECK (("event_type" = ANY (ARRAY['created_from_preset'::"text", 'updated_from_preset'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."task_change_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."task_change_events" IS 'append-only。snapshot 是稽核用的當下摘要，不是 production 的現況來源 —— 現況一律讀 tasks 與各子表。';



CREATE TABLE IF NOT EXISTS "public"."task_completions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reported_by" "text" DEFAULT 'child'::"text" NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "coin_earned" integer DEFAULT 0 NOT NULL,
    "time_saved_min" integer DEFAULT 0 NOT NULL,
    "mentor_child_id" "uuid",
    "override_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "planned_time_window" "text",
    "start_mode" "text",
    CONSTRAINT "task_completions_planned_time_window_check" CHECK ((("planned_time_window" IS NULL) OR ("planned_time_window" = ANY (ARRAY['after_dinner'::"text", 'before_bed'::"text"])))),
    CONSTRAINT "task_completions_reported_by_check" CHECK (("reported_by" = ANY (ARRAY['child'::"text", 'parent'::"text"]))),
    CONSTRAINT "task_completions_start_mode_check" CHECK ((("start_mode" IS NULL) OR ("start_mode" = ANY (ARRAY['self_started'::"text", 'reminded'::"text"])))),
    CONSTRAINT "task_completions_status_check" CHECK (("status" = ANY (ARRAY['completed'::"text", 'flagged'::"text"])))
);


ALTER TABLE "public"."task_completions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_plan_milestones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "long_term_goal_id" "uuid",
    "title" "text" NOT NULL,
    "target_day" integer,
    "sort_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_plan_milestones_target_day" CHECK ((("target_day" IS NULL) OR ("target_day" > 0))),
    CONSTRAINT "task_plan_milestones_title_len" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 200)))
);


ALTER TABLE "public"."task_plan_milestones" OWNER TO "postgres";


COMMENT ON TABLE "public"."task_plan_milestones" IS '成長計畫的里程碑。刻意不用 long_term_goals.level_definitions —— 那個形狀綁著幣值，而里程碑刻意沒有幣值（回饋的是投入與持續，不是達標）。';



CREATE TABLE IF NOT EXISTS "public"."task_plan_support_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "long_term_goal_id" "uuid",
    "text" "text" NOT NULL,
    "sort_order" integer NOT NULL,
    "is_custom" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_plan_support_steps_text_len" CHECK ((("char_length"("text") >= 1) AND ("char_length"("text") <= 300)))
);


ALTER TABLE "public"."task_plan_support_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_preset_selections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "option_group_id" "text" NOT NULL,
    "option_id" "text" NOT NULL,
    "custom_value" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_preset_selections_custom_value_len" CHECK ((("custom_value" IS NULL) OR ("char_length"("custom_value") <= 200)))
);


ALTER TABLE "public"."task_preset_selections" OWNER TO "postgres";


COMMENT ON TABLE "public"."task_preset_selections" IS '任務目前生效的選項答案。更新時採同一交易內 delete + insert（replace），不在這裡保留歷史 —— 歷史走 task_change_events。';



CREATE TABLE IF NOT EXISTS "public"."task_role_responsibilities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "long_term_goal_id" "uuid",
    "text" "text" NOT NULL,
    "sort_order" integer NOT NULL,
    "is_custom" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_role_responsibilities_text_len" CHECK ((("char_length"("text") >= 1) AND ("char_length"("text") <= 300)))
);


ALTER TABLE "public"."task_role_responsibilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "day_type" "text" DEFAULT 'both'::"text" NOT NULL,
    "long_term_type" "text",
    "is_long_term" boolean DEFAULT false NOT NULL,
    "base_time_min" integer DEFAULT 0 NOT NULL,
    "difficulty" numeric(3,1) DEFAULT 1.0 NOT NULL,
    "coin_override" integer,
    "is_system_default" boolean DEFAULT false NOT NULL,
    "allow_repeat" boolean DEFAULT false NOT NULL,
    "min_age" integer DEFAULT 2 NOT NULL,
    "max_age" integer DEFAULT 12 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "time_saving_min" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recurrence_days" integer[],
    "due_date" "date",
    "claim_period" "text" DEFAULT 'day'::"text" NOT NULL,
    "max_claims_per_period" integer DEFAULT 1 NOT NULL,
    "duration_type" "text",
    "plan_mode" "text",
    "task_source" "text",
    "reward_policy" "text",
    "completion_policy" "text",
    "original_expectation" "text",
    "completion_description" "text",
    "task_details" "text",
    "notes" "text",
    "schedule_mode" "text",
    "weekly_frequency" smallint,
    "start_date" "date",
    "scheduled_date" "date",
    "preferred_time" "text",
    "preferred_time_custom" "text",
    "estimated_minutes" integer,
    "review_enabled" boolean,
    "review_after_days" smallint,
    "support_level" "text",
    "task_policy_version" "text",
    "reward_policy_version" "text",
    "preset_family_id" "text",
    "preset_variant_id" "text",
    "preset_catalog_version" "text",
    "command_schema_version" smallint,
    "created_from_preset" boolean DEFAULT false NOT NULL,
    "reward_coin_amount" integer,
    "reward_coin_suggested_amount" integer,
    "reward_coin_min" integer,
    "reward_coin_max" integer,
    CONSTRAINT "tasks_category_check" CHECK (("category" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text", 'D'::"text"]))),
    CONSTRAINT "tasks_claim_period_check" CHECK (("claim_period" = ANY (ARRAY['day'::"text", 'week'::"text", 'once'::"text"]))),
    CONSTRAINT "tasks_coin_eligible_needs_amount_check" CHECK ((("reward_policy" IS DISTINCT FROM 'coin_eligible'::"text") OR (("reward_coin_amount" IS NOT NULL) AND ("reward_coin_amount" > 0) AND ("reward_coin_min" IS NOT NULL) AND ("reward_coin_max" IS NOT NULL) AND (("reward_coin_amount" >= "reward_coin_min") AND ("reward_coin_amount" <= "reward_coin_max")) AND ("reward_policy_version" IS NOT NULL)))),
    CONSTRAINT "tasks_command_schema_version_check" CHECK ((("command_schema_version" IS NULL) OR ("command_schema_version" > 0))),
    CONSTRAINT "tasks_completion_policy_check" CHECK ((("completion_policy" IS NULL) OR ("completion_policy" = ANY (ARRAY['complete_once'::"text", 'keep_recurring'::"text", 'finish_project'::"text", 'review_and_continue'::"text", 'stabilize_and_exit'::"text"])))),
    CONSTRAINT "tasks_day_type_check" CHECK (("day_type" = ANY (ARRAY['weekday'::"text", 'weekend'::"text", 'both'::"text", 'custom'::"text", 'once'::"text"]))),
    CONSTRAINT "tasks_duration_type_check" CHECK ((("duration_type" IS NULL) OR ("duration_type" = ANY (ARRAY['one_time'::"text", 'recurring'::"text", 'long_term'::"text"])))),
    CONSTRAINT "tasks_estimated_minutes_check" CHECK ((("estimated_minutes" IS NULL) OR ("estimated_minutes" > 0))),
    CONSTRAINT "tasks_long_term_type_check" CHECK (("long_term_type" = ANY (ARRAY['habit'::"text", 'skill'::"text", 'responsibility'::"text", 'challenge'::"text"]))),
    CONSTRAINT "tasks_max_claims_per_period_check" CHECK (("max_claims_per_period" > 0)),
    CONSTRAINT "tasks_non_coin_has_no_amount_check" CHECK ((("reward_policy" IS NULL) OR ("reward_policy" = 'coin_eligible'::"text") OR ("reward_coin_amount" IS NULL))),
    CONSTRAINT "tasks_one_time_needs_date_check" CHECK ((("duration_type" IS DISTINCT FROM 'one_time'::"text") OR ("scheduled_date" IS NOT NULL))),
    CONSTRAINT "tasks_plan_mode_check" CHECK ((("plan_mode" IS NULL) OR ("plan_mode" = ANY (ARRAY['growth_plan'::"text", 'short_support'::"text", 'family_role'::"text"])))),
    CONSTRAINT "tasks_review_after_days_check" CHECK ((("review_after_days" IS NULL) OR ("review_after_days" > 0))),
    CONSTRAINT "tasks_reward_coin_positive_check" CHECK (((("reward_coin_amount" IS NULL) OR ("reward_coin_amount" > 0)) AND (("reward_coin_suggested_amount" IS NULL) OR ("reward_coin_suggested_amount" > 0)) AND (("reward_coin_min" IS NULL) OR ("reward_coin_min" > 0)) AND (("reward_coin_max" IS NULL) OR ("reward_coin_max" > 0)))),
    CONSTRAINT "tasks_reward_coin_range_check" CHECK ((("reward_coin_min" IS NULL) OR ("reward_coin_max" IS NULL) OR ("reward_coin_min" <= "reward_coin_max"))),
    CONSTRAINT "tasks_reward_policy_check" CHECK ((("reward_policy" IS NULL) OR ("reward_policy" = ANY (ARRAY['record_only'::"text", 'family_contribution'::"text", 'progress_only'::"text", 'coin_eligible'::"text", 'time_saving_eligible'::"text"])))),
    CONSTRAINT "tasks_schedule_mode_check" CHECK ((("schedule_mode" IS NULL) OR ("schedule_mode" = ANY (ARRAY['one_time'::"text", 'fixed_days'::"text", 'weekly_frequency'::"text", 'plan_schedule'::"text"])))),
    CONSTRAINT "tasks_support_level_check" CHECK ((("support_level" IS NULL) OR ("support_level" = ANY (ARRAY['together_first'::"text", 'remind_then_check'::"text", 'independent_with_help'::"text", 'independent'::"text", 'check_after'::"text", 'do_together'::"text"])))),
    CONSTRAINT "tasks_task_source_check" CHECK ((("task_source" IS NULL) OR ("task_source" = ANY (ARRAY['parent'::"text", 'child'::"text", 'co_created'::"text", 'system'::"text", 'system_suggested'::"text"])))),
    CONSTRAINT "tasks_weekly_frequency_check" CHECK ((("weekly_frequency" IS NULL) OR (("weekly_frequency" >= 1) AND ("weekly_frequency" <= 7))))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tasks"."claim_period" IS 'Window a claim frequency cap resets over. day / week 沿用 coin-policy.json；once = 整個任務生命週期只能完成 max_claims_per_period 次（單次任務）。';



COMMENT ON COLUMN "public"."tasks"."max_claims_per_period" IS 'Max times this task may be claimed (completed) per claim_period. Mirrors coin-policy.json frequency.defaultMaxClaimsPerPeriod. P0 guard — see complete_task.';



COMMENT ON COLUMN "public"."tasks"."reward_policy" IS 'NULL = 本欄位之前建立的舊任務，完成流程沿用 category 判斷（legacy path）。';



COMMENT ON COLUMN "public"."tasks"."scheduled_date" IS '單次任務安排在哪一天。與 due_date 不同：due_date 是「過了就隱藏」的截止語義。';



COMMENT ON COLUMN "public"."tasks"."estimated_minutes" IS '家長估計的投入分鐘。刻意與 base_time_min 分開：base_time_min 參與幣值計算，把時間估計寫進去會連帶改變這個任務值多少幣。';



COMMENT ON COLUMN "public"."tasks"."task_policy_version" IS '任務政策的版本：目的怎麼分、來源要求什麼、哪些回饋方式合法、怎麼結束與退場。對應 docs/SPEC_task-taxonomy-2026-07.md。**不是幣值版本** —— 幣值在 reward_policy_version。兩者各自進版，共用一個欄位會讓稽核失去意義。';



COMMENT ON COLUMN "public"."tasks"."reward_policy_version" IS '做出這筆任務回饋決策的政策版本。可發幣的任務是 coin-policy.json 的 policyVersion；不發幣的任務是回饋資格政策的版本（它沒有經過幣值計算，蓋上幣值版本是假的）。';



COMMENT ON COLUMN "public"."tasks"."preset_catalog_version" IS 'catalog 是 TypeScript 常數不是 DB master table，所以 preset id 不設外鍵；改為記下產生這筆資料的 catalog 版本，讓之後能分辨是哪一版的定義。';



COMMENT ON COLUMN "public"."tasks"."reward_coin_amount" IS '完成一次可獲得的成長幣。新任務（reward_policy 有值）的 canonical 來源，由 coin-policy.json 在建立時決定並凍結；完成流程直接讀，不現場重算。NULL = 這個任務不發成長幣，或它是本欄位之前建立的舊任務（走 base_time_min 舊公式）。';



COMMENT ON COLUMN "public"."tasks"."reward_coin_suggested_amount" IS '政策當初建議的金額。與 reward_coin_amount 分開存，才看得出家長有沒有調整過。';



COMMENT ON COLUMN "public"."tasks"."reward_coin_min" IS '家長可調整的下限，取自 coin-policy.json 的 range。';



COMMENT ON COLUMN "public"."tasks"."reward_coin_max" IS '家長可調整的上限。mark_task_atomic 用它夾住 override，否則「調整幣值」就是一條繞過政策的加幣後門。';



CREATE TABLE IF NOT EXISTS "public"."time_savings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "completion_id" "uuid" NOT NULL,
    "minutes_saved" integer NOT NULL,
    "pool_type" "text" DEFAULT 'family_time'::"text" NOT NULL,
    "is_redeemed" boolean DEFAULT false NOT NULL,
    "redeemed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "time_savings_pool_type_check" CHECK (("pool_type" = ANY (ARRAY['family_time'::"text", 'game_time'::"text"])))
);


ALTER TABLE "public"."time_savings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "amount" integer NOT NULL,
    "type" "text" NOT NULL,
    "reference_id" "uuid",
    "reference_type" "text",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transactions_type_check" CHECK (("type" = ANY (ARRAY['earn'::"text", 'redeem'::"text", 'deduct'::"text", 'interest'::"text", 'adjust'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallets" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "wallet_type" "text" NOT NULL,
    "balance" integer DEFAULT 0 NOT NULL,
    "interest_rate" numeric(4,3) DEFAULT 0.050 NOT NULL,
    "last_interest_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wallets_wallet_type_check" CHECK (("wallet_type" = ANY (ARRAY['spending'::"text", 'saving'::"text"])))
);


ALTER TABLE "public"."wallets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_reports" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "task_summary" "jsonb",
    "motivation_observation" "text",
    "ai_suggestions" "jsonb",
    "parent_praise_sent" boolean DEFAULT false NOT NULL,
    "praise_content" "text",
    "task_adjustments" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."weekly_reports" OWNER TO "postgres";


ALTER TABLE ONLY "public"."child_profiles"
    ADD CONSTRAINT "child_profiles_child_id_key" UNIQUE ("child_id");



ALTER TABLE ONLY "public"."child_profiles"
    ADD CONSTRAINT "child_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."child_tasks"
    ADD CONSTRAINT "child_tasks_child_id_task_id_key" UNIQUE ("child_id", "task_id");



ALTER TABLE ONLY "public"."child_tasks"
    ADD CONSTRAINT "child_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."children"
    ADD CONSTRAINT "children_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_logs"
    ADD CONSTRAINT "credit_logs_child_id_month_key" UNIQUE ("child_id", "month");



ALTER TABLE ONLY "public"."credit_logs"
    ADD CONSTRAINT "credit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."families"
    ADD CONSTRAINT "families_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."growth_moments"
    ADD CONSTRAINT "growth_moments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intervention_log"
    ADD CONSTRAINT "intervention_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."long_term_goals"
    ADD CONSTRAINT "long_term_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_reports"
    ADD CONSTRAINT "monthly_reports_child_id_month_key" UNIQUE ("child_id", "month");



ALTER TABLE ONLY "public"."monthly_reports"
    ADD CONSTRAINT "monthly_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."overrides"
    ADD CONSTRAINT "overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parent_observations"
    ADD CONSTRAINT "parent_observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parents"
    ADD CONSTRAINT "parents_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."parents"
    ADD CONSTRAINT "parents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."redemption_requests"
    ADD CONSTRAINT "redemption_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reward_items"
    ADD CONSTRAINT "reward_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sibling_relations"
    ADD CONSTRAINT "sibling_relations_mentor_child_id_mentee_child_id_key" UNIQUE ("mentor_child_id", "mentee_child_id");



ALTER TABLE ONLY "public"."sibling_relations"
    ADD CONSTRAINT "sibling_relations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_task_templates"
    ADD CONSTRAINT "system_task_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_change_events"
    ADD CONSTRAINT "task_change_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_completions"
    ADD CONSTRAINT "task_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_plan_milestones"
    ADD CONSTRAINT "task_plan_milestones_order" UNIQUE ("task_id", "sort_order");



ALTER TABLE ONLY "public"."task_plan_milestones"
    ADD CONSTRAINT "task_plan_milestones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_plan_support_steps"
    ADD CONSTRAINT "task_plan_support_steps_order" UNIQUE ("task_id", "sort_order");



ALTER TABLE ONLY "public"."task_plan_support_steps"
    ADD CONSTRAINT "task_plan_support_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_preset_selections"
    ADD CONSTRAINT "task_preset_selections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_preset_selections"
    ADD CONSTRAINT "task_preset_selections_unique" UNIQUE ("task_id", "option_group_id", "option_id");



ALTER TABLE ONLY "public"."task_role_responsibilities"
    ADD CONSTRAINT "task_role_responsibilities_order" UNIQUE ("task_id", "sort_order");



ALTER TABLE ONLY "public"."task_role_responsibilities"
    ADD CONSTRAINT "task_role_responsibilities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."time_savings"
    ADD CONSTRAINT "time_savings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_child_id_wallet_type_key" UNIQUE ("child_id", "wallet_type");



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_reports"
    ADD CONSTRAINT "weekly_reports_child_id_week_start_key" UNIQUE ("child_id", "week_start");



ALTER TABLE ONLY "public"."weekly_reports"
    ADD CONSTRAINT "weekly_reports_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_intervention_log_child_time" ON "public"."intervention_log" USING "btree" ("child_id", "created_at" DESC);



CREATE INDEX "idx_intervention_log_family_time" ON "public"."intervention_log" USING "btree" ("family_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_parents_user_id" ON "public"."parents" USING "btree" ("user_id");



CREATE INDEX "idx_redemption_requests_family_status_time" ON "public"."redemption_requests" USING "btree" ("family_id", "status", "created_at" DESC);



CREATE UNIQUE INDEX "idx_unique_task_per_day" ON "public"."task_completions" USING "btree" ("task_id", "child_id", ((("completed_at" AT TIME ZONE 'Asia/Taipei'::"text"))::"date"));



CREATE INDEX "task_change_events_task_idx" ON "public"."task_change_events" USING "btree" ("task_id", "created_at");



CREATE INDEX "task_plan_milestones_task_idx" ON "public"."task_plan_milestones" USING "btree" ("task_id");



CREATE INDEX "task_plan_support_steps_task_idx" ON "public"."task_plan_support_steps" USING "btree" ("task_id");



CREATE INDEX "task_preset_selections_group_idx" ON "public"."task_preset_selections" USING "btree" ("option_group_id", "option_id");



CREATE INDEX "task_preset_selections_task_idx" ON "public"."task_preset_selections" USING "btree" ("task_id");



CREATE INDEX "task_role_responsibilities_task_idx" ON "public"."task_role_responsibilities" USING "btree" ("task_id");



CREATE INDEX "tasks_preset_family_idx" ON "public"."tasks" USING "btree" ("preset_family_id") WHERE ("preset_family_id" IS NOT NULL);



CREATE UNIQUE INDEX "weekly_reports_family_child_week_key" ON "public"."weekly_reports" USING "btree" ("family_id", "child_id", "week_start");



ALTER TABLE ONLY "public"."child_profiles"
    ADD CONSTRAINT "child_profiles_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."child_tasks"
    ADD CONSTRAINT "child_tasks_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."child_tasks"
    ADD CONSTRAINT "child_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."children"
    ADD CONSTRAINT "children_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_logs"
    ADD CONSTRAINT "credit_logs_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."families"
    ADD CONSTRAINT "families_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."task_completions"
    ADD CONSTRAINT "fk_override" FOREIGN KEY ("override_id") REFERENCES "public"."overrides"("id");



ALTER TABLE ONLY "public"."growth_moments"
    ADD CONSTRAINT "growth_moments_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."intervention_log"
    ADD CONSTRAINT "intervention_log_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."intervention_log"
    ADD CONSTRAINT "intervention_log_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."intervention_log"
    ADD CONSTRAINT "intervention_log_override_id_fkey" FOREIGN KEY ("override_id") REFERENCES "public"."overrides"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."intervention_log"
    ADD CONSTRAINT "intervention_log_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."intervention_log"
    ADD CONSTRAINT "intervention_log_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."long_term_goals"
    ADD CONSTRAINT "long_term_goals_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."long_term_goals"
    ADD CONSTRAINT "long_term_goals_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_reports"
    ADD CONSTRAINT "monthly_reports_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_reports"
    ADD CONSTRAINT "monthly_reports_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."overrides"
    ADD CONSTRAINT "overrides_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "public"."task_completions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."overrides"
    ADD CONSTRAINT "overrides_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_observations"
    ADD CONSTRAINT "parent_observations_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_observations"
    ADD CONSTRAINT "parent_observations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."parent_observations"
    ADD CONSTRAINT "parent_observations_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parents"
    ADD CONSTRAINT "parents_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parents"
    ADD CONSTRAINT "parents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."redemption_requests"
    ADD CONSTRAINT "redemption_requests_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."redemption_requests"
    ADD CONSTRAINT "redemption_requests_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reward_items"
    ADD CONSTRAINT "reward_items_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id");



ALTER TABLE ONLY "public"."reward_items"
    ADD CONSTRAINT "reward_items_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sibling_relations"
    ADD CONSTRAINT "sibling_relations_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sibling_relations"
    ADD CONSTRAINT "sibling_relations_mentee_child_id_fkey" FOREIGN KEY ("mentee_child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sibling_relations"
    ADD CONSTRAINT "sibling_relations_mentor_child_id_fkey" FOREIGN KEY ("mentor_child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_change_events"
    ADD CONSTRAINT "task_change_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_completions"
    ADD CONSTRAINT "task_completions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_completions"
    ADD CONSTRAINT "task_completions_mentor_child_id_fkey" FOREIGN KEY ("mentor_child_id") REFERENCES "public"."children"("id");



ALTER TABLE ONLY "public"."task_completions"
    ADD CONSTRAINT "task_completions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_plan_milestones"
    ADD CONSTRAINT "task_plan_milestones_long_term_goal_id_fkey" FOREIGN KEY ("long_term_goal_id") REFERENCES "public"."long_term_goals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_plan_milestones"
    ADD CONSTRAINT "task_plan_milestones_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_plan_support_steps"
    ADD CONSTRAINT "task_plan_support_steps_long_term_goal_id_fkey" FOREIGN KEY ("long_term_goal_id") REFERENCES "public"."long_term_goals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_plan_support_steps"
    ADD CONSTRAINT "task_plan_support_steps_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_preset_selections"
    ADD CONSTRAINT "task_preset_selections_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_role_responsibilities"
    ADD CONSTRAINT "task_role_responsibilities_long_term_goal_id_fkey" FOREIGN KEY ("long_term_goal_id") REFERENCES "public"."long_term_goals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_role_responsibilities"
    ADD CONSTRAINT "task_role_responsibilities_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_savings"
    ADD CONSTRAINT "time_savings_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_savings"
    ADD CONSTRAINT "time_savings_completion_id_fkey" FOREIGN KEY ("completion_id") REFERENCES "public"."task_completions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_reports"
    ADD CONSTRAINT "weekly_reports_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_reports"
    ADD CONSTRAINT "weekly_reports_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



CREATE POLICY "authenticated can read templates" ON "public"."system_task_templates" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."child_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "child_profiles_all" ON "public"."child_profiles" TO "authenticated" USING (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"())))) WITH CHECK (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"()))));



ALTER TABLE "public"."child_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."children" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "children can insert their own requests" ON "public"."redemption_requests" FOR INSERT WITH CHECK (("family_id" = "public"."my_family_id"()));



CREATE POLICY "children_all" ON "public"."children" TO "authenticated" USING (("family_id" = "public"."my_family_id"())) WITH CHECK (("family_id" = "public"."my_family_id"()));



ALTER TABLE "public"."credit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_logs_all" ON "public"."credit_logs" TO "authenticated" USING (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"())))) WITH CHECK (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"()))));



ALTER TABLE "public"."families" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "families_insert" ON "public"."families" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "families_select" ON "public"."families" FOR SELECT TO "authenticated" USING (("id" = "public"."my_family_id"()));



CREATE POLICY "families_update" ON "public"."families" FOR UPDATE TO "authenticated" USING (("id" = "public"."my_family_id"()));



CREATE POLICY "family members can manage growth moments" ON "public"."growth_moments" USING (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"()))));



CREATE POLICY "family members can manage observations" ON "public"."parent_observations" USING (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"()))));



CREATE POLICY "family members can update child task assignments" ON "public"."child_tasks" FOR UPDATE USING (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"()))));



CREATE POLICY "family members can update long term goals" ON "public"."long_term_goals" FOR UPDATE USING (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"()))));



CREATE POLICY "family members can view child task assignments" ON "public"."child_tasks" FOR SELECT USING (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"()))));



CREATE POLICY "family members can view long term goals" ON "public"."long_term_goals" FOR SELECT USING (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"()))));



CREATE POLICY "family members can view plan milestones" ON "public"."task_plan_milestones" FOR SELECT TO "authenticated" USING (("task_id" IN ( SELECT "t"."id"
   FROM "public"."tasks" "t"
  WHERE ("t"."family_id" IN ( SELECT "p"."family_id"
           FROM "public"."parents" "p"
          WHERE ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "family members can view preset selections" ON "public"."task_preset_selections" FOR SELECT TO "authenticated" USING (("task_id" IN ( SELECT "t"."id"
   FROM "public"."tasks" "t"
  WHERE ("t"."family_id" IN ( SELECT "p"."family_id"
           FROM "public"."parents" "p"
          WHERE ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "family members can view redemption requests" ON "public"."redemption_requests" FOR SELECT USING (("family_id" = "public"."my_family_id"()));



CREATE POLICY "family members can view role responsibilities" ON "public"."task_role_responsibilities" FOR SELECT TO "authenticated" USING (("task_id" IN ( SELECT "t"."id"
   FROM "public"."tasks" "t"
  WHERE ("t"."family_id" IN ( SELECT "p"."family_id"
           FROM "public"."parents" "p"
          WHERE ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "family members can view support steps" ON "public"."task_plan_support_steps" FOR SELECT TO "authenticated" USING (("task_id" IN ( SELECT "t"."id"
   FROM "public"."tasks" "t"
  WHERE ("t"."family_id" IN ( SELECT "p"."family_id"
           FROM "public"."parents" "p"
          WHERE ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "family members can view their family tasks" ON "public"."tasks" FOR SELECT USING ((("family_id" = "public"."my_family_id"()) OR ("is_system_default" = true)));



ALTER TABLE "public"."growth_moments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert own family" ON "public"."families" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."intervention_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "intervention_log_family_select" ON "public"."intervention_log" FOR SELECT TO "authenticated" USING (("family_id" = "public"."my_family_id"()));



CREATE POLICY "intervention_log_no_delete" ON "public"."intervention_log" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "intervention_log_no_update" ON "public"."intervention_log" FOR UPDATE TO "authenticated" USING (false);



ALTER TABLE "public"."long_term_goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "long_term_goals_all" ON "public"."long_term_goals" TO "authenticated" USING (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"())))) WITH CHECK (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"()))));



ALTER TABLE "public"."monthly_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "monthly_reports_all" ON "public"."monthly_reports" TO "authenticated" USING (("family_id" = "public"."my_family_id"())) WITH CHECK (("family_id" = "public"."my_family_id"()));



ALTER TABLE "public"."overrides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "overrides_insert" ON "public"."overrides" FOR INSERT TO "authenticated" WITH CHECK (("parent_id" = "public"."my_parent_id"()));



CREATE POLICY "overrides_select" ON "public"."overrides" FOR SELECT TO "authenticated" USING (("parent_id" IN ( SELECT "parents"."id"
   FROM "public"."parents"
  WHERE ("parents"."family_id" = "public"."my_family_id"()))));



CREATE POLICY "overrides_update" ON "public"."overrides" FOR UPDATE TO "authenticated" USING (("parent_id" = "public"."my_parent_id"()));



ALTER TABLE "public"."parent_observations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parents can insert child task assignments" ON "public"."child_tasks" FOR INSERT WITH CHECK (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"()))));



CREATE POLICY "parents can insert long term goals for family children" ON "public"."long_term_goals" FOR INSERT WITH CHECK (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"()))));



CREATE POLICY "parents can insert tasks for their family" ON "public"."tasks" FOR INSERT WITH CHECK (("family_id" = "public"."my_family_id"()));



CREATE POLICY "parents can update redemption requests" ON "public"."redemption_requests" FOR UPDATE USING (("family_id" = "public"."my_family_id"()));



CREATE POLICY "parents can view task change events" ON "public"."task_change_events" FOR SELECT TO "authenticated" USING (("task_id" IN ( SELECT "t"."id"
   FROM "public"."tasks" "t"
  WHERE ("t"."family_id" IN ( SELECT "p"."family_id"
           FROM "public"."parents" "p"
          WHERE ("p"."user_id" = "auth"."uid"()))))));



CREATE POLICY "parents manage own family child_tasks" ON "public"."child_tasks" TO "authenticated" USING (("child_id" IN ( SELECT "c"."id"
   FROM ("public"."children" "c"
     JOIN "public"."parents" "p" ON (("p"."family_id" = "c"."family_id")))
  WHERE ("p"."user_id" = "auth"."uid"())))) WITH CHECK (("child_id" IN ( SELECT "c"."id"
   FROM ("public"."children" "c"
     JOIN "public"."parents" "p" ON (("p"."family_id" = "c"."family_id")))
  WHERE ("p"."user_id" = "auth"."uid"()))));



CREATE POLICY "parents_insert" ON "public"."parents" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "parents_select" ON "public"."parents" FOR SELECT TO "authenticated" USING (("family_id" = "public"."my_family_id"()));



CREATE POLICY "parents_update" ON "public"."parents" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."redemption_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reward_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reward_items_all" ON "public"."reward_items" TO "authenticated" USING (("family_id" = "public"."my_family_id"())) WITH CHECK (("family_id" = "public"."my_family_id"()));



CREATE POLICY "select own family" ON "public"."families" FOR SELECT TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR ("id" IN ( SELECT "parents"."family_id"
   FROM "public"."parents"
  WHERE ("parents"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."sibling_relations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sibling_relations_all" ON "public"."sibling_relations" TO "authenticated" USING (("family_id" = "public"."my_family_id"())) WITH CHECK (("family_id" = "public"."my_family_id"()));



ALTER TABLE "public"."system_task_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_change_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_completions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_completions_all" ON "public"."task_completions" TO "authenticated" USING (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"())))) WITH CHECK (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"()))));



ALTER TABLE "public"."task_plan_milestones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_plan_support_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_preset_selections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_role_responsibilities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_all" ON "public"."tasks" TO "authenticated" USING (("family_id" = "public"."my_family_id"())) WITH CHECK (("family_id" = "public"."my_family_id"()));



ALTER TABLE "public"."time_savings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "time_savings_all" ON "public"."time_savings" TO "authenticated" USING (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"())))) WITH CHECK (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"()))));



ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transactions_insert" ON "public"."transactions" FOR INSERT TO "authenticated" WITH CHECK (("wallet_id" IN ( SELECT "w"."id"
   FROM ("public"."wallets" "w"
     JOIN "public"."children" "c" ON (("c"."id" = "w"."child_id")))
  WHERE ("c"."family_id" = "public"."my_family_id"()))));



CREATE POLICY "transactions_select" ON "public"."transactions" FOR SELECT TO "authenticated" USING (("wallet_id" IN ( SELECT "w"."id"
   FROM ("public"."wallets" "w"
     JOIN "public"."children" "c" ON (("c"."id" = "w"."child_id")))
  WHERE ("c"."family_id" = "public"."my_family_id"()))));



ALTER TABLE "public"."wallets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallets_all" ON "public"."wallets" TO "authenticated" USING (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"())))) WITH CHECK (("child_id" IN ( SELECT "children"."id"
   FROM "public"."children"
  WHERE ("children"."family_id" = "public"."my_family_id"()))));



ALTER TABLE "public"."weekly_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "weekly_reports_all" ON "public"."weekly_reports" TO "authenticated" USING (("family_id" = "public"."my_family_id"())) WITH CHECK (("family_id" = "public"."my_family_id"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_parent_task_v1"("p_command" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_parent_task_v1"("p_command" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."map_completion_policy"("p_policy" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."map_completion_policy"("p_policy" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."map_completion_policy"("p_policy" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."map_purpose_category"("p_purpose" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."map_purpose_category"("p_purpose" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."map_purpose_category"("p_purpose" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_completion_context"("p_completion_id" "uuid", "p_planned_time_window" "text", "p_start_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_completion_context"("p_completion_id" "uuid", "p_planned_time_window" "text", "p_start_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_completion_context"("p_completion_id" "uuid", "p_planned_time_window" "text", "p_start_mode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."settle_weekly_interest"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."settle_weekly_interest"() TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."child_profiles" TO "anon";
GRANT ALL ON TABLE "public"."child_profiles" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."child_profiles" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."child_tasks" TO "anon";
GRANT ALL ON TABLE "public"."child_tasks" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."child_tasks" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."children" TO "anon";
GRANT ALL ON TABLE "public"."children" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."children" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."credit_logs" TO "anon";
GRANT ALL ON TABLE "public"."credit_logs" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."credit_logs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."families" TO "anon";
GRANT ALL ON TABLE "public"."families" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."families" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."growth_moments" TO "anon";
GRANT ALL ON TABLE "public"."growth_moments" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."growth_moments" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."intervention_log" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."intervention_log" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."intervention_log" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."long_term_goals" TO "anon";
GRANT ALL ON TABLE "public"."long_term_goals" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."long_term_goals" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."monthly_reports" TO "anon";
GRANT ALL ON TABLE "public"."monthly_reports" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."monthly_reports" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."overrides" TO "anon";
GRANT ALL ON TABLE "public"."overrides" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."overrides" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."parent_observations" TO "anon";
GRANT ALL ON TABLE "public"."parent_observations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."parent_observations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."parents" TO "anon";
GRANT ALL ON TABLE "public"."parents" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."parents" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."redemption_requests" TO "anon";
GRANT ALL ON TABLE "public"."redemption_requests" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."redemption_requests" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reward_items" TO "anon";
GRANT ALL ON TABLE "public"."reward_items" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reward_items" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sibling_relations" TO "anon";
GRANT ALL ON TABLE "public"."sibling_relations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sibling_relations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."system_task_templates" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."system_task_templates" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."system_task_templates" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."task_change_events" TO "service_role";
GRANT SELECT ON TABLE "public"."task_change_events" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."task_completions" TO "anon";
GRANT ALL ON TABLE "public"."task_completions" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."task_completions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."task_plan_milestones" TO "service_role";
GRANT SELECT ON TABLE "public"."task_plan_milestones" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."task_plan_support_steps" TO "service_role";
GRANT SELECT ON TABLE "public"."task_plan_support_steps" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."task_preset_selections" TO "service_role";
GRANT SELECT ON TABLE "public"."task_preset_selections" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."task_role_responsibilities" TO "service_role";
GRANT SELECT ON TABLE "public"."task_role_responsibilities" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tasks" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."time_savings" TO "anon";
GRANT ALL ON TABLE "public"."time_savings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."time_savings" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transactions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."wallets" TO "anon";
GRANT ALL ON TABLE "public"."wallets" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."wallets" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."weekly_reports" TO "anon";
GRANT ALL ON TABLE "public"."weekly_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_reports" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";






