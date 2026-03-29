import { toDisambiguatedShortBlockName, toShortBlockName } from '../../graph-editor/model/presentation';

type PanelTitleSourceNode = {
  instanceId: string;
  blockTypeId: string;
  displayName: string;
};

export function buildDisambiguatedPanelTitles(
  nodes: readonly PanelTitleSourceNode[],
): Map<string, string> {
  const baseCounts = nodes.reduce((acc, node) => {
    const base = toShortBlockName(node.displayName, node.blockTypeId);
    acc.set(base, (acc.get(base) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());

  return new Map(
    nodes.map((node) => {
      const base = toShortBlockName(node.displayName, node.blockTypeId);
      const title =
        (baseCounts.get(base) ?? 0) > 1
          ? toDisambiguatedShortBlockName(node.displayName, node.blockTypeId)
          : base;
      return [node.instanceId, title];
    }),
  );
}
