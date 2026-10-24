import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { DB_PATH, ensureDataDir } from "../lib/paths";
import * as schema from "./schema";

ensureDataDir();

const sqlite = new Database(DB_PATH, { create: true });
sqlite.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    transport TEXT NOT NULL DEFAULT 'stdio',
    command TEXT,
    args TEXT NOT NULL DEFAULT '[]',
    url TEXT,
    env_enc TEXT NOT NULL DEFAULT '',
    env_keys TEXT NOT NULL DEFAULT '[]',
    header_enc TEXT NOT NULL DEFAULT '',
    header_keys TEXT NOT NULL DEFAULT '[]',
    required_env TEXT NOT NULL DEFAULT '[]',
    required_headers TEXT NOT NULL DEFAULT '[]',
    category TEXT NOT NULL DEFAULT 'General',
    tags TEXT NOT NULL DEFAULT '[]',
    homepage TEXT,
    repository TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    source_id TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS installations (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    harness_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    config_key TEXT NOT NULL DEFAULT '',
    config_path TEXT NOT NULL DEFAULT '',
    installed_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS installations_server_harness_idx
    ON installations (server_id, harness_id);
  CREATE INDEX IF NOT EXISTS installations_harness_idx
    ON installations (harness_id);

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success',
    harness_id TEXT,
    server_id TEXT,
    server_name TEXT,
    message TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS events_created_idx ON events (created_at);

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Forward-compatible migration for databases created before config_key existed.
try {
  sqlite.exec(
    "ALTER TABLE installations ADD COLUMN config_key TEXT NOT NULL DEFAULT ''",
  );
} catch {
  // column already exists
}
try {
  sqlite.exec(
    "ALTER TABLE servers ADD COLUMN required_headers TEXT NOT NULL DEFAULT '[]'",
  );
} catch {
  // column already exists
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
