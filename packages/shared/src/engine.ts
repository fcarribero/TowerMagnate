import type { Ledger } from './ledger';
import type { Level } from './levels';
import type { DecisionKind, HotelRoomState, TransportType } from './protocol/primitives';
import type { PersonPool } from './people';
import type { PriceLevel, ShaftType, StarRating, UnitType } from './units';

/** Id of a placed unit, transport or shaft, with a type prefix: `u12`, `t3`, `s4`. */
export type EntityId = string;

export type StructureKind = 'floor' | 'lobby';

/** A run of cells on one level, from column x0 to x1 inclusive. */
export interface ColumnSpan {
  x0: number;
  x1: number;
}

export interface StructureSpan extends ColumnSpan {
  kind: StructureKind;
}

export type OccupantRef =
  | { kind: 'unit'; id: EntityId }
  | { kind: 'transport'; id: EntityId; part: 'footprint' | 'landing' }
  | { kind: 'shaft'; id: EntityId }
  | { kind: 'ruins' };

export interface OccupantSpan extends ColumnSpan {
  occupant: OccupantRef;
}

export interface LevelRow {
  /** Sorted by x0, never overlapping, adjacent spans of the same kind merged. */
  structure: StructureSpan[];
  /** Sorted by x0, never overlapping. */
  occupants: OccupantSpan[];
}

export type LobbyHeight = 1 | 2 | 3;

export interface GridState {
  /** Only levels that hold structure or occupants have a row. */
  levels: Partial<Record<Level, LevelRow>>;
  /** Set by the first lobby built on level 1; null until then. */
  mainLobbyHeight: LobbyHeight | null;
  /** Keyed by sky lobby floor (15, 30, ... 90), set by the first lobby built there. */
  skyLobbyHeights: Partial<Record<Level, LobbyHeight>>;
}

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Instance id of a placed unit, such as `u12`. The catalog type is `UnitType`. */
export type UnitId = string;

export interface Unit {
  id: UnitId;
  type: UnitType;
  /** Leftmost column. */
  x: number;
  /** Bottom level. */
  level: Level;
  /** Player-chosen name; null shows the default name. */
  name: string | null;
  priceLevel: PriceLevel;
  /** Whole dollars charged at placement, automatic floor included. */
  paid: number;
  placedAtStep: number;
  /** Set on the first lease, sale, check-in or visitor. */
  used: boolean;
  /** The current office or shop tenant's lease; null while the unit is for rent. */
  lease: Lease | null;
  /** The state of a hotel room; null for every other unit. */
  hotel: HotelRoom | null;
  /** The current owners' purchase of a condo; null while the condo is for sale. */
  sale: CondoSale | null;
}

export interface HotelRoom {
  state: HotelRoomState;
  /** When the current stay ends (10:00 on its last day); null while nobody is staying. */
  stayEndStep: number | null;
}

/** A staircase or escalator. Its cells on `level` are the footprint; the level above has the landing. */
export interface Transport {
  id: EntityId;
  type: TransportType;
  /** Leftmost column. */
  x: number;
  /** Lower level. */
  level: Level;
}

/** Instance id of a placed elevator shaft, such as `s4`. */
export type ShaftId = string;

export interface ElevatorCar {
  /** Where the car waits when idle. Always inside the shaft's range. */
  homeLevel: Level;
  level: Level;
  /** Person entity ids of the people inside the car. */
  riders: EntityId[];
  /** Where each rider is going and when they boarded; same order as `riders`. */
  trips: RiderTrip[];
  phase: CarPhase;
  /** The way the car is heading; idle while it is free and not moving. */
  direction: CarDirection;
  /** Steps of the current door or dwell phase still to run. */
  phaseStepsLeft: number;
  /** Hall calls this car has promised to answer. */
  assigned: HallCall[];
  /** Whole dollars charged for this car. */
  paid: number;
  placedAtStep: number;
}

export type HallDirection = 'up' | 'down';

export const CAR_DIRECTIONS = ['up', 'down', 'idle'] as const;
export type CarDirection = (typeof CAR_DIRECTIONS)[number];

export const CAR_PHASES = ['idle', 'moving', 'opening', 'dwelling', 'closing'] as const;
/** What a car does in its next step; `idle` means it decides what to do. */
export type CarPhase = (typeof CAR_PHASES)[number];

/** A non-empty queue at a stop, in one direction. */
export interface HallCall {
  level: Level;
  direction: HallDirection;
}

export interface RiderTrip {
  destination: Level;
  boardedStep: number;
  /** Steps from joining the queue to boarding. */
  waitSteps: number;
}

/** A person waiting at a stop, and the step they joined the queue. */
export interface QueueEntry {
  person: EntityId;
  /** The stop where the person gets off. */
  destination: Level;
  joinedStep: number;
}

/** The two floor queues of one stop, first in line at index 0. */
export interface StopQueues {
  up: QueueEntry[];
  down: QueueEntry[];
}

export const ELEVATOR_MODES = ['normal', 'expressUp', 'expressDown'] as const;
export type ElevatorMode = (typeof ELEVATOR_MODES)[number];

/** How a shaft runs during one band of the day (elevators 7). */
export interface ShaftBand {
  mode: ElevatorMode;
  dwellSeconds: number;
  responseDistance: number;
}

/** Six bands for Monday to Friday and six for the weekend. */
export interface ShaftSchedule {
  weekday: ShaftBand[];
  weekend: ShaftBand[];
}

export interface Shaft {
  id: ShaftId;
  type: ShaftType;
  /** Leftmost column. */
  x: number;
  bottom: Level;
  top: Level;
  /** 1 to 8 cars; car index is the position in this list. */
  cars: ElevatorCar[];
  /** Levels where cars stop, ascending. */
  stops: Level[];
  schedule: ShaftSchedule;
  /** Stops that have someone waiting, by level number. Empty queues are not stored. */
  queues: Record<string, StopQueues>;
  /** Whole dollars charged for the shaft itself, cars not included. */
  paid: number;
  placedAtStep: number;
}

export interface Lease {
  /** Move-in or last renewal step. Payments fall on whole weeks after it. */
  anchorStep: number;
  /** The next payment or, at the end of the term, the evaluation. */
  nextDueStep: number;
}

export interface CondoSale {
  /** Whole dollars the owners paid; a buyback returns exactly this. */
  price: number;
  /** The step of the sale, which starts the 4-week evaluation cycle. */
  anchorStep: number;
  /** The next owner evaluation. */
  nextEvaluationStep: number;
}

export type TenantEvaluation = 'good' | 'fair' | 'poor';

export interface TowerState {
  schemaVersion: number;
  step: number;
  rng: RngState;
  nextId: number;
  /** Whole dollars, may be negative, never above MONEY_CAP. */
  money: number;
  /** The tower's star rating, which unlocks unit types. */
  stars: StarRating;
  units: Record<UnitId, Unit>;
  transports: Record<EntityId, Transport>;
  shafts: Record<ShaftId, Shaft>;
  grid: GridState;
  people: PersonPool;
  ledger: Ledger;
  /** At most one bomb threat or fire at a time. */
  activeEvents: ActiveEvent[];
  /** Ids of the last CLOSED_DECISIONS_KEPT closed decisions, newest last. */
  closedDecisions: EventId[];
  /** The last NOTICES_KEPT notices, newest last. */
  notices: Notice[];
  /** Basement levels that have already given treasure. */
  treasureLevels: Level[];
  /** Set when a VIP visit that started at 3 stars ends approved. */
  vipApproved: boolean;
  /** Step of the last medical visit that failed; null if none yet. */
  lastMedicalFailureStep: number | null;
  /** Step of the last parking failure; null if none yet. */
  lastParkingFailureStep: number | null;
}

/** A news line the player was shown; `key` names its text. */
export interface Notice {
  /** `n<step>.<index>`, unique within the tower. */
  id: string;
  step: number;
  key: string;
  unitId: UnitId | null;
}

/** Id of a tower event, such as `e7`. */
export type EventId = string;

export interface Decision {
  openStep: number;
  deadlineStep: number;
  /** Dialog order, default last. */
  options: string[];
  defaultChoice: string;
  /** Null while the decision is open. */
  choice: string | null;
}

export interface BombThreat {
  kind: 'bomb';
  id: EventId;
  decision: Decision;
  ransom: number;
}

export interface Fire {
  kind: 'fire';
  id: EventId;
  decision: Decision;
  startStep: number;
  /** The floor where the fire started. */
  level: Level;
}

export type ActiveEvent = BombThreat | Fire;

/** Events caused by a player command carry that command's id. */
export type EngineEvent =
  | {
      type: 'unitRenamed';
      step: number;
      commandId: string;
      unitId: UnitId;
      name: string | null;
    }
  | { type: 'leaseSigned' | 'leaseRenewed' | 'leaseEnded'; step: number; unitId: UnitId }
  | { type: 'condoSold' | 'condoVacated'; step: number; unitId: UnitId }
  | {
      type: 'rideFinished';
      step: number;
      person: EntityId;
      shaftId: ShaftId;
      carIndex: number;
      level: Level;
      waitSteps: number;
      rideSteps: number;
    }
  | { type: 'tripFinished'; step: number; person: EntityId; arrived: boolean }
  | { type: 'routeSearchFailed'; step: number; person: EntityId }
  | { type: 'hotelCheckIn'; step: number; unitId: UnitId; nights: number; paid: number }
  | { type: 'hotelCheckOut'; step: number; unitId: UnitId }
  | { type: 'roomStateChanged'; step: number; unitId: UnitId; state: HotelRoomState }
  | { type: 'starsChanged'; step: number; stars: StarRating; unlocked: UnitType[] }
  | {
      type: 'decisionOpened';
      step: number;
      eventId: EventId;
      kind: DecisionKind;
      deadlineStep: number;
      options: string[];
    }
  | { type: 'decisionClosed'; step: number; eventId: EventId; choice: string }
  | {
      type: 'decisionClosed';
      step: number;
      commandId: string;
      eventId: EventId;
      choice: string;
    }
  | { type: 'treasureFound'; step: number; commandId: string; level: Level; amount: number }
  | { type: 'news'; step: number; commandId: string; key: 'news.treasure'; level: Level }
  | { type: 'news'; step: number; key: 'news.decisionDefault'; eventId: EventId; choice: string }
  | { type: 'news'; step: number; key: string; unitId: UnitId | null };
