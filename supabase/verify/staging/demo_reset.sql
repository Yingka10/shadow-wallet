-- ═══════════════════════════════════════════════════════════════════════════
-- GrowBook Demo 資料：清除
-- ═══════════════════════════════════════════════════════════════════════════
--
-- **只在 staging 執行。** 這支腳本不含任何密碼、金鑰或 project ref ——
-- 目標由呼叫端的連線決定，請透過 run_demo.sh 執行（它會驗 project ref 與名稱）。
--
-- 為什麼不用 TRUNCATE：
--
-- staging 上同時住著兩組資料 —— QA regression（qa_seed.sql，供自動化 E2E
-- 斷言用，故意帶技術性名稱）與 Demo showcase（這一組，給人看的）。
-- TRUNCATE 會把 QA 那組一起清掉，regression 就再也跑不起來。
--
-- 所以每一條 DELETE 都以 Demo family 的固定 id 為範圍。沒有一條是
-- 「刪第一個家庭」或「刪全部」—— 那種寫法在別人剛好也在用 staging 時很致命。
--
-- ── 順序是這支腳本的全部重點 ────────────────────────────────────────────────
--
-- 「由葉到根」這個直覺不夠用。真正決定順序的是**非 CASCADE 的外鍵**，
-- 因為只有它們會擋人。對照最新 schema 實查的結果，會擋的只有這幾條：
--
--   intervention_log.family_id → families        RESTRICT
--   intervention_log.child_id  → children        RESTRICT
--   reward_items.child_id      → children        NO ACTION
--   task_completions.override_id → overrides     NO ACTION
--   child_proposals.task_id                    → tasks  SET NULL
--   child_proposal_plan_versions.confirmed_source_task_id → tasks  SET NULL
--   families.created_by / parents.user_id      → auth.users  NO ACTION
--
-- 其中兩條 SET NULL 特別危險，因為它們**不會**在刪除當下報 FK 錯誤，
-- 而是把欄位設成 NULL、然後撞上 CHECK：
--
--   刪掉 canonical task
--     → child_proposals.task_id 變 NULL
--     → 違反 child_proposals_active_consistency
--       （status='active' 時要求 task_id IS NOT NULL）           → 23514
--     → child_proposal_plan_versions.confirmed_source_task_id 變 NULL
--     → 違反 child_proposal_plan_versions_confirmed_atomic
--       （confirmed_at IS NOT NULL 時要求它 IS NOT NULL）        → 23514
--
-- 所以**提案圖必須整個刪在 tasks 之前**。這是這支腳本先前的版本會壞的地方：
-- 它寫於 P0-1 落地之前，順序是 …→ tasks → children，一旦 Demo 真的跑過
-- 一次「提案 → 家長確認 → 正式任務」，reset 就必定失敗。
--
-- 好消息是提案的四張子表全部是 ON DELETE CASCADE，而 current_plan_version_id
-- 那條複合 FK 是 DEFERRABLE INITIALLY DEFERRED —— 所以一句
-- `DELETE FROM child_proposals WHERE family_id = …` 就夠了，
-- 不需要先把 current pointer 設成 NULL、也不需要逐層刪版本。
--
-- overrides 與 task_completions 是互相指的：
--   overrides.completion_id → task_completions  CASCADE
--   task_completions.override_id → overrides    NO ACTION   ← 反向這條會擋
-- 所以先把 task_completions.override_id 清成 NULL，再刪 overrides。

-- 純 SQL，沒有 psql meta-command —— psql -f 與 `supabase db query --linked`
-- 都跑得動（後者走 CLI 的臨時登入角色，不需要資料庫密碼）。

BEGIN;

DO $reset$
DECLARE
  -- Demo 身分：固定 id，僅供 staging demo 使用，與正式資料無關。
  -- 前綴 d0 是人眼可辨識的標記，一眼看出「這是 demo 造出來的」。
  v_family CONSTANT uuid := 'd0e70000-0000-4000-8000-000000000001';
  v_user   CONSTANT uuid := 'd0e70000-0000-4000-8000-000000000011';
  v_child  CONSTANT uuid := 'd0e70000-0000-4000-8000-000000000021';
  v_tasks  uuid[];
  v_kids   uuid[];
  v_name   text;
  v_kid_name text;
  v_total  int;
  -- 這是 Demo family，不是正式家庭。State A 全開也只有數十列；
  -- 上千列代表這個 id 底下住的不是我們以為的東西，停手讓人看。
  v_cap CONSTANT int := 2000;
BEGIN

  SELECT family_name INTO v_name FROM families WHERE id = v_family;
  IF v_name IS NULL THEN
    RAISE NOTICE '沒有 Demo 資料可以清除（family % 不存在）', v_family;
    RETURN;
  END IF;

  -- 安全閘：這個 id 必須真的是 Demo family。若有人把正式資料塞進這個 id，
  -- 寧可停下來也不要刪。
  IF v_name <> 'GrowBook Demo Family' THEN
    RAISE EXCEPTION '中止：% 不是 Demo family（實際名稱：%）', v_family, v_name;
  END IF;

  -- 孩子的身分也要對得上。family 名稱對、孩子卻不是承恩，同樣代表
  -- 這個 id 底下的東西已經不是我們建的了。
  SELECT nickname INTO v_kid_name FROM children WHERE id = v_child;
  IF v_kid_name IS NOT NULL AND v_kid_name <> '承恩' THEN
    RAISE EXCEPTION '中止：demo child % 不是承恩（實際名稱：%）', v_child, v_kid_name;
  END IF;

  SELECT array_agg(id) INTO v_kids  FROM children WHERE family_id = v_family;
  SELECT array_agg(id) INTO v_tasks FROM tasks    WHERE family_id = v_family;
  v_kids  := COALESCE(v_kids,  ARRAY[]::uuid[]);
  v_tasks := COALESCE(v_tasks, ARRAY[]::uuid[]);

  -- 破壞性上限：先數，超過就停，不刪。
  SELECT
      (SELECT count(*) FROM intervention_log      WHERE family_id = v_family)
    + (SELECT count(*) FROM child_proposals       WHERE family_id = v_family)
    + (SELECT count(*) FROM reward_items          WHERE child_id = ANY(v_kids))
    + (SELECT count(*) FROM redemption_requests   WHERE child_id = ANY(v_kids))
    + (SELECT count(*) FROM task_completions      WHERE task_id  = ANY(v_tasks))
    + (SELECT count(*) FROM transactions          WHERE wallet_id IN (
         SELECT id FROM wallets WHERE child_id = ANY(v_kids)))
    + (SELECT count(*) FROM child_tasks           WHERE task_id  = ANY(v_tasks))
    + (SELECT count(*) FROM long_term_goals       WHERE task_id  = ANY(v_tasks))
    + (SELECT count(*) FROM tasks                 WHERE family_id = v_family)
    + (SELECT count(*) FROM weekly_reports        WHERE family_id = v_family)
    + (SELECT count(*) FROM growth_moments        WHERE child_id = ANY(v_kids))
    + (SELECT count(*) FROM children              WHERE family_id = v_family)
  INTO v_total;

  IF v_total > v_cap THEN
    RAISE EXCEPTION
      '中止：預計清除 % 列，超過上限 %。Demo family 不該有這麼多資料，'
      '請先確認這個 id 底下是什麼再決定。', v_total, v_cap;
  END IF;

  -- ── 1. RESTRICT：擋在最前面，一定要先清 ──────────────────────────────────
  DELETE FROM intervention_log           WHERE family_id = v_family;

  -- ── 2. 提案圖：必須在 tasks 之前（見開頭說明）────────────────────────────
  --    四張子表（plan_versions / status_events / trial_events /
  --    adjustment_requests）都是 ON DELETE CASCADE，這一句就會一起帶走。
  DELETE FROM child_proposals            WHERE family_id = v_family;

  -- ── 3. 願望與兌換：reward_items.child_id 是 NO ACTION，不會自己被帶走 ────
  DELETE FROM redemption_requests        WHERE child_id = ANY(v_kids);
  DELETE FROM reward_items               WHERE child_id = ANY(v_kids);

  -- ── 4. 完成紀錄與它的兩個附屬 ────────────────────────────────────────────
  --    先斷開反向指標，否則 task_completions.override_id（NO ACTION）
  --    會擋住 overrides 的刪除。
  UPDATE task_completions SET override_id = NULL
    WHERE task_id = ANY(v_tasks) AND override_id IS NOT NULL;
  DELETE FROM overrides                  WHERE completion_id IN (
                                              SELECT id FROM task_completions
                                              WHERE task_id = ANY(v_tasks));
  DELETE FROM time_savings               WHERE child_id = ANY(v_kids);
  DELETE FROM task_completions           WHERE task_id  = ANY(v_tasks);

  -- ── 5. 錢包異動（wallets 本身留到最後，transactions 先走）───────────────
  DELETE FROM transactions               WHERE wallet_id IN (
                                              SELECT id FROM wallets
                                              WHERE child_id = ANY(v_kids));

  -- ── 6. 任務的附屬表與指派 ────────────────────────────────────────────────
  DELETE FROM task_role_responsibilities WHERE task_id = ANY(v_tasks);
  DELETE FROM task_preset_selections     WHERE task_id = ANY(v_tasks);
  DELETE FROM task_plan_milestones       WHERE task_id = ANY(v_tasks);
  DELETE FROM task_plan_support_steps    WHERE task_id = ANY(v_tasks);
  DELETE FROM task_change_events         WHERE task_id = ANY(v_tasks);
  DELETE FROM parent_observations        WHERE task_id = ANY(v_tasks);
  DELETE FROM child_tasks                WHERE task_id = ANY(v_tasks);
  DELETE FROM long_term_goals            WHERE task_id = ANY(v_tasks);

  -- ── 7. 任務本身。到這裡已經沒有人指著它了 ───────────────────────────────
  DELETE FROM tasks                      WHERE family_id = v_family;

  -- ── 8. 報表與紀錄 ────────────────────────────────────────────────────────
  DELETE FROM weekly_reports             WHERE family_id = v_family;
  DELETE FROM monthly_reports            WHERE family_id = v_family;
  DELETE FROM growth_moments             WHERE child_id = ANY(v_kids);
  DELETE FROM parent_observations        WHERE child_id = ANY(v_kids);
  DELETE FROM credit_logs                WHERE child_id = ANY(v_kids);
  DELETE FROM sibling_relations          WHERE family_id = v_family;

  -- ── 9. 身分 ──────────────────────────────────────────────────────────────
  DELETE FROM wallets                    WHERE child_id = ANY(v_kids);
  DELETE FROM child_profiles             WHERE child_id = ANY(v_kids);
  DELETE FROM children                   WHERE family_id = v_family;
  DELETE FROM parents                    WHERE family_id = v_family;
  DELETE FROM families                   WHERE id = v_family;

  -- families.created_by 與 parents.user_id 都是 NO ACTION，所以 auth 這兩列
  -- 一定要排在 families / parents 之後。
  DELETE FROM auth.identities WHERE user_id = v_user;
  DELETE FROM auth.users      WHERE id = v_user;

  RAISE NOTICE 'Demo 資料已清除（family %，共 % 列）', v_family, v_total;
END
$reset$;

-- 清完之後自我驗證：Demo 那組必須歸零，而且不能留下任何孤兒。
DO $verify$
DECLARE
  v_family CONSTANT uuid := 'd0e70000-0000-4000-8000-000000000001';
  v_left int;
BEGIN
  SELECT
      (SELECT count(*) FROM families        WHERE id = v_family)
    + (SELECT count(*) FROM parents         WHERE family_id = v_family)
    + (SELECT count(*) FROM children        WHERE family_id = v_family)
    + (SELECT count(*) FROM tasks           WHERE family_id = v_family)
    + (SELECT count(*) FROM child_proposals WHERE family_id = v_family)
    + (SELECT count(*) FROM weekly_reports  WHERE family_id = v_family)
    + (SELECT count(*) FROM intervention_log WHERE family_id = v_family)
    + (SELECT count(*) FROM auth.users
        WHERE id = 'd0e70000-0000-4000-8000-000000000011')
  INTO v_left;

  IF v_left <> 0 THEN
    RAISE EXCEPTION 'reset 沒有清乾淨：Demo 範圍還剩 % 列', v_left;
  END IF;

  -- 孤兒檢查：任何指向已刪 demo 身分的殘留都會在這裡現形。
  IF EXISTS (SELECT 1 FROM child_proposal_plan_versions v
              WHERE NOT EXISTS (SELECT 1 FROM child_proposals p WHERE p.id = v.proposal_id))
  THEN
    RAISE EXCEPTION 'reset 留下了孤兒 plan version';
  END IF;
END
$verify$;

COMMIT;

-- 清完之後 QA regression 那組必須原封不動。
SELECT family_name, (SELECT count(*) FROM parents p WHERE p.family_id = f.id) AS parents
FROM families f
ORDER BY family_name;
