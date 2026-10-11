-- GamePinned Licensing Database Schema (Cloudflare D1)

-- 1. Licenses Table (The "Master Keys")
CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT UNIQUE NOT NULL,    -- Polar webhook generates: GP-XXXXXXXX (e.g. GP-A1B2C3D4). Admin-created keys can be any format.
    tier TEXT DEFAULT 'PERPETUAL',       -- 'FREE', 'PERPETUAL', 'SUBSCRIPTION', or 'TRIAL'
    seat_limit INTEGER DEFAULT 1,        -- How many unique HWIDs allowed
    expiry_date DATETIME,                -- NULL for FREE/PERPETUAL, required for SUBSCRIPTION/TRIAL
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1,         -- 1 = True, 0 = False
    customer_info TEXT,                  -- JSON: { email, product, webhook_id, source, trial_days, created_at, converted_at, converted_to_key }
    reminder_count INTEGER DEFAULT 0,    -- Number of trial reminder emails sent (0=none, 1=day-11 sent, 2=day-13 sent)
    nurture_count INTEGER DEFAULT 0,     -- Number of onboarding nurture emails sent (0=none, 1=day-7 sent, 2=day-20 sent)
    email TEXT DEFAULT '',               -- Customer email (indexed column — do not use customer_info JSON for queries)
    polar_subscription_id TEXT DEFAULT '',-- Polar subscription ID (indexed — used for renewal/cancellation webhook lookups)
    polar_customer_id TEXT DEFAULT ''    -- Polar customer ID (for reference/future Polar API calls)
);

-- Tier Definitions:
-- FREE: Limited to 1 game, no expiry (perpetual)
-- PERPETUAL: Unlimited games, one-time payment, no expiry
-- SUBSCRIPTION: Unlimited games, recurring payment, requires expiry_date
-- TRIAL: Unlimited games, time-limited (default 30 days via TRIAL_DAYS env var), requires expiry_date. One trial per email + one per HWID.

CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);
CREATE INDEX IF NOT EXISTS idx_licenses_sub_id ON licenses(polar_subscription_id);

-- 2. Devices Table (HWID Registration)
CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_id INTEGER NOT NULL,
    hwid_hash TEXT NOT NULL,             -- Multi-part SHA256(CPU)|SHA256(MB)|SHA256(DISK)
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_reported_hwid TEXT,             -- Most recent HWID reported (may differ from hwid_hash if hardware changed)
    hwid_mismatch INTEGER DEFAULT 0,     -- 1 if last_reported_hwid != hwid_hash (hardware change detected)
    FOREIGN KEY (license_id) REFERENCES licenses(id),
    UNIQUE(license_id, hwid_hash)        -- One HWID per license registration
);

CREATE INDEX IF NOT EXISTS idx_devices_hwid ON devices(hwid_hash);
CREATE INDEX IF NOT EXISTS idx_devices_license ON devices(license_id);

-- 3. Updates Table (Version Management)
CREATE TABLE IF NOT EXISTS updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT UNIQUE NOT NULL,        -- e.g., "3.0.1"
    download_url TEXT NOT NULL,          -- CDN URL for the .exe file
    release_notes TEXT,                  -- Markdown release notes
    required INTEGER DEFAULT 0,          -- 1 = Required update, 0 = Optional
    file_size INTEGER,                   -- File size in bytes
    sha256_hash TEXT,                    -- File integrity hash
    release_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1          -- 1 = Active, 0 = Disabled
);

-- 6. Rate Limiting Table (Brute Force Protection)
CREATE TABLE IF NOT EXISTS rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL,
    endpoint TEXT NOT NULL,                  -- e.g., "/api/admin", "/api/activate"
    attempts INTEGER DEFAULT 1,
    first_attempt DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP,
    blocked_until DATETIME,                  -- NULL if not blocked
    UNIQUE(ip_address, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON rate_limits(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limits_blocked ON rate_limits(blocked_until);

-- 7. Admin Actions Audit Log
CREATE TABLE IF NOT EXISTS admin_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,              -- e.g., 'delete_license', 'edit_tier', 'toggle_license', 'unblock_ip', 'delete_device'
    target_id TEXT,                    -- ID of the affected resource
    details TEXT,                      -- JSON blob with before/after state
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_timestamp ON admin_actions(timestamp);

-- 8. Diagnostic Reports Table (User-submitted debug logs)
CREATE TABLE IF NOT EXISTS diagnostic_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hardware_id TEXT NOT NULL,               -- Full hardware ID from client
    raw_license_key TEXT,                    -- Raw GP-XXXXXXXX key (may be empty for free tier)
    r2_key TEXT NOT NULL,                    -- R2 object key: diagnostics/{hwid_prefix}/{timestamp}.log
    file_size INTEGER DEFAULT 0,             -- Log content size in bytes
    app_version TEXT,                        -- Client app version (e.g., "1.0.1")
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_reports_hwid ON diagnostic_reports(hardware_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_reports_submitted ON diagnostic_reports(submitted_at);

-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATIONS (run manually against D1 for existing installations upgrading)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── v2.x migrations (Customer identity columns) ──
-- Run once on existing D1 databases — safe to run even if columns already exist (will error, just skip):
-- npx wrangler d1 execute gamepinned-db --remote --command "ALTER TABLE licenses ADD COLUMN email TEXT DEFAULT ''"
-- npx wrangler d1 execute gamepinned-db --remote --command "ALTER TABLE licenses ADD COLUMN polar_subscription_id TEXT DEFAULT ''"
-- npx wrangler d1 execute gamepinned-db --remote --command "ALTER TABLE licenses ADD COLUMN polar_customer_id TEXT DEFAULT ''"
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email)"
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE INDEX IF NOT EXISTS idx_licenses_sub_id ON licenses(polar_subscription_id)"
-- Backfill email + polar_subscription_id from existing customer_info JSON (run after adding columns):
-- npx wrangler d1 execute gamepinned-db --remote --command "UPDATE licenses SET email = COALESCE(json_extract(customer_info, '$.email'), '') WHERE customer_info LIKE '{%' AND email = ''"
-- npx wrangler d1 execute gamepinned-db --remote --command "UPDATE licenses SET polar_subscription_id = COALESCE(json_extract(customer_info, '$.subscription_id'), '') WHERE customer_info LIKE '{%' AND polar_subscription_id = ''"
-- Run once on existing D1 databases to add the diagnostic_reports table:
-- (new installs get it from CREATE TABLE IF NOT EXISTS above)
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE TABLE IF NOT EXISTS diagnostic_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, hardware_id TEXT NOT NULL, raw_license_key TEXT, r2_key TEXT NOT NULL, file_size INTEGER DEFAULT 0, app_version TEXT, submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
--
-- ── v1.1 migrations (Feature batch: health, search, notes, expiring, version adoption) ──
-- Add notes column to licenses table (run once on existing D1 databases):
-- npx wrangler d1 execute gamepinned-db --remote --command "ALTER TABLE licenses ADD COLUMN notes TEXT DEFAULT ''"
--
-- ── v1.1 indexes (performance) ──
-- Add missing indexes for query performance (safe to run on existing DBs — CREATE INDEX IF NOT EXISTS):
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE INDEX IF NOT EXISTS idx_devices_hwid ON devices(hwid_hash)"
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE INDEX IF NOT EXISTS idx_devices_license ON devices(license_id)"
--
-- ── v2.1 migrations (Feature batch: 30-day trial system) ──
-- Add reminder_count column to licenses (trial reminder tracking):
-- npx wrangler d1 execute gamepinned-db --remote --command "ALTER TABLE licenses ADD COLUMN reminder_count INTEGER DEFAULT 0"
--
-- ── v2.2 migrations (trial nurture emails) ──
-- Add nurture_count column to licenses (onboarding nurture tracking):
-- npx wrangler d1 execute gamepinned-db --remote --command "ALTER TABLE licenses ADD COLUMN nurture_count INTEGER DEFAULT 0"

-- 9. Download Events (installer download tracking)
CREATE TABLE IF NOT EXISTS download_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_hash TEXT NOT NULL,          -- SHA256 of connecting IP (privacy-safe dedup)
    country TEXT DEFAULT 'XX',      -- ISO 3166-1 alpha-2 country code (from Cloudflare cf.country)
    version TEXT,                   -- Filename/version that was downloaded
    source TEXT DEFAULT 'direct',   -- 'website' | 'autoupdate' | 'direct'
    user_agent TEXT                 -- Truncated UA string (first 150 chars)
);

CREATE INDEX IF NOT EXISTS idx_download_events_timestamp ON download_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_download_events_country ON download_events(country);
CREATE INDEX IF NOT EXISTS idx_download_events_source ON download_events(source);

-- ── Download tracking migration (run once on existing D1 databases) ──
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE TABLE IF NOT EXISTS download_events (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, ip_hash TEXT NOT NULL, country TEXT DEFAULT 'XX', version TEXT, source TEXT DEFAULT 'direct', user_agent TEXT)"
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE INDEX IF NOT EXISTS idx_download_events_timestamp ON download_events(timestamp)"
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE INDEX IF NOT EXISTS idx_download_events_country ON download_events(country)"
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE INDEX IF NOT EXISTS idx_download_events_source ON download_events(source)"

-- 10. Newsletter Subscribers
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'blog'             -- Where they signed up: 'blog', 'website', etc.
);

CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);

-- ── Newsletter migration (run once on existing D1 databases) ──
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE TABLE IF NOT EXISTS newsletter_subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP, source TEXT DEFAULT 'blog')"
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email)"

-- 12. Backend Logs (structured event log for all backend activity)
CREATE TABLE IF NOT EXISTS backend_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   TEXT    NOT NULL DEFAULT (datetime('now')),
    level       TEXT    NOT NULL DEFAULT 'info',  -- 'info' | 'warn' | 'error'
    category    TEXT    NOT NULL,                 -- 'auth' | 'license' | 'webhook' | 'download' | 'email' | 'rate_limit' | 'cron' | 'error' | 'system'
    event       TEXT    NOT NULL,                 -- specific event name e.g. 'activation_success'
    ip          TEXT,                             -- client IP address
    license_key TEXT,                             -- raw GP-XXXXXXXX key (never the HMAC blob)
    message     TEXT    NOT NULL,                 -- human-readable one-liner
    data        TEXT                              -- JSON blob for additional detail
);

CREATE INDEX IF NOT EXISTS idx_bl_timestamp   ON backend_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_bl_level       ON backend_logs(level);
CREATE INDEX IF NOT EXISTS idx_bl_category    ON backend_logs(category);
CREATE INDEX IF NOT EXISTS idx_bl_license_key ON backend_logs(license_key);
CREATE INDEX IF NOT EXISTS idx_bl_ip          ON backend_logs(ip);

-- Retention: cron deletes rows older than 30 days (errors kept 90 days) — see cron/index.ts cleanupOldLogs()

-- ── backend_logs migration (run once on existing D1 databases) ──
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE TABLE IF NOT EXISTS backend_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL DEFAULT (datetime('now')), level TEXT NOT NULL DEFAULT 'info', category TEXT NOT NULL, event TEXT NOT NULL, ip TEXT, license_key TEXT, message TEXT NOT NULL, data TEXT)"
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE INDEX IF NOT EXISTS idx_bl_timestamp ON backend_logs(timestamp DESC)"
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE INDEX IF NOT EXISTS idx_bl_level ON backend_logs(level)"
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE INDEX IF NOT EXISTS idx_bl_category ON backend_logs(category)"
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE INDEX IF NOT EXISTS idx_bl_license_key ON backend_logs(license_key)"
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE INDEX IF NOT EXISTS idx_bl_ip ON backend_logs(ip)"

-- 13. Feedback Submissions (website support form)
CREATE TABLE IF NOT EXISTS feedback_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    feedback_type TEXT NOT NULL,
    platform_name TEXT,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_submitted ON feedback_submissions(submitted_at);

-- ── Feedback submissions migration (run once on existing D1 databases) ──
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE TABLE IF NOT EXISTS feedback_submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, feedback_type TEXT NOT NULL, platform_name TEXT, subject TEXT NOT NULL, description TEXT NOT NULL, submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
-- npx wrangler d1 execute gamepinned-db --remote --command "CREATE INDEX IF NOT EXISTS idx_feedback_submitted ON feedback_submissions(submitted_at)"

-- 14. Public Status Page
CREATE TABLE IF NOT EXISTS status_components (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'operational',
    display_order INTEGER NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO status_components (id, name, description, status, display_order) VALUES
    ('licensing-api', 'Licensing & Activation', 'License activation, validation, and account sync.', 'operational', 1),
    ('update-downloads', 'Update Downloads', 'GamePinned update checks and installer delivery.', 'operational', 2),
    ('website', 'GamePinned Website', 'Website, documentation, and product downloads.', 'operational', 3),
    ('diagnostics', 'Support Diagnostics', 'Manual support diagnostic uploads.', 'operational', 4);

CREATE TABLE IF NOT EXISTS status_incidents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    impact TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    affected_components TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
);

CREATE TABLE IF NOT EXISTS status_incident_updates (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS status_maintenance (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_status_incidents_updated ON status_incidents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_incident_updates_incident ON status_incident_updates(incident_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_status_maintenance_dates ON status_maintenance(starts_at, ends_at);

-- Run against existing D1 before deploying this feature:
-- npx wrangler d1 execute gamepinned-db --remote --file=schema.sql
-- Initial Mock Data (Commented out for safety)
-- INSERT OR REPLACE INTO licenses (license_key, tier, seat_limit) VALUES ('DEBUG-KEY-100', 'PRO', 100);
