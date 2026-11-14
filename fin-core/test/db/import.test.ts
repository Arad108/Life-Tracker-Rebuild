import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  commitImport,
  listDuplicateCandidates,
  loadTransactions,
  resolveDuplicateCandidate,
  runFinancialMigrations,
} from '../../src/db';
import type { ImportBatch } from '../../src/import';
import type { TestDatabase } from './harness';
import { createDatabase } from './harness';

async function setup(): Promise<TestDatabase> {
  const database = createDatabase();
  await runFinancialMigrations(database.driver, { now: () => Date.UTC(2026, 10, 15, 12) });
  database.db.exec(`
    INSERT INTO fin_accounts (id, name, type, opening_balance_minor, created_at, updated_at) VALUES
      ('acc-bank', 'Bank', 'bank', 0, 0, 0);
  `);
  return database;
}

describe('I13 — import commit', () => {
  it('writes rows with provenance and detects duplicates', async () => {
    const database = await setup();

    const batch: ImportBatch = {
      source: 'slice_statement',
      method: 'statement',
      importedAt: Date.UTC(2026, 10, 15, 12),
      rows: [
        { day: '2026-11-02', amountMinor: -50000, kind: 'expense', accountId: 'acc-bank', note: 'UPI', sourceRef: 'UTR1' },
        { day: '2026-11-03', amountMinor: -30000, kind: 'expense', accountId: 'acc-bank', note: 'Coffee', sourceRef: 'UTR2' },
      ],
    };

    const result = await commitImport(database.driver, batch);
    assert.equal(result.inserted, 2);
    assert.equal(result.ids.length, 2);

    const rows = await loadTransactions(database.driver);
    const imported = rows.find((row) => row.id === result.ids[0]);
    assert.equal(imported?.source, 'slice_statement');
    assert.equal(imported?.sourceRef, 'UTR1');
    assert.equal(imported?.importMethod, 'statement');

    // A second import of the same reference should be flagged as a candidate.
    const second: ImportBatch = {
      source: 'slice_statement',
      method: 'statement',
      importedAt: Date.UTC(2026, 10, 16, 12),
      rows: [
        { day: '2026-11-02', amountMinor: -50000, kind: 'expense', accountId: 'acc-bank', note: 'UPI', sourceRef: 'UTR1' },
      ],
    };
    const result2 = await commitImport(database.driver, second);
    assert.equal(result2.inserted, 1);
    assert.ok(result2.duplicateCandidates >= 1);

    const candidates = await listDuplicateCandidates(database.driver, 'pending');
    assert.ok(candidates.length >= 1);
    assert.equal(candidates[0]!.status, 'pending');

    const resolved = await resolveDuplicateCandidate(database.driver, candidates[0]!.id, 'dismissed');
    assert.equal(resolved, true);

    database.close();
  });
});
