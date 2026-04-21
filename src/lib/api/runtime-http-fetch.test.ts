import { describe, expect, it } from 'vitest';
import { resolveRuntimeHttpFetchUrl } from './runtime-http-fetch';

describe('resolveRuntimeHttpFetchUrl', () => {
  it('keeps same-origin managed routes direct in dev', () => {
    expect(resolveRuntimeHttpFetchUrl('/sessions/sess_1/streams/stream_1/http', true)).toBe(
      '/sessions/sess_1/streams/stream_1/http',
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
});
