import { PixelCanvas } from '../canvas.mjs';
import { allIcons } from '../icons/index.mjs';
import { metrics } from '../metrics.mjs';

const { floorHeight, slabHeight } = metrics;
const RULER_WIDTH = 24;
const PLATE_WIDTH = 20;
const PLATE_HEIGHT = 13;

// One level of the level ruler on the left edge of the view, without its plate.
function rulerBackground() {
  const tile = new PixelCanvas(RULER_WIDTH, floorHeight);
  const slabTop = floorHeight - slabHeight;
  tile.fillRect(0, 0, RULER_WIDTH, floorHeight, 'charcoal');
  tile.vline(0, 0, floorHeight, 'slate');
  tile.vline(RULER_WIDTH - 1, 0, floorHeight, 'ink');
  tile.hline(RULER_WIDTH - 6, slabTop, 5, 'silver');
  tile.hline(RULER_WIDTH - 3, Math.floor(slabTop / 2), 2, 'gray');
  tile.hline(0, floorHeight - 1, RULER_WIDTH - 1, 'ink');
  return tile;
}

// The label plate laid on the ruler at (1, 9). The client writes the level
// ("12", "S3") on it in ink; the hovered level gets the lit plate.
function rulerPlate({ hovered }) {
  const plate = new PixelCanvas(PLATE_WIDTH, PLATE_HEIGHT);
  const inner = { width: PLATE_WIDTH - 2, height: PLATE_HEIGHT - 2 };
  plate.fillRect(1, 1, inner.width, inner.height, hovered ? 'lamp' : 'cloud');
  plate.hline(1, 1, inner.width, hovered ? 'lamp-glow' : 'white');
  plate.vline(1, 1, inner.height, hovered ? 'lamp-glow' : 'white');
  plate.hline(1, inner.height, inner.width, hovered ? 'dusk' : 'silver');
  plate.vline(inner.width, 1, inner.height, hovered ? 'dusk' : 'silver');
  plate.strokeRect(0, 0, PLATE_WIDTH, PLATE_HEIGHT, 'ink');
  return plate;
}

export const uiGroup = {
  name: 'ui',
  draw() {
    return [
      { id: 'ui/ruler-background', canvas: rulerBackground() },
      { id: 'ui/ruler-plate', canvas: rulerPlate({ hovered: false }) },
      { id: 'ui/ruler-plate-hover', canvas: rulerPlate({ hovered: true }) },
      ...allIcons(),
    ];
  },
};
