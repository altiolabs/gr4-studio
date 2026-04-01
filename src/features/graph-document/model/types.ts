import type { ApplicationSpec, StudioWorkspaceMetadata } from './studio-workspace';
import type { ExpressionBinding } from '../../variables/model/types';

export const GRAPH_DOCUMENT_FORMAT = 'gr4-studio.graph';
export const GRAPH_DOCUMENT_VERSION = 1 as const;

export type NodeRotation = 0 | 90 | 180 | 270;

export type NodeExecutionMode = 'active' | 'disabled' | 'bypassed';

export type GraphParameterValue = ExpressionBinding;

export type GraphDocumentNode = {
  id: string;
  blockType: string;
  title?: string;
  executionMode?: NodeExecutionMode;
  rotation?: NodeRotation;
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
