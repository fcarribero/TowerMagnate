import type {
  Evaluation,
  HotelRoomState,
  OverlayData,
  PriceBand,
  UnitView,
} from '@tower-magnate/shared';

type OverlayUnit = Pick<UnitView, 'id' | 'type' | 'price' | 'occupied'>;

export type OverlayId = 'normal' | 'evaluation' | 'price' | 'hotel' | 'noise' | 'dirt';

/** Noise and dirt are drawn as heat maps over the tower; units keep their normal look. */
export function isHeatOverlay(overlay: OverlayId): overlay is 'noise' | 'dirt' {
  return overlay === 'noise' || overlay === 'dirt';
}

export type OverlayColor =
  'sky-deep' | 'lamp' | 'cloth-red' | 'gray' | 'leaf' | 'dusk' | 'charcoal';

export const OVERLAY_HEX: Record<OverlayColor, string> = {
  'sky-deep': '#3d6fb6',
  lamp: '#f2d36b',
  'cloth-red': '#b0353a',
  gray: '#7b7a86',
  leaf: '#4f8a3e',
  dusk: '#e0875a',
  charcoal: '#2e2c36',
};

const HOTEL_ROOMS: ReadonlySet<string> = new Set(['single-room', 'double-room', 'suite']);
const RENTED_UNITS: ReadonlySet<string> = new Set(['office', 'retail-shop', 'condo']);

const EVALUATION_COLORS: Record<Evaluation, OverlayColor> = {
  good: 'sky-deep',
  fair: 'lamp',
  poor: 'cloth-red',
};

const PRICE_COLORS: Record<PriceBand, OverlayColor> = {
  high: 'cloth-red',
  normal: 'leaf',
  low: 'sky-deep',
};

const HOTEL_COLORS: Record<HotelRoomState, OverlayColor> = {
  clean: 'leaf',
  occupied: 'sky-deep',
  dirty: 'dusk',
  infested: 'cloth-red',
};

function isHotelRoom(unit: OverlayUnit): boolean {
  return HOTEL_ROOMS.has(unit.type);
}

function appliesTo(overlay: OverlayId, unit: OverlayUnit): boolean {
  if (overlay === 'hotel') {
    return isHotelRoom(unit);
  }
  return RENTED_UNITS.has(unit.type) || isHotelRoom(unit);
}

function valueColor(overlay: OverlayId, unit: OverlayUnit, data: OverlayData): OverlayColor {
  if (overlay === 'evaluation') {
    const evaluation = data.evaluation[unit.id];
    return evaluation ? EVALUATION_COLORS[evaluation] : 'gray';
  }
  if (overlay === 'price') {
    return PRICE_COLORS[data.price[unit.id] ?? 'normal'];
  }
  return HOTEL_COLORS[data.hotel[unit.id] ?? (unit.occupied ? 'occupied' : 'clean')];
}

/** The checker color for a unit under an overlay, or null when it is drawn normally. */
export function overlayColorOf(
  overlay: OverlayId,
  unit: OverlayUnit,
  data: OverlayData,
): OverlayColor | null {
  if (overlay === 'normal' || isHeatOverlay(overlay)) {
    return null;
  }
  return appliesTo(overlay, unit) ? valueColor(overlay, unit, data) : 'charcoal';
}

/** Stairs and escalators are never covered by an overlay, so they get the charcoal checker. */
export function transportOverlayColor(overlay: OverlayId): OverlayColor | null {
  return overlay === 'normal' || isHeatOverlay(overlay) ? null : 'charcoal';
}
