// At night every material moves one step down its ramp and window glass turns dark.
// Light sources (lamp, lamp-glow) are not listed, so they keep their color.
const oneStepDarker = {
  white: 'cloud',
  cloud: 'silver',
  silver: 'gray',
  gray: 'slate',
  slate: 'charcoal',
  charcoal: 'ink',
  'concrete-light': 'concrete',
  concrete: 'concrete-dark',
  'concrete-dark': 'charcoal',
  'wood-light': 'wood',
  wood: 'wood-dark',
  'wood-dark': 'charcoal',
  leaf: 'leaf-dark',
  'leaf-dark': 'charcoal',
  glass: 'night',
};

export function toNight(dayCanvas) {
  return dayCanvas.recolor(oneStepDarker);
}

// A unit with nobody inside has its lamps off: the bulbs turn to dull metal and the glow goes.
export function lightsOff(canvas) {
  return canvas.recolor({ lamp: 'gray', 'lamp-glow': 'slate' });
}
