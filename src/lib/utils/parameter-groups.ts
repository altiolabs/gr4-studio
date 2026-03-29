const ADVANCED_PARAMETER_NAMES = new Set([
  'name',
  'compute_domain',
  'ui_constraints',
  'disconnect_on_done',
]);

export function isAdvancedParameterName(name: string): boolean {
  return ADVANCED_PARAMETER_NAMES.has(name.trim().toLowerCase());
}

function normalizeHint(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function isAdvancedUiHint(uiHint: string | undefined): boolean {
  const hint = normalizeHint(uiHint);
  if (!hint) {
    return false;
  }

  // Accept both token and free-form hint styles from varying backends.
  return hint === 'advanced' || hint.includes('advanced');
}

export function isReadOnlyRuntimeMutability(runtimeMutability: string | undefined): boolean {
  const value = normalizeHint(runtimeMutability);
  if (!value) {
    return false;
  }

  // Be resilient to naming drift between control-plane implementations.
  return (
    value === 'immutable' ||
    value === 'readonly' ||
    value === 'read_only' ||
    value === 'const' ||
    value === 'constant' ||
    value === 'fixed'
  );
}
