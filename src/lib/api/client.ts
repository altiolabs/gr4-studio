import { config } from '../config';

export type ApiErrorCode = 'NETWORK' | 'HTTP' | 'PARSE';

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

export function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (import.meta.env.DEV) {
    return normalizedPath;
  }

  return `${config.controlPlaneBaseUrl}${normalizedPath}`;
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

  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    throw new ApiClientError(
      `Failed to reach backend for ${path}`,
      'NETWORK',
      undefined,
      error instanceof Error ? `${error.message} (url: ${url})` : `Unknown network error (url: ${url})`,
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
    const message =
      parsed.canonicalMessage ?? parsed.legacyMessage ?? `Request failed: ${response.status} ${response.statusText}`;

    throw new ApiClientError(
      message,
      'HTTP',
      response.status,
      details || response.statusText,
      parsed.canonicalCode ?? parsed.legacyCode,
    );
  }

  let body = '';
  try {
    body = await response.text();
  } catch {
    body = '';
  }

  if (!body.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new ApiClientError(`Response was not valid JSON for ${path}`, 'PARSE');
  }
}
