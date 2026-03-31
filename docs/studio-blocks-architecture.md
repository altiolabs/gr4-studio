# Studio Blocks Architecture

This document describes the Studio-specific block architecture used by `gr4-studio`.

Current implementation lives in:

- `blocks/studio`
- `src/features/graph-editor/runtime/known-block-bindings.ts`
- `src/features/application/plotting/runtime/timeseries-live-runtime.ts`

## Purpose

`gr4-studio` ships first-party Studio-oriented GR4 runtime blocks in-tree.
The app recognizes those blocks by exact reflected block ID and binds them to Studio-specific UI behavior.

This architecture keeps three concerns separate:

- the block owns the data plane
- Studio owns binding and rendering policy
- the control plane stays minimal and session-focused

## Compatibility key

Studio compatibility is keyed by exact fully qualified reflected block ID.

Rules:

- exact ID match only
- no fuzzy matching
- no alias fallback
- no generic metadata assumption

## Current included families

- `StudioSeriesSink`
- `Studio2DSeriesSink`
- `StudioDataSetSink`
- `StudioPowerSpectrumSink`
- `StudioAudioMonitor`
- `StudioImageSink`

The code currently registers concrete type variants for each family, for example:

- `gr::studio::StudioSeriesSink<...>`
- `gr::studio::Studio2DSeriesSink<...>`
- `gr::studio::StudioDataSetSink<...>`
- `gr::studio::StudioPowerSpectrumSink<...>`
- `gr::studio::StudioAudioMonitor<...>`
- `gr::studio::StudioImageSink<...>`

See `src/features/graph-editor/runtime/known-block-bindings.ts` for the exact reflected IDs currently enabled.

## Transport configuration

Transport is an explicit block parameter, typically `transport`.

Current supported transport modes for the included blocks:

- `http_snapshot`
- `http_poll`

Reserved for future expansion:

- `zmq_sub`
- `websocket`

Rules:

- each block family supports only a subset of valid transports
- do not assume all combinations are valid
- validate parameters locally, not authoritatively

## Standard parameters

The current registry resolves these parameter names where relevant:

- `transport`
- `endpoint`
- `poll_ms`
- `sample_rate`
- `channels`
- `topic`

Not every family uses every parameter. Parameter usage is explicit per block family.

## Data plane ownership

The block owns its data plane interface.

Implications:

- transport endpoints are defined by block parameters
- Studio binds directly to block-defined interfaces
- control plane stays separate from streaming

## HTTP behavior

Where HTTP snapshot/polling is used, model behavior after `HttpTimeSeriesSink` from the GR4 incubator codebase.

## Binding and rendering

Studio binding resolves the block family and payload format.
Rendering is handled separately:

- scalar series -> live `series` renderer path
- `series2d-xy-json-v1` and `dataset-xy-json-v1` -> XY/vector plot path
- `StudioPowerSpectrumSink` uses the `dataset-xy-json-v1` path for FFT-based spectrum rendering
- image and audio panel kinds -> separate renderers

Payload details live in:

- `docs/studio-blocks-payload-contracts.md`
