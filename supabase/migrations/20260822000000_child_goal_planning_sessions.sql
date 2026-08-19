-- ═══════════════════════════════════════════════════════════════════════════
-- P1-A2 — Child Goal Planning Session
--
-- 這張表存的是**計畫成形之前，孩子在想什麼**。
--
-- 為什麼不是塞進 child_proposal_plan_versions：
--
--   Plan Version 是**正式共同計畫的生命週期**的一部分。家長會看到它、
--   Direct Confirm 會讀它、confirmed_reward 掛在它上面、它是 append-only
--   而且有版號。一場還在問「你想先怎麼開始？」的對話放進去，等於讓
--   一個沒有人同意過的東西出現在那條線上 —— 而家長端只會看到
--   「有一個新版本」。
--
--   Planning Session 是**孩子的思考過程**。它會有逾時、會有他改主意、
--   會有他說「我自己想」。這些都不是計畫的版本，是他怎麼走到那個計畫的。
--
-- 兩者語意不同，所以是兩張表。P1-A3 才會做「confirmed session → 正式
-- Plan Version」的橋，而那一步需要 policy enrichment（分類、完成標準、
-- 資格、幣值），這裡一個都沒有、也不該有。
--
-- ⚠️ 這張表沒有任何 provider 專屬欄位。存的是**驗證過的契約結果**，
--    不是 Gemini 的回應本體。換付費 API 時這張表一個欄位都不用改。
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. 表 ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS child_goal_planning_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id    uuid NOT NULL REFERENCES child_proposals(id) ON DELETE CASCADE,
  -- child_id / family_id 是冗餘的（proposal 上就有），但 RLS 與授權
  -- assert 每一次都要用到它們。每次都 join 回去的話，policy 會變成
  -- 一個沒有人看得懂的子查詢，而看不懂的 policy 就是會寫錯的 policy。
  child_id       uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  family_id      uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,

  schema_version smallint NOT NULL DEFAULT 1,

  -- in_progress    還在對話（含剛剛逾時了一次）
  -- ready          手上有一份計畫，等孩子點頭
  -- child_confirmed 孩子說「就照這樣開始」—— 終點
  --
  -- ⚠️ 沒有 unavailable。那是**一次 attempt 的結果**，不是這場對話的
  --    狀態。一次逾時就把 session 判死，孩子得從第一題重來。
  status         text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'ready', 'child_confirmed')),

  -- 產出過對話結果的輪數（逾時不算）／打過模型的次數（逾時算）。
  -- 兩個分開的理由見 src/lib/childPlanning/types.ts 的兩個常數。
  rounds_used    smallint NOT NULL DEFAULT 0 CHECK (rounds_used >= 0),
  attempts_used  smallint NOT NULL DEFAULT 0 CHECK (attempts_used >= 0),

  -- 孩子回過的話，依時間排序的 JSON 陣列。**只 append。**
  conversation_context jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(conversation_context) = 'array'),

  -- 最後一次的**驗證過的**契約結果，含 unavailable。
  latest_result  jsonb,

  -- 孩子確認的那一份計畫。由 RPC 從 latest_result 複製 —— 呼叫端寫不進來。
  confirmed_plan     jsonb,
  child_confirmed_at timestamptz,

  -- Optimistic concurrency。每一次成功的變更 +1。
  -- 舊的回應晚到時帶著舊的 revision，會被擋在 STALE_SESSION。
  revision       integer NOT NULL DEFAULT 0 CHECK (revision >= 0),

  -- 同一次「開始規劃」的識別碼。重送同一個 id 回原本那筆，不新增。
  client_request_id uuid,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- child_confirmed 與 confirmed_plan 是同一件事的兩面，不可以只有一半。
  -- 只有狀態沒有計畫，畫面會顯示一個空的「你確認的計畫」。
  CONSTRAINT child_goal_planning_sessions_confirmed_shape CHECK (
    (status = 'child_confirmed')
      = (confirmed_plan IS NOT NULL AND child_confirmed_at IS NOT NULL)
  )
);

COMMENT ON TABLE child_goal_planning_sessions IS
  'P1-A2：孩子的目標規劃對話。計畫成形前的思考過程，不是正式 Plan Version。';
COMMENT ON COLUMN child_goal_planning_sessions.latest_result IS
  '驗證過的 ChildGoalPlanningResult。**不是** provider 的原始回應。';
COMMENT ON COLUMN child_goal_planning_sessions.confirmed_plan IS
  '孩子確認的計畫。由 RPC 從 latest_result 複製，呼叫端傳不進來。';


-- ── 2. 索引與不變式 ───────────────────────────────────────────────────────

-- 【不變式 A】一個 proposal 同時只有一場**進行中**的 session。
--
-- 已確認的那些留著（那是歷史），所以條件是「還沒確認」而不是「全部」。
-- 用 partial unique index 而不是在 RPC 裡先查再寫：先查再寫在兩個裝置
-- 同時按下去時會兩個都通過，而這正是孩子最容易做的事（連點兩下）。
CREATE UNIQUE INDEX IF NOT EXISTS child_goal_planning_sessions_one_active_idx
  ON child_goal_planning_sessions (proposal_id)
  WHERE status IN ('in_progress', 'ready');

-- 【不變式 E】同一個 clientRequestId 是同一次嘗試。
CREATE UNIQUE INDEX IF NOT EXISTS child_goal_planning_sessions_client_request_idx
  ON child_goal_planning_sessions (proposal_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS child_goal_planning_sessions_proposal_idx
  ON child_goal_planning_sessions (proposal_id, created_at DESC);


-- ── 3. 【不變式 C】確認之後不可變 ─────────────────────────────────────────
--
-- 孩子確認過的計畫被靜靜蓋掉，是這個產品最不能發生的事之一：他上次
-- 同意的東西從此不存在，而畫面上什麼都看不出來。要重新規劃就開新的
-- session —— 那會留下兩筆紀錄，而兩筆紀錄講得出「他改過主意」。

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

  -- 對話只能變長。截短它等於刪掉孩子說過的話。
  IF jsonb_array_length(NEW.conversation_context)
     < jsonb_array_length(OLD.conversation_context) THEN
    RAISE EXCEPTION '規劃對話只能新增，不能刪除（session %）', OLD.id
      USING ERRCODE = '23514';
  END IF;

  -- revision 只能往前。倒退等於讓一個舊的寫入變得合法。
  IF NEW.revision < OLD.revision THEN
    RAISE EXCEPTION '規劃對話的版本不可倒退（session %）', OLD.id
      USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS child_goal_planning_sessions_guard ON child_goal_planning_sessions;
CREATE TRIGGER child_goal_planning_sessions_guard
  BEFORE UPDATE ON child_goal_planning_sessions
  FOR EACH ROW EXECUTE FUNCTION public.child_goal_planning_session_guard();


-- ── 4. RLS ────────────────────────────────────────────────────────────────
--
-- 與 child_proposals 完全同一個形狀：家庭成員讀得到，寫入一律走
-- SECURITY DEFINER RPC。這裡沒有 INSERT / UPDATE policy，而那是刻意的。

ALTER TABLE child_goal_planning_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family members can view planning sessions"
  ON child_goal_planning_sessions;
CREATE POLICY "family members can view planning sessions"
  ON child_goal_planning_sessions FOR SELECT TO authenticated
  USING (family_id IN (SELECT p.family_id FROM parents p WHERE p.user_id = auth.uid()));


-- ── 5. 上限（與 App 端常數同值，由 parity 測試釘住）────────────────────────
--
-- 為什麼 DB 也要有一份：rounds_used 由呼叫端送的話，一個壞掉（或被改過）
-- 的 client 可以每次都送 0，然後無限問下去。孩子被盤問的成本是真的，
-- 模型的錢也是真的。所以次數由 DB 自己加，上限由 DB 自己擋。

CREATE OR REPLACE FUNCTION public.child_goal_planning_max_rounds()
RETURNS smallint LANGUAGE sql IMMUTABLE AS $$ SELECT 3::smallint $$;

CREATE OR REPLACE FUNCTION public.child_goal_planning_max_attempts()
RETURNS smallint LANGUAGE sql IMMUTABLE AS $$ SELECT 5::smallint $$;


-- ── 6a. 開始一場規劃對話 ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_child_goal_planning_session_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal   child_proposals%ROWTYPE;
  v_client_id  uuid;
  v_existing   child_goal_planning_sessions%ROWTYPE;
  v_session_id uuid;
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本');
  END IF;

  SELECT * INTO v_proposal FROM child_proposals
   WHERE id = NULLIF(p_command ->> 'proposalId', '')::uuid;

  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: proposal is not visible to the caller'
      USING ERRCODE = '42501';
  END IF;

  -- 【不變式 D】授權沿用既有的家庭邊界，不另外發明一套。
  PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

  v_client_id := NULLIF(p_command ->> 'clientRequestId', '')::uuid;

  -- 【不變式 E】同一個 clientRequestId 是同一次嘗試。在任何狀態檢查
  -- **之前**就決定，所以「已經成功了但回應掉了」的重試會拿回原本那筆。
  IF v_client_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM child_goal_planning_sessions
     WHERE proposal_id = v_proposal.id AND client_request_id = v_client_id;
    IF v_existing.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', true, 'sessionId', v_existing.id, 'status', v_existing.status,
        'revision', v_existing.revision, 'roundsUsed', v_existing.rounds_used,
        'attemptsUsed', v_existing.attempts_used, 'idempotentReplay', true);
    END IF;
  END IF;

  -- 【不變式 B】只有還沒送出的提案可以規劃。
  --
  -- proposed 之後那份提案已經在家長手上了，這時再改計畫等於家長看到的
  -- 東西會在他眼前變動。P1-A2 的整個範圍就在 draft 這一段。
  IF v_proposal.status <> 'draft' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'PROPOSAL_NOT_DRAFT',
      'message', format('只有還沒送出的提案可以規劃（目前是 %s）', v_proposal.status));
  END IF;

  -- 【不變式 A】已經有一場進行中的就回那一場，不新增。
  SELECT * INTO v_existing FROM child_goal_planning_sessions
   WHERE proposal_id = v_proposal.id AND status IN ('in_progress', 'ready');
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'sessionId', v_existing.id, 'status', v_existing.status,
      'revision', v_existing.revision, 'roundsUsed', v_existing.rounds_used,
      'attemptsUsed', v_existing.attempts_used, 'idempotentReplay', true);
  END IF;

  INSERT INTO child_goal_planning_sessions (
    proposal_id, child_id, family_id, client_request_id
  ) VALUES (
    v_proposal.id, v_proposal.child_id, v_proposal.family_id, v_client_id
  ) RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'ok', true, 'sessionId', v_session_id, 'status', 'in_progress',
    'revision', 0, 'roundsUsed', 0, 'attemptsUsed', 0, 'idempotentReplay', false);
END;
$$;

COMMENT ON FUNCTION public.start_child_goal_planning_session_v1(jsonb) IS
  'P1-A2：開始一場規劃對話。一個 draft 提案同時只有一場，重送同一個 clientRequestId 回原本那筆。';

REVOKE ALL ON FUNCTION public.start_child_goal_planning_session_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_child_goal_planning_session_v1(jsonb) TO authenticated;


-- ── 6b. 記下一輪（孩子的回話 ＋ 模型的結果）───────────────────────────────
--
-- ⚠️ rounds_used / attempts_used **由這裡自己加**，不收呼叫端的值。
--    收的話，上限就只是一個建議。

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

  -- FOR UPDATE：孩子連點兩下時，第二個會讀到已經加過的 revision，
  -- 然後在下面的 stale 檢查被擋 —— 而不是兩次都寫進去。
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

  -- 【§19】舊的回應晚到 —— 它算的是一個已經不存在的狀態。
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

  -- 【不變式 B】提案一旦送出就不再規劃。
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

  -- 上限。逾時不吃 round，但吃 attempt —— 兩個都在這裡擋，不是在畫面。
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

  -- 孩子的回話（可有可無）。**append**，不是覆寫 —— trigger 也擋一次。
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

COMMENT ON FUNCTION public.record_child_goal_planning_round_v1(jsonb) IS
  'P1-A2：記一輪規劃結果。次數由 RPC 自己加，expectedRevision 擋晚到的舊回應。';

REVOKE ALL ON FUNCTION public.record_child_goal_planning_round_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_child_goal_planning_round_v1(jsonb) TO authenticated;


-- ── 6c. 孩子確認 ──────────────────────────────────────────────────────────
--
-- ⚠️ confirmed_plan **從 latest_result 複製**，命令裡不收計畫。
--
--    與 confirmed_reward 從 tasks 複製是同一個理由：呼叫端送得進來的話，
--    孩子確認的就不一定是他螢幕上那一份。這裡沒有第二份計畫的來源。

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

  -- 重複確認回原本那筆，不是錯誤 —— 孩子連點兩下不該看到紅字。
  IF v_session.status = 'child_confirmed' THEN
    RETURN jsonb_build_object(
      'ok', true, 'sessionId', v_session.id, 'status', 'child_confirmed',
      'revision', v_session.revision, 'idempotentReplay', true);
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

  -- ⚠️ **這裡刻意什麼都不做**：不建立 plan version、不轉 proposed、
  --    不碰幣值。提案仍然是 draft。
  --
  --    P1 的計畫回答的是「怎麼往前走」，正式 Plan Version 需要的是
  --    分類、完成標準、資格、定價 —— 那是 P1-A3 的 policy enrichment。
  --    在這裡先轉 proposed 的話，孩子看到的是 P1 計畫，而家長看到的
  --    會是另一份 P0 草稿。兩份「真正的計畫」不可以同時存在。

  RETURN jsonb_build_object(
    'ok', true, 'sessionId', v_session.id, 'status', 'child_confirmed',
    'revision', v_session.revision + 1, 'idempotentReplay', false);
END;
$$;

COMMENT ON FUNCTION public.confirm_child_goal_planning_session_v1(jsonb) IS
  'P1-A2：孩子確認計畫。計畫從 latest_result 複製；提案維持 draft（P1-A3 才做 proposed）。';

REVOKE ALL ON FUNCTION public.confirm_child_goal_planning_session_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_child_goal_planning_session_v1(jsonb) TO authenticated;
