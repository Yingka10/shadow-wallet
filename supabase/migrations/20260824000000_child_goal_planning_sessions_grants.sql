-- ═══════════════════════════════════════════════════════════════════════════
-- P1-A2.5 — planning session 的 table 權限對齊 child_proposals
--
-- staging acceptance 抓到的缺口：20260822 建表時**沒有**收回 Supabase 對
-- public schema 的預設授權，於是 anon 與 authenticated 對這張表都還有
-- INSERT / UPDATE / DELETE 的 table-level 權限。
--
-- 目前沒有被利用的路徑 —— RLS 開著、而且只有一條 SELECT policy，
-- 沒有 policy 的寫入一律被 deny。所以這不是一個現成的漏洞。
--
-- 但它與同一家族的其他四張表不一致：
--
--   child_proposals / plan_versions / trial_events /
--   adjustment_requests / status_events
--     → REVOKE ALL FROM PUBLIC, anon, authenticated；再 GRANT SELECT
--
--   child_goal_planning_sessions（before this）
--     → 預設全開，只靠 RLS 擋
--
-- 差別在縱深。留著預設授權的話，只要之後有人加一條寬鬆的寫入 policy
-- （或一條 FOR ALL USING (true) 的 policy），權限那一層已經是開的了 ——
-- 而加 policy 的人多半不會回頭檢查 GRANT。
--
-- ⚠️ 這裡刻意**開新的一支 migration**，不去改 20260822：那一支已經套用到
--    staging 了，改它會讓本機與遠端的歷史分岔。
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON child_goal_planning_sessions FROM PUBLIC, anon, authenticated;

-- 讀取仍然要通過 RLS 的家庭邊界；這一行只是讓 policy 有東西可以套用。
-- 寫入一律走 SECURITY DEFINER RPC —— 這裡不給任何寫入權限，是刻意的。
GRANT SELECT ON child_goal_planning_sessions TO authenticated;

COMMENT ON TABLE child_goal_planning_sessions IS
  'P1-A2：孩子的目標規劃對話。計畫成形前的思考過程，不是正式 Plan Version。'
  '寫入只走 SECURITY DEFINER RPC —— authenticated 沒有任何 table-level 寫入權限。';
