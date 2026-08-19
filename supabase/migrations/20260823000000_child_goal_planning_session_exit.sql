-- ═══════════════════════════════════════════════════════════════════════════
-- P1-A2 Correction — Planning Session 的終點：abandoned ＋ atomic exit
--
-- 補的是一個真實的漏洞：
--
--   孩子在規劃到一半時按「先把想法送給爸媽」，提案會變成 proposed，
--   但那場 planning session 仍然停在 in_progress / ready。
--
-- 於是資料庫裡會有一份「進行中的規劃」掛在一個已經送出去的提案上。
-- 後果不是好看不好看的問題：
--
--   · 那場 session 仍然佔著「一個提案只有一場進行中對話」的位子
--   · 它仍然接受新的 planning round，而提案已經在家長手上了
--   · 之後 P1-A3 要問「這個提案的規劃結果是什麼」時，會讀到一份
--     孩子其實沒有確認、而且已經放棄的東西
--
-- 所以：新增終點狀態 abandoned，並且**讓離開這件事變成一次原子操作**。
--
-- 為什麼不能由 App 分兩步做（先 abandon 再 transition）：
-- 中間斷掉的話會留下兩種爛狀態 —— 「已放棄但沒送出」或
-- 「已送出但規劃還開著」。而這兩步之間正好是網路最容易斷的地方
-- （孩子按下按鈕、畫面在轉圈）。
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. abandoned ──────────────────────────────────────────────────────────
--
-- 語意：**孩子沒有確認這份 P1 計畫，而是選擇停止規劃、直接送出原始提案。**
--
-- 它不是失敗，也不是「規劃壞掉了」。它是一個孩子做的決定，所以要留下來。

ALTER TABLE child_goal_planning_sessions
  DROP CONSTRAINT IF EXISTS child_goal_planning_sessions_status_check;

ALTER TABLE child_goal_planning_sessions
  ADD CONSTRAINT child_goal_planning_sessions_status_check
  CHECK (status IN ('in_progress', 'ready', 'child_confirmed', 'abandoned'));

-- abandoned 不得有計畫，也不得有確認時間。
--
-- 既有的 confirmed_shape CHECK 其實已經涵蓋（status <> 'child_confirmed' ⇒
-- 兩者都必須是 NULL），但那是**推論出來的**保證。這一條把它寫成一個
-- 讀得懂的名字 —— 之後有人放寬 confirmed_shape 時，這一條會擋住他。
ALTER TABLE child_goal_planning_sessions
  DROP CONSTRAINT IF EXISTS child_goal_planning_sessions_abandoned_shape;

ALTER TABLE child_goal_planning_sessions
  ADD CONSTRAINT child_goal_planning_sessions_abandoned_shape
  CHECK (
    status <> 'abandoned'
    OR (confirmed_plan IS NULL AND child_confirmed_at IS NULL)
  );

COMMENT ON COLUMN child_goal_planning_sessions.status IS
  'in_progress / ready 是進行中；child_confirmed 與 abandoned 都是終點。'
  'abandoned = 孩子沒有確認這份計畫，選擇直接送出原始提案。';


-- ── 2. 兩個終點都是單向的 ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.child_goal_planning_session_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
    OR NEW.child_id  IS DISTINCT FROM OLD.child_id
    OR NEW.family_id IS DISTINCT FROM OLD.family_id THEN
    RAISE EXCEPTION '規劃對話不可改變所屬提案或孩子（session %）', OLD.id
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'child_confirmed' THEN
    IF NEW.confirmed_plan IS DISTINCT FROM OLD.confirmed_plan
      OR NEW.child_confirmed_at IS DISTINCT FROM OLD.child_confirmed_at
      OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION
        '孩子已經確認過的計畫不可修改（session %）：要重新規劃請開新的對話', OLD.id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- 放棄過的對話不會復活。轉回 in_progress 的話，一個已經送到家長手上的
  -- 提案會突然又有一場「進行中的規劃」—— 那正是這支 migration 要修的東西。
  IF OLD.status = 'abandoned' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION
      '已經放棄的規劃對話不可復原（session %）：要重新規劃請開新的對話', OLD.id
      USING ERRCODE = '23514';
  END IF;

  IF jsonb_array_length(NEW.conversation_context)
     < jsonb_array_length(OLD.conversation_context) THEN
    RAISE EXCEPTION '規劃對話只能新增，不能刪除（session %）', OLD.id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.revision < OLD.revision THEN
    RAISE EXCEPTION '規劃對話的版本不可倒退（session %）', OLD.id
      USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


-- ── 3. 放棄之後不再接受任何一輪 ───────────────────────────────────────────
--
-- record RPC 原本只擋 child_confirmed。abandoned 一樣要擋，理由更直接：
-- 提案這時已經是 proposed，而那一支本來就會擋 non-draft —— 但依賴那個
-- 間接的保證等於把兩件事綁在一起。這裡明確擋一次。

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
    OR v_status NOT IN ('needs_clarification', 'needs_choice', 'ready', 'unavailable') THEN
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
    IF (v_response ->> 'type') NOT IN
       ('clarification_answer', 'choice_selection', 'custom_choice') THEN
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


-- ── 4. 確認那一支也要擋 abandoned ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_child_goal_planning_session_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session  child_goal_planning_sessions%ROWTYPE;
  v_proposal child_proposals%ROWTYPE;
  v_expected integer;
  v_plan     jsonb;
  v_now      timestamptz := now();
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

  IF v_session.status = 'child_confirmed' THEN
    RETURN jsonb_build_object(
      'ok', true, 'sessionId', v_session.id, 'status', 'child_confirmed',
      'revision', v_session.revision, 'idempotentReplay', true);
  END IF;

  -- 已經放棄的不能反悔確認：那份想法已經送到家長手上了。
  IF v_session.status = 'abandoned' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'SESSION_ABANDONED',
      'message', '這場對話已經結束了，想法已經送給爸媽');
  END IF;

  IF NOT (p_command ? 'expectedRevision') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少 expectedRevision');
  END IF;
  v_expected := (p_command ->> 'expectedRevision')::integer;

  IF v_expected IS DISTINCT FROM v_session.revision THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'STALE_SESSION', 'reason', 'REVISION_MISMATCH',
      'revision', v_session.revision,
      'message', '這場對話已經往前走了，請看最新的那一份再確認');
  END IF;

  SELECT * INTO v_proposal FROM child_proposals WHERE id = v_session.proposal_id;
  IF v_proposal.status <> 'draft' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'PROPOSAL_NOT_DRAFT',
      'message', format('提案已經是 %s，不能再確認規劃', v_proposal.status));
  END IF;

  IF v_session.status <> 'ready' OR (v_session.latest_result ->> 'status') <> 'ready' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'NO_READY_PLAN',
      'message', '現在沒有一份可以確認的計畫');
  END IF;

  v_plan := v_session.latest_result -> 'plan';
  IF v_plan IS NULL OR jsonb_typeof(v_plan) <> 'object' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'NO_READY_PLAN',
      'message', '這一輪的結果裡沒有計畫');
  END IF;

  UPDATE child_goal_planning_sessions
     SET status             = 'child_confirmed',
         confirmed_plan     = v_plan,
         child_confirmed_at = v_now,
         revision           = v_session.revision + 1
   WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'ok', true, 'sessionId', v_session.id, 'status', 'child_confirmed',
    'revision', v_session.revision + 1, 'idempotentReplay', false);
END;
$$;


-- ── 5. 不規劃、直接送出（atomic）──────────────────────────────────────────
--
-- 一次交易做完三件事：放棄規劃、把提案送出、留下狀態事件。
--
-- ⚠️ 這一支**不能**被拆成 App 端的兩次呼叫。中間斷掉會留下
--    「已放棄但沒送出」或「已送出但規劃還開著」，而那兩步之間正好是
--    孩子按下按鈕、畫面在轉圈的那一刻 —— 網路最容易斷的地方。
--
-- ⚠️ 已經 child_confirmed 的 session 一律拒絕。孩子確認過的那份計畫
--    不可以被一個「不規劃直接送出」的動作偷走 —— 那會讓一份他同意過的
--    計畫變成從來沒發生過。要送出已確認的計畫是 P1-A3 的橋。

CREATE OR REPLACE FUNCTION public.submit_child_proposal_without_planning_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal_id uuid;
  v_proposal    child_proposals%ROWTYPE;
  v_session     child_goal_planning_sessions%ROWTYPE;
  v_abandoned   uuid;
  v_now         timestamptz := now();
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本');
  END IF;

  v_proposal_id := NULLIF(p_command ->> 'proposalId', '')::uuid;
  IF v_proposal_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少 proposalId');
  END IF;

  -- 先鎖提案，再鎖 session。順序固定，避免與其他路徑互鎖。
  SELECT * INTO v_proposal FROM child_proposals WHERE id = v_proposal_id FOR UPDATE;

  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: proposal % is not visible to the caller', v_proposal_id
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

  SELECT * INTO v_session FROM child_goal_planning_sessions
   WHERE proposal_id = v_proposal_id
     AND status IN ('in_progress', 'ready', 'child_confirmed')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  -- 確認過的計畫不可以被偷走。這一條在狀態檢查**之前**，因為它比
  -- 「提案已經送出了」更重要：後者是可以冪等回覆的，前者是真的錯了。
  IF v_session.id IS NOT NULL AND v_session.status = 'child_confirmed' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'PLANNING_ALREADY_CONFIRMED',
      'sessionId', v_session.id,
      'message', '這份計畫孩子已經確認過了，不能當成沒有規劃直接送出');
  END IF;

  -- 已經送出過了 → 回原本那筆。孩子連點兩下、或重試一個其實已經成功的
  -- 請求，都不該看到紅字，更不該產生第二筆狀態事件。
  IF v_proposal.status = 'proposed' THEN
    RETURN jsonb_build_object(
      'ok', true, 'proposalId', v_proposal_id,
      'fromStatus', 'draft', 'toStatus', 'proposed',
      'sessionId', v_session.id, 'sessionStatus', v_session.status,
      'idempotentReplay', true);
  END IF;

  IF v_proposal.status <> 'draft' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'ILLEGAL_TRANSITION',
      'message', format('提案目前是 %s，不能送出', v_proposal.status));
  END IF;

  -- 放棄規劃。沒有 session 也完全合法 —— AI 關著、或孩子根本沒開始規劃。
  IF v_session.id IS NOT NULL THEN
    UPDATE child_goal_planning_sessions
       SET status   = 'abandoned',
           revision = v_session.revision + 1
     WHERE id = v_session.id
     RETURNING id INTO v_abandoned;
  END IF;

  UPDATE child_proposals
     SET status      = 'proposed',
         proposed_at = COALESCE(proposed_at, v_now)
   WHERE id = v_proposal_id;

  -- 與 transition_child_proposal_v1 同一組語意：一筆 draft → proposed 的
  -- 事件，actor 是 child。少了它，家長端看到的稽核鏈會缺一段。
  INSERT INTO child_proposal_status_events
    (proposal_id, from_status, to_status, actor_role, actor_user_id, plan_version_id, reason)
  VALUES
    (v_proposal_id, 'draft', 'proposed', 'child', auth.uid(),
     v_proposal.current_plan_version_id, NULLIF(btrim(COALESCE(p_command ->> 'reason', '')), ''));

  RETURN jsonb_build_object(
    'ok', true, 'proposalId', v_proposal_id,
    'fromStatus', 'draft', 'toStatus', 'proposed',
    'sessionId', v_abandoned,
    'sessionStatus', CASE WHEN v_abandoned IS NULL THEN NULL ELSE 'abandoned' END,
    'idempotentReplay', false);
END;
$$;

COMMENT ON FUNCTION public.submit_child_proposal_without_planning_v1(jsonb) IS
  'P1-A2：孩子選擇不規劃、直接送出。同一交易內放棄規劃 ＋ draft → proposed。'
  '已 child_confirmed 的 session 一律拒絕 —— 確認過的計畫不可被當成沒規劃送出。';

REVOKE ALL ON FUNCTION public.submit_child_proposal_without_planning_v1(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_child_proposal_without_planning_v1(jsonb)
  TO authenticated;
