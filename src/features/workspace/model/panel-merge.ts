import type { StudioPanelSpec } from '../../graph-document/model/studio-workspace';

type MergeStudioPanelsInput = {
  savedPanels?: readonly StudioPanelSpec[];
  derivedPanels: readonly StudioPanelSpec[];
};

export function mergeSavedAndDerivedStudioPanels({
  savedPanels,
  derivedPanels,
}: MergeStudioPanelsInput): StudioPanelSpec[] {
  const saved = savedPanels ? [...savedPanels] : [];
  const savedNodeIds = new Set(saved.map((panel) => panel.nodeId));
  const savedPanelIds = new Set(saved.map((panel) => panel.id));

  const derivedGaps = derivedPanels.filter(
    (panel) => !savedNodeIds.has(panel.nodeId) && !savedPanelIds.has(panel.id),
  );

  return [...saved, ...derivedGaps];
}
