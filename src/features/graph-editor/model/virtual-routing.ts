import type { BlockCatalogItem } from '../../../lib/api/blocks';
import type { BlockDetails } from '../../../lib/api/block-details';
import type { EditorGraphEdge, EditorGraphNode, EditorNodeParameterDrafts } from './types';

export const VIRTUAL_SINK_BLOCK_TYPE = 'studio::VirtualSink';
export const VIRTUAL_SOURCE_BLOCK_TYPE = 'studio::VirtualSource';
export const NOTE_BLOCK_TYPE = 'studio::Note';
export const LEGACY_VIRTUAL_SINK_BLOCK_TYPE = 'gr4-studio::VirtualSink';
export const LEGACY_VIRTUAL_SOURCE_BLOCK_TYPE = 'gr4-studio::VirtualSource';

export const VIRTUAL_ROUTING_BLOCK_TYPES = [
  VIRTUAL_SINK_BLOCK_TYPE,
  VIRTUAL_SOURCE_BLOCK_TYPE,
  LEGACY_VIRTUAL_SINK_BLOCK_TYPE,
  LEGACY_VIRTUAL_SOURCE_BLOCK_TYPE,
] as const;

export function isVirtualSinkBlockType(blockTypeId: string): boolean {
  return blockTypeId === VIRTUAL_SINK_BLOCK_TYPE || blockTypeId === LEGACY_VIRTUAL_SINK_BLOCK_TYPE;
}

export function isVirtualSourceBlockType(blockTypeId: string): boolean {
  return blockTypeId === VIRTUAL_SOURCE_BLOCK_TYPE || blockTypeId === LEGACY_VIRTUAL_SOURCE_BLOCK_TYPE;
}

export function isVirtualRoutingBlockType(blockTypeId: string): boolean {
  return isVirtualSinkBlockType(blockTypeId) || isVirtualSourceBlockType(blockTypeId);
}

export function isNoteBlockType(blockTypeId: string): boolean {
  return blockTypeId === NOTE_BLOCK_TYPE;
}

export function isStudioEditorOnlyBlockType(blockTypeId: string): boolean {
  return isVirtualRoutingBlockType(blockTypeId) || isNoteBlockType(blockTypeId);
}

export function normalizeVirtualRoutingBlockType(blockTypeId: string): string {
  if (blockTypeId === LEGACY_VIRTUAL_SINK_BLOCK_TYPE) {
    return VIRTUAL_SINK_BLOCK_TYPE;
  }

  if (blockTypeId === LEGACY_VIRTUAL_SOURCE_BLOCK_TYPE) {
    return VIRTUAL_SOURCE_BLOCK_TYPE;
  }

  return blockTypeId;
}

export function getVirtualRoutingInitialParameters(): EditorNodeParameterDrafts {
  return {
    stream_id: {
      value: 'route',
      bindingKind: 'literal',
    },
  };
}

export function getStudioEditorBlockInitialParameters(blockTypeId: string): EditorNodeParameterDrafts {
  if (isNoteBlockType(blockTypeId)) {
    return {
      text: {
        value: 'Note',
        bindingKind: 'literal',
      },
    };
  }

  if (isVirtualRoutingBlockType(blockTypeId)) {
    return getVirtualRoutingInitialParameters();
  }

  return {};
}

export type VirtualRouteIssue = {
  severity: 'error' | 'warning';
  message: string;
  nodeIds: string[];
};

function getEditorStreamId(node: EditorGraphNode): string {
  return node.parameters.stream_id?.value.trim() ?? '';
}

export function getEditorVirtualRouteIssues(
  nodes: readonly EditorGraphNode[],
  edges: readonly EditorGraphEdge[],
): VirtualRouteIssue[] {
  const virtualNodes = nodes.filter((node) => isVirtualRoutingBlockType(node.blockTypeId));
  if (virtualNodes.length === 0) {
    return [];
  }

  const issues: VirtualRouteIssue[] = [];
  const sinkByStreamId = new Map<string, EditorGraphNode>();
  const sourcesByStreamId = new Map<string, EditorGraphNode[]>();

  virtualNodes.forEach((node) => {
    const streamId = getEditorStreamId(node);
    if (!streamId) {
      issues.push({
        severity: 'error',
        message: `Virtual routing block "${node.instanceId}" requires a stream_id.`,
        nodeIds: [node.instanceId],
      });
      return;
    }

    if (isVirtualSinkBlockType(node.blockTypeId)) {
      const existing = sinkByStreamId.get(streamId);
      if (existing) {
        issues.push({
          severity: 'error',
          message: `Virtual route "${streamId}" has multiple sinks.`,
          nodeIds: [existing.instanceId, node.instanceId],
        });
      } else {
        sinkByStreamId.set(streamId, node);
      }
      return;
    }

    if (isVirtualSourceBlockType(node.blockTypeId)) {
      const sources = sourcesByStreamId.get(streamId) ?? [];
      sources.push(node);
      sourcesByStreamId.set(streamId, sources);
    }
  });

  sourcesByStreamId.forEach((sources, streamId) => {
    if (!sinkByStreamId.has(streamId)) {
      issues.push({
        severity: 'error',
        message: `Virtual source route "${streamId}" has no matching virtual sink.`,
        nodeIds: sources.map((node) => node.instanceId),
      });
    }
  });

  sinkByStreamId.forEach((sink, streamId) => {
    if (!sourcesByStreamId.has(streamId)) {
      issues.push({
        severity: 'warning',
        message: `Virtual sink route "${streamId}" has no matching virtual source.`,
        nodeIds: [sink.instanceId],
      });
    }
  });

  const connectedNodeIds = new Set<string>();
  edges.forEach((edge) => {
    connectedNodeIds.add(edge.sourceInstanceId);
    connectedNodeIds.add(edge.targetInstanceId);
  });
  virtualNodes.forEach((node) => {
    if (!connectedNodeIds.has(node.instanceId)) {
      issues.push({
        severity: 'warning',
        message: `Virtual routing block "${node.instanceId}" is not connected.`,
        nodeIds: [node.instanceId],
      });
    }
  });

  return issues;
}

export function getVirtualRoutingCatalogBlocks(): BlockCatalogItem[] {
  return [
    {
      blockTypeId: NOTE_BLOCK_TYPE,
      displayName: 'Note',
      category: 'Studio',
      description: 'Editor-only note displayed as text on the graph canvas.',
      inputs: [],
      outputs: [],
      parameters: [{ name: 'text', type: 'string', default: 'Note' }],
    },
    {
      blockTypeId: VIRTUAL_SOURCE_BLOCK_TYPE,
      displayName: 'Virtual Source',
      category: 'Graph Routing',
      description: 'Editor-only source for a named virtual graph route.',
      inputs: [],
      outputs: [{ name: 'out', type: 'wildcard' }],
      parameters: [{ name: 'stream_id', type: 'string', default: 'route' }],
    },
    {
      blockTypeId: VIRTUAL_SINK_BLOCK_TYPE,
      displayName: 'Virtual Sink',
      category: 'Graph Routing',
      description: 'Editor-only sink for a named virtual graph route.',
      inputs: [{ name: 'in', type: 'wildcard' }],
      outputs: [],
      parameters: [{ name: 'stream_id', type: 'string', default: 'route' }],
    },
  ];
}

export function getVirtualRoutingBlockDetails(blockTypeId: string): BlockDetails | undefined {
  if (isNoteBlockType(blockTypeId)) {
    return {
      blockTypeId,
      displayName: 'Note',
      description: 'Editor-only note displayed as text on the graph canvas.',
      parameters: [
        {
          name: 'text',
          label: 'text',
          description: 'Text to display on the graph canvas.',
          defaultValue: 'Note',
          mutable: true,
          readOnly: false,
          valueType: 'string',
          valueKind: 'scalar',
        },
      ],
      inputPorts: [],
      outputPorts: [],
    };
  }

  if (!isVirtualRoutingBlockType(blockTypeId)) {
    return undefined;
  }

  const isSink = isVirtualSinkBlockType(blockTypeId);
  return {
    blockTypeId,
    displayName: isSink ? 'Virtual Sink' : 'Virtual Source',
    description: isSink
      ? 'Editor-only sink for a named virtual graph route.'
      : 'Editor-only source for a named virtual graph route.',
    parameters: [
      {
        name: 'stream_id',
        label: 'stream_id',
        description: 'Named virtual route to connect between virtual sink and source blocks.',
        defaultValue: 'route',
        mutable: true,
        readOnly: false,
        valueType: 'string',
        valueKind: 'scalar',
      },
    ],
    inputPorts: isSink
      ? [
          {
            name: 'in',
            direction: 'input',
            cardinalityKind: 'fixed',
            valueType: 'wildcard',
          },
        ]
      : [],
    outputPorts: isSink
      ? []
      : [
          {
            name: 'out',
            direction: 'output',
            cardinalityKind: 'fixed',
            valueType: 'wildcard',
          },
        ],
  };
}
