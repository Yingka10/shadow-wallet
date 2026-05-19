-- ============================================================
-- Demo 資料清理：移除重複任務、驗證 child_tasks 連結完整
-- 在 Supabase SQL Editor 執行此腳本
-- ============================================================

-- ── Step 1：先看有哪些重複（同 family_id + name + category）─────────────
SELECT family_id, name, category, COUNT(*) AS cnt
FROM public.tasks
GROUP BY family_id, name, category
HAVING COUNT(*) > 1
ORDER BY cnt DESC, name;

-- ── Step 2：刪除重複，保留 created_at 最早的那一筆 ─────────────────────
DELETE FROM public.tasks
WHERE id NOT IN (
  SELECT DISTINCT ON (family_id, name, category) id
  FROM public.tasks
  ORDER BY family_id, name, category, created_at ASC
);

-- ── Step 3：驗證 child_tasks 連結完整性 ────────────────────────────────
-- 查出有 child_tasks 記錄但 tasks 已不存在或 is_active=false 的孤立連結
SELECT
  ct.child_id,
  ct.task_id,
  t.name,
  t.is_active,
  CASE
    WHEN t.id IS NULL THEN '任務不存在'
    WHEN t.is_active = false THEN '任務已停用'
  END AS 問題
FROM public.child_tasks ct
LEFT JOIN public.tasks t ON t.id = ct.task_id
WHERE t.id IS NULL OR t.is_active = false;

-- ── Step 4：確認各孩子目前的有效任務數量 ───────────────────────────────
SELECT
  c.id AS child_id,
  c.nickname AS child_name,
  COUNT(ct.task_id) FILTER (WHERE t.category = 'A') AS task_a,
  COUNT(ct.task_id) FILTER (WHERE t.category = 'B') AS task_b,
  COUNT(ct.task_id) FILTER (WHERE t.category = 'C') AS task_c,
  COUNT(ct.task_id) FILTER (WHERE t.category = 'D') AS task_d
FROM public.children c
LEFT JOIN public.child_tasks ct ON ct.child_id = c.id AND ct.is_active = true
LEFT JOIN public.tasks t ON t.id = ct.task_id AND t.is_active = true
GROUP BY c.id, c.nickname
ORDER BY c.nickname;
