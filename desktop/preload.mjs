import { contextBridge, ipcRenderer } from 'electron';

const controlPlaneBaseUrl =
  process.env.GR4_STUDIO_CONTROL_PLANE_BASE_URL || process.env.GR4_CONTROL_PLANE_URL || 'http://localhost:8080';
const backendMode = process.env.GR4_STUDIO_BACKEND_MODE || 'unknown';

// The renderer reads this injected runtime config before falling back to Vite env defaults.
contextBridge.exposeInMainWorld('gr4StudioRuntime', {
  controlPlaneBaseUrl,
  backendMode,
});

contextBridge.exposeInMainWorld('gr4StudioShell', {
  onMenuCommand(callback) {
    const listener = (_event, command) => {
      callback(command);
    };

    ipcRenderer.on('gr4-studio:menu-command', listener);
    return () => {
      ipcRenderer.removeListener('gr4-studio:menu-command', listener);
    };
  },
});
