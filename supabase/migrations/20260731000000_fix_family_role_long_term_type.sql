-- Shadow Wallet — 修正家庭角色的 long_term_type
--
-- 症狀：家庭角色任務在**真實資料庫上完全建不出來**。
--
--   ERROR: new row for relation "tasks" violates check constraint
--          "tasks_long_term_type_check"
--
-- 原因：
--
--   tasks.long_term_type 與 long_term_goals.goal_type 的 CHECK 都是
--     habit / skill / responsibility / challenge
--   但 create_parent_task_v1 為 plan_mode = 'family_role' 寫的是 'family'。
--
-- 為什麼一路沒被發現：
--
--   1. 這兩個 CHECK 從來不在 repo 的 migration 裡，只存在 live DB
--      （與 AUDIT P1-7 記的是同一類問題：核心 schema 沒有回填）。
--   2. supabase/verify 的 harness 自己建簡化的 tasks 表，沒有這條 CHECK，
--      所以 93 條 assertion 全過，這個 bug 卻還在。
--   3. App 端也一路用 'family'：LongTermType、useParentLongTermGoals、
--      useLongTermTasks、taskActions.createFamilyGoal 全都是。
--      也就是說**既有的家庭長期任務建立路徑同樣是壞的**，
--      只是沒有測試覆蓋，沒人發現。
--
-- 這支只改 create_parent_task_v1 的那一個 CASE 分支，其餘與 20260730000000
-- 完全相同。App 端的對應修正在同一個 commit 裡。
--
-- 不需要資料修補：CHECK 擋著，所以資料庫裡不可能有 long_term_type = 'family'
-- 的資料列（加 CHECK 時若有違反的列，ALTER TABLE 本身就會失敗）。

CREATE OR REPLACE FUNCTION public.create_parent_task_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child_id        uuid;
  v_family_id       uuid;
  v_child_family    uuid;
  v_schema_version  int;

  v_meta_early      jsonb;
  v_request_raw     text;
  v_request_id      uuid;
  v_replay          jsonb;

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

  v_meta_early := COALESCE(p_command -> 'metadata', '{}'::jsonb);

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

  -- ── 6b. 建立請求識別碼（idempotency）─────────────────────────────────────
  -- 放在授權之後、任何寫入之前。
  --
  -- 順序是刻意的：先確定呼叫者屬於這個家庭，再拿 requestId 去查既有任務。
  -- 反過來的話，一個沒有權限的呼叫者可以用「有沒有查到」當作探測手段。
  v_request_raw := NULLIF(btrim(COALESCE(v_meta_early ->> 'clientRequestId', '')), '');

  IF v_request_raw IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少建立請求識別碼'
    );
  END IF;

  -- 先用正規表達式擋，不要直接 ::uuid ——
  -- 格式錯誤的字串會拋 22P02，那對呼叫端來說是一個看不懂的資料庫錯誤，
  -- 而這其實是「命令有問題」，該回 VALIDATION_FAILED。
  IF v_request_raw !~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('建立請求識別碼格式不正確：%s', v_request_raw)
    );
  END IF;

  v_request_id := v_request_raw::uuid;

  -- 同一個識別碼已經建立過 → 回傳原本那一筆，不再新增。
  -- 這是「RPC 成功但 response 沒回到 client」之後家長再按一次的情況。
  v_replay := public.preset_task_replay_payload(v_request_id, v_child_id, v_family_id);
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
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

  -- 'responsibility' 不是 'family'：tasks.long_term_type 與 long_term_goals.goal_type
  -- 的 CHECK 只允許 habit / skill / responsibility / challenge。
  -- 寫 'family' 會在 INSERT 當下被 check constraint 擋下 —— 見檔頭說明。
  v_long_term_type := CASE v_plan_mode
    WHEN 'growth_plan'   THEN 'skill'
    WHEN 'short_support' THEN 'habit'
    WHEN 'family_role'   THEN 'responsibility'
    ELSE NULL
  END;

  -- ══ 10. tasks ═══════════════════════════════════════════════════════════
  -- base_time_min 仍然寫 0：它是舊公式的輸入，新任務的幣值一律走 reward_coin_amount。
  -- 兩條路徑不共用欄位，才不會有人改了其中一邊而另一邊悄悄跟著變。
  -- 競態：兩個 request 幾乎同時進來時，前面那段查詢兩邊都查不到，
  -- 於是兩邊都會走到這裡。unique index 讓其中一個拿到 23505，
  -- 那一個要回傳對方建立的結果，而不是 PERSISTENCE_FAILED。
  --
  -- 例外處理**只包住 tasks 這一個 INSERT**。子表（task_preset_selections 等）
  -- 的 unique 違反是真的資料問題，必須照樣往外拋、讓整筆回滾。
  BEGIN
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
      command_schema_version, created_from_preset, creation_request_id,
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
      v_schema_version, true, v_request_id,
      v_coin_final, v_coin_suggested, v_coin_min, v_coin_max
    )
    RETURNING id INTO v_task_id;
  EXCEPTION WHEN unique_violation THEN
    v_replay := public.preset_task_replay_payload(v_request_id, v_child_id, v_family_id);
    -- 撞的不是 creation_request_id（查不到對應任務）→ 不是 replay，照原樣拋出。
    IF v_replay IS NULL THEN
      RAISE;
    END IF;
    RETURN v_replay;
  END;

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
    'relatedIds', to_jsonb(v_related),
    -- false = 這一次真的建立了。true 只會從 preset_task_replay_payload 出來。
    'idempotentReplay', false
  );
END;
$$;

COMMENT ON FUNCTION public.create_parent_task_v1(jsonb) IS
  '從預設任務抽屜的 CreateParentTaskCommand 原子建立任務。'
  '政策 guard（含成長幣決策）全部跑在 insert 之前；任何錯誤都回滾，不留孤兒 task。'
  '以 metadata.clientRequestId 做 idempotency：同一個識別碼只會建立一次。'
  '家庭角色的 long_term_type 是 responsibility（不是 family）。';

REVOKE ALL ON FUNCTION public.create_parent_task_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_parent_task_v1(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_parent_task_v1(jsonb) TO authenticated;
