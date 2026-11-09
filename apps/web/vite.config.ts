import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import preact from '@preact/preset-vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const DEFAULT_SERVER_URL = 'http://localhost:3000';
const DEFAULT_WEB_PORT = 5173;
const GENERATED_ASSETS_DIR = fileURLToPath(new URL('../../assets', import.meta.url));
const ART_BUILD_SCRIPT = fileURLToPath(
  new URL('../../tools/art/scripts/build.mjs', import.meta.url),
);

/** Atlases and their manifest are not in git, so every dev server and build draws them first. */
function buildArtAtlases(): Plugin {
  return {
    name: 'tower-magnate:art-build',
    config() {
      execFileSync(process.execPath, [ART_BUILD_SCRIPT], { stdio: 'inherit' });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const serverUrl = env.TM_SERVER_URL || DEFAULT_SERVER_URL;
  const webPort = Number(env.TM_WEB_PORT) || DEFAULT_WEB_PORT;
  const pages: Record<string, string> = {
    main: fileURLToPath(new URL('index.html', import.meta.url)),
    kit: fileURLToPath(new URL('kit.html', import.meta.url)),
  };
  // The render stress page is left out of releases; the performance acceptance run builds it in.
  if (mode === 'perf') {
    pages.perf = fileURLToPath(new URL('perf.html', import.meta.url));
  }

  return {
    plugins: [buildArtAtlases(), preact()],
    publicDir: GENERATED_ASSETS_DIR,
    server: {
      port: webPort,
      strictPort: true,
      proxy: {
        '/api': { target: serverUrl, changeOrigin: true },
        '/ws': { target: serverUrl, changeOrigin: true, ws: true },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: { input: pages },
    },
  };
});
