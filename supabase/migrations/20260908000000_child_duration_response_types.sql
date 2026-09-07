-- GrowBook — record RPC 收得下期限那一輪的回答（P1-A1 補漏）
--
-- 2026-09-07。孩子選完期限之後，record_child_goal_planning_round_v1 回
-- 「未知的孩子回應類型」，App 端靜默停住（那條路徑不顯示任何錯誤）。
--
-- 20260907 新增 needs_duration 那一輪時，補了 latest_result 的 status
-- 白名單，卻漏了**孩子回應**的白名單 —— 兩份清單在同一支函式裡相隔
-- 三十行。這是同一天第三次同型失敗：新增一個必經 round，而某一層的
-- 舊白名單沒有跟著更新，且沒有任何測試或型別會因此變紅。
--
-- ⚠️ 本檔以 **20260907000000** 的函式定義為基準抄寫，只改白名單那一處。
--    CREATE OR REPLACE 是整支置換：以 master 為基準會靜默還原
--    20260907 的期限邏輯，而且不會有任何測試變紅。
--
-- 冪等：整支置換，重跑安全。

BEGIN;


CREATE OR REPLACE FUNCTION public.record_child_goal_planning_round_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session    child_goal_planning_sessions%ROWTYPE;
  v_proposal   child_proposals%ROWTYPE;
  v_expected   integer;
  v_response   jsonb;
  v_result     jsonb;
  v_status     text;
  v_failed     boolean;
  v_context    jsonb;
  v_rounds     smallint;
  v_attempts   smallint;
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本');
  END IF;

  SELECT * INTO v_session FROM child_goal_planning_sessions
   WHERE id = NULLIF(p_command ->> 'sessionId', '')::uuid
   FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: planning session is not visible to the caller'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_child_in_caller_family(v_session.child_id);

  IF NOT (p_command ? 'expectedRevision') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少 expectedRevision');
  END IF;
  v_expected := (p_command ->> 'expectedRevision')::integer;

  IF v_expected IS DISTINCT FROM v_session.revision THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'STALE_SESSION', 'reason', 'REVISION_MISMATCH',
      'revision', v_session.revision,
      'message', '這場對話已經往前走了，這一次的結果不採用');
  END IF;

  IF v_session.status = 'child_confirmed' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'SESSION_CONFIRMED',
      'message', '孩子已經確認過了，這場對話結束了');
  END IF;

  IF v_session.status = 'abandoned' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'SESSION_ABANDONED',
      'message', '這場對話已經結束了，想法已經送給爸媽');
  END IF;

  SELECT * INTO v_proposal FROM child_proposals WHERE id = v_session.proposal_id;
  IF v_proposal.status <> 'draft' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'PROPOSAL_NOT_DRAFT',
      'message', format('提案已經是 %s，不能再改規劃', v_proposal.status));
  END IF;

  v_result := p_command -> 'result';
  IF v_result IS NULL OR jsonb_typeof(v_result) <> 'object' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少 result');
  END IF;

  v_status := v_result ->> 'status';
  IF v_status IS NULL
    OR v_status NOT IN (
      'needs_clarification', 'needs_choice', 'needs_duration', 'ready', 'unavailable'
    ) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('未知的規劃結果狀態：%s', COALESCE(v_status, 'null')));
  END IF;

  v_failed := v_status = 'unavailable';

  IF NOT v_failed AND v_session.rounds_used >= public.child_goal_planning_max_rounds() THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'ROUND_LIMIT_REACHED',
      'message', '這場對話已經問夠多了');
  END IF;
  IF v_session.attempts_used >= public.child_goal_planning_max_attempts() THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'ATTEMPT_LIMIT_REACHED',
      'message', '這場對話已經試夠多次了');
  END IF;

  v_context := v_session.conversation_context;
  v_response := p_command -> 'childResponse';
  IF v_response IS NOT NULL AND jsonb_typeof(v_response) = 'object' THEN
    -- ⚠️ 這份白名單與 App 端 ChildPlanningResponse / Function 端
    -- childGoalPlanningInputIsUsable 是**第三份**同一件事的宣告，
    -- 而且是唯一沒有型別或測試釘住的一份。20260907 加了 needs_duration
    -- 那一輪，補了 status 白名單卻漏了這一份 —— 孩子一選完期限，
    -- 這裡就回「未知的孩子回應類型」，畫面靜默停住。
    IF (v_response ->> 'type') NOT IN
       ('clarification_answer', 'choice_selection', 'custom_choice',
        'duration_selection', 'duration_open_ended') THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED', 'message', '未知的孩子回應類型');
    END IF;
    v_context := v_context || jsonb_build_array(v_response);
  END IF;

  v_rounds   := v_session.rounds_used + (CASE WHEN v_failed THEN 0 ELSE 1 END);
  v_attempts := v_session.attempts_used + 1;

  UPDATE child_goal_planning_sessions
     SET conversation_context = v_context,
         latest_result        = v_result,
         rounds_used          = v_rounds,
         attempts_used        = v_attempts,
         status               = CASE WHEN v_status = 'ready' THEN 'ready' ELSE 'in_progress' END,
         revision             = v_session.revision + 1
   WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'ok', true, 'sessionId', v_session.id,
    'status', CASE WHEN v_status = 'ready' THEN 'ready' ELSE 'in_progress' END,
    'revision', v_session.revision + 1,
    'roundsUsed', v_rounds, 'attemptsUsed', v_attempts);
END;
$$;


COMMENT ON FUNCTION public.record_child_goal_planning_round_v1(jsonb) IS
  'P1-A2：記一輪規劃對話。P1-A1：status 白名單收 needs_duration，'
  '孩子回應白名單收 duration_selection / duration_open_ended —— '
  '期限那一輪與其他對話輪一樣消耗一輪，session 留在 in_progress。';


COMMIT;
