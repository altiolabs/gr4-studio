import { describe, expect, it } from 'vitest';
import { buildWaterfallRaster, sampleWaterfallColor } from './waterfall-rendering';

describe('waterfall rendering helpers', () => {
  it('maps scalar waterfall values to vivid gradient colors', () => {
    expect(sampleWaterfallColor(0, 0, 10)).toEqual([8, 17, 32]);
    expect(sampleWaterfallColor(10, 0, 10)).toEqual([238, 70, 61]);
    expect(sampleWaterfallColor(0, 0, 10, 'grayscale')).toEqual([0, 0, 0]);
    expect(sampleWaterfallColor(10, 0, 10, 'grayscale')).toEqual([255, 255, 255]);
    expect(sampleWaterfallColor(5, 0, 10, 'viridis')).toEqual([47, 106, 141]);
  });

  it('builds a bounded raster from a waterfall matrix payload', () => {
    const raster = buildWaterfallRaster({
      width: 2,
      height: 2,
      values: [1, 2, 3, 4],
      xAxis: [10, 20],
      minValue: 1,
      maxValue: 4,
    });

    expect(raster.width).toBe(2);
    expect(raster.height).toBe(2);
    expect(raster.pixels.length).toBe(16);
    expect(raster.minValue).toBe(1);
    expect(raster.maxValue).toBe(4);
  });

  it('honors the payload color map during rasterization', () => {
    const raster = buildWaterfallRaster({
      width: 1,
      height: 2,
      values: [0, 10],
      colorMap: 'grayscale',
    });

    expect(Array.from(raster.pixels.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(raster.pixels.slice(4, 8))).toEqual([255, 255, 255, 255]);
  });
});
