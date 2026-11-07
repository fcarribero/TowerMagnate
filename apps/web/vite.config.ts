import { fileURLToPath } from 'node:url';
import preact from '@preact/preset-vite';
import { defineConfig, loadEnv } from 'vite';

const DEFAULT_SERVER_URL = 'http://localhost:3000';
const DEFAULT_WEB_PORT = 5173;
const GENERATED_ASSETS_DIR = fileURLToPath(new URL('../../assets', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const serverUrl = env.TM_SERVER_URL || DEFAULT_SERVER_URL;
  const webPort = Number(env.TM_WEB_PORT) || DEFAULT_WEB_PORT;

  return {
    plugins: [preact()],
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
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('index.html', import.meta.url)),
          kit: fileURLToPath(new URL('kit.html', import.meta.url)),
        },
      },
    },
  };
});
