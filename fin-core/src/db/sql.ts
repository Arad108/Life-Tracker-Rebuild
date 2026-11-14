/**
 * Small SQL helpers shared by the database modules.
 *
 * Nothing here knows about a specific table. Identifiers are always quoted so a
 * recovered table or column name can never be spliced into SQL unescaped.
 */

/** Quote an SQLite identifier. `"` is escaped by doubling it. */
export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Join already-quoted identifiers. */
export function quoteAll(names: readonly string[]): string {
  return names.map(quoteIdentifier).join(', ');
}
