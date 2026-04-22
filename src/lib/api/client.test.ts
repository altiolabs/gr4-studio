import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApiUrl, jsonRequest } from './client';

describe('api client url building', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses app-owned /api paths for control-plane requests', () => {
    expect(buildApiUrl('/sessions')).toBe('/api/sessions');
    expect(buildApiUrl('blocks/gr::testing::NullSink%3Cfloat32%3E')).toBe(
      '/api/blocks/gr::testing::NullSink%3Cfloat32%3E',
    );
    expect(buildApiUrl('/sessions/sess_1/blocks/sig0/settings')).toBe(
      '/api/sessions/sess_1/blocks/sig0/settings',
    );
  });

  it('passes through absolute urls unchanged', () => {
    expect(buildApiUrl('http://127.0.0.1:8080/sessions')).toBe('http://127.0.0.1:8080/sessions');
  });

  it('disables fetch caching for json api requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(jsonRequest<{ ok: boolean }>({ path: '/blocks', method: 'GET' })).resolves.toEqual({
      ok: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/blocks',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        }),
      }),
    );
  });

  it('fails explicitly when a successful json response body is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '',
      }),
    );

    await expect(jsonRequest({ path: '/blocks', method: 'GET' })).rejects.toMatchObject(
      expect.objectContaining({
        message: 'Response body was empty for /blocks',
        code: 'PARSE',
        status: 200,
        details: 'status=200 url=/api/blocks',
      }),
    );
  });

  it('classifies app-api and legacy-direct request failures distinctly', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('connection refused'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(jsonRequest({ path: '/blocks', method: 'GET' })).rejects.toMatchObject(
      expect.objectContaining({
        message: 'app-api request failed for /blocks',
        details: 'route=app-api url=/api/blocks cause=connection refused',
      }),
    );

    await expect(jsonRequest({ path: 'http://127.0.0.1:8080/blocks', method: 'GET' })).rejects.toMatchObject(
      expect.objectContaining({
        message: 'legacy-direct request failed for http://127.0.0.1:8080/blocks',
        details: 'route=legacy-direct url=http://127.0.0.1:8080/blocks cause=connection refused',
      }),
    );
  });

  it('treats 204 no-content responses as success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      }),
    );

    await expect(jsonRequest({ path: '/sessions/session-1', method: 'DELETE' })).resolves.toBeUndefined();
  });
});
