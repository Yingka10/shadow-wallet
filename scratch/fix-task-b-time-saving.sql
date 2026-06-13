-- ============================================================
-- Task-B 時間儲蓄修復：將 time_saving_min 設為 base_time_min
-- 在 Supabase SQL Editor 執行此腳本
-- ============================================================

-- ── Step 1：修 tasks 表（讓之後的任務完成記錄正確）───────────────
UPDATE public.tasks
SET time_saving_min = base_time_min
WHERE category = 'B'
  AND time_saving_min = 0
  AND base_time_min > 0;

-- ── Step 2：補修已存在的 task_completions（舊記錄 time_saved_min=0）
UPDATE public.task_completions tc
SET time_saved_min = t.base_time_min
FROM public.tasks t
WHERE tc.task_id = t.id
  AND t.category = 'B'
  AND tc.time_saved_min = 0
  AND t.base_time_min > 0;

-- ── Step 3：補修 time_savings 表（來源也是 0 的舊記錄）──────────
-- time_savings.minutes_saved 是由 Edge Function 從 time_saved_min 直接複製的
UPDATE public.time_savings ts
SET minutes_saved = tc.time_saved_min
FROM public.task_completions tc
WHERE ts.completion_id = tc.id
  AND ts.minutes_saved = 0
  AND tc.time_saved_min > 0;

-- ── 驗證：確認修復結果 ───────────────────────────────────────────
SELECT name, base_time_min, time_saving_min
FROM public.tasks
WHERE category = 'B'
ORDER BY name;
