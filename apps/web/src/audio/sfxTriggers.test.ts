import {
  COMMAND_TYPES,
  packCar,
  serverMessage,
  type CarView,
  type ClientEvent,
  type Command,
  type EventView,
} from '@tower-magnate/shared';
import { describe, expect, it, vi } from 'vitest';
import { snapshot as snapshotFixture } from '../testing/protocolFixtures';
import { readRepoManifest } from '../testing/sfxManifestFile';
import { parseSfxManifest } from './sfxManifest';
import {
  SfxDirector,
  UNUSED_TRIGGERS,
  WIRED_TRIGGERS,
  triggerForCommand,
  triggersForEvents,
} from './sfxTriggers';

const manifest = parseSfxManifest(readRepoManifest());

describe('manifest id to trigger map', () => {
  it('wires every manifest effect or lists it as unused', () => {
    const known = { ...WIRED_TRIGGERS, ...UNUSED_TRIGGERS };
    const missing = manifest.effects.filter((effect) => !(effect.trigger in known));
    expect(missing.map((effect) => effect.id)).toEqual([]);
  });

  it('names only triggers that exist in the manifest', () => {
    const manifestTriggers = manifest.effects.map((effect) => effect.trigger);
    const listed = [...Object.keys(WIRED_TRIGGERS), ...Object.keys(UNUSED_TRIGGERS)];
    expect(manifestTriggers).toEqual(expect.arrayContaining(listed));
    expect(listed).toHaveLength(manifestTriggers.length);
  });

  it.each([
    ['construction', 'build.place'],
    ['demolition', 'build.demolish'],
    ['cash-register', 'money.income'],
    ['notification', 'notice.show'],
    ['bomb-alarm', 'event.bomb'],
    ['fire-alarm', 'event.fire'],
    ['wedding-bells', 'event.wedding'],
    ['elevator-ding', 'elevator.arrive'],
    ['ui-click', 'ui.click'],
  ])('plays %s on %s', (id, trigger) => {
    expect(manifest.effects.find((effect) => effect.id === id)?.trigger).toBe(trigger);
    expect(trigger in WIRED_TRIGGERS).toBe(true);
  });

  it.each([['elevator-move'], ['lobby-ambience'], ['hotel-newspaper']])(
    'leaves %s unused for now',
    (id) => {
      const trigger = manifest.effects.find((effect) => effect.id === id)?.trigger ?? '';
      expect(trigger in UNUSED_TRIGGERS).toBe(true);
    },
  );
});

describe('triggerForCommand', () => {
  it.each(['buildFloor', 'buildLobby', 'buildUnit', 'buildTransport', 'buildShaft'] as const)(
    '%s plays construction',
    (type) => {
      expect(triggerForCommand(type)).toBe('build.place');
    },
  );

  it.each(['demolish', 'removeCar'] as const)('%s plays demolition', (type) => {
    expect(triggerForCommand(type)).toBe('build.demolish');
  });

  it('has an entry for every command type', () => {
    for (const type of COMMAND_TYPES) {
      expect(triggerForCommand(type)).not.toBeUndefined();
    }
  });

  it('plays nothing for a price change', () => {
    expect(triggerForCommand('setPrice')).toBeNull();
  });
});

const income: ClientEvent = {
  type: 'moneyChanged',
  step: 10,
  amount: 15_000,
  reason: 'rent',
  unitId: 'u1',
};

describe('triggersForEvents', () => {
  it('plays the cash register for income tied to a unit', () => {
    expect(triggersForEvents([income])).toEqual(['money.income']);
  });

  it('plays nothing for an expense or untied income', () => {
    const expense: ClientEvent = { ...income, amount: -500, reason: 'upkeep' };
    const payout: ClientEvent = { ...income, unitId: null, reason: 'dailyPayout' };
    expect(triggersForEvents([expense, payout])).toEqual([]);
  });

  it('plays the notice sound once per batch', () => {
    const news: ClientEvent = {
      type: 'news',
      step: 1,
      key: 'news.vipVisit',
      unitId: null,
      params: {},
    };
    expect(triggersForEvents([news, { ...news, key: 'news.lowMoney' }])).toEqual(['notice.show']);
  });

  it('plays the alarm in place of the notice for a bomb threat', () => {
    const threat: ClientEvent = {
      type: 'news',
      step: 1,
      key: 'news.bombThreat',
      unitId: null,
      params: {},
    };
    const decision: ClientEvent = {
      type: 'decisionOpened',
      step: 1,
      eventId: 'e1',
      kind: 'bomb',
      deadlineStep: 500,
      options: ['pay', 'refuse'],
    };
    const other: ClientEvent = {
      type: 'news',
      step: 1,
      key: 'news.vipVisit',
      unitId: null,
      params: {},
    };
    expect(triggersForEvents([threat, decision, other])).toEqual(['event.bomb']);
  });

  it('plays the fire alarm when a fire decision opens', () => {
    const fire: ClientEvent = {
      type: 'decisionOpened',
      step: 1,
      eventId: 'e2',
      kind: 'fire',
      deadlineStep: 500,
      options: ['helicopter', 'wait'],
    };
    expect(triggersForEvents([fire])).toEqual(['event.fire']);
  });

  it('plays the bells when the wedding completes', () => {
    expect(triggersForEvents([{ type: 'weddingCompleted', step: 1 }])).toEqual(['event.wedding']);
  });
});

function car(doors: CarView['doors'], index = 0): CarView {
  return { shaftId: 's1', index, position: 3, direction: 'idle', doors, load: 0 };
}

function delta(cars: CarView[]) {
  return serverMessage('delta', { step: 2, cars: cars.map(packCar), people: [] });
}

function setup() {
  const play = vi.fn();
  const startLoop = vi.fn();
  const stopLoop = vi.fn();
  const director = new SfxDirector({ play, startLoop, stopLoop });
  return { play, startLoop, stopLoop, director };
}

const buildFloor: Command = { type: 'buildFloor', level: 2, x0: 10, x1: 20 };

describe('SfxDirector', () => {
  it('plays construction when a build command is accepted', () => {
    const { play, director } = setup();
    director.commandSent({ id: 'c1', command: buildFloor });
    director.serverMessage(
      serverMessage('commandResult', { id: 'c1', ok: true, step: 3, cost: 50_000, refund: 0 }),
    );
    expect(play).toHaveBeenCalledWith('build.place');
  });

  it('plays demolition when a demolish command is accepted', () => {
    const { play, director } = setup();
    director.commandSent({
      id: 'c2',
      command: { type: 'demolish', target: { kind: 'unit', id: 'u1' } },
    });
    director.serverMessage(
      serverMessage('commandResult', { id: 'c2', ok: true, step: 3, cost: 0, refund: 1_000 }),
    );
    expect(play).toHaveBeenCalledWith('build.demolish');
  });

  it('plays nothing for a rejected or unknown command', () => {
    const { play, director } = setup();
    director.commandSent({ id: 'c3', command: buildFloor });
    director.serverMessage(
      serverMessage('commandResult', { id: 'c3', ok: false, step: 3, error: 'INSUFFICIENT_FUNDS' }),
    );
    director.serverMessage(
      serverMessage('commandResult', { id: 'other', ok: true, step: 3, cost: 0, refund: 0 }),
    );
    expect(play).not.toHaveBeenCalled();
  });

  it('dings when a car opens its doors', () => {
    const { play, director } = setup();
    director.serverMessage(delta([car('closed')]));
    director.serverMessage(delta([car('open')]));
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith('elevator.arrive');
  });

  it('dings once when several cars arrive in one delta', () => {
    const { play, director } = setup();
    director.serverMessage(delta([car('closed', 0), car('closed', 1)]));
    director.serverMessage(delta([car('open', 0), car('open', 1)]));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('does not ding for cars first seen with open doors', () => {
    const { play, director } = setup();
    director.serverMessage(delta([car('open')]));
    director.serverMessage(delta([car('open')]));
    expect(play).not.toHaveBeenCalled();
  });

  it('plays the cash register for each batch, leaving the rate limit to the cues', () => {
    const { play, director } = setup();
    const batch = serverMessage('events', { events: [income] });
    director.serverMessage(batch);
    director.serverMessage(batch);
    expect(play.mock.calls).toEqual([['money.income'], ['money.income']]);
  });
});

function news(key: string): ClientEvent {
  return { type: 'news', step: 1, key, unitId: null, params: {} };
}

function opened(kind: 'bomb' | 'fire', eventId = 'e1'): ClientEvent {
  return {
    type: 'decisionOpened',
    step: 1,
    eventId,
    kind,
    deadlineStep: 500,
    options: ['a', 'b'],
  };
}

function closed(eventId = 'e1'): ClientEvent {
  return { type: 'decisionClosed', step: 2, eventId, choice: 'a', timedOut: false };
}

function events(...list: ClientEvent[]) {
  return serverMessage('events', { events: list });
}

function decisionView(kind: 'bomb' | 'fire', id = 'e1'): EventView {
  return { kind: 'decision', id, decision: kind, deadlineStep: 500, options: ['a', 'b'] };
}

function disasterView(kind: 'bomb' | 'fire', id = 'e1'): EventView {
  return { kind: 'disaster', id, disaster: kind, cells: [] };
}

function snapshot(activeEvents: EventView[]) {
  return serverMessage('snapshot', { ...snapshotFixture, activeEvents });
}

function eventsDelta(activeEvents: EventView[]) {
  return serverMessage('delta', { step: 3, cars: [], people: [], activeEvents });
}

describe('SfxDirector alarms', () => {
  it.each(['bomb', 'fire'] as const)('starts the %s alarm loop with its decision', (kind) => {
    const { play, startLoop, director } = setup();
    director.serverMessage(events(opened(kind)));
    expect(startLoop).toHaveBeenCalledWith(`event.${kind}`);
    expect(play).not.toHaveBeenCalled();
  });

  it('plays the alarm and no notice when the threat notice and decision arrive together', () => {
    const { play, startLoop, director } = setup();
    director.serverMessage(events(news('news.bombThreat'), opened('bomb')));
    expect(startLoop).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
  });

  it('does nothing on a second start while the alarm plays', () => {
    const { startLoop, director } = setup();
    director.serverMessage(events(news('news.fire')));
    director.serverMessage(events(opened('fire')));
    director.serverMessage(events(opened('fire')));
    expect(startLoop).toHaveBeenCalledTimes(1);
  });

  it('stops on decisionClosed of its event only', () => {
    const { stopLoop, director } = setup();
    director.serverMessage(events(opened('bomb')));
    director.serverMessage(events(closed('other')));
    expect(stopLoop).not.toHaveBeenCalled();
    director.serverMessage(events(closed('e1')));
    expect(stopLoop).toHaveBeenCalledWith('event.bomb');
  });

  it('stops an alarm the notice started once its decision closes', () => {
    const { stopLoop, director } = setup();
    director.serverMessage(events(news('news.bombThreat')));
    director.serverMessage(events(opened('bomb', 'e7')));
    director.serverMessage(events(closed('e7')));
    expect(stopLoop).toHaveBeenCalledWith('event.bomb');
  });

  it.each([
    ['news.bombPaid', 'bomb'],
    ['news.bombFound', 'bomb'],
    ['news.bombExploded', 'bomb'],
    ['news.fireOut', 'fire'],
    ['news.fireHelicopter', 'fire'],
  ] as const)('stops on %s', (key, kind) => {
    const { stopLoop, director } = setup();
    director.serverMessage(events(opened(kind)));
    director.serverMessage(events(news(key)));
    expect(stopLoop.mock.calls).toEqual([[`event.${kind}`]]);
  });

  it('plays the notification for the explosion that ends the threat', () => {
    const { play, director } = setup();
    director.serverMessage(events(opened('bomb')));
    director.serverMessage(events(news('news.bombExploded')));
    expect(play).toHaveBeenCalledWith('notice.show');
  });

  it('stops only the alarm the end notice names', () => {
    const { stopLoop, director } = setup();
    director.serverMessage(events(opened('fire')));
    director.serverMessage(events(news('news.bombFound')));
    expect(stopLoop).not.toHaveBeenCalled();
  });

  it('stops when a delta no longer lists the event', () => {
    const { stopLoop, director } = setup();
    director.serverMessage(events(opened('fire')));
    director.serverMessage(eventsDelta([disasterView('fire')]));
    expect(stopLoop).not.toHaveBeenCalled();
    director.serverMessage(eventsDelta([]));
    expect(stopLoop).toHaveBeenCalledWith('event.fire');
  });

  it('keeps the alarm when a delta does not send the event views', () => {
    const { stopLoop, director } = setup();
    director.serverMessage(events(opened('fire')));
    director.serverMessage(delta([]));
    expect(stopLoop).not.toHaveBeenCalled();
  });

  it('stops when a snapshot no longer lists the event', () => {
    const { stopLoop, director } = setup();
    director.serverMessage(events(opened('bomb')));
    director.serverMessage(snapshot([]));
    expect(stopLoop).toHaveBeenCalledWith('event.bomb');
  });

  it('restarts the alarm from a snapshot with an open decision', () => {
    const { startLoop, director } = setup();
    director.serverMessage(snapshot([decisionView('bomb')]));
    expect(startLoop).toHaveBeenCalledWith('event.bomb');
  });

  it('stays silent after a reload during a search with no open decision', () => {
    const { startLoop, director } = setup();
    director.serverMessage(snapshot([disasterView('bomb')]));
    expect(startLoop).not.toHaveBeenCalled();
  });

  it('does not restart an alarm that a resync snapshot still lists', () => {
    const { startLoop, stopLoop, director } = setup();
    director.serverMessage(events(opened('bomb')));
    director.serverMessage(snapshot([decisionView('bomb')]));
    expect(startLoop).toHaveBeenCalledTimes(1);
    expect(stopLoop).not.toHaveBeenCalled();
  });

  it('stops a restarted alarm when its decision closes', () => {
    const { stopLoop, director } = setup();
    director.serverMessage(snapshot([decisionView('fire', 'e9')]));
    director.serverMessage(events(closed('e9')));
    expect(stopLoop).toHaveBeenCalledWith('event.fire');
  });

  it('starts the alarm again for the next event', () => {
    const { startLoop, director } = setup();
    director.serverMessage(events(opened('bomb', 'e1')));
    director.serverMessage(events(closed('e1')));
    director.serverMessage(events(opened('bomb', 'e2')));
    expect(startLoop).toHaveBeenCalledTimes(2);
  });

  it('plays the bells once per weddingCompleted', () => {
    const { play, director } = setup();
    director.serverMessage(events({ type: 'weddingCompleted', step: 4 }));
    expect(play.mock.calls).toEqual([['event.wedding']]);
  });
});
