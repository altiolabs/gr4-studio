import { describe, expect, it } from 'vitest';
import {
  isSessionStreamWebSocketPath,
  resolveProxyTarget,
  stripAppApiPrefix,
} from './app-server.mjs';

describe('desktop app server routing', () => {
  it('strips the app-owned /api prefix for upstream requests', () => {
    expect(stripAppApiPrefix('/api/blocks')).toBe('/blocks');
    expect(stripAppApiPrefix('/api/sessions/sess_1/streams/stream_1/ws')).toBe(
      '/sessions/sess_1/streams/stream_1/ws',
    );
  });

  it('recognizes the current session websocket stream route surface', () => {
    expect(isSessionStreamWebSocketPath('/api/sessions/sess_1/streams/stream_1/ws')).toBe(true);
    expect(isSessionStreamWebSocketPath('/api/sessions/sess_1/streams/stream_1/http')).toBe(false);
    expect(isSessionStreamWebSocketPath('/api/blocks')).toBe(false);
  });

  it('rewrites app-owned websocket routes to backend targets', () => {
    expect(
      resolveProxyTarget(
        '/api/sessions/sess_1/streams/stream_1/ws?topic=plot',
        'http://127.0.0.1:8080',
      ).toString(),
    ).toBe('http://127.0.0.1:8080/sessions/sess_1/streams/stream_1/ws?topic=plot');
  });
});
