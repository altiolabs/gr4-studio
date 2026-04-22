import {
  classifyRuntimeEndpointRouting,
  describeRuntimeEndpointRouting,
  type RuntimeEndpointRoutingKind,
} from './endpoint-routing';

export type BrowserLocationLike = {
  protocol: string;
  host: string;
};

export function describeWebSocketTransport(endpoint: string): {
  routingKind: RuntimeEndpointRoutingKind;
  routingLabel: string;
} {
  const routingKind = classifyRuntimeEndpointRouting(endpoint);
  return {
    routingKind,
    routingLabel: describeRuntimeEndpointRouting(routingKind),
  };
}

function resolveBrowserLocation(): BrowserLocationLike | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.location;
}

export function resolveWebSocketUrl(
  endpoint: string,
  {
    browserLocation = resolveBrowserLocation(),
  }: {
    browserLocation?: BrowserLocationLike;
  } = {},
): string {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return trimmed;
  }

  if (trimmed.startsWith('http://')) {
    return `ws://${trimmed.slice('http://'.length)}`;
  }

  if (trimmed.startsWith('https://')) {
    return `wss://${trimmed.slice('https://'.length)}`;
  }

  if (classifyRuntimeEndpointRouting(trimmed) === 'app-api') {
    if (browserLocation) {
      const scheme = browserLocation.protocol === 'https:' ? 'wss' : 'ws';
      return `${scheme}://${browserLocation.host}${trimmed}`;
    }
    return trimmed;
  }

  return `ws://${trimmed}`;
}
