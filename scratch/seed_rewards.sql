-- ============================================================
-- seed_rewards.sql
-- 願望池（reward_items）測試假資料
-- 貼到 Supabase SQL Editor 執行即可
--
-- 注意：此腳本會取得資料庫中第一組 family + child，
-- 若有多組資料請先確認要插入哪位孩子的資料。
-- ============================================================

DO $$
DECLARE
  v_family_id uuid;
  v_child_id  uuid;
BEGIN
  -- 取得第一個家庭的 ID
  SELECT id INTO v_family_id FROM families LIMIT 1;
  -- 取得該家庭第一個孩子的 ID
  SELECT id INTO v_child_id  FROM children WHERE family_id = v_family_id LIMIT 1;

  IF v_family_id IS NULL OR v_child_id IS NULL THEN
    RAISE EXCEPTION '找不到家庭或孩子資料，請先建立帳號';
  END IF;

  -- ── 特權類（privilege）──────────────────────────────────────
  -- 由家長設定、直接生效的特權獎勵

  INSERT INTO reward_items
    (family_id, child_id, name, coin_cost, added_by, parent_approved, is_active, reward_type)
  VALUES
    (v_family_id, v_child_id, '多30分鐘3C時間',   80,  'parent', true, true, 'privilege'),
    (v_family_id, v_child_id, '決定今晚吃什麼',   60,  'parent', true, true, 'privilege'),
    (v_family_id, v_child_id, '免洗碗一次',        40,  'parent', true, true, 'privilege'),
    (v_family_id, v_child_id, '週末多睡一小時',   70,  'parent', true, true, 'privilege'),

  -- ── 獎品類（item）──────────────────────────────────────────
  -- 需要家長協助完成的實體獎品

    (v_family_id, v_child_id, '樂高套組',         300, 'parent', true, true, 'item'),
    (v_family_id, v_child_id, '故事書一本',        100, 'parent', true, true, 'item'),
    (v_family_id, v_child_id, '冰淇淋（全家一起）',  80,  'parent', true, true, 'item'),
    (v_family_id, v_child_id, '去動物園',          200, 'parent', true, true, 'item'),

  -- ── 待審核（child added，等家長確認）────────────────────────
    (v_family_id, v_child_id, '買一個新玩具',      0,   'child',  false, true, 'item'),
    (v_family_id, v_child_id, '去遊樂場玩',        0,   'child',  false, true, 'item');

  RAISE NOTICE '已插入 10 筆 reward_items，family_id=%, child_id=%', v_family_id, v_child_id;
END $$;
