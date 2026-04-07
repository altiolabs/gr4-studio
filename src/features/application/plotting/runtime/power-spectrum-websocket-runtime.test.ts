import { describe, expect, it, vi } from 'vitest';
import {
  buildPowerSpectrumFrequencyAxis,
  createPowerSpectrumWebSocketSubscription,
  mapPowerSpectrumWebSocketFrameToSeriesFrame,
  normalizePowerSpectrumWebSocketEndpoint,
  parsePowerSpectrumWebSocketFrame,
} from './power-spectrum-websocket-runtime';
import { resolveLiveTransportMode } from './timeseries-live-runtime';

function buildBinaryFrame(params: {
  bins?: number;
  centerHz?: number;
  spanHz?: number;
  seq?: number;
  timestampSec?: number;
  values?: number[];
} = {}): ArrayBuffer {
  const bins = params.bins ?? 3;
  const buffer = new ArrayBuffer(44 + bins * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(buffer);
  view.setUint32(0, 0x53505753, true);
  view.setUint16(4, 1, true);
  view.setUint16(6, 0, true);
  view.setUint32(8, bins, true);
  view.setFloat64(12, params.centerHz ?? 1000, true);
  view.setFloat64(20, params.spanHz ?? 10, true);
  view.setBigUint64(28, BigInt(params.seq ?? 7), true);
  view.setFloat64(36, params.timestampSec ?? 1.5, true);
  new Float32Array(buffer, 44, bins).set(params.values ?? Array.from({ length: bins }, (_, index) => index + 1));
  return buffer;
}

describe('power spectrum websocket runtime', () => {
  it('parses valid binary spectrum frames', () => {
    const frame = parsePowerSpectrumWebSocketFrame(
      buildBinaryFrame({
        bins: 4,
        centerHz: 1050,
        spanHz: 200,
        seq: 11,
        timestampSec: 2.75,
        values: [-1, -2, -3, -4],
      }),
    );

    expect(frame).toEqual({
      seq: 11,
      timestampSec: 2.75,
      centerHz: 1050,
      spanHz: 200,
      bins: 4,
      y: new Float32Array([-1, -2, -3, -4]),
    });
  });

  it('builds a centered frequency axis from the binary frame metadata', () => {
    const x = buildPowerSpectrumFrequencyAxis({
      centerHz: 100,
      spanHz: 40,
      bins: 5,
    });

    expect(Array.from(x)).toEqual([80, 90, 100, 110, 120]);
  });

  it('maps a binary frame to a renderable spectrum series', () => {
    const series = mapPowerSpectrumWebSocketFrameToSeriesFrame(
      {
        seq: 1,
        timestampSec: 0.5,
        centerHz: 200,
        spanHz: 20,
        bins: 3,
        y: new Float32Array([-10, -5, 0]),
      },
      'Spectrum',
    );

    expect(series.id).toBe('power-spectrum');
    expect(series.label).toBe('Spectrum');
    expect(Array.from(series.x ?? [])).toEqual([190, 200, 210]);
    expect(Array.from(series.y)).toEqual([-10, -5, 0]);
  });

  it('normalizes http endpoints to websocket urls', () => {
    expect(normalizePowerSpectrumWebSocketEndpoint('http://127.0.0.1:18080/spectrum')).toBe(
      'ws://127.0.0.1:18080/spectrum',
    );
    expect(normalizePowerSpectrumWebSocketEndpoint('https://example.com/spectrum')).toBe(
      'wss://example.com/spectrum',
    );
    expect(normalizePowerSpectrumWebSocketEndpoint('ws://127.0.0.1:18080/spectrum')).toBe(
      'ws://127.0.0.1:18080/spectrum',
    );
  });

  it('rejects invalid magic, version, bins, length and span values', () => {
    expect(() =>
      parsePowerSpectrumWebSocketFrame(
        (() => {
          const buffer = buildBinaryFrame();
          new DataView(buffer).setUint32(0, 0x12345678, true);
          return buffer;
        })(),
      ),
    ).toThrow('Power spectrum websocket frame magic mismatch.');

    expect(() =>
      parsePowerSpectrumWebSocketFrame(
        (() => {
          const buffer = buildBinaryFrame();
          new DataView(buffer).setUint16(4, 2, true);
          return buffer;
        })(),
      ),
    ).toThrow('Power spectrum websocket frame version must be 1.');

    expect(() =>
      parsePowerSpectrumWebSocketFrame(
        (() => {
          const buffer = new ArrayBuffer(44);
          const view = new DataView(buffer);
          view.setUint32(0, 0x53505753, true);
          view.setUint16(4, 1, true);
          view.setUint16(6, 0, true);
          view.setUint32(8, 0, true);
          view.setFloat64(12, 1000, true);
          view.setFloat64(20, 10, true);
          view.setBigUint64(28, 1n, true);
          view.setFloat64(36, 1, true);
          return buffer;
        })(),
      ),
    ).toThrow('Power spectrum websocket frame bins must be a positive integer.');

    expect(() =>
      parsePowerSpectrumWebSocketFrame(
        (() => {
          const buffer = buildBinaryFrame({ bins: 2 });
          return buffer.slice(0, 44 + 4);
        })(),
      ),
    ).toThrow('Power spectrum websocket frame length mismatch: expected 52 bytes for 2 bins, got 48.');

    expect(() =>
      parsePowerSpectrumWebSocketFrame(
        (() => {
          const buffer = buildBinaryFrame({ spanHz: 0 });
          return buffer;
        })(),
      ),
    ).toThrow('Power spectrum websocket frame span_hz must be greater than zero.');
  });

  it('reconnects after disconnect and keeps the latest frame only', () => {
    const sockets: Array<{
      binaryType: BinaryType;
      onopen: ((event: Event) => void) | null;
      onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null;
      onerror: ((event: Event) => void) | null;
      onclose: ((event: CloseEvent) => void) | null;
      close: () => void;
    }> = [];
    const scheduled: Array<() => void> = [];
    const states: Array<string> = [];
    const frames: Array<number> = [];
    const cleanup = createPowerSpectrumWebSocketSubscription({
      endpoint: 'ws://127.0.0.1:18080/spectrum',
      websocketFactory: () => {
        const socket: {
          binaryType: BinaryType;
          onopen: ((event: Event) => void) | null;
          onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null;
          onerror: ((event: Event) => void) | null;
          onclose: ((event: CloseEvent) => void) | null;
          close: () => void;
        } = {
          binaryType: 'arraybuffer' as BinaryType,
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
      onFrame: (frame) => {
        frames.push(frame.seq);
      },
    });

    expect(states[0]).toBe('connecting');
    expect(sockets).toHaveLength(1);
    sockets[0].onopen?.(new Event('open'));
    sockets[0].onmessage?.({ data: buildBinaryFrame({ seq: 1, values: [-10, -9, -8] }) } as MessageEvent<ArrayBuffer>);
    sockets[0].onmessage?.({ data: buildBinaryFrame({ seq: 2, values: [-1, -2, -3] }) } as MessageEvent<ArrayBuffer>);
    expect(frames).toEqual([1, 2]);

    sockets[0].close();
    expect(states).toContain('reconnecting');
    expect(scheduled).toHaveLength(1);

    scheduled.shift()?.();
    expect(sockets).toHaveLength(2);

    sockets[1].onopen?.(new Event('open'));
    sockets[1].onmessage?.({ data: buildBinaryFrame({ seq: 3, values: [-4, -5, -6] }) } as MessageEvent<ArrayBuffer>);
    expect(frames).toEqual([1, 2, 3]);

    cleanup();
  });

  it('selects http and websocket live transport modes explicitly', () => {
    expect(
      resolveLiveTransportMode({
        status: 'configured',
        transport: 'http_poll',
        endpoint: 'http://127.0.0.1:18080/snapshot',
      }),
    ).toBe('http');

    expect(
      resolveLiveTransportMode({
        status: 'configured',
        transport: 'websocket',
        endpoint: 'ws://127.0.0.1:18080/spectrum',
      }),
    ).toBe('websocket');

    expect(
      resolveLiveTransportMode({
        status: 'invalid',
        transport: 'websocket',
        endpoint: 'ws://127.0.0.1:18080/spectrum',
      }),
    ).toBe('unsupported');
  });
});
