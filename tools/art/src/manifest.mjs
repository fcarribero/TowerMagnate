const PRINT_WIDTH = 100;
const INDENT = '  ';

function quoted(value) {
  return `'${value}'`;
}

// Prints a const array the way Prettier would, so the written file passes the format check.
function constArray(name, values) {
  const oneLine = `export const ${name} = [${values.map(quoted).join(', ')}] as const;`;
  if (oneLine.length <= PRINT_WIDTH) {
    return oneLine;
  }
  const lines = values.map((value) => `${INDENT}${quoted(value)},`);
  return [`export const ${name} = [`, ...lines, '] as const;'].join('\n');
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

// TypeScript module with every atlas name and sprite id, for the web client.
export function atlasManifestSource(drawnGroups) {
  const atlasNames = sortedUnique(drawnGroups.map((group) => group.name));
  const spriteIds = sortedUnique(
    drawnGroups.flatMap((group) => group.sprites.map((sprite) => sprite.id)),
  );
  return [
    '// Written by pnpm art:build from tools/art. Do not edit by hand.',
    '',
    constArray('ATLAS_NAMES', atlasNames),
    '',
    'export type AtlasName = (typeof ATLAS_NAMES)[number];',
    '',
    constArray('SPRITE_IDS', spriteIds),
    '',
    'export type SpriteId = (typeof SPRITE_IDS)[number];',
    '',
  ].join('\n');
}
