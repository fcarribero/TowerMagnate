import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawGroups } from '../src/build.mjs';
import { groups } from '../src/groups/index.mjs';
import { encodePng } from '../src/png.mjs';
import { PERSON_TYPES, PERSON_VARIANTS } from '../src/groups/people.mjs';
import {
  drawPeopleSheet,
  drawStructurePreview,
  drawTintSheet,
  drawTransportPreview,
  drawUnitSheet,
  drawWalkwayPreview,
} from '../src/preview.mjs';

const ZOOM = 2;
const TRANSPORT_ZOOM = 3;
const PEOPLE_ZOOM = 4;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const docsDir = resolve(scriptDir, '../../../docs/art');
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
function writePreview(name, sheet, zoom) {
  const outputPath = resolve(docsDir, name);
  const png = encodePng(sheet.width * zoom, sheet.height * zoom, zoomedRgba(sheet, zoom));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, png);
  console.log(`Wrote ${outputPath} (${sheet.width * zoom}x${sheet.height * zoom})`);
}

writePreview('structure-preview.png', drawStructurePreview(sprites), ZOOM);
writePreview('hotel-preview.png', drawUnitSheet(sprites, HOTEL_SUBJECTS), ZOOM);
writePreview('transport-preview.png', drawTransportPreview(sprites), TRANSPORT_ZOOM);
writePreview(
  'people-preview.png',
  drawPeopleSheet(sprites, PERSON_TYPES, PERSON_VARIANTS),
  PEOPLE_ZOOM,
);
writePreview('people-tint-1x.png', drawTintSheet(sprites, PERSON_TYPES), 1);
writePreview('people-tint-preview.png', drawTintSheet(sprites, PERSON_TYPES), TRANSPORT_ZOOM);
writePreview('walkway-preview.png', drawWalkwayPreview(sprites), TRANSPORT_ZOOM);
