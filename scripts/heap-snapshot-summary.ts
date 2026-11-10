/**
 * Sums a V8 heap snapshot by object kind, and compares two such sums, so a render
 * stress run can show which kinds of objects grew between two points in time.
 */

export interface HeapSnapshot {
  snapshot: {
    meta: {
      node_fields: string[];
      node_types: [string[], ...unknown[]];
    };
  };
  nodes: number[];
  strings: string[];
}

export interface KindTotal {
  count: number;
  bytes: number;
}

export type HeapSummary = Map<string, KindTotal>;

export interface KindGrowth {
  kind: string;
  countBefore: number;
  countAfter: number;
  bytesBefore: number;
  bytesAfter: number;
}

const NAMED_TYPES = new Set(['object', 'closure', 'native']);

/** Objects and closures count by constructor or function name; everything else by node type. */
function kindOf(type: string, name: string): string {
  return NAMED_TYPES.has(type) ? `${name} (${type})` : `(${type})`;
}

export function summarizeHeapSnapshot(snapshot: HeapSnapshot): HeapSummary {
  const fields = snapshot.snapshot.meta.node_fields;
  const typeNames = snapshot.snapshot.meta.node_types[0];
  const stride = fields.length;
  const typeField = fields.indexOf('type');
  const nameField = fields.indexOf('name');
  const sizeField = fields.indexOf('self_size');
  const summary: HeapSummary = new Map();
  for (let offset = 0; offset < snapshot.nodes.length; offset += stride) {
    const type = typeNames[snapshot.nodes[offset + typeField] ?? 0] ?? 'unknown';
    const name = snapshot.strings[snapshot.nodes[offset + nameField] ?? 0] ?? '';
    const kind = kindOf(type, name);
    const total = summary.get(kind) ?? { count: 0, bytes: 0 };
    total.count += 1;
    total.bytes += snapshot.nodes[offset + sizeField] ?? 0;
    summary.set(kind, total);
  }
  return summary;
}

/** Kinds sorted by how many bytes they grew, largest first; kinds that shrank come last. */
export function compareHeapSummaries(before: HeapSummary, after: HeapSummary): KindGrowth[] {
  const kinds = new Set([...before.keys(), ...after.keys()]);
  const growth: KindGrowth[] = [];
  for (const kind of kinds) {
    const earlier = before.get(kind) ?? { count: 0, bytes: 0 };
    const later = after.get(kind) ?? { count: 0, bytes: 0 };
    growth.push({
      kind,
      countBefore: earlier.count,
      countAfter: later.count,
      bytesBefore: earlier.bytes,
      bytesAfter: later.bytes,
    });
  }
  const grownBytes = (entry: KindGrowth) => entry.bytesAfter - entry.bytesBefore;
  return growth.sort((a, b) => grownBytes(b) - grownBytes(a));
}

export function formatHeapGrowth(growth: readonly KindGrowth[], rows: number): string {
  const lines = ['Bytes grown | Count before -> after | Kind'];
  for (const entry of growth.slice(0, rows)) {
    const bytes = entry.bytesAfter - entry.bytesBefore;
    lines.push(
      `${String(bytes).padStart(11)} | ${entry.countBefore} -> ${entry.countAfter} | ${entry.kind}`,
    );
  }
  const total = growth.reduce((sum, entry) => sum + entry.bytesAfter - entry.bytesBefore, 0);
  lines.push(`Total bytes grown: ${total}`);
  return lines.join('\n');
}
