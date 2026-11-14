/**
 * I0 — Backup restore.
 *
 * The export format was recovered from the shipped app (`exportAllData` in the
 * decompiled bundle), not invented:
 *
 *   {
 *     "app": "life-tracker",
 *     "backupVersion": 2,
 *     "schemaVersion": <PRAGMA user_version, or null>,
 *     "exportedAt": "<ISO timestamp>",
 *     "note": "Photos are stored on the phone and are not included in this file.",
 *     "trackers": [ ... ],
 *     "fin_transactions": [ ... ],
 *     ... one top-level key per table, in sqlite_master name order
 *   }
 *
 * Serialised with `JSON.stringify(data, null, 2)`. There is **no** `tables`
 * wrapper — table rows sit at the top level.
 *
 * The app has no import path at all, so this module is the missing half. It is
 * deliberately conservative:
 *
 *   - structure and version are validated before a single write;
 *   - every write happens in one transaction, so a failure rolls back;
 *   - `merge` is the default and upserts by primary key, so restoring the same
 *     file twice cannot duplicate rows;
 *   - `replace` is opt-in and only ever touches tables present in the file;
 *   - foreign keys are deferred inside the transaction, so table order in the
 *     file does not matter.
 */

import { stableHash, stableStringify } from './hash';
import { inspectSchema } from './introspect';
import type { DbSchema } from './introspect';
import { getSetting, setSetting } from './settings';
import { SETTING_KEYS } from './schema';
import { quoteIdentifier } from './sql';
import { withTransaction } from './driver';
import type { SqliteDriver, SqlParam } from './driver';

export const BACKUP_APP = 'life-tracker';
export const BACKUP_VERSION = 2;
export const BACKUP_NOTE =
  'Photos are stored on the phone and are not included in this file.';

/** Keys that describe the file rather than carry table rows. */
export const BACKUP_META_KEYS = [
  'app',
  'backupVersion',
  'schemaVersion',
  'exportedAt',
  'note',
] as const;

/**
 * A file without these is not a usable Life Tracker backup. Every table in the
 * app is created by migration, so a current backup always contains them even
 * when they are empty.
 */
export const REQUIRED_BACKUP_TABLES = [
  'settings',
  'fin_categories',
  'fin_transactions',
] as const;

export type BackupCell = string | number | boolean | null;
export type BackupRow = Readonly<Record<string, BackupCell>>;

export interface BackupFile {
  readonly app: string;
  readonly backupVersion: number;
  readonly schemaVersion: number | null;
  readonly exportedAt: string | null;
  readonly note: string | null;
  /** Table name → rows, in the order the file listed them. */
  readonly tables: ReadonlyMap<string, readonly BackupRow[]>;
}

export type BackupErrorCode =
  | 'invalid-json'
  | 'not-an-object'
  | 'wrong-app'
  | 'missing-version'
  | 'bad-version'
  | 'unsupported-version'
  | 'bad-schema-version'
  | 'bad-metadata'
  | 'bad-table'
  | 'bad-row'
  | 'bad-value'
  | 'incomplete'
  | 'unknown-table'
  | 'unknown-column'
  | 'missing-table'
  | 'missing-primary-key-value'
  | 'no-primary-key';

export interface BackupError {
  readonly ok: false;
  readonly code: BackupErrorCode;
  readonly message: string;
}

function fail(code: BackupErrorCode, message: string): BackupError {
  return { ok: false, code, message };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type BackupParseResult =
  | { readonly ok: true; readonly backup: BackupFile }
  | BackupError;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCell(value: unknown): value is BackupCell {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Parse and structurally validate a backup. Pure: no database, no writes.
 *
 * Structural errors are reported here. Whether the tables and columns match
 * *this* database is checked later by `planRestore`, which needs the schema.
 */
export function parseBackup(text: string): BackupParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('invalid-json', 'The file is not valid JSON.');
  }

  if (!isPlainObject(raw)) {
    return fail('not-an-object', 'A backup must be a JSON object.');
  }

  if (raw.app !== BACKUP_APP) {
    return fail(
      'wrong-app',
      `This is not a Life Tracker backup (expected app "${BACKUP_APP}", found ${JSON.stringify(raw.app)}).`,
    );
  }

  const version = raw.backupVersion;
  if (version === undefined) {
    return fail('missing-version', 'The backup does not declare a backupVersion.');
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return fail('bad-version', `backupVersion must be a positive integer; found ${JSON.stringify(version)}.`);
  }
  if (version > BACKUP_VERSION) {
    return fail(
      'unsupported-version',
      `This backup was written by a newer version (backupVersion ${version}; this app supports up to ${BACKUP_VERSION}).`,
    );
  }

  let schemaVersion: number | null = null;
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== null) {
    if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion)) {
      return fail('bad-schema-version', 'schemaVersion must be an integer or null.');
    }
    schemaVersion = raw.schemaVersion;
  }

  if (raw.exportedAt !== undefined && typeof raw.exportedAt !== 'string') {
    return fail('bad-metadata', 'exportedAt must be a string when present.');
  }
  if (raw.note !== undefined && typeof raw.note !== 'string') {
    return fail('bad-metadata', 'note must be a string when present.');
  }

  const metaKeys = new Set<string>(BACKUP_META_KEYS);
  const tables = new Map<string, BackupRow[]>();

  for (const [key, value] of Object.entries(raw)) {
    if (metaKeys.has(key)) continue;

    if (!Array.isArray(value)) {
      return fail('bad-table', `Table "${key}" must be an array of rows.`);
    }

    const rows: BackupRow[] = [];
    for (const entry of value) {
      if (!isPlainObject(entry)) {
        return fail('bad-row', `Table "${key}" contains a row that is not an object.`);
      }

      const row: Record<string, BackupCell> = {};
      for (const [column, cell] of Object.entries(entry)) {
        if (!isCell(cell)) {
          return fail(
            'bad-value',
            `Table "${key}", column "${column}" contains a value that is not text, a number, a boolean or null.`,
          );
        }
        row[column] = cell;
      }

      if (Object.keys(row).length === 0) {
        return fail('bad-row', `Table "${key}" contains an empty row.`);
      }
      rows.push(row);
    }

    tables.set(key, rows);
  }

  if (tables.size === 0) {
    return fail('incomplete', 'The backup contains no table data.');
  }

  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      backupVersion: version,
      schemaVersion,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : null,
      note: typeof raw.note === 'string' ? raw.note : null,
      tables,
    },
  };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export type RestoreMode = 'merge' | 'replace';

export interface RestoreOptions {
  /** `merge` (default) upserts; `replace` clears the file's tables first. */
  readonly mode?: RestoreMode;
  readonly requiredTables?: readonly string[];
}

export interface RowGroup {
  /** Columns present in every row of this group, in schema order. */
  readonly columns: readonly string[];
  readonly rows: readonly BackupRow[];
}

export interface TablePlan {
  readonly name: string;
  readonly primaryKey: readonly string[];
  readonly groups: readonly RowGroup[];
  readonly rowCount: number;
}

export interface RestorePlan {
  readonly backup: BackupFile;
  readonly mode: RestoreMode;
  readonly tables: readonly TablePlan[];
}

export type RestorePlanResult =
  | { readonly ok: true; readonly plan: RestorePlan }
  | BackupError;

/**
 * Check the file against the live schema and produce an executable plan.
 *
 * Pure, so every rejection can be tested without touching a database.
 */
export function planRestore(
  backup: BackupFile,
  schema: DbSchema,
  options: RestoreOptions = {},
): RestorePlanResult {
  const mode = options.mode ?? 'merge';
  const required = options.requiredTables ?? REQUIRED_BACKUP_TABLES;

  for (const name of required) {
    if (!backup.tables.has(name)) {
      return fail(
        'missing-table',
        `The backup is incomplete: it has no "${name}" table.`,
      );
    }
  }

  const tables: TablePlan[] = [];

  for (const [name, rows] of backup.tables) {
    const table = schema.tables.get(name);
    if (!table) {
      return fail(
        'unknown-table',
        `The backup contains a table this app does not have: "${name}".`,
      );
    }

    if (mode === 'merge' && table.primaryKey.length === 0) {
      return fail(
        'no-primary-key',
        `Table "${name}" has no primary key, so it cannot be merged without risking duplicates.`,
      );
    }

    for (const row of rows) {
      for (const column of Object.keys(row)) {
        if (!table.columnNames.has(column)) {
          return fail(
            'unknown-column',
            `Table "${name}" has a column this app does not have: "${column}".`,
          );
        }
      }

      if (mode === 'merge') {
        for (const key of table.primaryKey) {
          if (!(key in row)) {
            return fail(
              'missing-primary-key-value',
              `Table "${name}" has a row without its primary key "${key}".`,
            );
          }
        }
      }
    }

    tables.push({
      name,
      primaryKey: table.primaryKey,
      groups: groupRows(rows, table.columns.map((column) => column.name)),
      rowCount: rows.length,
    });
  }

  return { ok: true, plan: { backup, mode, tables } };
}

/**
 * Group rows by the exact set of columns they carry.
 *
 * A backup can legitimately contain rows with different column sets (an older
 * row predates a column). Binding a missing column as NULL would overwrite a
 * default, so each distinct shape gets its own statement instead.
 */
function groupRows(
  rows: readonly BackupRow[],
  schemaOrder: readonly string[],
): RowGroup[] {
  const groups = new Map<string, { columns: string[]; rows: BackupRow[] }>();

  for (const row of rows) {
    const present = new Set(Object.keys(row));
    const columns = schemaOrder.filter((column) => present.has(column));
    const key = columns.join('\u0000');

    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(key, { columns, rows: [row] });
    }
  }

  return [...groups.values()];
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

export interface TableRestoreReport {
  readonly name: string;
  readonly rows: number;
}

export interface RestoreResult {
  readonly status: 'restored' | 'already-restored';
  readonly mode: RestoreMode;
  readonly backupVersion: number;
  readonly schemaVersion: number | null;
  readonly hash: string;
  readonly tables: readonly TableRestoreReport[];
  readonly totalRows: number;
}

/** Content hash of the data, ignoring `exportedAt` and `note`. */
export function hashBackup(backup: BackupFile): string {
  const tables: Record<string, readonly BackupRow[]> = {};
  for (const name of [...backup.tables.keys()].sort()) {
    tables[name] = backup.tables.get(name) ?? [];
  }

  return stableHash(
    stableStringify({
      app: backup.app,
      backupVersion: backup.backupVersion,
      schemaVersion: backup.schemaVersion,
      tables,
    }),
  );
}

function normaliseCell(value: BackupCell | undefined): SqlParam {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function buildInsertSql(
  table: string,
  columns: readonly string[],
  primaryKey: readonly string[],
  mode: RestoreMode,
): string {
  const columnList = columns.map(quoteIdentifier).join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const head = `INSERT INTO ${quoteIdentifier(table)} (${columnList}) VALUES (${placeholders})`;

  if (mode === 'replace') return head;

  const conflict = primaryKey.map(quoteIdentifier).join(', ');
  const updates = columns
    .filter((column) => !primaryKey.includes(column))
    .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`);

  return updates.length === 0
    ? `${head} ON CONFLICT(${conflict}) DO NOTHING`
    : `${head} ON CONFLICT(${conflict}) DO UPDATE SET ${updates.join(', ')}`;
}

export interface RestoreRuntimeOptions {
  readonly now?: () => number;
}

/**
 * Execute a validated plan.
 *
 * Everything happens inside one transaction. Any constraint violation, missing
 * column or driver error rolls the whole restore back; the database is left
 * exactly as it was.
 */
export async function restoreBackup(
  driver: SqliteDriver,
  plan: RestorePlan,
  options: RestoreRuntimeOptions = {},
): Promise<RestoreResult> {
  const hash = hashBackup(plan.backup);

  if (plan.mode === 'merge') {
    const previous = await getSetting(driver, SETTING_KEYS.lastRestoreHash);
    if (previous === hash) {
      return {
        status: 'already-restored',
        mode: plan.mode,
        backupVersion: plan.backup.backupVersion,
        schemaVersion: plan.backup.schemaVersion,
        hash,
        tables: [],
        totalRows: 0,
      };
    }
  }

  const now = options.now ?? Date.now;

  await withTransaction(driver, async () => {
    // Defer FK checks to COMMIT so the order of tables in the file is irrelevant.
    await driver.execAsync('PRAGMA defer_foreign_keys = ON');

    if (plan.mode === 'replace') {
      for (const table of plan.tables) {
        await driver.execAsync(`DELETE FROM ${quoteIdentifier(table.name)}`);
      }
    }

    for (const table of plan.tables) {
      for (const group of table.groups) {
        const sql = buildInsertSql(
          table.name,
          group.columns,
          table.primaryKey,
          plan.mode,
        );
        for (const row of group.rows) {
          await driver.runAsync(
            sql,
            group.columns.map((column) => normaliseCell(row[column])),
          );
        }
      }
    }

    await setSetting(driver, SETTING_KEYS.lastRestoreHash, hash);
    await setSetting(driver, SETTING_KEYS.lastRestoreAt, String(now()));

    // The restored data may follow a different sign convention than whatever was
    // here before, so any earlier migration decision is stale. Invalidating the
    // ledger makes the next runFinancialMigrations() re-detect from the data
    // that is now present. Detection is safe: already-signed is a no-op,
    // all-positive is negated, mixed is flagged and left untouched.
    for (const key of [
      SETTING_KEYS.accountsMigrated,
      SETTING_KEYS.kindsMigrated,
      SETTING_KEYS.budgetsMigrated,
      SETTING_KEYS.billsMigrated,
      SETTING_KEYS.signMigrated,
      SETTING_KEYS.signMixed,
      SETTING_KEYS.repairRequired,
      SETTING_KEYS.incomeSignWarning,
      SETTING_KEYS.defaultCashAccount,
    ]) {
      await driver.runAsync('DELETE FROM settings WHERE key = ?', [key]);
    }
  });

  return {
    status: 'restored',
    mode: plan.mode,
    backupVersion: plan.backup.backupVersion,
    schemaVersion: plan.backup.schemaVersion,
    hash,
    tables: plan.tables.map((table) => ({ name: table.name, rows: table.rowCount })),
    totalRows: plan.tables.reduce((total, table) => total + table.rowCount, 0),
  };
}

/**
 * Parse, validate against the live schema, and restore in one call.
 *
 * This is the function a screen calls. It never writes before validation
 * succeeds.
 */
export async function restoreBackupText(
  driver: SqliteDriver,
  text: string,
  options: RestoreOptions & RestoreRuntimeOptions = {},
): Promise<RestoreResult | BackupError> {
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;

  const schema = await inspectSchema(driver);
  const planned = planRestore(parsed.backup, schema, options);
  if (!planned.ok) return planned;

  return restoreBackup(driver, planned.plan, options);
}

// ---------------------------------------------------------------------------
// Export (compatibility with the recovered format)
// ---------------------------------------------------------------------------

export interface ExportOptions {
  readonly now?: () => Date;
}

/**
 * Reproduce the shipped app's export exactly: metadata first, then one key per
 * table in `sqlite_master` name order, each holding `SELECT *` rows.
 */
export async function exportBackup(
  driver: SqliteDriver,
  options: ExportOptions = {},
): Promise<Record<string, unknown>> {
  const versionRow = await driver.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );

  const tableRows = await driver.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );

  const data: Record<string, unknown> = {
    app: BACKUP_APP,
    backupVersion: BACKUP_VERSION,
    schemaVersion: versionRow?.user_version ?? null,
    exportedAt: (options.now ?? (() => new Date()))().toISOString(),
    note: BACKUP_NOTE,
  };

  for (const { name } of tableRows) {
    data[name] = await driver.getAllAsync(
      `SELECT * FROM ${quoteIdentifier(name)}`,
    );
  }

  return data;
}

/** The app writes the file with two-space indentation. Keep it identical. */
export function serialiseBackup(data: Record<string, unknown>): string {
  return JSON.stringify(data, null, 2);
}
