import { toShortBlockName } from '../../graph-editor/model/presentation';

type PanelTitleSourceNode = {
  instanceId: string;
  blockTypeId: string;
  displayName: string;
};

export function buildDisambiguatedPanelTitles(
  nodes: readonly PanelTitleSourceNode[],
): Map<string, string> {
  return new Map(
    nodes.map((node) => {
      return [node.instanceId, toShortBlockName(node.displayName, node.blockTypeId)];
    }),
  );
}
