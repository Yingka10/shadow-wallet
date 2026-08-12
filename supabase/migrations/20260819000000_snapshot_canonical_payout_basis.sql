-- P0 後續：共同版本快照的 payout semantics 改以 tasks.payout_basis 為 canonical truth。
--
-- 背景（docs/LONG_TERM_REWARD_SETTLEMENT.md §9.4）：
-- 20260818 讓 tasks.payout_basis 成為「什麼事件才結算」的唯一權威，但兩支
-- 快照寫入路徑都還在寫 child_proposal_payout_basis(tasks.claim_period)：
--
--   transition_child_proposal_v1          （20260810，UPDATE 既有版本列）
--   accept_child_proposal_adjustment_v1   （20260817，INSERT 新版本列）
--
-- 結果是一筆新制任務可以錢包走 per_period、快照卻寫著從 claim_period 推導出來的值。
-- 快照存在的唯一理由是「當初講好的是什麼」這個歷史事實，它與實際結算不一致
-- 就等於沒有快照 —— 更糟，它看起來像有答案。
--
-- ── 為什麼是 trigger，不是改寫那兩支 RPC ────────────────────────────────────
--
-- 那兩支各是數百行、分屬兩個工作包，其中 20260817 是剛驗收進 master 的 P0-8M。
-- forward-derive 它們代表把別人的函式整段複製一次；20260818 差點就是這樣把
-- P0-8G 的欄位清單洗回舊版（見該 migration 的獨立 guard trigger 註解）。
-- trigger 掛在資料上，涵蓋現有兩條路徑與任何未來的寫入者，而且改動面積是零。
--
-- ── 本 migration 明確不做的事 ───────────────────────────────────────────────
--
--   * 不 backfill。既有 confirmed 版本一列都不改 —— 那是已經簽下去的歷史。
--   * 不修改 20260818（它已在 staging 實際套用並驗證過，語意保持不動）。
--   * 不刪 child_proposal_payout_basis(claim_period)。它繼續服務 legacy 任務
--     （payout_basis IS NULL），但不再服務新制任務。

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. 快照的值域要容得下 canonical truth
-- ═══════════════════════════════════════════════════════════════════════════
--
-- tasks.payout_basis 的值域是 per_completion / per_period / per_milestone /
-- final_completion；快照原本只認得 claim_period 推得出來的三個
-- （per_completion / per_period / one_time）。
--
-- 現在快照要照抄 canonical truth，值域就必須是兩者的聯集，否則 Phase 2 打開
-- milestone 建立路徑的那一天，第一筆共同版本會在 23514 上失敗 —— 而且是在
-- 家長按下確認的那一刻失敗。
--
-- one_time 留著：它是 legacy 路徑（claim_period = 'once'）寫進去的值，
-- 既有列還在用。這是放寬，不是收緊，既有列一列都不受影響。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_payout_basis_check;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_payout_basis_check
  CHECK (
    confirmed_payout_basis IS NULL
    OR confirmed_payout_basis IN
       ('per_completion', 'per_period', 'per_milestone', 'final_completion',
        'one_time')
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. 寫入快照時，canonical truth 覆寫推導值
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.snapshot_canonical_payout_basis_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_basis text;
BEGIN
  -- 只在「回饋快照第一次被寫下來」的那一刻介入。
  --
  -- 快照尚未成立（confirmed_at IS NULL）→ 沒有東西要蓋。
  -- 快照早就成立（OLD.confirmed_at IS NOT NULL）→ 那是歷史，碰不得；
  --   child_proposal_plan_versions_guard 也會擋，但這裡先自己擋住，
  --   免得本 trigger 自己去撞那道 guard 而讓無關的 UPDATE（例如 superseded_at）
  --   整個失敗。
  IF NEW.confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 快照的每個值都從 confirmed_source_task_id 那一列複製，payout basis 也一樣。
  -- 沒有來源任務就沒有 canonical truth 可讀 —— 那種列會被 confirmed_atomic
  -- CHECK 擋掉，這裡不重複判斷，只是不做事。
  IF NEW.confirmed_source_task_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.payout_basis INTO v_basis
    FROM tasks t
   WHERE t.id = NEW.confirmed_source_task_id;

  -- payout_basis IS NULL = legacy 任務（20260818 之前建立，遷移零列）。
  -- 這些任務的結算行為逐字沒變，快照就繼續由 claim_period 推導 ——
  -- 覆寫成別的值等於偽造一段從來沒發生過的共同確認。
  IF v_basis IS NULL THEN
    RETURN NEW;
  END IF;

  -- 新制任務：canonical truth 說了算，呼叫端寫進來的推導值一律被取代。
  --
  -- **不看 payout_basis_effective_from。** 那一欄是 technical rollout metadata，
  -- 不是家庭的共同約定內容（見 tasks.payout_basis_effective_from 的 COMMENT）。
  -- 快照要記的是「講好用什麼事件結算」，不是「這套語意從哪天開始生效」。
  NEW.confirmed_payout_basis := v_basis;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.snapshot_canonical_payout_basis_v1() IS
  '共同版本快照的 confirmed_payout_basis 以 tasks.payout_basis 為 canonical truth。'
  '只在快照第一次成立時介入；既有 confirmed 版本永不改寫；'
  'legacy 任務（payout_basis IS NULL）維持 claim_period 推導。';

-- trigger 名稱刻意排在 child_proposal_plan_versions_guard 之前
-- （..._canonical_... < ..._guard），讓 canonical 值在 guard 與 CHECK 看到之前就位。
-- 本 trigger 只在 OLD.confirmed_at IS NULL 時動作，所以就算排序不如預期也不會撞 guard；
-- 排序只是讓「guard 檢查的就是最終值」這件事不必靠推理。
DROP TRIGGER IF EXISTS child_proposal_plan_versions_canonical_payout_basis
  ON child_proposal_plan_versions;
CREATE TRIGGER child_proposal_plan_versions_canonical_payout_basis
  BEFORE INSERT OR UPDATE ON child_proposal_plan_versions
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_canonical_payout_basis_v1();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. 把 legacy 推導函式標記成 legacy
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 函式留著、不改行為、不 REVOKE —— 它還在服務既有任務。改的只有它的合約說明：
-- 從現在起它不是 payout semantics 的來源，只是 payout_basis IS NULL 時的相容路徑。
COMMENT ON FUNCTION public.child_proposal_payout_basis(text) IS
  '**LEGACY ONLY。** tasks.claim_period → 版本快照的 payout basis。'
  '自 20260819 起，新制任務（tasks.payout_basis IS NOT NULL）的快照由 '
  'snapshot_canonical_payout_basis_v1 以 tasks.payout_basis 覆寫，本函式的回傳值不作數。'
  '它只在 payout_basis IS NULL（20260818 之前建立的任務）時仍然決定快照值。'
  '**不得用它推導任何新制任務的發幣依據** —— claim_period 是每期 claim 次數上限，'
  '與「什麼事件才結算」是兩個維度，見 docs/CLAIM_PERIOD_VS_PAYOUT_BASIS.md。';

COMMIT;
