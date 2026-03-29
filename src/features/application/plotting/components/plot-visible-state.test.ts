import { describe, expect, it } from 'vitest';
import { derivePlotVisibleState, hasRenderableSeries } from './plot-visible-state';
import type { PlotDataFrame } from '../model/types';

function frame(state: NonNullable<PlotDataFrame['meta']>['state'], points: number[]): PlotDataFrame {
  return {
    kind: 'timeseries',
    series: [{ id: 'ch0', label: 'ch0', y: points }],
    meta: {
      state,
      domain: 'time',
    },
  };
}

describe('plot visible state', () => {
  it('detects renderable series payload', () => {
    expect(hasRenderableSeries(frame('ready', [1, 2]))).toBe(true);
    expect(hasRenderableSeries(frame('ready', []))).toBe(false);
  });

  it('prioritizes error state', () => {
    expect(
      derivePlotVisibleState({
        frame: frame('error', [1, 2]),
        width: 400,
        height: 240,
      }),
    ).toBe('runtime-error');
  });

  it('distinguishes invalid binding error state', () => {
    expect(
      derivePlotVisibleState({
        frame: {
          kind: 'timeseries',
          series: [{ id: 'ch0', label: 'ch0', y: [] }],
          meta: {
            state: 'error',
            errorKind: 'invalid-binding',
            domain: 'time',
          },
        },
        width: 400,
        height: 240,
      }),
    ).toBe('invalid-binding');
  });

  it('returns too-small when host area is below threshold', () => {
    expect(
      derivePlotVisibleState({
        frame: frame('ready', [1, 2]),
        width: 100,
        height: 220,
      }),
    ).toBe('too-small');
  });

  it('returns loading state while waiting for first payload', () => {
    expect(
      derivePlotVisibleState({
        frame: frame('loading', []),
        width: 400,
        height: 240,
      }),
    ).toBe('loading');
  });

  it('returns live when ready state has series samples', () => {
    expect(
      derivePlotVisibleState({
        frame: frame('ready', [1, 2, 3]),
        width: 400,
        height: 240,
      }),
    ).toBe('live');
  });

  it('falls back to no-data when ready has no samples', () => {
    expect(
      derivePlotVisibleState({
        frame: frame('ready', []),
        width: 400,
        height: 240,
      }),
    ).toBe('no-data');
  });
});
