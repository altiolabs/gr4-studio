import { describe, expect, it } from 'vitest';
import {
  assertSeriesShape,
  deriveBindingFailure,
  deriveBindingFailureMessage,
  formatPayloadParseError,
  identifyPayloadFormat,
  mapSnapshotToPlotSeriesFrames,
  parseSeriesFramesFromPayload,
  resolvePayloadContract,
} from './timeseries-live-runtime';

describe('timeseries live runtime mapping', () => {
  it('maps snapshot channels to internal plot series frames', () => {
    const mapped = mapSnapshotToPlotSeriesFrames({
      sampleType: 'float32',
      channelCount: 2,
      samplesPerChannel: 3,
      layout: 'interleaved',
      seriesByChannel: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    });

    expect(mapped).toEqual([
      { id: 'ch0', label: 'ch0', y: [1, 2, 3] },
      { id: 'ch1', label: 'ch1', y: [4, 5, 6] },
    ]);
  });

  it('uses semantic series labels when provided', () => {
    const mapped = mapSnapshotToPlotSeriesFrames(
      {
        sampleType: 'float32',
        channelCount: 2,
        samplesPerChannel: 3,
        layout: 'interleaved',
        seriesByChannel: [
          [1, 2, 3],
          [4, 5, 6],
        ],
      },
      ['left', 'right'],
    );

    expect(mapped).toEqual([
      { id: 'ch0', label: 'left', y: [1, 2, 3] },
      { id: 'ch1', label: 'right', y: [4, 5, 6] },
    ]);
  });

  it('derives predictable binding failure messages', () => {
    expect(deriveBindingFailureMessage({ status: 'invalid' })).toBe('Binding is invalid for runtime plotting.');
    expect(deriveBindingFailureMessage({ status: 'configured', reason: 'unsupported-transport' })).toBe(
      'Only http_snapshot/http_poll is supported for this live plot path.',
    );
    expect(deriveBindingFailureMessage({ status: 'configured', reason: 'missing-endpoint' })).toBe(
      'Missing endpoint for runtime plotting.',
    );
    expect(deriveBindingFailureMessage({ status: 'configured' })).toBeNull();
  });

  it('derives invalid-binding failure type for config errors', () => {
    expect(deriveBindingFailure({ status: 'invalid' })).toEqual({
      errorKind: 'invalid-binding',
      message: 'Binding is invalid for runtime plotting.',
    });
    expect(deriveBindingFailure({ status: 'configured' })).toBeNull();
  });

  it('resolves payload contract selection deterministically', () => {
    expect(resolvePayloadContract('series-window-json-v1')).toBe('series-window-json-v1');
    expect(resolvePayloadContract('series2d-xy-json-v1')).toBe('series2d-xy-json-v1');
    expect(resolvePayloadContract('dataset-xy-json-v1')).toBe('dataset-xy-json-v1');
    expect(resolvePayloadContract(undefined)).toBe('series-window-json-v1');
  });

  it('formats payload parse errors with contract and observed tokens', () => {
    expect(
      formatPayloadParseError({
        contract: 'dataset-xy-json-v1',
        reason: 'points must match data length.',
        payload: {
          payload_format: 'series2d-xy-json-v1',
          layout: 'pairs_xy',
        },
      }),
    ).toBe(
      'Invalid dataset-xy-json-v1 payload: points must match data length. (payload_format=series2d-xy-json-v1, layout=pairs_xy)',
    );
    expect(identifyPayloadFormat({ payload_format: 'dataset-xy-json-v1' })).toBe('dataset-xy-json-v1');
  });

  it('normalizes complex scalar payload into real/imag plotted series', () => {
    const parsed = parseSeriesFramesFromPayload({
      payloadFormat: 'series-window-json-v1',
      payload: {
        sample_type: 'complex64',
        channels: 1,
        samples_per_channel: 10,
        layout: 'channels_first_interleaved_complex',
        data: [[
          0.721840024, 0.692059934,
          0.717477739, 0.696581423,
          0.713087082, 0.701075435,
          0.708668351, 0.70554179,
          0.704221606, 0.709980249,
          0.699747086, 0.714390695,
          0.695244908, 0.718772948,
          0.690715313, 0.723126829,
          0.686158419, 0.727452159,
          0.681574464, 0.73174876,
        ]],
      },
    });

    expect(parsed.series).toEqual([
      {
        id: 'ch0.real',
        label: 'ch0 (real)',
        y: [
          0.721840024, 0.717477739, 0.713087082, 0.708668351, 0.704221606,
          0.699747086, 0.695244908, 0.690715313, 0.686158419, 0.681574464,
        ],
      },
      {
        id: 'ch0.imag',
        label: 'ch0 (imag)',
        y: [
          0.692059934, 0.696581423, 0.701075435, 0.70554179, 0.709980249,
          0.714390695, 0.718772948, 0.723126829, 0.727452159, 0.73174876,
        ],
      },
    ]);
    expect(parsed.series).toHaveLength(2);
    assertSeriesShape(parsed.series, {
      stage: 'payload-parser',
      expectedSeriesCount: 2,
      sourceChannels: 1,
      samplesPerChannel: 10,
    });
  });
});
