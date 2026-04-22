import { describe, expect, it, vi } from 'vitest';
import { fetchRuntimeJsonPayload, resolveRuntimeHttpFetchUrl } from './runtime-http-fetch';

describe('resolveRuntimeHttpFetchUrl', () => {
  it('keeps same-origin managed routes direct in dev', () => {
    expect(resolveRuntimeHttpFetchUrl('/sessions/sess_1/streams/stream_1/http', true)).toBe(
      '/api/sessions/sess_1/streams/stream_1/http',
    );
  });

  it('proxies absolute urls in dev', () => {
    expect(resolveRuntimeHttpFetchUrl('http://127.0.0.1:8080/snapshot', true)).toBe(
      '/__gr4studio/runtime-http-proxy?target=http%3A%2F%2F127.0.0.1%3A8080%2Fsnapshot',
    );
  });

  it('keeps absolute urls direct outside dev', () => {
    expect(resolveRuntimeHttpFetchUrl('http://127.0.0.1:8080/snapshot', false)).toBe(
      'http://127.0.0.1:8080/snapshot',
    );
  });

  it('keeps same-origin managed routes under /api outside dev', () => {
    expect(resolveRuntimeHttpFetchUrl('/sessions/sess_1/streams/stream_1/http', false)).toBe(
      '/api/sessions/sess_1/streams/stream_1/http',
    );
  });

  it('labels current-session app-owned fetch failures distinctly from legacy direct fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
      }),
    );

    await expect(fetchRuntimeJsonPayload('/sessions/sess_1/streams/stream_1/http', false)).rejects.toThrow(
      'App API HTTP 502 (route=app-api)',
    );
    await expect(fetchRuntimeJsonPayload('http://127.0.0.1:8080/snapshot', false)).rejects.toThrow(
      'Legacy HTTP 502 (route=legacy-direct)',
    );
  });
});
