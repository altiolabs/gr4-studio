import type { BlockDetails, BlockParameterMeta } from '../../lib/api/block-details';
import type { EditorGraphNode } from '../graph-editor/model/types';
import type {
  StudioControlPanelSpec,
  StudioControlWidgetInputKind,
  StudioControlWidgetSpec,
} from '../graph-document/model/studio-workspace';
import type { ExecutionState, GraphDriftState } from '../runtime-session/store/runtimeSessionStore';

export type ControlWidgetBindingState =
  | 'missing_node'
  | 'missing_parameter'
  | 'incompatible_widget'
  | 'offline'
  | 'stopped'
  | 'stale'
  | 'ready';

type ControlWidgetRuntimeState = {
  sessionId: string | null;
  executionState: ExecutionState;
  graphDriftState: GraphDriftState;
};

export type ResolvedControlWidget = {
  id: string;
  label: string;
  binding: {
    nodeId: string;
    parameterName: string;
  };
  inputKind: StudioControlWidgetInputKind;
  runtimeSessionId?: string | null;
  currentValue: string;
  enumOptions?: readonly string[];
  enumLabels?: Record<string, string>;
  state: ControlWidgetBindingState;
  reason?: string;
  nodeDisplayName?: string;
  nodeBlockTypeId?: string;
  parameterMeta?: BlockParameterMeta;
};

function isNumericTypeName(valueType?: string): boolean {
  const normalized = (valueType ?? '').trim().toLowerCase();
  return (
    normalized.includes('int') ||
    normalized.includes('float') ||
    normalized.includes('double') ||
    normalized.includes('number') ||
    normalized.includes('real') ||
    normalized.includes('complex') ||
    normalized.includes('sample')
  );
}

function isBooleanTypeName(valueType?: string): boolean {
  return (valueType ?? '').trim().toLowerCase().includes('bool');
}

function isCompatibleWidget(widget: StudioControlWidgetSpec, parameterMeta?: BlockParameterMeta): boolean {
  if (!parameterMeta) {
    return true;
  }

  if (widget.inputKind === 'text') {
    return true;
  }

  if (widget.inputKind === 'enum') {
    return parameterMeta.valueKind === 'enum' || Boolean(parameterMeta.enumOptions?.length);
  }

  if (widget.inputKind === 'boolean') {
    return isBooleanTypeName(parameterMeta.valueType);
  }

  if (widget.inputKind === 'number') {
    return isNumericTypeName(parameterMeta.valueType);
  }

  if (widget.inputKind === 'slider') {
    return isNumericTypeName(parameterMeta.valueType);
  }

  return false;
}

function deriveRuntimeState(runtime?: ControlWidgetRuntimeState | null): { state: ControlWidgetBindingState; reason: string } {
  if (!runtime?.sessionId) {
    return {
      state: 'offline',
      reason: 'No linked session is available for live control.',
    };
  }

  if (runtime.executionState !== 'running') {
    return {
      state: 'stopped',
      reason: `Linked session ${runtime.sessionId} is not running.`,
    };
  }

  if (runtime.graphDriftState === 'out-of-sync') {
    return {
      state: 'stale',
      reason: `Linked session ${runtime.sessionId} is stale relative to the current graph.`,
    };
  }

  return {
    state: 'ready',
    reason: `Linked session ${runtime.sessionId} is running and in sync.`,
  };
}

export function resolveControlPanelWidgetBindings(input: {
  panel: StudioControlPanelSpec;
  nodeById: ReadonlyMap<string, EditorGraphNode>;
  blockDetailsByType: ReadonlyMap<string, BlockDetails>;
  runtime?: ControlWidgetRuntimeState | null;
}): ResolvedControlWidget[] {
  return input.panel.widgets.map((widget) => {
    const label = widget.label?.trim() || widget.binding.parameterName;
    const node = input.nodeById.get(widget.binding.nodeId);
    if (!node) {
      return {
        id: widget.id,
        label,
        binding: widget.binding,
        inputKind: widget.inputKind,
        runtimeSessionId: input.runtime?.sessionId ?? null,
        currentValue: '',
        state: 'missing_node' as const,
        reason: `Node ${widget.binding.nodeId} was not found in the current graph.`,
      };
    }

    const parameterEntry = node.parameters[widget.binding.parameterName];
    if (!parameterEntry) {
      return {
        id: widget.id,
        label,
        binding: widget.binding,
        inputKind: widget.inputKind,
        runtimeSessionId: input.runtime?.sessionId ?? null,
        currentValue: '',
        state: 'missing_parameter' as const,
        nodeDisplayName: node.displayName,
        nodeBlockTypeId: node.blockTypeId,
        reason: `Parameter ${widget.binding.parameterName} was not found on node ${node.instanceId}.`,
      };
    }

    const blockDetails = input.blockDetailsByType.get(node.blockTypeId);
    const parameterMeta = blockDetails?.parameters.find((parameter) => parameter.name === widget.binding.parameterName);
    const enumOptions = widget.enumOptions ?? parameterMeta?.enumOptions;
    const enumLabels = widget.enumLabels ?? parameterMeta?.enumLabels;
    if (parameterMeta && !isCompatibleWidget(widget, parameterMeta)) {
      return {
        id: widget.id,
        label,
        binding: widget.binding,
        inputKind: widget.inputKind,
        runtimeSessionId: input.runtime?.sessionId ?? null,
        currentValue: parameterEntry.value,
        enumOptions,
        enumLabels,
        state: 'incompatible_widget' as const,
        nodeDisplayName: node.displayName,
        nodeBlockTypeId: node.blockTypeId,
        parameterMeta,
        reason: `Widget input ${widget.inputKind} is not compatible with ${parameterMeta.name} on ${node.blockTypeId}.`,
      };
    }

    const runtimeState = deriveRuntimeState(input.runtime);
    return {
      id: widget.id,
      label,
      binding: widget.binding,
      inputKind: widget.inputKind,
      runtimeSessionId: input.runtime?.sessionId ?? null,
      currentValue: parameterEntry.value,
      enumOptions,
      enumLabels,
      state: runtimeState.state,
      nodeDisplayName: node.displayName,
      nodeBlockTypeId: node.blockTypeId,
      parameterMeta,
      reason: runtimeState.reason,
    };
  });
}
