-- Extend day_type to allow 'custom' (specific weekdays) and 'once' (one-time with optional due date)

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_day_type_check;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_day_type_check
  CHECK (day_type IN ('weekday', 'weekend', 'both', 'custom', 'once'));

-- Stores selected weekday indices for 'custom' tasks: 0=Sun, 1=Mon, ..., 6=Sat
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence_days integer[] DEFAULT NULL;

-- Optional deadline for 'once' tasks; task is hidden from child list after this date
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS due_date date DEFAULT NULL;
