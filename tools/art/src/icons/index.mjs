import { PixelCanvas } from '../canvas.mjs';
import { categoryIcons } from './categories.mjs';
import { statusIcons } from './status.mjs';
import { toolIcons } from './tools.mjs';
import { structureAndHousingIcons } from './units.mjs';
import { commerceAndServiceIcons } from './services.mjs';
import { toObra } from './obra.mjs';
import { windowAndAlertIcons } from './windows.mjs';

const STAR_OUTLINE = 'ui/star-empty';
const STAR_FILLED = 'ui/star-full';

// The filled star is plain ink, as the status bar spec says.
function inkStar(star) {
  const filled = new PixelCanvas(star.width, star.height);
  star.pixels.forEach((index, pixel) => {
    if (index !== 0) {
      filled.set(pixel % star.width, Math.floor(pixel / star.width), 'obra-ink');
    }
  });
  return filled;
}

function restyle({ id, canvas }) {
  if (id === STAR_OUTLINE) {
    return { id, canvas: canvas.recolor({ slate: 'obra-muted' }) };
  }
  if (id === STAR_FILLED) {
    return { id, canvas: inkStar(canvas) };
  }
  return { id, canvas: toObra(canvas) };
}

export function allIcons() {
  const towerIcons = [
    ...toolIcons(),
    ...categoryIcons(),
    ...statusIcons(),
    ...structureAndHousingIcons(),
    ...commerceAndServiceIcons(),
  ];
  return [...towerIcons.map(restyle), ...windowAndAlertIcons()];
}
