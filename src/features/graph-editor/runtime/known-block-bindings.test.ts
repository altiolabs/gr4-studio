import { describe, expect, it } from 'vitest';
import {
  STUDIO_KNOWN_BLOCK_BINDINGS,
  STUDIO_PHASE1_SUPPORTED_TRANSPORTS,
  buildStudioBindingView,
  lookupStudioKnownBlockBinding,
  resolveStudioBindingFromParameters,
} from './known-block-bindings';

describe('known Studio block bindings', () => {
  it('uses exact reflected block ID lookup only', () => {
    const known = STUDIO_KNOWN_BLOCK_BINDINGS[0];

    expect(lookupStudioKnownBlockBinding(known.blockTypeId)).not.toBeNull();
    expect(lookupStudioKnownBlockBinding(`${known.blockTypeId} `)).toBeNull();
    expect(lookupStudioKnownBlockBinding('StudioSeriesSink')).toBeNull();
    expect(lookupStudioKnownBlockBinding('gr::studio::StudioSpectrumHistorySink<float32>')).toBeNull();
    expect(lookupStudioKnownBlockBinding('gr::studio::StudioPhosphorSpectrumSink<float32>')).toBeNull();
  });

  it('contains placeholder entries for the registered Studio families', () => {
    const counts = STUDIO_KNOWN_BLOCK_BINDINGS.reduce<Record<string, number>>((acc, binding) => {
      acc[binding.family] = (acc[binding.family] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts).toEqual({
      audio: 2,
      image: 3,
      series: 4,
      series2d: 12,
      waterfall: 4,
    });
  });

  it('uses a consistent phase-1 transport contract across all known blocks', () => {
    for (const binding of STUDIO_KNOWN_BLOCK_BINDINGS) {
      if (binding.blockTypeId.startsWith('gr::studio::StudioPowerSpectrumSink<')) {
        expect(binding.supportedTransports).toEqual([
          'http_poll',
          'websocket',
        ]);
        continue;
      }

      if (binding.blockTypeId.startsWith('gr::studio::StudioWaterfallSink<')) {
        expect(binding.supportedTransports).toEqual([
          'http_poll',
          'websocket',
        ]);
        continue;
      }

      expect(binding.supportedTransports).toEqual(STUDIO_PHASE1_SUPPORTED_TRANSPORTS);
    }
  });

  it('resolves explicit transport + endpoint parameters', () => {
    const series = STUDIO_KNOWN_BLOCK_BINDINGS.find((binding) => binding.family === 'series');
    expect(series).toBeDefined();

    const result = resolveStudioBindingFromParameters(series!, {
      transport: 'http_poll',
      endpoint: 'http://127.0.0.1:18080/snapshot',
      poll_ms: '250',
      channels: '2',
      topic: 'demo',
    });

    expect(result).toEqual({
      ok: true,
      transport: 'http_poll',
      endpoint: 'http://127.0.0.1:18080/snapshot',
      pollMs: 250,
      channels: 2,
      topic: 'demo',
      sampleRate: undefined,
    });
  });

  it('rejects invalid transport or missing endpoint', () => {
    const audio = STUDIO_KNOWN_BLOCK_BINDINGS.find((binding) => binding.family === 'audio');
    expect(audio).toBeDefined();

    const missingEndpoint = resolveStudioBindingFromParameters(audio!, {
      transport: 'websocket',
    });
    expect(missingEndpoint.ok).toBe(false);

    const invalidTransport = resolveStudioBindingFromParameters(audio!, {
      transport: 'sse',
      endpoint: 'ws://127.0.0.1:9000/stream',
    });
    expect(invalidTransport).toEqual({
      ok: false,
      reason: 'Unsupported transport mode: sse',
    });
  });

  it('exposes normalized inspector binding states', () => {
    const knownSeriesId = 'gr::studio::StudioSeriesSink<float32>';

    const unsupported = buildStudioBindingView('gr::blocks::NullSink<float>', {});
    expect(unsupported.status).toBe('unsupported');

    const unconfigured = buildStudioBindingView(knownSeriesId, {
      transport: 'http_snapshot',
    });
    expect(unconfigured.status).toBe('unconfigured');

    const invalid = buildStudioBindingView(knownSeriesId, {
      transport: 'websocket',
      endpoint: 'ws://127.0.0.1:9999',
    });
    expect(invalid.status).toBe('invalid');

    const configured = buildStudioBindingView(knownSeriesId, {
      transport: 'http_poll',
      endpoint: 'http://127.0.0.1:18080/snapshot',
      poll_ms: '200',
    });
    expect(configured).toMatchObject({
      status: 'configured',
      transport: 'http_poll',
      endpoint: 'http://127.0.0.1:18080/snapshot',
      pollMs: 200,
    });

    const complexSeriesConfigured = buildStudioBindingView('gr::studio::StudioSeriesSink<complex<float32>>', {
      transport: 'http_snapshot',
      endpoint: 'http://127.0.0.1:18080/snapshot',
    });
    expect(complexSeriesConfigured).toMatchObject({
      status: 'configured',
      family: 'series',
      transport: 'http_snapshot',
    });

    const known2DId = 'gr::studio::Studio2DSeriesSink<float32>';
    const series2DConfigured = buildStudioBindingView(known2DId, {
      transport: 'http_snapshot',
      endpoint: 'http://127.0.0.1:18081/snapshot',
      poll_ms: '250',
    });
    expect(series2DConfigured).toMatchObject({
      status: 'configured',
      family: 'series2d',
      transport: 'http_snapshot',
      endpoint: 'http://127.0.0.1:18081/snapshot',
    });

    const knownDataSetId = 'gr::studio::StudioDataSetSink<float32>';
    const dataSetConfigured = buildStudioBindingView(knownDataSetId, {
      transport: 'http_poll',
      endpoint: 'http://127.0.0.1:18084/snapshot',
      poll_ms: '100',
    });
    expect(dataSetConfigured).toMatchObject({
      status: 'configured',
      family: 'series2d',
      payloadFormat: 'dataset-xy-json-v1',
      transport: 'http_poll',
      endpoint: 'http://127.0.0.1:18084/snapshot',
      pollMs: 100,
    });

    const powerSpectrumConfigured = buildStudioBindingView('gr::studio::StudioPowerSpectrumSink<float32>', {
      transport: 'websocket',
      endpoint: 'http://127.0.0.1:18086/snapshot',
      update_ms: '150',
      sample_rate: '48000',
      topic: 'spectrum',
    });

    expect(powerSpectrumConfigured).toMatchObject({
      status: 'configured',
      family: 'series2d',
      payloadFormat: 'dataset-xy-json-v1',
      transport: 'websocket',
      endpoint: 'http://127.0.0.1:18086/snapshot',
      sampleRate: 48000,
      topic: 'spectrum',
    });

    const waterfallConfigured = buildStudioBindingView('gr::studio::StudioWaterfallSink<float32>', {
      transport: 'websocket',
      endpoint: 'http://127.0.0.1:18087/snapshot',
      update_ms: '200',
      sample_rate: '48000',
      topic: 'waterfall',
    });
    expect(waterfallConfigured).toMatchObject({
      status: 'configured',
      family: 'waterfall',
      payloadFormat: 'waterfall-spectrum-json-v1',
      transport: 'websocket',
      endpoint: 'http://127.0.0.1:18087/snapshot',
      pollMs: 200,
      sampleRate: 48000,
      topic: 'waterfall',
    });

    const imageConfigured = buildStudioBindingView('gr::studio::StudioImageSink<uint8>', {
      transport: 'http_snapshot',
      endpoint: 'http://127.0.0.1:18082/snapshot',
      poll_ms: '300',
      channels: '1',
    });
    expect(imageConfigured).toMatchObject({
      status: 'configured',
      family: 'image',
      transport: 'http_snapshot',
      endpoint: 'http://127.0.0.1:18082/snapshot',
      channels: 1,
    });

    const audioConfigured = buildStudioBindingView('gr::studio::StudioAudioMonitor<float32>', {
      transport: 'http_poll',
      endpoint: 'http://127.0.0.1:18083/snapshot',
      sample_rate: '48000',
      channels: '2',
      poll_ms: '120',
    });
    expect(audioConfigured).toMatchObject({
      status: 'configured',
      family: 'audio',
      transport: 'http_poll',
      endpoint: 'http://127.0.0.1:18083/snapshot',
      sampleRate: 48000,
      channels: 2,
      pollMs: 120,
    });
  });
});
