/**
 * Equality of plain JSON-like data: two values are the same when they would serialize to the same
 * JSON, ignoring key order. Properties set to undefined count as missing, as they do in JSON.
 */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && sameArrays(a, b);
  }
  return sameRecords(a as Record<string, unknown>, b as Record<string, unknown>);
}

function sameArrays(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) {
    if (!sameData(a[index], b[index])) return false;
  }
  return true;
}

function definedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter((key) => record[key] !== undefined);
}

function sameRecords(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = definedKeys(a);
  if (keys.length !== definedKeys(b).length) return false;
  for (const key of keys) {
    if (!sameData(a[key], b[key])) return false;
  }
  return true;
}
