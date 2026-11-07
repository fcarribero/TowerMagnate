const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      );
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** FNV-1a hash of the state's canonical JSON, as 8 hex digits. Key order does not matter. */
export function hashState(state: unknown): string {
  const text = canonicalJson(state);
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
