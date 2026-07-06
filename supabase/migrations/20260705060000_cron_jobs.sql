-- P1-8: land the 3 cron jobs the three Edge Functions already document a
-- schedule for (settle-weekly-interest, detect-abandonment,
-- generate-weekly-report). None of the three has ever been scheduled — cron
-- extension was installed but `cron.job` was empty (AUDIT: weekly_reports,
-- intervention_log, transactions type='interest' all 0 rows).
--
-- PREREQUISITE (run once, manually — NOT part of this file):
-- this migration's cron jobs reference two Vault secrets *by name*. Create
-- them once before applying this migration:
--
--   select vault.create_secret('https://mduaghqszbwmoigllpbj.supabase.co', 'project_url');
--   select vault.create_secret('<anon/publishable key>', 'anon_key');
--
-- Neither value is sensitive (project_url is public; the anon key is already
-- embedded in the shipped client app's .env), but per-project secret VALUES
-- don't belong in a git-tracked migration file — it breaks portability across
-- environments and isn't idempotently re-runnable. The migration below only
-- ever references these secrets by name via vault.decrypted_secrets.
--
-- None of the 3 target Edge Functions need a service-role-level bearer from
-- the caller — each builds its own internal service_role client from its own
-- Supabase Functions environment secrets. The Authorization header here only
-- has to satisfy the platform gateway's `verify_jwt` check (true only for
-- generate-weekly-report; the other two have verify_jwt=false but sending the
-- header anyway is harmless).

CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Interest settlement — weekly, Sunday 03:00 UTC (11:00 Asia/Taipei).
--    Actual accrual is still gated bi-weekly inside settle_weekly_interest()
--    itself (see 20260705050000); this cron tick just triggers the check.
--    Deliberately >8h away from the other two Sunday jobs below. No ordering
--    dependency on either — interest transactions (type='interest') are
--    excluded from the weekly report's coin-flow query (type IN ('earn','redeem')).
SELECT cron.schedule(
  'settle-weekly-interest-cron',
  '0 3 * * 0',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/settle-weekly-interest',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) AS request_id;
  $$
);

-- 2. Abandonment detection — daily 13:00 UTC (21:00 Asia/Taipei), matching
--    detect-abandonment/index.ts's own header comment. No body needed — the
--    function always processes every child unconditionally.
SELECT cron.schedule(
  'detect-abandonment-cron',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/detect-abandonment',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);

-- 3. Weekly report generation — Sunday 15:00 UTC (23:00 Asia/Taipei), matching
--    generate-weekly-report/index.ts's own header comment. Empty body triggers
--    its cron mode (iterates all children) — a non-empty {childId} body is
--    the separate on-demand path used by the parent-facing "regenerate" button.
--    verify_jwt=true for this function, so the Authorization header is load-bearing
--    here (not just harmless extra), unlike jobs 1-2.
SELECT cron.schedule(
  'generate-weekly-report-cron',
  '0 15 * * 0',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/generate-weekly-report',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);
