import type { BlockDetails } from '../../../lib/api/block-details';
import type { NodeExecutionMode } from '../../graph-document/model/types';

export const DEFAULT_NODE_EXECUTION_MODE: NodeExecutionMode = 'active';

export function getNodeExecutionMode(mode?: NodeExecutionMode): NodeExecutionMode {
  return mode ?? DEFAULT_NODE_EXECUTION_MODE;
}

export function isLinearBypassableBlock(blockDetails?: BlockDetails): boolean {
  if (!blockDetails) {
    return false;
  }

  return blockDetails.inputPorts.length === 1 && blockDetails.outputPorts.length === 1;
}

