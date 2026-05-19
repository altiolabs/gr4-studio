export type AudioFrame = {
  channels: number;
  sampleRate: number;
  frames: number;
  sequence: bigint;
  timestampNs: bigint;
  samples: Float32Array;
};

const AUDIO_MAGIC = 0x44554153;
const AUDIO_VERSION = 1;
const AUDIO_SAMPLE_TYPE_FLOAT32 = 1;
const HEADER_BYTES = 36;

export function parseAudioFloat32Frame(payload: ArrayBuffer): AudioFrame {
  if (payload.byteLength < HEADER_BYTES) {
    throw new Error('Audio frame is shorter than the header.');
  }

  const view = new DataView(payload);
  const magic = view.getUint32(0, true);
  if (magic !== AUDIO_MAGIC) {
    throw new Error('Audio frame magic is invalid.');
  }

  const version = view.getUint16(4, true);
  if (version !== AUDIO_VERSION) {
    throw new Error(`Unsupported audio frame version: ${version}.`);
  }

  const channels = view.getUint16(8, true);
  if (channels < 1) {
    throw new Error('Audio frame channel count must be positive.');
  }

  const sampleType = view.getUint16(10, true);
  if (sampleType !== AUDIO_SAMPLE_TYPE_FLOAT32) {
    throw new Error(`Unsupported audio sample type: ${sampleType}.`);
  }

  const sampleRate = view.getUint32(12, true);
  if (sampleRate < 1) {
    throw new Error('Audio frame sample rate must be positive.');
  }

  const frames = view.getUint32(16, true);
  const sequence = view.getBigUint64(20, true);
  const timestampNs = view.getBigUint64(28, true);
  const sampleCount = frames * channels;
  const expectedBytes = HEADER_BYTES + sampleCount * Float32Array.BYTES_PER_ELEMENT;
  if (payload.byteLength !== expectedBytes) {
    throw new Error(`Audio frame payload length mismatch: expected ${expectedBytes}, got ${payload.byteLength}.`);
  }

  const samples = new Float32Array(sampleCount);
  const source = new Float32Array(payload, HEADER_BYTES, sampleCount);
  samples.set(source);

  return {
    channels,
    sampleRate,
    frames,
    sequence,
    timestampNs,
    samples,
  };
}
