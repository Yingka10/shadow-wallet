-- Shadow Wallet — 預設任務抽屜 第七階段 B
-- 成長幣決策落地 ＋ 完成流程的家庭授權修正
--
-- 這支 migration 做三件事：
--
--   1. 給 tasks 一個語意明確的成長幣欄位。
--      第七階段 A 把 base_time_min 寫 0（因為 base_time_min × difficulty 是舊的
--      幣值公式，把估計分鐘寫進去等於偷改幣值），代價是 coin_eligible 的預設任務
--      完成時得到 0 幣。這裡改成由 coin-policy.json 決定金額、存進 reward_coin_amount，
--      完成流程直接讀它 —— 不再現場乘算，也不再有 0 幣的「可獲得成長幣」任務。
--
--   2. 在 create_parent_task_v1 加上 coin guard。
--      reward_policy = coin_eligible 時，命令必須帶一份 eligibility = allowed、
--      金額為正整數且落在政策範圍內的決策，否則 POLICY_REJECTED。
--
--   3. 修掉完成相關 RPC 的 `parents ... LIMIT 1` 授權。
--      舊寫法是「取這個帳號的第一筆 parents，比對它的 family_id」：
--      同一個 auth 帳號在兩個家庭時會挑到錯的那一個，而且它比對的是
--      「某一個 family」而不是「這個孩子的 family」。改成集合比對。
--      同時補上「任務與孩子必須同家庭」——舊版只驗孩子，沒驗任務。
--
-- 刻意不動 20260728000000：那支已經是既成事實，migration 應該是不可變的。
-- 這裡一律用 CREATE OR REPLACE 覆蓋函式、ADD COLUMN IF NOT EXISTS 加欄位，
-- 可重複套用。

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. tasks：成長幣欄位
--
-- 為什麼是新欄位而不是重用既有的：
--   base_time_min  —— 它是舊公式的「分鐘」輸入，會被 × difficulty。語義是時間不是幣。
--   coin_override  —— 語義是「家長手動覆寫掉算出來的值」，而且它會被前置解鎖 ×0.7
--                     打折。政策決定的金額被打折後會掉出政策允許範圍。
--   estimated_minutes —— 那是家長估計的投入時間，本來就不該等於幣值。
-- 三個都不是「這個任務值多少幣」。所以開一個只講這件事的欄位。
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS reward_coin_amount           integer,
  ADD COLUMN IF NOT EXISTS reward_coin_suggested_amount integer,
  ADD COLUMN IF NOT EXISTS reward_coin_min              integer,
  ADD COLUMN IF NOT EXISTS reward_coin_max              integer;

COMMENT ON COLUMN tasks.reward_coin_amount IS
  '完成一次可獲得的成長幣。新任務（reward_policy 有值）的 canonical 來源，'
  '由 coin-policy.json 在建立時決定並凍結；完成流程直接讀，不現場重算。'
  'NULL = 這個任務不發成長幣，或它是本欄位之前建立的舊任務（走 base_time_min 舊公式）。';
COMMENT ON COLUMN tasks.reward_coin_suggested_amount IS
  '政策當初建議的金額。與 reward_coin_amount 分開存，才看得出家長有沒有調整過。';
COMMENT ON COLUMN tasks.reward_coin_min IS
  '家長可調整的下限，取自 coin-policy.json 的 range。';
COMMENT ON COLUMN tasks.reward_coin_max IS
  '家長可調整的上限。mark_task_atomic 用它夾住 override，'
  '否則「調整幣值」就是一條繞過政策的加幣後門。';

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_reward_coin_positive_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_reward_coin_positive_check
  CHECK (
    (reward_coin_amount IS NULL OR reward_coin_amount > 0)
    AND (reward_coin_suggested_amount IS NULL OR reward_coin_suggested_amount > 0)
    AND (reward_coin_min IS NULL OR reward_coin_min > 0)
    AND (reward_coin_max IS NULL OR reward_coin_max > 0)
  );

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_reward_coin_range_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_reward_coin_range_check
  CHECK (
    reward_coin_min IS NULL
    OR reward_coin_max IS NULL
    OR reward_coin_min <= reward_coin_max
  );

-- 可發幣的新任務一定要有完整的定價資料。這條擋掉「0 幣的成長幣任務」——
-- 家長看到「可獲得成長幣」、孩子完成後拿到 0，是最糟的結果。
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_coin_eligible_needs_amount_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_coin_eligible_needs_amount_check
  CHECK (
    reward_policy IS DISTINCT FROM 'coin_eligible'
    OR (
      reward_coin_amount IS NOT NULL
      AND reward_coin_amount > 0
      AND reward_coin_min IS NOT NULL
      AND reward_coin_max IS NOT NULL
      AND reward_coin_amount BETWEEN reward_coin_min AND reward_coin_max
      AND reward_policy_version IS NOT NULL
    )
  );

-- 反過來：不發幣的政策不可以夾帶幣值。
-- 舊任務（reward_policy IS NULL）不受此限，它們走 base_time_min 舊路徑。
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_non_coin_has_no_amount_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_non_coin_has_no_amount_check
  CHECK (
    reward_policy IS NULL
    OR reward_policy = 'coin_eligible'
    OR reward_coin_amount IS NULL
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. create_parent_task_v1
--
-- 與 20260728000000 的版本相同，只多兩件事：
--   * guard H：coin_eligible 必須帶一份合格的 reward decision
--   * 把決策寫進 reward_coin_* 欄位，並存進稽核事件
-- ═══════════════════════════════════════════════════════════════════════════

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

COMMENT ON FUNCTION public.create_parent_task_v1(jsonb) IS
  '從預設任務抽屜的 CreateParentTaskCommand 原子建立任務。'
  '政策 guard（含成長幣決策）全部跑在 insert 之前；任何錯誤都回滾，不留孤兒 task。';

REVOKE ALL ON FUNCTION public.create_parent_task_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_parent_task_v1(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_parent_task_v1(jsonb) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. complete_task
--
-- 兩處改動，其餘與 20260728000000 相同：
--   * 授權改成集合比對，並補驗「任務與孩子同家庭」
--   * 新任務的 coin_eligible 讀 reward_coin_amount，不再用 base_time_min × difficulty
--
-- legacy（reward_policy IS NULL）整條路徑一個字沒改，包含前置解鎖 ×0.7。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION complete_task(
  p_task_id             uuid,
  p_child_id            uuid,
  p_completed_at        timestamptz,
  p_is_prerequisite_met boolean,
  p_goal_id             uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. mark_task_atomic
--
--   * 授權改成集合比對，並補驗「任務與孩子同家庭」
--   * override 的 parent_id 改成「這個家庭的那一筆 parents」，不是任意第一筆
--   * 新任務的調整幅度受政策上限夾制
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION mark_task_atomic(
  p_task_id       uuid,
  p_child_id      uuid,
  p_override_type text,
  p_adjusted_coin int,
  p_note          text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. redeem_wish
--
-- 只改授權，兌換邏輯一個字沒動。它會扣錢包餘額，屬於「會影響幣值的 RPC」。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION redeem_wish(
  p_child_id  uuid,
  p_item_id   uuid,
  p_cost      int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

COMMENT ON FUNCTION complete_task(uuid, uuid, timestamptz, boolean, uuid) IS
  '完成任務。新任務（reward_policy 有值）的成長幣讀 tasks.reward_coin_amount；'
  '舊任務（reward_policy IS NULL）維持 base_time_min × difficulty 與前置解鎖 ×0.7。';
COMMENT ON FUNCTION mark_task_atomic(uuid, uuid, text, int, text) IS
  '家長調整完成紀錄。新任務的調整受 tasks.reward_coin_max 夾制，'
  '非 coin_eligible 一律 0；舊任務行為不變。';
