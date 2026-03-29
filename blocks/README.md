# Studio-Compatible GR4 Blocks

This directory contains the first-party Studio-compatible GR4 runtime blocks that ship with `gr4-studio`.

Current families in `blocks/studio`:

- `StudioSeriesSink`
- `Studio2DSeriesSink`
- `StudioDataSetSink`
- `StudioAudioMonitor`
- `StudioImageSink`

Current transport support for these included blocks is limited to:

- `http_snapshot`
- `http_poll`

Binding and payload conventions are documented in:

- `docs/studio-blocks-architecture.md`
- `docs/studio-blocks-payload-contracts.md`
