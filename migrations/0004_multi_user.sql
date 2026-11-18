-- Multi-user: owner + invited members. Existing single-owner data is assigned to user 'owner'.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE, -- lowercased Google email; NULL for the owner until Google is connected
  role TEXT NOT NULL DEFAULT 'member',
  session_version INTEGER NOT NULL DEFAULT 1,
  invited_at TEXT NOT NULL DEFAULT '',
  last_login_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  picture TEXT NOT NULL DEFAULT '', -- Google profile picture URL
  google_name TEXT NOT NULL DEFAULT '' -- last display name synced from Google
);

INSERT INTO users (id, email, role, session_version, invited_at, last_login_at, created_at)
VALUES (
  'owner',
  (SELECT lower(email) FROM google_tokens WHERE id = 1 AND email != ''),
  'owner',
  COALESCE((SELECT session_version FROM settings WHERE id = 1), 1),
  '',
  '',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

-- settings: one row per user
CREATE TABLE settings_new (
  user_id TEXT PRIMARY KEY,
  owner_name TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  google_calendar_ids TEXT NOT NULL DEFAULT '["primary"]',
  google_target_calendar_id TEXT NOT NULL DEFAULT 'primary',
  ics_urls TEXT NOT NULL DEFAULT '[]',
  busy_rules TEXT NOT NULL DEFAULT '[]'
);
INSERT INTO settings_new (user_id, owner_name, timezone, google_calendar_ids, google_target_calendar_id, ics_urls, busy_rules)
  SELECT 'owner', owner_name, timezone, google_calendar_ids, google_target_calendar_id, ics_urls, busy_rules FROM settings WHERE id = 1;
INSERT OR IGNORE INTO settings_new (user_id) VALUES ('owner');
DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;

-- google_tokens: one row per user
CREATE TABLE google_tokens_new (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  refresh_token TEXT NOT NULL,
  access_token TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  broken INTEGER NOT NULL DEFAULT 0
);
INSERT INTO google_tokens_new (user_id, email, refresh_token, access_token, expires_at, updated_at, broken)
  SELECT 'owner', email, refresh_token, access_token, expires_at, updated_at, broken FROM google_tokens WHERE id = 1;
DROP TABLE google_tokens;
ALTER TABLE google_tokens_new RENAME TO google_tokens;

ALTER TABLE event_types ADD COLUMN user_id TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE bookings ADD COLUMN user_id TEXT NOT NULL DEFAULT 'owner';
CREATE INDEX idx_event_types_user ON event_types (user_id);
CREATE INDEX idx_bookings_user_status_start ON bookings (user_id, status, start_at);
