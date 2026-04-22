import { describe, expect, it } from 'vitest';
import { stripAppApiPrefix } from './vite.config';

describe('stripAppApiPrefix', () => {
  it('rewrites app-owned api routes to upstream control-plane routes', () => {
    expect(stripAppApiPrefix('/api/blocks')).toBe('/blocks');
    expect(stripAppApiPrefix('/api/sessions/sess_1/start')).toBe('/sessions/sess_1/start');
    expect(stripAppApiPrefix('/api/sessions/sess_1/streams/stream_1/ws')).toBe(
      '/sessions/sess_1/streams/stream_1/ws',
    );
  });

  it('leaves non-api routes unchanged', () => {
    expect(stripAppApiPrefix('/__gr4studio/runtime-http-proxy')).toBe('/__gr4studio/runtime-http-proxy');
    expect(stripAppApiPrefix('/assets/index.js')).toBe('/assets/index.js');
  });
});
