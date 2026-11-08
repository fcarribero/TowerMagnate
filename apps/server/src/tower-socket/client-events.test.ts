import type { EngineEvent } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { toClientEvents } from './client-events';

describe('toClientEvents', () => {
  it('keeps decisions and news and drops what the client does not draw', () => {
    const events: EngineEvent[] = [
      { type: 'leaseSigned', step: 3, unitId: 'u1' },
      { type: 'unitRenamed', step: 3, commandId: 'c1', unitId: 'u1', name: 'Mine' },
      { type: 'news', step: 4, key: 'news.officeLeft', unitId: 'u1' },
      { type: 'decisionClosed', step: 5, commandId: 'c2', eventId: 'e1', choice: 'pay' },
    ];

    expect(toClientEvents(events)).toEqual([
      { type: 'news', step: 4, key: 'news.officeLeft', unitId: 'u1' },
      { type: 'decisionClosed', step: 5, eventId: 'e1', choice: 'pay' },
    ]);
  });

  it('gives the default decision news no unit', () => {
    const events: EngineEvent[] = [
      { type: 'news', step: 9, key: 'news.decisionDefault', eventId: 'e1', choice: 'pay' },
    ];

    expect(toClientEvents(events)).toEqual([
      { type: 'news', step: 9, key: 'news.decisionDefault', unitId: null },
    ]);
  });
});
