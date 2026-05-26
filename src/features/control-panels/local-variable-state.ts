import type { ResolvedControlWidget } from './control-panel-binding-resolution';
import type { ExpressionBinding } from '../variables/model/types';

export type LocalVariableControlValues = Record<string, string>;

function stringifyLocalValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return typeof value === 'string' ? value : String(value);
}

export function localVariableKey(widget: ResolvedControlWidget): string | null {
  if (widget.binding.kind !== 'variable') {
    return null;
  }
  return widget.binding.variableName;
}

export function expressionBindingToLocalValue(binding: ExpressionBinding): string {
  if (binding.kind === 'expression') {
    return binding.expr;
  }
  return stringifyLocalValue(binding.value);
}

export function applyLocalVariableControlValues(
  widgets: readonly ResolvedControlWidget[],
  values: LocalVariableControlValues,
): ResolvedControlWidget[] {
  return widgets.map((widget) => {
    const key = localVariableKey(widget);
    if (!key || !(key in values)) {
      return widget;
    }
    return {
      ...widget,
      currentValue: values[key],
    };
  });
}
