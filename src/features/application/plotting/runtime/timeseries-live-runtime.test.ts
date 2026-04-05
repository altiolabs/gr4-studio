import { describe, expect, it } from 'vitest';
import type { PlotDataFrame } from '../model/types';
import { shouldRetainPreviousLiveFrame } from './timeseries-live-runtime';

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

describe('timeseries live runtime retention', () => {
  it('keeps the previous live frame during transient loading/no-data transitions', () => {
    expect(
      shouldRetainPreviousLiveFrame({
        currentFrame: frame('ready', [1, 2, 3]),
        nextFrame: frame('loading', []),
      }),
    ).toBe(true);

    expect(
      shouldRetainPreviousLiveFrame({
        currentFrame: frame('ready', [1, 2, 3]),
        nextFrame: frame('no-data', []),
      }),
    ).toBe(true);
  });

  it('does not retain when there is no prior live frame', () => {
    expect(
      shouldRetainPreviousLiveFrame({
        currentFrame: frame('no-data', []),
        nextFrame: frame('no-data', []),
      }),
    ).toBe(false);
  });

  it('retains prior waterfall frames during transient loading/no-data transitions', () => {
    expect(
      shouldRetainPreviousLiveFrame({
        currentFrame: {
          kind: 'waterfall',
          image: {
            width: 2,
            height: 2,
            values: [1, 2, 3, 4],
          },
          meta: {
            state: 'ready',
            domain: 'frequency',
          },
        },
        nextFrame: {
          kind: 'waterfall',
          image: {
            width: 0,
            height: 0,
            values: [],
          },
          meta: {
            state: 'loading',
            domain: 'frequency',
          },
        },
      }),
    ).toBe(true);
  });
});
