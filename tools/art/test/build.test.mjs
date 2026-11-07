import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Spritesheet, Texture, TextureSource } from 'pixi.js';
import { afterAll, describe, expect, it } from 'vitest';
import { buildArt, drawGroups } from '../src/build.mjs';
import { PixelCanvas } from '../src/canvas.mjs';
import { groups } from '../src/groups/index.mjs';

const committedAssets = fileURLToPath(new URL('../../../assets', import.meta.url));
const tempDirs = [];

function freshBuild() {
  const outputRoot = mkdtempSync(join(tmpdir(), 'tm-art-'));
  tempDirs.push(outputRoot);
  return { outputRoot, files: buildArt(groups, outputRoot) };
}

function pngSize(path) {
  const png = readFileSync(path);
  return { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
}

function groupWith(name, id) {
  return { name, draw: () => [{ id, canvas: new PixelCanvas(1, 1) }] };
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('art build', () => {
  it('writes byte-identical files on every run', () => {
    const first = freshBuild();
    const second = freshBuild();
    expect(second.files).toEqual(first.files);
    for (const file of first.files) {
      const firstBytes = readFileSync(join(first.outputRoot, file));
      const secondBytes = readFileSync(join(second.outputRoot, file));
      expect(secondBytes.equals(firstBytes), file).toBe(true);
    }
  });

  it('matches the committed assets, so nobody forgets to rebuild', () => {
    const { outputRoot, files } = freshBuild();
    for (const file of files) {
      const built = readFileSync(join(outputRoot, file));
      const committed = readFileSync(join(committedAssets, file));
      expect(committed.equals(built), `${file} is stale, run pnpm art:build`).toBe(true);
    }
  });

  it('writes one atlas per group that PixiJS 8 parses into every sprite', async () => {
    const { outputRoot } = freshBuild();
    for (const { name, sprites } of drawGroups(groups)) {
      const data = JSON.parse(readFileSync(join(outputRoot, 'atlases', `${name}.json`), 'utf8'));
      const imageSize = pngSize(join(outputRoot, 'atlases', data.meta.image));
      expect(data.meta.size).toEqual(imageSize);

      const source = new TextureSource({ width: imageSize.w, height: imageSize.h });
      const sheet = new Spritesheet(new Texture({ source }), data);
      await sheet.parse();
      for (const { id, canvas } of sprites) {
        expect(sheet.textures[id].frame.width).toBe(canvas.width);
        expect(sheet.textures[id].frame.height).toBe(canvas.height);
      }
    }
  });

  it('writes one PNG per sprite named after its id', () => {
    const { outputRoot } = freshBuild();
    for (const { sprites } of drawGroups(groups)) {
      for (const { id, canvas } of sprites) {
        const size = pngSize(join(outputRoot, 'sprites', `${id}.png`));
        expect(size).toEqual({ w: canvas.width, h: canvas.height });
      }
    }
  });

  it('rejects ids that break the naming rules', () => {
    expect(() => drawGroups([groupWith('ui', 'ui/Tool Bulldozer')])).toThrow(/naming rules/);
    expect(() => drawGroups([groupWith('ui', 'sky/day/top')])).toThrow(/named for another group/);
    expect(() => drawGroups([groupWith('props', 'props/plant')])).toThrow(/Unknown sprite group/);
  });
});
