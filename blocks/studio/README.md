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
- `StudioWaterfallSink`
- `StudioAudioMonitor`
- `StudioImageSink`

Notes:

- HTTP snapshot/poll semantics for series-style sinks should follow `HttpTimeSeriesSink` behavior where applicable.
- `StudioDataSetSink` exposes `dataset-xy-json-v1` payloads (`layout: pairs_xy`) for DataSet-backed visualization paths.
- `StudioPowerSpectrumSink` also exposes `dataset-xy-json-v1` payloads and is intended for FFT-based averaged power spectrum visualization.
- `StudioPowerSpectrumSink` with `persistence=true` uses the same `dataset-xy-json-v1` payload path, but the Studio UI renders it as a GQRX-style phosphor spectrum with a persistent glow behind the live trace. The phosphor look is tuned with `phosphor_intensity` and `phosphor_decay_ms`.
- `StudioWaterfallSink` exposes `waterfall-spectrum-json-v1` payloads and is intended for bounded FFT-history waterfall visualization.
- `StudioWaterfallSink` uses `time_span` together with `sample_rate` as the fixed depth controls and quantizes the resulting duration to the configured FFT size.
- `StudioWaterfallSink` emits the effective quantized `time_span` together with `sample_rate`.
- `StudioWaterfallSink` uses `autoscale`, `z_min`, and `z_max` to control the rendered colormap range.
- Waterfall rendering ignores generic `x_min` / `x_max` / `y_min` / `y_max` axis-range settings.

Native QA target:

- `qa_StudioPowerSpectrumSink`
- `qa_StudioWaterfallSink`

Notes:

- `qa_StudioPowerSpectrumSink` checks the exact `StudioPowerSpectrumSink` registration and its optional phosphor persistence metadata.

Grounded candidate commands based on the checked-in CMake layout:

1. Configure the blocks tree with testing enabled:
   - `cmake -S blocks -B build/blocks -DENABLE_TESTING=ON`
2. Build the native spectrum QA target:
   - `cmake --build build/blocks --target qa_StudioPowerSpectrumSink`
3. Build the native waterfall QA target:
   - `cmake --build build/blocks --target qa_StudioWaterfallSink`
4. Run the tests through CTest:
   - `ctest --test-dir build/blocks -R 'qa_Studio(PowerSpectrum|Waterfall)Sink' --output-on-failure`

If your local build tree uses a different path or generator, keep the target name the same and adjust `build/blocks` accordingly.
