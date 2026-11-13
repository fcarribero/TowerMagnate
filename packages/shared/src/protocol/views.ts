import { z } from 'zod';
import { TOWER_LAYOUT } from '../balance';
import { CAR_DIRECTIONS } from '../engine';
import { MAX_NAME_LENGTH } from '../names';
import { WEDDING_GUESTS } from '../people-schedules';
import { ElevatorScheduleSchema, MAX_CARS_PER_SHAFT } from './commands';
import {
  CAR_DOORS,
  FACINGS,
  PackedCarSchema,
  PackedPersonSchema,
  PERSON_MODES,
  STRESS_LEVELS,
} from './packed';
import {
  CellRangeSchema,
  ColumnSchema,
  DecisionKindSchema,
  EvaluationSchema,
  EventIdSchema,
  HotelRoomStateSchema,
  StarRequirementSchema,
  LevelSchema,
  LobbyHeightSchema,
  MoneyReasonSchema,
  MoneySchema,
  PersonEntityIdSchema,
  PersonKindSchema,
  PriceLevelSchema,
  ShaftEntityIdSchema,
  ShaftTypeSchema,
  StarRatingSchema,
  StepSchema,
  TransportEntityIdSchema,
  TransportTypeSchema,
  UnitEntityIdSchema,
  UnitTypeSchema,
} from './primitives';

export const MAX_FOLLOWED_PEOPLE = 20;
const MAX_CAR_LOAD = 42;

/** One character per column: '.' none, 'f' floor, 'l' lobby, 'r' ruins. */
export const StructureRowSchema = z
  .string()
  .length(TOWER_LAYOUT.siteWidthCells)
  .regex(/^[.flr]*$/);

const ColumnPositionSchema = z.number().min(0).max(TOWER_LAYOUT.siteWidthCells);
const DenseLevelPositionSchema = z.number().nonnegative();
const DisplayNameSchema = z.string().max(MAX_NAME_LENGTH);
const CarIndexSchema = z
  .int()
  .min(0)
  .max(MAX_CARS_PER_SHAFT - 1);
const CarLoadSchema = z.int().min(0).max(MAX_CAR_LOAD);

export const UnitViewSchema = z.object({
  id: UnitEntityIdSchema,
  type: UnitTypeSchema,
  x: ColumnSchema,
  level: LevelSchema,
  name: DisplayNameSchema.nullable(),
  price: PriceLevelSchema,
  occupied: z.boolean(),
  variant: z.enum(['empty', 'occupied', 'dirty', 'infested', 'disconnected']),
  /** True while at least one person stands inside the unit; left out when nobody is. */
  inside: z.boolean().optional(),
  /** Percent built, 0 to 100, while the unit is a construction site; left out once it is built. */
  construction: z.int().min(0).max(100).optional(),
});

export const TransportViewSchema = z.object({
  id: TransportEntityIdSchema,
  type: TransportTypeSchema,
  x: ColumnSchema,
  level: LevelSchema,
});

export const ShaftViewSchema = z.object({
  id: ShaftEntityIdSchema,
  type: ShaftTypeSchema,
  x: ColumnSchema,
  bottom: LevelSchema,
  top: LevelSchema,
  stops: z.array(LevelSchema),
});

export const CarRefSchema = z.object({ shaftId: ShaftEntityIdSchema, index: CarIndexSchema });

export const CarViewSchema = z.object({
  shaftId: ShaftEntityIdSchema,
  index: CarIndexSchema,
  position: DenseLevelPositionSchema,
  direction: z.enum(CAR_DIRECTIONS),
  doors: z.enum(CAR_DOORS),
  load: CarLoadSchema,
});

export const StressLevelSchema = z.enum(STRESS_LEVELS);

export const PersonViewSchema = z.object({
  id: PersonEntityIdSchema,
  kind: PersonKindSchema,
  x: ColumnPositionSchema,
  level: LevelSchema,
  facing: z.enum(FACINGS),
  mode: z.enum(PERSON_MODES),
  carRef: CarRefSchema.nullable(),
  stress: StressLevelSchema,
});

export const FollowedViewSchema = z.object({
  id: PersonEntityIdSchema,
  name: DisplayNameSchema,
  kind: PersonKindSchema,
  level: LevelSchema,
  x: ColumnPositionSchema,
  stress: StressLevelSchema,
});

export const FireSpanSchema = z.object({
  level: LevelSchema,
  x0: ColumnSchema,
  x1: ColumnSchema,
  /** True once both fronts of the level are out. */
  out: z.boolean(),
});

const OptionsSchema = z.array(z.string().min(1)).min(1);

export const EventViewSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('decision'),
    id: EventIdSchema,
    decision: DecisionKindSchema,
    deadlineStep: StepSchema,
    options: OptionsSchema,
    /** Only for a bomb threat. */
    ransom: MoneySchema.optional(),
    /** Only for a fire: the floor it burns on. */
    level: LevelSchema.optional(),
    /** Only for a fire: the burned span of every level that has burned. */
    spans: z.array(FireSpanSchema).optional(),
  }),
  z.object({
    kind: z.literal('disaster'),
    id: EventIdSchema,
    disaster: DecisionKindSchema,
    cells: z.array(CellRangeSchema),
    /** Only for a fire: the burned span of every level that has burned. */
    spans: z.array(FireSpanSchema).optional(),
  }),
  z.object({
    kind: z.literal('wedding'),
    cathedral: UnitEntityIdSchema,
    /** The wedding guests in the tower so far; all of them once the last has arrived. */
    guests: z.array(PersonEntityIdSchema).max(WEDDING_GUESTS),
  }),
]);

/** Values a news text fills in, such as `level` ("12", "S3") or `amount` ("$50.000"). */
export const NoticeParamTextsSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export const NoticeViewSchema = z.object({
  id: z.string().min(1),
  step: StepSchema,
  key: z.string().min(1),
  unitId: UnitEntityIdSchema.nullable(),
  params: NoticeParamTextsSchema,
});

export const OverlayDataSchema = z.object({
  evaluation: z.record(UnitEntityIdSchema, EvaluationSchema.nullable()),
  price: z.record(UnitEntityIdSchema, PriceLevelSchema),
  hotel: z.record(UnitEntityIdSchema, HotelRoomStateSchema),
});

const AmountsByReasonSchema = z.partialRecord(MoneyReasonSchema, MoneySchema);

export const FinanceWeekSchema = z.object({
  weekStartStep: StepSchema,
  income: AmountsByReasonSchema,
  expenses: AmountsByReasonSchema,
});

export const FinanceSummarySchema = z.object({
  thisWeek: FinanceWeekSchema,
  lastWeek: FinanceWeekSchema.nullable(),
});

const LevelKeySchema = z
  .string()
  .refine((key) => LevelSchema.safeParse(Number(key)).success, { message: 'Not a level' });

/** A requirement of the next star step besides population, as the next check would see it now. */
export const StarRequirementViewSchema = z.object({
  requirement: StarRequirementSchema,
  met: z.boolean(),
});

export const SnapshotSchema = z.object({
  step: StepSchema,
  money: MoneySchema,
  stars: StarRatingSchema,
  population: z.int().nonnegative(),
  starRequirements: z.array(StarRequirementViewSchema),
  grid: z.object({
    levels: z.record(LevelKeySchema, z.object({ structure: StructureRowSchema })),
    mainLobbyHeight: LobbyHeightSchema.nullable(),
  }),
  units: z.array(UnitViewSchema),
  transports: z.array(TransportViewSchema),
  shafts: z.array(ShaftViewSchema),
  cars: z.array(CarViewSchema),
  people: z.array(PersonViewSchema),
  followed: z.array(FollowedViewSchema).max(MAX_FOLLOWED_PEOPLE),
  activeEvents: z.array(EventViewSchema),
  notices: z.array(NoticeViewSchema),
  overlays: OverlayDataSchema,
  finances: FinanceSummarySchema,
});

export const DeltaSchema = z.object({
  step: StepSchema,
  money: MoneySchema.optional(),
  stars: StarRatingSchema.optional(),
  population: z.int().nonnegative().optional(),
  starRequirements: z.array(StarRequirementViewSchema).optional(),
  mainLobbyHeight: LobbyHeightSchema.optional(),
  structure: z.array(z.object({ level: LevelSchema, structure: StructureRowSchema })).optional(),
  unitsUpserted: z.array(UnitViewSchema).optional(),
  unitsRemoved: z.array(UnitEntityIdSchema).optional(),
  transportsUpserted: z.array(TransportViewSchema).optional(),
  transportsRemoved: z.array(TransportEntityIdSchema).optional(),
  shaftsUpserted: z.array(ShaftViewSchema).optional(),
  shaftsRemoved: z.array(ShaftEntityIdSchema).optional(),
  /** Complete for the viewport, as packed tuples (see packed.ts). */
  cars: z.array(PackedCarSchema),
  people: z.array(PackedPersonSchema),
  peopleGone: z.array(PersonEntityIdSchema).optional(),
  followed: z.array(FollowedViewSchema).max(MAX_FOLLOWED_PEOPLE).optional(),
  activeEvents: z.array(EventViewSchema).optional(),
  /** The complete list of the last notices, sent when it changes. */
  notices: z.array(NoticeViewSchema).optional(),
  overlays: OverlayDataSchema.partial().optional(),
  finances: FinanceSummarySchema.optional(),
});

export const ClientEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('moneyChanged'),
    step: StepSchema,
    amount: MoneySchema,
    reason: MoneyReasonSchema,
    unitId: UnitEntityIdSchema.nullable(),
  }),
  z.object({
    type: z.literal('decisionOpened'),
    step: StepSchema,
    eventId: EventIdSchema,
    kind: DecisionKindSchema,
    deadlineStep: StepSchema,
    options: OptionsSchema,
  }),
  z.object({
    type: z.literal('decisionClosed'),
    step: StepSchema,
    eventId: EventIdSchema,
    choice: z.string().min(1),
    /** True when the deadline passed and the default choice was taken. */
    timedOut: z.boolean(),
  }),
  z.object({ type: z.literal('starsChanged'), step: StepSchema, stars: StarRatingSchema }),
  z.object({ type: z.literal('starBlocked'), step: StepSchema, reason: z.string().min(1) }),
  z.object({
    type: z.literal('disaster'),
    step: StepSchema,
    kind: DecisionKindSchema,
    cells: z.array(CellRangeSchema),
  }),
  z.object({ type: z.literal('treasureFound'), step: StepSchema, amount: MoneySchema }),
  z.object({
    type: z.literal('news'),
    step: StepSchema,
    key: z.string().min(1),
    unitId: UnitEntityIdSchema.nullable(),
    params: NoticeParamTextsSchema,
  }),
  z.object({ type: z.literal('weddingCompleted'), step: StepSchema }),
  z.object({
    type: z.literal('sound'),
    step: StepSchema,
    sound: z.string().min(1),
    level: LevelSchema,
    x: ColumnSchema,
  }),
]);

const PersonDestinationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unit'), unitId: UnitEntityIdSchema, level: LevelSchema }),
  z.object({ kind: z.literal('exit') }),
]);

const InspectedCarSchema = z.object({
  index: CarIndexSchema,
  homeLevel: LevelSchema,
  load: CarLoadSchema,
});

const InspectedUnitDetailsSchema = z.discriminatedUnion('group', [
  z.object({
    group: z.literal('lease'),
    state: z.enum(['occupied', 'forRent']),
    persons: z.int().nonnegative(),
    capacity: z.int().positive(),
    evaluation: EvaluationSchema.nullable(),
    price: PriceLevelSchema,
    leaseWeek: z.int().positive().nullable(),
    nextPaymentStep: StepSchema.nullable(),
  }),
  z.object({
    group: z.literal('condo'),
    state: z.enum(['sold', 'forSale']),
    residents: z.int().nonnegative(),
    capacity: z.int().positive(),
    evaluation: EvaluationSchema.nullable(),
    price: PriceLevelSchema,
    nextEvaluationStep: StepSchema.nullable(),
  }),
  z.object({
    group: z.literal('hotel'),
    state: HotelRoomStateSchema,
    guests: z.int().nonnegative(),
    capacity: z.int().positive(),
    evaluation: EvaluationSchema.nullable(),
    price: PriceLevelSchema,
    checkoutStep: StepSchema.nullable(),
  }),
  z.object({
    group: z.literal('cinema'),
    filmWeek: z.int().positive().nullable(),
    filmAgeDays: z.int().nonnegative().nullable(),
    price: PriceLevelSchema,
  }),
  /** A unit the crew has not finished; the points it needs are never sent. */
  z.object({ group: z.literal('construction') }),
  z.object({
    group: z.literal('housekeeping'),
    maidsWorking: z.int().nonnegative(),
    maids: z.int().nonnegative(),
    /** Sucia rooms in the whole tower. */
    dirtyRooms: z.int().nonnegative(),
  }),
]);

/** A unit that is gone or never existed: sent once, then the server drops the target. */
const InspectedUnitGoneSchema = z.object({
  kind: z.literal('unit'),
  id: UnitEntityIdSchema,
  status: z.literal('gone'),
});

/** A person who left the tower or never existed: sent once, then the server drops the target. */
const InspectedPersonGoneSchema = z.object({
  kind: z.literal('person'),
  id: PersonEntityIdSchema,
  status: z.literal('gone'),
});

const InspectedUnitFoundSchema = z.object({
  kind: z.literal('unit'),
  id: UnitEntityIdSchema,
  status: z.literal('ok'),
  name: DisplayNameSchema.nullable(),
  type: UnitTypeSchema,
  level: LevelSchema,
  from: ColumnSchema,
  to: ColumnSchema,
  /** Fields of the unit's type; null for types that show only the common ones. */
  details: InspectedUnitDetailsSchema.nullable(),
});

/** A shaft that was removed or never existed: sent once, then the server drops the target. */
const InspectedShaftGoneSchema = z.object({
  kind: z.literal('shaft'),
  id: ShaftEntityIdSchema,
  status: z.literal('gone'),
});

export const InspectDataSchema = z.union([
  InspectedUnitFoundSchema,
  InspectedUnitGoneSchema,
  InspectedPersonGoneSchema,
  z.object({
    kind: z.literal('person'),
    id: PersonEntityIdSchema,
    status: z.literal('ok'),
    name: DisplayNameSchema.nullable(),
    personKind: PersonKindSchema,
    state: z.enum(['walk', 'wait', 'ride', 'stairs', 'inside', 'noRoute', 'outside']),
    destination: PersonDestinationSchema.nullable(),
    stressMinutes: z.number().nonnegative(),
    stress: StressLevelSchema,
    homeUnitId: UnitEntityIdSchema.nullable(),
  }),
  InspectedShaftGoneSchema,
  z.object({
    kind: z.literal('shaft'),
    id: ShaftEntityIdSchema,
    status: z.literal('ok'),
    type: ShaftTypeSchema,
    bottom: LevelSchema,
    top: LevelSchema,
    stops: z.array(LevelSchema),
    cars: z.array(InspectedCarSchema).max(MAX_CARS_PER_SHAFT),
    schedule: ElevatorScheduleSchema,
  }),
  z.object({ kind: z.literal('finances'), money: MoneySchema, finances: FinanceSummarySchema }),
]);

export type UnitView = z.infer<typeof UnitViewSchema>;
export type TransportView = z.infer<typeof TransportViewSchema>;
export type ShaftView = z.infer<typeof ShaftViewSchema>;
export type CarView = z.infer<typeof CarViewSchema>;
export type PersonView = z.infer<typeof PersonViewSchema>;
export type FollowedView = z.infer<typeof FollowedViewSchema>;
export type FireSpan = z.infer<typeof FireSpanSchema>;
export type EventView = z.infer<typeof EventViewSchema>;
export type NoticeView = z.infer<typeof NoticeViewSchema>;
export type OverlayData = z.infer<typeof OverlayDataSchema>;
export type FinanceWeek = z.infer<typeof FinanceWeekSchema>;
export type FinanceSummary = z.infer<typeof FinanceSummarySchema>;
export type StarRequirementView = z.infer<typeof StarRequirementViewSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type Delta = z.infer<typeof DeltaSchema>;
export type ClientEvent = z.infer<typeof ClientEventSchema>;
export type InspectData = z.infer<typeof InspectDataSchema>;
export type InspectedUnitDetails = z.infer<typeof InspectedUnitDetailsSchema>;
