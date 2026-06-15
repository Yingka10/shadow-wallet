-- 家庭責任類長期任務所需欄位
-- family_time_per_completion: 每次完成記入時間存摺的分鐘數
-- target_completions:         應完成總次數 = activeDays.length × commitWeeks，達成率分母

ALTER TABLE long_term_goals
  ADD COLUMN IF NOT EXISTS family_time_per_completion integer NULL,
  ADD COLUMN IF NOT EXISTS target_completions integer NULL;
