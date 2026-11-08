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
      { type: 'news', step: 4, key: 'news.officeLeft', unitId: 'u1', params: {} },
      { type: 'decisionClosed', step: 5, eventId: 'e1', choice: 'pay', timedOut: false },
    ]);
  });

  it('passes a bomb blast on with its ruined cells', () => {
    const cells = [{ level: 5, x0: 100, x1: 139 }];
    const events: EngineEvent[] = [{ type: 'disaster', step: 7, kind: 'bomb', cells }];

    expect(toClientEvents(events)).toEqual([{ type: 'disaster', step: 7, kind: 'bomb', cells }]);
  });

  it('marks a decision closed without a command as timed out', () => {
    const events: EngineEvent[] = [
      { type: 'decisionClosed', step: 9, eventId: 'e1', choice: 'refuse' },
    ];

    expect(toClientEvents(events)).toEqual([
      { type: 'decisionClosed', step: 9, eventId: 'e1', choice: 'refuse', timedOut: true },
    ]);
  });

  it('gives the default decision news no unit', () => {
    const events: EngineEvent[] = [
      { type: 'news', step: 9, key: 'news.decisionDefault', eventId: 'e1', choice: 'pay' },
    ];

    expect(toClientEvents(events)).toEqual([
      {
        type: 'news',
        step: 9,
        key: 'news.decisionDefault',
        unitId: null,
        params: { option: 'pay' },
      },
    ]);
  });

  it('sends the level of a bomb blast as its ruler label', () => {
    const events: EngineEvent[] = [{ type: 'news', step: 9, key: 'news.bombExploded', level: 7 }];

    expect(toClientEvents(events)).toEqual([
      { type: 'news', step: 9, key: 'news.bombExploded', unitId: null, params: { level: '7' } },
    ]);
  });

  it('sends a treasure with its basement label and the amount as money text', () => {
    const events: EngineEvent[] = [
      { type: 'news', step: 9, commandId: 'c1', key: 'news.treasure', level: -3, amount: 50_000 },
    ];

    expect(toClientEvents(events)).toEqual([
      {
        type: 'news',
        step: 9,
        key: 'news.treasure',
        unitId: null,
        params: { level: 'S3', amount: '$50.000' },
      },
    ]);
  });

  it('sends the star count of a promotion', () => {
    const events: EngineEvent[] = [{ type: 'news', step: 9, key: 'news.starsUp', n: 3 }];

    expect(toClientEvents(events)).toEqual([
      { type: 'news', step: 9, key: 'news.starsUp', unitId: null, params: { n: 3 } },
    ]);
  });
});
