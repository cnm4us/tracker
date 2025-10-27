-- Migration: tracker initial schema
-- Always operate in UTC
SET time_zone = '+00:00';
SET NAMES utf8mb4;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  password_hash VARBINARY(255) NOT NULL,
  tz VARCHAR(64) NOT NULL DEFAULT 'UTC',
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sessions for long-lived auth (refresh tokens)
CREATE TABLE IF NOT EXISTS sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  user_agent VARCHAR(255) NULL,
  ip VARCHAR(45) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token_hash (token_hash),
  KEY idx_sessions_user_expires (user_id, expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Event types managed by admins
CREATE TABLE IF NOT EXISTS event_types (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_types_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Time entries
CREATE TABLE IF NOT EXISTS entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  site ENUM('clinic','remote') NOT NULL,
  start_utc DATETIME(6) NOT NULL,
  stop_utc DATETIME(6) NULL,
  notes TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_entries_user_start (user_id, start_utc),
  KEY idx_entries_user_stop (user_id, stop_utc),
  CONSTRAINT fk_entries_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Many-to-many between entries and event types
CREATE TABLE IF NOT EXISTS entry_events (
  entry_id BIGINT UNSIGNED NOT NULL,
  event_type_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (entry_id, event_type_id),
  CONSTRAINT fk_entry_events_entry FOREIGN KEY (entry_id)
    REFERENCES entries(id) ON DELETE CASCADE,
  CONSTRAINT fk_entry_events_event_type FOREIGN KEY (event_type_id)
    REFERENCES event_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed the initial event types (idempotent)
INSERT INTO event_types (name)
SELECT * FROM (SELECT 'Visit' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM event_types WHERE name = 'Visit');

INSERT INTO event_types (name)
SELECT * FROM (SELECT 'Charts' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM event_types WHERE name = 'Charts');

INSERT INTO event_types (name)
SELECT * FROM (SELECT 'Inbox' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM event_types WHERE name = 'Inbox');

INSERT INTO event_types (name)
SELECT * FROM (SELECT 'Hard Copy' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM event_types WHERE name = 'Hard Copy');

INSERT INTO event_types (name)
SELECT * FROM (SELECT 'Emails' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM event_types WHERE name = 'Emails');

INSERT INTO event_types (name)
SELECT * FROM (SELECT 'Workflow' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM event_types WHERE name = 'Workflow');

INSERT INTO event_types (name)
SELECT * FROM (SELECT 'Employee Tasks' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM event_types WHERE name = 'Employee Tasks');

INSERT INTO event_types (name)
SELECT * FROM (SELECT 'UKG/Payroll' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM event_types WHERE name = 'UKG/Payroll');

INSERT INTO event_types (name)
SELECT * FROM (SELECT 'Cloud Space' AS name) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM event_types WHERE name = 'Cloud Space');

