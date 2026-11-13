// Local preview only (not committed): runs the web app on the host and calls the Docker server.
import { mergeConfig } from 'vite';
import base from './vite.config';

export default (env: Parameters<typeof base>[0]) =>
  mergeConfig(base(env), {
    server: {
      port: 4150,
      proxy: {
        '/api': {
          target: 'http://localhost:4101',
          changeOrigin: true,
          configure: (proxy: { on: (e: string, f: (req: { setHeader: (k: string, v: string) => void }) => void) => void }) =>
            proxy.on('proxyReq', (req) => req.setHeader('Origin', 'http://localhost:4102')),
        },
        '/ws': {
          target: 'http://localhost:4101',
          changeOrigin: true,
          ws: true,
          configure: (proxy: { on: (e: string, f: (req: { setHeader: (k: string, v: string) => void }) => void) => void }) =>
            proxy.on('proxyReqWs', (req) => req.setHeader('Origin', 'http://localhost:4102')),
        },
      },
    },
  });
