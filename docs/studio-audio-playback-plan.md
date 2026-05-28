# Studio Audio Playback Notes

## Current State

Allow FM listening directly in Studio from a GR4 flowgraph.

Studio uses a live audio sink family for playback, not polled JSON sample windows.

## Target UX

Audio panels currently provide:

- mute / unmute control
- volume slider
- playback device selection
- current connection state
- sample-rate, channel, buffer, and underrun status

Device selection uses browser output-device APIs when available. On browsers without selectable output support, Studio shows the default output device and keeps playback functional.

## Architecture

Studio uses a playback-oriented sink:

- `gr::studio::StudioAudioSink<float>`

Do not add a separate waveform/debug audio monitor unless there is a clear non-playback workflow for it.

The audio sink uses WebSocket transport with binary frames. HTTP polling is a poor fit for playback because request cadence, JSON parsing, and buffering jitter cause audible gaps.

Playback ownership lives above the audio panel renderer. The audio panel is a control/status surface only. Playback lifecycle is tied to the runtime session and sink node, not to panel visibility.

Target ownership model:

```text
Runtime audio session store/service
  owns WebSocket subscription
  owns AudioContext and AudioWorkletNode
  owns playback buffer state
  exposes commands and status

AudioLiveRenderer
  reads status
  sends play/pause/volume/device commands
  does not own transport or AudioContext lifetime
```

Playback session key:

```text
${sessionId}:${nodeInstanceId}
```

The service tears down playback when the graph stops, the session is deleted, the sink node disappears, or the user explicitly pauses/stops playback. It does not tear down merely because the workspace switches between Graph and Application views.

Recommended flowgraph placement for FM:

```text
... -> QuadratureDemod -> audio filtering/deemphasis -> resampler -> StudioAudioSink<float>
```

The sink expects normalized mono or interleaved float audio in roughly `[-1, 1]`.

## Native Block

`StudioAudioSink<float>` lives in `blocks/studio/include/gnuradio-4.0/studio/StudioAudioSink.hpp`.

Parameters:

- `transport`: explicit transport, currently `websocket`
- `endpoint`: listen URL/path
- `sample_rate`: input audio sample rate in Hz
- `channels`: interleaved channel count
- `frame_ms`: audio packet duration, default `20`
- `buffer_ms`: suggested client buffer target, default `120`
- `gain`: optional server-side gain, default `1.0`
- `clip`: clamp samples to `[-1, 1]`, default `true`
- `topic`: optional stream topic

Supported reflected types:

- `float`

Frame sizing:

```text
samples_per_frame = sample_rate * frame_ms / 1000
payload_samples = samples_per_frame * channels
```

The block accumulates incoming samples until a complete audio frame is available, then publishes one binary WebSocket message.

## Binary Frame Contract

Use a compact binary frame:

```text
magic:        uint32  "SAUD"
version:      uint16  1
flags:        uint16
channels:     uint16
sample_type:  uint16  1 = float32 little-endian
sample_rate:  uint32
frames:       uint32  sample frames per channel
sequence:     uint64
timestamp_ns: uint64  producer timestamp
payload:      float32[frames * channels], interleaved
```

Keep one complete audio packet per WebSocket message.

This contract is documented in `docs/studio-blocks-payload-contracts.md` as `audio-float32-binary-v1`.

## Runtime Binding

`src/features/graph-editor/runtime/known-block-bindings.ts` defines the audio sink bindings:

- exact block IDs for `StudioAudioSink<float32>` and `StudioAudioSink<float>`
- family: `audio`
- supported transport: `websocket`
- payload format: `audio-float32-binary-v1`
- parameters: `transport`, `endpoint`, `sample_rate`, `channels`, `topic`

Runtime binding tests cover descriptor-driven audio streams.

`StudioAudioSink` is the only first-party Studio audio block. It is the live audio path for both runtime binding and rendering.

## Frontend Runtime

The audio WebSocket runtime:

- parse `audio-float32-binary-v1`
- validate magic/version/sample type/channels/sample rate/frame count
- expose normalized `Float32Array` chunks to the playback engine
- track sequence gaps and stalled streams

Files:

- `src/features/application/audio/runtime/audio-websocket-runtime.ts`
- `src/features/application/audio/runtime/audio-frame.ts`
- tests beside those files

The runtime does not render UI directly. It feeds a playback controller.

## Browser Playback Engine

Studio uses `AudioWorklet` for stable low-latency playback.

Main thread responsibilities:

- open WebSocket
- parse binary frames
- send audio chunks to the worklet through `MessagePort`
- manage volume setting
- manage selected output device
- surface buffer state and underruns

AudioWorklet responsibilities:

- own a ring buffer per channel
- pull samples at browser audio clock rate
- apply volume
- output silence on underrun
- report buffer fill and underrun counts

Do not use ScriptProcessorNode; it is deprecated and too jitter-prone for this use.

Sample-rate handling:

- If sink `sample_rate` matches `AudioContext.sampleRate`, play directly.
- If it differs, configure the graph to resample to browser rate, typically `48000`.
- Browser-side resampling remains a later enhancement.

For FM listening, the recommended target is `48000 Hz` mono float audio from the graph.

## Persistent Audio Session Store

The store/service layer between runtime binding and the renderer is implemented in:

- `src/features/application/audio/audio-session-store.ts`

Responsibilities:

- create or reuse playback sessions keyed by session id and sink node id
- own the audio WebSocket subscription
- own `StudioAudioPlaybackController`
- retain playback across panel unmount/remount and view switches
- expose reactive state for:
  - `playing`
  - connection state
  - latest frame metadata
  - buffer fill
  - underrun count
  - sequence gap warnings
  - selected output device
  - volume
- expose commands:
  - `play(sessionKey, config)`
  - `pause(sessionKey)`
  - `stop(sessionKey)`
  - `setVolume(sessionKey, volume)`
  - `setOutputDevice(sessionKey, deviceId)`
  - `syncRuntime(sessionKey, runtimeBinding)`
  - `cleanupMissingSessions(activeSessionKeys)`

State is keyed by the control-plane session id plus Studio node instance id. If the same graph is restarted with a new session id, the previous audio session is stopped and a fresh one is created.

The store prefers latest-runtime metadata when endpoint, sample rate, or channel count changes. A changed endpoint reconnects. A changed sample rate/channel count recreates or reconfigures the audio context/worklet.

## Device Selection

The panel exposes output devices through `navigator.mediaDevices.enumerateDevices()`.

Implementation notes:

- device labels are often hidden until the page has media permission
- call `getUserMedia({ audio: true })` once if labels are unavailable, then stop the tracks
- use `HTMLMediaElement.setSinkId()` when available
- route the Web Audio graph through a hidden media element if needed for `setSinkId`
- when `setSinkId` is unavailable, show only default output and disable selection

The UI handles:

- default output
- selected device disappears
- permission denied
- unsupported browser API

## Audio Panel UI

`AudioLiveRenderer` is the live renderer.

Files:

- `src/features/workspace/renderers/audio-live-renderer.tsx`
- `src/features/application/audio/audio-playback-controller.ts`
- `src/features/application/audio/audio-worklet-processor.js`

Controls:

- mute / unmute button
- volume slider, `0` to `1`, default `0.8`
- output device select
- buffer/underrun status
- connection state

The audio session starts from the live audio panel path and remains controlled by the browser's `AudioContext` policy.

The panel renderer does not directly own the WebSocket subscription or `AudioContext`. It subscribes to the persistent audio session store and dispatches commands. This allows playback to continue when switching back to graph view.

## Native Tests

Current C++ coverage includes `qa_StudioAudioSink`; keep it covering:

- block registration
- parameter reflection
- frame header encoding
- interleaved float payload layout
- clipping behavior
- partial input accumulation
- stop unblocks websocket service

## Frontend Tests

Current TypeScript coverage includes:

- binary frame parsing
- invalid frame rejection
- sequence gap detection
- binding resolution for `StudioAudioSink`
- audio session store lifecycle

The AudioWorklet itself stays small and keeps browser-specific behavior isolated.

## Remaining Work

- Validate the full FM graph at mono `48000 Hz` for sustained playback.
- Decide whether the renderer needs an explicit play/pause affordance in addition to mute.
- Add browser-side resampling only if non-48000 Hz sources become a real workflow requirement.
- Decide whether stereo FM should be supported immediately or after mono playback is stable.

## Validation Flowgraph

Initial FM validation uses:

```text
RF source
-> channel select / decimate
-> quadrature demod
-> deemphasis
-> audio low-pass
-> resampler to 48000
-> StudioAudioSink<float>
```

Expected checks:

- no Soapy overflows caused by audio sink
- stable playback for at least 10 minutes
- buffer fill remains bounded
- volume control has no graph-side effect
- output device switching does not restart the GR4 session
- graph stop closes the WebSocket cleanly

## Open Decisions

- Whether browser-side resampling is required for non-48000 Hz audio.
- Whether stereo FM should be enabled before or after mono playback is validated for longer sessions.
- Whether audio frames should carry stream time tags once GR4 tag propagation is reliable for this path.
