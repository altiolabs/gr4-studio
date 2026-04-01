import type { RenderedPort } from '../../ports/model/types';

export type GraphPoint = {
  x: number;
  y: number;
};

export type EditorNodeParameterDraft = {
  value: string;
  bindingKind: 'literal' | 'expression';
};

export type EditorNodeParameterDrafts = Record<string, EditorNodeParameterDraft>;

export type EditorCatalogBlock = {
  blockTypeId: string;
  displayName: string;
  category?: string;
  description?: string;
};

export type EditorGraphNode = {
  instanceId: string;
  blockTypeId: string;
  displayName: string;
  category?: string;
  parameters: EditorNodeParameterDrafts;
  position: GraphPoint;
};

export type EditorGraphEdge = {
  id: string;
  sourceInstanceId: string;
  targetInstanceId: string;
  sourcePort?: string;
  targetPort?: string;
};

export type FlowNodeData = {
  instanceId: string;
  blockTypeId: string;
  displayName: string;
  shortDisplayName: string;
  missingFromCatalog: boolean;
  category?: string;
  parameterValues: Record<string, string>;
  parameterLines: string[];
  parameterOverflowCount: number;
  renderedInputPorts: RenderedPort[];
  renderedOutputPorts: RenderedPort[];
  supportsRuntimeVisualization: boolean;
  isRuntimeVisualizationOpen: boolean;
  onOpenRuntimeVisualization?: (instanceId: string) => void;
  onCloseRuntimeVisualization?: () => void;
};
