import { beforeEach, describe, expect, it } from 'vitest';
import type { EdgeChange, NodeChange } from '@xyflow/react';
import { useEditorStore } from './editorStore';

describe('editorStore flow change application', () => {
  beforeEach(() => {
    useEditorStore.setState({
      nodes: [
        {
          instanceId: 'node-1',
          blockTypeId: 'test.block',
          displayName: 'Node 1',
          category: 'Test',
          parameters: {},
          position: { x: 0, y: 0 },
        },
        {
          instanceId: 'node-2',
          blockTypeId: 'test.block',
          displayName: 'Node 2',
          category: 'Test',
          parameters: {},
          position: { x: 10, y: 10 },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          sourceInstanceId: 'node-1',
          targetInstanceId: 'node-2',
        },
      ],
      documentName: 'Test',
      documentDescription: undefined,
      studioPanels: undefined,
      studioLayout: undefined,
      studioPlotPalettes: undefined,
      application: undefined,
      selectedNodeId: null,
      nextNodeSequence: 3,
    });
  });

  it('applies position changes in one flow change batch', () => {
    const changes: NodeChange[] = [
      {
        id: 'node-1',
        type: 'position',
        position: { x: 100, y: 200 },
        dragging: true,
      },
    ];

    useEditorStore.getState().applyFlowNodeChanges(changes);

    const node = useEditorStore.getState().nodes.find((entry) => entry.instanceId === 'node-1');
    expect(node?.position).toEqual({ x: 100, y: 200 });
  });

  it('removes node and connected edges from flow changes', () => {
    const changes: NodeChange[] = [
      {
        id: 'node-1',
        type: 'remove',
      },
    ];

    useEditorStore.getState().applyFlowNodeChanges(changes);

    expect(useEditorStore.getState().nodes.map((entry) => entry.instanceId)).toEqual(['node-2']);
    expect(useEditorStore.getState().edges).toEqual([]);
  });

  it('applies edge remove changes', () => {
    const changes: EdgeChange[] = [
      {
        id: 'edge-1',
        type: 'remove',
      },
    ];

    useEditorStore.getState().applyFlowEdgeChanges(changes);

    expect(useEditorStore.getState().edges).toEqual([]);
  });
});
