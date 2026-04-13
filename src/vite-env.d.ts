/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTROL_PLANE_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  gr4StudioRuntime?: {
    readonly controlPlaneBaseUrl?: string;
    readonly backendMode?: 'local' | 'remote' | 'unknown';
  };
  gr4StudioShell?: {
    readonly onMenuCommand?: (callback: (command: 'new' | 'open' | 'save' | 'saveAs' | 'rename') => void) => () => void;
  };
}
