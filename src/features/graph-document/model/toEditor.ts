import type { EditorGraphEdge, EditorGraphNode } from '../../graph-editor/model/types';
import type { ApplicationSpec, StudioLayoutSpec, StudioPanelSpec, StudioPlotPaletteSpec } from './studio-workspace';
import type { GraphDocument } from './types';

type EditorGraphReplacement = {
  metadata: {
    name: string;
    description?: string;
    studioPanels?: StudioPanelSpec[];
    studioLayout?: StudioLayoutSpec;
    studioPlotPalettes?: StudioPlotPaletteSpec[];
    application?: ApplicationSpec;
  };
  nodes: EditorGraphNode[];
  edges: EditorGraphEdge[];
};

export function editorGraphFromDocument(document: GraphDocument): EditorGraphReplacement {
  return {
    metadata: {
      name: document.metadata.name,
      description: document.metadata.description,
      studioPanels: document.metadata.studio?.panels,
      studioLayout: document.metadata.studio?.layout,
      studioPlotPalettes: document.metadata.studio?.plotPalettes,
      application: document.metadata.application,
    },
    nodes: document.graph.nodes.map((node) => ({
      instanceId: node.id,
      blockTypeId: node.blockType,
      displayName: node.title ?? node.blockType,
      category: undefined,
      position: {
        x: node.position.x,
        y: node.position.y,
      },
      parameters: Object.entries(node.parameters).reduce(
        (acc, [name, value]) => {
          acc[name] = { value: value.value };
          return acc;
        },
        {} as Record<string, { value: string }>,
      ),
    })),
    edges: document.graph.edges.map((edge) => ({
      id: edge.id,
      sourceInstanceId: edge.source.nodeId,
      targetInstanceId: edge.target.nodeId,
      sourcePort: edge.source.portId,
      targetPort: edge.target.portId,
    })),
  };
}
