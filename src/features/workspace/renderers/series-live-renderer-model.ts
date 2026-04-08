import type { HttpTimeSeriesSnapshot } from '../../graph-editor/runtime/http-time-series';
import type { WorkspaceLiveBindingInfo } from './live-renderer-contract';

export type SeriesLiveLoadState = 'loading' | 'no-data' | 'error' | 'ready';

export const DEFAULT_SERIES_POLL_MS = 500;

export function normalizeSeriesPollMs(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_SERIES_POLL_MS;
  }
  return Math.max(100, Math.round(value));
}

export function isSupportedSeriesBinding(binding: WorkspaceLiveBindingInfo): {
  supported: boolean;
  reason?: string;
} {
  const endpoint = binding.endpoint?.trim();
  const transport = binding.transport;
  if (binding.status !== 'configured') {
    return { supported: false, reason: 'not-configured' };
  }
  if (!endpoint) {
    return { supported: false, reason: 'missing-endpoint' };
  }
  if (transport !== 'http_snapshot' && transport !== 'http_poll' && transport !== 'websocket') {
    return { supported: false, reason: 'unsupported-transport' };
  }
  return { supported: true };
}

export function deriveSeriesLoadStateFromSnapshot(snapshot: HttpTimeSeriesSnapshot): SeriesLiveLoadState {
  const hasSamples = snapshot.seriesByChannel.some((series) => series.length > 0);
  return hasSamples ? 'ready' : 'no-data';
}

export function createSeriesPollSubscription(
  transport: string | undefined,
  pollMs: number,
  onTick: () => void,
  scheduler?: {
    setInterval: (handler: () => void, timeout: number) => number;
    clearInterval: (handle: number) => void;
  },
): (() => void) | undefined {
  if (transport !== 'http_poll') {
    return undefined;
  }

  const clock = scheduler ?? {
    setInterval: (handler: () => void, timeout: number) => window.setInterval(handler, timeout),
    clearInterval: (handle: number) => window.clearInterval(handle),
  };
  const handle = clock.setInterval(onTick, pollMs);
  return () => clock.clearInterval(handle);
}
