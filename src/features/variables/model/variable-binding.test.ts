import { describe, expect, it } from 'vitest';
import { bindingTextToExpressionBinding, createNextVariableName, expressionBindingToText } from './variable-binding';

describe('variable binding helpers', () => {
  it('auto-detects literal and expression input', () => {
    expect(bindingTextToExpressionBinding('100')).toEqual({
      kind: 'literal',
      value: 100,
    });
    expect(bindingTextToExpressionBinding('true')).toEqual({
      kind: 'literal',
      value: true,
    });
    expect(bindingTextToExpressionBinding('null')).toEqual({
      kind: 'literal',
      value: null,
    });
    expect(bindingTextToExpressionBinding('"hello"')).toEqual({
      kind: 'literal',
      value: 'hello',
    });
    expect(bindingTextToExpressionBinding('center_freq / 2')).toEqual({
      kind: 'expression',
      expr: 'center_freq / 2',
    });
  });

  it('formats literal strings with quotes and numbers plainly', () => {
    expect(expressionBindingToText({ kind: 'literal', value: 'hello' })).toBe('"hello"');
    expect(expressionBindingToText({ kind: 'literal', value: 10 })).toBe('10');
    expect(expressionBindingToText({ kind: 'expression', expr: 'a + 1' })).toBe('a + 1');
  });

  it('creates sequential default variable names', () => {
    expect(createNextVariableName([])).toBe('var1');
    expect(createNextVariableName(['var1'])).toBe('var2');
    expect(createNextVariableName(['var1', 'var2'])).toBe('var3');
  });
});
