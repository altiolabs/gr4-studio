import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { RuntimeSettingsValue } from '../../lib/api/block-settings';
import { useRuntimeBlockSettings } from '../inspector/hooks/use-runtime-block-settings';
import { toRuntimeSettingsErrorMessage } from '../inspector/runtime-settings-model';
import { getCompatibleControlWidgetInputKinds } from './control-panel-authoring';
import type { ResolvedControlWidget } from './control-panel-binding-resolution';

function stateLabel(state: ResolvedControlWidget['state']): string {
  if (state === 'missing_node') {
    return 'missing node';
  }
  if (state === 'missing_parameter') {
    return 'missing parameter';
  }
  if (state === 'incompatible_widget') {
    return 'incompatible';
  }
  return state;
}

function isTruthyBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function runtimeValueToString(value: RuntimeSettingsValue | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

function runtimeValueToBoolean(value: RuntimeSettingsValue | undefined): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    return isTruthyBoolean(value);
  }

  return false;
}

function enumOptionsForWidget(widget: ResolvedControlWidget, currentValue: string): string[] {
  const options = [...(widget.enumOptions ?? [])];
  if (currentValue && !options.includes(currentValue)) {
    options.unshift(currentValue);
  }
  if (options.length === 0) {
    options.push('');
  }
  return options;
}

function widgetValueLabel(widget: ResolvedControlWidget, value: string): string {
  if (widget.inputKind === 'boolean') {
    return value ? 'On' : 'Off';
  }

  if (widget.inputKind === 'enum') {
    return widget.enumLabels?.[value] ?? value;
  }

  return value;
}

function isNumericWidget(widget: ResolvedControlWidget): boolean {
  return widget.inputKind === 'number' || widget.inputKind === 'slider';
}

type ControlPanelTargetOption = {
  id: string;
  title?: string;
  widgetCount: number;
};

type ControlWidgetFieldProps = {
  widget: ResolvedControlWidget;
  panelId: string;
  isEditable: boolean;
  isPanelSelected: boolean;
  controlPanelOptions: readonly ControlPanelTargetOption[];
  onUpdateWidgetLabel?: (panelId: string, widgetId: string, label: string) => void;
  onUpdateWidgetInputKind?: (
    panelId: string,
    widgetId: string,
    inputKind: 'text' | 'number' | 'slider' | 'boolean' | 'enum',
  ) => void;
  onMoveWidget?: (panelId: string, widgetId: string, direction: 'up' | 'down') => void;
  onRemoveWidget?: (panelId: string, widgetId: string) => void;
  onMoveWidgetToPanel?: (panelId: string, widgetId: string, targetPanelId: string) => void;
};

function ControlWidgetField({
  widget,
  panelId,
  isEditable,
  isPanelSelected,
  controlPanelOptions,
  onUpdateWidgetLabel,
  onUpdateWidgetInputKind,
  onMoveWidget,
  onRemoveWidget,
  onMoveWidgetToPanel,
}: ControlWidgetFieldProps) {
  const canWrite = widget.state === 'ready' && Boolean(widget.runtimeSessionId);
  const { query, mutation } = useRuntimeBlockSettings(widget.runtimeSessionId ?? undefined, widget.binding.nodeId, canWrite);
  const runtimeValue = query.data?.[widget.binding.parameterName];
  const committedValue = runtimeValue !== undefined ? runtimeValue : widget.currentValue;
  const committedText = runtimeValueToString(committedValue);
  const [draftText, setDraftText] = useState<string>(committedText);
  const [checked, setChecked] = useState<boolean>(() => runtimeValueToBoolean(committedValue));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState(widget.label);
  const [destinationPanelId, setDestinationPanelId] = useState('');
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const queuedWriteRef = useRef<{ value: RuntimeSettingsValue } | null>(null);
  const flushingWriteRef = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setValidationError(null);
    if (widget.inputKind === 'boolean') {
      setChecked(runtimeValueToBoolean(committedValue));
      return;
    }
    setDraftText(committedText);
  }, [committedText, committedValue, widget.inputKind]);

  useEffect(() => {
    setLabelDraft(widget.label ?? '');
  }, [widget.id, widget.label]);

  const destinationPanelOptions = controlPanelOptions.filter((option) => option.id !== panelId);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    setDestinationPanelId((current) => {
      if (current && destinationPanelOptions.some((option) => option.id === current)) {
        return current;
      }
      return destinationPanelOptions[0]?.id ?? '';
    });
  }, [destinationPanelOptions, isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const updateMenuPosition = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (!triggerRect) {
        return;
      }

      const desiredWidth = 320;
      const left = Math.max(12, Math.min(triggerRect.right - desiredWidth, window.innerWidth - desiredWidth - 12));
      const top = Math.min(triggerRect.bottom + 10, window.innerHeight - 20);
      setMenuStyle({
        left,
        top,
      });
    };

    updateMenuPosition();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !menuRef.current || menuRef.current.contains(target)) {
        return;
      }
      setIsMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    const onWindowChange = () => {
      updateMenuPosition();
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onWindowChange);
      window.removeEventListener('scroll', onWindowChange, true);
    };
  }, [isMenuOpen]);

  const savePatch = async (nextValue: RuntimeSettingsValue) => {
    if (!canWrite) {
      return;
    }

    queuedWriteRef.current = { value: nextValue };
    if (flushingWriteRef.current) {
      return;
    }

    flushingWriteRef.current = true;
    try {
      while (queuedWriteRef.current !== null) {
        const pendingValue = queuedWriteRef.current.value;
        queuedWriteRef.current = null;
        setValidationError(null);
        await mutation.mutateAsync({
          patch: {
            [widget.binding.parameterName]: pendingValue,
          },
          mode: 'immediate',
        });
      }
    } catch (error) {
      setValidationError(toRuntimeSettingsErrorMessage(error));
    } finally {
      flushingWriteRef.current = false;
    }
  };

  const isPending = mutation.isPending;
  const errorMessage = validationError ?? (mutation.isError ? toRuntimeSettingsErrorMessage(mutation.error) : null);
  const isDisabled = !canWrite;
  const rowTooltip =
    errorMessage ??
    (isPending
      ? 'Saving live setting...'
      : isDisabled
        ? widget.reason ?? stateLabel(widget.state)
        : undefined);
  const rowClass = [
    'group relative grid items-center gap-2 rounded-md border px-3 py-2 transition-colors',
    isEditable
      ? 'grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,auto)_auto]'
      : 'grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto]',
    isDisabled
      ? 'border-slate-700/80 bg-slate-950/25 opacity-65'
      : 'border-slate-700/70 bg-slate-950/35 hover:border-slate-600/90',
  ].join(' ');
  const displayText = draftText.length > 0 ? draftText : committedText;
  const labelText = widget.label ?? widget.binding.parameterName;
  const inputKindOptions = widget.parameterMeta
    ? getCompatibleControlWidgetInputKinds(widget.parameterMeta)
    : ['text', 'number', 'slider', 'boolean', 'enum'];
  const resolvedInputKindOptions = inputKindOptions.includes(widget.inputKind)
    ? inputKindOptions
    : [widget.inputKind, ...inputKindOptions];
  const selectedControlPanelTitle =
    destinationPanelOptions.find((option) => option.id === destinationPanelId)?.title?.trim() || 'Select panel';
  const widgetActionMenu =
    isEditable && isMenuOpen
      ? createPortal(
          <div className="fixed inset-0 z-[120] bg-slate-950/35" onClick={() => setIsMenuOpen(false)}>
            <div
              ref={menuRef}
              role="dialog"
              aria-label="Widget actions"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
              className="fixed w-80 rounded-lg border border-slate-700 bg-slate-950 shadow-2xl ring-1 ring-black/30"
              style={menuStyle}
            >
              <div className="border-b border-slate-700 px-3 py-2">
                <p className="text-xs font-semibold text-slate-100">Widget actions</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{widget.binding.parameterName}</p>
              </div>
              <div className="space-y-3 p-3">
                <div className="space-y-1">
                  <label className="block text-[11px] uppercase tracking-wide text-slate-400">Label</label>
                  <input
                    type="text"
                    value={labelDraft}
                    onChange={(event) => setLabelDraft(event.target.value)}
                    onBlur={(event) => onUpdateWidgetLabel?.(panelId, widget.id, event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      }
                    }}
                    className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] uppercase tracking-wide text-slate-400">Type</label>
                  <select
                    value={widget.inputKind}
                    onChange={(event) =>
                      onUpdateWidgetInputKind?.(
                        panelId,
                        widget.id,
                        event.target.value as 'text' | 'number' | 'slider' | 'boolean' | 'enum',
                      )
                    }
                    className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-cyan-500"
                  >
                    {resolvedInputKindOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] uppercase tracking-wide text-slate-400">Move to panel</label>
                  <div className="flex gap-2">
                    <select
                      value={destinationPanelId}
                      onChange={(event) => setDestinationPanelId(event.target.value)}
                      disabled={destinationPanelOptions.length === 0}
                      className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {destinationPanelOptions.length === 0 ? (
                        <option value="">No other control panels</option>
                      ) : (
                        destinationPanelOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.title?.trim() || 'Controls'} ({option.widgetCount})
                          </option>
                        ))
                      )}
                    </select>
                    <button
                      type="button"
                      disabled={!destinationPanelId || destinationPanelOptions.length === 0}
                      onClick={() => {
                        if (!onMoveWidgetToPanel || !destinationPanelId) {
                          return;
                        }
                        onMoveWidgetToPanel(panelId, widget.id, destinationPanelId);
                        setIsMenuOpen(false);
                      }}
                      className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Move
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!onMoveWidget}
                    onClick={() => onMoveWidget?.(panelId, widget.id, 'up')}
                    className="flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    disabled={!onMoveWidget}
                    onClick={() => onMoveWidget?.(panelId, widget.id, 'down')}
                    className="flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Move down
                  </button>
                </div>
                <button
                  type="button"
                  disabled={!onRemoveWidget}
                  onClick={() => {
                    onRemoveWidget?.(panelId, widget.id);
                    setIsMenuOpen(false);
                  }}
                  className="w-full rounded border border-rose-700/70 bg-rose-900/35 px-2 py-1 text-sm text-rose-100 hover:bg-rose-800/45 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Remove widget
                </button>
                {destinationPanelOptions.length > 0 && (
                  <p className="text-[11px] text-slate-500">
                    Current target: {selectedControlPanelTitle}
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  if (widget.inputKind === 'boolean') {
    return (
      <label className={rowClass} title={rowTooltip}>
        <span className="min-w-0 truncate text-sm font-medium text-slate-100">{labelText}</span>
        <span className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={checked}
            disabled={isDisabled}
            onChange={(event) => {
              if (isDisabled) {
                return;
              }
              const next = event.target.checked;
              setChecked(next);
              void savePatch(next);
            }}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </span>
        <span className="justify-self-end text-xs tabular-nums text-slate-400">
          {checked ? 'On' : 'Off'}
        </span>
        {isEditable && (
          <div className="relative justify-self-end">
            <button
              ref={triggerRef}
              type="button"
              onClick={(event) => {
                event.preventDefault();
                setIsMenuOpen((current) => !current);
              }}
              title="Widget actions"
              className={`inline-flex h-7 w-7 items-center justify-center rounded border border-slate-600 bg-slate-800 text-sm text-slate-100 hover:bg-slate-700 ${
                isMenuOpen || isPanelSelected
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
              }`}
            >
              ⚙
            </button>
            {widgetActionMenu}
          </div>
        )}
      </label>
    );
  }

  if (isNumericWidget(widget)) {
    const numericCommittedValue = Number(committedText);
    const numericDraftValue = Number(draftText);
    const sliderValue =
      Number.isFinite(numericDraftValue) && draftText !== '' ? numericDraftValue : numericCommittedValue;
    return (
      <label className={rowClass} title={rowTooltip}>
        <span className="min-w-0 truncate text-sm font-medium text-slate-100">{labelText}</span>
        {widget.inputKind === 'slider' ? (
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            value={Number.isFinite(sliderValue) ? sliderValue : 0}
            disabled={isDisabled}
            onChange={(event) => {
              if (isDisabled) {
                return;
              }
              const nextText = event.target.value;
              setDraftText(nextText);
              void savePatch(Number(nextText));
            }}
            className="h-4 w-full cursor-pointer accent-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          />
        ) : (
          <input
            type="number"
            value={draftText}
            disabled={isDisabled}
            onChange={(event) => {
              if (isDisabled) {
                return;
              }
              setDraftText(event.target.value);
            }}
            onBlur={() => {
              if (isDisabled) {
                return;
              }
              const trimmed = draftText.trim();
              if (trimmed === '') {
                void savePatch(null);
                return;
              }

              const nextValue = Number(trimmed);
              if (!Number.isFinite(nextValue)) {
                setValidationError('Enter a valid number.');
                return;
              }

              if (String(nextValue) === committedText) {
                return;
              }

              void savePatch(nextValue);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
            className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
          />
        )}
        <span className="justify-self-end text-xs tabular-nums text-slate-400" title={errorMessage ?? undefined}>
          {widgetValueLabel(widget, displayText) || '—'}
        </span>
        {isEditable && (
          <div className="relative justify-self-end">
            <button
              ref={triggerRef}
              type="button"
              onClick={(event) => {
                event.preventDefault();
                setIsMenuOpen((current) => !current);
              }}
              title="Widget actions"
              className={`inline-flex h-7 w-7 items-center justify-center rounded border border-slate-600 bg-slate-800 text-sm text-slate-100 hover:bg-slate-700 ${
                isMenuOpen || isPanelSelected
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
              }`}
            >
              ⚙
            </button>
            {widgetActionMenu}
          </div>
        )}
      </label>
    );
  }

  if (widget.inputKind === 'enum') {
    const options = enumOptionsForWidget(widget, committedText);
    return (
      <label className={rowClass} title={rowTooltip}>
        <span className="min-w-0 truncate text-sm font-medium text-slate-100">{labelText}</span>
        <select
          value={draftText}
          disabled={isDisabled}
          onChange={(event) => {
            if (isDisabled) {
              return;
            }
            const next = event.target.value;
            setDraftText(next);
            void savePatch(next);
          }}
          className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {options.map((option) => (
            <option key={option || '__empty__'} value={option}>
              {(widget.enumLabels?.[option] ?? option) || 'Select an option'}
            </option>
          ))}
        </select>
        <span className="justify-self-end text-xs tabular-nums text-slate-400" title={errorMessage ?? undefined}>
          {widgetValueLabel(widget, displayText) || '—'}
        </span>
        {isEditable && (
          <div className="relative justify-self-end">
            <button
              ref={triggerRef}
              type="button"
              onClick={(event) => {
                event.preventDefault();
                setIsMenuOpen((current) => !current);
              }}
              title="Widget actions"
              className={`inline-flex h-7 w-7 items-center justify-center rounded border border-slate-600 bg-slate-800 text-sm text-slate-100 hover:bg-slate-700 ${
                isMenuOpen || isPanelSelected
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
              }`}
            >
              ⚙
            </button>
            {widgetActionMenu}
          </div>
        )}
      </label>
    );
  }

  return (
    <label className={rowClass} title={rowTooltip}>
      <span className="min-w-0 truncate text-sm font-medium text-slate-100">{labelText}</span>
      <input
        type="text"
        value={draftText}
        disabled={isDisabled}
        onChange={(event) => {
          if (isDisabled) {
            return;
          }
          setDraftText(event.target.value);
        }}
        onBlur={() => {
          if (isDisabled) {
            return;
          }
          if (draftText === committedText) {
            return;
          }
          void savePatch(draftText);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <span className="justify-self-end text-xs tabular-nums text-slate-400" title={errorMessage ?? undefined}>
        {widgetValueLabel(widget, displayText) || '—'}
      </span>
      {isEditable && (
        <div className="relative justify-self-end">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              setIsMenuOpen((current) => !current);
            }}
            title="Widget actions"
            className={`inline-flex h-7 w-7 items-center justify-center rounded border border-slate-600 bg-slate-800 text-sm text-slate-100 hover:bg-slate-700 ${
              isMenuOpen || isPanelSelected
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
            }`}
          >
            ⚙
          </button>
          {widgetActionMenu}
        </div>
      )}
    </label>
  );
}

export function ControlPanelView({
  panelId,
  widgets,
  isEditable = false,
  isPanelSelected = false,
  controlPanelOptions = [],
  onUpdateWidgetLabel,
  onUpdateWidgetInputKind,
  onMoveWidget,
  onRemoveWidget,
  onMoveWidgetToPanel,
}: {
  panelId?: string;
  widgets: readonly ResolvedControlWidget[];
  isEditable?: boolean;
  isPanelSelected?: boolean;
  controlPanelOptions?: readonly ControlPanelTargetOption[];
  onUpdateWidgetLabel?: (panelId: string, widgetId: string, label: string) => void;
  onUpdateWidgetInputKind?: (
    panelId: string,
    widgetId: string,
    inputKind: 'text' | 'number' | 'slider' | 'boolean' | 'enum',
  ) => void;
  onMoveWidget?: (panelId: string, widgetId: string, direction: 'up' | 'down') => void;
  onRemoveWidget?: (panelId: string, widgetId: string) => void;
  onMoveWidgetToPanel?: (panelId: string, widgetId: string, targetPanelId: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {widgets.length === 0 ? (
        <div className="rounded border border-dashed border-slate-700 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
          No widgets defined.
        </div>
      ) : (
        widgets.map((widget) => (
          <ControlWidgetField
            key={widget.id}
            widget={widget}
            panelId={panelId ?? ''}
            isEditable={isEditable && Boolean(panelId)}
            isPanelSelected={isPanelSelected}
            controlPanelOptions={controlPanelOptions}
            onUpdateWidgetLabel={onUpdateWidgetLabel}
            onUpdateWidgetInputKind={onUpdateWidgetInputKind}
            onMoveWidget={onMoveWidget}
            onRemoveWidget={onRemoveWidget}
            onMoveWidgetToPanel={onMoveWidgetToPanel}
          />
        ))
      )}
    </div>
  );
}
