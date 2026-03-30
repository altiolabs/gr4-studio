import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getBlockDetails, type BlockDetails } from '../../lib/api/block-details';
import { useBlockCatalogQuery } from '../block-catalog/hooks/use-block-catalog-query';
import { normalizeTypeName } from '../ports/model/typeColors';
import { resolveRenderedPorts } from '../ports/model/resolveRenderedPorts';
import type { RenderedPort, SchemaPort } from '../ports/model/types';
import type { EditorGraphEdge, EditorGraphNode, FlowNodeData } from './model/types';
import {
  buildBlockCardSummary,
  toCanonicalBlockDisplayName,
  toDisambiguatedShortBlockName,
  toShortBlockName,
} from './model/presentation';
import { useEditorStore } from './store/editorStore';
import { GraphNode } from './graph-node';
import { isHttpTimeSeriesSink } from './runtime/http-time-series';

const nodeTypes = {
  gr4Node: GraphNode,
};

type FlowGraphNode = Node<FlowNodeData>;

function toSchemaPorts(details: BlockDetails): SchemaPort[] {
  return [...details.inputPorts, ...details.outputPorts]
    .filter((port) => port.direction === 'input' || port.direction === 'output')
    .map((port) => ({
      name: port.name,
      direction: port.direction as 'input' | 'output',
      cardinalityKind: port.cardinalityKind,
      isExplicitDynamicCollection: port.isExplicitDynamicCollection,
      currentPortCount: port.currentPortCount,
      renderPortCount: port.renderPortCount,
      minPortCount: port.minPortCount,
      maxPortCount: port.maxPortCount,
      sizeParameter: port.sizeParameter,
      handleNameTemplate: port.handleNameTemplate,
      typeName: port.valueType,
      isOptional: port.isOptional,
      description: port.description,
    }));
}

function toFlowNodeData(
  node: EditorGraphNode,
  openRuntimeVisualizationId: string | null,
  onOpenRuntimeVisualization: (instanceId: string) => void,
  onCloseRuntimeVisualization: () => void,
  missingFromCatalog: boolean,
  fallbackRenderedPorts: { inputs: RenderedPort[]; outputs: RenderedPort[] },
  blockDetails?: BlockDetails,
  shortDisplayNameOverride?: string,
): FlowGraphNode {
  const parameterValues = Object.entries(node.parameters).reduce<Record<string, string>>(
    (acc, [name, entry]) => {
      acc[name] = entry.value;
      return acc;
    },
    {},
  );

  const resolvedPorts = blockDetails
    ? resolveRenderedPorts({
        schemaPorts: toSchemaPorts(blockDetails),
        parameterValues,
      })
    : fallbackRenderedPorts;
  const cardSummary = buildBlockCardSummary(node, blockDetails);
  const supportsRuntimeVisualization = isHttpTimeSeriesSink(node.blockTypeId);

  return {
    id: node.instanceId,
    type: 'gr4Node',
    position: node.position,
    selected: false,
    data: {
      instanceId: node.instanceId,
      blockTypeId: node.blockTypeId,
      displayName: toCanonicalBlockDisplayName(node.displayName, node.blockTypeId),
      shortDisplayName: shortDisplayNameOverride ?? cardSummary.shortDisplayName,
      missingFromCatalog,
      category: node.category,
      parameterValues,
      parameterLines: cardSummary.parameterLines,
      parameterOverflowCount: cardSummary.parameterOverflowCount,
      renderedInputPorts: resolvedPorts.inputs,
      renderedOutputPorts: resolvedPorts.outputs,
      supportsRuntimeVisualization,
      isRuntimeVisualizationOpen: supportsRuntimeVisualization && openRuntimeVisualizationId === node.instanceId,
      onOpenRuntimeVisualization,
      onCloseRuntimeVisualization,
    },
  };
}

function toFlowEdge(edge: EditorGraphEdge): Edge {
  return {
    id: edge.id,
    source: edge.sourceInstanceId,
    target: edge.targetInstanceId,
    sourceHandle: edge.sourcePort,
    targetHandle: edge.targetPort,
    animated: false,
  };
}

type NodePortTypeMap = {
  inputTypes: Map<string, string | undefined>;
  outputTypes: Map<string, string | undefined>;
  inputHandleIdsByPortId: Map<string, string>;
  outputHandleIdsByPortId: Map<string, string>;
  inputPortIdsByHandleId: Map<string, string>;
  outputPortIdsByHandleId: Map<string, string>;
};

function toReactFlowHandleId(portId: string): string {
  const safeToken = Array.from(portId)
    .map((char) => (/^[A-Za-z0-9_-]$/.test(char) ? char : `_${char.codePointAt(0)?.toString(16)}_`))
    .join('');

  return `handle_${safeToken}`;
}

function buildNodePortTypeMap(nodes: Node<FlowNodeData>[]): Map<string, NodePortTypeMap> {
  return new Map(
    nodes.map((node) => [
      node.id,
      {
        inputTypes: new Map(
          node.data.renderedInputPorts
            .filter((port) => typeof port.portId === 'string')
            .map((port) => [port.portId as string, port.typeName]),
        ),
        inputHandleIdsByPortId: new Map(
          node.data.renderedInputPorts
            .filter((port) => typeof port.portId === 'string')
            .map((port) => [port.portId as string, port.handleId ?? port.portId ?? '']),
        ),
        inputPortIdsByHandleId: new Map(
          node.data.renderedInputPorts
            .filter((port) => typeof port.portId === 'string')
            .map((port) => [port.handleId ?? port.portId ?? '', port.portId as string]),
        ),
        outputTypes: new Map(
          node.data.renderedOutputPorts
            .filter((port) => typeof port.portId === 'string')
            .map((port) => [port.portId as string, port.typeName]),
        ),
        outputHandleIdsByPortId: new Map(
          node.data.renderedOutputPorts
            .filter((port) => typeof port.portId === 'string')
            .map((port) => [port.portId as string, port.handleId ?? port.portId ?? '']),
        ),
        outputPortIdsByHandleId: new Map(
          node.data.renderedOutputPorts
            .filter((port) => typeof port.portId === 'string')
            .map((port) => [port.handleId ?? port.portId ?? '', port.portId as string]),
        ),
      },
    ]),
  );
}

function arePortTypesMismatched(sourceType?: string, targetType?: string): boolean {
  const source = normalizeTypeName(sourceType);
  const target = normalizeTypeName(targetType);

  if (!source || !target) {
    return false;
  }

  if (source === 'wildcard' || target === 'wildcard') {
    return false;
  }

  return source !== target;
}

function toStyledFlowEdge(
  edge: EditorGraphEdge,
  nodePortTypeMap: Map<string, NodePortTypeMap>,
): Edge {
  const sourceNodePorts = nodePortTypeMap.get(edge.sourceInstanceId);
  const targetNodePorts = nodePortTypeMap.get(edge.targetInstanceId);
  const sourceType = edge.sourcePort ? sourceNodePorts?.outputTypes.get(edge.sourcePort) : undefined;
  const targetType = edge.targetPort ? targetNodePorts?.inputTypes.get(edge.targetPort) : undefined;
  const sourceHandle = edge.sourcePort ? sourceNodePorts?.outputHandleIdsByPortId.get(edge.sourcePort) : undefined;
  const targetHandle = edge.targetPort ? targetNodePorts?.inputHandleIdsByPortId.get(edge.targetPort) : undefined;
  const isMismatched = arePortTypesMismatched(sourceType, targetType);

  return {
    ...toFlowEdge({
      ...edge,
      sourcePort: sourceHandle ?? edge.sourcePort,
      targetPort: targetHandle ?? edge.targetPort,
    }),
    style: isMismatched
      ? {
          stroke: '#ff2d2d',
          strokeWidth: 3,
        }
      : undefined,
    animated: isMismatched,
  };
}

function buildFallbackRenderedPort(portId: string, direction: 'input' | 'output'): RenderedPort {
  return {
    key: `${direction}:${portId}:fallback`,
    direction,
    displayLabel: portId,
    portId,
    handleId: toReactFlowHandleId(portId),
    sourceSchemaName: portId,
    cardinalityKind: 'fixed',
    inference: 'inferred',
    connectable: true,
  };
}

function buildFallbackPortMap(edges: EditorGraphEdge[]): Map<string, { inputs: RenderedPort[]; outputs: RenderedPort[] }> {
  const inputIdsByNode = new Map<string, Set<string>>();
  const outputIdsByNode = new Map<string, Set<string>>();

  edges.forEach((edge) => {
    if (edge.targetPort) {
      if (!inputIdsByNode.has(edge.targetInstanceId)) {
        inputIdsByNode.set(edge.targetInstanceId, new Set());
      }
      inputIdsByNode.get(edge.targetInstanceId)?.add(edge.targetPort);
    }
    if (edge.sourcePort) {
      if (!outputIdsByNode.has(edge.sourceInstanceId)) {
        outputIdsByNode.set(edge.sourceInstanceId, new Set());
      }
      outputIdsByNode.get(edge.sourceInstanceId)?.add(edge.sourcePort);
    }
  });

  const nodeIds = new Set([...inputIdsByNode.keys(), ...outputIdsByNode.keys()]);
  return new Map(
    Array.from(nodeIds).map((nodeId) => [
      nodeId,
      {
        inputs: Array.from(inputIdsByNode.get(nodeId) ?? []).map((portId) => buildFallbackRenderedPort(portId, 'input')),
        outputs: Array.from(outputIdsByNode.get(nodeId) ?? []).map((portId) => buildFallbackRenderedPort(portId, 'output')),
      },
    ]),
  );
}

function mergeFlowNodes(current: FlowGraphNode[], next: FlowGraphNode[]): FlowGraphNode[] {
  const currentById = new Map(current.map((node) => [node.id, node]));

  return next.map((node) => {
    const previous = currentById.get(node.id);
    if (!previous) {
      return node;
    }

    // Preserve React Flow-managed internals like measured dimensions while refreshing semantic data.
    return {
      ...previous,
      ...node,
      position: node.position,
      selected: node.selected,
      data: node.data,
    };
  });
}

function buildStoreNodeSignature(nodes: EditorGraphNode[]): string {
  return JSON.stringify(
    nodes.map((node) => ({
      id: node.instanceId,
      position: node.position,
      displayName: node.displayName,
      blockTypeId: node.blockTypeId,
      category: node.category ?? null,
      parameters: node.parameters,
    })),
  );
}

function buildRenderedNodeSignature(nodes: FlowGraphNode[]): string {
  return JSON.stringify(
    nodes.map((node) => ({
      id: node.id,
      displayName: node.data.displayName,
      shortDisplayName: node.data.shortDisplayName,
      missingFromCatalog: node.data.missingFromCatalog,
      inputPorts: node.data.renderedInputPorts.map((port) => ({
        key: port.key,
        portId: port.portId ?? null,
        handleId: port.handleId ?? null,
        typeName: port.typeName ?? null,
        connectable: port.connectable,
      })),
      outputPorts: node.data.renderedOutputPorts.map((port) => ({
        key: port.key,
        portId: port.portId ?? null,
        handleId: port.handleId ?? null,
        typeName: port.typeName ?? null,
        connectable: port.connectable,
      })),
      parameterLines: node.data.parameterLines,
      parameterOverflowCount: node.data.parameterOverflowCount,
      runtimeOpen: node.data.isRuntimeVisualizationOpen,
    })),
  );
}

type GraphEditorPanelProps = {
  onOpenBlockProperties: (instanceId: string) => void;
  isBlockPropertiesOpen: boolean;
};

export function GraphEditorPanel({
  onOpenBlockProperties,
  isBlockPropertiesOpen,
}: GraphEditorPanelProps) {
  const blockCatalogQuery = useBlockCatalogQuery();
  const editorNodes = useEditorStore((state) => state.nodes);
  const editorEdges = useEditorStore((state) => state.edges);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const applyFlowNodeChanges = useEditorStore((state) => state.applyFlowNodeChanges);
  const applyFlowEdgeChanges = useEditorStore((state) => state.applyFlowEdgeChanges);
  const selectNode = useEditorStore((state) => state.selectNode);
  const setNodePosition = useEditorStore((state) => state.setNodePosition);
  const removeNode = useEditorStore((state) => state.removeNode);
  const addEdge = useEditorStore((state) => state.addEdge);
  const removeEdge = useEditorStore((state) => state.removeEdge);
  const [openRuntimeVisualizationId, setOpenRuntimeVisualizationId] = useState<string | null>(null);

  const onOpenRuntimeVisualization = useCallback((instanceId: string) => {
    setOpenRuntimeVisualizationId(instanceId);
  }, []);

  const onCloseRuntimeVisualization = useCallback(() => {
    setOpenRuntimeVisualizationId(null);
  }, []);

  const uniqueBlockTypes = useMemo(
    () => Array.from(new Set(editorNodes.map((node) => node.blockTypeId))),
    [editorNodes],
  );
  const blockDetailQueries = useQueries({
    queries: uniqueBlockTypes.map((blockTypeId) => ({
      queryKey: ['block-details', blockTypeId],
      queryFn: () => getBlockDetails(blockTypeId),
      staleTime: 60_000,
    })),
  });
  const blockDetailsByType = useMemo(() => {
    const map = new Map<string, BlockDetails>();
    uniqueBlockTypes.forEach((blockTypeId, index) => {
      const query = blockDetailQueries[index];
      if (query?.data) {
        map.set(blockTypeId, query.data);
      }
    });
    return map;
  }, [blockDetailQueries, uniqueBlockTypes]);
  const catalogBlockTypeIds = useMemo(() => {
    return new Set((blockCatalogQuery.data ?? []).map((block) => block.blockTypeId));
  }, [blockCatalogQuery.data]);
  const hasResolvedCatalog = blockCatalogQuery.isSuccess;
  const fallbackPortsByNodeId = useMemo(() => buildFallbackPortMap(editorEdges), [editorEdges]);

  const nodes = useMemo(
    () => {
      const baseNameCounts = editorNodes.reduce((acc, node) => {
        const baseName = toShortBlockName(node.displayName, node.blockTypeId);
        acc.set(baseName, (acc.get(baseName) ?? 0) + 1);
        return acc;
      }, new Map<string, number>());

      return editorNodes.map((block) => {
        const baseName = toShortBlockName(block.displayName, block.blockTypeId);
        const shouldDisambiguate = (baseNameCounts.get(baseName) ?? 0) > 1;
        const shortDisplayName = shouldDisambiguate
          ? toDisambiguatedShortBlockName(block.displayName, block.blockTypeId)
          : baseName;

        return toFlowNodeData(
          block,
          openRuntimeVisualizationId,
          onOpenRuntimeVisualization,
          onCloseRuntimeVisualization,
          hasResolvedCatalog && !catalogBlockTypeIds.has(block.blockTypeId),
          fallbackPortsByNodeId.get(block.instanceId) ?? { inputs: [], outputs: [] },
          blockDetailsByType.get(block.blockTypeId),
          shortDisplayName,
        );
      });
    },
    [
      blockDetailsByType,
      catalogBlockTypeIds,
      editorNodes,
      fallbackPortsByNodeId,
      hasResolvedCatalog,
      onCloseRuntimeVisualization,
      onOpenRuntimeVisualization,
      openRuntimeVisualizationId,
    ],
  );
  const nodePortTypeMap = useMemo(() => buildNodePortTypeMap(nodes), [nodes]);
  const flowEdges = useMemo(
    () => editorEdges.map((edge) => toStyledFlowEdge(edge, nodePortTypeMap)),
    [editorEdges, nodePortTypeMap],
  );
  const storeNodeSignature = useMemo(() => buildStoreNodeSignature(editorNodes), [editorNodes]);
  const renderedNodeSignature = useMemo(() => buildRenderedNodeSignature(nodes), [nodes]);
  const [flowNodes, setFlowNodes] = useState<FlowGraphNode[]>(nodes);
  const latestSemanticNodesRef = useRef(nodes);

  useEffect(() => {
    // Keep the most recent semantic node payload available without forcing a local-flow reset every render.
    latestSemanticNodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    // Merge persisted graph changes and async-rendered node metadata into the local React Flow nodes.
    setFlowNodes((current) => mergeFlowNodes(current, latestSemanticNodesRef.current));
  }, [renderedNodeSignature, storeNodeSignature]);

  useEffect(() => {
    setFlowNodes((current) =>
      current.map((node) =>
        node.selected === (node.id === selectedNodeId)
          ? node
          : {
              ...node,
              selected: node.id === selectedNodeId,
            },
      ),
    );
  }, [selectedNodeId]);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowGraphNode>[]) => {
      setFlowNodes((current) => applyNodeChanges(changes, current));

      const persistedChanges = changes.filter((change) => change.type !== 'position');
      if (persistedChanges.length > 0) {
        applyFlowNodeChanges(persistedChanges as NodeChange[]);
      }
    },
    [applyFlowNodeChanges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return;
      }

      const sourceNodePorts = nodePortTypeMap.get(connection.source);
      const targetNodePorts = nodePortTypeMap.get(connection.target);
      const sourcePort =
        (connection.sourceHandle && sourceNodePorts?.outputPortIdsByHandleId.get(connection.sourceHandle)) ||
        connection.sourceHandle ||
        undefined;
      const targetPort =
        (connection.targetHandle && targetNodePorts?.inputPortIdsByHandleId.get(connection.targetHandle)) ||
        connection.targetHandle ||
        undefined;

      addEdge({
        sourceInstanceId: connection.source,
        targetInstanceId: connection.target,
        sourcePort,
        targetPort,
      });
    },
    [addEdge, nodePortTypeMap],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      applyFlowEdgeChanges(changes);
    },
    [applyFlowEdgeChanges],
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: FlowGraphNode) => {
      setNodePosition(node.id, node.position);
    },
    [setNodePosition],
  );

  useEffect(() => {
    if (!openRuntimeVisualizationId) {
      return;
    }

    const stillExists = editorNodes.some((node) => node.instanceId === openRuntimeVisualizationId);
    if (!stillExists) {
      setOpenRuntimeVisualizationId(null);
    }
  }, [editorNodes, openRuntimeVisualizationId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedNodeId || isBlockPropertiesOpen) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isTextInputTarget =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      if (isTextInputTarget) {
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        removeNode(selectedNodeId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isBlockPropertiesOpen, removeNode, selectedNodeId]);

  return (
    <div className="relative h-full w-full">
      <div className="absolute left-3 top-3 z-10 rounded-md border border-slate-700 bg-slate-900/90 px-2 py-1 text-xs text-slate-300">
        Blocks: {editorNodes.length} | Edges: {editorEdges.length}
      </div>

      {editorNodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-md border border-dashed border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-400">
            Add a block from the catalog to start building a graph.
          </div>
        </div>
      )}

      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onPaneClick={() => selectNode(null)}
        onNodeClick={(_, node) => selectNode(node.id)}
        onNodeDragStop={onNodeDragStop}
        onNodeDoubleClick={(_, node) => {
          selectNode(node.id);
          onOpenBlockProperties(node.id);
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeDoubleClick={(_, edge) => removeEdge(edge.id)}
      >
        <Background gap={16} size={1} color="#334155" />
        <Controls />
      </ReactFlow>
    </div>
  );
}
