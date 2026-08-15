-- ═══════════════════════════════════════════════════════════════════════════
-- P1-A4B2 — 孩子看過家長提出的共同條件，然後決定
--
-- ─────────────────────────────────────────────────────────────────────────
-- 孩子現在看到的是：
--
--     我的做法沒有被偷偷改掉；爸媽只對需要一起配合的條件提出了安排。
--
-- 他可以說「可以」或「我想再調整」。而「可以」有**兩種結果**，
-- 這是這一包最重要的邊界：
--
--   A  共同條件都齊了  → 正式成立，建立任務
--   B  這一輪我同意，但還有別的沒說完
--                      → 記下他同意了這一輪，回 proposed 繼續談
--                      → **不建任務、不發幣、不填 child_accepted_at**
--
-- 按了一顆「可以」就把還沒決定的事當成決定了，是這一包最想防的事。
--
-- ⚠️ 這兩支是 accept_child_proposal_plan_v1 / request_child_proposal_changes_v1
--    的 **sibling**。那兩支用 P0 的 reward 錨點（ai_suggested_coin_amount）、
--    P0 的 parent revision 形狀，而且不認得 P1 的 canonical child-plan lineage。
--    **這支 migration 一個字都沒有動它們。**
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. 動作語意 ───────────────────────────────────────────────────────────
--
-- 「孩子同意了這一輪但還沒談完」與「孩子想再調整」都會把提案推回
-- proposed。兩者在資料上必須分得開，否則之後沒有人能回答
-- 「上一次他到底是同意還是不同意」。
--
-- 用一個封閉列舉的欄位，不是自由文字。reason 那一欄留給人話
-- （孩子寫「我還是想睡前」）—— 拿人話當狀態機的判斷依據，
-- 第一個把句子改順一點的人就會把流程弄壞。

ALTER TABLE child_proposal_status_events
  ADD COLUMN IF NOT EXISTS action text;

ALTER TABLE child_proposal_status_events
  DROP CONSTRAINT IF EXISTS child_proposal_status_events_action_check;
ALTER TABLE child_proposal_status_events
  ADD CONSTRAINT child_proposal_status_events_action_check
  CHECK (action IS NULL OR action IN (
    'accepted_shared_terms_pending_more',
    'requested_shared_term_changes'
  ));

COMMENT ON COLUMN child_proposal_status_events.action IS
  'P1：這次狀態轉換的動作語意（機器可讀）。NULL = 沒有標注的一般轉換。'
  '人話寫在 reason —— 兩欄不可互相代替。';


-- ── 2b. transition：讓呼叫端可以標注動作語意 ─────────────────────────────
--
-- 與 20260821 的差別只有兩處：多讀一個 action、寫進事件那一欄。
-- 其餘一字未動（那一支已經套過 staging，內容從既有定義原樣搬過來）。
--
-- 舊呼叫端不帶 action，寫進去就是 NULL —— legacy 的行為完全不變。

CREATE OR REPLACE FUNCTION public.transition_child_proposal_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal_id uuid;
  v_child_id    uuid;
  v_from        text;
  v_to          text;
  v_actor       text;
  v_reason      text;
  v_action      text;
  v_task_id     uuid;
  v_current_ver uuid;
  v_task        tasks%ROWTYPE;
  v_payout_basis text;
  v_now         timestamptz := now();
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本'
    );
  END IF;

  v_proposal_id := NULLIF(p_command ->> 'proposalId', '')::uuid;
  v_to          := NULLIF(btrim(COALESCE(p_command ->> 'toStatus', '')), '');
  v_actor       := NULLIF(btrim(COALESCE(p_command ->> 'actorRole', '')), '');
  v_reason      := NULLIF(btrim(COALESCE(p_command ->> 'reason', '')), '');
  -- P1-A4B1/B2：機器可讀的動作語意。舊呼叫端不帶它，寫進去就是 NULL，
  -- 行為與改動前完全一樣。**不用 reason 兼差** —— 那一欄是人話
  -- （孩子寫「我還是想睡前」），拿它當狀態機的判斷依據，第一個把
  -- 句子改順一點的人就會把流程弄壞。
  v_action      := NULLIF(btrim(COALESCE(p_command ->> 'action', '')), '');
  v_task_id     := NULLIF(p_command ->> 'taskId', '')::uuid;

  IF v_proposal_id IS NULL OR v_to IS NULL OR v_actor IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId、toStatus 或 actorRole'
    );
  END IF;

  -- actorRole 只檢查「值認不認得」，不檢查「你是不是真的是這個角色」——
  -- 後者在這個身分模型下驗證不了（第 8 節）。這一段是輸入驗證，不是授權。
  -- 真正的授權在下面的 assert_child_in_caller_family：呼叫者必須屬於這個家庭。
  IF v_actor NOT IN ('child', 'parent') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('未知的操作者角色：%s', v_actor)
    );
  END IF;

  -- FOR UPDATE：兩個裝置同時確認同一份提案時，第二個會讀到已經
  -- 轉換後的狀態，然後在下面的合法性檢查被擋下 —— 而不是兩個都成功。
  SELECT cp.child_id, cp.status, cp.current_plan_version_id
    INTO v_child_id, v_from, v_current_ver
  FROM child_proposals cp WHERE cp.id = v_proposal_id
  FOR UPDATE;

  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: proposal % is not visible to the caller', v_proposal_id
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_child_in_caller_family(v_child_id);

  IF NOT public.child_proposal_transition_allowed(v_from, v_to, v_actor) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'ILLEGAL_TRANSITION',
      'message', format('%s 不能把提案從 %s 轉成 %s', v_actor, v_from, v_to)
    );
  END IF;

  -- active 的前置條件在 CHECK 也有一份，這裡先擋是為了回一個看得懂的訊息，
  -- 而不是讓呼叫端收到 23514。
  IF v_to = 'active' THEN
    IF v_task_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'ACTIVE_REQUIRES_TASK',
        'message', '形成共同版本必須帶正式任務（由 P0-5 的轉換建立）'
      );
    END IF;
    IF v_current_ver IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'ACTIVE_REQUIRES_PLAN_VERSION',
        'message', '形成共同版本必須有一個生效的計畫版本'
      );
    END IF;

    -- ══ 讀出正式任務，作為回饋快照的唯一來源 ════════════════════════════
    --
    -- 快照的每一個值都從這一列複製。命令裡就算夾帶幣值也進不來 ——
    -- 這一支 RPC 根本沒有讀 p_command 的幣值欄位。
    SELECT * INTO v_task FROM tasks t WHERE t.id = v_task_id;

    IF v_task.id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'message', format('找不到任務 %s', v_task_id)
      );
    END IF;

    -- 家庭邊界。下面的 trigger 也會擋一次，這裡先擋是為了回一個看得懂的訊息。
    IF v_task.family_id IS DISTINCT FROM
       (SELECT cp.family_id FROM child_proposals cp WHERE cp.id = v_proposal_id) THEN
      RAISE EXCEPTION 'Not authorized: task % belongs to another family', v_task_id
        USING ERRCODE = '42501';
    END IF;

    v_payout_basis := public.child_proposal_payout_basis(v_task.claim_period);

    -- 快照必須是完整的。缺一半的快照比沒有快照更糟 —— 它看起來像有答案。
    --
    -- 走 create_parent_task_v1 建立的任務一定填得齊這些欄位；
    -- 填不齊代表這個 task_id 是舊路徑（taskActions / onboarding）建立的，
    -- 那種任務不該被當成孩子提案的共同版本。
    IF v_task.reward_policy IS NULL
      OR btrim(COALESCE(v_task.reward_policy_version, '')) = ''
      OR v_payout_basis IS NULL
      OR v_task.max_claims_per_period IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'TASK_REWARD_SNAPSHOT_INCOMPLETE',
        'message',
        '這筆任務缺少回饋方式或政策版本，無法留下共同確認的回饋紀錄；'
        '請以 create_parent_task_v1 建立的任務進行轉換'
      );
    END IF;

    IF v_task.reward_policy = 'coin_eligible'
      AND COALESCE(v_task.reward_coin_amount, 0) <= 0 THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'TASK_REWARD_SNAPSHOT_INCOMPLETE',
        'message', '可獲得成長幣的任務缺少幣值，無法留下共同確認的回饋紀錄'
      );
    END IF;
  ELSIF v_task_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '只有轉為 active 才可以帶任務'
    );
  END IF;

  -- 「家長改了、等孩子接受」必須有一版可以接受的東西。
  -- CHECK 也擋得住，但那會回一個 23514，呼叫端讀不出是哪裡少了。
  IF v_to = 'needs_child_review' AND v_current_ver IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'REVIEW_REQUIRES_PLAN_VERSION',
      'message', '要孩子確認之前，必須先有一個家長修改後的計畫版本'
    );
  END IF;

  IF v_to = 'closed_unsuitable' AND v_reason IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'CLOSE_REQUIRES_REASON',
      'message', '回絕提案必須說明原因'
    );
  END IF;

  UPDATE child_proposals
     SET status       = v_to,
         task_id      = CASE WHEN v_to = 'active' THEN v_task_id ELSE task_id END,
         proposed_at  = CASE WHEN proposed_at IS NULL AND v_to <> 'draft'
                             THEN v_now ELSE proposed_at END,
         activated_at = CASE WHEN v_to = 'active' THEN v_now ELSE activated_at END,
         closed_reason = CASE WHEN v_to = 'closed_unsuitable' THEN v_reason ELSE closed_reason END,
         closed_at    = CASE WHEN v_to = 'closed_unsuitable' THEN v_now ELSE closed_at END
   WHERE id = v_proposal_id;

  -- 孩子接受了家長的版本 → 記在版本上，不只記在提案上。
  -- 「他接受的是哪一版」之後要查得出來。
  IF v_to = 'active' AND v_current_ver IS NOT NULL THEN
    UPDATE child_proposal_plan_versions
       SET effective_at      = COALESCE(effective_at, v_now),
           child_accepted_at = CASE WHEN v_actor = 'child'
                                    THEN COALESCE(child_accepted_at, v_now)
                                    ELSE child_accepted_at END,

           -- ══ 家庭最後共同確認的回饋快照 ══════════════════════════════
           --
           -- 全部**從 tasks 複製**，一個值都不從命令來。
           -- 這是「不建立第二套 pricing engine」在程式碼裡的落實：
           -- 幣值仍然只由 rewardEligibility → coinPolicy →
           -- create_parent_task_v1 決定，這裡只留一份不可變的副本。
           --
           -- COALESCE 是因為 write-once：重複轉 active 不該蓋掉第一次的快照
           -- （雖然狀態機本來就不允許，但這裡不依賴那個保證）。
           confirmed_reward_policy         = COALESCE(confirmed_reward_policy, v_task.reward_policy),
           confirmed_coin_amount           = COALESCE(confirmed_coin_amount,
                                                      CASE WHEN v_task.reward_policy = 'coin_eligible'
                                                           THEN v_task.reward_coin_amount END),
           confirmed_payout_basis          = COALESCE(confirmed_payout_basis, v_payout_basis),
           confirmed_claim_period          = COALESCE(confirmed_claim_period, v_task.claim_period),
           confirmed_max_claims_per_period = COALESCE(confirmed_max_claims_per_period,
                                                      v_task.max_claims_per_period),
           confirmed_reward_policy_version = COALESCE(confirmed_reward_policy_version,
                                                      v_task.reward_policy_version),
           confirmed_task_policy_version   = COALESCE(confirmed_task_policy_version,
                                                      v_task.task_policy_version),
           confirmed_source_task_id        = COALESCE(confirmed_source_task_id, v_task_id),
           confirmed_by_user_id            = COALESCE(confirmed_by_user_id, auth.uid()),
           confirmed_at                    = COALESCE(confirmed_at, v_now)
     WHERE id = v_current_ver;
  END IF;

  INSERT INTO child_proposal_status_events
    (proposal_id, from_status, to_status, actor_role, actor_user_id, plan_version_id,
     reason, action)
  VALUES
    (v_proposal_id, v_from, v_to, v_actor, auth.uid(), v_current_ver, v_reason, v_action);

  RETURN jsonb_build_object(
    'ok', true, 'proposalId', v_proposal_id, 'fromStatus', v_from, 'toStatus', v_to,
    'planVersionId', v_current_ver,
    -- 從**已經寫下去的版本列**讀回來，不是拿上面算好的區域變數再組一次。
    --
    -- 這是本 migration 的全部重點。payout semantics 由
    -- snapshot_canonical_payout_basis_v1 在 BEFORE trigger 裡以 tasks 為準覆寫，
    -- 而 v_payout_basis 是 claim_period 的推導值 —— long_term + fixed_days
    -- 兩者就會不一樣。回傳推導值等於「紀錄一套、回應另一套」。
    --
    -- P0-5 原本要的「不必再查一次 tasks 就能比對」仍然成立，而且更強：
    -- 現在比對的對象是實際被持久化的那一列。
    -- 非 active 的轉換這一鍵仍然是 null。
    'confirmedReward', CASE WHEN v_to = 'active'
      THEN public.child_proposal_confirmed_reward_v1(v_current_ver) END
  );
END;
$$;


-- ── 3. 孩子接受這一輪共同條件 ────────────────────────────────────────────
--
-- 一支 RPC 兩條出口，因為對孩子來說那是同一個動作（「這樣可以」）。
-- 走哪一條由**資料**決定（requires_parent_decision 是不是空的），
-- 不由呼叫端指定 —— 讓 UI 挑路徑的話，隱藏一顆按鈕就等於繞過檢查。

CREATE OR REPLACE FUNCTION public.accept_child_planning_terms_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal     child_proposals%ROWTYPE;
  v_plan         child_proposal_plan_versions%ROWTYPE;
  v_source       child_proposal_plan_versions%ROWTYPE;
  v_root         child_proposal_plan_versions%ROWTYPE;
  v_verified     child_proposals%ROWTYPE;
  v_latest_event child_proposal_status_events%ROWTYPE;
  v_root_id      uuid;
  v_expected_plan_id uuid;
  v_task_id      uuid;
  v_start_date   date;
  v_end_date     date;
  v_decision     jsonb;
  v_coin_ref     integer;
  v_payout       text;
  v_task_command jsonb;
  v_create_result     jsonb;
  v_transition_result jsonb;
  v_failure_text text;
  v_related      jsonb;
  v_purpose      text;
  v_completion_policy text;
  v_pending      text[];
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本');
  END IF;

  -- 孩子在這一步只能說「可以」。他不是在編輯計畫，任何內容欄位都不收。
  IF p_command ?| ARRAY[
       'planTitle', 'planSummary', 'nextStep', 'desiredOutcome', 'actionPlanSummary',
       'childConfirmedPlan', 'progressionKind', 'phases', 'targetValue', 'targetUnit',
       'cadenceMode', 'cadenceWeeklyFrequency', 'cadenceDays',
       'preferredTime', 'estimatedMinutes', 'durationDays',
       'coinAmount', 'confirmedReward'
     ] THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'REVIEW_IS_NOT_AN_EDITOR',
      'message', '這一步只能回覆可不可以，不能同時改內容');
  END IF;

  v_expected_plan_id := NULLIF(p_command ->> 'expectedPlanVersionId', '')::uuid;
  IF NULLIF(p_command ->> 'proposalId', '') IS NULL OR v_expected_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId 或 expectedPlanVersionId');
  END IF;

  BEGIN
    SELECT * INTO v_proposal FROM child_proposals
     WHERE id = (p_command ->> 'proposalId')::uuid FOR UPDATE;
    IF v_proposal.id IS NULL THEN
      RAISE EXCEPTION 'Not authorized: proposal is not visible to the caller'
        USING ERRCODE = '42501';
    END IF;
    PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

    -- ── 冪等 1：已經正式成立（final accept 的重送）─────────────────────
    IF v_proposal.status = 'active' THEN
      SELECT * INTO v_plan FROM child_proposal_plan_versions
       WHERE id = v_proposal.current_plan_version_id AND proposal_id = v_proposal.id;

      IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id
        OR v_plan.id IS NULL
        OR v_plan.authored_by <> 'parent'
        OR v_proposal.task_id IS NULL
        OR v_plan.confirmed_source_task_id IS DISTINCT FROM v_proposal.task_id
        OR v_plan.child_accepted_at IS NULL
        OR v_plan.effective_at IS NULL THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'STALE_PLAN_VERSION', 'reason', 'STALE_PLAN_VERSION',
          'message', '這份提案已由另一個版本成立');
      END IF;

      SELECT COALESCE(jsonb_agg(rows.id ORDER BY rows.kind, rows.id), '[]'::jsonb)
        INTO v_related
        FROM (
          SELECT ct.id, 1 AS kind FROM child_tasks ct WHERE ct.task_id = v_proposal.task_id
          UNION ALL
          SELECT g.id, 2 AS kind FROM long_term_goals g WHERE g.task_id = v_proposal.task_id
          UNION ALL
          SELECT e.id, 3 AS kind FROM task_change_events e
           WHERE e.task_id = v_proposal.task_id
             AND e.event_type = 'created_from_child_proposal'
        ) AS rows;

      RETURN jsonb_build_object(
        'ok', true, 'proposalId', v_proposal.id, 'planVersionId', v_plan.id,
        'status', 'active', 'activated', true,
        'taskId', v_proposal.task_id, 'relatedIds', v_related,
        'requiresParentDecision', to_jsonb(v_plan.requires_parent_decision),
        'confirmedReward', public.child_proposal_confirmed_reward_v1(v_plan.id),
        'idempotentReplay', true);
    END IF;

    -- ── 冪等 2：這一輪已經接受過，但還沒談完（partial accept 的重送）───
    --
    -- 證據是**最後一筆狀態事件**：needs_child_review → proposed、孩子、
    -- 同一版、而且動作語意正是「接受了這一輪」。少了 action 這一欄，
    -- 這裡就分不出「他上次是同意還是不同意」。
    IF v_proposal.status = 'proposed'
      AND v_proposal.current_plan_version_id IS NOT DISTINCT FROM v_expected_plan_id THEN
      SELECT * INTO v_latest_event FROM child_proposal_status_events
       WHERE proposal_id = v_proposal.id
       ORDER BY created_at DESC, id DESC LIMIT 1;

      IF v_latest_event.from_status = 'needs_child_review'
        AND v_latest_event.to_status = 'proposed'
        AND v_latest_event.actor_role = 'child'
        AND v_latest_event.plan_version_id IS NOT DISTINCT FROM v_expected_plan_id
        AND v_latest_event.action = 'accepted_shared_terms_pending_more' THEN
        SELECT * INTO v_plan FROM child_proposal_plan_versions WHERE id = v_expected_plan_id;
        RETURN jsonb_build_object(
          'ok', true, 'proposalId', v_proposal.id, 'planVersionId', v_expected_plan_id,
          'status', 'proposed', 'activated', false, 'taskId', NULL,
          'requiresParentDecision', to_jsonb(v_plan.requires_parent_decision),
          'confirmedReward', NULL,
          'idempotentReplay', true);
      END IF;
    END IF;

    IF v_proposal.status <> 'needs_child_review' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'PROPOSAL_NOT_IN_REVIEW',
        'message', '這份安排目前不在等你看看');
    END IF;
    IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'STALE_PLAN_VERSION', 'reason', 'STALE_PLAN_VERSION',
        'message', '安排剛剛更新了，重新看看就好');
    END IF;
    IF v_proposal.task_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'REVIEW_MUST_NOT_HAVE_TASK',
        'message', '已經有正式任務的提案不走這一步');
    END IF;

    SELECT * INTO v_plan FROM child_proposal_plan_versions
     WHERE id = v_expected_plan_id AND proposal_id = v_proposal.id
     FOR UPDATE;

    IF v_plan.id IS NULL
      OR v_plan.authored_by <> 'parent'
      OR v_plan.requires_child_review IS DISTINCT FROM TRUE
      OR v_plan.parent_confirmed_at IS NULL
      OR v_plan.child_accepted_at IS NOT NULL
      OR v_plan.effective_at IS NOT NULL
      OR v_plan.adopted_from_plan_version_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'PLAN_NOT_REVIEWABLE',
        'message', '目前版本不是等你看看的家庭安排');
    END IF;

    -- ── 整條 chain 必須回得到孩子自己規劃的那一份 ────────────────────────
    --
    -- 這是與 P0 parent revision 的分界。少了它，一份普通的 P0 調整版
    -- 也會出現在孩子的 P1 畫面上，而那個畫面說的是「你的做法沒有被改」——
    -- 對 P0 的版本來說那句話不成立。
    WITH RECURSIVE chain AS (
      SELECT v.id, v.adopted_from_plan_version_id, v.authored_by,
             v.source_planning_session_id, v.child_confirmed_plan, 0 AS depth
        FROM child_proposal_plan_versions v
       WHERE v.id = v_expected_plan_id
      UNION ALL
      SELECT p.id, p.adopted_from_plan_version_id, p.authored_by,
             p.source_planning_session_id, p.child_confirmed_plan, chain.depth + 1
        FROM chain
        JOIN child_proposal_plan_versions p ON p.id = chain.adopted_from_plan_version_id
       WHERE chain.depth < 20
    )
    SELECT chain.id INTO v_root_id FROM chain
     WHERE chain.authored_by = 'child'
       AND chain.source_planning_session_id IS NOT NULL
       AND chain.child_confirmed_plan IS NOT NULL
     ORDER BY chain.depth DESC LIMIT 1;

    IF v_root_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'NOT_CHILD_PLANNING_LINEAGE',
        'message', '這份安排不是從你自己的計畫來的');
    END IF;
    SELECT * INTO v_root FROM child_proposal_plan_versions WHERE id = v_root_id;
    SELECT * INTO v_source FROM child_proposal_plan_versions
     WHERE id = v_plan.adopted_from_plan_version_id;

    -- ── 孩子擁有的欄位必須原封不動 ──────────────────────────────────────
    --
    -- 家長那一輪只該碰共同條件。這幾欄如果與來源不一致，那不是一次
    -- 合法的協商，是資料錯了 —— 不可以拿去問孩子「這樣可以嗎」，
    -- 因為畫面上那句「你的做法沒有被改掉」會是假的。
    IF v_source.id IS NULL
      OR v_plan.plan_title IS DISTINCT FROM v_source.plan_title
      OR v_plan.plan_summary IS DISTINCT FROM v_source.plan_summary
      OR v_plan.next_step IS DISTINCT FROM v_source.next_step
      OR v_plan.completion_description IS DISTINCT FROM v_source.completion_description
      OR v_plan.purpose_category IS DISTINCT FROM v_source.purpose_category
      OR v_plan.duration_type IS DISTINCT FROM v_source.duration_type
      -- 整條鏈的頭尾也要對得上：中間任何一版改掉標題或下一步都算。
      OR v_plan.plan_title IS DISTINCT FROM v_root.plan_title
      OR v_plan.next_step IS DISTINCT FROM v_root.next_step
      OR v_root.child_confirmed_plan IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'CHILD_PLAN_INTEGRITY_VIOLATION',
        'message', '這份安排和你原本的計畫對不起來，先不要接受');
    END IF;

    v_pending := v_plan.requires_parent_decision;

    -- 系統還沒整理完的事不該出現在孩子面前。理論上 A4B1 就擋掉了；
    -- 真的出現在這裡是上游漏掉，不要翻譯成「任務分類還沒選」問孩子。
    IF 'purpose_category' = ANY (v_pending) THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'SYSTEM_ENRICHMENT_REQUIRED',
        'message', 'GrowBook 還在整理這件事，等一下再看看');
    END IF;

    -- ══════════════════════════════════════════════════════════════════
    -- B｜這一輪同意了，但還有事沒說完
    -- ══════════════════════════════════════════════════════════════════
    --
    -- **不填 child_accepted_at。** 那一欄在這個 repo 的既有語意是
    -- 「孩子接受了即將成為共同計畫的版本」，而且一向與 effective_at、
    -- 正式任務一起出現。在這裡填它，之後每一個讀者都要重新理解它。
    --
    -- 這件事記在狀態事件上就夠了：他看過、他同意這一輪。
    IF cardinality(v_pending) > 0 THEN
      v_transition_result := public.transition_child_proposal_v1(jsonb_build_object(
        'schemaVersion', 1,
        'proposalId', v_proposal.id,
        'toStatus', 'proposed',
        'actorRole', 'child',
        'action', 'accepted_shared_terms_pending_more'
      ));
      IF COALESCE((v_transition_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001',
          MESSAGE = 'partial accept transition failed', DETAIL = v_transition_result::text;
      END IF;

      SELECT * INTO v_verified FROM child_proposals WHERE id = v_proposal.id;
      SELECT * INTO v_plan FROM child_proposal_plan_versions WHERE id = v_expected_plan_id;
      IF v_verified.status <> 'proposed'
        OR v_verified.task_id IS NOT NULL
        OR v_verified.current_plan_version_id IS DISTINCT FROM v_expected_plan_id
        OR v_plan.child_accepted_at IS NOT NULL
        OR v_plan.effective_at IS NOT NULL
        OR v_plan.confirmed_at IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001',
          MESSAGE = 'partial accept verification failed',
          DETAIL = jsonb_build_object(
            'ok', false, 'code', 'PERSISTENCE_FAILED',
            'reason', 'PARTIAL_ACCEPT_VERIFICATION_FAILED',
            'message', '你的回覆沒有完整存下來，再試一次'
          )::text;
      END IF;

      RETURN jsonb_build_object(
        'ok', true, 'proposalId', v_proposal.id, 'planVersionId', v_expected_plan_id,
        'status', 'proposed', 'activated', false, 'taskId', NULL,
        'requiresParentDecision', to_jsonb(v_pending),
        'confirmedReward', NULL,
        'idempotentReplay', false);
    END IF;

    -- ══════════════════════════════════════════════════════════════════
    -- A｜共同條件都齊了 → 正式成立
    -- ══════════════════════════════════════════════════════════════════

    -- 走到這裡 v_pending 一定是空的。再驗一次是刻意的：哪天有人讓
    -- 呼叫端挑路徑，這一行會擋住「UI 藏起按鈕就等於通過檢查」。
    IF cardinality(v_pending) > 0 THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'SHARED_DECISION_REQUIRED',
        'pending', to_jsonb(v_pending),
        'message', '還有安排沒有說定，先不要開始');
    END IF;

    IF COALESCE(btrim(v_plan.plan_title), '') = ''
      OR v_plan.purpose_category IS NULL
      OR COALESCE(btrim(v_plan.completion_description), '') = ''
      OR COALESCE(btrim(v_plan.next_step), '') = ''
      OR v_plan.duration_type IS NULL
      OR (v_plan.duration_type = 'long_term'
          AND (v_plan.duration_days IS NULL OR v_plan.duration_days <= 0))
      OR v_plan.cadence_mode NOT IN ('weekly_frequency', 'fixed_days', 'one_time')
      OR v_plan.estimated_minutes IS NULL OR v_plan.estimated_minutes <= 0
      OR v_plan.reward_policy IS NULL
      OR v_plan.reward_eligibility <> 'allowed'
      OR COALESCE(btrim(v_plan.reward_policy_version), '') = ''
      OR COALESCE(btrim(v_plan.task_policy_version), '') = '' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'SHARED_DECISION_REQUIRED',
        'pending', '[]'::jsonb,
        'message', '這份安排還缺正式任務需要的資料，先不要開始');
    END IF;

    IF v_plan.cadence_mode = 'weekly_frequency' AND (
      v_plan.cadence_weekly_frequency IS NULL
      OR v_plan.cadence_weekly_frequency NOT BETWEEN 1 AND 7
      OR v_plan.cadence_days IS NOT NULL
    ) THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'WEEKLY_RHYTHM_INVALID',
        'message', '每週節奏的資料不完整');
    END IF;

    -- ── Policy freshness ────────────────────────────────────────────────
    --
    -- 家長提出到孩子接受可能隔了幾天，所以 App 端用**現在的**政策重算
    -- 一次，這裡再驗那份判定與這一版上的 canonical policy evidence 一致。
    --
    -- **不讀 ai_snapshot**（P1-A4A.1）。也**不因為對不上就順手改掉這一版
    -- 的證據**：家長草案是 append-only 的家庭提案，孩子按下「可以」的
    -- 那一刻偷偷換一個金額，是這條路徑上最不該發生的事。
    v_decision := p_command -> 'rewardDecision';
    IF v_decision IS NULL
      OR v_decision ->> 'eligibility' IS DISTINCT FROM 'allowed'
      OR v_decision ->> 'rewardPolicy' IS DISTINCT FROM v_plan.reward_policy
      OR v_decision ->> 'rewardPolicyVersion' IS DISTINCT FROM v_plan.reward_policy_version THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_CHANGED',
        'message', '回饋規則更新了，請重新整理後再看一次');
    END IF;

    IF v_plan.purpose_category = 'B' AND v_plan.reward_policy = 'coin_eligible' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_CHANGED',
        'message', '家庭參與目前不能建立成成長幣任務');
    END IF;

    v_coin_ref := v_plan.policy_session_coin_reference;
    v_payout   := v_plan.policy_payout_type;

    IF v_plan.reward_policy = 'coin_eligible' THEN
      IF v_payout IS DISTINCT FROM 'per_completion' THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_CHANGED',
          'message', '這份安排的回饋方式還沒有正式的結算規則');
      END IF;
      IF v_coin_ref IS NULL OR v_coin_ref <= 0
        OR NULLIF(v_decision -> 'coin' ->> 'suggestedAmount', '')::int IS DISTINCT FROM v_coin_ref
        OR NULLIF(v_decision -> 'coin' ->> 'finalAmount', '')::int IS DISTINCT FROM v_coin_ref THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_CHANGED',
          'message', '成長幣的算法更新了，請重新整理後再看一次');
      END IF;
    ELSIF v_coin_ref IS NOT NULL OR v_decision -> 'coin' IS DISTINCT FROM 'null'::jsonb THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED', 'reason', 'POLICY_CHANGED',
        'message', '不發幣的安排帶有不一致的幣值');
    END IF;

    -- ── 正式任務 ────────────────────────────────────────────────────────
    v_start_date := timezone('Asia/Taipei', now())::date;
    v_end_date := CASE
      WHEN v_plan.duration_days IS NOT NULL THEN v_start_date + (v_plan.duration_days - 1)
      ELSE NULL END;

    UPDATE child_proposal_plan_versions
       SET start_date = v_start_date, end_date = v_end_date
     WHERE id = v_plan.id;

    v_purpose := CASE v_plan.purpose_category
      WHEN 'A' THEN 'life_routine'
      WHEN 'B' THEN 'family_participation'
      WHEN 'C' THEN 'autonomous_challenge'
      WHEN 'D' THEN 'learning_skill'
    END;
    v_completion_policy := CASE v_plan.duration_type
      WHEN 'one_time' THEN 'complete_once'
      WHEN 'long_term' THEN 'review_and_continue'
      ELSE 'ongoing'
    END;

    v_task_command := jsonb_strip_nulls(jsonb_build_object(
      'schemaVersion', 1,
      'creationSource', 'child_proposal',
      'childId', v_proposal.child_id,
      'familyId', v_proposal.family_id,
      'rewardSupport', jsonb_build_object('intent', 'default'),
      'progressModel', v_plan.progress_model,
      'nextStep', v_plan.next_step,
      'task', jsonb_strip_nulls(jsonb_build_object(
        'title', v_plan.plan_title,
        'purposeCategory', v_purpose,
        'durationType', v_plan.duration_type,
        'planMode', CASE WHEN v_plan.duration_type = 'long_term' THEN 'growth_plan' END,
        'source', v_proposal.proposal_source,
        'rewardPolicy', v_plan.reward_policy,
        'completionPolicy', v_completion_policy,
        'originalExpectation', v_proposal.child_original_goal,
        'completionDescription', v_plan.completion_description
      )),
      'schedule', jsonb_strip_nulls(jsonb_build_object(
        'mode', v_plan.cadence_mode,
        'startDate', v_start_date,
        'scheduledDate', CASE WHEN v_plan.cadence_mode = 'one_time' THEN v_start_date END,
        'endDate', v_end_date,
        'durationDays', v_plan.duration_days,
        'weeklyFrequency', v_plan.cadence_weekly_frequency,
        'recurrenceDays', to_jsonb(v_plan.cadence_days),
        'preferredTime', COALESCE(v_plan.preferred_time, 'when_needed'),
        'preferredTimeCustom', v_plan.preferred_time_custom,
        'estimatedMinutes', v_plan.estimated_minutes,
        'reminderMode', 'none'
      )),
      'content', jsonb_build_object(
        'selectedOptions', '{}'::jsonb, 'customOptionValues', '{}'::jsonb
      ),
      'review', CASE WHEN v_plan.duration_type = 'long_term' THEN jsonb_build_object(
        'reviewEnabled', true,
        'firstReviewAfterDays', LEAST(7, v_plan.duration_days),
        'weekendReviewEnabled', false
      ) END,
      'plan', CASE WHEN v_plan.duration_type = 'long_term' THEN jsonb_build_object(
        'durationDays', v_plan.duration_days,
        'milestones', '[]'::jsonb,
        'supportSteps', '[]'::jsonb,
        'focusOptionIds', '[]'::jsonb
      ) END,
      'metadata', jsonb_build_object(
        'ageGroup', (SELECT c.age_group FROM children c WHERE c.id = v_proposal.child_id),
        'createdFromPreset', false,
        'taskPolicyVersion', v_plan.task_policy_version,
        'editorKind', CASE WHEN v_plan.duration_type = 'long_term' THEN 'growth_plan'
                           WHEN v_plan.duration_type = 'one_time' THEN 'one_time'
                           ELSE 'recurring' END,
        'clientRequestId', v_proposal.id
      ),
      'reward', jsonb_build_object('decision', v_decision)
    ));

    v_create_result := public.create_parent_task_v1(v_task_command);
    IF COALESCE((v_create_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'canonical task creation failed', DETAIL = v_create_result::text;
    END IF;
    v_task_id := NULLIF(v_create_result ->> 'taskId', '')::uuid;

    -- child_accepted_at / effective_at / confirmed reward 全部由既有的
    -- transition 寫。這裡不手組第二套 confirmedReward。
    v_transition_result := public.transition_child_proposal_v1(jsonb_build_object(
      'schemaVersion', 1,
      'proposalId', v_proposal.id,
      'toStatus', 'active',
      'actorRole', 'child',
      'taskId', v_task_id
    ));
    IF COALESCE((v_transition_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'proposal activation failed', DETAIL = v_transition_result::text;
    END IF;

    -- ── 驗證 ────────────────────────────────────────────────────────────
    SELECT * INTO v_verified FROM child_proposals WHERE id = v_proposal.id;
    SELECT * INTO v_plan FROM child_proposal_plan_versions WHERE id = v_expected_plan_id;

    IF v_verified.status <> 'active'
      OR v_verified.task_id IS DISTINCT FROM v_task_id
      OR v_verified.current_plan_version_id IS DISTINCT FROM v_expected_plan_id
      OR v_verified.activated_at IS NULL
      OR v_plan.child_accepted_at IS NULL
      OR v_plan.effective_at IS NULL
      OR v_plan.confirmed_source_task_id IS DISTINCT FROM v_task_id
      -- ⚠️ CASE 一定要包在括號裡。PL/pgSQL 讀 IF 的條件時會讀到**第一個
      --    paren depth 0 的 THEN** 為止 —— 裸 CASE 的內層 THEN 會把條件
      --    提前結束，整支 function 連建都建不起來（42601 syntax error at
      --    end of input），而錯誤位置還會指到幾十行以外的地方。
      --    （legacy accept 那一支也踩過同一顆地雷，註解在 20260815。）
      OR v_plan.confirmed_coin_amount IS DISTINCT FROM (
         CASE WHEN v_plan.reward_policy = 'coin_eligible' THEN v_coin_ref ELSE NULL END)
      -- **沒有新增一版**。接受是 lifecycle，不是內容修訂。
      OR EXISTS (
        SELECT 1 FROM child_proposal_plan_versions v
         WHERE v.proposal_id = v_proposal.id AND v.version_no > v_plan.version_no
      )
      -- 孩子那一份 canonical 計畫仍然原封不動。
      OR NOT EXISTS (
        SELECT 1 FROM child_proposal_plan_versions c
         WHERE c.id = v_root.id
           AND c.authored_by = 'child'
           AND c.child_confirmed_plan IS NOT DISTINCT FROM v_root.child_confirmed_plan
           AND c.plan_title IS NOT DISTINCT FROM v_root.plan_title
           AND c.next_step IS NOT DISTINCT FROM v_root.next_step
           AND c.source_planning_session_id IS NOT DISTINCT FROM v_root.source_planning_session_id
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'child accept verification failed',
        DETAIL = jsonb_build_object(
          'ok', false, 'code', 'PERSISTENCE_FAILED',
          'reason', 'ACCEPT_VERIFICATION_FAILED', 'message', '共同計畫建立後驗證失敗'
        )::text;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'proposalId', v_proposal.id,
      'planVersionId', v_expected_plan_id,
      'childPlanVersionId', v_root.id,
      'status', 'active',
      'activated', true,
      'taskId', v_task_id,
      'relatedIds', COALESCE(v_create_result -> 'relatedIds', '[]'::jsonb),
      'requiresParentDecision', '[]'::jsonb,
      'confirmedReward', v_transition_result -> 'confirmedReward',
      'idempotentReplay', COALESCE((v_create_result ->> 'idempotentReplay')::boolean, false));
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_failure_text = PG_EXCEPTION_DETAIL;
    RETURN COALESCE(v_failure_text::jsonb, jsonb_build_object(
      'ok', false, 'code', 'PERSISTENCE_FAILED', 'reason', 'ACCEPT_TRANSACTION_FAILED',
      'message', '你的回覆沒有完整存下來，再試一次'));
  END;
END;
$$;

COMMENT ON FUNCTION public.accept_child_planning_terms_v1(jsonb) IS
  'P1-A4B2：孩子接受家長提出的共同條件。共同條件都齊了才建立正式任務；'
  '還有未決項目時只記下他同意這一輪並回 proposed，不建任務、不填 child_accepted_at。'
  'accept_child_proposal_plan_v1 的 sibling（那一支服務 P0，一個字都沒改）。';


-- ── 4. 孩子想再調整 ──────────────────────────────────────────────────────
--
-- 與「同意這一輪」都會回到 proposed，但那是兩件完全不同的事。
-- 差別記在 action 那一欄，不是靠猜 reason 的語氣。

CREATE OR REPLACE FUNCTION public.request_child_planning_term_changes_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal     child_proposals%ROWTYPE;
  v_plan         child_proposal_plan_versions%ROWTYPE;
  v_latest_event child_proposal_status_events%ROWTYPE;
  v_root_id      uuid;
  v_expected_plan_id uuid;
  v_reason       text;
  v_transition_result jsonb;
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本');
  END IF;

  -- 這一步不是編輯器。孩子說「我想改成睡前」是一句話，不是一個新版本 ——
  -- 讓他在這裡直接填欄位，同一個畫面就會同時是 review、edit、與建立新版本。
  IF p_command ?| ARRAY[
       'cadenceMode', 'cadenceWeeklyFrequency', 'cadenceDays', 'preferredTime',
       'estimatedMinutes', 'durationDays', 'sharedTerms', 'rewardChoice',
       'planTitle', 'planSummary', 'nextStep', 'childConfirmedPlan'
     ] THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'REVIEW_IS_NOT_AN_EDITOR',
      'message', '這一步只能說說想法，安排由爸媽下一輪再調整');
  END IF;

  v_expected_plan_id := NULLIF(p_command ->> 'expectedPlanVersionId', '')::uuid;
  v_reason := NULLIF(btrim(COALESCE(p_command ->> 'reason', '')), '');
  IF NULLIF(p_command ->> 'proposalId', '') IS NULL OR v_expected_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId 或 expectedPlanVersionId');
  END IF;
  IF v_reason IS NOT NULL AND char_length(v_reason) > 120 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'REASON_TOO_LONG',
      'message', '想說的話請控制在 120 字以內');
  END IF;

  SELECT * INTO v_proposal FROM child_proposals
   WHERE id = (p_command ->> 'proposalId')::uuid FOR UPDATE;
  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: proposal is not visible to the caller'
      USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

  -- 冪等：最後一筆事件正是「他想再調整」而且同一版、同一句話。
  IF v_proposal.status = 'proposed'
    AND v_proposal.current_plan_version_id IS NOT DISTINCT FROM v_expected_plan_id THEN
    SELECT * INTO v_latest_event FROM child_proposal_status_events
     WHERE proposal_id = v_proposal.id
     ORDER BY created_at DESC, id DESC LIMIT 1;
    IF v_latest_event.from_status = 'needs_child_review'
      AND v_latest_event.to_status = 'proposed'
      AND v_latest_event.actor_role = 'child'
      AND v_latest_event.plan_version_id IS NOT DISTINCT FROM v_expected_plan_id
      AND v_latest_event.action = 'requested_shared_term_changes'
      AND v_latest_event.reason IS NOT DISTINCT FROM v_reason THEN
      RETURN jsonb_build_object(
        'ok', true, 'proposalId', v_proposal.id, 'planVersionId', v_expected_plan_id,
        'status', 'proposed', 'idempotentReplay', true);
    END IF;
  END IF;

  IF v_proposal.status <> 'needs_child_review' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'PROPOSAL_NOT_IN_REVIEW',
      'message', '這份安排目前不在等你看看');
  END IF;
  IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'STALE_PLAN_VERSION', 'reason', 'STALE_PLAN_VERSION',
      'message', '安排剛剛更新了，重新看看就好');
  END IF;
  IF v_proposal.task_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'reason', 'REVIEW_MUST_NOT_HAVE_TASK',
      'message', '已經有正式任務的提案不走這一步');
  END IF;

  SELECT * INTO v_plan FROM child_proposal_plan_versions
   WHERE id = v_expected_plan_id AND proposal_id = v_proposal.id;
  IF v_plan.id IS NULL OR v_plan.authored_by <> 'parent'
    OR v_plan.requires_child_review IS DISTINCT FROM TRUE
    OR v_plan.adopted_from_plan_version_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'PLAN_NOT_REVIEWABLE',
      'message', '目前版本不是等你看看的家庭安排');
  END IF;

  WITH RECURSIVE chain AS (
    SELECT v.id, v.adopted_from_plan_version_id, v.authored_by,
           v.source_planning_session_id, v.child_confirmed_plan, 0 AS depth
      FROM child_proposal_plan_versions v
     WHERE v.id = v_expected_plan_id
    UNION ALL
    SELECT p.id, p.adopted_from_plan_version_id, p.authored_by,
           p.source_planning_session_id, p.child_confirmed_plan, chain.depth + 1
      FROM chain
      JOIN child_proposal_plan_versions p ON p.id = chain.adopted_from_plan_version_id
     WHERE chain.depth < 20
  )
  SELECT chain.id INTO v_root_id FROM chain
   WHERE chain.authored_by = 'child'
     AND chain.source_planning_session_id IS NOT NULL
     AND chain.child_confirmed_plan IS NOT NULL
   ORDER BY chain.depth DESC LIMIT 1;

  IF v_root_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'reason', 'NOT_CHILD_PLANNING_LINEAGE',
      'message', '這份安排不是從你自己的計畫來的');
  END IF;

  v_transition_result := public.transition_child_proposal_v1(jsonb_strip_nulls(
    jsonb_build_object(
      'schemaVersion', 1,
      'proposalId', v_proposal.id,
      'toStatus', 'proposed',
      'actorRole', 'child',
      'action', 'requested_shared_term_changes',
      -- 孩子那句話留在事件上。**不寫進 canonical child plan**，
      -- 也不改家長那一版 —— 他說的是想法，不是新的約定。
      'reason', v_reason
    )));
  IF COALESCE((v_transition_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_transition_result;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'proposalId', v_proposal.id, 'planVersionId', v_expected_plan_id,
    'status', 'proposed', 'idempotentReplay', false);
END;
$$;

COMMENT ON FUNCTION public.request_child_planning_term_changes_v1(jsonb) IS
  'P1-A4B2：孩子想再和家長談共同條件 → 回 proposed，不建任務、不改任何版本內容。'
  'request_child_proposal_changes_v1 的 sibling（那一支服務 P0，一個字都沒改）。';


-- ── 5. 權限 ───────────────────────────────────────────────────────────────

REVOKE ALL ON child_proposal_status_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON child_proposal_status_events TO authenticated;

REVOKE ALL ON FUNCTION public.accept_child_planning_terms_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_child_planning_terms_v1(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.request_child_planning_term_changes_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_child_planning_term_changes_v1(jsonb) TO authenticated;
