-- active_days: which weekdays count as valid check-in days for habit goals.
-- 0=Sunday, 1=Monday, ..., 6=Saturday (matches JS Date.prototype.getDay()).
-- NULL means every day is valid — backward-compatible with all existing rows.
ALTER TABLE long_term_goals
  ADD COLUMN IF NOT EXISTS active_days integer[] DEFAULT NULL;
