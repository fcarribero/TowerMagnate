import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEffects } from './effects';
import { buildManifest, formatManifest, loadCues, missingFiles } from './manifest';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sfxDir = resolve(packageDir, '..', '..', 'assets', 'sfx');

async function main(): Promise<void> {
  const effects = await loadEffects(join(packageDir, 'effects.json'));
  const cues = await loadCues(join(packageDir, 'cues.json'));
  const manifest = buildManifest(effects, cues);

  await mkdir(sfxDir, { recursive: true });
  await writeFile(join(sfxDir, 'manifest.json'), formatManifest(manifest));
  console.log(`Wrote ${manifest.effects.length} effects to assets/sfx/manifest.json`);

  const missing = await missingFiles(manifest, sfxDir);
  if (missing.length > 0) {
    console.log(`Not generated yet: ${missing.join(', ')}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
