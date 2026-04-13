import type { AppConfig } from './runtime-config';
import { resolveAppConfig } from './runtime-config';

const resolved = resolveAppConfig(import.meta.env.VITE_CONTROL_PLANE_BASE_URL);

if (resolved.issues.length > 0) {
  resolved.issues.forEach((issue) => {
    console.warn(`[config] ${issue.message}`);
  });
}

if (import.meta.env.DEV) {
  console.info(`[config] Control plane base URL: ${resolved.controlPlaneBaseUrl} (${resolved.source})`);
}

export const config: AppConfig = {
  controlPlaneBaseUrl: resolved.controlPlaneBaseUrl,
  backendMode: resolved.backendMode,
  source: resolved.source,
  issues: resolved.issues,
};
