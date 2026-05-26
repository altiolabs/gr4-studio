# Display Application Popout Plan

## Goal

Make the Studio display application open either in the main Studio window, a browser tab, or a popup-style window while keeping its runtime lifecycle local to the running graph session.

The display application must not own graph editor state. While a graph is running, controls in the display application should maintain local UI state and write only to the active runtime session when a control is bound to a runtime parameter.

## Principles

- Keep the authored graph and the running display application separate.
- Do not add control-plane streaming or new backend endpoints.
- Use existing session and block settings APIs.
- Treat `metadata.application` as presentation intent, not execution state.
- Keep browser, Electron, and WASM paths explicit.

## Runtime Display Contract

Status: mostly done.

Add a frontend launch snapshot containing only what an application-only window needs:

- [x] source graph tab id
- [x] session id
- [x] execution state at launch
- [x] visible Studio panel entries
- [x] rendered layout
- [x] plot palettes and resolved binding data
- [x] optional title
- [ ] stronger runtime validation/schema for launch snapshot payloads
- [ ] explicit launch snapshot cleanup/expiry

The snapshot must not contain editor callbacks, graph mutation handlers, document handles, or file persistence state.

## Persisted Display Mode

Status: done for initial modes.

Use the existing graph document field:

```json
{
  "metadata": {
    "application": {
      "mode": "in_app",
      "renderer": "react",
      "title": "Application"
    }
  }
}
```

Supported initial modes:

- [x] `in_app`: run graph, then switch the center view to Application.
- [x] `new_tab`: run graph, then open the application-only route in a browser tab.
- [x] `popout`: run graph, then open the application-only route in a popup-style browser window.
- [x] Electron-native `BrowserWindow` mapping for `popout`.

## Application-Only Route

Status: done for browser route.

Add a route like:

```text
/app-runtime/:launchId
```

This route renders only the display application:

- [x] no graph tabs
- [x] no block catalog
- [x] no graph editor
- [x] no inspector
- [x] no document persistence UI

The route reads the launch snapshot by `launchId`, renders `ApplicationView`, and tracks the referenced session state through existing session APIs.

## Browser Launch Handoff

Status: done for initial browser/WASM-compatible path.

For browser and WASM-compatible paths:

- [x] write the launch snapshot into web storage under a generated `launchId`
- [x] open `/app-runtime/:launchId`
- [x] let the opened route read the snapshot
- [x] reserve a window immediately on Run click to reduce popup blocking
- [ ] add `BroadcastChannel` or equivalent coordination if existing display windows should update in place

Storage is a handoff mechanism only. It is not authoritative runtime state.

## Electron Launch Path

Status: done for initial native popout.

Initial implementation can use the same browser `window.open` path. A later Electron-specific slice should expose a preload API such as:

```ts
gr4StudioShell.openDisplayApplication({ launchId, mode, title })
```

The Electron main process should create a second `BrowserWindow` for `popout`.

Done:

- [x] exposed `gr4StudioShell.openDisplayApplication(...)` through preload
- [x] added main-process IPC for display application windows
- [x] opens `/app-runtime/:launchId` in a second Electron `BrowserWindow`
- [x] keeps browser `window.open` fallback for non-Electron contexts

## Runtime-Local Control Lifecycle

Status: partially done.

In the application-only route:

- [x] application-only route does not call editor store mutation APIs
- [x] application-only route does not mark the graph document dirty
- [x] application-only route does not update graph variables or graph parameters
- [x] in-app Application view also stops variable-control editor mutation while the graph is running
- [x] parameter-bound controls continue to write to the running session via block settings APIs when valid
- [x] variable-bound controls use a local display-state store when no graph-editor update callback is provided
- [ ] optional future mapping from variable-bound controls to explicit runtime parameter updates

If graph-level persistence of changed controls is needed later, add an explicit "Apply to graph" workflow.

## Session Lifecycle

Status: partially done.

The display application should be keyed by session id:

- [x] running session: plots and runtime parameter controls are active
- [x] stopped/error/deleted session: show inactive/error state and keep the display readable
- [x] parent editor tab closes: display can remain open until the session ends
- [x] rerun/replacement session: launch a fresh display application
- [ ] add explicit stale/expired launch snapshot UI beyond the current missing-snapshot state
- [ ] add optional coordination for reusing/updating an existing display window

## Implementation Order

1. [x] Add persisted display mode setter and compact UI.
2. [x] Make `runTab` return a typed result.
3. [x] Switch to the Application view after successful `in_app` runs.
4. [x] Add launch snapshot storage and `/app-runtime/:launchId`.
5. [x] Open `new_tab` and browser `popout` after successful runs.
6. [x] Keep application-only controls runtime-local by omitting editor mutation callbacks.
7. [x] Add Electron-native popout IPC/window creation.
8. [ ] Add broader tests for run branching and runtime-local controls.
9. [x] Add tests for persistence and launch snapshot handoff.
