import { categoryIcons } from './categories.mjs';
import { statusIcons } from './status.mjs';
import { toolIcons } from './tools.mjs';
import { structureAndHousingIcons } from './units.mjs';

export function allIcons() {
  return [...toolIcons(), ...categoryIcons(), ...statusIcons(), ...structureAndHousingIcons()];
}
