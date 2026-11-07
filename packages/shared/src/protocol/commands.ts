import { z } from 'zod';
import { ErrorCodeSchema } from './errors';
import {
  ColumnSchema,
  EventIdSchema,
  LevelSchema,
  LobbyHeightSchema,
  MoneySchema,
  NameSchema,
  PersonEntityIdSchema,
  PriceLevelSchema,
  ShaftEntityIdSchema,
  ShaftTypeSchema,
  StepSchema,
  TransportEntityIdSchema,
  TransportTypeSchema,
  UnitEntityIdSchema,
  UnitTypeSchema,
} from './primitives';

export const BANDS_PER_DAY_TYPE = 6;
export const MAX_CARS_PER_SHAFT = 8;

/** Unit types placed with buildUnit; floors, lobbies and transport have their own commands. */
export const PlaceableUnitTypeSchema = UnitTypeSchema.exclude([
  'floor',
  'lobby',
  'stairs',
  'escalator',
  'standard-elevator',
  'service-elevator',
  'express-elevator',
]);

export const ElevatorBandSchema = z.object({
  mode: z.enum(['normal', 'expressUp', 'expressDown']),
  dwellSeconds: z.int().nonnegative(),
  responseDistance: z.int().positive(),
});

export const ElevatorScheduleSchema = z.object({
  weekday: z.array(ElevatorBandSchema).length(BANDS_PER_DAY_TYPE),
  weekend: z.array(ElevatorBandSchema).length(BANDS_PER_DAY_TYPE),
});

const levelSpan = { level: LevelSchema, x0: ColumnSchema, x1: ColumnSchema };

export const DemolishTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unit'), id: UnitEntityIdSchema }),
  z.object({ kind: z.literal('transport'), id: TransportEntityIdSchema }),
  z.object({ kind: z.literal('shaft'), id: ShaftEntityIdSchema }),
  z.object({ kind: z.literal('floor'), ...levelSpan }),
  z.object({ kind: z.literal('lobby'), ...levelSpan }),
  z.object({ kind: z.literal('ruins'), level: LevelSchema, x: ColumnSchema }),
]);

const buildCommands = [
  z.object({ type: z.literal('buildFloor'), ...levelSpan }),
  z.object({ type: z.literal('buildLobby'), ...levelSpan, height: LobbyHeightSchema }),
  z.object({
    type: z.literal('buildUnit'),
    unitType: PlaceableUnitTypeSchema,
    x: ColumnSchema,
    level: LevelSchema,
  }),
  z.object({
    type: z.literal('buildTransport'),
    transportType: TransportTypeSchema,
    x: ColumnSchema,
    level: LevelSchema,
  }),
  z.object({
    type: z.literal('buildShaft'),
    shaftType: ShaftTypeSchema,
    x: ColumnSchema,
    bottom: LevelSchema,
    top: LevelSchema,
  }),
  z.object({ type: z.literal('addCar'), shaftId: ShaftEntityIdSchema, homeLevel: LevelSchema }),
  z.object({
    type: z.literal('resizeShaft'),
    shaftId: ShaftEntityIdSchema,
    bottom: LevelSchema,
    top: LevelSchema,
  }),
] as const;

const demolishCommands = [
  z.object({ type: z.literal('demolish'), target: DemolishTargetSchema }),
  z.object({
    type: z.literal('removeCar'),
    shaftId: ShaftEntityIdSchema,
    carIndex: z
      .int()
      .min(0)
      .max(MAX_CARS_PER_SHAFT - 1),
  }),
] as const;

const operateCommands = [
  z.object({ type: z.literal('setPrice'), unitId: UnitEntityIdSchema, price: PriceLevelSchema }),
  z.object({
    type: z.literal('configureShaft'),
    shaftId: ShaftEntityIdSchema,
    stops: z.array(LevelSchema),
    carHomes: z.array(LevelSchema).max(MAX_CARS_PER_SHAFT),
    schedule: ElevatorScheduleSchema,
  }),
  z.object({
    type: z.literal('answerEvent'),
    eventId: EventIdSchema,
    choice: z.string().min(1).max(32),
  }),
  z.object({ type: z.literal('changeFilm'), unitId: UnitEntityIdSchema }),
  z.object({ type: z.literal('renameUnit'), unitId: UnitEntityIdSchema, name: NameSchema }),
  z.object({ type: z.literal('renamePerson'), personId: PersonEntityIdSchema, name: NameSchema }),
  z.object({ type: z.literal('followPerson'), personId: PersonEntityIdSchema }),
  z.object({ type: z.literal('unfollowPerson'), personId: PersonEntityIdSchema }),
] as const;

export const CommandSchema = z.discriminatedUnion('type', [
  ...buildCommands,
  ...demolishCommands,
  ...operateCommands,
]);

export const COMMAND_TYPES = CommandSchema.options.map((option) => option.shape.type.value);

export const QueuedCommandSchema = z.object({
  id: z.string().min(1).max(64),
  command: CommandSchema,
});

export const CommandResultSchema = z.discriminatedUnion('ok', [
  z.object({
    id: z.string(),
    ok: z.literal(true),
    step: StepSchema,
    cost: MoneySchema,
    refund: MoneySchema,
  }),
  z.object({
    id: z.string(),
    ok: z.literal(false),
    step: StepSchema,
    error: ErrorCodeSchema,
  }),
]);

export type ElevatorBand = z.infer<typeof ElevatorBandSchema>;
export type ElevatorSchedule = z.infer<typeof ElevatorScheduleSchema>;
export type DemolishTarget = z.infer<typeof DemolishTargetSchema>;
export type Command = z.infer<typeof CommandSchema>;
export type CommandType = Command['type'];
export type QueuedCommand = z.infer<typeof QueuedCommandSchema>;
export type CommandResult = z.infer<typeof CommandResultSchema>;
