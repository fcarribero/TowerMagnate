import { colors } from './palette.mjs';

// Stress bands from stress-evaluation.md 3.2, in steps of 10 game seconds.
export const STRESS_BANDS = [
  { name: 'normal', color: 'ink', minSteps: 0, spriteSuffix: '' },
  { name: 'high', color: 'stress-pink', minSteps: 90, spriteSuffix: '-pink' },
  { name: 'very-high', color: 'stress-red', minSteps: 180, spriteSuffix: '-red' },
];

function hexOf(id) {
  const color = colors.find((candidate) => candidate.id === id);
  if (color === undefined) {
    throw new Error(`Unknown palette color: ${id}`);
  }
  return color.hex;
}

// TypeScript module with the three stress colors and thresholds, for the web client.
export function stressPaletteSource() {
  const entries = STRESS_BANDS.map(
    (band) =>
      `  { name: '${band.name}', color: '${hexOf(band.color)}', minSteps: ${band.minSteps}, spriteSuffix: '${band.spriteSuffix}' },`,
  );
  return [
    '// Written by pnpm art:build from tools/art. Do not edit by hand.',
    '',
    `export const STRESS_INK = '${hexOf('ink')}';`,
    `export const STRESS_PINK = '${hexOf('stress-pink')}';`,
    `export const STRESS_RED = '${hexOf('stress-red')}';`,
    '',
    'export const STRESS_BANDS = [',
    ...entries,
    '] as const;',
    '',
    "export type StressBand = (typeof STRESS_BANDS)[number]['name'];",
    '',
  ].join('\n');
}
