import { resolveWebSocketUrl } from '../../../../lib/api/websocket-url';
import { parseAudioFloat32Frame, type AudioFrame } from './audio-frame';

export type AudioConnectionState = 'connecting' | 'open' | 'closed' | 'error';

export type AudioWebSocketSubscription = {
  endpoint: string;
  onFrame: (frame: AudioFrame) => void;
  onConnectionState?: (state: AudioConnectionState, message?: string) => void;
};

export function normalizeAudioWebSocketEndpoint(endpoint: string): string {
  return resolveWebSocketUrl(endpoint);
}

export function createAudioWebSocketSubscription({
  endpoint,
  onFrame,
  onConnectionState,
}: AudioWebSocketSubscription): () => void {
  let closed = false;
  let socket: WebSocket | null = null;

  const open = () => {
    if (closed) {
      return;
    }
    onConnectionState?.('connecting');
    socket = new WebSocket(normalizeAudioWebSocketEndpoint(endpoint));
    socket.binaryType = 'arraybuffer';

    socket.addEventListener('open', () => onConnectionState?.('open'));
    socket.addEventListener('message', (event) => {
      if (!(event.data instanceof ArrayBuffer)) {
        onConnectionState?.('error', 'Audio websocket produced a non-binary frame.');
        return;
      }
      try {
        onFrame(parseAudioFloat32Frame(event.data));
      } catch (error) {
        onConnectionState?.('error', error instanceof Error ? error.message : 'Audio frame parse failed.');
      }
    });
    socket.addEventListener('close', () => {
      onConnectionState?.(closed ? 'closed' : 'error', closed ? undefined : 'Audio websocket closed.');
    });
    socket.addEventListener('error', () => onConnectionState?.('error', 'Audio websocket connection failed.'));
  };

  open();

  return () => {
    closed = true;
    socket?.close();
    socket = null;
  };
}
