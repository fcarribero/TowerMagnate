import { OVERLAY_HEX, type OverlayColor, type OverlayId } from '../../render/overlayColors';
import type { StringKey } from '../strings';

export const OVERLAY_IDS: readonly OverlayId[] = ['normal', 'evaluation', 'price', 'hotel'];

export interface LegendEntry {
  label: StringKey;
  color: OverlayColor;
  hex: string;
}

function entry(label: StringKey, color: OverlayColor): LegendEntry {
  return { label, color, hex: OVERLAY_HEX[color] };
}

const LEGENDS: Record<Exclude<OverlayId, 'normal'>, readonly LegendEntry[]> = {
  evaluation: [
    entry('value.evaluation.good', 'sky-deep'),
    entry('value.evaluation.fair', 'lamp'),
    entry('value.evaluation.poor', 'cloth-red'),
    entry('value.evaluation.none', 'gray'),
  ],
  price: [
    entry('value.price.high', 'cloth-red'),
    entry('value.price.normal', 'leaf'),
    entry('value.price.low', 'sky-deep'),
    entry('value.price.minimum', 'lamp'),
  ],
  hotel: [
    entry('value.room.clean', 'leaf'),
    entry('value.room.occupied', 'sky-deep'),
    entry('value.room.dirty', 'dusk'),
    entry('value.room.infested', 'cloth-red'),
  ],
};

/** The legend lines of an overlay; Normal has none. */
export function legendOf(overlay: OverlayId): readonly LegendEntry[] {
  return overlay === 'normal' ? [] : LEGENDS[overlay];
}

/** Keys 1 to 4 pick the overlays in order. */
export function overlayForKey(key: string): OverlayId | null {
  const index = Number(key) - 1;
  return Number.isInteger(index) ? (OVERLAY_IDS[index] ?? null) : null;
}
