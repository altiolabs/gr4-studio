import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('remotePicker', {
  submit(endpoint) {
    return ipcRenderer.invoke('gr4-studio:remote-picker:submit', endpoint);
  },
  cancel() {
    return ipcRenderer.invoke('gr4-studio:remote-picker:cancel');
  },
});
