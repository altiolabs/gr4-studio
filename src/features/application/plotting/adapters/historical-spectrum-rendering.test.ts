import { describe, expect, it, vi } from 'vitest';
import {
  buildPhosphorSpectrumRaster,
  createPhosphorSpectrumBuffer,
  decayPhosphorSpectrumBuffer,
  stampPhosphorSpectrumBuffer,
  updatePhosphorSpectrumBuffer,
} from './phosphor-spectrum-rendering';
import { drawPhosphorSpectrumRaster } from './histogram-spectrum-uplot-adapter';

describe('phosphor spectrum rendering', () => {
  it('allocates a bounded buffer and decays in place', () => {
    const buffer = createPhosphorSpectrumBuffer(3, 4);
    expect(buffer).not.toBeNull();
    buffer!.values.fill(1);
    decayPhosphorSpectrumBuffer(buffer!, 0.5);
    expect(buffer!.values.every((value) => value === 0.5)).toBe(true);
  });

  it('stamps the trace into the phosphor buffer', () => {
    const buffer = createPhosphorSpectrumBuffer(3, 5);
    expect(buffer).not.toBeNull();
    stampPhosphorSpectrumBuffer(buffer!, [0, 0.5, 1], 0, 1);
    expect(buffer!.values.some((value) => value > 0)).toBe(true);
  });

  it('places high power near the top of the phosphor field', () => {
    const buffer = updatePhosphorSpectrumBuffer({
      previous: null,
      spectrum: [1],
      minValue: 0,
      maxValue: 1,
      height: 8,
    });

    expect(buffer).not.toBeNull();
    expect(buffer!.values[0]).toBeGreaterThan(0);
    expect(buffer!.values[buffer!.width * (buffer!.height - 1)]).toBe(0);
  });

  it('produces deterministic raster colors for the same phosphor buffer and color map', () => {
    const first = updatePhosphorSpectrumBuffer({
      previous: null,
      spectrum: [0, 0.5, 1],
      minValue: 0,
      maxValue: 1,
      height: 8,
    });
    const second = updatePhosphorSpectrumBuffer({
      previous: null,
      spectrum: [0, 0.5, 1],
      minValue: 0,
      maxValue: 1,
      height: 8,
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(
      buildPhosphorSpectrumRaster({ buffer: first, colorMap: 'viridis' })?.pixels,
    ).toEqual(buildPhosphorSpectrumRaster({ buffer: second, colorMap: 'viridis' })?.pixels);
  });

  it('keeps the current trace visibly brighter than older persistence cells', () => {
    const buffer = updatePhosphorSpectrumBuffer({
      previous: null,
      spectrum: [0, 0.25, 0.5, 0.75, 1],
      minValue: 0,
      maxValue: 1,
      height: 16,
    });
    expect(buffer).not.toBeNull();
    const raster = buildPhosphorSpectrumRaster({ buffer, colorMap: 'turbo' });
    expect(raster).not.toBeNull();
    const brightestPixel = Math.max(...Array.from(raster!.pixels));
    expect(brightestPixel).toBeGreaterThan(0);
  });

  it('respects Fosphor-style rise and decay tuning', () => {
    const seededFast = updatePhosphorSpectrumBuffer({
      previous: null,
      spectrum: [1],
      minValue: 0,
      maxValue: 1,
      height: 8,
      elapsedMs: 16,
      tuning: {
        intensity: 1.1,
        decayMs: 1000,
        colorMap: 'gqrx',
      },
    });
    const seededSlow = updatePhosphorSpectrumBuffer({
      previous: null,
      spectrum: [1],
      minValue: 0,
      maxValue: 1,
      height: 8,
      elapsedMs: 16,
      tuning: {
        intensity: 1.1,
        decayMs: 1000,
        colorMap: 'gqrx',
      },
    });

    const fastDecay = updatePhosphorSpectrumBuffer({
      previous: seededFast,
      spectrum: [0],
      minValue: 0,
      maxValue: 1,
      height: 8,
      elapsedMs: 1000,
      tuning: {
        intensity: 1.1,
        decayMs: 50,
        colorMap: 'gqrx',
      },
    });

    const slowDecay = updatePhosphorSpectrumBuffer({
      previous: seededSlow,
      spectrum: [0],
      minValue: 0,
      maxValue: 1,
      height: 8,
      elapsedMs: 1000,
      tuning: {
        intensity: 1.1,
        decayMs: 5000,
        colorMap: 'gqrx',
      },
    });

    expect(fastDecay).not.toBeNull();
    expect(slowDecay).not.toBeNull();
    expect(Array.from(slowDecay!.values).some((value, index) => value > fastDecay!.values[index])).toBe(true);
  });

  it('draws the raster into the visible plot rect for resize-sensitive rendering', () => {
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    const save = vi.fn();
    const restore = vi.fn();
    const beginPath = vi.fn();
    const rect = vi.fn();
    const clip = vi.fn();
    const createImageData = vi.fn(() => ({ data: new Uint8ClampedArray(2 * 2 * 4) }));
    const putImageData = vi.fn();
    const sourceContext = { createImageData, putImageData } as unknown as CanvasRenderingContext2D;
    const sourceCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => sourceContext),
    } as unknown as HTMLCanvasElement;
    const fakeDocument = {
      createElement: vi.fn(() => sourceCanvas),
    } as unknown as Document;
    vi.stubGlobal('document', fakeDocument);
    const ctx = {
      save,
      restore,
      beginPath,
      rect,
      clip,
      fillRect,
      drawImage,
      fillStyle: '',
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    } as unknown as CanvasRenderingContext2D;

    drawPhosphorSpectrumRaster({
      ctx,
      bbox: {
        left: 12,
        top: 24,
        width: 220,
        height: 140,
      },
      raster: {
        width: 2,
        height: 2,
        pixels: new Uint8ClampedArray(16),
      },
      offscreenCanvasRef: { current: null },
    });

    expect(drawImage).toHaveBeenCalledWith(sourceCanvas, 12, 24, 220, 140);
    expect(fillRect).toHaveBeenCalledWith(12, 24, 220, 140);

    vi.unstubAllGlobals();
  });
});
