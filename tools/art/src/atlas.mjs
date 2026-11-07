import { PixelCanvas } from './canvas.mjs';

const DEFAULT_MAX_WIDTH = 1024;
const DEFAULT_PADDING = 1;

function byHeightThenWidthThenId(a, b) {
  return b.canvas.height - a.canvas.height || b.canvas.width - a.canvas.width || compareIds(a.id, b.id);
}

function compareIds(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function assertUniqueIds(sprites) {
  const seen = new Set();
  for (const sprite of sprites) {
    if (seen.has(sprite.id)) {
      throw new Error(`Duplicate sprite id: ${sprite.id}`);
    }
    seen.add(sprite.id);
  }
}

// Shelf packing: tallest sprites first, left to right, new shelf when a row is full.
// The order depends only on sprite sizes and ids, so the result is always the same.
export function packSprites(sprites, { maxWidth = DEFAULT_MAX_WIDTH, padding = DEFAULT_PADDING } = {}) {
  assertUniqueIds(sprites);
  const ordered = [...sprites].sort(byHeightThenWidthThenId);
  const placements = [];
  let cursorX = padding;
  let shelfTop = padding;
  let shelfHeight = 0;
  let usedWidth = 0;

  for (const sprite of ordered) {
    const { width, height } = sprite.canvas;
    if (width + 2 * padding > maxWidth) {
      throw new Error(`Sprite ${sprite.id} is ${width} px wide, more than the atlas width ${maxWidth}`);
    }
    if (cursorX + width + padding > maxWidth) {
      shelfTop += shelfHeight + padding;
      cursorX = padding;
      shelfHeight = 0;
    }
    placements.push({ id: sprite.id, canvas: sprite.canvas, x: cursorX, y: shelfTop });
    cursorX += width + padding;
    shelfHeight = Math.max(shelfHeight, height);
    usedWidth = Math.max(usedWidth, cursorX);
  }

  const usedHeight = shelfTop + shelfHeight + padding;
  return { width: usedWidth, height: usedHeight, placements };
}

export function renderAtlas(packed) {
  const atlas = new PixelCanvas(packed.width, packed.height);
  for (const placement of packed.placements) {
    atlas.stamp(placement.canvas, placement.x, placement.y);
  }
  return atlas;
}

const FRAME_SUFFIX = /_(\d{2})$/;

function animationsFrom(ids) {
  const animations = {};
  for (const id of ids) {
    const match = FRAME_SUFFIX.exec(id);
    if (match) {
      const name = id.slice(0, match.index);
      animations[name] ??= [];
      animations[name].push(id);
    }
  }
  for (const frames of Object.values(animations)) {
    frames.sort(compareIds);
  }
  return animations;
}

// Spritesheet data in the JSON-hash format that PixiJS 8 Assets.load understands.
export function atlasJson(packed, imageFileName) {
  const sortedPlacements = [...packed.placements].sort((a, b) => compareIds(a.id, b.id));
  const frames = {};
  for (const { id, canvas, x, y } of sortedPlacements) {
    const w = canvas.width;
    const h = canvas.height;
    frames[id] = {
      frame: { x, y, w, h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
    };
  }
  return {
    frames,
    animations: animationsFrom(sortedPlacements.map((placement) => placement.id)),
    meta: {
      app: '@tower-magnate/art',
      version: '1',
      image: imageFileName,
      format: 'RGBA8888',
      size: { w: packed.width, h: packed.height },
      scale: 1,
    },
  };
}
