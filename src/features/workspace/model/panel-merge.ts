import type { StudioPanelSpec } from '../../graph-document/model/studio-workspace';

type MergeStudioPanelsInput = {
  savedPanels?: readonly StudioPanelSpec[];
  derivedPanels: readonly StudioPanelSpec[];
};

export function mergeSavedAndDerivedStudioPanels({
  savedPanels,
  derivedPanels,
}: MergeStudioPanelsInput): StudioPanelSpec[] {
  const derivedPanelIds = new Set(derivedPanels.map((panel) => panel.id));
  const derivedNodeIds = new Set(derivedPanels.map((panel) => panel.nodeId));
  const saved = savedPanels
    ? savedPanels.filter(
        (panel) =>
          panel.kind === 'control' ||
          (derivedPanelIds.has(panel.id) && derivedNodeIds.has(panel.nodeId)),
      )
    : [];
  const savedNodeIds = new Set(saved.map((panel) => panel.nodeId));
  const savedPanelIds = new Set(saved.map((panel) => panel.id));

  const derivedGaps = derivedPanels.filter(
    (panel) => !savedNodeIds.has(panel.nodeId) && !savedPanelIds.has(panel.id),
  );

  return [...saved, ...derivedGaps];
}
