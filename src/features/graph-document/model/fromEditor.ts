import type { EditorGraphEdge, EditorGraphNode } from '../../graph-editor/model/types';
import type { ApplicationSpec, StudioLayoutSpec, StudioPanelSpec, StudioPlotPaletteSpec } from './studio-workspace';
import type { GraphDocument } from './types';
import { GRAPH_DOCUMENT_FORMAT, GRAPH_DOCUMENT_VERSION } from './types';

type EditorSnapshot = {
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

export function graphDocumentFromEditor(snapshot: EditorSnapshot): GraphDocument {
  const studioPanels = snapshot.metadata.studioPanels;
  const studioLayout = snapshot.metadata.studioLayout;
  const studioPlotPalettes = snapshot.metadata.studioPlotPalettes;

  return {
    format: GRAPH_DOCUMENT_FORMAT,
    version: GRAPH_DOCUMENT_VERSION,
    metadata: {
      name: snapshot.metadata.name,
      description: snapshot.metadata.description,
      application: snapshot.metadata.application,
      studio: studioPanels || studioLayout || studioPlotPalettes
        ? {
            panels: studioPanels ?? [],
            layout: studioLayout,
            plotPalettes: studioPlotPalettes,
          }
        : undefined,
    },
    graph: {
      nodes: snapshot.nodes.map((node) => ({
        id: node.instanceId,
        blockType: node.blockTypeId,
        title: node.displayName,
        position: {
          x: node.position.x,
          y: node.position.y,
        },
        parameters: Object.entries(node.parameters).reduce(
          (acc, [key, value]) => {
            acc[key] = {
              kind: 'expression',
              value: value.value,
            };
            return acc;
          },
          {} as Record<string, { kind: 'expression'; value: string }>,
        ),
      })),
      edges: snapshot.edges.map((edge) => ({
        id: edge.id,
        source: {
          nodeId: edge.sourceInstanceId,
          portId: edge.sourcePort,
        },
        target: {
          nodeId: edge.targetInstanceId,
          portId: edge.targetPort,
        },
      })),
    },
  };
}
