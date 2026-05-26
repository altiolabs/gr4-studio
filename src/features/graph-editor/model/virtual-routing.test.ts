import { describe, expect, it } from 'vitest';
import {
  getVirtualRoutingCatalogBlocks,
  isVirtualRoutingBlockType,
  LEGACY_VIRTUAL_SOURCE_BLOCK_TYPE,
  getEditorVirtualRouteIssues,
  NOTE_BLOCK_TYPE,
  VIRTUAL_SINK_BLOCK_TYPE,
  VIRTUAL_SOURCE_BLOCK_TYPE,
} from './virtual-routing';
import type { EditorGraphEdge, EditorGraphNode } from './types';

function node(
  instanceId: string,
  blockTypeId: string,
  streamId: string,
): EditorGraphNode {
  return {
    instanceId,
    blockTypeId,
    displayName: instanceId,
    parameters: {
      stream_id: {
        value: streamId,
        bindingKind: 'literal',
      },
    },
    position: { x: 0, y: 0 },
  };
}

describe('virtual routing model', () => {
  it('uses studio namespace catalog ids and accepts legacy gr4-studio ids', () => {
    expect(getVirtualRoutingCatalogBlocks().map((block) => block.blockTypeId)).toEqual([
      NOTE_BLOCK_TYPE,
      'studio::VirtualSource',
      'studio::VirtualSink',
    ]);
    expect(isVirtualRoutingBlockType(LEGACY_VIRTUAL_SOURCE_BLOCK_TYPE)).toBe(true);
  });

  it('accepts connected matching virtual sink and source routes', () => {
    const nodes = [
      node('route_sink', VIRTUAL_SINK_BLOCK_TYPE, 'audio'),
      node('route_source', VIRTUAL_SOURCE_BLOCK_TYPE, 'audio'),
    ];
    const edges: EditorGraphEdge[] = [
      {
        id: 'edge-1',
        sourceInstanceId: 'real_source',
        targetInstanceId: 'route_sink',
        sourcePort: 'out',
        targetPort: 'in',
      },
      {
        id: 'edge-2',
        sourceInstanceId: 'route_source',
        targetInstanceId: 'real_sink',
        sourcePort: 'out',
        targetPort: 'in',
      },
    ];

    expect(getEditorVirtualRouteIssues(nodes, edges)).toEqual([]);
  });

  it('reports duplicate sinks, missing sinks, empty stream ids, and disconnected virtual blocks', () => {
    const nodes = [
      node('route_sink_a', VIRTUAL_SINK_BLOCK_TYPE, 'audio'),
      node('route_sink_b', VIRTUAL_SINK_BLOCK_TYPE, 'audio'),
      node('route_source', VIRTUAL_SOURCE_BLOCK_TYPE, 'missing'),
      node('empty_source', VIRTUAL_SOURCE_BLOCK_TYPE, ''),
    ];

    const issues = getEditorVirtualRouteIssues(nodes, []);

    expect(issues.map((issue) => issue.message)).toEqual([
      'Virtual route "audio" has multiple sinks.',
      'Virtual routing block "empty_source" requires a stream_id.',
      'Virtual source route "missing" has no matching virtual sink.',
      'Virtual sink route "audio" has no matching virtual source.',
      'Virtual routing block "route_sink_a" is not connected.',
      'Virtual routing block "route_sink_b" is not connected.',
      'Virtual routing block "route_source" is not connected.',
      'Virtual routing block "empty_source" is not connected.',
    ]);
  });
});
