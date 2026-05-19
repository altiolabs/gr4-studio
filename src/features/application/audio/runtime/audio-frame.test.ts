import { describe, expect, it } from 'vitest';
import { parseAudioFloat32Frame } from './audio-frame';

function makeFrame(samples: number[], overrides: { channels?: number; sampleRate?: number; frames?: number } = {}) {
  const channels = overrides.channels ?? 2;
  const frames = overrides.frames ?? samples.length / channels;
  const bytes = 36 + samples.length * Float32Array.BYTES_PER_ELEMENT;
  const buffer = new ArrayBuffer(bytes);
  const view = new DataView(buffer);
  view.setUint32(0, 0x44554153, true);
  view.setUint16(4, 1, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, channels, true);
  view.setUint16(10, 1, true);
  view.setUint32(12, overrides.sampleRate ?? 48000, true);
  view.setUint32(16, frames, true);
  view.setBigUint64(20, 7n, true);
  view.setBigUint64(28, 123n, true);
  new Float32Array(buffer, 36).set(samples);
  return buffer;
}

describe('audio-float32-binary-v1 frames', () => {
  it('parses frame headers and interleaved samples', () => {
    const frame = parseAudioFloat32Frame(makeFrame([0.1, -0.1, 0.2, -0.2]));

    expect(frame.channels).toBe(2);
    expect(frame.sampleRate).toBe(48000);
    expect(frame.frames).toBe(2);
    expect(frame.sequence).toBe(7n);
    expect(frame.timestampNs).toBe(123n);
    expect(Array.from(frame.samples)).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(-0.1),
      expect.closeTo(0.2),
      expect.closeTo(-0.2),
    ]);
  });

  it('rejects mismatched payload lengths', () => {
    expect(() => parseAudioFloat32Frame(makeFrame([0.1, 0.2], { channels: 2, frames: 2 }))).toThrow(
      /payload length mismatch/,
    );
  });
});
