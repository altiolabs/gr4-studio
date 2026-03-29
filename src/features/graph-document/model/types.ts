import type { ApplicationSpec, StudioWorkspaceMetadata } from './studio-workspace';

export const GRAPH_DOCUMENT_FORMAT = 'gr4-studio.graph';
export const GRAPH_DOCUMENT_VERSION = 1 as const;

export type GraphParameterValue = {
  kind: 'expression';
  value: string;
};

export type GraphDocumentNode = {
  id: string;
  blockType: string;
  title?: string;
  position: {
    x: number;
    y: number;
  };
  parameters: Record<string, GraphParameterValue>;
};

export type GraphDocumentEdgeEndpoint = {
  nodeId: string;
  portId?: string;
};

export type GraphDocumentEdge = {
  id: string;
  source: GraphDocumentEdgeEndpoint;
  target: GraphDocumentEdgeEndpoint;
};

export type GraphDocumentMetadata = {
  name: string;
  description?: string;
  studio?: StudioWorkspaceMetadata;
  application?: ApplicationSpec;
};

export type GraphDocument = {
  format: typeof GRAPH_DOCUMENT_FORMAT;
  version: typeof GRAPH_DOCUMENT_VERSION;
  metadata: GraphDocumentMetadata;
  graph: {
    nodes: GraphDocumentNode[];
    edges: GraphDocumentEdge[];
  };
};
