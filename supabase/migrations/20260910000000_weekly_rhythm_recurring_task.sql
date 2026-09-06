-- GrowBook — 沒有終點的每週節奏也能建成任務（Plan 1 補漏）
--
-- 2026-09-07。B 案例（「每週練琴三次」→ 這件事沒有終點）在家長按下
-- 「確認這份約定」時被擋：`weekly_rhythm 必須是 long_term + weekly_frequency`。
--
-- 20260906 把 weekly_rhythm ⇒ long_term 的判準放寬成「排除 one_time」，
-- 但只掃到三處：child_proposal_plan_versions 的 CHECK、
-- publish_child_confirmed_plan_v1、propose_child_planning_terms_v1。
-- **create_parent_task_v1 裡還有第四份**，而它是建立任務的最後一關 ——
-- 於是計畫存得進去、家長按得下去，任務建不起來。
--
-- ⚠️ 本檔以 **20260831000000_weekly_rhythm_per_completion.sql** 的定義為
--    基準整支置換（那是 create_parent_task_v1 目前生效的版本，20260909
--    只呼叫它、沒有重新定義）。CREATE OR REPLACE 是整支置換，抄錯基準會
--    靜默還原 per_completion 那一輪的修正。
--
-- 套用方式：`supabase db push`（交易式，語法錯整包回滾）。不要分段貼。
--
-- 冪等：整支置換，重跑安全。

BEGIN;


CREATE OR REPLACE FUNCTION public.create_parent_task_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text := NULLIF(btrim(COALESCE(p_command ->> 'creationSource', '')), '');
  v_core_command jsonb;
  v_result jsonb;
  v_task_id uuid;
  v_event_id uuid;
  v_related jsonb;
  v_progress text := NULLIF(btrim(COALESCE(p_command ->> 'progressModel', '')), '');
  v_next_step text := NULLIF(btrim(COALESCE(p_command ->> 'nextStep', '')), '');
  -- 呼叫端**明講**的結算語意。P1 一律帶（值來自共同版本的 policy evidence）；
  -- 沒帶就是 legacy 呼叫端，維持既有行為（trigger 由 cadence 推導）。
  v_payout_basis text := NULLIF(btrim(COALESCE(p_command ->> 'payoutBasis', '')), '');
  v_written_basis  text;
  v_written_target smallint;
BEGIN
  IF v_source IS DISTINCT FROM 'child_proposal' THEN
    RETURN public.create_parent_task_core_v1(p_command);
  END IF;

  IF p_command -> 'preset' IS NOT NULL
    OR COALESCE(btrim(COALESCE(p_command -> 'metadata' ->> 'presetCatalogVersion', '')), '') <> '' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '孩子提案是 non-preset source，不可帶 preset identity'
    );
  END IF;

  IF v_progress IS NOT NULL AND v_progress <> 'weekly_rhythm' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '未知的進度模型'
    );
  END IF;

  -- weekly_rhythm 要的是「有每週節奏」，不是「有終點」。
  --
  -- 原本這裡要求 durationType = 'long_term'，與 20260906 放寬過的
  -- child_proposal_plan_versions CHECK 不一致：一份
  -- recurring + weekly_frequency + weekly_rhythm 的計畫寫得進版本表、
  -- 家長端也能按確認，卻在建立任務這一步被擋下來 ——
  -- 「每週練琴三次、沒有終點」正是這個形狀。
  --
  -- 判準與那條 CHECK 逐條對齊：期間要有、且不是 one_time（one_time 沒有
  -- 每週節奏可看，畫面會算出永遠 0/0 的「本週」），節奏要是
  -- weekly_frequency 或 fixed_days。
  IF v_progress = 'weekly_rhythm' AND (
    p_command -> 'task' ->> 'durationType' IS NULL
    OR p_command -> 'task' ->> 'durationType' = 'one_time'
    OR (p_command -> 'schedule' ->> 'mode') IS NULL
    OR (p_command -> 'schedule' ->> 'mode') NOT IN ('weekly_frequency', 'fixed_days')
  ) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', 'weekly_rhythm 需要每週節奏：期間不可以是 one_time，'
                 || '節奏要是 weekly_frequency 或 fixed_days'
    );
  END IF;

  -- per_completion 是目前唯一有執行路徑的明講值。收到別的就擋下建立，
  -- **不要**默默退回 cadence 推導 —— 那正是這一輪要消滅的行為。
  IF v_payout_basis IS NOT NULL AND v_payout_basis <> 'per_completion' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'PAYOUT_BASIS_NOT_IMPLEMENTED',
      'message', '這種結算方式還沒有實作：階段完成與整段計畫完成的結算屬於下一輪'
    );
  END IF;

  v_core_command := jsonb_set(p_command, '{creationSource}', '"parent_custom"'::jsonb, true);
  v_result := public.create_parent_task_core_v1(v_core_command);
  IF COALESCE((v_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  v_task_id := NULLIF(v_result ->> 'taskId', '')::uuid;

  -- ⚠️ 四個維度分開，不互推（P1-REWARD-FIX）：
  --
  --      progression target   一週想做幾次      weekly_frequency
  --      completion cap       同一天能記幾次    claim_period / max_claims
  --      payout basis         什麼事件結算      payout_basis
  --      payout amount        一次多少          reward_coin_amount
  --
  --    在此之前 weekly_frequency 同時推導了後面三個：它變成 per_period 的
  --    週目標，也變成 max_claims_per_period。結果是「每週 3 次、每次 8 幣」
  --    的計畫實際上做滿 3 次才給 8 幣 —— 而家庭同意的那句話是「完成一次
  --    給成長幣」。差三倍，而且沒有任何一個畫面講過「每週達標」。
  --
  --    明講的 basis 一律連 claim 規則一起寫定：per_completion 的完成上限是
  --    「同一天一次」，不是「一週 N 次」。一週做第 4 次仍然是合法完成，
  --    仍然照正式金額結算 —— 不存在沒有被家庭確認過的隱形週上限。
  UPDATE tasks
     SET creation_source = 'child_proposal',
         progress_model = v_progress,
         next_step = v_next_step,
         long_term_type = CASE WHEN v_progress = 'weekly_rhythm' THEN 'habit'
                               ELSE long_term_type END,
         payout_basis = COALESCE(v_payout_basis, payout_basis),
         period_target_count = CASE WHEN v_payout_basis = 'per_completion'
                                    THEN NULL ELSE period_target_count END,
         claim_period = CASE WHEN v_payout_basis = 'per_completion'
                             THEN 'day' ELSE claim_period END,
         max_claims_per_period = CASE WHEN v_payout_basis = 'per_completion'
                                      THEN 1 ELSE max_claims_per_period END
   WHERE id = v_task_id;

  -- 從寫下去的那一列讀回來確認。少了這一段，哪天 UPDATE 被改壞或被 trigger
  -- 覆寫，任務會安靜地回到 per_period，而唯一看得出來的地方是幾週後的錢包。
  IF v_payout_basis IS NOT NULL THEN
    SELECT t.payout_basis, t.period_target_count
      INTO v_written_basis, v_written_target
      FROM tasks t WHERE t.id = v_task_id;
    IF v_written_basis IS DISTINCT FROM v_payout_basis
      OR v_written_target IS NOT NULL THEN
      RAISE EXCEPTION 'PAYOUT_BASIS_NOT_PERSISTED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_progress = 'weekly_rhythm' THEN
    UPDATE long_term_goals
       SET goal_type = 'habit'
     WHERE task_id = v_task_id;
  END IF;

  UPDATE task_change_events
     SET event_type = 'created_from_child_proposal',
         snapshot = jsonb_set(
           jsonb_set(COALESCE(snapshot, '{}'::jsonb),
                     '{creationSource}', to_jsonb('child_proposal'::text), true),
           '{command}', p_command, true
         )
   WHERE task_id = v_task_id
     AND event_type = 'created_parent_custom'
  RETURNING id INTO v_event_id;

  SELECT COALESCE(jsonb_agg(rows.id ORDER BY rows.kind, rows.id), '[]'::jsonb)
    INTO v_related
    FROM (
      SELECT ct.id, 1 AS kind FROM child_tasks ct WHERE ct.task_id = v_task_id
      UNION ALL
      SELECT g.id, 2 AS kind FROM long_term_goals g WHERE g.task_id = v_task_id
      UNION ALL
      SELECT e.id, 3 AS kind FROM task_change_events e
       WHERE e.task_id = v_task_id AND e.event_type = 'created_from_child_proposal'
    ) AS rows;

  RETURN jsonb_set(v_result, '{relatedIds}', v_related, true);
EXCEPTION
  -- 只轉譯這一種，其餘原樣拋出 —— 把所有例外都吃掉會讓
  -- SHARED_PLAN_REQUIRES_RENEGOTIATION 之類的守門訊息消失。
  WHEN OTHERS THEN
    IF SQLERRM = 'PAYOUT_BASIS_NOT_PERSISTED' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'PERSISTENCE_FAILED',
        'message', '結算語意沒有正確寫入，這筆任務不建立'
      );
    END IF;
    IF SQLERRM = 'PAYOUT_BASIS_NOT_IMPLEMENTED' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'PAYOUT_BASIS_NOT_IMPLEMENTED',
        'message', '這種長期任務的結算方式還沒有實作：階段完成與整段計畫完成的結算屬於下一輪'
      );
    END IF;
    RAISE;
END;
$$;


COMMIT;
