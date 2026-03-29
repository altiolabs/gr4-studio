import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import type { BlockDetails, BlockParameterMeta } from '../../lib/api/block-details';
import { isAdvancedParameterName, isAdvancedUiHint } from '../../lib/utils/parameter-groups';
import { useEditorStore } from '../graph-editor/store/editorStore';
import { useBlockDetailsQuery } from '../inspector/hooks/use-block-details-query';
import { toCanonicalBlockDisplayName } from '../graph-editor/model/presentation';

type BlockPropertiesModalProps = {
  instanceId: string;
  onClose: () => void;
};

type ModalTab = 'general' | 'readonly' | 'advanced' | 'documentation';

type DraftMap = Record<string, string>;
const CUSTOM_ENUM_VALUE = '__custom__';

function isAdvancedParameterMeta(parameter: BlockParameterMeta): boolean {
  return isAdvancedParameterName(parameter.name) || isAdvancedUiHint(parameter.uiHint);
}

function buildInitialDraftValues(
  persistedValues: Record<string, { value: string }>,
  blockDetails: BlockDetails,
): DraftMap {
  const fromMetadata = blockDetails.parameters.reduce<DraftMap>((acc, parameter) => {
    acc[parameter.name] = persistedValues[parameter.name]?.value ?? parameter.defaultValue ?? '';
    return acc;
  }, {});

  for (const [name, entry] of Object.entries(persistedValues)) {
    if (!(name in fromMetadata)) {
      fromMetadata[name] = entry.value;
    }
  }

  return fromMetadata;
}

export function BlockPropertiesModal({ instanceId, onClose }: BlockPropertiesModalProps) {
  const block = useEditorStore((state) => state.getNodeById(instanceId));
  const updateNodeParameters = useEditorStore((state) => state.updateNodeParameters);

  const [activeTab, setActiveTab] = useState<ModalTab>('general');
  const [draftValues, setDraftValues] = useState<DraftMap>({});
  const [isDraftInitialized, setIsDraftInitialized] = useState(false);

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

  const setDraftValue = (parameterName: string, value: string) => {
    setDraftValues((prev) => ({
      ...prev,
      [parameterName]: value,
    }));
  };

  const renderParameterValueInput = (parameter: BlockParameterMeta, disabled: boolean) => {
    const currentValue = draftValues[parameter.name] ?? parameter.defaultValue ?? '';
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

    updateNodeParameters(block.instanceId, draftValues);
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
                  return (
                    <div
                      key={parameter.name}
                      className="rounded border border-slate-700 bg-slate-800/60 p-2 space-y-1"
                    >
                      <label className="block text-xs font-medium text-slate-200">{parameter.label}</label>
                      {renderParameterValueInput(parameter, false)}
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

                  return (
                    <div
                      key={parameter.name}
                      className="rounded border border-slate-700 bg-slate-800/60 p-2 space-y-1"
                    >
                      <label className="block text-xs font-medium text-slate-200">{parameter.label}</label>
                      {renderParameterValueInput(parameter, !isEditable)}
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
                      {parameter.description && (
                        <div className="text-[11px] text-slate-500">{parameter.description}</div>
                      )}
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
