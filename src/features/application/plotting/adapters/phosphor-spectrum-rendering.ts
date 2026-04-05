import { sampleWaterfallColor } from './waterfall-rendering';
import type { PhosphorSpectrumTuning } from '../model/types';

export type PhosphorSpectrumBuffer = {
  width: number;
  height: number;
  values: Float32Array;
};

export type PhosphorSpectrumRaster = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
};

export const DEFAULT_PHOSPHOR_SPECTRUM_TUNING: PhosphorSpectrumTuning = {
  intensity: 1.1,
  decayMs: 1024,
  colorMap: 'gqrx',
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function toNumberArray(values: readonly number[]): number[] {
  return Array.isArray(values) ? [...values] : Array.from(values);
}

export function createPhosphorSpectrumBuffer(width: number, height: number): PhosphorSpectrumBuffer | null {
  const nextWidth = Math.max(1, Math.floor(width));
  const nextHeight = Math.max(1, Math.floor(height));
  if (nextWidth <= 0 || nextHeight <= 0) {
    return null;
  }

  return {
    width: nextWidth,
    height: nextHeight,
    values: new Float32Array(nextWidth * nextHeight),
  };
}

export function decayPhosphorSpectrumBuffer(buffer: PhosphorSpectrumBuffer, decayFactor: number): void {
  const bounded = Math.min(1, Math.max(0, decayFactor));
  if (bounded >= 1) {
    return;
  }
  for (let index = 0; index < buffer.values.length; index += 1) {
    buffer.values[index] *= bounded;
  }
}

export function stampPhosphorSpectrumBuffer(
  buffer: PhosphorSpectrumBuffer,
  spectrum: readonly number[],
  minValue: number,
  maxValue: number,
  tuning: Pick<PhosphorSpectrumTuning, 'intensity'> = DEFAULT_PHOSPHOR_SPECTRUM_TUNING,
): void {
  if (buffer.width !== spectrum.length || buffer.width <= 0 || buffer.height <= 0) {
    return;
  }

  const denominator = maxValue > minValue ? maxValue - minValue : 1;
  const width = buffer.width;
  const height = buffer.height;
  const next = buffer.values;
  const primaryStrength = Math.max(0, tuning.intensity);
  const haloStrengths = [0.68, 0.42, 0.22];

  for (let x = 0; x < width; x += 1) {
    const normalized = clamp01((spectrum[x] - minValue) / denominator);
    const brightness = clamp01(normalized * Math.max(0, tuning.intensity));
    const center = (height - 1) - Math.round(normalized * (height - 1));
    const centerIndex = center * width + x;
    next[centerIndex] = Math.max(next[centerIndex], brightness * primaryStrength);

    for (let halo = 0; halo < haloStrengths.length; halo += 1) {
      const strength = haloStrengths[halo] * Math.max(0, tuning.intensity);
      const above = center - (halo + 1);
      const below = center + (halo + 1);
      if (above >= 0) {
        next[above * width + x] = Math.max(next[above * width + x], brightness * strength);
      }
      if (below < height) {
        next[below * width + x] = Math.max(next[below * width + x], brightness * strength);
      }
    }
  }
}

export function updatePhosphorSpectrumBuffer(params: {
  previous: PhosphorSpectrumBuffer | null;
  spectrum: readonly number[];
  minValue: number;
  maxValue: number;
  height?: number;
  elapsedMs?: number;
  tuning?: PhosphorSpectrumTuning;
}): PhosphorSpectrumBuffer | null {
  const height = Math.max(1, Math.floor(params.height ?? 128));
  const width = params.spectrum.length;
  if (width <= 0 || height <= 0) {
    return null;
  }

  const tuning = params.tuning ?? DEFAULT_PHOSPHOR_SPECTRUM_TUNING;
  const elapsedMs = Math.max(0, Math.floor(params.elapsedMs ?? 16));

  const needsReset =
    !params.previous ||
    params.previous.width !== width ||
    params.previous.height !== height;

  const buffer = needsReset ? createPhosphorSpectrumBuffer(width, height) : params.previous;
  if (!buffer) {
    return null;
  }

  if (needsReset) {
    buffer.values.fill(0);
  }

  const decayFactor = Math.exp(-elapsedMs / Math.max(1, tuning.decayMs));
  decayPhosphorSpectrumBuffer(buffer, decayFactor);
  stampPhosphorSpectrumBuffer(buffer, params.spectrum, params.minValue, params.maxValue, tuning);
  return buffer;
}

export function buildPhosphorSpectrumRaster(params: {
  buffer: PhosphorSpectrumBuffer | null;
  colorMap?: string;
  backgroundColor?: [number, number, number];
}): PhosphorSpectrumRaster | null {
  const buffer = params.buffer;
  if (!buffer || buffer.width <= 0 || buffer.height <= 0) {
    return null;
  }

  const pixels = new Uint8ClampedArray(buffer.width * buffer.height * 4);
  const background = params.backgroundColor ?? [2, 6, 18];

  for (let index = 0; index < buffer.values.length; index += 1) {
    const intensity = clamp01(buffer.values[index]);
    const offset = index * 4;
    if (intensity <= 0) {
      pixels[offset] = background[0];
      pixels[offset + 1] = background[1];
      pixels[offset + 2] = background[2];
      pixels[offset + 3] = 255;
      continue;
    }

    const base = sampleWaterfallColor(intensity, 0, 1, params.colorMap ?? DEFAULT_PHOSPHOR_SPECTRUM_TUNING.colorMap);
    const alpha = Math.pow(intensity, 0.82);
    pixels[offset] = Math.round(background[0] * (1 - alpha) + base[0] * alpha);
    pixels[offset + 1] = Math.round(background[1] * (1 - alpha) + base[1] * alpha);
    pixels[offset + 2] = Math.round(background[2] * (1 - alpha) + base[2] * alpha);
    pixels[offset + 3] = 255;
  }

  return {
    width: buffer.width,
    height: buffer.height,
    pixels,
  };
}

export function normalizePhosphorSpectrumValues(values: readonly number[]): number[] {
  return toNumberArray(values);
}
