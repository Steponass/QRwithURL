-- Users table: stores subdomain choices for authenticated users.
-- A row is created when a user first claims a subdomain (not on signup).
-- subdomain is nullable so that a user row can exist without one,
-- and UNIQUE so no two users can claim the same subdomain.
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clerk_user_id TEXT NOT NULL UNIQUE,
    subdomain TEXT UNIQUE,
    plan TEXT NOT NULL DEFAULT 'free',
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

-- QR codes table: stores metadata for generated QR code images.
-- The actual PNG is stored in R2 at the path in storage_path.
-- customization is a JSON string: {"fg":"#000","bg":"#fff","size":512,"ec":"M"}
--
-- ON DELETE CASCADE: when a URL is deleted, its QR codes are too.
-- This also means the R2 object becomes orphaned — we'll handle that
-- in the delete-url action by cleaning up R2 before deleting the URL row.
CREATE TABLE IF NOT EXISTS qr_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    url_id INTEGER NOT NULL,
    url_type TEXT NOT NULL,
    encoded_url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    customization TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE
);

-- Speed up "show me my QR codes" queries
CREATE INDEX IF NOT EXISTS idx_qr_codes_user_id
ON qr_codes (user_id);

-- Speed up "how many QR codes for this URL?" lookups
CREATE INDEX IF NOT EXISTS idx_qr_codes_url_id
ON qr_codes (url_id);


-- Click analytics table: one row per click on any short URL.
-- This table grows continuously — every redirect creates a row.
-- With 10 URLs per free user, even heavy traffic is manageable:
--   100 clicks/day × 10 URLs × 365 days = 365K rows/year (~35MB)
--
-- ON DELETE CASCADE: when a URL is deleted, all its clicks go too.
-- We also explicitly delete in the action handler as a safety net
-- (same belt-and-suspenders approach as with qr_codes).
CREATE TABLE IF NOT EXISTS url_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_id INTEGER NOT NULL,
    clicked_at TEXT NOT NULL DEFAULT (datetime('now')),
    referrer TEXT,
    country TEXT,
    device_type TEXT,
    visitor_hash TEXT,
    FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE
);

-- Primary analytics index: powers "clicks over time" queries.
-- Composite index on (url_id, clicked_at) lets D1 efficiently answer:
--   SELECT COUNT(*) FROM url_clicks WHERE url_id = ? AND clicked_at > ?
-- without scanning the entire table. The url_id comes first because
-- every analytics query is scoped to a single URL.
CREATE INDEX IF NOT EXISTS idx_clicks_url_id_clicked_at
ON url_clicks (url_id, clicked_at);

-- Unique visitor index: powers "unique visitors per day" queries.
-- The visitor_hash changes daily (IP + date + salt), so counting
-- DISTINCT visitor_hash for a given url_id gives unique visitors.
CREATE INDEX IF NOT EXISTS idx_clicks_url_id_visitor_hash
ON url_clicks (url_id, visitor_hash);