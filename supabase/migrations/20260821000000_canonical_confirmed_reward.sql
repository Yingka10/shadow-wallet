-- P0 correctness follow-up：confirmedReward 回應改為讀回持久化的共同版本快照。
--
-- 工單：docs/P0_FOLLOWUP_CONFIRMED_REWARD_RESPONSE.md
--
-- ── 問題 ────────────────────────────────────────────────────────────────────
--
-- 20260819 / 20260820 之後，快照的 payout semantics 由 trigger 以 tasks 為
-- canonical truth 寫進 child_proposal_plan_versions。但 transition_child_proposal_v1
-- 的 RETURN 仍然用函式內先算好的區域變數：
--
--   v_payout_basis := public.child_proposal_payout_basis(v_task.claim_period);
--   ...
--   'payoutBasis', v_payout_basis      ← 推導值，不是資料列上的值
--
-- 於是一筆 long_term + fixed_days 的計畫：資料列是 per_period（對），
-- 回應是 per_completion（錯）。**紀錄是對的，回應是錯的。**
--
-- 而且它會傳播：confirm_child_proposal_v1 與 accept_child_proposal_plan_v1
-- 在第一次成功時是把 transition 的結果整包轉出去的
-- （'confirmedReward', v_transition_result -> 'confirmedReward'），
-- 但它們的 idempotent replay 分支卻是從版本列讀的。
-- 結果是**第一次的回應與重試的回應不一樣** —— 而 replay 存在的意義正是兩者要一樣。
--
-- ── 這支 migration 保證的事 ─────────────────────────────────────────────────
--
--   第一次成功的 response = idempotent replay 的 response = 持久化的快照
--
--   payoutBasis       = child_proposal_plan_versions.confirmed_payout_basis
--   periodTargetCount = child_proposal_plan_versions.confirmed_period_target_count
--
-- 不再從 claim_period 推導。
--
-- ── 為什麼這次真的要 forward-derive 三支函式 ────────────────────────────────
--
-- 前三輪（20260818 / 20260819 / 20260820）都刻意避開衍生大型函式，改用
-- trigger —— 因為 20260818 差點用衍生法把 P0-8G 的 material 欄位清單洗回舊版。
-- 但這次要改的是**函式的回傳值**，trigger 攔不到 RETURN。PL/pgSQL 也沒有
-- 「只替換函式的一段」這種東西，所以只能整支 CREATE OR REPLACE。
--
-- 降風險的做法：
--   1. 三支函式**自定義以來都只定義過一次**（20260810 / 20260813 / 20260815），
--      之後沒有任何 migration 動過它們。已用全 migration 搜尋確認 ——
--      這是本輪可以衍生的全部前提，不成立就不該做。
--   2. 函式原文**不手抄**。由 scripts 從原始 migration 讀出、只做三處精確字串
--      替換，任何一處沒命中就中止；並在產生時檢查衍生結果仍帶著
--      assert_child_in_caller_family、狀態機檢查與快照複製那幾道防線。
--   3. contract test 釘住這些不變式。
--
-- ── 不做的事 ────────────────────────────────────────────────────────────────
--
--   * 不改 20260818 / 20260819 / 20260820（都已在 staging 套用並驗證過）。
--   * 不 backfill，不動任何既有 confirmed 版本列。
--   * 不改回應以外的任何行為：三支函式的授權、狀態機、快照複製邏輯逐字不變。

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. 回應形狀的唯一來源
--
-- 抽成函式而不是在三個地方各寫一份 jsonb_build_object：那正是這個 bug 的
-- 成因。三份手寫的形狀，其中一份加了欄位、另外兩份沒加，就是「第一次與
-- replay 不一樣」。形狀只有一份，就不可能分岔。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.child_proposal_confirmed_reward_v1(
  p_plan_version_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN v.confirmed_at IS NULL THEN NULL ELSE jsonb_build_object(
    'rewardPolicy',        v.confirmed_reward_policy,
    'coinAmount',          v.confirmed_coin_amount,
    -- canonical payout semantics。這兩個鍵是本輪的重點：
    -- 它們的值是 snapshot_canonical_payout_basis_v1 實際寫進這一列的東西，
    -- 不是任何呼叫端從 claim_period 推導出來的。
    'payoutBasis',         v.confirmed_payout_basis,
    'periodTargetCount',   v.confirmed_period_target_count,
    -- claim 規則是另一個維度，照樣回傳，但它不決定上面兩個鍵。
    -- 見 docs/CLAIM_PERIOD_VS_PAYOUT_BASIS.md。
    'claimPeriod',         v.confirmed_claim_period,
    'maxClaimsPerPeriod',  v.confirmed_max_claims_per_period,
    'rewardPolicyVersion', v.confirmed_reward_policy_version,
    'taskPolicyVersion',   v.confirmed_task_policy_version,
    'sourceTaskId',        v.confirmed_source_task_id
  ) END
  FROM child_proposal_plan_versions v
  WHERE v.id = p_plan_version_id;
$$;

COMMENT ON FUNCTION public.child_proposal_confirmed_reward_v1(uuid) IS
  '共同確認回饋快照的 API 形狀，**唯一來源**。每個值都從 '
  'child_proposal_plan_versions 那一列讀，不接受呼叫端傳值、也不重新推導。'
  '快照尚未成立（confirmed_at IS NULL）時回 NULL。'
  'payoutBasis / periodTargetCount 是 canonical payout semantics，'
  '**不得改回從 claim_period 推導** —— 那正是本函式存在的理由。';

REVOKE ALL ON FUNCTION public.child_proposal_confirmed_reward_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.child_proposal_confirmed_reward_v1(uuid)
  TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. 三支寫入 / 回應路徑改讀同一個形狀
--
-- 以下三支函式的內容由 scripts 從原始 migration 衍生，只換了 confirmedReward
-- 的組法。其餘每一行 —— 授權、狀態機、快照複製、錯誤碼 —— 都與原始定義逐字相同。
-- ═══════════════════════════════════════════════════════════════════════════

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
    (proposal_id, from_status, to_status, actor_role, actor_user_id, plan_version_id, reason)
  VALUES
    (v_proposal_id, v_from, v_to, v_actor, auth.uid(), v_current_ver, v_reason);

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


CREATE OR REPLACE FUNCTION public.confirm_child_proposal_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal child_proposals%ROWTYPE;
  v_plan child_proposal_plan_versions%ROWTYPE;
  v_parent_plan child_proposal_plan_versions%ROWTYPE;
  v_verified child_proposals%ROWTYPE;
  v_expected_plan_id uuid;
  v_parent_plan_id uuid;
  v_task_id uuid;
  v_start_date date;
  v_end_date date;
  v_now timestamptz := now();
  v_decision jsonb;
  v_task_command jsonb;
  v_create_result jsonb;
  v_transition_result jsonb;
  v_failure_text text;
  v_related jsonb;
  v_next_version int;
  v_purpose text;
  v_completion_policy text;
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本'
    );
  END IF;

  v_expected_plan_id := NULLIF(p_command ->> 'expectedPlanVersionId', '')::uuid;
  IF NULLIF(p_command ->> 'proposalId', '') IS NULL OR v_expected_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId 或 expectedPlanVersionId'
    );
  END IF;

  -- This block is a PL/pgSQL subtransaction. Converting an inner {ok:false}
  -- into P0001 rolls back every write in the block before returning its JSON.
  BEGIN
    SELECT * INTO v_proposal
      FROM child_proposals
     WHERE id = (p_command ->> 'proposalId')::uuid
     FOR UPDATE;

    IF v_proposal.id IS NULL THEN
      RAISE EXCEPTION 'Not authorized: proposal is not visible to the caller'
        USING ERRCODE = '42501';
    END IF;
    PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

    -- Network retry / double click after commit: the lineage is the proof that
    -- this is the same confirmation, not an arbitrary active proposal.
    IF v_proposal.status = 'active' THEN
      SELECT * INTO v_parent_plan
        FROM child_proposal_plan_versions
       WHERE id = v_proposal.current_plan_version_id
         AND proposal_id = v_proposal.id
         AND authored_by = 'parent'
         AND adopted_from_plan_version_id = v_expected_plan_id;

      IF v_parent_plan.id IS NULL OR v_proposal.task_id IS NULL
        OR v_parent_plan.confirmed_source_task_id IS DISTINCT FROM v_proposal.task_id THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'STALE_PLAN_VERSION',
          'reason', 'STALE_PLAN_VERSION', 'message', '這份提案已由另一個版本確認'
        );
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
        'ok', true,
        'proposalId', v_proposal.id,
        'planVersionId', v_parent_plan.id,
        'taskId', v_proposal.task_id,
        'relatedIds', v_related,
        -- 與第一次成功用同一支函式組同一個形狀。
        -- 原本這裡逐欄手寫，於是新增 periodTargetCount 之後 replay 的回應
        -- 就少一個鍵 —— 而 idempotent replay 存在的意義正是「重試拿到跟
        -- 第一次一樣的答案」。逐欄手寫兩份必然會分岔，這裡不再手寫。
        'confirmedReward', public.child_proposal_confirmed_reward_v1(v_parent_plan.id),
        'idempotentReplay', true
      );
    END IF;

    IF v_proposal.status <> 'proposed' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'PROPOSAL_NOT_PROPOSED', 'message', '只有待一起確認的提案可以建立共同計畫'
      );
    END IF;

    IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'STALE_PLAN_VERSION',
        'reason', 'STALE_PLAN_VERSION', 'message', 'GrowBook 計畫已更新，請重新整理後再確認'
      );
    END IF;

    SELECT * INTO v_plan
      FROM child_proposal_plan_versions
     WHERE id = v_expected_plan_id AND proposal_id = v_proposal.id;

    IF v_plan.id IS NULL OR v_plan.authored_by <> 'ai' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'PLAN_NOT_CONFIRMABLE', 'message', '目前版本不是可採用的 GrowBook 計畫'
      );
    END IF;

    IF COALESCE(btrim(v_plan.plan_title), '') = ''
      OR v_plan.purpose_category IS NULL
      OR COALESCE(btrim(v_plan.completion_description), '') = ''
      OR COALESCE(btrim(v_plan.next_step), '') = ''
      OR v_plan.duration_type IS NULL
      OR (v_plan.duration_type = 'long_term'
          AND (v_plan.duration_days IS NULL OR v_plan.duration_days <= 0))
      OR v_plan.cadence_mode IS NULL
      OR v_plan.estimated_minutes IS NULL OR v_plan.estimated_minutes <= 0
      OR v_plan.reward_policy IS NULL
      OR v_plan.reward_eligibility <> 'allowed'
      OR COALESCE(btrim(v_plan.reward_policy_version), '') = ''
      OR COALESCE(btrim(v_plan.task_policy_version), '') = '' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'PLAN_NOT_CONFIRMABLE', 'message', 'GrowBook 計畫缺少正式任務需要的結構化資料'
      );
    END IF;

    IF v_plan.cadence_mode = 'weekly_frequency' AND (
      v_plan.progress_model IS DISTINCT FROM 'weekly_rhythm'
      OR v_plan.cadence_weekly_frequency IS NULL
      OR v_plan.cadence_weekly_frequency NOT BETWEEN 1 AND 7
      OR v_plan.cadence_days IS NOT NULL
    ) THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'WEEKLY_RHYTHM_INVALID', 'message', '彈性每週節奏資料不完整'
      );
    END IF;

    IF v_plan.cadence_mode NOT IN ('weekly_frequency', 'fixed_days', 'one_time') THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'PLAN_NOT_CONFIRMABLE', 'message', '目前排程模式尚不能直接確認'
      );
    END IF;

    v_decision := p_command -> 'rewardDecision';
    IF v_decision IS NULL
      OR v_decision ->> 'eligibility' IS DISTINCT FROM 'allowed'
      OR v_decision ->> 'rewardPolicy' IS DISTINCT FROM v_plan.reward_policy
      OR v_decision ->> 'rewardPolicyVersion' IS DISTINCT FROM v_plan.reward_policy_version THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED',
        'reason', 'POLICY_CHANGED', 'message', '回饋政策已更新，請重新整理後再確認'
      );
    END IF;

    IF v_plan.purpose_category = 'B' AND v_plan.reward_policy = 'coin_eligible' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED',
        'reason', 'POLICY_CHANGED', 'message', '家庭參與目前不能建立成成長幣任務'
      );
    END IF;

    IF v_plan.reward_policy = 'coin_eligible' THEN
      IF v_plan.ai_suggested_coin_amount IS NULL
        OR NULLIF(v_decision -> 'coin' ->> 'suggestedAmount', '')::int
             IS DISTINCT FROM v_plan.ai_suggested_coin_amount
        OR NULLIF(v_decision -> 'coin' ->> 'finalAmount', '')::int
             IS DISTINCT FROM v_plan.ai_suggested_coin_amount THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'POLICY_CHANGED',
          'reason', 'POLICY_CHANGED', 'message', '顯示的成長幣建議已不是目前政策結果'
        );
      END IF;
    ELSIF v_plan.ai_suggested_coin_amount IS NOT NULL
      OR v_decision -> 'coin' IS DISTINCT FROM 'null'::jsonb THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED',
        'reason', 'POLICY_CHANGED', 'message', '不發幣的計畫帶有不一致幣值'
      );
    END IF;

    v_start_date := timezone('Asia/Taipei', now())::date;
    v_end_date := CASE
      WHEN v_plan.duration_days IS NOT NULL
        THEN v_start_date + (v_plan.duration_days - 1)
      ELSE NULL
    END;
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next_version
      FROM child_proposal_plan_versions WHERE proposal_id = v_proposal.id;

    INSERT INTO child_proposal_plan_versions (
      proposal_id, version_no, authored_by, author_user_id,
      plan_title, plan_summary,
      purpose_category, completion_description, progress_model, next_step,
      cadence_mode, cadence_weekly_frequency, cadence_days,
      preferred_time, preferred_time_custom, estimated_minutes,
      duration_type, duration_days, start_date, end_date,
      reward_policy, reward_eligibility, reward_policy_version, task_policy_version,
      ai_snapshot, ai_model, ai_request_id, ai_suggested_coin_amount,
      adopted_from_plan_version_id,
      requires_child_review, parent_confirmed_at, effective_at
    ) VALUES (
      v_proposal.id, v_next_version, 'parent', auth.uid(),
      v_plan.plan_title, v_plan.plan_summary,
      v_plan.purpose_category, v_plan.completion_description,
      v_plan.progress_model, v_plan.next_step,
      v_plan.cadence_mode, v_plan.cadence_weekly_frequency, v_plan.cadence_days,
      v_plan.preferred_time, v_plan.preferred_time_custom, v_plan.estimated_minutes,
      v_plan.duration_type, v_plan.duration_days, v_start_date, v_end_date,
      v_plan.reward_policy, v_plan.reward_eligibility,
      v_plan.reward_policy_version, v_plan.task_policy_version,
      v_plan.ai_snapshot, v_plan.ai_model,
      NULL, v_plan.ai_suggested_coin_amount,
      v_expected_plan_id,
      false, v_now, v_now
    ) RETURNING id INTO v_parent_plan_id;

    UPDATE child_proposal_plan_versions
       SET superseded_at = v_now
     WHERE proposal_id = v_proposal.id AND id <> v_parent_plan_id
       AND superseded_at IS NULL;
    UPDATE child_proposals
       SET current_plan_version_id = v_parent_plan_id
     WHERE id = v_proposal.id;

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
      -- firstReviewAfterDays 不可以是 0：long_term_goals_first_review_check
      -- 要求 NULL 或 > 0，而 create_parent_task_core_v1 是原樣寫進去的
      -- （NULLIF(…, '') 只擋空字串，擋不掉 0）。0 的話每一次長期計畫的
      -- 確認都會在最內層失敗、整筆回滾，家長只看到「建立共同計畫失敗」。
      -- 7 與家長抽屜的 DRAFT_FALLBACKS.firstReviewDays 同值；夾住不超過
      -- 計畫長度，因為 duration_days 可以小到 1 天。
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

    v_transition_result := public.transition_child_proposal_v1(jsonb_build_object(
      'schemaVersion', 1,
      'proposalId', v_proposal.id,
      'toStatus', 'active',
      'actorRole', 'parent',
      'taskId', v_task_id
    ));
    IF COALESCE((v_transition_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'proposal activation failed', DETAIL = v_transition_result::text;
    END IF;

    SELECT * INTO v_verified FROM child_proposals WHERE id = v_proposal.id;
    SELECT * INTO v_parent_plan
      FROM child_proposal_plan_versions WHERE id = v_parent_plan_id;
    IF v_verified.status <> 'active'
      OR v_verified.task_id IS DISTINCT FROM v_task_id
      OR v_verified.current_plan_version_id IS DISTINCT FROM v_parent_plan_id
      OR v_verified.activated_at IS NULL
      OR v_parent_plan.confirmed_source_task_id IS DISTINCT FROM v_task_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'confirmation verification failed',
        DETAIL = jsonb_build_object(
          'ok', false, 'code', 'PERSISTENCE_FAILED',
          'reason', 'CONFIRMATION_VERIFICATION_FAILED',
          'message', '共同計畫建立後驗證失敗'
        )::text;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'proposalId', v_proposal.id,
      'planVersionId', v_parent_plan_id,
      'taskId', v_task_id,
      'relatedIds', COALESCE(v_create_result -> 'relatedIds', '[]'::jsonb),
      'confirmedReward', v_transition_result -> 'confirmedReward',
      'idempotentReplay', COALESCE((v_create_result ->> 'idempotentReplay')::boolean, false)
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_failure_text = PG_EXCEPTION_DETAIL;
    RETURN v_failure_text::jsonb;
  END;
END;
$$;


CREATE OR REPLACE FUNCTION public.accept_child_proposal_plan_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal child_proposals%ROWTYPE;
  v_plan child_proposal_plan_versions%ROWTYPE;
  v_verified child_proposals%ROWTYPE;
  v_expected_plan_id uuid;
  v_task_id uuid;
  v_start_date date;
  v_end_date date;
  v_decision jsonb;
  v_task_command jsonb;
  v_create_result jsonb;
  v_transition_result jsonb;
  v_failure_text text;
  v_related jsonb;
  v_purpose text;
  v_completion_policy text;
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本'
    );
  END IF;
  v_expected_plan_id := NULLIF(p_command ->> 'expectedPlanVersionId', '')::uuid;
  IF NULLIF(p_command ->> 'proposalId', '') IS NULL OR v_expected_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId 或 expectedPlanVersionId'
    );
  END IF;

  -- A controlled P0001 turns any nested RPC failure into a rollback of this
  -- subtransaction before its typed JSON detail is returned.
  BEGIN
    SELECT * INTO v_proposal
      FROM child_proposals
     WHERE id = (p_command ->> 'proposalId')::uuid
     FOR UPDATE;
    IF v_proposal.id IS NULL THEN
      RAISE EXCEPTION 'Not authorized: proposal is not visible to the caller'
        USING ERRCODE = '42501';
    END IF;
    PERFORM public.assert_child_in_caller_family(v_proposal.child_id);

    SELECT * INTO v_plan
      FROM child_proposal_plan_versions
     WHERE id = v_proposal.current_plan_version_id
       AND proposal_id = v_proposal.id;

    -- Retry after a successful accept is decided before the normal review-state
    -- guard. The accepted current version and its task snapshot are the proof.
    IF v_proposal.status = 'active' THEN
      IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id
        OR v_plan.id IS NULL
        OR v_plan.authored_by <> 'parent'
        OR v_plan.requires_child_review IS DISTINCT FROM TRUE
        OR v_proposal.task_id IS NULL
        OR v_plan.confirmed_source_task_id IS DISTINCT FROM v_proposal.task_id
        OR v_plan.child_accepted_at IS NULL
        OR v_plan.effective_at IS NULL THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'STALE_PLAN_VERSION',
          'reason', 'STALE_PLAN_VERSION', 'message', '這份提案已由另一個版本成立'
        );
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
        'taskId', v_proposal.task_id, 'relatedIds', v_related,
        -- 同 confirm_child_proposal_v1 的 replay 分支：同一支函式、同一個形狀。
        'confirmedReward', public.child_proposal_confirmed_reward_v1(v_plan.id),
        'idempotentReplay', true
      );
    END IF;

    IF v_proposal.status <> 'needs_child_review' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'PROPOSAL_NOT_IN_REVIEW', 'message', '這份計畫目前不在等孩子確認'
      );
    END IF;
    IF v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'STALE_PLAN_VERSION',
        'reason', 'STALE_PLAN_VERSION', 'message', '計畫已更新，請重新整理後再確認'
      );
    END IF;
    IF v_plan.id IS NULL OR v_plan.authored_by <> 'parent'
      OR v_plan.requires_child_review IS DISTINCT FROM TRUE
      OR v_plan.parent_confirmed_at IS NULL
      OR v_plan.effective_at IS NOT NULL
      OR v_plan.child_accepted_at IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'PLAN_NOT_CONFIRMABLE', 'message', '目前版本不是可由孩子確認的家長調整版'
      );
    END IF;

    IF COALESCE(btrim(v_plan.plan_title), '') = ''
      OR v_plan.purpose_category IS NULL
      OR COALESCE(btrim(v_plan.completion_description), '') = ''
      OR COALESCE(btrim(v_plan.next_step), '') = ''
      OR v_plan.duration_type IS NULL
      OR (v_plan.duration_type = 'long_term'
          AND (v_plan.duration_days IS NULL OR v_plan.duration_days <= 0))
      OR v_plan.cadence_mode NOT IN ('weekly_frequency', 'fixed_days')
      OR v_plan.estimated_minutes IS NULL OR v_plan.estimated_minutes <= 0
      OR v_plan.reward_policy IS NULL
      OR v_plan.reward_eligibility <> 'allowed'
      OR COALESCE(btrim(v_plan.reward_policy_version), '') = ''
      OR COALESCE(btrim(v_plan.task_policy_version), '') = '' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'PLAN_NOT_CONFIRMABLE', 'message', '計畫缺少正式任務需要的結構化資料'
      );
    END IF;
    IF v_plan.cadence_mode = 'weekly_frequency' AND (
      v_plan.cadence_weekly_frequency NOT BETWEEN 1 AND 7
      OR v_plan.cadence_days IS NOT NULL
    ) THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'WEEKLY_RHYTHM_INVALID', 'message', '彈性每週節奏資料不完整'
      );
    ELSIF v_plan.cadence_mode = 'fixed_days' AND (
      v_plan.cadence_weekly_frequency IS NOT NULL
      OR v_plan.cadence_days IS NULL
      OR cardinality(v_plan.cadence_days) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(v_plan.cadence_days) AS day
         WHERE day NOT BETWEEN 0 AND 6
      )
    ) THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'FIXED_DAYS_INVALID', 'message', '固定星期節奏資料不完整'
      );
    END IF;
    -- The CASE must stay parenthesised. PL/pgSQL reads an IF condition up to the
    -- first THEN at paren depth 0, so a bare CASE ends the condition on its own
    -- inner THEN and leaves an unterminated expression — the function then fails
    -- to create at all with 42601 "syntax error at end of input".
    IF v_plan.progress_model IS DISTINCT FROM (CASE
      WHEN v_plan.purpose_category = 'D'
        AND v_plan.duration_type = 'long_term'
        AND v_plan.cadence_mode IN ('weekly_frequency', 'fixed_days')
        THEN 'weekly_rhythm'
      ELSE NULL
    END) THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'reason', 'WEEKLY_RHYTHM_INVALID', 'message', '長期節奏的進度模式與計畫證據不一致'
      );
    END IF;

    v_decision := p_command -> 'rewardDecision';
    IF v_decision IS NULL
      OR v_decision ->> 'eligibility' IS DISTINCT FROM 'allowed'
      OR v_decision ->> 'rewardPolicy' IS DISTINCT FROM v_plan.reward_policy
      OR v_decision ->> 'rewardPolicyVersion' IS DISTINCT FROM v_plan.reward_policy_version THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED',
        'reason', 'POLICY_CHANGED', 'message', '回饋政策已更新，請重新整理後再確認'
      );
    END IF;
    IF v_plan.purpose_category = 'B' AND v_plan.reward_policy = 'coin_eligible' THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED',
        'reason', 'POLICY_CHANGED', 'message', '家庭參與目前不能建立成成長幣任務'
      );
    END IF;
    IF v_plan.reward_policy = 'coin_eligible' THEN
      IF v_plan.ai_suggested_coin_amount IS NULL
        OR NULLIF(v_decision -> 'coin' ->> 'suggestedAmount', '')::int
             IS DISTINCT FROM v_plan.ai_suggested_coin_amount
        OR NULLIF(v_decision -> 'coin' ->> 'finalAmount', '')::int
             IS DISTINCT FROM v_plan.ai_suggested_coin_amount THEN
        RETURN jsonb_build_object(
          'ok', false, 'code', 'POLICY_CHANGED',
          'reason', 'POLICY_CHANGED', 'message', '顯示的成長幣建議已不是目前政策結果'
        );
      END IF;
    ELSIF v_plan.ai_suggested_coin_amount IS NOT NULL
      OR v_decision -> 'coin' IS DISTINCT FROM 'null'::jsonb THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_CHANGED',
        'reason', 'POLICY_CHANGED', 'message', '不發幣的計畫帶有不一致幣值'
      );
    END IF;

    v_start_date := timezone('Asia/Taipei', now())::date;
    v_end_date := CASE
      WHEN v_plan.duration_type = 'long_term'
        THEN v_start_date + (v_plan.duration_days - 1)
      ELSE v_start_date
    END;

    -- Dates are the only plan columns this orchestrator writes. The existing
    -- append-only guard permits lifecycle dates; transition owns all activation
    -- and confirmed reward fields.
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

    -- P0-5A's live wrapper originally admitted weekly_rhythm only for
    -- weekly_frequency. For a canonical fixed-days D/long-term review plan,
    -- create the same canonical rows without that wrapper-only flag, then apply
    -- the deterministic P0-3 rhythm mapping inside this transaction.
    v_create_result := public.create_parent_task_v1(
      CASE
        WHEN v_plan.cadence_mode = 'fixed_days'
          AND v_plan.progress_model = 'weekly_rhythm'
          THEN v_task_command - 'progressModel'
        ELSE v_task_command
      END
    );
    IF COALESCE((v_create_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'canonical task creation failed', DETAIL = v_create_result::text;
    END IF;
    v_task_id := NULLIF(v_create_result ->> 'taskId', '')::uuid;

    IF v_plan.cadence_mode = 'fixed_days'
      AND v_plan.progress_model = 'weekly_rhythm' THEN
      UPDATE tasks
         SET progress_model = 'weekly_rhythm', long_term_type = 'habit'
       WHERE id = v_task_id;
      UPDATE long_term_goals
         SET goal_type = 'habit'
       WHERE task_id = v_task_id;
      UPDATE task_change_events
         SET snapshot = jsonb_set(
           snapshot, '{command,progressModel}', to_jsonb('weekly_rhythm'::text), true
         )
       WHERE task_id = v_task_id
         AND event_type = 'created_from_child_proposal';
    END IF;

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

    SELECT * INTO v_verified FROM child_proposals WHERE id = v_proposal.id;
    SELECT * INTO v_plan FROM child_proposal_plan_versions WHERE id = v_expected_plan_id;
    IF v_verified.status <> 'active'
      OR v_verified.task_id IS DISTINCT FROM v_task_id
      OR v_verified.current_plan_version_id IS DISTINCT FROM v_expected_plan_id
      OR v_verified.activated_at IS NULL
      OR v_plan.start_date IS DISTINCT FROM v_start_date
      OR v_plan.end_date IS DISTINCT FROM v_end_date
      OR v_plan.effective_at IS NULL
      OR v_plan.child_accepted_at IS NULL
      OR v_plan.confirmed_source_task_id IS DISTINCT FROM v_task_id
      OR (
        v_plan.cadence_mode = 'fixed_days'
        AND v_plan.progress_model = 'weekly_rhythm'
        AND NOT EXISTS (
          SELECT 1
            FROM tasks t
            JOIN long_term_goals g ON g.task_id = t.id
           WHERE t.id = v_task_id
             AND t.progress_model = 'weekly_rhythm'
             AND t.long_term_type = 'habit'
             AND g.goal_type = 'habit'
        )
      ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'accept verification failed',
        DETAIL = jsonb_build_object(
          'ok', false, 'code', 'PERSISTENCE_FAILED',
          'reason', 'ACCEPT_VERIFICATION_FAILED', 'message', '共同計畫建立後驗證失敗'
        )::text;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'proposalId', v_proposal.id,
      'planVersionId', v_expected_plan_id,
      'taskId', v_task_id,
      'relatedIds', COALESCE(v_create_result -> 'relatedIds', '[]'::jsonb),
      'confirmedReward', v_transition_result -> 'confirmedReward',
      'idempotentReplay', COALESCE((v_create_result ->> 'idempotentReplay')::boolean, false)
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_failure_text = PG_EXCEPTION_DETAIL;
    RETURN v_failure_text::jsonb;
  END;
END;
$$;

COMMIT;
