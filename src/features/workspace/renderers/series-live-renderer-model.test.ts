import { describe, expect, it, vi } from 'vitest';
import {
  createSeriesPollSubscription,
  deriveSeriesLoadStateFromSnapshot,
  isSupportedSeriesBinding,
  normalizeSeriesPollMs,
} from './series-live-renderer-model';

describe('series live renderer model', () => {
  it('normalizes poll interval with sane minimum and fallback', () => {
    expect(normalizeSeriesPollMs(undefined)).toBe(500);
    expect(normalizeSeriesPollMs(0)).toBe(500);
    expect(normalizeSeriesPollMs(25)).toBe(100);
    expect(normalizeSeriesPollMs(250.4)).toBe(250);
  });

  it('gates supported binding to configured http_snapshot/http_poll with endpoint', () => {
    expect(
      isSupportedSeriesBinding({
        status: 'configured',
        transport: 'http_snapshot',
        endpoint: 'http://127.0.0.1:18080/snapshot',
      }).supported,
    ).toBe(true);

    expect(
      isSupportedSeriesBinding({
        status: 'configured',
        transport: 'websocket',
        endpoint: 'ws://127.0.0.1:9999',
      }),
    ).toEqual({ supported: false, reason: 'unsupported-transport' });
    expect(
      isSupportedSeriesBinding({
        status: 'unconfigured',
      }),
    ).toEqual({ supported: false, reason: 'not-configured' });
  });

  it('derives no-data vs ready from snapshot payload shape', () => {
    expect(
      deriveSeriesLoadStateFromSnapshot({
        sampleType: 'float32',
        channelCount: 1,
        samplesPerChannel: 0,
        layout: 'channels_first',
        seriesByChannel: [[]],
      }),
    ).toBe('no-data');

    expect(
      deriveSeriesLoadStateFromSnapshot({
        sampleType: 'float32',
        channelCount: 1,
        samplesPerChannel: 2,
        layout: 'channels_first',
        seriesByChannel: [[0.1, 0.2]],
      }),
    ).toBe('ready');
  });

  it('creates and cleans polling subscription only for http_poll', () => {
    const setInterval = vi.fn<(handler: () => void, timeout: number) => number>(() => 42);
    const clearInterval = vi.fn<(handle: number) => void>();
    const onTick = vi.fn();

    const cleanup = createSeriesPollSubscription('http_poll', 250, onTick, {
      setInterval,
      clearInterval,
    });
    expect(setInterval).toHaveBeenCalledOnce();
    expect(setInterval).toHaveBeenCalledWith(onTick, 250);

    cleanup?.();
    expect(clearInterval).toHaveBeenCalledWith(42);

    expect(createSeriesPollSubscription('http_snapshot', 250, onTick)).toBeUndefined();
  });
});
