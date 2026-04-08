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
});
