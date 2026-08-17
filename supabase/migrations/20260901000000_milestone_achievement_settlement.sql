-- P1-M1A：Canonical Milestone Reward — Agreement / Achievement / Settlement 三層模型。
--
-- 三個概念刻意分成三張表，不合併：
--   milestone_agreements   —— 說好的這一站是什麼（title、criterion、要不要發幣、誰確認的）
--   milestone_achievements —— 孩子真的走到這一站了（canonical fact，不論有沒有幣）
--   milestone_settlements  —— 因為這次 achievement，+N 有沒有真的入帳
--
-- 少了 achievement 這一層，一個沒有幣的 milestone（reward_coin_amount IS NULL）
-- 就永遠沒有 persisted completion state —— Next Stop 從「第一站」走到「第二站」
-- 這件事無從判斷。
--
-- Achievement 與 Settlement 拆成兩支獨立 trigger，不是一支大 trigger 裡順著做完：
--   task_completions      AFTER INSERT → evaluate_milestone_achievements_v1()（只寫 achievement）
--   milestone_achievements AFTER INSERT → settle_milestone_reward_v1()（只處理 optional reward）
-- 理由：AFTER INSERT ROW trigger 在 Postgres 裡對「真的被 insert 的那一列」精確觸發一次 ——
-- ON CONFLICT DO NOTHING 沒有真的 insert 就不會 fire。所以 settle_milestone_reward_v1()
-- 收到的 NEW 保證是一筆全新的 achievement，不需要自己再猜一次「這是不是重複」。
-- 這比在同一支函式裡用一個旗標手動判斷「剛剛是不是真的 insert 到」更難寫錯。
-- 兩支都跑在同一個外層 transaction 裡（沒有要做到 transaction isolation ——
-- 那需要 dblink / 非同步佇列，這次不做那麼大的變動），但函式邊界清楚切開，
-- 每一支只做一件事、只在自己那件事失敗時才可能讓整個 completion rollback。

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. milestone_agreements —— 說好的這一站
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS milestone_agreements (
  id                             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id                        uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  goal_id                        uuid        NOT NULL REFERENCES long_term_goals(id) ON DELETE CASCADE,

  title                          text        NOT NULL,
  note                           text,

  -- criterion 在建立當下就 snapshot，不從 task 當下的 weekly_frequency 重新推導。
  -- {"type":"weekly_rhythm_window","segment_start_at":"2026-08-17T00:00:00+08:00",
  --  "week_count":2,"target_per_week":3,"timezone":"Asia/Taipei"}
  -- week 邊界與 src/lib/longTerm/weeklyProgress.ts 的 taipeiWeekStart()（Asia/Taipei、
  -- 週一起算）同一套語意 —— segment_start_at 建立時就對齊到週一，不讓 DB 另外發明
  -- 一套算法、也不讓 UI 用一種、trigger 用另一種。
  completion_criterion           jsonb       NOT NULL,

  reward_coin_amount             integer,
  agreement_source                text        NOT NULL,
  parent_confirmed_at            timestamptz,
  parent_confirmed_by_parent_id  uuid REFERENCES parents(id),
  effective_at                   timestamptz NOT NULL,
  effective_plan_version_id      uuid REFERENCES child_proposal_plan_versions(id) ON DELETE SET NULL,

  supersedes_milestone_id        uuid REFERENCES milestone_agreements(id),
  superseded_at                  timestamptz,

  created_at                     timestamptz NOT NULL DEFAULT now(),

  -- reward-bearing agreement 一定要有「誰、什麼時候確認的」，兩者缺一不可 ——
  -- parent_confirmed_at 只回答「有沒有人確認」，不回答「是哪個家長」。
  CONSTRAINT milestone_agreements_reward_needs_confirmation CHECK (
    reward_coin_amount IS NULL
    OR (parent_confirmed_at IS NOT NULL AND parent_confirmed_by_parent_id IS NOT NULL)
  ),
  CONSTRAINT milestone_agreements_coin_positive CHECK (
    reward_coin_amount IS NULL OR (reward_coin_amount > 0 AND reward_coin_amount <= 1000)
  ),
  -- agreement_source 是正式產品語意的一部分，不收 demo-only 的建立方式。
  CONSTRAINT milestone_agreements_source_check CHECK (
    agreement_source IN ('parent_direct', 'p1_plan_version')
  ),
  -- p1_plan_version 來源一定要能指出是哪一版；parent_direct 沒有 plan version 可指。
  CONSTRAINT milestone_agreements_lineage_check CHECK (
    (agreement_source = 'p1_plan_version') = (effective_plan_version_id IS NOT NULL)
  )
);

COMMENT ON TABLE milestone_agreements IS
  '一個 long-term goal 的其中一站，是什麼、要不要發幣、誰確認的。'
  '不是 achievement —— 這張表只記「說好的內容」，不記「有沒有走到」。';

COMMENT ON COLUMN milestone_agreements.completion_criterion IS
  '建立當下 snapshot，不隨 task 之後被重新協商的 weekly_frequency 改寫。'
  '目前唯一支援的 type 是 weekly_rhythm_window。其他 type 由 '
  'evaluate_milestone_achievements_v1() 直接跳過（fail closed，不猜、不判定）。';

CREATE INDEX IF NOT EXISTS milestone_agreements_task_idx ON milestone_agreements (task_id)
  WHERE superseded_at IS NULL;

ALTER TABLE milestone_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family members can view milestone agreements" ON milestone_agreements;
CREATE POLICY "family members can view milestone agreements"
  ON milestone_agreements FOR SELECT TO authenticated
  USING (
    goal_id IN (
      SELECT g.id FROM long_term_goals g
      JOIN children c ON c.id = g.child_id
      WHERE c.family_id IN (SELECT p.family_id FROM parents p WHERE p.user_id = auth.uid())
    )
  );

-- 沒有 INSERT/UPDATE/DELETE policy：只透過 create_milestone_agreement_v1()（下面）寫入。
GRANT SELECT ON milestone_agreements TO authenticated;
GRANT ALL    ON milestone_agreements TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. milestone_achievements —— 孩子真的走到這一站了
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS milestone_achievements (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_agreement_id   uuid        NOT NULL REFERENCES milestone_agreements(id) ON DELETE CASCADE,
  child_id                 uuid        NOT NULL REFERENCES children(id) ON DELETE CASCADE,

  -- evidence 屬於 achievement，不屬於 settlement —— 一個沒有幣的 milestone
  -- 也需要留下「怎麼判定達成的」。
  achievement_evidence     jsonb       NOT NULL,
  achieved_at              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (milestone_agreement_id, child_id)
);

COMMENT ON TABLE milestone_achievements IS
  'canonical fact：孩子在這個 milestone_agreement 下走到了這一站。'
  '不論這個 milestone 有沒有幣都會有一列 —— Next Stop 的站與站之間推進、'
  '以及 Review Point，都讀這張表，不讀 settlement。';

CREATE INDEX IF NOT EXISTS milestone_achievements_child_idx ON milestone_achievements (child_id);

ALTER TABLE milestone_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family members can view milestone achievements" ON milestone_achievements;
CREATE POLICY "family members can view milestone achievements"
  ON milestone_achievements FOR SELECT TO authenticated
  USING (
    child_id IN (
      SELECT c.id FROM children c
      WHERE c.family_id IN (SELECT p.family_id FROM parents p WHERE p.user_id = auth.uid())
    )
  );

-- 沒有 INSERT/UPDATE/DELETE policy：只由 evaluate_milestone_achievements_v1() 寫入。
GRANT SELECT ON milestone_achievements TO authenticated;
GRANT ALL    ON milestone_achievements TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. milestone_settlements —— 因為這次 achievement，+N 有沒有真的入帳
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS milestone_settlements (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_achievement_id  uuid        NOT NULL REFERENCES milestone_achievements(id) ON DELETE CASCADE,
  milestone_agreement_id    uuid        NOT NULL REFERENCES milestone_agreements(id) ON DELETE CASCADE,
  child_id                  uuid        NOT NULL REFERENCES children(id) ON DELETE CASCADE,

  coin_amount               integer     NOT NULL,
  -- 允許暫時 NULL：settle_milestone_reward_v1() 先用這張表的 INSERT 本身當
  -- 「這次允許 mint」的 gate，成功後才去動 wallet、建 transactions，再回填這欄。
  -- 這整段都在同一個外層 transaction 裡，要嘛全部一起 commit、要嘛全部一起
  -- rollback，所以不會有「commit 之後仍然是 NULL」的 settlement 列。
  transaction_id            uuid REFERENCES transactions(id) ON DELETE RESTRICT,
  settled_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT milestone_settlements_amount_check CHECK (coin_amount > 0),

  -- 兩條 exactly-once 保證：同一個 achievement 只能結算一次；
  -- 同一個 agreement/child 組合也只能有一筆（雙重保險）。
  UNIQUE (milestone_achievement_id),
  UNIQUE (milestone_agreement_id, child_id)
);

COMMENT ON TABLE milestone_settlements IS
  '因為某一筆 achievement，+N 成長幣是否真的結算過。'
  'achievement_evidence 不重複放在這裡 —— evidence 屬於 achievement，'
  '這張表只負責「這筆錢有沒有真的進帳」。這張表自己的 INSERT（撞到 UNIQUE 就失敗）'
  '才是允不允許 mint 的 gate，不是事後靠 wallet 更新失敗去回滾。';

ALTER TABLE milestone_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family members can view milestone settlements" ON milestone_settlements;
CREATE POLICY "family members can view milestone settlements"
  ON milestone_settlements FOR SELECT TO authenticated
  USING (
    child_id IN (
      SELECT c.id FROM children c
      WHERE c.family_id IN (SELECT p.family_id FROM parents p WHERE p.user_id = auth.uid())
    )
  );

-- 沒有 INSERT/UPDATE/DELETE policy：只由 settle_milestone_reward_v1() 寫入。
GRANT SELECT ON milestone_settlements TO authenticated;
GRANT ALL    ON milestone_settlements TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. evaluate_milestone_achievements_v1() —— task_completions 的 AFTER INSERT trigger
--    只負責判定＋寫 achievement，不碰 wallet / transactions。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.evaluate_milestone_achievements_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agreement       record;
  v_criterion       jsonb;
  v_week_count      int;
  v_target_per_week int;
  v_segment_start   timestamptz;
  v_window_end      timestamptz;
  v_week_start      timestamptz;
  v_week_done       int;
  v_all_weeks_met   boolean;
  i                 int;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  FOR v_agreement IN
    SELECT *
    FROM milestone_agreements
    WHERE task_id = NEW.task_id
      AND superseded_at IS NULL
    ORDER BY effective_at
  LOOP
    -- 已經達成過（不論有沒有幣）就不重複評估。
    IF EXISTS (
      SELECT 1 FROM milestone_achievements
      WHERE milestone_agreement_id = v_agreement.id AND child_id = NEW.child_id
    ) THEN
      CONTINUE;
    END IF;

    v_criterion := v_agreement.completion_criterion;

    IF v_criterion ->> 'type' IS DISTINCT FROM 'weekly_rhythm_window' THEN
      -- 未支援的 criterion type：fail closed，不猜、不判定。
      CONTINUE;
    END IF;

    v_week_count      := (v_criterion ->> 'week_count')::int;
    v_target_per_week := (v_criterion ->> 'target_per_week')::int;
    v_segment_start   := (v_criterion ->> 'segment_start_at')::timestamptz;
    v_window_end      := v_segment_start + (v_week_count * interval '7 days');

    -- 整個 segment 的календар 時間必須已經走完，不能因為 Week 2 提早衝到
    -- target 就宣布「兩週安排走完了」——兩週真的要過完。
    IF now() < v_window_end THEN
      CONTINUE;
    END IF;

    v_all_weeks_met := true;
    FOR i IN 0 .. (v_week_count - 1) LOOP
      v_week_start := v_segment_start + (i * interval '7 days');

      SELECT count(*)
      INTO v_week_done
      FROM task_completions
      WHERE task_id  = NEW.task_id
        AND child_id = NEW.child_id
        AND status   = 'completed'
        AND completed_at >= v_week_start
        AND completed_at <  v_week_start + interval '7 days';

      IF v_week_done < v_target_per_week THEN
        v_all_weeks_met := false;
        EXIT;
      END IF;
    END LOOP;

    IF NOT v_all_weeks_met THEN
      CONTINUE;
    END IF;

    INSERT INTO milestone_achievements (
      milestone_agreement_id, child_id, achievement_evidence, achieved_at
    ) VALUES (
      v_agreement.id, NEW.child_id,
      jsonb_build_object(
        'criterion', v_criterion,
        'windowEnd', v_window_end,
        'evaluatedAt', now(),
        'triggeringCompletionId', NEW.id
      ),
      now()
    )
    ON CONFLICT (milestone_agreement_id, child_id) DO NOTHING;
    -- 這裡不需要再檢查有沒有真的 insert 到列 —— 有的話，milestone_achievements
    -- 自己的 AFTER INSERT trigger 會被觸發一次去處理 settlement；沒有的話
    -- （併發下輸給另一個 request）什麼都不用做，那個 request 會處理。
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.evaluate_milestone_achievements_v1() IS
  '每次 task_completions 新增一筆完成，評估該 task 底下所有未達成的 milestone_agreements。'
  '只寫 achievement，不碰 wallet —— reward 由 milestone_achievements 自己的 '
  'AFTER INSERT trigger（settle_milestone_reward_v1）處理，兩支函式的失敗互不牽連。'
  '未支援的 criterion type、或 segment 尚未走完，都直接跳過。';

DROP TRIGGER IF EXISTS task_completions_evaluate_milestones ON task_completions;
CREATE TRIGGER task_completions_evaluate_milestones
  AFTER INSERT ON task_completions
  FOR EACH ROW EXECUTE FUNCTION public.evaluate_milestone_achievements_v1();


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. settle_milestone_reward_v1() —— milestone_achievements 的 AFTER INSERT trigger
--    NEW 保證是一筆全新的 achievement（ON CONFLICT DO NOTHING 沒有真的 insert
--    就不會觸發這支）。只處理 optional reward，不判定 criterion。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.settle_milestone_reward_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agreement     record;
  v_wallet_id     uuid;
  v_tx_id         uuid;
  v_settlement_id uuid;
BEGIN
  SELECT * INTO v_agreement FROM milestone_agreements WHERE id = NEW.milestone_agreement_id;

  -- 沒有幣的 milestone：achievement 已經寫下了，這支什麼都不用做。
  IF v_agreement.reward_coin_amount IS NULL OR v_agreement.reward_coin_amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- transactions 只是帳本紀錄，這一步本身不動 wallet.balance ——
  -- 讓 milestone_settlements 的 INSERT 先撞看看 UNIQUE，那才是真正允不允許
  -- mint 的 gate；只有它成功插入新列，下面才會真的動錢包。
  INSERT INTO transactions (wallet_id, amount, type, reference_id, reference_type)
  SELECT w.id, v_agreement.reward_coin_amount, 'earn', NEW.id, 'milestone_achievement'
  FROM wallets w
  WHERE w.child_id = NEW.child_id AND w.wallet_type = 'spending'
  RETURNING id, wallet_id INTO v_tx_id, v_wallet_id;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Spending wallet not found for child %', NEW.child_id;
  END IF;

  INSERT INTO milestone_settlements (
    milestone_achievement_id, milestone_agreement_id, child_id, coin_amount, transaction_id
  ) VALUES (
    NEW.id, NEW.milestone_agreement_id, NEW.child_id, v_agreement.reward_coin_amount, v_tx_id
  )
  ON CONFLICT (milestone_achievement_id) DO NOTHING
  RETURNING id INTO v_settlement_id;

  -- 正常情況下這裡一定會拿到新 id（NEW.id 是全新的 achievement，settlement
  -- 不可能已經存在）。萬一真的沒拿到（理論上不會發生的防禦性分支），
  -- 上面那筆 transactions 會變成一筆沒有對應 wallet 異動的孤兒帳本列 ——
  -- 這不是 double mint，只是多一筆不影響餘額的紀錄，寧可如此也不要動錢包
  -- 兩次。真的動錢包只發生在下面這個 IF 裡。
  IF v_settlement_id IS NOT NULL THEN
    UPDATE wallets SET balance = balance + v_agreement.reward_coin_amount WHERE id = v_wallet_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.settle_milestone_reward_v1() IS
  '收到的 NEW 一定是全新 achievement（AFTER INSERT ROW 語意保證）。'
  'milestone_settlements 的 INSERT 是允不允許 mint 的 gate —— 只有它成功插入'
  '新列，才會真的更新 wallet.balance；不是動完錢包才靠 unique violation 回滾。';

DROP TRIGGER IF EXISTS milestone_achievements_settle_reward ON milestone_achievements;
CREATE TRIGGER milestone_achievements_settle_reward
  AFTER INSERT ON milestone_achievements
  FOR EACH ROW EXECUTE FUNCTION public.settle_milestone_reward_v1();


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. create_milestone_agreement_v1() —— 唯一的正式建立入口
--
-- 三張表都沒有 client 可用的 INSERT policy；所有正式建立都走這支 RPC，
-- 不接受「直接 INSERT milestone_agreements 再說它是 canonical」這種捷徑。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_milestone_agreement_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id           uuid := (p_command->>'taskId')::uuid;
  v_goal_id           uuid := (p_command->>'goalId')::uuid;
  v_title             text := p_command->>'title';
  v_note              text := p_command->>'note';
  v_criterion         jsonb := p_command->'completionCriterion';
  v_reward_coin       int  := NULLIF(p_command->>'rewardCoinAmount', '')::int;
  v_agreement_source  text := p_command->>'agreementSource';
  v_plan_version_id   uuid := NULLIF(p_command->>'effectivePlanVersionId', '')::uuid;
  v_supersedes_id     uuid := NULLIF(p_command->>'supersedesMilestoneId', '')::uuid;

  v_calling_parent_id uuid;
  v_family_id         uuid;
  v_goal              record;
  v_plan_version       record;
  v_week_count        int;
  v_target_per_week   int;
  v_segment_raw        timestamptz;
  v_segment_aligned    timestamptz;
  v_agreement_id       uuid;
  v_now                timestamptz := now();
BEGIN
  -- ── 呼叫者必須是這個 task/goal 所屬家庭的家長 ─────────────────────────────
  SELECT p.id, p.family_id INTO v_calling_parent_id, v_family_id
  FROM parents p WHERE p.user_id = auth.uid();

  IF v_calling_parent_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authorized', 'reason', 'caller_is_not_a_parent');
  END IF;

  SELECT g.id, g.task_id, g.child_id, t.family_id
  INTO v_goal
  FROM long_term_goals g
  JOIN tasks t ON t.id = g.task_id
  WHERE g.id = v_goal_id;

  IF v_goal.id IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_goal');
  END IF;

  IF v_goal.task_id IS DISTINCT FROM v_task_id THEN
    RETURN jsonb_build_object('error', 'task_goal_mismatch');
  END IF;

  IF v_goal.family_id IS DISTINCT FROM v_family_id THEN
    RETURN jsonb_build_object('error', 'not_authorized', 'reason', 'wrong_family');
  END IF;

  -- ── criterion 驗證 ─────────────────────────────────────────────────────
  IF v_criterion IS NULL OR v_criterion ->> 'type' IS DISTINCT FROM 'weekly_rhythm_window' THEN
    RETURN jsonb_build_object('error', 'unsupported_criterion_type');
  END IF;

  v_week_count      := NULLIF(v_criterion ->> 'week_count', '')::int;
  v_target_per_week := NULLIF(v_criterion ->> 'target_per_week', '')::int;
  v_segment_raw      := NULLIF(v_criterion ->> 'segment_start_at', '')::timestamptz;

  IF v_week_count IS NULL OR v_week_count NOT BETWEEN 1 AND 8 THEN
    RETURN jsonb_build_object('error', 'invalid_criterion', 'reason', 'week_count');
  END IF;
  IF v_target_per_week IS NULL OR v_target_per_week NOT BETWEEN 1 AND 7 THEN
    RETURN jsonb_build_object('error', 'invalid_criterion', 'reason', 'target_per_week');
  END IF;
  IF v_segment_raw IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_criterion', 'reason', 'segment_start_at');
  END IF;

  -- segment_start_at 一律對齊到 Asia/Taipei 的週一 —— 與
  -- src/lib/longTerm/weeklyProgress.ts 的 taipeiWeekStart() 同一套語意，
  -- 不管呼叫端傳進來的是不是已經對齊過。
  v_segment_aligned := date_trunc('week', v_segment_raw AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei';
  v_criterion := v_criterion || jsonb_build_object(
    'segment_start_at', v_segment_aligned,
    'timezone', 'Asia/Taipei'
  );

  -- ── reward 驗證 ────────────────────────────────────────────────────────
  IF v_reward_coin IS NOT NULL AND (v_reward_coin <= 0 OR v_reward_coin > 1000) THEN
    RETURN jsonb_build_object('error', 'invalid_reward_amount');
  END IF;

  -- ── agreement_source 與確認證據 ───────────────────────────────────────
  IF v_agreement_source NOT IN ('parent_direct', 'p1_plan_version') THEN
    RETURN jsonb_build_object('error', 'invalid_agreement_source');
  END IF;

  IF v_reward_coin IS NOT NULL THEN
    -- reward-bearing：呼叫這支 RPC 的家長本人就是確認人，沒有另外的「確認」動作。
    NULL; -- parent_confirmed_at / by 在下面 INSERT 時一律填入呼叫者，不做額外判斷
  END IF;

  IF v_agreement_source = 'p1_plan_version' THEN
    IF v_plan_version_id IS NULL THEN
      RETURN jsonb_build_object('error', 'missing_plan_version');
    END IF;

    SELECT v.id, v.proposal_id, v.confirmed_source_task_id, cp.child_id
    INTO v_plan_version
    FROM child_proposal_plan_versions v
    JOIN child_proposals cp ON cp.id = v.proposal_id
    WHERE v.id = v_plan_version_id;

    IF v_plan_version.id IS NULL THEN
      RETURN jsonb_build_object('error', 'invalid_plan_version');
    END IF;

    -- 必須是「已經正式確認給這個 task 用」的那一版，不接受任意存在的版本。
    IF v_plan_version.confirmed_source_task_id IS DISTINCT FROM v_task_id THEN
      RETURN jsonb_build_object('error', 'invalid_plan_version', 'reason', 'not_confirmed_for_this_task');
    END IF;

    IF v_plan_version.child_id IS DISTINCT FROM v_goal.child_id THEN
      RETURN jsonb_build_object('error', 'invalid_plan_version', 'reason', 'child_mismatch');
    END IF;
  ELSIF v_plan_version_id IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'invalid_plan_version', 'reason', 'parent_direct_cannot_have_lineage');
  END IF;

  -- ── supersede：append-only，舊版標記 superseded_at，不刪、不改內容 ──────
  IF v_supersedes_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM milestone_agreements
      WHERE id = v_supersedes_id AND task_id = v_task_id AND superseded_at IS NULL
    ) THEN
      RETURN jsonb_build_object('error', 'invalid_supersedes_target');
    END IF;
  END IF;

  -- ── 寫入 ──────────────────────────────────────────────────────────────
  INSERT INTO milestone_agreements (
    task_id, goal_id, title, note, completion_criterion,
    reward_coin_amount, agreement_source,
    parent_confirmed_at, parent_confirmed_by_parent_id,
    effective_at, effective_plan_version_id,
    supersedes_milestone_id
  ) VALUES (
    v_task_id, v_goal_id, v_title, v_note, v_criterion,
    v_reward_coin, v_agreement_source,
    CASE WHEN v_reward_coin IS NOT NULL THEN v_now ELSE NULL END,
    CASE WHEN v_reward_coin IS NOT NULL THEN v_calling_parent_id ELSE NULL END,
    v_now, v_plan_version_id,
    v_supersedes_id
  )
  RETURNING id INTO v_agreement_id;

  IF v_supersedes_id IS NOT NULL THEN
    UPDATE milestone_agreements SET superseded_at = v_now WHERE id = v_supersedes_id;
  END IF;

  RETURN jsonb_build_object('agreementId', v_agreement_id);
END;
$$;

COMMENT ON FUNCTION public.create_milestone_agreement_v1(jsonb) IS
  '唯一的正式 milestone agreement 建立入口。驗證 family ownership、task/goal 一致性、'
  'criterion 合法性、reward 範圍、agreement_source 與其對應的確認/lineage 證據、'
  'supersede 的 append-only 語意。reward-bearing 一律以呼叫者本人為確認家長。';

REVOKE ALL ON FUNCTION public.create_milestone_agreement_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_milestone_agreement_v1(jsonb) TO authenticated;

COMMIT;
