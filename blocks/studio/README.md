# Studio Blocks Module

This folder hosts the Studio-specific GR4 block implementations.

Current constraints:

- exact fully qualified reflected block IDs are the Studio compatibility key
- data plane is owned by each block
- transport is explicit block configuration
- rendering behavior lives outside this module

Current included blocks:

- `StudioSeriesSink`
- `Studio2DSeriesSink`
- `StudioDataSetSink`
- `StudioPowerSpectrumSink`
- `StudioAudioMonitor`
- `StudioImageSink`

Notes:

- HTTP snapshot/poll semantics for series-style sinks should follow `HttpTimeSeriesSink` behavior where applicable.
- `StudioDataSetSink` exposes `dataset-xy-json-v1` payloads (`layout: pairs_xy`) for DataSet-backed visualization paths.
- `StudioPowerSpectrumSink` also exposes `dataset-xy-json-v1` payloads and is intended for FFT-based averaged power spectrum visualization.
