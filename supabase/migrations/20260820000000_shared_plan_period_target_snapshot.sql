-- P0 final merge blocker：per_period 的共同版本快照必須說得出「一週幾次算達標」。
--
-- 20260819 讓快照的 confirmed_payout_basis 以 tasks.payout_basis 為 canonical
-- truth，但 per_period 只回答了「按什麼週期結算」，沒有回答「達到幾次才形成一次
-- reward event」。少了那個數字，一份 per_period 的共同版本在三個月後回頭看，
-- 家長問「我們當初講好一週幾次」是答不出來的 —— 而那正是 shared plan 快照
-- 存在的唯一理由。
--
-- ── 不得代用的兩個欄位 ──────────────────────────────────────────────────────
--
--   confirmed_claim_period          「每天 / 每週可以 claim」的視窗，不是達標次數
--   confirmed_max_claims_per_period 「每期最多 claim 幾次」的上限，不是達標次數
--
-- 上限與目標是兩個不同的數字，而且會不一樣：一個「每週 4 次算達標」的計畫，
-- max_claims 可以是 5（允許多做一次但不多發幣）。拿上限當目標會讓
-- 「還差幾次」這個孩子端每天看到的數字直接算錯。
-- 兩者的維度差異見 docs/CLAIM_PERIOD_VS_PAYOUT_BASIS.md。
--
-- ── 本 migration 明確不做的事 ───────────────────────────────────────────────
--
--   * 不 backfill。既有 confirmed 版本的新欄位一律留 NULL —— 那些家庭當初
--     確認的畫面上根本沒有出現過這個數字（§7.0 gate B），寫一個進去等於
--     替他們補簽一份沒發生過的約定。
--   * 不修改 20260818 / 20260819（都已在 staging 實際套用並驗證過）。
--   * 不改寫 transition_child_proposal_v1 / accept_child_proposal_adjustment_v1。
--     沿用 20260819 建立的 trigger，兩條寫入路徑一次涵蓋。

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. 欄位
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE child_proposal_plan_versions
  ADD COLUMN IF NOT EXISTS confirmed_period_target_count smallint;

COMMENT ON COLUMN child_proposal_plan_versions.confirmed_period_target_count IS
  '共同確認當下約定的「一個 period 內完成幾次形成一次 reward event」，'
  '從 tasks.period_target_count 複製。**只有新制 per_period 快照有值**；'
  'legacy 快照（tasks.payout_basis IS NULL）一律 NULL，不 backfill。'
  '**不得用 confirmed_claim_period 或 confirmed_max_claims_per_period 代替** ——'
  '前者是結算視窗、後者是 claim 次數上限，兩者都不是達標次數，'
  '見 docs/CLAIM_PERIOD_VS_PAYOUT_BASIS.md。';

-- 目標次數只屬於 per_period。掛在別的 basis 上等於憑空多一個數字，
-- 而總有一天會有畫面把它顯示成「還差幾次」。
--
-- 這個方向對既有列一定成立（欄位是新加的，所有既有列都是 NULL），
-- 所以可以直接 VALIDATE，不需要 NOT VALID。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_period_target_scope;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_period_target_scope
  CHECK (
    confirmed_period_target_count IS NULL
    OR confirmed_payout_basis = 'per_period'
  );

-- 與 tasks.period_target_count 同一個值域。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_period_target_range;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_period_target_range
  CHECK (
    confirmed_period_target_count IS NULL
    OR confirmed_period_target_count BETWEEN 1 AND 7
  );

-- ⚠️ 反方向（per_period ⇒ 一定要有 target）**刻意不寫成 CHECK。**
--
-- 既有的 legacy 快照裡就有 confirmed_payout_basis = 'per_period' 而 target
-- 為 NULL 的列（那是 claim_period='week' 推導出來的）。寫成 CHECK 的話：
--   · 直接 ADD CONSTRAINT 會在既有資料上失敗；
--   · 改成 NOT VALID 也不行 —— NOT VALID 仍然會在 UPDATE 時檢查，
--     而 P0-8M 每次接受換時段都會 UPDATE 舊版本的 superseded_at，
--     那一刻就會炸在一列與這次改動無關的歷史資料上。
-- 所以「新制 per_period 一定要有 target」由下面的 trigger 在寫入當下強制，
-- 只作用在正要成立的新快照上。

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. 寫入快照時一併複製目標次數
--
-- 沿用 20260819 建立的同一支 trigger function（CREATE OR REPLACE）。
-- 拆成第二支 trigger 的話，「這一列的 payout semantics 是怎麼決定的」
-- 就會有兩個地方要對照著讀，而它們遲早會不同步。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.snapshot_canonical_payout_basis_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_basis  text;
  v_target smallint;
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

  -- 快照的每個值都從 confirmed_source_task_id 那一列複製，payout semantics
  -- 也一樣。沒有來源任務就沒有 canonical truth 可讀 —— 那種列會被
  -- confirmed_atomic CHECK 擋掉，這裡不重複判斷，只是不做事。
  IF NEW.confirmed_source_task_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.payout_basis, t.period_target_count
    INTO v_basis, v_target
    FROM tasks t
   WHERE t.id = NEW.confirmed_source_task_id;

  -- payout_basis IS NULL = legacy 任務（20260818 之前建立，遷移零列）。
  -- 這些任務的結算行為逐字沒變，快照就繼續由 claim_period 推導 ——
  -- 覆寫成別的值等於偽造一段從來沒發生過的共同確認。
  -- 目標次數同理：legacy 快照留 NULL，不 backfill。
  IF v_basis IS NULL THEN
    RETURN NEW;
  END IF;

  -- 新制任務：canonical truth 說了算，呼叫端寫進來的推導值一律被取代。
  --
  -- **不看 payout_basis_effective_from。** 那一欄是 technical rollout metadata，
  -- 不是家庭的共同約定內容（見 tasks.payout_basis_effective_from 的 COMMENT）。
  -- 快照要記的是「講好用什麼事件結算」，不是「這套語意從哪天開始生效」。
  NEW.confirmed_payout_basis := v_basis;

  IF v_basis = 'per_period' THEN
    -- fail closed。tasks_period_target_scope_check 保證 per_period 一定有
    -- target，所以這一條在正常路徑上不可能觸發 —— 它擋的是「有人繞過那個
    -- CHECK 造出一筆沒有分母的 per_period 任務」，而那種任務形成的共同版本
    -- 會讓孩子端的「還差幾次」永遠算不出來。寧可擋在家長按下確認的那一刻。
    IF v_target IS NULL THEN
      RAISE EXCEPTION
        'SHARED_PLAN_PERIOD_TARGET_MISSING: 任務 % 是 per_period 但沒有 period_target_count',
        NEW.confirmed_source_task_id
        USING ERRCODE = 'P0001';
    END IF;
    NEW.confirmed_period_target_count := v_target;
  ELSE
    -- 目標次數只屬於 per_period（見 period_target_scope CHECK）。
    -- 顯式歸零而不是「不動」：呼叫端若自己塞了一個值進來，這裡要蓋掉它。
    NEW.confirmed_period_target_count := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.snapshot_canonical_payout_basis_v1() IS
  '共同版本快照的 payout semantics（confirmed_payout_basis 與 '
  'confirmed_period_target_count）以 tasks 為 canonical truth。'
  '只在快照第一次成立時介入；既有 confirmed 版本永不改寫；'
  'legacy 任務（payout_basis IS NULL）維持 claim_period 推導、目標次數留 NULL。';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. 目標次數與其他 confirmed 證據一樣是 write-once
--
-- 20260816 的 child_proposal_plan_version_guard 列了一份 confirmed_* 清單，
-- 但那份清單屬於 P0-8 系列。forward-derive 它再加一欄，就會把之後（或同時）
-- 對那份清單做的修改默默改回去 —— 20260818 差點就是這樣打壞 P0-8G。
-- 所以這裡掛一支只管新欄位的獨立 trigger。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.guard_confirmed_period_target_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.confirmed_at IS NOT NULL
    AND NEW.confirmed_period_target_count IS DISTINCT FROM OLD.confirmed_period_target_count
  THEN
    RAISE EXCEPTION
      'confirmed plan version evidence cannot be changed (version %)', OLD.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_confirmed_period_target_v1() IS
  'confirmed_period_target_count 是 write-once 的共同確認證據。'
  '刻意不併入 child_proposal_plan_version_guard —— 那份欄位清單屬於 P0-8 系列，'
  'forward-derive 它會覆蓋別的工作包對同一份清單的修改。';

DROP TRIGGER IF EXISTS child_proposal_plan_versions_period_target_guard
  ON child_proposal_plan_versions;
CREATE TRIGGER child_proposal_plan_versions_period_target_guard
  BEFORE UPDATE ON child_proposal_plan_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_confirmed_period_target_v1();

COMMIT;
