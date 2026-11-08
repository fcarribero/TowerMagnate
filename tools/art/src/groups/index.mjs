import { effectsGroup } from './effects.mjs';
import { peopleGroup } from './people.mjs';
import { skyGroup } from './sky.mjs';
import { structureGroup } from './structure.mjs';
import { transportGroup } from './transport.mjs';
import { uiGroup } from './ui.mjs';
import { unitsGroup } from './units.mjs';

export const groups = [
  skyGroup,
  structureGroup,
  transportGroup,
  uiGroup,
  unitsGroup,
  peopleGroup,
  effectsGroup,
];
