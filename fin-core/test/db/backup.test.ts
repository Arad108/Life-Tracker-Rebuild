import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKUP_NOTE,
  BACKUP_VERSION,
  exportBackup,
  hashBackup,
  inspectSchema,
  parseBackup,
  planRestore,
  restoreBackup,
  restoreBackupText,
  serialiseBackup,
} from '../../src/db';
import type { BackupError } from '../../src/db';
import { countRows, createDatabase, readSetting, seedLegacyFinance } from './harness';

function expectBackupError(result: unknown, code: string): void {
  assert.ok(result && typeof result === 'object', 'expected an error result');
  const error = result as BackupError;
  assert.equal(error.ok, false, `expected a failure, got ${JSON.stringify(result)}`);
  assert.equal(error.code, code, error.message);
  assert.ok(error.message.length > 0, 'an error must explain itself');
}

const BASE = {
  app: 'life-tracker',
  backupVersion: BACKUP_VERSION,
  schemaVersion: 0,
  settings: [] as unknown[],
  fin_categories: [] as unknown[],
  fin_transactions: [] as unknown[],
};

describe('export — the recovered format', () => {
  it('writes metadata and flat table keys, with no tables wrapper', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);
    database.db.exec('PRAGMA user_version = 3');

    const data = await exportBackup(database.driver, {
      now: () => new Date('2026-11-15T10:00:00.000Z'),
    });

    assert.equal(data.app, 'life-tracker');
    assert.equal(data.backupVersion, 2);
    assert.equal(data.schemaVersion, 3);
    assert.equal(data.exportedAt, '2026-11-15T10:00:00.000Z');
    assert.equal(data.note, BACKUP_NOTE);
    assert.ok(Array.isArray(data.fin_transactions));
    assert.equal('tables' in data, false);

    const text = serialiseBackup(data);
    assert.ok(text.includes('\n  "app": "life-tracker"'), 'two-space indentation');
    assert.equal(JSON.parse(text).app, 'life-tracker');

    database.close();
  });

  it('parses its own export', async () => {
    const database = createDatabase();
    seedLegacyFinance(database);

    const text = serialiseBackup(await exportBackup(database.driver));
    const parsed = parseBackup(text);

    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.backup.backupVersion, BACKUP_VERSION);
    assert.equal(parsed.backup.tables.get('fin_transactions')?.length, 4);

    database.close();
  });
});

describe('restore — happy paths', () => {
  it('round-trips every table into a fresh database', async () => {
    const source = createDatabase();
    seedLegacyFinance(source);
    source.db.exec(`
      INSERT INTO trackers (id, name, created_at, updated_at) VALUES ('tr1', 'Water', 0, 0);
      INSERT INTO tracker_entries (id, tracker_id, occurred_at, day, created_at, updated_at)
        VALUES ('e1', 'tr1', 0, '2026-11-01', 0, 0);
    `);

    const text = serialiseBackup(await exportBackup(source.driver));
    const target = createDatabase();

    const result = await restoreBackupText(target.driver, text);
    assert.ok('status' in result);
    if (!('status' in result)) return;
    assert.equal(result.status, 'restored');
    assert.equal(result.mode, 'merge');

    for (const table of ['fin_categories', 'fin_transactions', 'trackers', 'tracker_entries']) {
      assert.deepEqual(
        target.db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(),
        source.db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(),
        table,
      );
    }

    source.close();
    target.close();
  });

  it('merge keeps rows that are not in the backup and updates rows that are', async () => {
    const source = createDatabase();
    seedLegacyFinance(source);
    const text = serialiseBackup(await exportBackup(source.driver));

    const target = createDatabase();
    seedLegacyFinance(target);
    target.db.exec(`INSERT INTO fin_categories (id, name, position) VALUES ('cat-extra', 'Extra', 9)`);
    target.db.exec(`UPDATE fin_transactions SET note = 'local edit' WHERE id = 't-rent'`);

    const result = await restoreBackupText(target.driver, text);
    assert.ok('status' in result);

    assert.equal(countRows(target, 'fin_categories'), 5, 'the extra category survives');
    const rent = target.db
      .prepare("SELECT note FROM fin_transactions WHERE id = 't-rent'")
      .get() as { note: string };
    assert.equal(rent.note, 'Rent', 'the backup wins for a row it contains');

    source.close();
    target.close();
  });

  it('replace removes rows that are not in the backup', async () => {
    const source = createDatabase();
    seedLegacyFinance(source);
    const text = serialiseBackup(await exportBackup(source.driver));

    const target = createDatabase();
    seedLegacyFinance(target);
    target.db.exec(`INSERT INTO fin_categories (id, name, position) VALUES ('cat-extra', 'Extra', 9)`);

    const result = await restoreBackupText(target.driver, text, { mode: 'replace' });
    assert.ok('status' in result);
    if (!('status' in result)) return;
    assert.equal(result.mode, 'replace');
    assert.equal(countRows(target, 'fin_categories'), 4, 'the extra category is gone');

    source.close();
    target.close();
  });

  it('refuses to apply the same backup twice in merge mode', async () => {
    const source = createDatabase();
    seedLegacyFinance(source);
    const text = serialiseBackup(await exportBackup(source.driver));

    const target = createDatabase();
    const first = await restoreBackupText(target.driver, text);
    const second = await restoreBackupText(target.driver, text);

    assert.ok('status' in first && 'status' in second);
    if (!('status' in first) || !('status' in second)) return;
    assert.equal(first.status, 'restored');
    assert.equal(second.status, 'already-restored');
    assert.equal(countRows(target, 'fin_transactions'), 4);
    assert.equal(second.totalRows, 0);

    source.close();
    target.close();
  });

  it('merges composite primary keys without duplicating rows', async () => {
    const target = createDatabase();
    const backup = JSON.stringify({
      ...BASE,
      so_people: [{ id: 'p1', name: 'Asha', created_at: 0, updated_at: 0 }],
      so_interactions: [{ id: 'i1', day: '2026-11-01', occurred_at: 0 }],
      so_interaction_people: [{ interaction_id: 'i1', person_id: 'p1' }],
    });

    await restoreBackupText(target.driver, backup);
    target.db.exec("DELETE FROM settings WHERE key = 'last_restore_hash'");
    await restoreBackupText(target.driver, backup);

    assert.equal(countRows(target, 'so_interaction_people'), 1);

    target.close();
  });

  it('defers foreign keys so file order does not matter', async () => {
    const target = createDatabase();
    const backup = JSON.stringify({
      ...BASE,
      // The child is listed before its parent on purpose.
      tracker_entries: [
        { id: 'e1', tracker_id: 'tr1', occurred_at: 0, day: '2026-11-01', created_at: 0, updated_at: 0 },
      ],
      trackers: [{ id: 'tr1', name: 'Water', created_at: 0, updated_at: 0 }],
    });

    const result = await restoreBackupText(target.driver, backup);
    assert.ok('status' in result);
    if (!('status' in result)) return;
    assert.equal(result.status, 'restored');
    assert.equal(countRows(target, 'tracker_entries'), 1);

    target.close();
  });
});

describe('restore — rollback and atomicity', () => {
  it('rolls back every write when one row violates a constraint', async () => {
    const target = createDatabase();
    seedLegacyFinance(target);

    const before = countRows(target, 'fin_transactions');
    const backup = JSON.stringify({
      ...BASE,
      trackers: [{ id: 'broken' }], // `name` is NOT NULL
    });

    await assert.rejects(
      () => restoreBackupText(target.driver, backup),
      /NOT NULL|constraint/i,
    );

    assert.equal(countRows(target, 'fin_transactions'), before, 'earlier tables were rolled back');
    assert.equal(countRows(target, 'trackers'), 0);
    assert.equal(readSetting(target, 'last_restore_hash'), null, 'the guard was not recorded');

    target.close();
  });

  it('leaves the database untouched when validation fails', async () => {
    const target = createDatabase();
    seedLegacyFinance(target);

    const before = countRows(target, 'fin_transactions');
    const result = await restoreBackupText(
      target.driver,
      JSON.stringify({ ...BASE, ghost_table: [] }),
    );

    expectBackupError(result, 'unknown-table');
    assert.equal(countRows(target, 'fin_transactions'), before);

    target.close();
  });
});

describe('restore — invalid, incomplete and incompatible files', () => {
  const structural: ReadonlyArray<readonly [string, string, string]> = [
    ['invalid JSON', '{ not json', 'invalid-json'],
    ['not an object', '[1, 2, 3]', 'not-an-object'],
    ['wrong app', JSON.stringify({ app: 'other', backupVersion: 2 }), 'wrong-app'],
    ['missing version', JSON.stringify({ app: 'life-tracker' }), 'missing-version'],
    ['bad version', JSON.stringify({ app: 'life-tracker', backupVersion: 'two' }), 'bad-version'],
    ['future version', JSON.stringify({ app: 'life-tracker', backupVersion: 99 }), 'unsupported-version'],
    ['bad schema version', JSON.stringify({ app: 'life-tracker', backupVersion: 2, schemaVersion: 'x' }), 'bad-schema-version'],
    ['bad metadata', JSON.stringify({ app: 'life-tracker', backupVersion: 2, note: 5 }), 'bad-metadata'],
    ['table is not an array', JSON.stringify({ app: 'life-tracker', backupVersion: 2, settings: {} }), 'bad-table'],
    ['row is not an object', JSON.stringify({ app: 'life-tracker', backupVersion: 2, settings: [1] }), 'bad-row'],
    [
      'unsupported cell value',
      JSON.stringify({ app: 'life-tracker', backupVersion: 2, settings: [{ key: 'a', value: { nested: true } }] }),
      'bad-value',
    ],
    ['no table data', JSON.stringify({ app: 'life-tracker', backupVersion: 2 }), 'incomplete'],
  ];

  for (const [name, text, code] of structural) {
    it(name, () => {
      expectBackupError(parseBackup(text), code);
    });
  }

  it('rejects a table this app does not have', async () => {
    const target = createDatabase();
    const result = await restoreBackupText(
      target.driver,
      JSON.stringify({ ...BASE, ghost_table: [] }),
    );
    expectBackupError(result, 'unknown-table');
    target.close();
  });

  it('rejects a column this app does not have', async () => {
    const target = createDatabase();
    const result = await restoreBackupText(
      target.driver,
      JSON.stringify({
        ...BASE,
        trackers: [{ id: 'tr1', name: 'Water', created_at: 0, updated_at: 0, ghost_column: 1 }],
      }),
    );
    expectBackupError(result, 'unknown-column');
    target.close();
  });

  it('rejects an incomplete backup that has no finance ledger', async () => {
    const target = createDatabase();
    const result = await restoreBackupText(
      target.driver,
      JSON.stringify({ app: 'life-tracker', backupVersion: 2, settings: [], fin_categories: [] }),
    );
    expectBackupError(result, 'missing-table');
    target.close();
  });

  it('rejects a row without its primary key in merge mode', async () => {
    const target = createDatabase();
    const result = await restoreBackupText(
      target.driver,
      JSON.stringify({
        ...BASE,
        trackers: [{ name: 'No id', created_at: 0, updated_at: 0 }],
      }),
    );
    expectBackupError(result, 'missing-primary-key-value');
    target.close();
  });
});

describe('hash and planning', () => {
  it('hashes identical data identically regardless of key order', () => {
    const first = parseBackup(
      JSON.stringify({
        app: 'life-tracker',
        backupVersion: 2,
        settings: [{ key: 'a', value: '1' }],
        fin_categories: [],
        fin_transactions: [],
      }),
    );
    const second = parseBackup(
      JSON.stringify({
        fin_transactions: [],
        fin_categories: [],
        app: 'life-tracker',
        settings: [{ value: '1', key: 'a' }],
        backupVersion: 2,
      }),
    );

    assert.ok(first.ok && second.ok);
    if (!first.ok || !second.ok) return;
    assert.equal(hashBackup(first.backup), hashBackup(second.backup));
  });

  it('plans nothing when the schema rejects the file', async () => {
    const target = createDatabase();
    const parsed = parseBackup(JSON.stringify({ ...BASE, ghost_table: [] }));
    assert.ok(parsed.ok);
    if (!parsed.ok) return;

    const schema = await inspectSchema(target.driver);
    const planned = planRestore(parsed.backup, schema);

    assert.equal(planned.ok, false);
    if (planned.ok) return;
    assert.equal(planned.code, 'unknown-table');

    target.close();
  });

  it('exposes restoreBackup for a pre-built plan', async () => {
    const source = createDatabase();
    seedLegacyFinance(source);
    const text = serialiseBackup(await exportBackup(source.driver));

    const parsed = parseBackup(text);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;

    const target = createDatabase();
    const schema = await inspectSchema(target.driver);
    const planned = planRestore(parsed.backup, schema);
    assert.ok(planned.ok);
    if (!planned.ok) return;

    const result = await restoreBackup(target.driver, planned.plan);
    assert.equal(result.status, 'restored');
    assert.equal(result.totalRows > 0, true);

    source.close();
    target.close();
  });
});
