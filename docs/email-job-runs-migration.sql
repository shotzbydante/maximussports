-- email_job_runs — tracks each cron digest send for admin visibility
-- Run this migration once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS email_job_runs (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  digest_type     text        NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  status          text        NOT NULL DEFAULT 'running',
  scanned_count   integer     DEFAULT 0,
  eligible_count  integer     DEFAULT 0,
  sent_count      integer     DEFAULT 0,
  failed_count    integer     DEFAULT 0,
  skipped_counts  jsonb       DEFAULT '{}',
  error_message   text,
  run_mode        text        DEFAULT 'scheduled',
  created_at      timestamptz DEFAULT now()
);

-- run_mode: 'scheduled' (cron), 'manual' (admin global send), 'override' (admin force-all)

CREATE INDEX IF NOT EXISTS idx_email_job_runs_type_started
  ON email_job_runs (digest_type, started_at DESC);

-- email_send_log — per-user send log (ensure table exists)
CREATE TABLE IF NOT EXISTS email_send_log (
  id        uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id   uuid        NOT NULL,
  email     text        NOT NULL,
  type      text        NOT NULL,
  date_key  text        NOT NULL,
  sent_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_send_log_date_key
  ON email_send_log (date_key);
CREATE INDEX IF NOT EXISTS idx_email_send_log_user_type
  ON email_send_log (user_id, type);

-- If table already existed without run_mode, add the column:
ALTER TABLE email_job_runs ADD COLUMN IF NOT EXISTS run_mode text DEFAULT 'scheduled';

-- RLS: email_job_runs is server-only (service role), no user access needed
ALTER TABLE email_job_runs ENABLE ROW LEVEL SECURITY;
-- RLS: email_send_log is server-only
ALTER TABLE email_send_log ENABLE ROW LEVEL SECURITY;
