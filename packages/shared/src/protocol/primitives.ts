import { z } from 'zod';
import { TOWER_LAYOUT, UNIT_CATALOG } from '../balance';
import { MAX_NAME_LENGTH } from '../names';
import { PRICE_LEVELS, SHAFT_TYPES, UNIT_TYPES } from '../units';

function cathedralFloors(): number {
  const height = UNIT_CATALOG.cathedral.height;
  if (height.kind !== 'fixed') {
    throw new Error('The cathedral must have a fixed height');
  }
  return height.floors;
}

export const LOWEST_PROTOCOL_LEVEL = -TOWER_LAYOUT.subwayTunnelBasement;
export const HIGHEST_PROTOCOL_LEVEL = TOWER_LAYOUT.floorsAboveGround + cathedralFloors();

export const LevelSchema = z
  .int()
  .min(LOWEST_PROTOCOL_LEVEL)
  .max(HIGHEST_PROTOCOL_LEVEL)
  .refine((level) => level !== 0, { message: 'There is no level 0' });

export const ColumnSchema = z
  .int()
  .min(0)
  .max(TOWER_LAYOUT.siteWidthCells - 1);

export const StepSchema = z.int().nonnegative();
export const MoneySchema = z.int();
export const StarRatingSchema = z.literal([1, 2, 3, 4, 5, 6]);
export const LobbyHeightSchema = z.literal([1, 2, 3]);
export const PriceLevelSchema = z.enum(PRICE_LEVELS);
export const UnitTypeSchema = z.enum(UNIT_TYPES);

/** Empty after trimming means "remove the custom name". */
export const NameSchema = z.string().trim().max(MAX_NAME_LENGTH);

function entityId(prefix: string) {
  return z.string().regex(new RegExp(`^${prefix}[1-9][0-9]*$`), `Expected an id like ${prefix}12`);
}

export const UnitEntityIdSchema = entityId('u');
export const TransportEntityIdSchema = entityId('t');
export const ShaftEntityIdSchema = entityId('s');
export const PersonEntityIdSchema = entityId('p');
export const EventIdSchema = entityId('e');

export const ShaftTypeSchema = z.enum(SHAFT_TYPES);
export const TransportTypeSchema = z.enum(['stairs', 'escalator']);
export const EvaluationSchema = z.enum(['good', 'fair', 'poor']);
export const HotelRoomStateSchema = z.enum(['clean', 'occupied', 'dirty', 'infested']);
export const DecisionKindSchema = z.enum(['bomb', 'fire']);

export const PersonKindSchema = z.enum([
  'officeWorker',
  'resident',
  'hotelGuest',
  'customer',
  'audience',
  'partyGuest',
  'maid',
  'guard',
  'vip',
  'weddingGuest',
  'prospect',
]);

export const MoneyReasonSchema = z.enum([
  'rent',
  'sale',
  'hotel',
  'dailyPayout',
  'upkeep',
  'construction',
  'refund',
  'condoBuyback',
  'ransom',
  'helicopter',
  'film',
  'treasure',
]);

export const CellRangeSchema = z.object({
  level: LevelSchema,
  x0: ColumnSchema,
  x1: ColumnSchema,
});

export type UnitEntityId = z.infer<typeof UnitEntityIdSchema>;
export type TransportEntityId = z.infer<typeof TransportEntityIdSchema>;
export type ShaftEntityId = z.infer<typeof ShaftEntityIdSchema>;
export type PersonEntityId = z.infer<typeof PersonEntityIdSchema>;
export type TransportType = z.infer<typeof TransportTypeSchema>;
export type Evaluation = z.infer<typeof EvaluationSchema>;
export type HotelRoomState = z.infer<typeof HotelRoomStateSchema>;
export type DecisionKind = z.infer<typeof DecisionKindSchema>;
export type PersonKind = z.infer<typeof PersonKindSchema>;
export type MoneyReason = z.infer<typeof MoneyReasonSchema>;
export type CellRange = z.infer<typeof CellRangeSchema>;
