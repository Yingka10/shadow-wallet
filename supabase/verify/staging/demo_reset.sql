-- ═══════════════════════════════════════════════════════════════════════════
-- GrowBook Demo 資料：清除
-- ═══════════════════════════════════════════════════════════════════════════
--
-- **只在 staging 執行。** 這支腳本不含任何密碼、金鑰或 project ref ——
-- 目標由呼叫端的連線決定，執行前請先確認 linked ref 是 growbook-staging。
--
-- 為什麼不用 TRUNCATE：
--
-- staging 上同時住著兩組資料 —— QA regression（qa_seed.sql，供自動化 E2E
-- 斷言用，故意帶技術性名稱）與 Demo showcase（這一組，給人看的）。
-- TRUNCATE 會把 QA 那組一起清掉，regression 就再也跑不起來。
--
-- 所以每一條 DELETE 都以 Demo family 的固定 id 為範圍。沒有一條是
-- 「刪第一個家庭」或「刪全部」—— 那種寫法在別人剛好也在用 staging 時很致命。

-- 純 SQL，沒有 psql meta-command —— psql -f 與 `supabase db query --linked`
-- 都跑得動（後者走 CLI 的臨時登入角色，不需要資料庫密碼）。

BEGIN;

DO $reset$
DECLARE
  -- Demo 身分：固定 id，僅供 staging demo 使用，與正式資料無關。
  -- 前綴 d0 是人眼可辨識的標記，一眼看出「這是 demo 造出來的」。
  v_family CONSTANT uuid := 'd0e70000-0000-4000-8000-000000000001';
  v_user   CONSTANT uuid := 'd0e70000-0000-4000-8000-000000000011';
  v_tasks  uuid[];
  v_kids   uuid[];
  v_name   text;
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

  SELECT array_agg(id) INTO v_kids  FROM children WHERE family_id = v_family;
  SELECT array_agg(id) INTO v_tasks FROM tasks    WHERE family_id = v_family;
  v_kids  := COALESCE(v_kids,  ARRAY[]::uuid[]);
  v_tasks := COALESCE(v_tasks, ARRAY[]::uuid[]);

  -- 由葉到根，每一條都以 Demo 的 task/child/family 為範圍。
  --
  -- overrides 掛在 completion_id 而不是 task_id，所以它必須排在
  -- task_completions 之前 —— 反過來會找不到要刪哪些。
  DELETE FROM overrides                 WHERE completion_id IN (
                                              SELECT id FROM task_completions
                                              WHERE task_id = ANY(v_tasks));
  DELETE FROM task_completions          WHERE task_id  = ANY(v_tasks);
  DELETE FROM time_savings              WHERE child_id = ANY(v_kids);
  DELETE FROM transactions              WHERE wallet_id IN (
                                              SELECT id FROM wallets WHERE child_id = ANY(v_kids));
  DELETE FROM task_role_responsibilities WHERE task_id = ANY(v_tasks);
  DELETE FROM task_preset_selections     WHERE task_id = ANY(v_tasks);
  DELETE FROM task_plan_milestones       WHERE task_id = ANY(v_tasks);
  DELETE FROM task_plan_support_steps    WHERE task_id = ANY(v_tasks);
  DELETE FROM task_change_events         WHERE task_id = ANY(v_tasks);
  DELETE FROM child_tasks                WHERE task_id = ANY(v_tasks);
  DELETE FROM long_term_goals            WHERE task_id = ANY(v_tasks);
  DELETE FROM intervention_log           WHERE family_id = v_family;
  DELETE FROM tasks                      WHERE family_id = v_family;
  DELETE FROM wallets                    WHERE child_id = ANY(v_kids);
  DELETE FROM child_profiles             WHERE child_id = ANY(v_kids);
  DELETE FROM children                   WHERE family_id = v_family;
  DELETE FROM parents                    WHERE family_id = v_family;
  DELETE FROM families                   WHERE id = v_family;

  DELETE FROM auth.identities WHERE user_id = v_user;
  DELETE FROM auth.users      WHERE id = v_user;

  RAISE NOTICE 'Demo 資料已清除（family %）', v_family;
END
$reset$;

COMMIT;

-- 清完之後 QA regression 那組必須原封不動。
SELECT family_name, (SELECT count(*) FROM parents p WHERE p.family_id = f.id) AS parents
FROM families f
ORDER BY family_name;
