/**
 * Typed access to the app's `settings` key/value table.
 *
 * Every migration and restore decision that must happen at most once is recorded
 * here, not in `PRAGMA user_version` (which belongs to the app's own runner).
 */

import type { SqliteDriver } from './driver';

export async function getSetting(
  driver: SqliteDriver,
  key: string,
): Promise<string | null> {
  const row = await driver.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function setSetting(
  driver: SqliteDriver,
  key: string,
  value: string,
): Promise<void> {
  await driver.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

export async function deleteSetting(
  driver: SqliteDriver,
  key: string,
): Promise<void> {
  await driver.runAsync('DELETE FROM settings WHERE key = ?', [key]);
}

export async function hasSetting(
  driver: SqliteDriver,
  key: string,
): Promise<boolean> {
  return (await getSetting(driver, key)) !== null;
}
