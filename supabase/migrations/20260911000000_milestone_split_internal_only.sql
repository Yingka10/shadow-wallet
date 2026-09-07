-- GrowBook — apply_milestone_split_v1 收回 authenticated 的執行權
--
-- 2026-09-07 §2.4 複驗發現。20260909 給了：
--   GRANT EXECUTE ON FUNCTION public.apply_milestone_split_v1(...) TO authenticated;
--
-- 那支函式是 SECURITY DEFINER（繞過 RLS）、會 INSERT INTO milestone_agreements
-- （帶幣值），而且**不驗歸屬** —— 沒有 family_id 檢查、不讀 auth.uid()，
-- 家長身分是呼叫端給的參數 p_confirmed_by_parent_id。
--
-- 有了那個 grant，任何登入的使用者都能直接呼叫它，用任意的 task_id /
-- goal_id / 參考價 / 家長 id 寫進 milestone_agreements。
--
-- 原本的理由是「兩支 activation RPC 是 SECURITY DEFINER，呼叫這支時的
-- 有效角色不保證是函式擁有者」。這個前提不成立：在 SECURITY DEFINER
-- 函式內部 current_user 就是函式擁有者（postgres），而它擁有這支，
-- 呼叫自己擁有的函式不需要任何 grant。
--
-- 本 repo 自己的反例：public.preset_task_replay_payload 同樣是
-- SECURITY DEFINER、owner 也是 postgres、ACL 只有 postgres=X/postgres
-- （沒有 authenticated），而它被 create_parent_task_v1 呼叫，一直正常運作。
--
-- 冪等：REVOKE 重跑安全。

BEGIN;

REVOKE ALL ON FUNCTION public.apply_milestone_split_v1(
  uuid, uuid, jsonb, text, smallint, integer[], integer, text, date, uuid, uuid
) FROM PUBLIC, anon, authenticated;

COMMIT;
