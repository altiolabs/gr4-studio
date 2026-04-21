import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const DEFAULT_GRCTRL_BASE_URL = 'http://127.0.0.1:8080';

function shouldProxyApiPath(url: string | undefined): boolean {
  return Boolean(url && (url.startsWith('/blocks') || url.startsWith('/sessions')));
}

export function buildProxyRequestHeaders(
  requestHeaders: {
    accept?: string | string[];
    'content-type'?: string | string[];
  },
  body?: Buffer,
): Record<string, string> {
  const accept = Array.isArray(requestHeaders.accept) ? requestHeaders.accept[0] : requestHeaders.accept;
  const contentType = Array.isArray(requestHeaders['content-type'])
    ? requestHeaders['content-type'][0]
    : requestHeaders['content-type'];

  return {
    Accept: accept ?? 'application/json',
    ...(contentType ? { 'Content-Type': contentType } : {}),
    ...(body ? { 'Content-Length': String(body.length) } : {}),
  };
}

async function readRequestBody(req: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks);
}

function proxyRequest(
  targetUrl: URL,
  method: string,
  headers: Record<string, string>,
  body?: Buffer,
): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; payload: Buffer }> {
  return new Promise((resolve, reject) => {
    const requestImpl = targetUrl.protocol === 'https:' ? httpsRequest : httpRequest;
    const upstream = requestImpl(
      targetUrl,
      {
        method,
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 502,
            headers: response.headers,
            payload: Buffer.concat(chunks),
          });
        });
        response.on('error', reject);
      },
    );

    upstream.on('error', reject);

    if (body && body.length > 0) {
      upstream.write(body);
    }

    upstream.end();
  });
}

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
          server.middlewares.use(async (req, res, next) => {
            if (!shouldProxyApiPath(req.url)) {
              next();
              return;
            }

            try {
              const targetUrl = new URL(req.url ?? '/', proxyTarget);
              const requestBody =
                req.method === 'GET' || req.method === 'HEAD' ? undefined : await readRequestBody(req);

              const upstream = await proxyRequest(
                targetUrl,
                req.method ?? 'GET',
                buildProxyRequestHeaders(req.headers, requestBody && requestBody.length > 0 ? requestBody : undefined),
                requestBody && requestBody.length > 0 ? requestBody : undefined,
              );

              res.statusCode = upstream.statusCode;

              const contentType = Array.isArray(upstream.headers['content-type'])
                ? upstream.headers['content-type'][0]
                : upstream.headers['content-type'];
              if (contentType) {
                res.setHeader('content-type', contentType);
              }

              const cacheControl = Array.isArray(upstream.headers['cache-control'])
                ? upstream.headers['cache-control'][0]
                : upstream.headers['cache-control'];
              if (cacheControl) {
                res.setHeader('cache-control', cacheControl);
              }

              res.setHeader('content-length', String(upstream.payload.length));
              res.end(upstream.payload);
            } catch (error) {
              res.statusCode = 502;
              res.setHeader('content-type', 'application/json');
              res.end(
                JSON.stringify({
                  error: error instanceof Error ? error.message : 'API proxy request failed',
                }),
              );
            }
          });

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
    },
  };
});
