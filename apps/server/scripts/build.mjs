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

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'build/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: installedDependencies,
  logLevel: 'info',
});
