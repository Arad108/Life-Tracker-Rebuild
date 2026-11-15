import { makeDriver } from './db';

/** Read-only/additive helpers for the Spaces table (shared with other Spaces). */

export interface SpaceState {
  key: string;
  enabled: boolean;
  pinned: boolean;
  position: number;
}

export async function getSpaceStates(): Promise<Map<string, SpaceState>> {
  const d = makeDriver();
  const rows = await d.getAllAsync<{ key: string; enabled: number; pinned: number; position: number }>(
    'SELECT key, enabled, pinned, position FROM spaces',
  );
  return new Map(
    rows.map((r) => [
      r.key,
      { key: r.key, enabled: Number(r.enabled) === 1, pinned: Number(r.pinned) === 1, position: Number(r.position) },
    ]),
  );
}

export async function setSpaceEnabled(key: string, enabled: boolean): Promise<void> {
  const d = makeDriver();
  await d.runAsync('UPDATE spaces SET enabled = ? WHERE key = ?', [enabled ? 1 : 0, key]);
}
