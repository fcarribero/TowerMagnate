import { describe, expect, it } from 'vitest';
import {
  compareHeapSummaries,
  formatHeapGrowth,
  summarizeHeapSnapshot,
  type HeapSnapshot,
} from './heap-snapshot-summary';

function snapshotOf(nodes: [type: number, name: number, size: number][]): HeapSnapshot {
  return {
    snapshot: {
      meta: {
        node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
        node_types: [['hidden', 'array', 'string', 'object', 'code', 'closure']],
      },
    },
    nodes: nodes.flatMap(([type, name, size], id) => [type, name, id, size, 0]),
    strings: ['', 'Sprite', 'onFrame', 'p17'],
  };
}

describe('summarizeHeapSnapshot', () => {
  it('counts objects and closures by name and other nodes by type', () => {
    const summary = summarizeHeapSnapshot(
      snapshotOf([
        [3, 1, 100],
        [3, 1, 120],
        [5, 2, 32],
        [2, 3, 20],
        [2, 0, 16],
      ]),
    );

    expect(summary.get('Sprite (object)')).toEqual({ count: 2, bytes: 220 });
    expect(summary.get('onFrame (closure)')).toEqual({ count: 1, bytes: 32 });
    expect(summary.get('(string)')).toEqual({ count: 2, bytes: 36 });
  });
});

describe('compareHeapSummaries', () => {
  it('puts the kind that grew most first and includes kinds that appeared', () => {
    const before = summarizeHeapSnapshot(snapshotOf([[3, 1, 100]]));
    const after = summarizeHeapSnapshot(
      snapshotOf([
        [3, 1, 100],
        [3, 1, 100],
        [4, 0, 40],
      ]),
    );

    const growth = compareHeapSummaries(before, after);

    expect(growth.map((entry) => entry.kind)).toEqual(['Sprite (object)', '(code)']);
    expect(growth[0]).toMatchObject({ countBefore: 1, countAfter: 2 });
    expect(formatHeapGrowth(growth, 1)).toContain('Total bytes grown: 140');
  });
});
