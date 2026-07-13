-- 週報生成修復：確保 weekly_reports 有 (family_id, child_id, week_start) 的唯一索引。
--
-- generate-weekly-report Edge Function 用
--   .upsert(..., { onConflict: 'family_id,child_id,week_start' })
-- 寫入週報。PostgREST 的 ON CONFLICT 需要「一組欄位剛好對應的唯一索引/約束」才能推斷，
-- 否則 upsert 直接失敗（Postgres 42P10）。weekly_reports 只存在 live DB、不在 migrations，
-- 這組唯一索引是否存在無法從版本庫確認 —— 本檔冪等補上，若已存在則為 no-op。
--
-- 前端 useParentWeeklyReport 也以 (family_id, child_id, week_start) 做 .maybeSingle()，
-- 語意上本就該是每組一列，此索引同時保證這個不變量。
--
-- 用 CREATE UNIQUE INDEX IF NOT EXISTS（可重跑）；並先確認表存在，避免在尚未建表的環境報錯。
-- AUDIT 記錄此表在修復前為 0 列，故不會有既有重複值導致建索引失敗。

DO $$
BEGIN
  IF to_regclass('public.weekly_reports') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS weekly_reports_family_child_week_key
      ON public.weekly_reports (family_id, child_id, week_start);
  END IF;
END $$;
