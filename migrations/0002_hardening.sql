-- Session revocation, token health, sync tracking, rate limits, extra indexes.
ALTER TABLE settings ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE google_tokens ADD COLUMN broken INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN google_calendar_id TEXT NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN sync_error TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);

CREATE INDEX IF NOT EXISTS idx_bookings_status_start_end ON bookings (status, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_bookings_end ON bookings (end_at);
