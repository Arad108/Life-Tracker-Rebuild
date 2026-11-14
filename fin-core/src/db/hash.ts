/**
 * Deterministic content hash for duplicate-restore detection.
 *
 * No crypto dependency: React Native has no `node:crypto`, and a full SHA-256
 * implementation is more code than this guard deserves. Two independently seeded
 * 32-bit FNV-1a passes give a 64-bit fingerprint, which is ample for "is this
 * the exact same backup?".
 */

function fnv1a32(text: string, offsetBasis: number): number {
  let hash = offsetBasis >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function stableHash(text: string): string {
  const first = fnv1a32(text, 0x811c9dc5);
  const second = fnv1a32(text, 0x01000193);
  return first.toString(16).padStart(8, '0') + second.toString(16).padStart(8, '0');
}

/**
 * JSON with object keys sorted recursively, so two structurally identical
 * backups hash identically regardless of key order.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',');
  return `{${body}}`;
}
