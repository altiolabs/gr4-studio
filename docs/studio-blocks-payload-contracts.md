# Studio Blocks Payload Contracts

This document describes the payload shapes used by the Studio block rendering paths in `gr4-studio`.

Related architecture doc:

- `docs/studio-blocks-architecture.md`

## Scope

- scalar series payload
- `series2d-xy-json-v1`
- `dataset-xy-json-v1`
- phosphor spectrum rendering on top of `dataset-xy-json-v1` via `StudioPowerSpectrumSink` with `persistence=true` and phosphor tuning via `phosphor_intensity` / `phosphor_decay_ms`
- `waterfall-spectrum-json-v1`

Non-goals:

- FFT-specific UI semantics
- control-plane transport redesign
- layout/editor-owned plot semantics

## Design rules

- UI routes by sink contract shape (`payloadFormat`), not DSP block identity.
- Runtime/parser layer owns payload validation and normalization.
- Renderer adapters receive only normalized plot frames.
- Plot metadata precedence is explicit and stable.

## Scalar series contract

`series-window-json-v1`

Expected payload fields:

- `sample_type` required, string
- `layout` required, string
- `data` required, array of per-channel arrays
- `channels` optional, number
- `samples_per_channel` optional, number

Semantics:

- `data` is channel-major series payload.
- Real scalar payloads normalize to one plotted series per logical channel.
- Complex scalar payloads normalize to two plotted series per logical channel:
  - `<base> (real)`
  - `<base> (imag)`
- Magnitude-only collapse is not the default normalization.

Frontend routing:

- `payloadFormat=series-window-json-v1` routes to the scalar timeseries parser, regardless of whether the sink is served over `http_snapshot`, `http_poll`, or websocket transport.

## Vector XY contract

`series2d-xy-json-v1`

Expected payload fields:

- `layout` required, must be `pairs_xy`
- `points` required, non-negative integer
- `data` required, array of numeric `[x,y]` pairs, length must equal `points`
- `sample_type` optional, string
- `render_mode` optional, `line | scatter`, defaults to `line`
- `point_size` optional, positive number
- `point_alpha` optional, number in `[0,1]`

Semantics:

- One XY trace represented by explicit x/y pairs.
- `render_mode=scatter` enables constellation-style XY rendering without a new plot kind.

Frontend routing:

- `payloadFormat=series2d-xy-json-v1` routes to the vector XY parser, regardless of whether the sink is served over `http_snapshot`, `http_poll`, or websocket transport.

## Dataset XY contract

`dataset-xy-json-v1`

Expected payload fields:

- `payload_format` required, must be `dataset-xy-json-v1`
- `layout` required, must be `pairs_xy`
- `points` required, non-negative integer
- `data` required, array of numeric `[x,y]` pairs, length must equal `points`
- `signal_name` optional, string
- `signal_unit` optional, string
- `axis_name` optional, string
- `axis_unit` optional, string

Semantics:

- DataSet semantics remain sink/runtime-side.
- Payload normalizes to one XY trace for plotting.
- `StudioPowerSpectrumSink` uses this contract to publish FFT frequency bins against averaged power values.
- `StudioPowerSpectrumSink` with `persistence=true` uses the same contract to publish FFT frequency bins for the live phosphor spectrum renderer. Its phosphor look is controlled by `phosphor_intensity` and `phosphor_decay_ms`.

Frontend routing:

- `payloadFormat=dataset-xy-json-v1` routes to the dataset XY parser, then into the existing vector XY rendering path.
- `StudioPowerSpectrumSink` with `persistence=true` routes through the same dataset parser, then into the GQRX-style phosphor spectrum renderer. The phosphor panel reads `phosphor_intensity` and `phosphor_decay_ms` from the block parameters.

## Waterfall spectrum contract

`waterfall-spectrum-json-v1`

Expected payload fields:

- `payload_format` required, must be `waterfall-spectrum-json-v1`
- `layout` required, must be `waterfall_matrix`
- `rows` required, non-negative integer
- `columns` required, non-negative integer
- `data` required, array of row arrays, each row length must equal `columns`
- `frequencies` optional, numeric array of bin centers, length must equal `columns` when present
- `sample_type` optional, string
- `signal_name` optional, string
- `signal_unit` optional, string
- `axis_name` optional, string
- `axis_unit` optional, string
- `fft_size` optional, positive integer
- `num_averages` optional, positive integer
- `time_span` required, positive number in seconds and quantized to `fft_size` together with `sample_rate`
- `sample_rate` required, positive number in Hz
- `history_rows` optional, derived row-count metadata preserved for compatibility
- `window` optional, string
- `output_in_db` optional, boolean
- `autoscale` optional, boolean
- `z_min` / `z_max` optional, numeric manual colormap bounds used when autoscale is disabled
- `min_value` / `max_value` optional, numeric normalization hints for the effective color range

Semantics:

- Bounded waterfall history is represented as a frequency-by-time matrix.
- `time_span` and `sample_rate` control the fixed waterfall depth on the y axis; the block quantizes the resulting duration to the configured FFT size before emitting rows.
- Unfilled history rows are emitted at the current color-range floor so they render black, but autoscale continues to use only real spectrum rows.
- The browser normalizes the matrix into a waterfall image frame.
- The block owns the bounded history and acts as the source of truth for the visualized window.
- The block also owns the color scale range:
  - when `autoscale` is true, it derives `min_value` / `max_value` from the live data
  - when `autoscale` is false, it uses `z_min` / `z_max` as the color range and mirrors that range back through `min_value` / `max_value`
- Waterfall plots do not use `x_min` / `x_max` / `y_min` / `y_max`; those ranges are reserved for non-waterfall plot kinds.
- The payload emits the effective quantized `time_span` and `sample_rate` used for the raster size.

Frontend routing:

- `payloadFormat=waterfall-spectrum-json-v1` routes to the waterfall parser, then into the waterfall canvas renderer.

Canonical fixtures:

- `src/features/application/plotting/runtime/fixtures/waterfall-contract-fixtures.ts`
- `public/demo/waterfall-spectrum-json-v1.normal.json`
- `public/demo/waterfall-spectrum-json-v1.smallest.json`
- `public/demo/waterfall-spectrum-json-v1.malformed.json`
- `public/demo/waterfall-demo.gr4s`

Phosphor spectrum validation uses the same `dataset-xy-json-v1` contract as `StudioPowerSpectrumSink` with `persistence=true`; the demo graph is `public/demo/phosphor-spectrum-demo.gr4s`.

These fixtures are used by the TS contract tests and provide canonical payload references for manual payload inspection.

## Metadata precedence

For displayed plot labels:

1. Explicit graph/block plot metadata params (`series_labels`, `x_label`, `y_label`, `plot_title`, etc.)
2. Sink payload metadata
3. Stable defaults (`chN`, `vector`, `sample`, `value`)

Layout metadata never owns these semantics.

## Current implementation map

- Contract routing: `src/features/application/plotting/runtime/timeseries-live-runtime.ts`
- Scalar parser: `src/features/graph-editor/runtime/http-time-series.ts`
- Vector/dataset parser: `src/features/application/plotting/runtime/vector-frame.ts`
- Plot metadata precedence: `src/features/application/plotting/model/panel-spec.ts`
- Visible-state derivation: `src/features/application/plotting/components/plot-visible-state.ts`

## Failure behavior

Validation failures are explicit and deterministic:

- missing required fields -> error
- wrong type/shape -> error
- unsupported layout/format tokens -> error

Runtime surface behavior:

- malformed payloads become runtime error state with actionable message
- invalid binding remains a separate invalid-binding state

Manual validation path:

1. Run the Studio dev server.
2. Open `public/demo/waterfall-demo.gr4s` in Studio.
3. Run the graph with the default waterfall endpoint settings.
4. Confirm the waterfall panel renders and scrolls.
5. Hover the waterfall to verify the readout updates.
6. To verify manual color scaling, set `autoscale=false` and adjust `z_min` / `z_max` on the sink, then confirm the waterfall colors change on the next poll.
7. To verify fixed history depth, adjust `time_span` on the sink together with `sample_rate` and confirm the waterfall keeps a fixed row count quantized to the FFT size.
8. Use the TS fixtures above to inspect the exact payload shape and error cases outside the runtime path if needed.
