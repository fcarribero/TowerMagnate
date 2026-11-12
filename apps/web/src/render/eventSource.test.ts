import type { EventView, ServerMessage } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { ClientStore } from '../model/clientStore';
import { snapshot } from '../testing/protocolFixtures';
import { bindEffects, bindEvents, eventsOf } from './eventSource';
import { stateFromSnapshot } from '../model/gameState';
import type { EventsInput } from './stage';

const fire: EventView = {
  kind: 'disaster',
  id: 'e1',
  disaster: 'fire',
  cells: [],
  spans: [{ level: 1, x0: 5, x1: 6, out: false }],
};
const wedding: EventView = { kind: 'wedding', cathedral: 'u99', guests: ['p1'] };

describe('eventsOf', () => {
  it('draws nothing when no event is active', () => {
    const input = eventsOf(stateFromSnapshot({ ...snapshot, activeEvents: [] }));
    expect(input.drawings).toEqual([]);
    expect(input.fire).toEqual([]);
    expect(input.guests.size).toBe(0);
  });

  it('draws the flames of the fire spans in the snapshot', () => {
    const input = eventsOf(stateFromSnapshot({ ...snapshot, activeEvents: [fire] }));
    expect(input.fire).toEqual(fire.kind === 'disaster' ? fire.spans : []);
    expect(input.drawings.filter((drawing) => drawing.key.startsWith('flame:'))).toHaveLength(2);
  });

  it('lists the wedding guests and finds the top of the tower', () => {
    const input = eventsOf(stateFromSnapshot({ ...snapshot, activeEvents: [wedding] }));
    expect([...input.guests]).toEqual(['p1']);
    expect(input.towerTopLevel).toBe(1);
  });
});

describe('bindEvents', () => {
  it('follows the events of every delta and clears them with the event', () => {
    const store = new ClientStore({ requestResync: () => {} });
    const shown: EventsInput[] = [];
    bindEvents(store, (input) => shown.push(input));
    store.applySnapshot({ ...snapshot, activeEvents: [fire] });
    store.applyDelta({ step: 101, cars: [], people: [], activeEvents: [] });
    expect(shown.map((input) => input.fire.length)).toEqual([1, 0]);
  });
});

describe('bindEffects', () => {
  it('plays the effects of events messages only', () => {
    let listener: (message: ServerMessage) => void = () => {};
    const played: string[] = [];
    bindEffects(
      (next) => {
        listener = next;
        return () => {};
      },
      (effect) => played.push(effect.kind),
    );
    listener({
      t: 'events',
      p: {
        events: [{ type: 'news', step: 5, key: 'news.santa', unitId: null, params: {} }],
      },
    } as ServerMessage);
    listener({ v: 1, t: 'delta', p: { step: 6, cars: [], people: [] } });
    expect(played).toEqual(['santa']);
  });
});
