import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** The manifest file written by tools/sfx. */
export function readRepoManifest(): unknown {
  return JSON.parse(readFileSync(join(repoRoot, 'assets', 'sfx', 'manifest.json'), 'utf8'));
}
