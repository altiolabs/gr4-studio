const DEFAULT_CONTROL_PLANE_BASE_URL = 'http://localhost:8080';

export type ConfigSource = 'default' | 'env' | 'desktop';
export type BackendMode = 'local' | 'remote' | 'unknown';

export type ConfigIssue = {
  key: 'VITE_CONTROL_PLANE_BASE_URL' | 'GR4_STUDIO_CONTROL_PLANE_BASE_URL';
  message: string;
  fallbackValue: string;
};

export type AppConfig = {
  controlPlaneBaseUrl: string;
  backendMode: BackendMode;
  source: ConfigSource;
  issues: ConfigIssue[];
};

export type DesktopRuntimeConfig = {
  controlPlaneBaseUrl?: string;
  backendMode?: BackendMode;
};

function normalizeUrl(input: string | undefined, key: ConfigIssue['key']) {
  if (!input || input.trim().length === 0) {
    return {
      value: DEFAULT_CONTROL_PLANE_BASE_URL,
      source: 'default' as const,
      issues: [],
    };
  }

  try {
    const parsed = new URL(input);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Protocol must be http or https');
    }

    return {
      value: parsed.toString().replace(/\/$/, ''),
      source: key === 'GR4_STUDIO_CONTROL_PLANE_BASE_URL' ? ('desktop' as const) : ('env' as const),
      issues: [],
    };
  } catch {
    return {
      value: DEFAULT_CONTROL_PLANE_BASE_URL,
      source: 'default' as const,
      issues: [
        {
          key,
          message: `Invalid URL in ${key}; using local default.`,
          fallbackValue: DEFAULT_CONTROL_PLANE_BASE_URL,
        },
      ],
    };
  }
}

export function normalizeControlPlaneBaseUrl(input?: string, key: ConfigIssue['key'] = 'VITE_CONTROL_PLANE_BASE_URL') {
  return normalizeUrl(input, key);
}

export function readDesktopRuntimeConfig(): DesktopRuntimeConfig | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.gr4StudioRuntime;
}

export function resolveAppConfig(envBaseUrl?: string): AppConfig {
  const desktopConfig = readDesktopRuntimeConfig();
  const desktopBaseUrl = desktopConfig?.controlPlaneBaseUrl;
  const desktopBackendMode = desktopConfig?.backendMode ?? 'unknown';

  if (desktopBaseUrl) {
    const normalized = normalizeControlPlaneBaseUrl(desktopBaseUrl, 'GR4_STUDIO_CONTROL_PLANE_BASE_URL');
    return {
      controlPlaneBaseUrl: normalized.value,
      backendMode: desktopBackendMode,
      source: normalized.source,
      issues: normalized.issues,
    };
  }

  const envResolved = normalizeControlPlaneBaseUrl(envBaseUrl, 'VITE_CONTROL_PLANE_BASE_URL');
  return {
    controlPlaneBaseUrl: envResolved.value,
    backendMode: 'unknown',
    source: envResolved.source,
    issues: envResolved.issues,
  };
}
