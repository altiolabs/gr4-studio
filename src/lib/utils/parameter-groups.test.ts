import { describe, expect, it } from 'vitest';
import { isAdvancedParameterName, isAdvancedUiHint, isReadOnlyRuntimeMutability } from './parameter-groups';

describe('parameter group helpers', () => {
  it('matches known advanced parameter names', () => {
    expect(isAdvancedParameterName('name')).toBe(true);
    expect(isAdvancedParameterName(' compute_domain ')).toBe(true);
    expect(isAdvancedParameterName('sample_rate')).toBe(false);
  });

  it('matches advanced ui hints', () => {
    expect(isAdvancedUiHint('advanced')).toBe(true);
    expect(isAdvancedUiHint('show:advanced')).toBe(true);
    expect(isAdvancedUiHint('Advanced only')).toBe(true);
    expect(isAdvancedUiHint('')).toBe(false);
    expect(isAdvancedUiHint(undefined)).toBe(false);
  });

  it('matches read-only runtime mutability variants', () => {
    expect(isReadOnlyRuntimeMutability('immutable')).toBe(true);
    expect(isReadOnlyRuntimeMutability('read_only')).toBe(true);
    expect(isReadOnlyRuntimeMutability('readonly')).toBe(true);
    expect(isReadOnlyRuntimeMutability('const')).toBe(true);
    expect(isReadOnlyRuntimeMutability('fixed')).toBe(true);
    expect(isReadOnlyRuntimeMutability('mutable')).toBe(false);
    expect(isReadOnlyRuntimeMutability(undefined)).toBe(false);
  });
});
