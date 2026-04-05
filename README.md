# gr4-studio

`gr4-studio` is a browser-based Studio UI for GR4. The current codebase is a working prototype focused on graph authoring, document persistence, runtime sessions, and live panel rendering for the included Studio blocks shipped in this repo.

## Current surfaces

- `Layout Editor`: author graph tabs, inspect blocks, edit layout metadata, and manage runtime sessions.
- `Application`: render authored panel/layout state with live plot and panel renderers.

## What is implemented

- Graph editing with tabs, block catalog browsing, block properties, and runtime session controls.
- Local document save/open for `.gr4s` files, including browser file-picker support and download fallback.
- Studio-compatible first-party blocks under `blocks/studio`.
- Exact block-ID based binding lookup in `src/features/graph-editor/runtime/known-block-bindings.ts`.
- Live plotting paths for scalar series, 2D series, phosphor-spectrum mode on `StudioPowerSpectrumSink`, and DataSet-backed XY payloads.
- Placeholder renderers for panel kinds that are not fully live yet.

## Included block families

- `StudioSeriesSink`
- `Studio2DSeriesSink`
- `StudioDataSetSink`
- `StudioPowerSpectrumSink` with `persistence=true`, `phosphor_intensity`, and `phosphor_decay_ms` (Phosphor Spectrum)
- `StudioWaterfallSink`
- `StudioAudioMonitor`
- `StudioImageSink`

Current transport support for the included blocks is limited to:

- `http_snapshot`
- `http_poll`

For manual waterfall and phosphor-spectrum validation in Studio dev mode, the repo ships canonical JSON fixtures and demo graphs under `public/demo/`:

- `waterfall-spectrum-json-v1.normal.json`
- `waterfall-spectrum-json-v1.smallest.json`
- `waterfall-spectrum-json-v1.malformed.json`
- `waterfall-demo.gr4s`
- `phosphor-spectrum-demo.gr4s`

See `public/demo/README.md` for a compact index of the demo graph, payload fixtures, and native QA pointers.

Those files are canonical payload references. The easiest in-Studio validation path for the waterfall is still a normal graph containing `SignalGenerator<float32> -> StudioWaterfallSink<float32>` and running it with the default HTTP settings.

The quickest phosphor-spectrum validation path is a normal graph containing `SignalGenerator<float32> -> StudioPowerSpectrumSink<float32>` with `persistence=true`, `phosphor_intensity`, and `phosphor_decay_ms`, then running it with the default HTTP settings.

The quickest end-to-end manual workflow is:

1. Run the Studio dev server with `npm run dev`.
2. Open `public/demo/phosphor-spectrum-demo.gr4s` from the Studio file open dialog.
3. Start the graph with the normal Run control.
4. Confirm the phosphor spectrum panel appears with a live trace and colored persistence behind it.
5. Hover the plot to verify the frequency/bin/value readout updates.

Successful behavior looks like:

- a visible `Phosphor Spectrum` panel
- crisp current spectrum line on top of a colored persistence field
- `phosphor_intensity` controls how brightly new energy stamps into the field
- `phosphor_decay_ms` controls how long the phosphor field persists before fading
- hover readout showing bin, frequency, and value
- if you toggle `autoscale=false` and adjust `y_min` / `y_max`, the spectrum y-range should update on the next live poll
- the current spectrum continues to use the exact dataset payload path from `StudioPowerSpectrumSink`

Common failure modes:

- no phosphor panel: the exact `StudioPowerSpectrumSink` block was not recognized, `persistence=true` was not set, or the graph was not started
- blank or stale history: the runtime session is not running, or the configured HTTP endpoint is not responding
- malformed payload error: the sink emitted a payload that does not match `dataset-xy-json-v1`

The block architecture and payload contracts are documented in:

- `docs/studio-blocks-architecture.md`
- `docs/studio-blocks-payload-contracts.md`

## Backend contract

The control plane base URL is configurable in `.env.example` and defaults to `http://localhost:8080`.

Used endpoints:

- `GET /blocks`
- `GET /blocks/{id}`
- `POST /sessions`
- `GET /sessions`
- `GET /sessions/{id}`
- `POST /sessions/{id}/start`
- `POST /sessions/{id}/stop`
- `POST /sessions/{id}/restart`
- `DELETE /sessions/{id}`

Not used:

- graph resources
- graph/session diagnostics endpoints
- history/event-stream/SSE

## Environment

```env
VITE_CONTROL_PLANE_BASE_URL=http://localhost:8080
```

Runtime config is centralized in `src/lib/config.ts`.

## Run

### Native

1. `npm install`
2. `npm run dev`
3. open `http://localhost:5173`

### Docker

```bash
docker compose -f docker-compose.dev.yml up --build
```

Docker dev uses `VITE_CONTROL_PLANE_BASE_URL=http://host.docker.internal:8080`.

## Document format

- `GraphDocument` is the canonical editor save/load format.
- The app reads and writes canonical JSON via the `.gr4s` Studio document format.

## Runtime Model (Per Tab)

Each graph tab stores session-centric runtime state only:

- `sessionId`
- `session`
- `lastSubmittedHash`
- `lastAction`
- `busy`
- `lastError`

Run/Stop correctness is polling-first:

- after create/start/stop/restart, Studio polls `GET /sessions/{id}` until stable (`running`, `stopped`, or `error`)
- backend session state is authoritative
- stale async completions are guarded in the runtime store

## Graph Submission Boundary

Run flow:

1. current editor state -> `GraphDocument`
2. `GraphDocument` -> deterministic inline GRC text (`toGrctrlContentSubmission`)
3. content hash is computed for drift detection
4. if no session or graph content changed, create a new session with `{ name, grc }`
5. start session
6. poll session state to convergence

## UI Surfaces

<p align="center">
  <img src="public/studio-screenshot-1.png" alt="gr4-studio graph designer"><br>
  <em>Studio Graph Layout</em>
</p>

<p align="center">
  <img src="public/studio-screenshot-2.png" alt="gr4-studio graph designer"><br>
  <em>Studio Application Runtime</em>
</p>



- Center: graph editor canvas
- Top-right: execution overlay (Run/Stop + restart/refresh/delete secondary controls)
- Right sidebar inspector tabs:
  - Selection
  - Graph (local graph + submission/run-intent state)
  - Session (linked session metadata + local runtime activity)
- Sessions drawer: list/start/stop/restart/delete sessions and link/unlink to active tab

## Notes / Current Limits

- Graph edits are local until Run submits a snapshot.
- Linked session may represent an older snapshot when graph drift is present.
- Events tab was removed for this backend phase because no history/stream endpoint exists.
- AI tools were used in the development of this codebase

## License and Copyright
This project is licensed under the GNU General Public License v3.0 or later (GPL-3.0-or-later).  

Unless otherwise noted: SPDX-License-Identifier: GPL-3.0-or-later

Copyright (C) Josh Morman, Altio Labs, LLC

See the LICENSE file for the full license text.
