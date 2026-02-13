-- Users table: stores subdomain choices for authenticated users.
-- A row is created when a user first claims a subdomain (not on signup).
-- subdomain is nullable so that a user row can exist without one,
-- and UNIQUE so no two users can claim the same subdomain.
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clerk_user_id TEXT NOT NULL UNIQUE,
    subdomain TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- URLs table: stores all short URL mappings
CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    shortcode TEXT NOT NULL,
    original_url TEXT NOT NULL,
    subdomain TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT
);

-- Uniqueness for (subdomain, shortcode) combinations.
-- COALESCE converts NULL to '' so that two short-format URLs
-- (subdomain=NULL) with the same shortcode are correctly rejected.
-- Without this, SQLite treats NULL != NULL for uniqueness,
-- which would allow duplicate shortcodes in short format.
CREATE UNIQUE INDEX IF NOT EXISTS idx_urls_subdomain_shortcode
ON urls (COALESCE(subdomain, ''), shortcode);

-- Speed up lookups by user (for "show me my URLs" queries)
CREATE INDEX IF NOT EXISTS idx_urls_user_id
ON urls (user_id);