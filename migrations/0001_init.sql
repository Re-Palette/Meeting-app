-- MeetFlow initial schema

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  owner_name TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  google_calendar_ids TEXT NOT NULL DEFAULT '["primary"]',
  google_target_calendar_id TEXT NOT NULL DEFAULT 'primary',
  ics_urls TEXT NOT NULL DEFAULT '[]'
);

INSERT OR IGNORE INTO settings (id, owner_name, timezone, google_calendar_ids, google_target_calendar_id, ics_urls)
VALUES (1, '', 'Asia/Tokyo', '["primary"]', 'primary', '[]');

CREATE TABLE IF NOT EXISTS event_types (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_min INTEGER NOT NULL,
  location TEXT NOT NULL DEFAULT 'google_meet',
  location_detail TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'teal',
  active INTEGER NOT NULL DEFAULT 1,
  require_approval INTEGER NOT NULL DEFAULT 0,
  buffer_before_min INTEGER NOT NULL DEFAULT 0,
  buffer_after_min INTEGER NOT NULL DEFAULT 0,
  min_notice_hours INTEGER NOT NULL DEFAULT 0,
  max_days_ahead INTEGER NOT NULL DEFAULT 60,
  slot_interval_min INTEGER NOT NULL DEFAULT 30,
  availability TEXT NOT NULL DEFAULT '{}',
  questions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  event_type_id TEXT NOT NULL,
  event_title TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  location TEXT NOT NULL,
  location_detail TEXT NOT NULL DEFAULT '',
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_company TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  answers TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL,
  meet_url TEXT NOT NULL DEFAULT '',
  google_event_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_start ON bookings (start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_event_type ON bookings (event_type_id);

CREATE TABLE IF NOT EXISTS google_tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email TEXT NOT NULL DEFAULT '',
  refresh_token TEXT NOT NULL,
  access_token TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
