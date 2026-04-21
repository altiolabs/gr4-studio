export function resolveRuntimeHttpFetchUrl(endpointUrl: string, isDev: boolean): string {
  if (!isDev) {
    return endpointUrl;
  }

  if (endpointUrl.startsWith('/')) {
    return endpointUrl;
  }

  return `/__gr4studio/runtime-http-proxy?target=${encodeURIComponent(endpointUrl)}`;
}

export async function fetchRuntimeJsonPayload(endpointUrl: string, isDev = import.meta.env.DEV): Promise<unknown> {
  const resolvedUrl = resolveRuntimeHttpFetchUrl(endpointUrl, isDev);
  const response = await fetch(resolvedUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const prefix = resolvedUrl === endpointUrl ? 'HTTP' : 'Proxy HTTP';
    throw new Error(`${prefix} ${response.status}`);
  }

  return response.json();
}
