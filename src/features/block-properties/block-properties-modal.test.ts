import { describe, expect, it } from 'vitest';
import { coerceBlockPropertyLiteralValue } from './block-properties-modal';

describe('coerceBlockPropertyLiteralValue', () => {
  it('preserves float-like text as text', () => {
    expect(coerceBlockPropertyLiteralValue('20000000.0')).toBe('20000000.0');
  });

  it('preserves other non-special literal text verbatim', () => {
    expect(coerceBlockPropertyLiteralValue(' 1.25 ')).toBe(' 1.25 ');
  });

  it('still coerces boolean and null literals', () => {
    expect(coerceBlockPropertyLiteralValue('true')).toBe(true);
    expect(coerceBlockPropertyLiteralValue('false')).toBe(false);
    expect(coerceBlockPropertyLiteralValue('null')).toBeNull();
  });
});
