import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import type { BlockDetails, BlockParameterMeta } from '../../lib/api/block-details';
import { isAdvancedParameterName, isAdvancedUiHint } from '../../lib/utils/parameter-groups';
import { useEditorStore } from '../graph-editor/store/editorStore';
import { useBlockDetailsQuery } from '../inspector/hooks/use-block-details-query';
import { toCanonicalBlockDisplayName } from '../graph-editor/model/presentation';
import type { StudioPanelSpec } from '../graph-document/model/studio-workspace';
import { graphDocumentFromEditor } from '../graph-document/model/fromEditor';
import {
  addControlWidgetToPanels,
  buildControlWidgetSpec,
  isControlWidgetParameterTarget,
  removeControlWidgetFromPanel,
} from '../control-panels/control-panel-authoring';
import { resolveGraphVariables } from '../variables/model/resolveGraphVariables';
import type { ExpressionBinding } from '../variables/model/types';

type BlockPropertiesModalProps = {
  instanceId: string;
  onClose: () => void;
};

type ModalTab = 'general' | 'readonly' | 'advanced' | 'documentation';

type DraftValue = {
  value: string;
  bindingKind: 'literal' | 'expression';
};

type DraftMap = Record<string, DraftValue>;
const EMPTY_STUDIO_PANELS: readonly StudioPanelSpec[] = [];
const CUSTOM_ENUM_VALUE = '__custom__';

function isAdvancedParameterMeta(parameter: BlockParameterMeta): boolean {
  return isAdvancedParameterName(parameter.name) || isAdvancedUiHint(parameter.uiHint);
}

export function coerceBlockPropertyLiteralValue(value: string): string | number | boolean | null {
  const trimmed = value.trim();
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (trimmed === 'null') {
    return null;
  }
  return value;
}

function buildInitialDraftValues(
  persistedValues: Record<string, { value: string; bindingKind: 'literal' | 'expression' }>,
  blockDetails: BlockDetails,
): DraftMap {
  const fromMetadata = blockDetails.parameters.reduce<DraftMap>((acc, parameter) => {
    acc[parameter.name] = {
      value: persistedValues[parameter.name]?.value ?? parameter.defaultValue ?? '',
      bindingKind: persistedValues[parameter.name]?.bindingKind ?? 'literal',
    };
    return acc;
  }, {});

  for (const [name, entry] of Object.entries(persistedValues)) {
    if (!(name in fromMetadata)) {
      fromMetadata[name] = {
        value: entry.value,
        bindingKind: entry.bindingKind,
      };
    }
  }

  return fromMetadata;
}

export function BlockPropertiesModal({ instanceId, onClose }: BlockPropertiesModalProps) {
  const block = useEditorStore((state) => state.getNodeById(instanceId));
  const updateNodeParameterBindings = useEditorStore((state) => state.updateNodeParameterBindings);
  const studioPanels = useEditorStore((state) => state.studioPanels);
  const setStudioPanels = useEditorStore((state) => state.setStudioPanels);
  const documentName = useEditorStore((state) => state.documentName);
  const documentDescription = useEditorStore((state) => state.documentDescription);
  const studioVariables = useEditorStore((state) => state.studioVariables);
  const studioLayout = useEditorStore((state) => state.studioLayout);
  const studioPlotPalettes = useEditorStore((state) => state.studioPlotPalettes);
  const application = useEditorStore((state) => state.application);
  const nodes = useEditorStore((state) => state.nodes);
  const edges = useEditorStore((state) => state.edges);

  const [activeTab, setActiveTab] = useState<ModalTab>('general');
  const [draftValues, setDraftValues] = useState<DraftMap>({});
  const [isDraftInitialized, setIsDraftInitialized] = useState(false);
  const [pendingControlParameter, setPendingControlParameter] = useState<BlockParameterMeta | null>(null);

  const blockDetailsQuery = useBlockDetailsQuery(block?.blockTypeId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    setActiveTab('general');
    setDraftValues({});
    setIsDraftInitialized(false);
    setPendingControlParameter(null);
  }, [instanceId]);

  useEffect(() => {
    if (!block || !blockDetailsQuery.data || isDraftInitialized) {
      return;
    }

    setDraftValues(buildInitialDraftValues(block.parameters, blockDetailsQuery.data));
    setIsDraftInitialized(true);
  }, [block, blockDetailsQuery.data, isDraftInitialized]);

  const parameterRows = useMemo(() => {
    if (!blockDetailsQuery.data) {
      return [];
    }

    return blockDetailsQuery.data.parameters;
  }, [blockDetailsQuery.data]);
  const controlPanels = useMemo(
    () => (studioPanels ?? EMPTY_STUDIO_PANELS).filter((panel) => panel.kind === 'control'),
    [studioPanels],
  );
  const findControlWidgetBinding = (parameterName: string) =>
    (studioPanels ?? EMPTY_STUDIO_PANELS)
      .filter((panel): panel is Extract<StudioPanelSpec, { kind: 'control' }> => panel.kind === 'control')
      .map((panel) => ({
        panel,
        widget: panel.widgets.find(
          (widget) =>
            widget.binding.kind === 'parameter' &&
            widget.binding.nodeId === blockInstanceId &&
            widget.binding.parameterName === parameterName,
        ),
      }))
      .find((entry): entry is { panel: Extract<StudioPanelSpec, { kind: 'control' }>; widget: NonNullable<typeof entry.widget> } =>
        Boolean(entry.widget),
      ) ?? null;
  const editableParameters = useMemo(
    () =>
      parameterRows.filter(
        (parameter) =>
          !isAdvancedParameterMeta(parameter) && !parameter.readOnly && parameter.mutable,
      ),
    [parameterRows],
  );
  const readOnlyParameters = useMemo(
    () =>
      parameterRows.filter(
        (parameter) => parameter.readOnly || !parameter.mutable,
      ),
    [parameterRows],
  );
  const advancedParameters = useMemo(
    () =>
      parameterRows.filter(
        (parameter) => isAdvancedParameterMeta(parameter) && !parameter.readOnly && parameter.mutable,
      ),
    [parameterRows],
  );
  const canCommit = isDraftInitialized && !blockDetailsQuery.isPending && !blockDetailsQuery.isError;
  const currentDocument = useMemo(
    () =>
      graphDocumentFromEditor({
        metadata: {
          name: documentName,
          description: documentDescription,
          studioPanels,
          studioVariables,
          studioLayout,
          studioPlotPalettes,
          application,
        },
        nodes,
        edges,
      }),
    [application, documentDescription, documentName, edges, nodes, studioLayout, studioPanels, studioPlotPalettes, studioVariables],
  );
  const resolvedGraph = useMemo(() => resolveGraphVariables(currentDocument), [currentDocument]);

  const setDraftValue = (parameterName: string, value: string) => {
    setDraftValues((prev) => ({
      ...prev,
      [parameterName]: {
        value,
        bindingKind: prev[parameterName]?.bindingKind ?? 'literal',
      },
    }));
  };

  const setDraftBindingKind = (parameterName: string, bindingKind: DraftValue['bindingKind']) => {
    setDraftValues((prev) => ({
      ...prev,
      [parameterName]: {
        value: prev[parameterName]?.value ?? '',
        bindingKind,
      },
    }));
  };

  const addControlForParameterToPanel = (parameter: BlockParameterMeta, targetPanelId?: string) => {
    if (!blockDetailsQuery.data || !isControlWidgetParameterTarget(parameter)) {
      return;
    }

    const widget = buildControlWidgetSpec({
      nodeId: blockInstanceId,
      parameter,
    });
    const nextPanels = addControlWidgetToPanels(studioPanels, { widget, targetPanelId });

    if (nextPanels !== studioPanels) {
      setStudioPanels(nextPanels);
    }

    setPendingControlParameter(null);
  };

  const handleControlAction = (parameter: BlockParameterMeta) => {
    const binding = findControlWidgetBinding(parameter.name);
    if (binding) {
      setStudioPanels(
        removeControlWidgetFromPanel(studioPanels, binding.panel.id, binding.widget.id),
      );
      return;
    }

    if (controlPanels.length === 0) {
      addControlForParameterToPanel(parameter);
      return;
    }

    if (controlPanels.length === 1) {
      addControlForParameterToPanel(parameter, controlPanels[0].id);
      return;
    }

    setPendingControlParameter(parameter);
  };

  const renderParameterValueInput = (parameter: BlockParameterMeta, disabled: boolean) => {
    const currentValue = draftValues[parameter.name]?.value ?? parameter.defaultValue ?? '';
    const enumOptions = parameter.enumOptions ?? [];
    const hasEnumOptions = parameter.valueKind === 'enum' && enumOptions.length > 0;

    if (!hasEnumOptions) {
      return (
        <input
          type="text"
          value={currentValue}
          disabled={disabled}
          onChange={(event) => setDraftValue(parameter.name, event.target.value)}
          className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100 disabled:opacity-60"
        />
      );
    }

    const isCustomValue = !enumOptions.includes(currentValue);
    const selectValue = isCustomValue ? CUSTOM_ENUM_VALUE : currentValue;

    return (
      <div className="space-y-2">
        <select
          value={selectValue}
          disabled={disabled}
          onChange={(event) => {
            const nextValue = event.target.value;
            if (nextValue === CUSTOM_ENUM_VALUE) {
              setDraftValue(parameter.name, '');
              return;
            }
            setDraftValue(parameter.name, nextValue);
          }}
          className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100 disabled:opacity-60"
        >
          {enumOptions.map((option) => (
            <option key={option} value={option}>
              {parameter.enumLabels?.[option] ?? option}
            </option>
          ))}
          {parameter.allowCustomValue && <option value={CUSTOM_ENUM_VALUE}>Custom value...</option>}
        </select>
        {parameter.allowCustomValue && isCustomValue && (
          <input
            type="text"
            value={currentValue}
            disabled={disabled}
            onChange={(event) => setDraftValue(parameter.name, event.target.value)}
            placeholder="Enter custom value"
            className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100 disabled:opacity-60"
          />
        )}
      </div>
    );
  };

  const commitDraft = () => {
    if (!block || !canCommit) {
      return;
    }

    const nextBindings = Object.entries(draftValues).reduce<Record<string, ExpressionBinding>>((acc, [name, draft]) => {
      if (draft.bindingKind === 'expression') {
        acc[name] = { kind: 'expression', expr: draft.value };
        return acc;
      }

      acc[name] = { kind: 'literal', value: coerceBlockPropertyLiteralValue(draft.value) };
      return acc;
    }, {});

    updateNodeParameterBindings(block.instanceId, nextBindings);
  };

  const handleApply = () => {
    commitDraft();
  };

  const handleOk = () => {
    commitDraft();
    onClose();
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!block) {
    return null;
  }

  const canonicalDisplayName = toCanonicalBlockDisplayName(block.displayName, block.blockTypeId);
  const blockInstanceId = block.instanceId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"
      onMouseDown={handleBackdropClick}
    >
      <div className="w-full max-w-3xl rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
        <header className="border-b border-slate-700 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-100">Block Properties</h2>
          <p className="text-xs text-slate-400 mt-1">
            {canonicalDisplayName} · {block.instanceId}
          </p>
        </header>

        <div className="border-b border-slate-700 px-4 py-2 flex gap-2">
          {([
            ['general', 'General'],
            ['readonly', 'Read-Only'],
            ['advanced', 'Advanced'],
            ['documentation', 'Documentation'],
          ] as const).map(([tabValue, label]) => (
            <button
              key={tabValue}
              type="button"
              onClick={() => setActiveTab(tabValue)}
              className={`rounded px-2 py-1 text-xs ${
                activeTab === tabValue
                  ? 'bg-emerald-900/40 text-emerald-200 border border-emerald-700/60'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3">
          {pendingControlParameter && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4">
              <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
                <div className="border-b border-slate-700 px-4 py-3">
                  <p className="text-sm font-medium text-slate-100">Choose control panel</p>
                  <p className="text-[11px] text-slate-400">
                    {pendingControlParameter.label} · {pendingControlParameter.name}
                  </p>
                </div>
                <div className="space-y-3 px-4 py-3">
                  <p className="text-sm text-slate-400">Pick where to place this control.</p>
                  <div className="space-y-2">
                    {controlPanels.map((panel) => (
                      <button
                        key={panel.id}
                        type="button"
                        onClick={() => addControlForParameterToPanel(pendingControlParameter, panel.id)}
                        className="flex w-full items-center justify-between rounded border border-slate-600 bg-slate-950 px-3 py-2 text-left text-sm text-slate-100 hover:border-cyan-500 hover:bg-slate-900"
                      >
                        <span className="truncate">{panel.title?.trim() || 'Controls'}</span>
                        <span className="ml-3 shrink-0 text-[11px] text-slate-400">
                          {panel.widgets.length} widget{panel.widgets.length === 1 ? '' : 's'}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingControlParameter(null)}
                      className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => addControlForParameterToPanel(pendingControlParameter)}
                      className="rounded border border-emerald-700/70 bg-emerald-900/35 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-800/45"
                    >
                      New control panel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {blockDetailsQuery.isPending && (
            <p className="text-sm text-slate-400">Loading block details...</p>
          )}

          {blockDetailsQuery.isError && (
            <p className="text-sm text-rose-300">Failed to load block details: {blockDetailsQuery.error.message}</p>
          )}

          {activeTab === 'general' && blockDetailsQuery.data && (
            <div className="space-y-2">
              {editableParameters.length === 0 ? (
                <p className="text-sm text-slate-400">This block has no editable parameters in General.</p>
              ) : (
                editableParameters.map((parameter) => {
                  const binding = findControlWidgetBinding(parameter.name);

                  return (
                    <div
                      key={parameter.name}
                      className="rounded border border-slate-700 bg-slate-800/60 p-2 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <label className="block text-xs font-medium text-slate-200">{parameter.label}</label>
                          <div className="text-[11px] text-slate-400">
                            {parameter.valueType ? `Type: ${parameter.valueType} | ` : ''}
                            {parameter.defaultValue !== undefined
                              ? `Default: ${parameter.defaultValue} | `
                              : 'Default: none | '}
                            {parameter.valueKind === 'enum' ? 'enum' : 'scalar'}
                            {parameter.enumSource ? ` | Source: ${parameter.enumSource}` : ''}
                            {parameter.uiHint ? ` | UI: ${parameter.uiHint}` : ''}
                            {' | '}
                            editable
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleControlAction(parameter)}
                          disabled={!isControlWidgetParameterTarget(parameter)}
                          title={binding ? 'Remove control' : 'Add control'}
                          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border text-sm leading-none ${
                            binding
                              ? 'border-rose-700/70 bg-rose-900/30 text-rose-100 hover:bg-rose-800/40'
                              : 'border-emerald-700/70 bg-emerald-900/35 text-emerald-100 hover:bg-emerald-800/45'
                          } disabled:cursor-not-allowed disabled:opacity-40`}
                        >
                          {binding ? '−' : '+'}
                        </button>
                        <select
                          value={draftValues[parameter.name]?.bindingKind ?? 'literal'}
                          onChange={(event) =>
                            setDraftBindingKind(parameter.name, event.target.value as DraftValue['bindingKind'])
                          }
                          className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
                        >
                          <option value="literal">Literal</option>
                          <option value="expression">Expression</option>
                        </select>
                        <div className="min-w-0 flex-1">
                          {renderParameterValueInput(parameter, false)}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {resolvedGraph.parametersByNodeId[blockInstanceId]?.[parameter.name]?.state === 'resolved'
                          ? `Resolved: ${String(
                              resolvedGraph.parametersByNodeId[blockInstanceId]?.[parameter.name]?.value ?? '',
                            )}`
                          : resolvedGraph.parametersByNodeId[blockInstanceId]?.[parameter.name]?.reason ??
                            'No resolved preview available.'}
                      </p>
                      {parameter.description && (
                        <div className="text-[11px] text-slate-500">{parameter.description}</div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'readonly' && blockDetailsQuery.data && (
            <div className="space-y-2">
              {readOnlyParameters.length === 0 ? (
                <p className="text-sm text-slate-400">This block has no read-only parameters.</p>
              ) : (
                readOnlyParameters.map((parameter) => {
                  return (
                    <div
                      key={parameter.name}
                      className="rounded border border-slate-700 bg-slate-800/60 p-2 space-y-1"
                    >
                      <label className="block text-xs font-medium text-slate-200">{parameter.label}</label>
                      {renderParameterValueInput(parameter, true)}
                      <div className="text-[11px] text-slate-400">
                        {parameter.valueType ? `Type: ${parameter.valueType} | ` : ''}
                        {parameter.defaultValue !== undefined
                          ? `Default: ${parameter.defaultValue} | `
                          : 'Default: none | '}
                        {parameter.valueKind === 'enum' ? 'enum' : 'scalar'}
                        {parameter.enumSource ? ` | Source: ${parameter.enumSource}` : ''}
                        {parameter.uiHint ? ` | UI: ${parameter.uiHint}` : ''}
                        {' | '}
                        read-only
                      </div>
                      {parameter.description && (
                        <div className="text-[11px] text-slate-500">{parameter.description}</div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="space-y-2">
              {!blockDetailsQuery.data ? (
                <p className="text-sm text-slate-400">Advanced metadata will appear when block details are available.</p>
              ) : advancedParameters.length === 0 ? (
                <p className="text-sm text-slate-400">No advanced parameters found for this block.</p>
              ) : (
                advancedParameters.map((parameter) => {
                  const isEditable = !parameter.readOnly && parameter.mutable;
                  const binding = findControlWidgetBinding(parameter.name);

                  return (
                    <div
                      key={parameter.name}
                      className="rounded border border-slate-700 bg-slate-800/60 p-2 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <label className="block text-xs font-medium text-slate-200">{parameter.label}</label>
                          <div className="text-[11px] text-slate-400">
                            {parameter.valueType ? `Type: ${parameter.valueType} | ` : ''}
                            {parameter.defaultValue !== undefined
                              ? `Default: ${parameter.defaultValue} | `
                              : 'Default: none | '}
                            {parameter.valueKind === 'enum' ? 'enum' : 'scalar'}
                            {parameter.enumSource ? ` | Source: ${parameter.enumSource}` : ''}
                            {parameter.uiHint ? ` | UI: ${parameter.uiHint}` : ''}
                            {' | '}
                            {isEditable ? 'editable (advanced)' : 'read-only (advanced)'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleControlAction(parameter)}
                          disabled={!isControlWidgetParameterTarget(parameter)}
                          title={binding ? 'Remove control' : 'Add control'}
                          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border text-sm leading-none ${
                            binding
                              ? 'border-rose-700/70 bg-rose-900/30 text-rose-100 hover:bg-rose-800/40'
                              : 'border-emerald-700/70 bg-emerald-900/35 text-emerald-100 hover:bg-emerald-800/45'
                          } disabled:cursor-not-allowed disabled:opacity-40`}
                        >
                          {binding ? '−' : '+'}
                        </button>
                        <select
                          value={draftValues[parameter.name]?.bindingKind ?? 'literal'}
                          onChange={(event) =>
                            setDraftBindingKind(parameter.name, event.target.value as DraftValue['bindingKind'])
                          }
                          className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
                        >
                          <option value="literal">Literal</option>
                          <option value="expression">Expression</option>
                        </select>
                        <div className="min-w-0 flex-1">
                          {renderParameterValueInput(parameter, !isEditable)}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {resolvedGraph.parametersByNodeId[blockInstanceId]?.[parameter.name]?.state === 'resolved'
                          ? `Resolved: ${String(
                              resolvedGraph.parametersByNodeId[blockInstanceId]?.[parameter.name]?.value ?? '',
                            )}`
                          : resolvedGraph.parametersByNodeId[blockInstanceId]?.[parameter.name]?.reason ??
                            'No resolved preview available.'}
                      </p>
                      {parameter.description && <div className="text-[11px] text-slate-500">{parameter.description}</div>}
                    </div>
                  );
                })
              )}

              {blockDetailsQuery.data && (
                <div className="rounded border border-slate-700 bg-slate-800/50 p-3 text-xs text-slate-400">
                  <p>Block Type ID: {blockDetailsQuery.data.blockTypeId}</p>
                  <p className="mt-1">
                    Ports: {blockDetailsQuery.data.inputPorts.length} input / {blockDetailsQuery.data.outputPorts.length} output
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'documentation' && (
            <div className="rounded border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-300 whitespace-pre-wrap">
              {blockDetailsQuery.data?.description ?? 'No documentation available for this block.'}
            </div>
          )}
        </div>

        <footer className="border-t border-slate-700 px-4 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleOk}
            disabled={!canCommit}
            className="rounded border border-emerald-600 bg-emerald-700/30 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-700/45 disabled:opacity-50"
          >
            OK
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canCommit}
            className="rounded border border-slate-500 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-600 disabled:opacity-50"
          >
            Apply
          </button>
        </footer>
      </div>
    </div>
  );
}
