const DEFAULT_GRCTRL_BASE_URL = 'http://localhost:8080';

type ConfigSource = 'default' | 'env';

type ConfigIssue = {
  key: 'VITE_CONTROL_PLANE_BASE_URL';
  message: string;
  fallbackValue: string;
};

export type AppConfig = {
  controlPlaneBaseUrl: string;
  source: ConfigSource;
  issues: ConfigIssue[];
};

function normalizeBaseUrl(input?: string): { value: string; source: ConfigSource; issues: ConfigIssue[] } {
  if (!input || input.trim().length === 0) {
    return {
      value: DEFAULT_GRCTRL_BASE_URL,
      source: 'default',
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
      source: 'env',
      issues: [],
    };
  } catch {
    return {
      value: DEFAULT_GRCTRL_BASE_URL,
      source: 'default',
      issues: [
        {
          key: 'VITE_CONTROL_PLANE_BASE_URL',
          message: 'Invalid URL in VITE_CONTROL_PLANE_BASE_URL; using local default.',
          fallbackValue: DEFAULT_GRCTRL_BASE_URL,
        },
      ],
    };
  }
}

const resolved = normalizeBaseUrl(import.meta.env.VITE_CONTROL_PLANE_BASE_URL);

if (resolved.issues.length > 0) {
  resolved.issues.forEach((issue) => {
    console.warn(`[config] ${issue.message}`);
  });
}

if (import.meta.env.DEV) {
  console.info(`[config] Control plane base URL: ${resolved.value} (${resolved.source})`);
}

export const config: AppConfig = {
  controlPlaneBaseUrl: resolved.value,
  source: resolved.source,
  issues: resolved.issues,
};
