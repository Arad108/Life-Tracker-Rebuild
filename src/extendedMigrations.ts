import { makeDriver } from './db';

export async function runExtendedMigrations() {
  const d = makeDriver();
  // Migrate goal_milestones to original schema if old schema present.
  const cols = await d.getAllAsync<{ name: string }>('PRAGMA table_info(goal_milestones)');
  const hasDone = cols.some((c) => c.name === 'done');
  if (hasDone) {
    await d.execAsync('DROP TABLE goal_milestones;');
  }
  // Migrate so_people to original schema if old schema present.
  const soCols = await d.getAllAsync<{ name: string }>('PRAGMA table_info(so_people)');
  const hasNotes = soCols.some((c) => c.name === 'notes');
  if (hasNotes && !soCols.some((c) => c.name === 'met_context')) {
    await d.execAsync('DROP TABLE so_people;');
  }
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      space_key TEXT NOT NULL DEFAULT 'general',
      kind TEXT NOT NULL DEFAULT 'target',
      metric TEXT NOT NULL DEFAULT '',
      target REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT '',
      period TEXT NOT NULL DEFAULT 'none',
      start_day TEXT,
      deadline TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS goal_milestones (
      id TEXT PRIMARY KEY NOT NULL,
      goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      due_day TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      done_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS goal_checkins (
      id TEXT PRIMARY KEY NOT NULL,
      goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY NOT NULL,
      day TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      mood INTEGER NOT NULL DEFAULT 3,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      time_window TEXT NOT NULL DEFAULT '',
      days TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS routine_steps (
      id TEXT PRIMARY KEY NOT NULL,
      routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS routine_checks (
      id TEXT PRIMARY KEY NOT NULL,
      routine_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      day TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      day TEXT,
      time TEXT NOT NULL DEFAULT '09:00',
      recurrence TEXT NOT NULL DEFAULT 'once',
      done INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);
  // Social tables
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS so_people (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      circle TEXT NOT NULL DEFAULT 'Friends',
      met_context TEXT NOT NULL DEFAULT '',
      photo_uri TEXT,
      cadence_days INTEGER,
      extra TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS so_facts (
      id TEXT PRIMARY KEY NOT NULL,
      person_id TEXT NOT NULL REFERENCES so_people(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      date TEXT,
      done_at INTEGER,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS so_interactions (
      id TEXT PRIMARY KEY NOT NULL,
      day TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'talked',
      note TEXT NOT NULL DEFAULT '',
      is_new_person INTEGER NOT NULL DEFAULT 0,
      is_challenging INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS so_interaction_people (
      interaction_id TEXT NOT NULL REFERENCES so_interactions(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES so_people(id) ON DELETE CASCADE,
      PRIMARY KEY (interaction_id, person_id)
    );
    CREATE TABLE IF NOT EXISTS so_notes (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL DEFAULT 'reflection',
      text TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      person_id TEXT REFERENCES so_people(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_so_interactions_day ON so_interactions (day);
    CREATE INDEX IF NOT EXISTS idx_so_facts_person ON so_facts (person_id);
  `);
}
