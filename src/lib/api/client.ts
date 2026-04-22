import {
  classifyRuntimeEndpointRouting,
  describeRuntimeEndpointRouting,
} from './endpoint-routing';

export type ApiErrorCode = 'NETWORK' | 'HTTP' | 'PARSE';
export const APP_API_BASE_PATH = '/api';

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: ApiErrorCode,
    public readonly status?: number,
    public readonly details?: string,
    public readonly canonicalErrorCode?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

type JsonRequestOptions = RequestInit & {
  path: string;
};

export function toAppApiPath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (normalizedPath === APP_API_BASE_PATH || normalizedPath.startsWith(`${APP_API_BASE_PATH}/`)) {
    return normalizedPath;
  }

  return `${APP_API_BASE_PATH}${normalizedPath}`;
}

export function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return toAppApiPath(path);
}

type ParsedErrorEnvelope = {
  canonicalCode?: string;
  canonicalMessage?: string;
  legacyCode?: string;
  legacyMessage?: string;
};

function parseErrorEnvelope(bodyText: string): ParsedErrorEnvelope {
  if (!bodyText) {
    return {};
  }

  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { code?: unknown; message?: unknown };
      error_code?: unknown;
      error_message?: unknown;
    };

    return {
      canonicalCode: typeof parsed.error?.code === 'string' ? parsed.error.code : undefined,
      canonicalMessage: typeof parsed.error?.message === 'string' ? parsed.error.message : undefined,
      legacyCode: typeof parsed.error_code === 'string' ? parsed.error_code : undefined,
      legacyMessage: typeof parsed.error_message === 'string' ? parsed.error_message : undefined,
    };
  } catch {
    return {};
  }
}

export async function jsonRequest<T>({ path, ...init }: JsonRequestOptions): Promise<T> {
  let response: Response;
  const url = buildApiUrl(path);
  const routingKind = classifyRuntimeEndpointRouting(path);
  const routingLabel = describeRuntimeEndpointRouting(routingKind);

  try {
    response = await fetch(url, {
      ...init,
      cache: init.cache ?? 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    throw new ApiClientError(
      `${routingLabel} request failed for ${path}`,
      'NETWORK',
      undefined,
      error instanceof Error
        ? `route=${routingLabel} url=${url} cause=${error.message}`
        : `route=${routingLabel} url=${url} cause=unknown network error`,
    );
  }

  if (!response.ok) {
    let details = '';
    try {
      details = await response.text();
    } catch {
      details = '';
    }

    const parsed = parseErrorEnvelope(details);
    const message = parsed.canonicalMessage
      ? `${routingLabel} request failed: ${parsed.canonicalMessage}`
      : parsed.legacyMessage
        ? `${routingLabel} request failed: ${parsed.legacyMessage}`
        : `${routingLabel} request failed: ${response.status} ${response.statusText}`;

    throw new ApiClientError(
      message,
      'HTTP',
      response.status,
      details
        ? `route=${routingLabel} url=${url} upstream=${details}`
        : `route=${routingLabel} url=${url} upstream=${response.statusText}`,
      parsed.canonicalCode ?? parsed.legacyCode,
    );
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  let body = '';
  try {
    body = await response.text();
  } catch {
    body = '';
  }

  if (!body.trim()) {
    throw new ApiClientError(
      `Response body was empty for ${path}`,
      'PARSE',
      response.status,
      `status=${response.status} url=${url}`,
    );
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new ApiClientError(`Response was not valid JSON for ${path}`, 'PARSE');
  }
}
