import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArt } from '../src/build.mjs';
import { groups } from '../src/groups/index.mjs';

const defaultOutput = fileURLToPath(new URL('../../../assets', import.meta.url));
const outputRoot = resolve(process.argv[2] ?? defaultOutput);

const written = buildArt(groups, outputRoot);
console.log(`Wrote ${written.length} files under ${outputRoot}`);
