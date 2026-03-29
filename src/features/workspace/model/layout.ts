import {
  buildColumnLayoutRoot,
  collectLayoutPaneIds,
  normalizeStudioLayoutSpec,
} from '../../graph-document/model/studio-layout';
import type { StudioLayoutSpec, StudioPanelSpec } from '../../graph-document/model/studio-workspace';

export function buildDefaultStudioLayout(panels: readonly StudioPanelSpec[]): StudioLayoutSpec {
  const panelIds = panels.map((panel) => panel.id);
  return normalizeStudioLayoutSpec({
    version: 2,
    root: buildColumnLayoutRoot(panelIds),
    activePanelId: panelIds[0],
  });
}

export function buildEffectiveStudioLayout(
  savedLayout: StudioLayoutSpec | undefined,
  panels: readonly StudioPanelSpec[],
): StudioLayoutSpec {
  const panelIds = panels.map((panel) => panel.id);
  if (!savedLayout) {
    return buildDefaultStudioLayout(panels);
  }
  return normalizeStudioLayoutSpec(savedLayout, panelIds);
}

export function layoutContainsPanel(layout: StudioLayoutSpec, panelId: string): boolean {
  return collectLayoutPaneIds(layout.root).includes(panelId);
}

type PanelWithId = {
  panel: {
    id: string;
  };
};

export function orderPanelEntriesForLayout<T extends PanelWithId>(
  entries: readonly T[],
  layout: StudioLayoutSpec,
): T[] {
  const entryByPanelId = new Map(entries.map((entry) => [entry.panel.id, entry]));
  const ordered: T[] = [];
  const seen = new Set<string>();

  collectLayoutPaneIds(layout.root).forEach((panelId) => {
    const entry = entryByPanelId.get(panelId);
    if (!entry) {
      return;
    }
    ordered.push(entry);
    seen.add(panelId);
  });

  entries.forEach((entry) => {
    if (seen.has(entry.panel.id)) {
      return;
    }
    ordered.push(entry);
  });

  return ordered;
}
