import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Workspace packages ship TypeScript sources, so they go into the bundle.
// Every other runtime dependency stays in node_modules: several of them load
// optional or native modules at runtime, which a bundle cannot resolve.
const isWorkspacePackage = (version) => version.startsWith('workspace:');
const installedDependencies = Object.entries(manifest.dependencies ?? {})
  .filter(([, version]) => !isWorkspacePackage(version))
  .map(([name]) => name);

// `--bench` bundles the runner load bench the same way, so it can run inside the release image.
const target = process.argv.includes('--bench')
  ? { entry: 'src/bench/runner-load.ts', outfile: 'bench-build/runner-load.js' }
  : { entry: 'src/main.ts', outfile: 'build/main.js' };

await build({
  entryPoints: [target.entry],
  outfile: target.outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: installedDependencies,
  logLevel: 'info',
});
