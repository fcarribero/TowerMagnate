import type {
  CarView,
  Delta,
  PersonView,
  ShaftView,
  Snapshot,
  UnitView,
} from '@tower-magnate/shared';

export const office: UnitView = {
  id: 'u12',
  type: 'office',
  x: 12,
  level: 2,
  name: null,
  price: 'normal',
  occupied: true,
  variant: 'occupied',
};

export const car: CarView = {
  shaftId: 's4',
  index: 0,
  position: 10.5,
  direction: 'up',
  doors: 'closed',
  load: 3,
};

export const walker: PersonView = {
  id: 'p1',
  kind: 'officeWorker',
  x: 20,
  level: 2,
  facing: 'left',
  mode: 'walk',
  carRef: null,
  stress: 'normal',
};

export const shaft: ShaftView = {
  id: 's4',
  type: 'standard',
  x: 100,
  bottom: 1,
  top: 5,
  stops: [1, 2],
};

export const snapshot: Snapshot = {
  step: 100,
  money: 2_000_000,
  stars: 1,
  population: 6,
  grid: { levels: { '1': { structure: 'l'.repeat(375) } }, mainLobbyHeight: 1 },
  units: [office],
  transports: [{ id: 't3', type: 'stairs', x: 60, level: 1 }],
  shafts: [shaft],
  cars: [car],
  people: [walker],
  followed: [],
  activeEvents: [],
  notices: [],
  overlays: { evaluation: { u12: 'good' }, price: { u12: 'normal' }, hotel: {} },
  finances: { thisWeek: { weekStartStep: 0, income: {}, expenses: {} }, lastWeek: null },
};

export function delta(fields: Partial<Delta> = {}): Delta {
  return { step: 101, cars: [car], people: [walker], ...fields };
}
