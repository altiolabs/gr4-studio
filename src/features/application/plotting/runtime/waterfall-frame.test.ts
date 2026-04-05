import { describe, expect, it } from 'vitest';
import { mapWaterfallSnapshotToImage, parseHttpWaterfallSnapshot } from './waterfall-frame';
import {
  WATERFALL_MALFORMED_FIXTURE,
  WATERFALL_MANUAL_RANGE_FIXTURE,
  WATERFALL_NORMAL_FIXTURE,
  WATERFALL_SMALLEST_VALID_FIXTURE,
} from './fixtures/waterfall-contract-fixtures';

describe('waterfall frame parsing', () => {
  it('parses the waterfall matrix payload contract', () => {
    const snapshot = parseHttpWaterfallSnapshot(WATERFALL_NORMAL_FIXTURE);

    expect(snapshot.rows).toBe(2);
    expect(snapshot.columns).toBe(3);
    expect(Array.from(snapshot.values)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(snapshot.frequencyBins).toEqual([10, 20, 30]);
    expect(snapshot.minValue).toBe(1);
    expect(snapshot.maxValue).toBe(6);
    expect(snapshot.timeSpan).toBe(0.012);
    expect(snapshot.sampleRateHz).toBe(1000);
    expect(snapshot.outputInDb).toBe(true);
    expect(snapshot.colorMap).toBe('turbo');
  });

  it('normalizes the smallest valid payload with derived min/max defaults', () => {
    const snapshot = parseHttpWaterfallSnapshot(WATERFALL_SMALLEST_VALID_FIXTURE);

    expect(snapshot.rows).toBe(1);
    expect(snapshot.columns).toBe(1);
    expect(Array.from(snapshot.values)).toEqual([0]);
    expect(snapshot.frequencyBins).toEqual([0]);
    expect(snapshot.minValue).toBe(0);
    expect(snapshot.maxValue).toBe(0);
    expect(snapshot.timeSpan).toBe(0.001);
    expect(snapshot.colorMap).toBe('turbo');
  });

  it('honors explicit waterfall color scale bounds from live settings', () => {
    const snapshot = parseHttpWaterfallSnapshot(WATERFALL_MANUAL_RANGE_FIXTURE);

    expect(snapshot.autoscale).toBe(false);
    expect(snapshot.zMin).toBe(-20);
    expect(snapshot.zMax).toBe(10);
    expect(snapshot.timeSpan).toBe(0.008);
    expect(snapshot.minValue).toBe(-20);
    expect(snapshot.maxValue).toBe(10);
    expect(snapshot.colorMap).toBe('viridis');
  });

  it('supports explicit min/max bounds when present on the payload', () => {
    const snapshot = parseHttpWaterfallSnapshot({
      ...WATERFALL_SMALLEST_VALID_FIXTURE,
      min_value: -12,
      max_value: 18,
    });

    expect(snapshot.minValue).toBe(-12);
    expect(snapshot.maxValue).toBe(18);
  });

  it('requires a time_span field on waterfall payloads', () => {
    expect(() =>
      parseHttpWaterfallSnapshot({
        ...WATERFALL_SMALLEST_VALID_FIXTURE,
        time_span: undefined,
      }),
    ).toThrow('Waterfall snapshot payload time_span must be a positive number.');
  });

  it('requires a sample_rate field on waterfall payloads', () => {
    expect(() =>
      parseHttpWaterfallSnapshot({
        ...WATERFALL_SMALLEST_VALID_FIXTURE,
        sample_rate: undefined,
      }),
    ).toThrow('Waterfall snapshot payload sample_rate must be a positive number.');
  });

  it('rejects malformed waterfall matrices with explicit errors', () => {
    expect(() => parseHttpWaterfallSnapshot(WATERFALL_MALFORMED_FIXTURE)).toThrow(
      'Waterfall snapshot payload row 1 must contain 2 values.',
    );
  });

  it('rejects malformed explicit waterfall color ranges', () => {
    expect(() =>
      parseHttpWaterfallSnapshot({
        payload_format: 'waterfall-spectrum-json-v1',
        layout: 'waterfall_matrix',
        rows: 1,
        columns: 1,
        data: [[0]],
        time_span: 0.001,
        sample_rate: 1000,
        min_value: 10,
        max_value: 5,
      }),
    ).toThrow('Waterfall snapshot payload min_value must be less than max_value.');
  });

  it('maps waterfall snapshots into image frames for the plot pipeline', () => {
    const image = mapWaterfallSnapshotToImage({
      sampleType: 'float32',
      layout: 'waterfall_matrix',
      rows: 1,
      columns: 2,
      values: new Float32Array([7, 8]),
      frequencyBins: [100, 200],
      minValue: 7,
      maxValue: 8,
      timeSpan: 0.008,
      sampleRateHz: 1000,
      signalName: 'Waterfall',
      signalUnit: 'dB',
      axisName: 'Frequency',
      axisUnit: 'Hz',
      fftSize: 2,
      numAverages: 1,
      historyRows: 1,
      window: 'Rectangular',
      outputInDb: false,
      autoscale: false,
      zMin: -10,
      zMax: 10,
      colorMap: 'magma',
    });

    expect(image).toEqual({
      width: 2,
      height: 1,
      values: new Float32Array([7, 8]),
      xAxis: [100, 200],
      minValue: 7,
      maxValue: 8,
      timeSpan: 0.008,
      sampleType: 'float32',
      signalName: 'Waterfall',
      signalUnit: 'dB',
      axisName: 'Frequency',
      axisUnit: 'Hz',
      colorMap: 'magma',
    });
  });
});
