-- Add new columns to long_term_goals for skill / responsibility / challenge goal types

-- 【通用】
ALTER TABLE long_term_goals
  ADD COLUMN min_age integer DEFAULT 4,
  ADD COLUMN interrupt_count integer DEFAULT 0,
  ADD COLUMN last_active_date date,

-- 【技能學習專用】
  ADD COLUMN level_definitions jsonb,
  -- 格式：[
  --   { "level": 1, "name": "認識工具", "description": "...", "completion_criteria": "..." },
  --   { "level": 2, "name": "初次嘗試", ... }
  -- ]
  ADD COLUMN current_level integer DEFAULT 1,
  ADD COLUMN level_count integer DEFAULT 3,

-- 【家庭責任專用】
  ADD COLUMN role_title text,
  -- 例如：「垃圾分類官」
  ADD COLUMN salary_mode boolean DEFAULT false,
  -- false = 特權獎勵模式, true = 週薪模式
  ADD COLUMN base_salary integer,
  -- 週薪基準（滿額達成時的幣值）
  ADD COLUMN weekly_target_rate numeric DEFAULT 0.8,
  -- 達成率門檻（預設 80%）
  ADD COLUMN privilege_reward jsonb,
  -- 格式：{ "condition": "4週達成", "reward": "月會提案名額" }

-- 【自我挑戰專用】
  ADD COLUMN target_value numeric,
  ADD COLUMN current_value numeric DEFAULT 0,
  ADD COLUMN value_unit text;
  -- 例如：「頁」「分鐘」「公里」
