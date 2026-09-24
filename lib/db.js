// Lapisan database dengan dua mode:
// - Postgres kalau DATABASE_URL / POSTGRES_URL ada (Neon atau Supabase dari Vercel Marketplace).
// - SQLite bawaan Node kalau tidak ada (lokal: data/kerang.db, di Vercel: /tmp, hilang tiap redeploy).
// Query ditulis dengan placeholder "?" dan tanggal sebagai teks ISO supaya sama di dua mode.

import path from "node:path";
import fs from "node:fs";

const PG_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

export const storage = PG_URL ? "postgres" : process.env.VERCEL ? "sqlite-sementara" : "sqlite";

const SCHEMA_SQLITE = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    password_hash TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS personas (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    persona_id INTEGER REFERENCES personas(id) ON DELETE SET NULL,
    title TEXT NOT NULL, brief TEXT NOT NULL, turns TEXT NOT NULL DEFAULT '[]',
    history TEXT NOT NULL DEFAULT '[]', use_search INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'belum direkam', result_views INTEGER, result_notes TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_gen_user ON generations(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_gen_persona ON generations(persona_id, created_at);
`;

const SCHEMA_PG = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    password_hash TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS personas (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS generations (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    persona_id INTEGER REFERENCES personas(id) ON DELETE SET NULL,
    title TEXT NOT NULL, brief TEXT NOT NULL, turns TEXT NOT NULL DEFAULT '[]',
    history TEXT NOT NULL DEFAULT '[]', use_search INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'belum direkam', result_views INTEGER, result_notes TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_gen_user ON generations(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_gen_persona ON generations(persona_id, created_at);
`;

let driver = null;

async function init() {
  if (PG_URL) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });
    await pool.query(SCHEMA_PG);
    const toPg = (sql) => {
      let i = 0;
      return sql.replace(/\?/g, () => `$${++i}`);
    };
    driver = {
      async all(sql, params) {
        return (await pool.query(toPg(sql), params)).rows;
      },
      async run(sql, params) {
        const r = await pool.query(toPg(sql), params);
        return { changes: r.rowCount, rows: r.rows };
      },
    };
  } else {
    const { DatabaseSync } = await import("node:sqlite");
    const file =
      process.env.KERANG_DB ||
      (process.env.VERCEL ? "/tmp/kerang.db" : path.join(process.cwd(), "data", "kerang.db"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec(SCHEMA_SQLITE);
    driver = {
      async all(sql, params) {
        return db.prepare(sql).all(...params);
      },
      async run(sql, params) {
        const stmt = db.prepare(sql);
        if (/\bRETURNING\b/i.test(sql)) {
          const rows = stmt.all(...params);
          return { changes: rows.length, rows };
        }
        const r = stmt.run(...params);
        return { changes: Number(r.changes), rows: [] };
      },
    };
    if (process.env.VERCEL) {
      console.warn("DATABASE_URL belum diisi: data disimpan sementara di /tmp dan akan hilang.");
    }
  }
  await driver.run("DELETE FROM sessions WHERE expires_at < ?", [nowIso()]);
}

let initPromise = null;
export function ready() {
  initPromise ??= init().catch((err) => {
    initPromise = null; // coba lagi di request berikutnya
    throw err;
  });
  return initPromise;
}

export async function all(sql, params = []) {
  await ready();
  return driver.all(sql, params);
}

export async function one(sql, params = []) {
  return (await all(sql, params))[0] ?? null;
}

export async function run(sql, params = []) {
  await ready();
  return driver.run(sql, params);
}

export function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

export function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
