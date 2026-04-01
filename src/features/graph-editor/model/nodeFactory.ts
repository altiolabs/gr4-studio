import type { BlockCatalogItem } from '../../../lib/api/blocks';
import type { BlockDetails } from '../../../lib/api/block-details';
import type {
  EditorCatalogBlock,
  EditorGraphNode,
  EditorNodeParameterDrafts,
  GraphPoint,
} from './types';
import { DEFAULT_NODE_EXECUTION_MODE } from './node-execution';
import { DEFAULT_NODE_ROTATION } from './node-rotation';

function sanitizeIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_');
}

export function toEditorCatalogBlock(block: BlockCatalogItem): EditorCatalogBlock {
  return {
    blockTypeId: block.blockTypeId,
    displayName: block.displayName,
    category: block.category,
    description: block.description,
  };
}

export function getNextNodePosition(index: number): GraphPoint {
  const column = index % 4;
  const row = Math.floor(index / 4);
  const staggerOffset = (index % 3) * 14;

  return {
    x: 70 + column * 220 + staggerOffset,
    y: 80 + row * 140 + staggerOffset,
  };
}

export function createEditorNode(
  catalogBlock: EditorCatalogBlock,
  nodeSequence: number,
  position: GraphPoint,
): EditorGraphNode {
  const instanceId = `${sanitizeIdSegment(catalogBlock.blockTypeId)}_${nodeSequence}`;

  return {
    instanceId,
    blockTypeId: catalogBlock.blockTypeId,
    displayName: catalogBlock.displayName,
    category: catalogBlock.category,
    executionMode: DEFAULT_NODE_EXECUTION_MODE,
    rotation: DEFAULT_NODE_ROTATION,
    parameters: {},
    position,
  };
}

export function buildInitialParameterDrafts(blockDetails: BlockDetails): EditorNodeParameterDrafts {
  return blockDetails.parameters.reduce<EditorNodeParameterDrafts>((acc, param) => {
    acc[param.name] = {
      value: param.defaultValue ?? '',
      bindingKind: 'literal',
    };
    return acc;
  }, {});
}

export function createEdgeId(
  sourceInstanceId: string,
  targetInstanceId: string,
  sourcePort?: string,
  targetPort?: string,
): string {
  const sourceSegment = sourcePort ? `${sourceInstanceId}:${sourcePort}` : sourceInstanceId;
  const targetSegment = targetPort ? `${targetInstanceId}:${targetPort}` : targetInstanceId;
  return `${sourceSegment}->${targetSegment}`;
}
