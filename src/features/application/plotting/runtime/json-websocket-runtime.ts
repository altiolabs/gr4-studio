type WebSocketLike = {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  close: (code?: number, reason?: string) => void;
};

type WebSocketFactory = (endpoint: string) => WebSocketLike;

type Clock = {
  setTimeout: (handler: () => void, timeout: number) => number;
  clearTimeout: (handle: number) => void;
};

export type JsonWebSocketConnectionState = 'connecting' | 'open' | 'reconnecting' | 'error';

const JSON_WS_DEFAULT_RETRY_MS = 250;
const JSON_WS_MAX_RETRY_MS = 5_000;
const JSON_WS_MAX_ATTEMPTS = 8;

function clampToPositiveInteger(value: number): number {
  return Math.max(1, Math.floor(value));
}

export function normalizeJsonWebSocketEndpoint(endpoint: string): string {
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
    const location = typeof window !== 'undefined' ? window.location : undefined;
    if (!location) {
      return trimmed;
    }
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${location.host}${trimmed}`;
  }
  return `ws://${trimmed}`;
}

function toJsonText(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(data));
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  throw new Error('JSON websocket frame must be text.');
}

export function createJsonWebSocketSubscription(params: {
  endpoint: string;
  onMessage: (payload: unknown) => void;
  onConnectionState?: (state: JsonWebSocketConnectionState, message?: string) => void;
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
  const maxAttempts = clampToPositiveInteger(params.maxAttempts ?? JSON_WS_MAX_ATTEMPTS);
  const baseRetryMs = clampToPositiveInteger(params.baseRetryMs ?? JSON_WS_DEFAULT_RETRY_MS);
  const maxRetryMs = clampToPositiveInteger(params.maxRetryMs ?? JSON_WS_MAX_RETRY_MS);

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
    const connectionEndpoint = normalizeJsonWebSocketEndpoint(params.endpoint);
    let nextSocket: WebSocketLike;
    try {
      nextSocket = websocketFactory(connectionEndpoint);
    } catch (error) {
      scheduleReconnect(error instanceof Error ? error.message : 'Failed to create WebSocket connection.');
      return;
    }

    socket = nextSocket;
    socket.onopen = () => {
      attempts = 0;
      params.onConnectionState?.('open');
    };
    socket.onmessage = (event) => {
      if (closed || fatalError) {
        return;
      }
      try {
        params.onMessage(JSON.parse(toJsonText(event.data)));
      } catch (error) {
        finishWithError(error instanceof Error ? error.message : 'Malformed JSON websocket frame.');
      }
    };
    socket.onerror = () => {
      if (closed || fatalError) {
        return;
      }
      params.onConnectionState?.('reconnecting', 'JSON websocket error.');
    };
    socket.onclose = (event) => {
      if (closed || fatalError) {
        return;
      }
      const reason = event.reason?.trim() ?? '';
      const message =
        reason.length > 0
          ? `JSON websocket disconnected (${event.code}${event.wasClean ? ', clean' : ''}): ${reason}`
          : `JSON websocket disconnected (code ${event.code}${event.wasClean ? ', clean' : ''}).`;
      scheduleReconnect(message);
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
