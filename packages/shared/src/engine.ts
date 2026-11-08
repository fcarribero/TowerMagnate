import type { Ledger } from './ledger';
import type { Level } from './levels';
import type { CellRange, DecisionKind, HotelRoomState, TransportType } from './protocol/primitives';
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
  /** The last grade of an office, shop, condo or hotel room; null shows "Sin evaluar". */
  evaluation: TenantEvaluation | null;
  /** The day's visit counts of a food, entertainment or retail venue; null for every other unit. */
  venue: VenueDay | null;
}

export interface VenueDay {
  /** Visits started today inside the venue's hours. For a cinema: the 14:00 show. */
  visits: number;
  /** Visits to the cinema's 19:00 show today; always 0 for other venues. */
  eveningShowVisits: number;
  /** Count and payout of the last paid day; null until the first payout. */
  yesterday: { visits: number; result: number | null } | null;
  /** Visits started today inside the venue's counting hours, retail shops included. */
  countToday: number;
  /** The count of the day that ended at the last 00:00 (stars spec 3.2). */
  previousDayCount: number;
  /** Trip stress, in steps, of today's counted visits whose trip was walked. */
  stressSum: number;
  /** How many of today's counted visits added to `stressSum`. */
  stressTrips: number;
  /** Steps at which today's outside customers still to come appear, earliest first. */
  customers: number[];
}

export interface HotelRoom {
  state: HotelRoomState;
  /** When the current stay ends (10:00 on its last day); null while nobody is staying. */
  stayEndStep: number | null;
  /** Check-in step of the current or last stay; null before the first stay. */
  checkInStep: number | null;
  /** Price level the current or last stay paid at check-in; null before the first stay. */
  paidLevel: PriceLevel | null;
  /** Arrival step of the booked party until it checks in or gives up; null with no booking. */
  arrivalStep: number | null;
  /** The room just became clean and rolls for a booking at once if the clock allows it. */
  rollDue: boolean;
}

/** A staircase or escalator. Its cells on `level` are the footprint; the level above has the landing. */
export interface Transport {
  id: EntityId;
  type: TransportType;
  /** Leftmost column. */
  x: number;
  /** Lower level. */
  level: Level;
  /** Whole dollars charged at placement. */
  paid: number;
  placedAtStep: number;
}

/** Floor bought with the floor tool on one level, kept while it can still be refunded. */
export interface FloorPurchase extends ColumnSpan {
  level: Level;
  /** Whole dollars charged for each cell. */
  paidPerCell: number;
  placedAtStep: number;
}

/** Sky lobby columns bought on one lobby level, kept while they can still be refunded. */
export interface LobbyPurchase extends ColumnSpan {
  /** The sky lobby level the run stands on. */
  level: Level;
  /** Whole dollars charged for each column, all its rows together. */
  paidPerColumn: number;
  placedAtStep: number;
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
  /** Customer visits that started since the last payment or move-in; only shops count them. */
  weekVisits: number;
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
  /** Floor tool purchases still inside the refund window; older ones may linger until pruned. */
  floorPurchases: FloorPurchase[];
  /** Sky lobby purchases still inside the refund window; older ones may linger until pruned. */
  lobbyPurchases: LobbyPurchase[];
  people: PersonPool;
  /**
   * Trips each person ended in the last STRESS_WINDOW_STEPS, keyed by person number: pairs of
   * end step and trip stress, oldest first.
   */
  tripLedger: Record<string, number[]>;
  /**
   * Trips filed for each evaluated unit since its ledger was last cleared, keyed by unit id:
   * pairs of end step and trip stress, oldest first.
   */
  unitLedger: Record<UnitId, number[]>;
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
  /** Medical center visits and notices of one game day; a new day starts them over. */
  medicalDay: MedicalDay;
  parking: ParkingState;
  /** Today's wedding attempt, from 00:00 until its guests leave; null on other days. */
  wedding: WeddingAttempt | null;
}

/** A weekend day's wedding attempt (stars spec 7, people spec 15). */
export interface WeddingAttempt {
  /** Day number of the attempt. */
  day: number;
  /** The cathedral the guests travel to. */
  cathedral: UnitId;
  /** Steps at which the guests still to come appear, earliest first. */
  arrivals: number[];
  /** Guests inside the cathedral. */
  inside: number;
  outcome: WeddingOutcome;
}

export type WeddingOutcome = 'pending' | 'completed' | 'failed';

export interface ParkingState {
  /** Parking holders by person number; the value is the unit number of their space, or 0 for none. */
  spaces: Record<number, number>;
  /** Day number of the notices below; a new day starts them over. */
  noticeDay: number;
  /** News keys already shown on `noticeDay`. */
  noticed: string[];
}

export interface MedicalDay {
  /** Day number, from 0 at step 0. */
  day: number;
  /** Visits so far today, by unit number of the medical center. */
  visits: Record<number, number>;
  /** News keys already shown today. */
  noticed: string[];
}

/** The values a news text fills in, as the engine knows them (messages.md, params column). */
export interface NoticeParams {
  level?: Level;
  amount?: number;
  n?: number;
  /** Id of the option a decision applied by default; the client shows its button text. */
  option?: string;
}

/** A news line the player was shown; `key` names its text. */
export interface Notice {
  /** `n<step>.<index>`, unique within the tower. */
  id: string;
  step: number;
  key: string;
  unitId: UnitId | null;
  params: NoticeParams;
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

export type SearchLevelState = 'unsearched' | 'taken' | 'searched';

/** A guard on the bomb search: its level, and the step its search ends once it has arrived. */
export interface SearchingGuard {
  level: Level;
  endStep: number | null;
}

export interface BombSearch {
  bombLevel: Level;
  levels: Partial<Record<Level, SearchLevelState>>;
  /** Keyed by person number. */
  guards: Record<number, SearchingGuard>;
  /** Levels each guard found unreachable, keyed by person number. */
  unreachable: Record<number, Level[]>;
}

/** The cell of a bomb: a column on the bottom level of the unit it was drawn in. */
export interface BombCell {
  x: number;
  level: Level;
}

export interface BombThreat {
  kind: 'bomb';
  id: EventId;
  decision: Decision;
  ransom: number;
  /** Fixed when the threat opens; never sent to the client. */
  bomb: BombCell;
  /** Null until the search starts. */
  search: BombSearch | null;
}

export interface Fire {
  kind: 'fire';
  id: EventId;
  decision: Decision;
  startStep: number;
  /** The floor where the fire started. */
  level: Level;
  /** Every level that has burned in this fire. */
  levels: Partial<Record<Level, BurningLevel>>;
  /** Guards with a target, keyed by person number. */
  guards: Record<number, FireGuard>;
}

export interface FireFront {
  x: number;
  /** Guard minutes spent on this front; it is out at FIRE_FRONT_CONTAINMENT. */
  progress: number;
  out: boolean;
}

export interface BurningLevel {
  ignitionStep: number;
  ignitionColumn: number;
  left: FireFront;
  right: FireFront;
}

export type FireSide = 'left' | 'right';

export interface FireGuard {
  level: Level;
  /** Null while the guard is still travelling to the level. */
  side: FireSide | null;
  /** Step of arrival, null while travelling. */
  arrivedStep: number | null;
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
  | { type: 'weddingCompleted'; step: number }
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
  | {
      type: 'news';
      step: number;
      commandId: string;
      key: 'news.treasure';
      level: Level;
      amount: number;
    }
  | { type: 'news'; step: number; commandId: string; key: 'news.bombPaid'; unitId: null }
  | { type: 'disaster'; step: number; kind: DecisionKind; cells: CellRange[] }
  | { type: 'news'; step: number; key: 'news.bombExploded'; level: Level }
  | { type: 'news'; step: number; key: 'news.starsUp'; n: number }
  | { type: 'news'; step: number; key: 'news.decisionDefault'; eventId: EventId; choice: string }
  | { type: 'news'; step: number; key: string; unitId: UnitId | null };
