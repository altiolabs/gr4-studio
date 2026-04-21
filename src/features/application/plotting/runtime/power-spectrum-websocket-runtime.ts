import { config } from '../../../../lib/config';
import type { PlotSeriesFrame } from '../model/types';

// Binary wire format:
// u32 magic, u16 version, u16 flags, u32 bins, f64 center_hz, f64 span_hz,
// u64 seq, f64 timestamp_sec, then float32 power_db[bins].
export type PowerSpectrumWebSocketFrame = {
  seq: number;
  timestampSec: number;
  centerHz: number;
  spanHz: number;
  bins: number;
  y: Float32Array;
};

export type PowerSpectrumWebSocketConnectionState = 'connecting' | 'open' | 'reconnecting' | 'error';

const POWER_SPECTRUM_WS_MAGIC = 0x53505753;
const POWER_SPECTRUM_WS_VERSION = 1;
const POWER_SPECTRUM_WS_HEADER_BYTES = 44;
const POWER_SPECTRUM_WS_DEFAULT_RETRY_MS = 250;
const POWER_SPECTRUM_WS_MAX_RETRY_MS = 5_000;
const POWER_SPECTRUM_WS_MAX_ATTEMPTS = 8;

type WebSocketLike = {
  binaryType: BinaryType;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  close: (code?: number, reason?: string) => void;
};

type WebSocketFactory = (endpoint: string) => WebSocketLike;

type Clock = {
  setTimeout: (handler: () => void, timeout: number) => number;
  clearTimeout: (handle: number) => void;
};

function clampToPositiveInteger(value: number): number {
  return Math.max(1, Math.floor(value));
}

function toFiniteNumber(value: number, fieldName: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Power spectrum websocket frame ${fieldName} must be finite.`);
  }
  return value;
}

function toArrayBuffer(input: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (input instanceof ArrayBuffer) {
    return input;
  }
  return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
}

export function normalizePowerSpectrumWebSocketEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return trimmed;
  }
  if (trimmed.startsWith('http://')) {
    return `ws://${trimmed.slice('http://'.length)}`;
  }
  if (trimmed.startsWith('https://')) {
    return `wss://${trimmed.slice('https://'.length)}`;
  }
  if (trimmed.startsWith('/')) {
    try {
      const controlPlaneUrl = new URL(config.controlPlaneBaseUrl);
      const scheme = controlPlaneUrl.protocol === 'https:' ? 'wss' : 'ws';
      return `${scheme}://${controlPlaneUrl.host}${trimmed}`;
    } catch {
      const location = typeof window !== 'undefined' ? window.location : undefined;
      if (!location) {
        return trimmed;
      }
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      return `${scheme}://${location.host}${trimmed}`;
    }
  }
  return `ws://${trimmed}`;
}

export function parsePowerSpectrumWebSocketFrame(payload: ArrayBuffer | ArrayBufferView): PowerSpectrumWebSocketFrame {
  const buffer = toArrayBuffer(payload);
  if (buffer.byteLength < POWER_SPECTRUM_WS_HEADER_BYTES) {
    throw new Error('Power spectrum websocket frame is truncated.');
  }

  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== POWER_SPECTRUM_WS_MAGIC) {
    throw new Error('Power spectrum websocket frame magic mismatch.');
  }

  const version = view.getUint16(4, true);
  if (version !== POWER_SPECTRUM_WS_VERSION) {
    throw new Error('Power spectrum websocket frame version must be 1.');
  }

  const flags = view.getUint16(6, true);
  void flags;

  const bins = view.getUint32(8, true);
  if (!Number.isInteger(bins) || bins <= 0) {
    throw new Error('Power spectrum websocket frame bins must be a positive integer.');
  }

  const expectedBytes = POWER_SPECTRUM_WS_HEADER_BYTES + bins * Float32Array.BYTES_PER_ELEMENT;
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `Power spectrum websocket frame length mismatch: expected ${expectedBytes} bytes for ${bins} bins, got ${buffer.byteLength}.`,
    );
  }

  const centerHz = toFiniteNumber(view.getFloat64(12, true), 'center_hz');
  const spanHz = toFiniteNumber(view.getFloat64(20, true), 'span_hz');
  if (spanHz <= 0) {
    throw new Error('Power spectrum websocket frame span_hz must be greater than zero.');
  }
  const seqRaw = view.getBigUint64(28, true);
  const seq = Number(seqRaw);
  if (!Number.isSafeInteger(seq)) {
    throw new Error('Power spectrum websocket frame seq must fit within the safe integer range.');
  }
  const timestampSec = toFiniteNumber(view.getFloat64(36, true), 'timestamp_sec');

  const y = new Float32Array(buffer, POWER_SPECTRUM_WS_HEADER_BYTES, bins);
  return {
    seq,
    timestampSec,
    centerHz,
    spanHz,
    bins,
    y: new Float32Array(y),
  };
}

export function buildPowerSpectrumFrequencyAxis(frame: Pick<PowerSpectrumWebSocketFrame, 'centerHz' | 'spanHz' | 'bins'>): Float64Array {
  const startHz = frame.centerHz - frame.spanHz / 2;
  if (frame.bins === 1) {
    return Float64Array.of(frame.centerHz);
  }

  const stepHz = frame.spanHz / (frame.bins - 1);
  const x = new Float64Array(frame.bins);
  for (let index = 0; index < frame.bins; index += 1) {
    x[index] = startHz + stepHz * index;
  }
  return x;
}

export function mapPowerSpectrumWebSocketFrameToSeriesFrame(
  frame: PowerSpectrumWebSocketFrame,
  label?: string,
): PlotSeriesFrame {
  return {
    id: 'power-spectrum',
    label: label?.trim() || 'Power Spectrum',
    x: buildPowerSpectrumFrequencyAxis(frame),
    y: frame.y,
  };
}

export function createPowerSpectrumWebSocketSubscription(params: {
  endpoint: string;
  onFrame: (frame: PowerSpectrumWebSocketFrame) => void;
  onConnectionState?: (state: PowerSpectrumWebSocketConnectionState, message?: string) => void;
  websocketFactory?: WebSocketFactory;
  scheduler?: Clock;
  maxAttempts?: number;
  baseRetryMs?: number;
  maxRetryMs?: number;
}): (() => void) {
  const clock: Clock = params.scheduler ?? {
    setTimeout: (handler: () => void, timeout: number) => window.setTimeout(handler, timeout),
    clearTimeout: (handle: number) => window.clearTimeout(handle),
  };
  const websocketFactory: WebSocketFactory =
    params.websocketFactory ?? ((endpoint: string) => new WebSocket(endpoint) as WebSocketLike);
  const maxAttempts = clampToPositiveInteger(params.maxAttempts ?? POWER_SPECTRUM_WS_MAX_ATTEMPTS);
  const baseRetryMs = clampToPositiveInteger(params.baseRetryMs ?? POWER_SPECTRUM_WS_DEFAULT_RETRY_MS);
  const maxRetryMs = clampToPositiveInteger(params.maxRetryMs ?? POWER_SPECTRUM_WS_MAX_RETRY_MS);

  let closed = false;
  let fatalError = false;
  let attempts = 0;
  let reconnectHandle: number | null = null;
  let socket: WebSocketLike | null = null;

  const clearReconnectTimer = () => {
    if (reconnectHandle === null) {
      return;
    }
    clock.clearTimeout(reconnectHandle);
    reconnectHandle = null;
  };

  const finishWithError = (message: string) => {
    if (fatalError || closed) {
      return;
    }
    fatalError = true;
    clearReconnectTimer();
    params.onConnectionState?.('error', message);
    try {
      socket?.close();
    } catch {
      // best-effort cleanup only
    }
  };

  const scheduleReconnect = (message: string) => {
    if (closed || fatalError) {
      return;
    }
    if (attempts >= maxAttempts) {
      finishWithError(message);
      return;
    }

    const retryIndex = attempts + 1;
    const delayMs = Math.min(baseRetryMs * 2 ** Math.max(0, retryIndex - 1), maxRetryMs);
    attempts = retryIndex;
    clearReconnectTimer();
    params.onConnectionState?.('reconnecting', message);
    reconnectHandle = clock.setTimeout(() => {
      reconnectHandle = null;
      connect();
    }, delayMs);
  };

  const connect = () => {
    if (closed || fatalError) {
      return;
    }

    params.onConnectionState?.(attempts === 0 ? 'connecting' : 'reconnecting');
    const connectionEndpoint = normalizePowerSpectrumWebSocketEndpoint(params.endpoint);
    let nextSocket: WebSocketLike;
    try {
      nextSocket = websocketFactory(connectionEndpoint);
    } catch (error) {
      scheduleReconnect(error instanceof Error ? error.message : 'Failed to create WebSocket connection.');
      return;
    }

    socket = nextSocket;
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      attempts = 0;
      params.onConnectionState?.('open');
    };
    socket.onmessage = (event) => {
      if (closed || fatalError) {
        return;
      }
      try {
        params.onFrame(parsePowerSpectrumWebSocketFrame(event.data));
      } catch (error) {
        finishWithError(error instanceof Error ? error.message : 'Malformed power spectrum websocket frame.');
      }
    };
    socket.onerror = () => {
      if (closed || fatalError) {
        return;
      }
      // Wait for onclose to decide whether the transport can be retried.
    };
    socket.onclose = () => {
      if (closed || fatalError) {
        return;
      }
      scheduleReconnect('Power spectrum websocket disconnected.');
    };
  };

  connect();

  return () => {
    closed = true;
    clearReconnectTimer();
    try {
      socket?.close();
    } catch {
      // best-effort cleanup only
    }
    socket = null;
  };
}
