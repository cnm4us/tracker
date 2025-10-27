-- Migration 002: duration-only support and local day key
SET time_zone = '+00:00';
SET NAMES utf8mb4;

ALTER TABLE entries
  ADD COLUMN duration_min INT UNSIGNED NULL AFTER stop_utc,
  ADD COLUMN start_local_date DATE NULL AFTER site;

-- Allow duration-only entries (no exact times)
ALTER TABLE entries
  MODIFY start_utc DATETIME(6) NULL;

-- Backfill duration for existing rows that have stop_utc
UPDATE entries
SET duration_min = TIMESTAMPDIFF(MINUTE, start_utc, stop_utc)
WHERE stop_utc IS NOT NULL AND duration_min IS NULL;

-- Backfill local date (fallback to UTC date of start)
UPDATE entries
SET start_local_date = DATE(start_utc)
WHERE start_local_date IS NULL AND start_utc IS NOT NULL;

-- Ensure local date is present
ALTER TABLE entries
  MODIFY start_local_date DATE NOT NULL;

-- Useful index for per-day queries
CREATE INDEX idx_entries_user_date ON entries(user_id, start_local_date);

