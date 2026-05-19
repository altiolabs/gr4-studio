class StudioAudioPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channels = 1;
    this.capacityFrames = 48000;
    this.buffer = new Float32Array(this.capacityFrames * this.channels);
    this.readFrame = 0;
    this.writeFrame = 0;
    this.availableFrames = 0;
    this.volume = 0.8;
    this.underruns = 0;
    this.processCalls = 0;

    this.port.onmessage = (event) => {
      const message = event.data || {};
      if (message.type === 'configure') {
        this.configure(message.channels || 1, message.bufferFrames || 48000);
      } else if (message.type === 'volume') {
        this.volume = Math.max(0, Math.min(1, Number(message.value) || 0));
      } else if (message.type === 'samples' && message.samples instanceof Float32Array) {
        this.enqueue(message.samples);
      } else if (message.type === 'clear') {
        this.clear();
      }
    };
  }

  configure(channels, bufferFrames) {
    this.channels = Math.max(1, Math.min(2, Math.floor(channels)));
    this.capacityFrames = Math.max(128, Math.floor(bufferFrames));
    this.buffer = new Float32Array(this.capacityFrames * this.channels);
    this.clear();
  }

  clear() {
    this.readFrame = 0;
    this.writeFrame = 0;
    this.availableFrames = 0;
  }

  enqueue(samples) {
    const frames = Math.floor(samples.length / this.channels);
    for (let frame = 0; frame < frames; frame += 1) {
      if (this.availableFrames === this.capacityFrames) {
        this.readFrame = (this.readFrame + 1) % this.capacityFrames;
        this.availableFrames -= 1;
      }
      for (let channel = 0; channel < this.channels; channel += 1) {
        this.buffer[this.writeFrame * this.channels + channel] = samples[frame * this.channels + channel] || 0;
      }
      this.writeFrame = (this.writeFrame + 1) % this.capacityFrames;
      this.availableFrames += 1;
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const frameCount = output[0]?.length || 0;

    for (let index = 0; index < frameCount; index += 1) {
      if (this.availableFrames === 0) {
        for (let channel = 0; channel < output.length; channel += 1) {
          output[channel][index] = 0;
        }
        this.underruns += 1;
        continue;
      }

      for (let channel = 0; channel < output.length; channel += 1) {
        const sourceChannel = Math.min(channel, this.channels - 1);
        output[channel][index] = this.buffer[this.readFrame * this.channels + sourceChannel] * this.volume;
      }
      this.readFrame = (this.readFrame + 1) % this.capacityFrames;
      this.availableFrames -= 1;
    }

    this.processCalls += 1;
    if (this.processCalls % 128 === 0) {
      this.port.postMessage({
        type: 'stats',
        availableFrames: this.availableFrames,
        capacityFrames: this.capacityFrames,
        underruns: this.underruns,
      });
    }

    return true;
  }
}

registerProcessor('studio-audio-playback', StudioAudioPlaybackProcessor);
