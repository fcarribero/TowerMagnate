import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArt, drawGroups } from '../src/build.mjs';
import { groups } from '../src/groups/index.mjs';
import { atlasManifestSource } from '../src/manifest.mjs';

const defaultOutput = fileURLToPath(new URL('../../../assets', import.meta.url));
const defaultManifest = fileURLToPath(
  new URL('../../../apps/web/src/render/atlasManifest.ts', import.meta.url),
);
const outputRoot = resolve(process.argv[2] ?? defaultOutput);
const manifestPath = resolve(process.argv[3] ?? defaultManifest);

const written = buildArt(groups, outputRoot);
console.log(`Wrote ${written.length} files under ${outputRoot}`);

writeFileSync(manifestPath, atlasManifestSource(drawGroups(groups)));
console.log(`Wrote the atlas manifest to ${manifestPath}`);
