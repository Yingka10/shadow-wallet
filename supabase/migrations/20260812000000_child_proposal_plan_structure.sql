-- ============================================================================
-- P0-3 Final — 計畫版本的結構化契約補完
-- ============================================================================
--
-- 為什麼要這一支：
--
-- P0-3 第一版把 purpose category / completion description / progress model /
-- next step 全部留在 ai_snapshot 裡。P0-5 Preflight 的結論是那樣不行 ——
--
--   **audit snapshot 不能當成 canonical task 的權威來源。**
--
-- 理由不是潔癖。ai_snapshot 是「當時那一次 AI 回了什麼」的不可變紀錄；
-- 它的形狀會隨著 prompt 改版而變，而且沒有任何 CHECK 擋得住裡面的值。
-- 讓 P0-5 去 `ai_snapshot -> 'understanding' ->> 'category'` 取類別，
-- 等於讓正式任務的分類取決於一段沒有 schema 的 JSON —— 那段 JSON 改一次，
-- 建立任務就會靜靜地拿到 undefined。
--
-- 所以這一支把四個欄位攤成結構化欄位，並補上 P0 這一輪拍板的兩個語意：
--
--   1. weekly_frequency 是「一週幾次，日期彈性」，不是四個固定星期。
--   2. 同一份提案 ＋ 同一把 AI request key，最多只能有一版。
--
-- 向後相容：全部是可為 null 的新欄位，舊資料不需要 backfill。
-- ============================================================================

BEGIN;

-- ── 1. 四個結構化欄位 ────────────────────────────────────────────────────────

ALTER TABLE child_proposal_plan_versions
  ADD COLUMN IF NOT EXISTS purpose_category       text,
  ADD COLUMN IF NOT EXISTS completion_description text,
  ADD COLUMN IF NOT EXISTS progress_model         text,
  ADD COLUMN IF NOT EXISTS next_step              text;

COMMENT ON COLUMN child_proposal_plan_versions.purpose_category IS
  '這件事「為什麼做」：A 生活常規 / B 家庭參與 / C 自主挑戰 / D 學習與技能。'
  'AI 負責語意理解，但寫進來之前要先通過既有的 rewardEligibility 閘門。'
  '長期不是第五類 —— 那是 duration_type。';

COMMENT ON COLUMN child_proposal_plan_versions.completion_description IS
  '一次怎樣才算完成。P0-5 建立正式任務時的完成標準來源。'
  '⚠️ 這一欄是 deterministic transformer 產生的固定句型，**不是 LLM 的自由文字**。'
  'D 類學習任務的回饋依據是可控制的投入與練習，不是最後結果 ——'
  '所以句型永遠是「完成一次…時段」，結構上就寫不出「讀完整本書」。';

COMMENT ON COLUMN child_proposal_plan_versions.progress_model IS
  '進度怎麼看。目前只有 weekly_rhythm：以每週節奏看「本週 X/Y」，'
  '累積真實完成次數，中斷一次不歸零，不以 streak 為主進度，'
  '也不宣稱有不存在的里程碑完成。'
  '由 deterministic adapter 依 purpose_category / duration_type / cadence 推導，'
  '**不是 LLM 輸出的**。證據不足時留 null —— 不猜。';

COMMENT ON COLUMN child_proposal_plan_versions.next_step IS
  '孩子今天／下一次最小可做的步驟。可以來自 AI 建議，但必須通過長度與內容驗證。'
  '沒有可靠的建議時是 null —— 寧可沒有，不要生成假內容。';

-- ── 2. 值域 ──────────────────────────────────────────────────────────────────

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_purpose_category_check;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_purpose_category_check
  CHECK (purpose_category IS NULL OR purpose_category IN ('A', 'B', 'C', 'D'));

-- 只有 weekly_rhythm。這一輪不做 generic progress engine ——
-- 一個空的列舉會讓人以為可以隨手加值，而每一個新值都要有對應的呈現實作。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_progress_model_check;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_progress_model_check
  CHECK (progress_model IS NULL OR progress_model IN ('weekly_rhythm'));

-- weekly_rhythm 必須真的有每週節奏可看。
--
-- 沒有這條的話，一個 one_time 的計畫也可以宣稱自己用每週節奏看進度，
-- 而畫面會去算一個永遠是 0/0 的「本週」。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_progress_model_evidence;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_progress_model_evidence
  CHECK (
    progress_model IS NULL
    OR (
      progress_model = 'weekly_rhythm'
      AND duration_type = 'long_term'
      AND cadence_mode IN ('weekly_frequency', 'fixed_days')
    )
  );

-- 空字串不是「有值」。btrim 之後空的一律當成沒填，避免畫面顯示一片空白。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_completion_not_blank;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_completion_not_blank
  CHECK (
    completion_description IS NULL
    OR (btrim(completion_description) <> '' AND length(completion_description) <= 120)
  );

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_next_step_not_blank;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_next_step_not_blank
  CHECK (
    next_step IS NULL
    OR (btrim(next_step) <> '' AND length(next_step) <= 120)
  );


-- ── 3. weekly_frequency 的正式語意 ───────────────────────────────────────────
--
-- 「一週 4 次」＝ 一週完成 4 次，**日期彈性**。
-- 它**不是**「系統替孩子挑四個固定星期」。
--
-- 這個區別會一路影響到進度呈現：
--   weekly_frequency → 本週 3/4，沒有「星期三沒做到」這件事
--   fixed_days       → 才有 scheduled day / missed day 的語意
--
-- 靠約定俗成守不住 —— 只要有人在轉換時「順便」把 4 次展開成一、三、五、日，
-- 孩子就會開始收到他從來沒有答應過的「今天沒做到」。所以寫成 CHECK。
--
-- 先把既有資料正規化：那些 days 從來就不該存在（P0-2 的寫入路徑不會產生），
-- 清掉的是雜訊，不是任何人的選擇。

UPDATE child_proposals
   SET cadence_days = NULL
 WHERE cadence_mode = 'weekly_frequency'
   AND cadence_days IS NOT NULL;

UPDATE child_proposal_plan_versions
   SET cadence_days = NULL
 WHERE cadence_mode = 'weekly_frequency'
   AND cadence_days IS NOT NULL;

ALTER TABLE child_proposals
  DROP CONSTRAINT IF EXISTS child_proposals_weekly_frequency_no_days;
ALTER TABLE child_proposals
  ADD CONSTRAINT child_proposals_weekly_frequency_no_days
  CHECK (cadence_mode <> 'weekly_frequency' OR cadence_days IS NULL);

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_weekly_frequency_no_days;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_weekly_frequency_no_days
  CHECK (cadence_mode <> 'weekly_frequency' OR cadence_days IS NULL);

COMMENT ON COLUMN child_proposal_plan_versions.cadence_weekly_frequency IS
  '一週要完成幾次，**日期彈性**。不是排定的星期幾 —— 那是 cadence_days（fixed_days）。';


-- ── 4. 同一份提案 ＋ 同一把 AI request key，只能有一版 ───────────────────────
--
-- P0-3 的 idempotency 原本只靠「呼叫模型之前先 select 查一次」。那擋得住
-- 重試與重新進入畫面，但擋不住真正的併發：兩個請求都查不到，於是都寫入。
--
-- 這一輪本來就要開 migration，所以順手把它收成資料庫層的保證。
--
-- partial index（只管 ai_request_id IS NOT NULL）的理由：孩子與家長手寫的
-- 版本沒有 request key，它們本來就可以有很多版。

-- 先處理可能已經存在的重複：保留版號最大的那一筆，把較舊的 key 清成 NULL。
-- **不刪任何一列** —— 那是真的計畫版本，只是它的 idempotency 標記讓位。
UPDATE child_proposal_plan_versions v
   SET ai_request_id = NULL
 WHERE v.ai_request_id IS NOT NULL
   AND EXISTS (
     SELECT 1
       FROM child_proposal_plan_versions o
      WHERE o.proposal_id   = v.proposal_id
        AND o.ai_request_id = v.ai_request_id
        AND o.version_no    > v.version_no
   );

CREATE UNIQUE INDEX IF NOT EXISTS child_proposal_plan_versions_ai_request_unique
  ON child_proposal_plan_versions (proposal_id, ai_request_id)
  WHERE ai_request_id IS NOT NULL;

COMMENT ON INDEX child_proposal_plan_versions_ai_request_unique IS
  '同一份提案 ＋ 同一把 AI request key 只能有一版。'
  'request key 是由提案內容決定性算出來的，所以重試與併發都收斂到同一列。'
  '碰撞時 RPC 回既有那一版並標記 duplicate，不是錯誤。';


-- ============================================================================
-- 5. add_child_proposal_plan_version_v1 —— 收下新欄位，並把碰撞當成成功
-- ============================================================================
--
-- 仍然是 _v1：新增的鍵全部可選，舊呼叫端（P0-1 的測試、之後的家長端）
-- 一個字都不用改。回應多一個 duplicate 布林，舊呼叫端忽略它即可。

CREATE OR REPLACE FUNCTION public.add_child_proposal_plan_version_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal_id uuid;
  v_child_id    uuid;
  v_status      text;
  v_authored_by text;
  v_requires    boolean;
  v_make_current boolean;
  v_policy      text;
  v_eligibility text;
  v_ai_suggested_coin int;
  v_ai_request_id text;
  v_purpose     text;
  v_completion  text;
  v_progress    text;
  v_next_step   text;
  v_version_no  int;
  v_version_id  uuid;
  v_weekly      smallint;
  v_days        integer[];
  v_cadence_mode text;
  v_current_id  uuid;
  v_now         timestamptz := now();
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本'
    );
  END IF;

  v_proposal_id := NULLIF(p_command ->> 'proposalId', '')::uuid;
  IF v_proposal_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少 proposalId');
  END IF;

  SELECT cp.child_id, cp.status INTO v_child_id, v_status
  FROM child_proposals cp WHERE cp.id = v_proposal_id;

  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: proposal % is not visible to the caller', v_proposal_id
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_child_in_caller_family(v_child_id);

  IF v_status = 'closed_unsuitable' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'message', '已回絕的提案不能再新增計畫版本'
    );
  END IF;

  v_authored_by := NULLIF(btrim(COALESCE(p_command ->> 'authoredBy', '')), '');
  IF v_authored_by IS NULL OR v_authored_by NOT IN ('child', 'parent', 'ai') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('未知的版本作者：%s', COALESCE(v_authored_by, 'null'))
    );
  END IF;

  v_policy      := NULLIF(btrim(COALESCE(p_command -> 'reward' ->> 'policy', '')), '');
  v_eligibility := COALESCE(
    NULLIF(btrim(COALESCE(p_command -> 'reward' ->> 'eligibility', '')), ''), 'not_evaluated'
  );

  -- 這裡是「AI 建議 ≠ 最終確認」在 RPC 層的落實。
  --
  -- **最終幣值不接受呼叫端傳值，一個字都不接受。**
  -- confirmed_* 只由 transition_child_proposal_v1 從 tasks 複製。
  IF p_command -> 'reward' ? 'coinAmount'
    OR p_command -> 'reward' ? 'finalAmount'
    OR p_command -> 'reward' ? 'confirmedCoinAmount'
    OR p_command ? 'coinAmount'
    OR p_command ? 'confirmedReward' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'REWARD_NOT_CLIENT_DECIDED',
      'message',
      '計畫版本不接受幣值：AI 建議請用 reward.aiSuggestedCoinAmount，'
      '最終確認的回饋由家長確認時從正式任務複製'
    );
  END IF;

  v_ai_suggested_coin :=
    NULLIF(btrim(COALESCE(p_command -> 'reward' ->> 'aiSuggestedCoinAmount', '')), '')::int;

  IF v_ai_suggested_coin IS NOT NULL AND p_command -> 'aiSnapshot' IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', 'AI 建議幣值必須附上 aiSnapshot —— 沒有出處的建議不予保存'
    );
  END IF;

  -- ── 新增的四個結構化欄位 ─────────────────────────────────────────────────
  v_purpose    := NULLIF(btrim(COALESCE(p_command ->> 'purposeCategory', '')), '');
  v_completion := NULLIF(btrim(COALESCE(p_command ->> 'completionDescription', '')), '');
  v_progress   := NULLIF(btrim(COALESCE(p_command ->> 'progressModel', '')), '');
  v_next_step  := NULLIF(btrim(COALESCE(p_command ->> 'nextStep', '')), '');

  IF v_purpose IS NOT NULL AND v_purpose NOT IN ('A', 'B', 'C', 'D') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('未知的任務目的分類：%s', v_purpose)
    );
  END IF;

  IF v_progress IS NOT NULL AND v_progress NOT IN ('weekly_rhythm') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('未知的進度模型：%s', v_progress)
    );
  END IF;

  v_requires := COALESCE((p_command ->> 'requiresChildReview')::boolean, false);
  v_make_current := COALESCE((p_command ->> 'makeCurrent')::boolean, true);
  v_ai_request_id := NULLIF(btrim(COALESCE(p_command ->> 'aiRequestId', '')), '');

  v_cadence_mode := NULLIF(btrim(COALESCE(p_command -> 'cadence' ->> 'mode', '')), '');
  v_weekly := NULLIF(btrim(COALESCE(p_command -> 'cadence' ->> 'weeklyFrequency', '')), '')::smallint;
  SELECT array_agg(value::int ORDER BY value::int)
  INTO v_days
  FROM jsonb_array_elements_text(COALESCE(p_command -> 'cadence' -> 'days', '[]'::jsonb));

  -- 「一週 N 次」是彈性的週目標，沒有星期幾。命令若同時帶了 days，
  -- 那是呼叫端把兩種語意混在一起 —— 直接拒絕，不要靜靜丟掉其中一個。
  IF v_cadence_mode = 'weekly_frequency' AND v_days IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'reason', 'WEEKLY_FREQUENCY_HAS_NO_DAYS',
      'message',
      '一週幾次是彈性的週目標，不指定星期幾；要指定星期請用 fixed_days'
    );
  END IF;

  SELECT COALESCE(MAX(v.version_no), 0) + 1 INTO v_version_no
  FROM child_proposal_plan_versions v WHERE v.proposal_id = v_proposal_id;

  INSERT INTO child_proposal_plan_versions (
    proposal_id, version_no, authored_by, author_user_id,
    plan_title, plan_summary,
    purpose_category, completion_description, progress_model, next_step,
    cadence_mode, cadence_weekly_frequency, cadence_days,
    preferred_time, preferred_time_custom, estimated_minutes,
    duration_type, duration_days, start_date, end_date,
    reward_policy, reward_eligibility, reward_policy_version, task_policy_version,
    ai_snapshot, ai_model, ai_request_id, ai_suggested_coin_amount,
    requires_child_review,
    effective_at,
    parent_confirmed_at
  ) VALUES (
    v_proposal_id, v_version_no, v_authored_by, auth.uid(),
    NULLIF(btrim(COALESCE(p_command ->> 'planTitle', '')), ''),
    NULLIF(btrim(COALESCE(p_command ->> 'planSummary', '')), ''),
    v_purpose, v_completion, v_progress, v_next_step,
    v_cadence_mode,
    v_weekly, v_days,
    NULLIF(btrim(COALESCE(p_command -> 'cadence' ->> 'preferredTime', '')), ''),
    NULLIF(btrim(COALESCE(p_command -> 'cadence' ->> 'preferredTimeCustom', '')), ''),
    NULLIF(btrim(COALESCE(p_command ->> 'estimatedMinutes', '')), '')::int,
    NULLIF(btrim(COALESCE(p_command ->> 'durationType', '')), ''),
    NULLIF(btrim(COALESCE(p_command ->> 'durationDays', '')), '')::int,
    NULLIF(btrim(COALESCE(p_command ->> 'startDate', '')), '')::date,
    NULLIF(btrim(COALESCE(p_command ->> 'endDate', '')), '')::date,
    v_policy, v_eligibility,
    NULLIF(btrim(COALESCE(p_command -> 'reward' ->> 'policyVersion', '')), ''),
    NULLIF(btrim(COALESCE(p_command ->> 'taskPolicyVersion', '')), ''),
    p_command -> 'aiSnapshot',
    NULLIF(btrim(COALESCE(p_command ->> 'aiModel', '')), ''),
    v_ai_request_id,
    v_ai_suggested_coin,
    v_requires,
    CASE WHEN v_make_current AND NOT v_requires THEN v_now ELSE NULL END,
    CASE WHEN v_authored_by = 'parent' THEN v_now ELSE NULL END
  )
  -- 同一把 request key 已經有一版了 → 不插入，也**不是錯誤**。
  -- 讓它變成 23505 會讓背景重試看起來像「儲存失敗」，
  -- 而實際情況是「早就存好了」。
  ON CONFLICT (proposal_id, ai_request_id) WHERE ai_request_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_version_id;

  IF v_version_id IS NULL THEN
    SELECT v.id, v.version_no INTO v_version_id, v_version_no
      FROM child_proposal_plan_versions v
     WHERE v.proposal_id = v_proposal_id
       AND v.ai_request_id = v_ai_request_id;

    IF v_version_id IS NULL THEN
      -- ON CONFLICT 沒插入、又查不到既有那一列：這不該發生。
      -- 回明確的失敗，不要回一個沒有 id 的成功。
      RETURN jsonb_build_object(
        'ok', false, 'code', 'PERSISTENCE_FAILED',
        'message', '計畫版本未寫入，且找不到既有的同一版'
      );
    END IF;

    SELECT cp.current_plan_version_id INTO v_current_id
      FROM child_proposals cp WHERE cp.id = v_proposal_id;

    RETURN jsonb_build_object(
      'ok', true,
      'planVersionId', v_version_id,
      'versionNo', v_version_no,
      'isCurrent', v_current_id = v_version_id,
      'duplicate', true
    );
  END IF;

  IF v_make_current THEN
    UPDATE child_proposal_plan_versions
       SET superseded_at = v_now
     WHERE proposal_id = v_proposal_id
       AND id <> v_version_id
       AND superseded_at IS NULL;

    UPDATE child_proposals
       SET current_plan_version_id = v_version_id
     WHERE id = v_proposal_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'planVersionId', v_version_id, 'versionNo', v_version_no,
    'isCurrent', v_make_current, 'duplicate', false
  );
END;
$$;

COMMENT ON FUNCTION public.add_child_proposal_plan_version_v1(jsonb) IS
  '新增一個計畫版本（append-only，版號由 DB 決定）。'
  '命令帶任何幣值一律拒絕 —— 成長幣由 coin policy 在建立正式任務時決定。'
  '同一把 aiRequestId 重複呼叫回既有那一版並標記 duplicate，不是錯誤。';

REVOKE ALL ON FUNCTION public.add_child_proposal_plan_version_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_child_proposal_plan_version_v1(jsonb) TO authenticated;


-- ── 6. 不可變性守衛涵蓋新欄位 ────────────────────────────────────────────────
--
-- 計畫版本是 append-only：改計畫是新增一版，不是改舊版。
-- 新的四個欄位沒有理由例外 —— 尤其 completion_description 與 purpose_category
-- 是 P0-5 建立正式任務的依據，事後被改掉的話，「當初依什麼建立的」就沒了。

CREATE OR REPLACE FUNCTION public.child_proposal_plan_version_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
    OR NEW.version_no  IS DISTINCT FROM OLD.version_no
    OR NEW.authored_by IS DISTINCT FROM OLD.authored_by
    OR NEW.plan_title  IS DISTINCT FROM OLD.plan_title
    OR NEW.plan_summary IS DISTINCT FROM OLD.plan_summary
    OR NEW.purpose_category IS DISTINCT FROM OLD.purpose_category
    OR NEW.completion_description IS DISTINCT FROM OLD.completion_description
    OR NEW.progress_model IS DISTINCT FROM OLD.progress_model
    OR NEW.next_step IS DISTINCT FROM OLD.next_step
    OR NEW.cadence_mode IS DISTINCT FROM OLD.cadence_mode
    OR NEW.cadence_weekly_frequency IS DISTINCT FROM OLD.cadence_weekly_frequency
    OR NEW.cadence_days IS DISTINCT FROM OLD.cadence_days
    OR NEW.duration_type IS DISTINCT FROM OLD.duration_type
    OR NEW.duration_days IS DISTINCT FROM OLD.duration_days
    OR NEW.reward_policy IS DISTINCT FROM OLD.reward_policy
    OR NEW.ai_snapshot IS DISTINCT FROM OLD.ai_snapshot
    OR NEW.ai_suggested_coin_amount IS DISTINCT FROM OLD.ai_suggested_coin_amount THEN
    RAISE EXCEPTION
      'plan version 是不可變的（version %）：改計畫請新增一版', OLD.id
      USING ERRCODE = '23514';
  END IF;

  -- 家庭最後共同確認的回饋是 write-once。
  IF OLD.confirmed_at IS NOT NULL AND (
       NEW.confirmed_at                    IS DISTINCT FROM OLD.confirmed_at
    OR NEW.confirmed_reward_policy         IS DISTINCT FROM OLD.confirmed_reward_policy
    OR NEW.confirmed_coin_amount           IS DISTINCT FROM OLD.confirmed_coin_amount
    OR NEW.confirmed_payout_basis          IS DISTINCT FROM OLD.confirmed_payout_basis
    OR NEW.confirmed_claim_period          IS DISTINCT FROM OLD.confirmed_claim_period
    OR NEW.confirmed_max_claims_per_period IS DISTINCT FROM OLD.confirmed_max_claims_per_period
    OR NEW.confirmed_reward_policy_version IS DISTINCT FROM OLD.confirmed_reward_policy_version
    OR NEW.confirmed_task_policy_version   IS DISTINCT FROM OLD.confirmed_task_policy_version
    OR NEW.confirmed_source_task_id        IS DISTINCT FROM OLD.confirmed_source_task_id
  ) THEN
    RAISE EXCEPTION
      '已確認的回饋快照不可修改（version %）：要改回饋請走調整流程並產生新版本', OLD.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
