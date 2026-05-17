import { describe, expect, it } from 'vitest';
import { evaluateExpression, parseExpression } from './expression';

describe('expression parsing and evaluation', () => {
  it('parses and evaluates arithmetic with identifiers', () => {
    const parsed = parseExpression('1 + 2 * (a - 3)');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const evaluated = evaluateExpression(parsed.ast, (name) => (name === 'a' ? 5 : undefined));
    expect(evaluated).toEqual({ ok: true, value: 5 });
  });

  it('parses decimal and exponent number literals', () => {
    const parsed = parseExpression('400e3 / (2 * 3.141592653589793 * 75e3)');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const evaluated = evaluateExpression(parsed.ast, () => undefined);
    expect(evaluated).toEqual({ ok: true, value: 0.8488263631567752 });
  });

  it('rejects invalid expressions', () => {
    const parsed = parseExpression('1 +');
    expect(parsed.ok).toBe(false);
  });
});
