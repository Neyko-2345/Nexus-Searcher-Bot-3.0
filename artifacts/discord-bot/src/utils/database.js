import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const DB_PATH  = join(DATA_DIR, 'bot.db');

mkdirSync(DATA_DIR,                              { recursive: true });
mkdirSync(join(DATA_DIR, 'databases'),           { recursive: true });
mkdirSync(join(DATA_DIR, 'plugins'),             { recursive: true });

let db;

export function initDB() {
  db = new DatabaseSync(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT,
      credits INTEGER DEFAULT 5,
      max_daily_credits INTEGER DEFAULT 5,
      plan TEXT DEFAULT 'free',
      blacklisted INTEGER DEFAULT 0,
      last_claim TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS search_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      user_tag TEXT,
      query TEXT,
      search_type TEXT,
      result_count INTEGER DEFAULT 0,
      channel_id TEXT,
      timestamp TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
    );

    CREATE TABLE IF NOT EXISTS databases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      label TEXT,
      emoji TEXT DEFAULT '🗄️',
      filename TEXT,
      description TEXT,
      added_by TEXT,
      added_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
      entry_count INTEGER DEFAULT 0,
      vip_only INTEGER DEFAULT 0,
      show_in_menu INTEGER DEFAULT 1,
      file_url TEXT
    );

    CREATE TABLE IF NOT EXISTS db_embed_config (
      db_name TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      color TEXT DEFAULT '5865f2',
      thumbnail TEXT,
      fields_json TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS db_option_links (
      db_name TEXT,
      option_value TEXT,
      PRIMARY KEY (db_name, option_value)
    );

    CREATE TABLE IF NOT EXISTS plugins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      filename TEXT,
      option_value TEXT,
      vip_only INTEGER DEFAULT 0,
      description TEXT,
      added_by TEXT,
      added_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
    );

    CREATE TABLE IF NOT EXISTS plans (
      role_id TEXT PRIMARY KEY,
      plan_name TEXT,
      daily_credits INTEGER,
      unlimited INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS guild_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS temp_results (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      results TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
    );

    CREATE TABLE IF NOT EXISTS custom_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value TEXT UNIQUE,
      label TEXT,
      description TEXT,
      emoji TEXT,
      modal_label TEXT,
      modal_placeholder TEXT,
      modal_hint TEXT,
      vip_only INTEGER DEFAULT 0,
      position INTEGER DEFAULT 99,
      added_by TEXT,
      added_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
    );

    CREATE TABLE IF NOT EXISTS option_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value TEXT UNIQUE,
      label TEXT,
      emoji TEXT DEFAULT '📂',
      description TEXT,
      vip_only INTEGER DEFAULT 0,
      position INTEGER DEFAULT 50
    );

    CREATE TABLE IF NOT EXISTS option_group_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_value TEXT,
      target_value TEXT,
      label TEXT,
      emoji TEXT DEFAULT '',
      description TEXT DEFAULT '',
      position INTEGER DEFAULT 99,
      UNIQUE(group_value, target_value)
    );

    CREATE TABLE IF NOT EXISTS group_embed_config (
      group_value TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      color TEXT DEFAULT '3B3B44',
      thumbnail TEXT
    );

    CREATE TABLE IF NOT EXISTS option_embed_config (
      option_value TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      color TEXT DEFAULT '5865f2',
      thumbnail TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_owners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE,
      username TEXT,
      added_by TEXT,
      added_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
    );

    CREATE TABLE IF NOT EXISTS tools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '🔧',
      type TEXT DEFAULT 'script',
      github_url TEXT,
      github_owner TEXT,
      github_repo TEXT,
      description TEXT,
      query_types TEXT DEFAULT '["global"]',
      config_json TEXT DEFAULT '{}',
      scope TEXT DEFAULT 'global',
      enabled INTEGER DEFAULT 1,
      needs_api_key INTEGER DEFAULT 0,
      cache_ttl INTEGER DEFAULT 600,
      added_by TEXT,
      added_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
    );

    CREATE TABLE IF NOT EXISTS tool_option_links (
      tool_id TEXT,
      option_value TEXT,
      PRIMARY KEY (tool_id, option_value)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS panel_locks (
      guild_id TEXT PRIMARY KEY,
      locked INTEGER DEFAULT 0,
      locked_by TEXT,
      locked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS statut_log_config (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT
    );

    CREATE TABLE IF NOT EXISTS bot_action_logs (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT
    );

    CREATE TABLE IF NOT EXISTS search_embed_buttons (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Safe migrations for tables that already exist
  const safeAlter = (sql) => { try { db.exec(sql); } catch {} };
  safeAlter("ALTER TABLE search_logs ADD COLUMN user_tag TEXT");
  safeAlter("ALTER TABLE search_logs ADD COLUMN result_count INTEGER DEFAULT 0");
  safeAlter("ALTER TABLE search_logs ADD COLUMN channel_id TEXT");
  safeAlter("ALTER TABLE databases ADD COLUMN label TEXT");
  safeAlter("ALTER TABLE databases ADD COLUMN emoji TEXT DEFAULT '🗄️'");
  safeAlter("ALTER TABLE databases ADD COLUMN vip_only INTEGER DEFAULT 0");
  safeAlter("ALTER TABLE databases ADD COLUMN show_in_menu INTEGER DEFAULT 1");
  safeAlter("ALTER TABLE databases ADD COLUMN file_url TEXT");
  safeAlter("ALTER TABLE databases ADD COLUMN external_id TEXT");
  safeAlter("ALTER TABLE option_embed_config ADD COLUMN footer TEXT");
  safeAlter("ALTER TABLE option_embed_config ADD COLUMN image TEXT");
  safeAlter("ALTER TABLE db_embed_config ADD COLUMN footer TEXT");
  safeAlter("ALTER TABLE db_embed_config ADD COLUMN image TEXT");
  safeAlter("ALTER TABLE group_embed_config ADD COLUMN footer TEXT");
  safeAlter("ALTER TABLE group_embed_config ADD COLUMN image TEXT");
  safeAlter("ALTER TABLE option_embed_config ADD COLUMN footer_icon TEXT");
  safeAlter("ALTER TABLE group_embed_config ADD COLUMN footer_icon TEXT");
  safeAlter("ALTER TABLE databases ADD COLUMN parse_mode TEXT DEFAULT 'smart'");

  // ── Groupe ULP (si pas déjà présent) ──────────────────────────────────────
  const ulpExists = db.prepare("SELECT id FROM option_groups WHERE value = 'ulp'").get();
  if (!ulpExists) {
    db.prepare(`
      INSERT INTO option_groups (value, label, emoji, description, vip_only, position)
      VALUES ('ulp', 'ULP', '🔗', NULL, 0, 90)
    `).run();
    const ulpId = db.prepare("SELECT id FROM option_groups WHERE value = 'ulp'").get()?.id;
    if (ulpId) {
      const ulpItems = [
        { target_value: 'login',        label: 'L0gin / Email',  emoji: '📧', position: 1 },
        { target_value: 'ulp_password', label: 'Passw0rd',       emoji: '🔑', position: 2 },
        { target_value: 'url',          label: 'URL',            emoji: '🔗', position: 3 },
      ];
      for (const item of ulpItems) {
        try {
          db.prepare(`
            INSERT OR IGNORE INTO option_group_items (group_value, target_value, label, emoji, description, position)
            VALUES ('ulp', ?, ?, ?, '', ?)
          `).run(item.target_value, item.label, item.emoji, item.position);
        } catch {}
      }
    }
  }

  // ── Tool flowsint (si pas déjà présent) ───────────────────────────────────
  const flowsintExists = db.prepare("SELECT id FROM tools WHERE id = 'flowsint_mpzeaxlt'").get();
  if (!flowsintExists) {
    try {
      db.prepare(`
        INSERT INTO tools (id, name, emoji, type, github_url, github_owner, github_repo, description, query_types, scope, enabled, needs_api_key, cache_ttl, added_by)
        VALUES ('flowsint_mpzeaxlt', 'flowsint', '🔍', 'script',
          'https://github.com/reconurge/flowsint', 'reconurge', 'flowsint',
          'Vérificateur de username sur 15+ plateformes sociales (Sherlock-like)',
          '["username","name"]', 'global', 1, 0, 600, 'system')
      `).run();
    } catch (e) { console.warn('[DB] flowsint insert:', e.message); }
  }

  console.log('[DB] Database initialized at', DB_PATH);
  return db;
}

export function getDB() {
  if (!db) initDB();
  return db;
}

export { DATA_DIR };
