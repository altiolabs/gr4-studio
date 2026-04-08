# Studio WebSocket Integration

This note describes the pattern Studio uses for websocket-enabled sink blocks and the checks to follow when adding websocket transport to another sink family.

Current websocket-enabled Studio sinks:

- `StudioPowerSpectrumSink`
- `StudioWaterfallSink`

## Core rules

- The block owns the data plane.
- Transport must be explicit via the sink's `transport` parameter.
- Studio must not infer websocket support from the endpoint string.
- The control plane stays session/block focused and does not own streaming.
- Binding is keyed by exact reflected block ID.

## Native block checklist

1. Add `websocket` as an explicit supported transport for the sink family.
2. Keep the listen address in the block's `endpoint` parameter.
3. Parse the endpoint into host, port, and path inside the block.
4. Start the websocket listener from the block lifecycle, not from the control plane.
5. Keep `http_poll` working unchanged.
6. Make `settingsChanged()` cheap enough for immediate runtime updates.
7. Only restart transport when the sink is already running and the transport or endpoint actually changed.
8. Keep transport-specific state inside the block or a sink-local helper.
9. Emit one complete frame per websocket message.
10. Prefer latest-frame-wins behavior over unbounded queueing.
11. Use `update_ms` as the live websocket cadence gate if the sink needs explicit rate limiting.

## Frame format guidance

- If the payload is naturally tabular numeric data, a binary websocket frame is usually the best fit.
- If the existing payload is already canonical JSON and the update rate is moderate, a JSON websocket frame is acceptable.
- Keep the frame contract sink-specific; do not generalize all websocket sinks into a single shared payload format.
- If the sink exposes `update_ms`, wire it into the websocket send path in the same way as the existing Studio power spectrum and waterfall sinks.

## Frontend checklist

1. Add the exact reflected block ID to `src/features/graph-editor/runtime/known-block-bindings.ts`.
2. Declare the sink family, supported transports, and payload format explicitly.
3. Route the sink through the runtime/parser that matches its payload contract.
4. Keep the parser responsible for validation and normalization.
5. Keep the renderer focused on normalized plot frames.
6. Add focused tests for binding resolution, transport selection, and payload parsing.

## Validation checklist

- Native bind starts and remains reachable on the configured port.
- Browser or CLI websocket client can complete the handshake.
- A first frame arrives without a runtime error.
- Live transport changes do not stall startup.
- `http_poll` remains functional if the sink supports it.

## Current examples

- Power spectrum uses binary websocket frames for dense numeric spectra.
- Waterfall uses JSON websocket frames for bounded FFT-history snapshots.
- Both use `update_ms` as the live send cadence while preserving a first-frame-immediate startup path.

Use those two blocks as the reference implementations when adding websocket support to another sink family.
