import type { Command, ElevatorSchedule } from './commands';
import type { ClientMessage, ServerMessage } from './messages';
import { packCar, packPerson } from './packed';
import type { CarView, FinanceSummary, PersonView, UnitView } from './views';

const v = 1;

const band = { mode: 'normal', dwellSeconds: 10, responseDistance: 5 } as const;

export const sampleSchedule: ElevatorSchedule = {
  weekday: [band, band, { ...band, mode: 'expressUp' }, band, band, band],
  weekend: [band, band, band, band, { ...band, mode: 'expressDown' }, band],
};

export const sampleCommands: Command[] = [
  { type: 'buildFloor', level: 2, x0: 0, x1: 374 },
  { type: 'buildLobby', level: 1, x0: 10, x1: 40, height: 3 },
  { type: 'buildUnit', unitType: 'office', x: 12, level: 2 },
  { type: 'buildTransport', transportType: 'escalator', x: 50, level: -1 },
  { type: 'buildShaft', shaftType: 'express', x: 100, bottom: -9, top: 104 },
  { type: 'addCar', shaftId: 's4', homeLevel: 1 },
  { type: 'resizeShaft', shaftId: 's4', bottom: 1, top: 30 },
  { type: 'demolish', target: { kind: 'unit', id: 'u12' } },
  { type: 'demolish', target: { kind: 'transport', id: 't3' } },
  { type: 'demolish', target: { kind: 'shaft', id: 's4' } },
  { type: 'demolish', target: { kind: 'floor', level: 5, x0: 0, x1: 9 } },
  { type: 'demolish', target: { kind: 'lobby', level: 15, x0: 0, x1: 9 } },
  { type: 'demolish', target: { kind: 'ruins', level: -3, x: 374 } },
  { type: 'removeCar', shaftId: 's4', carIndex: 7 },
  { type: 'setPrice', unitId: 'u12', price: 'minimum' },
  {
    type: 'configureShaft',
    shaftId: 's4',
    stops: [-1, 1, 15],
    carHomes: [1, 15],
    schedule: sampleSchedule,
  },
  { type: 'answerEvent', eventId: 'e2', choice: 'pay' },
  { type: 'changeFilm', unitId: 'u40' },
  { type: 'renameUnit', unitId: 'u12', name: 'Oficinas del Sur' },
  { type: 'renamePerson', personId: 'p3401', name: 'Marta' },
  { type: 'followPerson', personId: 'p3401' },
  { type: 'unfollowPerson', personId: 'p3401' },
];

const unit: UnitView = {
  id: 'u12',
  type: 'office',
  x: 12,
  level: 2,
  name: null,
  price: 'normal',
  occupied: true,
  variant: 'occupied',
};

const car: CarView = {
  shaftId: 's4',
  index: 0,
  position: 10.5,
  direction: 'up',
  doors: 'closed',
  load: 21,
};

const person: PersonView = {
  id: 'p3401',
  kind: 'officeWorker',
  x: 20.25,
  level: 2,
  facing: 'left',
  mode: 'ride',
  carRef: { shaftId: 's4', index: 0 },
  stress: 'stressed',
};

const finances: FinanceSummary = {
  thisWeek: { weekStartStep: 60480, income: { rent: 40000 }, expenses: { upkeep: -30000 } },
  lastWeek: null,
};

export const sampleClientMessages: ClientMessage[] = [
  { v, t: 'hello', p: { protocol: 1 } },
  ...sampleCommands.map((command, index) => ({
    v,
    t: 'command' as const,
    p: { id: `c${index}`, command },
  })),
  { v, t: 'viewport', p: { levelFrom: -10, levelTo: 104, xFrom: 0, xTo: 374 } },
  { v, t: 'inspect', p: { target: { kind: 'person', id: 'p3401' } } },
  { v, t: 'inspect', p: { target: { kind: 'finances' } } },
  { v, t: 'inspect', p: { target: null } },
  { v, t: 'ping', p: { clientTime: 1234.5 } },
];

export const sampleServerMessages: ServerMessage[] = [
  {
    v,
    t: 'snapshot',
    p: {
      step: 60480,
      money: -1200,
      stars: 3,
      population: 600,
      grid: {
        levels: { '1': { structure: 'l'.repeat(40) + '.'.repeat(335) } },
        mainLobbyHeight: 2,
      },
      units: [unit],
      transports: [{ id: 't3', type: 'stairs', x: 60, level: 1 }],
      shafts: [{ id: 's4', type: 'standard', x: 100, bottom: -1, top: 30, stops: [-1, 1, 2] }],
      cars: [car],
      people: [person],
      followed: [
        { id: 'p3401', name: 'Marta', kind: 'officeWorker', level: 2, x: 20, stress: 'normal' },
      ],
      activeEvents: [
        {
          kind: 'decision',
          id: 'e2',
          decision: 'bomb',
          deadlineStep: 61000,
          options: ['pay', 'refuse'],
        },
        { kind: 'disaster', id: 'e3', disaster: 'fire', cells: [{ level: 12, x0: 0, x1: 30 }] },
      ],
      notices: [{ id: 'n1', step: 60400, key: 'news.parkingOffice', unitId: 'u12', params: {} }],
      overlays: {
        evaluation: { u12: 'good', u13: null },
        price: { u12: 'normal' },
        hotel: { u20: 'dirty' },
      },
      finances,
    },
  },
  { v, t: 'delta', p: { step: 60481, cars: [], people: [] } },
  {
    v,
    t: 'delta',
    p: {
      step: 60482,
      money: 5000,
      stars: 4,
      population: 610,
      structure: [{ level: -1, structure: 'f'.repeat(375) }],
      unitsUpserted: [unit],
      unitsRemoved: ['u13'],
      transportsUpserted: [],
      transportsRemoved: ['t3'],
      shaftsUpserted: [],
      shaftsRemoved: ['s5'],
      cars: [packCar(car)],
      people: [packPerson(person)],
      peopleGone: ['p9'],
      followed: [],
      activeEvents: [],
      overlays: { price: { u12: 'high' } },
      finances,
    },
  },
  { v, t: 'commandResult', p: { id: 'c1', ok: true, step: 60482, cost: 5000, refund: 0 } },
  { v, t: 'commandResult', p: { id: 'c2', ok: false, step: 60482, error: 'CELL_OCCUPIED' } },
  {
    v,
    t: 'events',
    p: {
      events: [
        { type: 'moneyChanged', step: 1, amount: -5000, reason: 'construction', unitId: 'u12' },
        {
          type: 'decisionOpened',
          step: 1,
          eventId: 'e2',
          kind: 'fire',
          deadlineStep: 9,
          options: ['helicopter', 'burn'],
        },
        { type: 'decisionClosed', step: 2, eventId: 'e2', choice: 'burn', timedOut: true },
        { type: 'starsChanged', step: 2, stars: 6 },
        { type: 'starBlocked', step: 2, reason: 'security' },
        { type: 'disaster', step: 3, kind: 'bomb', cells: [{ level: -9, x0: 0, x1: 374 }] },
        { type: 'treasureFound', step: 3, amount: 1000000 },
        { type: 'news', step: 4, key: 'news.shopLeftEvaluation', unitId: null },
        { type: 'weddingCompleted', step: 4 },
        { type: 'sound', step: 5, sound: 'cashRegister', level: 2, x: 12 },
      ],
    },
  },
  {
    v,
    t: 'inspect',
    p: {
      kind: 'unit',
      id: 'u12',
      status: 'ok',
      name: 'Oficinas del Sur',
      type: 'office',
      level: 2,
      from: 12,
      to: 19,
      details: {
        group: 'lease',
        state: 'occupied',
        persons: 6,
        capacity: 6,
        evaluation: 'fair',
        price: 'normal',
        leaseWeek: 2,
        nextPaymentStep: 61000,
      },
    },
  },
  { v, t: 'inspect', p: { kind: 'unit', id: 'u13', status: 'gone' } },
  { v, t: 'inspect', p: { kind: 'shaft', id: 's9', status: 'gone' } },
  {
    v,
    t: 'inspect',
    p: {
      kind: 'person',
      id: 'p3401',
      name: null,
      personKind: 'hotelGuest',
      state: 'noRoute',
      destination: { kind: 'exit' },
      stressMinutes: 12.5,
      stress: 'normal',
      homeUnitId: 'u20',
    },
  },
  {
    v,
    t: 'inspect',
    p: {
      kind: 'shaft',
      id: 's4',
      status: 'ok',
      type: 'service',
      bottom: -1,
      top: 30,
      stops: [-1, 1],
      cars: [{ index: 0, homeLevel: 1, load: 3 }],
      schedule: sampleSchedule,
    },
  },
  { v, t: 'inspect', p: { kind: 'finances', money: 99999999, finances } },
  { v, t: 'error', p: { code: 'PROTOCOL_MISMATCH', message: 'Versión vieja' } },
  { v, t: 'pong', p: { clientTime: 1234.5, serverStep: 60482 } },
];
