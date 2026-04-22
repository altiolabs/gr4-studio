import { describe, expect, it } from 'vitest';
import { resolveWebSocketUrl } from './websocket-url';

describe('resolveWebSocketUrl', () => {
  it('uses the current app/browser origin for app-owned relative websocket routes', () => {
    expect(
      resolveWebSocketUrl('/api/sessions/sess_1/streams/stream_1/ws', {
        browserLocation: {
          protocol: 'http:',
          host: '127.0.0.1:5173',
        },
      }),
    ).toBe('ws://127.0.0.1:5173/api/sessions/sess_1/streams/stream_1/ws');
  });

  it('does not rewrite app-owned relative websocket routes to the backend origin outside a browser context', () => {
    expect(resolveWebSocketUrl('/api/sessions/sess_1/streams/stream_1/ws')).toBe(
      '/api/sessions/sess_1/streams/stream_1/ws',
    );
  });

  it('passes through explicit websocket and http endpoints', () => {
    expect(resolveWebSocketUrl('ws://127.0.0.1:18080/live')).toBe('ws://127.0.0.1:18080/live');
    expect(resolveWebSocketUrl('https://backend.example.test/live')).toBe('wss://backend.example.test/live');
  });
});
