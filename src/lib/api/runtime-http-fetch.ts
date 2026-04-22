import { toAppApiPath } from './client';
import { classifyRuntimeEndpointRouting, describeRuntimeEndpointRouting } from './endpoint-routing';

export function resolveRuntimeHttpFetchUrl(endpointUrl: string, isDev: boolean): string {
  if (classifyRuntimeEndpointRouting(endpointUrl) === 'app-api') {
    return toAppApiPath(endpointUrl);
  }

  if (!isDev) {
    return endpointUrl;
  }

  return `/__gr4studio/runtime-http-proxy?target=${encodeURIComponent(endpointUrl)}`;
}

export async function fetchRuntimeJsonPayload(endpointUrl: string, isDev = import.meta.env.DEV): Promise<unknown> {
  const resolvedUrl = resolveRuntimeHttpFetchUrl(endpointUrl, isDev);
  const routingKind = classifyRuntimeEndpointRouting(endpointUrl);
  const routingLabel = describeRuntimeEndpointRouting(routingKind);
  const response = await fetch(resolvedUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const prefix =
      routingKind === 'app-api'
        ? 'App API HTTP'
        : resolvedUrl === endpointUrl
          ? 'Legacy HTTP'
          : 'Legacy Proxy HTTP';
    throw new Error(`${prefix} ${response.status} (route=${routingLabel})`);
  }

  return response.json();
}
