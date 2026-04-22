export type RuntimeEndpointRoutingKind = 'app-api' | 'legacy-direct';

export function classifyRuntimeEndpointRouting(endpoint: string): RuntimeEndpointRoutingKind {
  const trimmed = endpoint.trim();
  if (trimmed.startsWith('/')) {
    return 'app-api';
  }

  return 'legacy-direct';
}

export function describeRuntimeEndpointRouting(kind: RuntimeEndpointRoutingKind): string {
  if (kind === 'app-api') {
    return 'app-api';
  }

  return 'legacy-direct';
}
