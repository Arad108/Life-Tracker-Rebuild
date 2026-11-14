import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CASH_ACCOUNT_ID,
  LedgerError,
  auditTransfers,
  deleteTransaction,
  deleteTransfer,
  loadTransactions,
  loadTransfer,
  recordTransfer,
  runFinancialMigrations,
  updateTransfer,
} from '../../src/db';
import { summarise } from '../../src';
import type { TestDatabase } from './harness';
import { NOVEMBER, createDatabase, seedLegacyFinance } from './harness';

const RUPEES = 100;

async function setup(): Promise<TestDatabase> {
  const database = createDatabase();
  seedLegacyFinance(database);
  await runFinancialMigrations(database.driver);
  database.db.exec(`
    INSERT INTO fin_accounts (id, name, type, opening_balance_minor, created_at, updated_at) VALUES
      ('acc-bank', 'Bank', 'bank', 0, 0, 0),
      ('acc-wallet', 'Wallet', 'wallet', 0, 0, 0),
      ('acc-card', 'Card', 'credit_card', 0, 0, 0),
      ('acc-loan', 'Loan', 'loan', 0, 0, 0),
      ('acc-invest', 'Investment', 'investment', 0, 0, 0),
      ('acc-asset', 'Gold', 'asset', 0, 0, 0);
  `);
  return database;
}

function legs(database: TestDatabase, transferId: string) {
  return database.db
    .prepare(
      `SELECT id, account_id, amount_minor, day, note, status, kind
         FROM fin_transactions
        WHERE transfer_id = ? AND deleted_at IS NULL
        ORDER BY amount_minor`,
    )
    .all(transferId) as Array<{
    id: string;
    account_id: string;
    amount_minor: number;
    day: string;
    note: string;
    status: string;
    kind: string;
  }>;
}

function balance(database: TestDatabase, accountId: string): number {
  const accounts = database.db
    .prepare('SELECT * FROM fin_accounts WHERE id = ?')
    .all(accountId) as Array<{
    id: string;
    name: string;
    type: string;
    opening_balance_minor: number;
    opening_day: string | null;
    balance_mode: string;
    manual_balance_minor: number | null;
    include_in_net_worth: number;
    archived: number;
    credit_limit_minor: number | null;
  }>;

  const account = accounts[0]!;
  const transactions = database.db
    .prepare('SELECT * FROM fin_transactions WHERE account_id = ? AND deleted_at IS NULL')
    .all(accountId) as Array<{ amount_minor: number }>;

  return (
    account.opening_balance_minor +
    transactions.reduce((total, row) => total + row.amount_minor, 0)
  );
}

/** Opening balance plus backfill is not zero, so assertions use movement deltas. */
function movement(database: TestDatabase, accountId: string): number {
  const rows = database.db
    .prepare(
      'SELECT amount_minor FROM fin_transactions WHERE account_id = ? AND deleted_at IS NULL',
    )
    .all(accountId) as Array<{ amount_minor: number }>;
  return rows.reduce((total, row) => total + row.amount_minor, 0);
}

describe('I4 — creating transfers', () => {
  it('writes exactly two balanced legs sharing one transferId', async () => {
    const database = await setup();
    const bankBefore = movement(database, 'acc-bank');
    const cashBefore = movement(database, DEFAULT_CASH_ACCOUNT_ID);

    const result = await recordTransfer(database.driver, {
      transferId: 'T100',
      fromAccountId: 'acc-bank',
      toAccountId: DEFAULT_CASH_ACCOUNT_ID,
      amountMinor: 500_000,
      day: '2026-11-12',
      note: 'ATM',
    });

    assert.deepEqual(result.ids, ['T100:from', 'T100:to']);
    const rows = legs(database, 'T100');
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.amount_minor, -500_000);
    assert.equal(rows[1]!.amount_minor, 500_000);
    assert.equal(rows[0]!.amount_minor + rows[1]!.amount_minor, 0);
    assert.equal(rows[0]!.account_id, 'acc-bank');
    assert.equal(rows[1]!.account_id, DEFAULT_CASH_ACCOUNT_ID);
    assert.equal(rows[0]!.kind, 'transfer');
    assert.equal(rows[1]!.kind, 'transfer');

    assert.equal(movement(database, 'acc-bank') - bankBefore, -500_000);
    assert.equal(movement(database, DEFAULT_CASH_ACCOUNT_ID) - cashBefore, 500_000);
    assert.equal(balance(database, 'acc-bank'), bankBefore - 500_000);

    database.close();
  });

  it('never changes income, expenses or net spending', async () => {
    const database = await setup();
    const before = summarise(NOVEMBER, await loadTransactions(database.driver));

    await recordTransfer(database.driver, {
      transferId: 'T101',
      fromAccountId: 'acc-bank',
      toAccountId: 'acc-wallet',
      amountMinor: 1_200_000,
      day: '2026-11-12',
    });

    const after = summarise(NOVEMBER, await loadTransactions(database.driver));
    assert.equal(after.income, before.income);
    assert.equal(after.expenses, before.expenses);
    assert.equal(after.refunds, before.refunds);
    assert.equal(after.netSpending, before.netSpending);
    assert.equal(after.cashFlow, before.cashFlow);
    assert.equal(after.transfers.legs, before.transfers.legs + 2);
    assert.equal(after.transfers.net, 0);
    assert.deepEqual(after.transfers.unpairedTransferIds, []);

    database.close();
  });

  it('supports every account type in the movement matrix', async () => {
    const database = await setup();
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ['acc-bank', DEFAULT_CASH_ACCOUNT_ID],
      ['acc-wallet', 'acc-card'],
      ['acc-card', 'acc-loan'],
      ['acc-bank', 'acc-invest'],
      ['acc-invest', 'acc-asset'],
    ];

    for (const [index, [from, to]] of pairs.entries()) {
      await recordTransfer(database.driver, {
        transferId: `M${index}`,
        fromAccountId: from,
        toAccountId: to,
        amountMinor: 100_000,
        day: '2026-11-12',
      });
    }

    const row = database.db
      .prepare("SELECT COUNT(*) AS n FROM fin_transactions WHERE kind = 'transfer' AND transfer_id LIKE 'M%'")
      .get() as { n: number };
    assert.equal(row.n, 10);
    assert.deepEqual(await auditTransfers(database.driver), []);

    database.close();
  });

  it('rejects a duplicate transferId without adding a leg', async () => {
    const database = await setup();
    const input = {
      transferId: 'T102',
      fromAccountId: 'acc-bank',
      toAccountId: DEFAULT_CASH_ACCOUNT_ID,
      amountMinor: 250_000,
      day: '2026-11-12',
    };
    await recordTransfer(database.driver, input);

    await assert.rejects(
      () => recordTransfer(database.driver, input),
      (error: unknown) => error instanceof LedgerError && error.code === 'transfer-exists',
    );
    assert.equal(legs(database, 'T102').length, 2);

    database.close();
  });

  it('rejects a transfer to the same account', async () => {
    const database = await setup();

    await assert.rejects(
      () =>
        recordTransfer(database.driver, {
          transferId: 'T103',
          fromAccountId: 'acc-bank',
          toAccountId: 'acc-bank',
          amountMinor: 100_000,
          day: '2026-11-12',
        }),
      (error: unknown) => error instanceof LedgerError && error.code === 'transfer-same-account',
    );
    assert.equal(legs(database, 'T103').length, 0);

    database.close();
  });
});

describe('I4 — editing transfers', () => {
  it('updates both legs atomically, including account, amount and day', async () => {
    const database = await setup();
    await recordTransfer(database.driver, {
      transferId: 'T200',
      fromAccountId: 'acc-bank',
      toAccountId: DEFAULT_CASH_ACCOUNT_ID,
      amountMinor: 500_000,
      day: '2026-11-12',
      note: 'Before',
    });

    await updateTransfer(database.driver, {
      transferId: 'T200',
      toAccountId: 'acc-wallet',
      amountMinor: 700_000,
      day: '2026-11-13',
      note: 'After',
    });

    const rows = legs(database, 'T200');
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.account_id, 'acc-bank');
    assert.equal(rows[0]!.amount_minor, -700_000);
    assert.equal(rows[1]!.account_id, 'acc-wallet');
    assert.equal(rows[1]!.amount_minor, 700_000);
    assert.equal(rows[0]!.day, '2026-11-13');
    assert.equal(rows[1]!.note, 'After');

    assert.equal(movement(database, 'acc-bank'), -700_000);
    assert.equal(movement(database, DEFAULT_CASH_ACCOUNT_ID), 5_720_000);
    assert.equal(movement(database, 'acc-wallet'), 700_000);

    database.close();
  });

  it('can swap the two accounts and still keep the pair balanced', async () => {
    const database = await setup();
    await recordTransfer(database.driver, {
      transferId: 'T201',
      fromAccountId: 'acc-bank',
      toAccountId: 'acc-wallet',
      amountMinor: 300_000,
      day: '2026-11-12',
    });

    await updateTransfer(database.driver, {
      transferId: 'T201',
      fromAccountId: 'acc-wallet',
      toAccountId: 'acc-bank',
    });

    const rows = legs(database, 'T201');
    assert.equal(rows[0]!.account_id, 'acc-wallet');
    assert.equal(rows[0]!.amount_minor, -300_000);
    assert.equal(rows[1]!.account_id, 'acc-bank');
    assert.equal(rows[1]!.amount_minor, 300_000);

    database.close();
  });

  it('leaves analytics untouched when a transfer is edited', async () => {
    const database = await setup();
    await recordTransfer(database.driver, {
      transferId: 'T202',
      fromAccountId: 'acc-bank',
      toAccountId: DEFAULT_CASH_ACCOUNT_ID,
      amountMinor: 500_000,
      day: '2026-11-12',
    });
    const before = summarise(NOVEMBER, await loadTransactions(database.driver));

    await updateTransfer(database.driver, {
      transferId: 'T202',
      amountMinor: 900_000,
    });

    const after = summarise(NOVEMBER, await loadTransactions(database.driver));
    assert.equal(after.income, before.income);
    assert.equal(after.expenses, before.expenses);
    assert.equal(after.netSpending, before.netSpending);
    assert.equal(after.transfers.outflow, 900_000);

    database.close();
  });

  it('refuses to edit an incomplete pair', async () => {
    const database = await setup();
    await recordTransfer(database.driver, {
      transferId: 'T203',
      fromAccountId: 'acc-bank',
      toAccountId: DEFAULT_CASH_ACCOUNT_ID,
      amountMinor: 500_000,
      day: '2026-11-12',
    });
    database.db.exec("UPDATE fin_transactions SET deleted_at = 1 WHERE id = 'T203:from'");

    await assert.rejects(
      () => updateTransfer(database.driver, { transferId: 'T203', amountMinor: 600_000 }),
      (error: unknown) => error instanceof LedgerError && error.code === 'transfer-incomplete',
    );

    database.close();
  });

  it('refuses to edit a duplicate pair and reports it in the audit', async () => {
    const database = await setup();
    await recordTransfer(database.driver, {
      transferId: 'T204',
      fromAccountId: 'acc-bank',
      toAccountId: DEFAULT_CASH_ACCOUNT_ID,
      amountMinor: 500_000,
      day: '2026-11-12',
    });
    database.db.exec(`
      INSERT INTO fin_transactions
        (id, type, kind, amount_minor, occurred_at, day, created_at, updated_at,
         account_id, transfer_id, status)
      VALUES ('T204:extra', 'transfer', 'transfer', 1, 0, '2026-11-12', 0, 0,
              'acc-bank', 'T204', 'posted');
    `);

    await assert.rejects(
      () => updateTransfer(database.driver, { transferId: 'T204', amountMinor: 600_000 }),
      (error: unknown) => error instanceof LedgerError && error.code === 'transfer-duplicate',
    );

    const audit = await auditTransfers(database.driver);
    assert.equal(audit.length, 1);
    assert.equal(audit[0]!.transferId, 'T204');
    assert.equal(audit[0]!.legs, 3);

    database.close();
  });
});

describe('I4 — deleting transfers', () => {
  it('soft-deletes both legs and restores the balances', async () => {
    const database = await setup();
    await recordTransfer(database.driver, {
      transferId: 'T300',
      fromAccountId: 'acc-bank',
      toAccountId: DEFAULT_CASH_ACCOUNT_ID,
      amountMinor: 500_000,
      day: '2026-11-12',
    });

    const result = await deleteTransfer(database.driver, 'T300');
    assert.equal(result.deleted, 2);
    assert.equal(legs(database, 'T300').length, 0);
    assert.equal(await loadTransfer(database.driver, 'T300'), null);
    assert.equal(movement(database, 'acc-bank'), 0);
    assert.equal(movement(database, DEFAULT_CASH_ACCOUNT_ID), 5_720_000);
    assert.deepEqual(await auditTransfers(database.driver), []);

    database.close();
  });

  it('cleans up a single orphaned leg instead of leaving it behind', async () => {
    const database = await setup();
    await recordTransfer(database.driver, {
      transferId: 'T301',
      fromAccountId: 'acc-bank',
      toAccountId: DEFAULT_CASH_ACCOUNT_ID,
      amountMinor: 500_000,
      day: '2026-11-12',
    });
    database.db.exec("UPDATE fin_transactions SET deleted_at = 1 WHERE id = 'T301:to'");

    const result = await deleteTransfer(database.driver, 'T301');
    assert.equal(result.deleted, 1);
    assert.deepEqual(await auditTransfers(database.driver), []);

    database.close();
  });

  it('deleting one leg through deleteTransaction removes the pair', async () => {
    const database = await setup();
    await recordTransfer(database.driver, {
      transferId: 'T302',
      fromAccountId: 'acc-bank',
      toAccountId: DEFAULT_CASH_ACCOUNT_ID,
      amountMinor: 500_000,
      day: '2026-11-12',
    });

    const result = await deleteTransaction(database.driver, 'T302:from');
    assert.equal(result.deleted, 2);
    assert.equal(legs(database, 'T302').length, 0);

    database.close();
  });

  it('reports a transfer leg with no transferId and refuses to delete half of it', async () => {
    const database = await setup();
    database.db.exec(`
      INSERT INTO fin_transactions
        (id, type, kind, amount_minor, occurred_at, day, created_at, updated_at,
         account_id, transfer_id, status)
      VALUES ('lonely', 'transfer', 'transfer', -1000, 0, '2026-11-12', 0, 0,
              'acc-bank', NULL, 'posted');
    `);

    const audit = await auditTransfers(database.driver);
    assert.ok(audit.some((entry) => entry.transferId === '(missing)'));

    await assert.rejects(
      () => deleteTransaction(database.driver, 'lonely'),
      (error: unknown) => error instanceof LedgerError && error.code === 'transfer-id-required',
    );

    database.close();
  });

  it('loads a healthy pair with both legs mapped to domain rows', async () => {
    const database = await setup();
    await recordTransfer(database.driver, {
      transferId: 'T303',
      fromAccountId: 'acc-bank',
      toAccountId: 'acc-wallet',
      amountMinor: 400_000,
      day: '2026-11-12',
      note: 'Move',
    });

    const pair = await loadTransfer(database.driver, 'T303');
    assert.ok(pair);
    assert.equal(pair.from.amountMinor, -400_000);
    assert.equal(pair.to.amountMinor, 400_000);
    assert.equal(pair.from.transferId, 'T303');
    assert.equal(pair.to.transferId, 'T303');
    assert.equal(pair.from.accountId, 'acc-bank');
    assert.equal(pair.to.accountId, 'acc-wallet');

    database.close();
  });
});
