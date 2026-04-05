import { describe, expect, it } from 'vitest';
import {
  calculateWaterfallCanvasDimensions,
  resolveWaterfallHoverSample,
} from './waterfall-canvas-adapter';
import type { WaterfallRaster } from './waterfall-rendering';

describe('waterfall canvas adapter helpers', () => {
  it('rounds canvas dimensions against device pixel ratio for crisp resizing', () => {
    expect(
      calculateWaterfallCanvasDimensions({
        width: 321.5,
        height: 123.4,
        devicePixelRatio: 2,
      }),
    ).toEqual({
      pixelWidth: 643,
      pixelHeight: 246,
    });
  });

  it('resolves hover readout against known synthetic data', () => {
    const raster: WaterfallRaster = {
      width: 2,
      height: 2,
      pixels: new Uint8ClampedArray(16),
      minValue: 1,
      maxValue: 4,
    };

    expect(
      resolveWaterfallHoverSample({
        raster,
        sourceValues: [1, 2, 3, 4],
        frequencyBins: [10, 20],
        rect: { width: 200, height: 100 },
        clientX: 150,
        clientY: 75,
      }),
    ).toEqual({
      row: 1,
      column: 1,
      frequency: 20,
      value: 4,
    });
  });
});
