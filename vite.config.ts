import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const DEFAULT_GRCTRL_BASE_URL = 'http://localhost:8080';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_CONTROL_PLANE_BASE_URL || DEFAULT_GRCTRL_BASE_URL;

  return {
    base: mode === 'desktop' ? './' : '/',
    plugins: [
      react(),
      {
        name: 'gr4studio-runtime-http-proxy',
        configureServer(server) {
          server.middlewares.use('/__gr4studio/runtime-http-proxy', async (req, res) => {
            try {
              const requestUrl = new URL(req.url ?? '', 'http://localhost');
              const target = requestUrl.searchParams.get('target');

              if (!target) {
                res.statusCode = 400;
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing target query parameter' }));
                return;
              }

              const parsedTarget = new URL(target);
              if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
                res.statusCode = 400;
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify({ error: 'Unsupported target protocol' }));
                return;
              }

              const upstream = await fetch(parsedTarget.toString(), {
                method: 'GET',
                headers: {
                  Accept: 'application/json',
                },
              });

              const payload = await upstream.text();
              res.statusCode = upstream.status;
              res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
              res.end(payload);
            } catch (error) {
              res.statusCode = 502;
              res.setHeader('content-type', 'application/json');
              res.end(
                JSON.stringify({
                  error: error instanceof Error ? error.message : 'Proxy request failed',
                }),
              );
            }
          });
        },
      },
    ],
    server: {
      host: true,
      proxy: {
        '/blocks': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/sessions': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
