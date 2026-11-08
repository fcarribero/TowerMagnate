import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { atlasJson, packSprites, renderAtlas } from './atlas.mjs';
import { encodePng } from './png.mjs';

const GROUP_NAMES = ['units', 'transport', 'people', 'structure', 'sky', 'ui', 'events', 'effects'];
const SEGMENT = '[a-z0-9]+(?:[-_][a-z0-9]+)*';
const SPRITE_ID = new RegExp(`^${SEGMENT}(?:/${SEGMENT}){1,2}$`);

function assertValidSpriteId(id, groupName) {
  if (!SPRITE_ID.test(id)) {
    throw new Error(`Sprite id does not follow the naming rules: ${id}`);
  }
  if (!id.startsWith(`${groupName}/`)) {
    throw new Error(`Sprite ${id} is drawn by group ${groupName} but named for another group`);
  }
}

// Draws every group and checks names, without touching the disk.
export function drawGroups(groups) {
  return groups.map((group) => {
    if (!GROUP_NAMES.includes(group.name)) {
      throw new Error(`Unknown sprite group: ${group.name}`);
    }
    const sprites = group.draw();
    for (const sprite of sprites) {
      assertValidSpriteId(sprite.id, group.name);
    }
    return { name: group.name, sprites };
  });
}

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function writePng(path, canvas) {
  writeFile(path, encodePng(canvas.width, canvas.height, canvas.toRgba()));
}

// Rewrites <outputRoot>/sprites (one PNG per sprite) and <outputRoot>/atlases
// (one PNG and PixiJS JSON per group). Returns the written paths, relative and sorted.
export function buildArt(groups, outputRoot) {
  const drawn = drawGroups(groups);
  const spritesDir = join(outputRoot, 'sprites');
  const atlasesDir = join(outputRoot, 'atlases');
  rmSync(spritesDir, { recursive: true, force: true });
  rmSync(atlasesDir, { recursive: true, force: true });

  const written = [];
  for (const { name, sprites } of drawn) {
    for (const sprite of sprites) {
      const relativePath = `sprites/${sprite.id}.png`;
      writePng(join(outputRoot, relativePath), sprite.canvas);
      written.push(relativePath);
    }

    const packed = packSprites(sprites);
    const imageName = `${name}.png`;
    writePng(join(atlasesDir, imageName), renderAtlas(packed));
    const json = `${JSON.stringify(atlasJson(packed, imageName), null, 2)}\n`;
    writeFile(join(atlasesDir, `${name}.json`), json);
    written.push(`atlases/${imageName}`, `atlases/${name}.json`);
  }
  return written.sort();
}
