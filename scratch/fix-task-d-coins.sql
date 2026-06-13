-- ============================================================
-- Task-D 金幣修復：base_time_min=0 的里程碑任務補 coin_override
-- 在 Supabase SQL Editor 執行此腳本
-- ============================================================
-- 背景：下列 Task-D 任務無法用 base_time_min × difficulty 計算幣值，
--       必須用 coin_override 直接指定。
--       幣值基準：6-9 歲週均收入 120-150 幣，里程碑型用 15-25 幣。

UPDATE public.tasks
SET coin_override = 25
WHERE name = '考試成績比上次進步（跟自己比）'
  AND category = 'D';

UPDATE public.tasks
SET coin_override = 20
WHERE name = '連續4週準時睡覺（不超過約定時間）'
  AND category = 'D';

UPDATE public.tasks
SET coin_override = 15
WHERE name = '連續7天3C使用時間未超過約定'
  AND category = 'D';

UPDATE public.tasks
SET coin_override = 25
WHERE name = '連續30天按時起床（不賴床）'
  AND category = 'D';

-- 驗證：確認這 4 種任務都有 coin_override 了
SELECT name, category, base_time_min, coin_override
FROM public.tasks
WHERE name IN (
  '考試成績比上次進步（跟自己比）',
  '連續4週準時睡覺（不超過約定時間）',
  '連續7天3C使用時間未超過約定',
  '連續30天按時起床（不賴床）'
)
ORDER BY name;
