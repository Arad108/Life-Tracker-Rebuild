import { makeDriver } from './db';

export async function runAppMigrations() {
  const d = makeDriver();
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS spaces (
      key TEXT PRIMARY KEY NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      pinned INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS trackers (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'ellipse',
      color TEXT NOT NULL DEFAULT '#4F46E5',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tracker_entries (
      id TEXT PRIMARY KEY NOT NULL,
      tracker_id TEXT NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wk_exercises (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      muscle TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wk_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      day TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wk_sets (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES wk_sessions(id) ON DELETE CASCADE,
      exercise_id TEXT NOT NULL,
      weight_kg REAL NOT NULL DEFAULT 0,
      reps INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wd_items (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'tops',
      color TEXT NOT NULL DEFAULT '',
      brand TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS so_people (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      circle TEXT NOT NULL DEFAULT 'Friends',
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `);
  // seed built-in spaces
  const builtins = ['finance', 'workout', 'wardrobe', 'social', 'trackers'];
  for (let i = 0; i < builtins.length; i++) {
    await d.runAsync(
      'INSERT OR IGNORE INTO spaces (key, enabled, pinned, position) VALUES (?, 1, ?, ?)',
      [builtins[i], i < 4 ? 1 : 0, i],
    );
  }
}
