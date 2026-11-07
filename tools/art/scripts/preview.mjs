import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawGroups } from '../src/build.mjs';
import { groups } from '../src/groups/index.mjs';
import { encodePng } from '../src/png.mjs';
import { drawStructurePreview, drawUnitSheet } from '../src/preview.mjs';

const ZOOM = 2;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const artDocs = resolve(scriptDir, '../../../docs/art');
const HOTEL_SUBJECTS = ['single-room', 'double-room', 'suite', 'housekeeping'];

function zoomedRgba(canvas, zoom) {
  const source = canvas.toRgba();
  const width = canvas.width * zoom;
  const rgba = new Uint8Array(width * canvas.height * zoom * 4);
  for (let y = 0; y < canvas.height * zoom; y++) {
    for (let x = 0; x < width; x++) {
      const from = (Math.floor(y / zoom) * canvas.width + Math.floor(x / zoom)) * 4;
      rgba.set(source.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return rgba;
}

const sprites = Object.fromEntries(
  drawGroups(groups).flatMap((group) => group.sprites.map(({ id, canvas }) => [id, canvas])),
);

function writeZoomed(sheet, outputPath) {
  const png = encodePng(sheet.width * ZOOM, sheet.height * ZOOM, zoomedRgba(sheet, ZOOM));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, png);
  console.log(`Wrote ${outputPath} (${sheet.width * ZOOM}x${sheet.height * ZOOM})`);
}

writeZoomed(drawStructurePreview(sprites), resolve(artDocs, 'structure-preview.png'));
writeZoomed(drawUnitSheet(sprites, HOTEL_SUBJECTS), resolve(artDocs, 'hotel-preview.png'));
