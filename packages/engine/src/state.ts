import { STARTING_MONEY, type TowerState } from '@tower-magnate/shared';
import { createGrid } from './grid';
import { createLedger } from './money';
import { clonePersonPool, createPersonPool } from './people';
import { createRng } from './rng';
import { copyPlainData, copyUnits } from './step-copy';

export const SCHEMA_VERSION = 31;

export function createTower(seed: number): TowerState {
  if (!Number.isInteger(seed)) {
    throw new RangeError(`Tower seed must be an integer, got ${seed}`);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    step: 0,
    rng: createRng(seed),
    nextId: 1,
    money: STARTING_MONEY,
    stars: 1,
    units: {},
    transports: {},
    shafts: {},
    grid: createGrid(),
    floorPurchases: [],
    lobbyPurchases: [],
    people: createPersonPool(),
    tripLedger: {},
    unitLedger: {},
    ledger: createLedger(),
    activeEvents: [],
    closedDecisions: [],
    notices: [],
    newsSent: {},
    treasureLevels: [],
    vipApproved: false,
    vipVisit: null,
    lastMedicalFailureStep: null,
    lastParkingFailureStep: null,
    medicalDay: { day: 0, visits: {}, noticed: [] },
    parking: { spaces: {}, noticeDay: 0, noticed: [] },
    wedding: null,
    lastWeddingDay: null,
  };
}

/** A deep copy of the tower that a step or command can change freely. */
export function cloneState(state: TowerState): TowerState {
  const { people, units, ...rest } = state;
  return { ...copyPlainData(rest), units: copyUnits(units), people: clonePersonPool(people) };
}
