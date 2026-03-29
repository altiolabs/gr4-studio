# Studio Blocks Payload Contracts

This document describes the payload shapes used by the Studio block rendering paths in `gr4-studio`.

Related architecture doc:

- `docs/studio-blocks-architecture.md`

## Scope

- scalar series payload
- `series2d-xy-json-v1`
- `dataset-xy-json-v1`

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

- `payloadFormat=series-window-json-v1` routes to the scalar timeseries parser.

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

- `payloadFormat=series2d-xy-json-v1` routes to the vector XY parser.

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

Frontend routing:

- `payloadFormat=dataset-xy-json-v1` routes to the dataset XY parser, then into the existing vector XY rendering path.

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
