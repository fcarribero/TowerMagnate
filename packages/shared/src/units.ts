export const UNIT_TYPES = [
  'floor',
  'lobby',
  'stairs',
  'escalator',
  'standard-elevator',
  'office',
  'condo',
  'fast-food',
  'single-room',
  'double-room',
  'suite',
  'housekeeping',
  'security',
  'service-elevator',
  'restaurant',
  'retail-shop',
  'cinema',
  'party-hall',
  'express-elevator',
  'medical-center',
  'parking-ramp',
  'parking-space',
  'recycling-center',
  'subway-station',
  'cathedral',
] as const;

export type UnitType = (typeof UNIT_TYPES)[number];

/** 6 is the top rank, "Torre". */
export type StarRating = 1 | 2 | 3 | 4 | 5 | 6;

export const PRICE_LEVELS = ['high', 'normal', 'low', 'minimum'] as const;
export type PriceLevel = (typeof PRICE_LEVELS)[number];
export type PriceTable = Readonly<Record<PriceLevel, number>>;

export type ToolbarCategory =
  | 'structure'
  | 'transport'
  | 'offices-and-housing'
  | 'hotel'
  | 'commerce-and-entertainment'
  | 'services';

export type UnitHeight =
  | { readonly kind: 'fixed'; readonly floors: number }
  | { readonly kind: 'choice'; readonly floors: readonly number[] }
  | { readonly kind: 'shaft'; readonly maxFloorsServed: number | null };

export type UnitCost =
  | { readonly kind: 'per-unit'; readonly amount: number }
  | { readonly kind: 'per-cell'; readonly amount: number }
  | { readonly kind: 'shaft'; readonly shaftAmount: number; readonly perCarAmount: number };

export type CapacityRole =
  | 'office-workers'
  | 'residents'
  | 'hotel-guests'
  | 'maids'
  | 'customers'
  | 'audience'
  | 'party-guests'
  | 'passengers-per-car'
  | 'wedding-guests';

export interface UnitCapacity {
  readonly role: CapacityRole;
  /** null when the count depends on the day's customers. */
  readonly people: number | null;
}

export type PlacementZone =
  'any' | 'basement' | 'lowest-basement' | 'lobby-floors' | 'above-top-floor';

export type FloorUse = 'lobby' | 'commercial' | 'entertainment' | 'single-room';

export type ElevatorStopRule = 'any-floor' | 'basements-main-and-sky-lobbies';

export interface PlacementFlags {
  readonly zone: PlacementZone;
  readonly allowedFloorUses?: readonly FloorUse[];
  readonly alignedWithExistingSameUnit?: boolean;
  readonly mustConnectTo?: UnitType;
  readonly mustTouchExistingSameUnit?: boolean;
  readonly elevatorStops?: ElevatorStopRule;
  readonly maxCarsPerShaft?: number;
  readonly mustBeSeparatedFromOtherShafts?: boolean;
  readonly staffOnly?: boolean;
}

export type LimitGroupId =
  | 'elevator-shafts'
  | 'stairs-and-escalators'
  | 'security'
  | 'medical'
  | 'entertainment'
  | 'commercial'
  | 'parking'
  | 'subway'
  | 'cathedral';

export interface UnitDefinition {
  readonly type: UnitType;
  readonly name: string;
  readonly category: ToolbarCategory;
  /** Width in cells. */
  readonly width: number;
  readonly height: UnitHeight;
  readonly cost: UnitCost;
  readonly capacity: UnitCapacity | null;
  readonly unlockStars: StarRating;
  readonly placement: PlacementFlags;
  readonly limitGroup: LimitGroupId | null;
}

export interface IncomeBracket {
  readonly minCustomers: number;
  readonly amount: number;
}

/** Lobby upkeep counts columns, not cells: a tall lobby pays its height only at build time. */
export type UpkeepBasis = 'per-unit' | 'per-car' | 'per-column';

export interface StarDependentAmount {
  readonly minStars: StarRating;
  readonly amount: number;
}

export interface UpkeepRule {
  readonly basis: UpkeepBasis;
  readonly amountByStars: readonly StarDependentAmount[];
}

export const SHAFT_TYPES = ['standard', 'service', 'express'] as const;
export type ShaftType = (typeof SHAFT_TYPES)[number];

export const SHAFT_UNIT_TYPES = {
  standard: 'standard-elevator',
  service: 'service-elevator',
  express: 'express-elevator',
} as const satisfies Record<ShaftType, UnitType>;
