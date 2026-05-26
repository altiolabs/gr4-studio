# Studio Audio Playback Implementation Plan

## Goal

Allow FM listening directly in Studio from a GR4 flowgraph.

The current `StudioAudioMonitor<float>` is a waveform snapshot monitor. It keeps a bounded sample window and exposes JSON over HTTP. It is not suitable for real-time playback because it has no clocked audio stream, no browser playback buffer, no device routing, and no underrun handling.

The playback path should be implemented as a live audio sink family, not by polling JSON windows.

## Target UX

Audio panels should provide:

- play / pause control
- volume slider
- playback device selection
- current state: disconnected, buffering, playing, underrun, stalled
- basic audio level indicator

Device selection should use browser output-device APIs when available. On browsers without selectable output support, Studio should show the default output device only and keep playback functional.

## Architecture

Add a new sink:

- `gr::studio::StudioAudioSink<float>`

Keep `StudioAudioMonitor<float>` as a waveform/debug monitor. Do not overload it with playback semantics.

The audio sink should use WebSocket transport with binary frames. HTTP polling is a poor fit for playback because request cadence, JSON parsing, and buffering jitter will cause audible gaps.

Playback ownership must live above the audio panel renderer. The audio panel is a control/status surface only. If the panel owns the WebSocket and `AudioContext`, playback stops when the user switches back to graph editing or when the panel is temporarily unmounted. For FM listening, playback lifecycle should be tied to the runtime session and sink node, not to panel visibility.

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

The service should tear down playback when the graph stops, the session is deleted, the sink node disappears, or the user explicitly pauses/stops playback. It should not tear down merely because the workspace switches between Graph and Application views.

Recommended flowgraph placement for FM:

```text
... -> QuadratureDemod -> audio filtering/deemphasis -> resampler -> StudioAudioSink<float>
```

The sink should expect normalized mono or interleaved float audio in roughly `[-1, 1]`.

## Native Block

Create `StudioAudioSink<float>` in `blocks/studio/include/gnuradio-4.0/studio/StudioAudioSink.hpp`.

Suggested parameters:

- `transport`: enum or string, initially `websocket`
- `endpoint`: listen URL/path
- `sample_rate`: input audio sample rate in Hz
- `channels`: interleaved channel count
- `frame_ms`: audio packet duration, default `20`
- `buffer_ms`: suggested client buffer target, default `120`
- `gain`: optional server-side gain, default `1.0`
- `clip`: clamp samples to `[-1, 1]`, default `true`
- `topic`: optional stream topic

Supported type:

- `float` only for the first implementation

Frame sizing:

```text
samples_per_frame = sample_rate * frame_ms / 1000
payload_samples = samples_per_frame * channels
```

The block should accumulate incoming samples until a complete audio frame is available, then publish one binary WebSocket message. It must consume all input samples, but it should not build an unbounded outbound queue. If clients are slow, prefer latest/limited buffering over blocking the scheduler.

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

Add this contract to `docs/studio-blocks-payload-contracts.md` as `audio-float32-binary-v1`.

## Runtime Binding

Update `src/features/graph-editor/runtime/known-block-bindings.ts`:

- add exact block IDs for `StudioAudioSink<float32>` and `StudioAudioSink<float>`
- family: `audio`
- supported transport: `websocket`
- payload format: `audio-float32-binary-v1`
- parameters: `transport`, `endpoint`, `sample_rate`, `channels`, `topic`

Update runtime binding tests for descriptor-driven audio streams.

The current audio monitor binding can remain as `audio-window-json-v1`, but the playback renderer should prefer `StudioAudioSink` for live audio.

## Frontend Runtime

Add an audio WebSocket runtime:

- parse `audio-float32-binary-v1`
- validate magic/version/sample type/channels/sample rate/frame count
- expose normalized `Float32Array` chunks to the playback engine
- track sequence gaps and stalled streams

Suggested files:

- `src/features/application/audio/runtime/audio-websocket-runtime.ts`
- `src/features/application/audio/runtime/audio-frame.ts`
- tests beside those files

The runtime should not render UI directly. It should feed a playback controller.

## Browser Playback Engine

Use `AudioWorklet` for stable low-latency playback.

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
- If it differs, first implementation may require the flowgraph to resample to browser rate, typically `48000`.
- Add browser-side resampling only after the direct path is stable.

For FM listening, the recommended first target is `48000 Hz` mono float audio from the graph.

## Persistent Audio Session Store

Add a store/service layer between runtime binding and the renderer.

Suggested file:

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

State should be keyed by the control-plane session id plus Studio node instance id. If the same graph is restarted with a new session id, the previous audio session should be stopped and a fresh one should be created.

The store should prefer latest-runtime metadata when endpoint, sample rate, or channel count changes. A changed endpoint should reconnect. A changed sample rate/channel count should recreate or reconfigure the audio context/worklet.

## Device Selection

The panel should expose output devices through `navigator.mediaDevices.enumerateDevices()`.

Implementation notes:

- device labels are often hidden until the page has media permission
- call `getUserMedia({ audio: true })` once if labels are unavailable, then stop the tracks
- use `HTMLMediaElement.setSinkId()` when available
- route the Web Audio graph through a hidden media element if needed for `setSinkId`
- when `setSinkId` is unavailable, show only default output and disable selection

The UI should handle:

- default output
- selected device disappears
- permission denied
- unsupported browser API

## Audio Panel UI

Replace `AudioPlaceholderRenderer` with a real renderer.

Suggested files:

- `src/features/workspace/renderers/audio-live-renderer.tsx`
- `src/features/application/audio/audio-playback-controller.ts`
- `src/features/application/audio/audio-worklet-processor.js`

Controls:

- play / pause button
- volume slider, `0` to `1`, default `0.8`
- output device select
- buffer/underrun status
- small level meter

Do not autoplay sound on graph start. Browser policy requires user interaction before starting an `AudioContext`, and surprising audio playback is bad UX.

The panel renderer must not directly own the WebSocket subscription or `AudioContext`. It should subscribe to the persistent audio session store and dispatch commands. This allows playback to continue when switching back to graph view.

## Native Tests

Add C++ tests for:

- block registration
- parameter reflection
- frame header encoding
- interleaved float payload layout
- clipping behavior
- partial input accumulation
- stop unblocks websocket service

## Frontend Tests

Add TypeScript tests for:

- binary frame parsing
- invalid frame rejection
- sequence gap detection
- binding resolution for `StudioAudioSink`
- device selection fallback behavior
- playback controller buffer state transitions

The AudioWorklet itself should keep logic small enough to test with a plain ring-buffer helper outside browser APIs.

## Implementation Order

1. Add the native `StudioAudioSink<float>` block with binary WebSocket frames.
2. Register the block and add C++ tests for frame layout and lifecycle.
3. Add Studio binding metadata and runtime binding tests.
4. Add the binary audio frame parser and tests.
5. Add an `AudioWorklet` ring-buffer playback path.
6. Add a persistent runtime audio session store keyed by session id and sink node id.
7. Replace the placeholder audio renderer with playback controls backed by the persistent store.
8. Add output device enumeration and fallback behavior.
9. Add lifecycle cleanup on graph stop/session delete/node removal.
10. Validate with an FM graph at mono `48000 Hz`.

## Validation Flowgraph

Initial FM validation should use:

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

- Whether to keep `StudioAudioMonitor` visible as a waveform-only block or rename it later to avoid confusion.
- Whether browser-side resampling is required for non-48000 Hz audio.
- Whether stereo FM should be handled initially or deferred until mono playback is stable.
- Whether audio frames should carry stream time tags once GR4 tag propagation is reliable for this path.
