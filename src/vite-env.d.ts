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
    readonly getBootStatus?: () => Promise<{
      phase: 'starting' | 'waiting-backend' | 'ready' | 'error';
      message: string;
      controlPlaneBaseUrl: string;
      backendMode: 'local' | 'remote' | 'unknown';
      source: 'default' | 'explicit';
      appServerOrigin?: string;
      probePath?: string;
      currentSessionRouting: 'app-api';
    }>;
    readonly onBootStatus?: (
      callback: (status: {
        phase: 'starting' | 'waiting-backend' | 'ready' | 'error';
        message: string;
        controlPlaneBaseUrl: string;
        backendMode: 'local' | 'remote' | 'unknown';
        source: 'default' | 'explicit';
        appServerOrigin?: string;
        probePath?: string;
        currentSessionRouting: 'app-api';
      }) => void,
    ) => () => void;
    readonly onMenuCommand?: (callback: (command: 'new' | 'open' | 'save' | 'saveAs' | 'rename') => void) => () => void;
  };
}
