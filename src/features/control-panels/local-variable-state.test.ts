import { describe, expect, it } from 'vitest';
import {
  applyLocalVariableControlValues,
  expressionBindingToLocalValue,
  localVariableKey,
} from './local-variable-state';
import type { ResolvedControlWidget } from './control-panel-binding-resolution';

const variableWidget: ResolvedControlWidget = {
  id: 'var-gain',
  label: 'Gain',
  binding: {
    kind: 'variable',
    variableName: 'gain',
  },
  inputKind: 'number',
  currentValue: '1',
  state: 'ready',
};

const parameterWidget: ResolvedControlWidget = {
  id: 'param-gain',
  label: 'Gain',
  binding: {
    kind: 'parameter',
    nodeId: 'node-1',
    parameterName: 'gain',
  },
  inputKind: 'number',
  currentValue: '1',
  state: 'ready',
};

describe('local variable control state', () => {
  it('uses variable name as the local state key', () => {
    expect(localVariableKey(variableWidget)).toBe('gain');
    expect(localVariableKey(parameterWidget)).toBeNull();
  });

  it('converts literal and expression bindings into local display text', () => {
    expect(expressionBindingToLocalValue({ kind: 'literal', value: 1.5 })).toBe('1.5');
    expect(expressionBindingToLocalValue({ kind: 'literal', value: true })).toBe('true');
    expect(expressionBindingToLocalValue({ kind: 'literal', value: null })).toBe('');
    expect(expressionBindingToLocalValue({ kind: 'expression', expr: 'gain + 1' })).toBe('gain + 1');
  });

  it('overrides variable widgets without changing parameter widgets', () => {
    const [nextVariable, nextParameter] = applyLocalVariableControlValues(
      [variableWidget, parameterWidget],
      { gain: '2.5' },
    );

    expect(nextVariable.currentValue).toBe('2.5');
    expect(nextParameter.currentValue).toBe('1');
  });
});
