import type { SqliteDriver } from './driver';
import { withTransaction } from './driver';
import { hasColumn, tableExists } from './introspect';
import {
  DUPLICATE_INDEXES,
  FIN_DUPLICATE_CANDIDATES_DDL,
  FIN_TRANSACTIONS_DDL,
  SETTING_KEYS,
  SETTINGS_DDL,
} from './schema';
import { getSetting, setSetting } from './settings';

export interface ProvenanceMigrationResult {
  readonly applied: boolean;
  readonly backfilled: number;
  readonly warnings: readonly string[];
}

export async function migrateProvenance(
  driver: SqliteDriver,
  _options: { readonly now?: () => number } = {},
): Promise<ProvenanceMigrationResult> {
  return withTransaction(driver, async () => {
    const already = (await getSetting(driver, SETTING_KEYS.provenanceMigrated)) === '1';
    const warnings: string[] = [];

    await driver.execAsync(SETTINGS_DDL);
    await driver.execAsync(FIN_TRANSACTIONS_DDL);

    const additions: readonly (readonly [string, string])[] = [
      ['source_ref', 'TEXT'],
      ['import_method', 'TEXT'],
      ['imported_at', 'INTEGER'],
      ['confidence', 'REAL'],
    ];
    for (const [column, ddl] of additions) {
      if (!(await hasColumn(driver, 'fin_transactions', column))) {
        await driver.execAsync(`ALTER TABLE fin_transactions ADD COLUMN ${column} ${ddl}`);
      }
    }

    await driver.execAsync(FIN_DUPLICATE_CANDIDATES_DDL);
    await driver.execAsync(DUPLICATE_INDEXES);

    await setSetting(driver, SETTING_KEYS.provenanceMigrated, '1');
    return { applied: !already, backfilled: 0, warnings };
  });
}
