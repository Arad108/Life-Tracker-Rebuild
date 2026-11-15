import { makeDriver } from '../db';

/**
 * Additive tracker migrations.
 *
 * The shipped app's schema is the source of truth (analysis/schema.sql).
 * Every column add is guarded by PRAGMA table_info, so this can run on the
 * existing database without dropping or rewriting user data.
 */

async function hasColumn(table: string, column: string): Promise<boolean> {
  const d = makeDriver();
  const rows = await d.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

async function addColumn(table: string, column: string, ddl: string): Promise<void> {
  if (await hasColumn(table, column)) return;
  const d = makeDriver();
  await d.execAsync(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

export async function runTrackerMigrations(): Promise<void> {
  const d = makeDriver();

  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracker_fields (
      id TEXT PRIMARY KEY NOT NULL,
      tracker_id TEXT NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL,
      unit TEXT,
      options TEXT NOT NULL DEFAULT '[]',
      required INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      config TEXT NOT NULL DEFAULT '{}',
      UNIQUE (tracker_id, key)
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY NOT NULL,
      target_type TEXT NOT NULL DEFAULT 'custom',
      target_id TEXT,
      kind TEXT NOT NULL,
      time TEXT,
      days TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
      interval_minutes INTEGER,
      window_start TEXT,
      window_end TEXT,
      start_day TEXT,
      end_day TEXT,
      message TEXT NOT NULL DEFAULT '',
      only_if_not_done INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_entries_day ON tracker_entries (day);
    CREATE INDEX IF NOT EXISTS idx_entries_tracker_day ON tracker_entries (tracker_id, day);
    CREATE INDEX IF NOT EXISTS idx_fields_tracker ON tracker_fields (tracker_id, position);
    CREATE INDEX IF NOT EXISTS idx_schedules_target ON schedules (target_type, target_id);
  `);

  // trackers: bring the existing reduced table up to the recovered shape.
  await addColumn('trackers', 'template_key', 'template_key TEXT');
  await addColumn('trackers', 'status', "status TEXT NOT NULL DEFAULT 'active'");
  await addColumn('trackers', 'show_on_dashboard', 'show_on_dashboard INTEGER NOT NULL DEFAULT 1');
  await addColumn('trackers', 'config', "config TEXT NOT NULL DEFAULT '{}'");
  await addColumn('trackers', 'sort_order', 'sort_order INTEGER NOT NULL DEFAULT 0');

  // tracker_entries: keep the old value/note columns, add the JSON model.
  await addColumn('tracker_entries', 'occurred_at', 'occurred_at INTEGER NOT NULL DEFAULT 0');
  await addColumn('tracker_entries', 'data', "data TEXT NOT NULL DEFAULT '{}'");
  await addColumn('tracker_entries', 'updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0');

  await d.execAsync(`
    UPDATE tracker_entries SET occurred_at = created_at WHERE occurred_at = 0;
    UPDATE tracker_entries SET updated_at = created_at WHERE updated_at = 0;
  `);

  // spaces: the recovered table carries per-space settings JSON.
  await addColumn('spaces', 'settings', "settings TEXT NOT NULL DEFAULT '{}'");
}
