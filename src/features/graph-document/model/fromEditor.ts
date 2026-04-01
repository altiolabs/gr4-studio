import type { EditorGraphEdge, EditorGraphNode } from '../../graph-editor/model/types';
import type { ApplicationSpec, StudioLayoutSpec, StudioPanelSpec, StudioPlotPaletteSpec, StudioVariable } from './studio-workspace';
import type { GraphDocument, GraphParameterValue } from './types';
import { GRAPH_DOCUMENT_FORMAT, GRAPH_DOCUMENT_VERSION } from './types';
import type { ExpressionBinding, JsonPrimitive } from '../../variables/model/types';

type EditorSnapshot = {
  metadata: {
    name: string;
    description?: string;
    studioPanels?: StudioPanelSpec[];
    studioVariables?: StudioVariable[];
    studioLayout?: StudioLayoutSpec;
    studioPlotPalettes?: StudioPlotPaletteSpec[];
    application?: ApplicationSpec;
  };
  nodes: EditorGraphNode[];
  edges: EditorGraphEdge[];
};

function coerceLiteralValue(value: string): JsonPrimitive {
  const trimmed = value.trim();
  if (trimmed === 'null') {
    return null;
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (trimmed !== '' && /^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return value;
}

function toGraphParameterValue(value: EditorGraphNode['parameters'][string]): ExpressionBinding {
  if (value.bindingKind === 'expression') {
    return { kind: 'expression', expr: value.value };
  }
  return { kind: 'literal', value: coerceLiteralValue(value.value) };
}

export function graphDocumentFromEditor(snapshot: EditorSnapshot): GraphDocument {
  const studioPanels = snapshot.metadata.studioPanels;
  const studioVariables = snapshot.metadata.studioVariables;
  const studioLayout = snapshot.metadata.studioLayout;
  const studioPlotPalettes = snapshot.metadata.studioPlotPalettes;

  return {
    format: GRAPH_DOCUMENT_FORMAT,
    version: GRAPH_DOCUMENT_VERSION,
    metadata: {
      name: snapshot.metadata.name,
      description: snapshot.metadata.description,
      application: snapshot.metadata.application,
      studio: studioPanels || studioVariables || studioLayout || studioPlotPalettes
        ? {
            panels: studioPanels ?? [],
            variables: studioVariables ?? [],
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
        executionMode: node.executionMode ?? 'active',
        position: {
          x: node.position.x,
          y: node.position.y,
        },
        parameters: Object.entries(node.parameters).reduce(
          (acc, [key, value]) => {
            acc[key] = toGraphParameterValue(value);
            return acc;
          },
          {} as Record<string, GraphParameterValue>,
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
