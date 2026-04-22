import { describe, expect, it, vi } from 'vitest';
import {
  createJsonWebSocketSubscription,
  normalizeJsonWebSocketEndpoint,
} from './json-websocket-runtime';

describe('json websocket runtime', () => {
  it('normalizes http endpoints to websocket urls', () => {
    expect(normalizeJsonWebSocketEndpoint('http://127.0.0.1:18080/snapshot')).toBe(
      'ws://127.0.0.1:18080/snapshot',
    );
    expect(normalizeJsonWebSocketEndpoint('https://example.com/snapshot')).toBe(
      'wss://example.com/snapshot',
    );
    expect(normalizeJsonWebSocketEndpoint('ws://127.0.0.1:18080/snapshot')).toBe(
      'ws://127.0.0.1:18080/snapshot',
    );
    expect(
      normalizeJsonWebSocketEndpoint('/api/sessions/sess_1/streams/stream_1/ws', {
        protocol: 'http:',
        host: '127.0.0.1:5173',
      }),
    ).toBe('ws://127.0.0.1:5173/api/sessions/sess_1/streams/stream_1/ws');
  });

  it('does not rewrite app-owned websocket routes to the backend origin outside a browser context', () => {
    expect(normalizeJsonWebSocketEndpoint('/api/sessions/sess_1/streams/stream_1/ws')).toBe(
      '/api/sessions/sess_1/streams/stream_1/ws',
    );
  });

  it('parses text websocket frames and reconnects after disconnect', () => {
    const sockets: Array<{
      binaryType?: BinaryType;
      onopen: ((event: Event) => void) | null;
      onmessage: ((event: MessageEvent<unknown>) => void) | null;
      onerror: ((event: Event) => void) | null;
      onclose: ((event: CloseEvent) => void) | null;
      close: () => void;
    }> = [];
    const scheduled: Array<() => void> = [];
    const states: Array<string> = [];
    const payloads: unknown[] = [];

    const cleanup = createJsonWebSocketSubscription({
      endpoint: 'ws://127.0.0.1:18080/snapshot',
      websocketFactory: () => {
        const socket: {
          binaryType?: BinaryType;
          onopen: ((event: Event) => void) | null;
          onmessage: ((event: MessageEvent<unknown>) => void) | null;
          onerror: ((event: Event) => void) | null;
          onclose: ((event: CloseEvent) => void) | null;
          close: () => void;
        } = {
          onopen: null,
          onmessage: null,
          onerror: null,
          onclose: null,
          close: () => {
            socket.onclose?.({} as CloseEvent);
          },
        };
        sockets.push(socket);
        return socket;
      },
      scheduler: {
        setTimeout: (handler: () => void) => {
          scheduled.push(handler);
          return scheduled.length;
        },
        clearTimeout: vi.fn(),
      },
      onConnectionState: (state) => {
        states.push(state);
      },
      onMessage: (payload) => {
        payloads.push(payload);
      },
    });

    expect(states[0]).toBe('connecting');
    expect(sockets).toHaveLength(1);
    sockets[0].onopen?.(new Event('open'));
    sockets[0].onmessage?.({ data: '{"rows":1,"columns":1}' } as MessageEvent<unknown>);
    expect(payloads).toEqual([{ rows: 1, columns: 1 }]);

    sockets[0].close();
    expect(states).toContain('reconnecting');
    expect(scheduled).toHaveLength(1);

    scheduled.shift()?.();
    expect(sockets).toHaveLength(2);
    sockets[1].onopen?.(new Event('open'));

    cleanup();
  });

  it('classifies websocket setup failures by routing kind', () => {
    const states: Array<{ state: string; message?: string }> = [];

    createJsonWebSocketSubscription({
      endpoint: '/api/sessions/sess_1/streams/stream_1/ws',
      websocketFactory: () => {
        throw new Error('upgrade failed');
      },
      scheduler: {
        setTimeout: (handler: () => void) => {
          handler();
          return 1;
        },
        clearTimeout: vi.fn(),
      },
      maxAttempts: 1,
      onConnectionState: (state, message) => {
        states.push({ state, message });
      },
      onMessage: vi.fn(),
    });

    expect(states[states.length - 1]).toMatchObject({
      state: 'error',
      message: 'app-api websocket setup failed: upgrade failed',
    });
  });
});
