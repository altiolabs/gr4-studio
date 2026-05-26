# Display Application Popout Implementation

## Current Behavior

Studio can render the runtime display application in three modes stored in graph document `metadata.application`:

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

Supported modes:

- `in_app`: Run switches the center view to the in-app display.
- `new_tab`: Run opens an application-only display route.
- `popout`: Run opens an application-only display route in a popup/window.

The center **In-app** tab is only shown when mode is `in_app`. In `new_tab` or `popout` mode, the display is treated as a separate client rather than a Studio editor tab.

In Electron, both `new_tab` and `popout` currently open a separate native `BrowserWindow`; Electron does not provide browser-style tabs by default. In a browser, `new_tab` uses `_blank` and `popout` uses popup window features.

## User Workflow

The display mode selector lives near the runtime controls. Running a graph uses the selected mode:

- `In-app`: starts the session and switches to the in-app display.
- `New tab`: starts the session and opens the display route.
- `Popout`: starts the session and opens a popup/window.

When a running session already exists, **Open Display** reopens a display client without rerunning or replacing the graph. Run remains the action for creating, starting, or replacing the runtime session.

Closing a display tab/window does not stop or delete the flowgraph session. Session lifecycle remains owned by the main Studio runtime controls.

## Application-Only Route

The display client route is:

```text
/app-runtime/:launchId
```

This route renders only the runtime display application:

- no graph tabs
- no block catalog
- no graph editor
- no inspector
- no document persistence UI

The route renders `ApplicationView` from a launch snapshot and polls the referenced session state through existing session APIs.

## Launch Snapshot

Launching a separate display writes a frontend launch snapshot with only the data needed by the display client:

- source graph tab id
- session id
- execution state at launch
- visible Studio panel entries
- rendered layout
- plot palettes and resolved binding data
- optional title

The snapshot intentionally excludes graph editor mutation callbacks, document handles, file persistence state, and graph editing state.

For browser/WASM-compatible contexts, the snapshot is stored in web storage under a generated `launchId`. For Electron, the renderer also passes the snapshot through preload IPC to the main process, and the display window can read it back through IPC. This avoids relying on storage partition behavior for native windows.

## Electron Path

Electron exposes:

```ts
gr4StudioShell.openDisplayApplication({ launchId, mode, title, snapshot })
gr4StudioShell.getDisplayApplicationLaunchSnapshot(launchId)
```

The main process creates a second `BrowserWindow` for display clients and loads `/app-runtime/:launchId`.

The desktop app server rewrites built `index.html` asset URLs from relative `./assets/...` paths to root-relative `/assets/...` paths when serving through the local app server. This is required because `/app-runtime/:launchId` is a nested route, and otherwise the browser resolves the bundle path under `/app-runtime/assets/...`.

## Runtime-Local Control Lifecycle

The display application does not own graph editor state:

- application-only route does not call editor store mutation APIs
- application-only route does not mark the graph document dirty
- application-only route does not update graph variables or graph parameters
- in-app display also stops variable-control editor mutation while the graph is running
- parameter-bound controls continue to write to the running session via block settings APIs when valid
- variable-bound controls use local display state when no graph-editor update callback is provided

If graph-level persistence of changed controls is needed later, add an explicit "Apply to graph" workflow.

## Session Lifecycle

The display application is keyed by session id:

- running session: plots and runtime parameter controls are active
- stopped/error/deleted session: display shows inactive/error state and remains readable
- parent editor tab closes: display can remain open until the session ends
- rerun/replacement session: launch a fresh display application
- closing the display tab/window: does not stop or delete the session

## Remaining Follow-Ups

- Decide whether to hide or relabel `new_tab` in Electron, since it currently opens another native window like `popout`.
- Add stronger runtime validation/schema for launch snapshot payloads.
- Add explicit launch snapshot cleanup/expiry.
- Add optional coordination for reusing/updating an existing display window.
- Add optional variable-control mapping to explicit runtime parameter updates.
- Add broader tests for StudioPage run branching and runtime-local control behavior.
