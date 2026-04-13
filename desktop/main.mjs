import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_NAME = 'gr4-studio';
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8080';
const DEFAULT_DEV_SERVER_URL = 'http://127.0.0.1:5173';
const RECENT_REMOTE_ENDPOINTS_FILE = 'recent-remote-endpoints.json';
const APP_ICON_CANDIDATES = ['apple-touch-icon.png', 'favicon-32x32.png', 'favicon-16x16.png', 'favicon.ico'];
let remotePickerResolve = null;
let mainWindow = null;
let remotePickerWindow = null;

function normalizeBackendUrl(input) {
  if (!input) {
    return null;
  }

  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function parseLaunchArgs(argv) {
  const args = argv.slice(2);
  const remoteIndex = args.findIndex((arg) => arg === '--remote' || arg.startsWith('--remote='));
  const localIndex = args.findIndex((arg) => arg === '--local');
  const envUrl = normalizeBackendUrl(process.env.GR4_STUDIO_CONTROL_PLANE_BASE_URL);

  if (envUrl) {
    return { mode: 'remote', remoteUrl: envUrl, promptForRemote: false };
  }

  if (localIndex !== -1 && remoteIndex === -1) {
    return { mode: 'local', remoteUrl: null, promptForRemote: false };
  }

  if (remoteIndex === -1) {
    return { mode: 'local', remoteUrl: null, promptForRemote: false };
  }

  const token = args[remoteIndex];
  if (token.includes('=')) {
    return { mode: 'remote', remoteUrl: normalizeBackendUrl(token.split('=', 2)[1]), promptForRemote: false };
  }

  const next = args[remoteIndex + 1];
  if (next && !next.startsWith('-')) {
    return { mode: 'remote', remoteUrl: normalizeBackendUrl(next), promptForRemote: false };
  }

  return { mode: 'remote', remoteUrl: null, promptForRemote: true };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function recentEndpointsPath() {
  return path.join(app.getPath('userData'), RECENT_REMOTE_ENDPOINTS_FILE);
}

async function loadRecentRemoteEndpoints() {
  try {
    const raw = await fs.readFile(recentEndpointsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.recentEndpoints) ? parsed.recentEndpoints : [];
    return items.map((item) => normalizeBackendUrl(String(item))).filter(Boolean);
  } catch {
    return [];
  }
}

async function saveRecentRemoteEndpoint(endpoint) {
  const normalized = normalizeBackendUrl(endpoint);
  if (!normalized) {
    return;
  }

  const recent = await loadRecentRemoteEndpoints();
  const next = [normalized, ...recent.filter((item) => item !== normalized)].slice(0, 8);
  await fs.mkdir(path.dirname(recentEndpointsPath()), { recursive: true });
  await fs.writeFile(recentEndpointsPath(), `${JSON.stringify({ recentEndpoints: next }, null, 2)}\n`, 'utf8');
}

async function resolveAppIconPath() {
  for (const candidate of APP_ICON_CANDIDATES) {
    const candidatePath = path.join(app.getAppPath(), candidate);
    try {
      await fs.access(candidatePath);
      return candidatePath;
    } catch {
      // Keep looking for the best available installed icon asset.
    }
  }

  return null;
}

function sendMenuCommand(command) {
  const targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
  if (!targetWindow) {
    return;
  }

  targetWindow.webContents.send('gr4-studio:menu-command', command);
}

function buildApplicationMenu() {
  return Menu.buildFromTemplate([
    {
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenuCommand('new'),
        },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendMenuCommand('open'),
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendMenuCommand('save'),
        },
        {
          label: 'Save As...',
          accelerator: 'Shift+CmdOrCtrl+S',
          click: () => sendMenuCommand('saveAs'),
        },
        {
          label: 'Rename...',
          accelerator: 'CmdOrCtrl+R',
          click: () => sendMenuCommand('rename'),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'delete' }, { role: 'selectAll' }],
    },
  ]);
}

function buildRemotePickerHtml(recentEndpoints, currentValue, appIconUrl) {
  const options = recentEndpoints
    .map((endpoint) => `<option value="${escapeHtml(endpoint)}">${escapeHtml(endpoint)}</option>`)
    .join('');
  const recentMarkup =
    recentEndpoints.length > 0
      ? `<label for="recent">Recent endpoints</label><select id="recent">${options}</select>`
      : `<p class="hint">No recent endpoints yet. Enter one manually.</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Connect to gr4cp</title>
    <style>
      :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: linear-gradient(135deg, #09111f, #0f172a 55%, #111827); color: #e5eefb; }
  .card { width: min(560px, calc(100vw - 48px)); border: 1px solid rgba(148,163,184,.24); border-radius: 18px; padding: 24px; background: rgba(15,23,42,.94); box-shadow: 0 20px 60px rgba(0,0,0,.35); }
  .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
  .brand-mark { width: 40px; height: 40px; flex: 0 0 auto; }
  .brand-name { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; }
      h1 { margin: 0 0 8px; font-size: 22px; }
      p { margin: 0 0 18px; color: #94a3b8; line-height: 1.5; }
      label { display: block; margin: 12px 0 8px; font-size: 13px; color: #cbd5e1; }
      input, select { width: 100%; box-sizing: border-box; border: 1px solid #334155; border-radius: 10px; background: #020617; color: #e5eefb; padding: 12px 14px; font-size: 14px; }
      input:focus, select:focus { outline: 2px solid #38bdf8; outline-offset: 2px; }
      .row { display: flex; gap: 12px; justify-content: flex-end; margin-top: 18px; }
      button { border: 0; border-radius: 10px; padding: 11px 16px; font-weight: 600; cursor: pointer; }
      .primary { background: #38bdf8; color: #082f49; }
      .secondary { background: #1e293b; color: #e2e8f0; }
      .hint { font-size: 12px; color: #64748b; }
      .stack { display: grid; gap: 8px; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="brand">
        <img class="brand-mark" src="${appIconUrl}" alt="" aria-hidden="true" />
        <div>
          <p class="brand-name">gr4-studio</p>
        </div>
      </div>
      <h1>Connect to a remote gr4cp</h1>
      <p>Choose a previously used endpoint or enter a new one.</p>
      <div class="stack">
        ${recentMarkup}
        <label for="endpoint">Endpoint</label>
        <input id="endpoint" type="url" value="${escapeHtml(currentValue)}" placeholder="http://127.0.0.1:8080" autofocus />
      </div>
      <div class="row">
        <button id="cancel" class="secondary" type="button">Cancel</button>
        <button id="connect" class="primary" type="button">Connect</button>
      </div>
    </div>
    <script>
      const endpoint = document.getElementById('endpoint');
      const recent = document.getElementById('recent');
      const connect = document.getElementById('connect');
      const cancel = document.getElementById('cancel');

      if (recent) {
        recent.addEventListener('change', () => {
          endpoint.value = recent.value;
        });
      }

      function submit() {
        window.remotePicker.submit(endpoint.value);
      }

      connect.addEventListener('click', submit);
      cancel.addEventListener('click', () => window.remotePicker.cancel());
      endpoint.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          submit();
        }
      });
    </script>
  </body>
</html>`;
}

function openRemotePicker(recentEndpoints) {
  return new Promise((resolve, reject) => {
    remotePickerWindow = new BrowserWindow({
      width: 620,
      height: 420,
      resizable: false,
      modal: true,
      show: false,
      title: `Connect to ${APP_NAME}`,
      backgroundColor: '#0f172a',
      webPreferences: {
        preload: path.join(app.getAppPath(), 'desktop', 'remote-picker-preload.mjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    remotePickerResolve = resolve;
    remotePickerWindow.once('closed', () => {
      remotePickerWindow = null;
      if (remotePickerResolve) {
        remotePickerResolve(null);
        remotePickerResolve = null;
      }
    });

    const appIconUrl = pathToFileURL(path.join(app.getAppPath(), 'favicon-32x32.png')).toString();
    const html = buildRemotePickerHtml(recentEndpoints, recentEndpoints[0] ?? '', appIconUrl);
    remotePickerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    remotePickerWindow.once('ready-to-show', () => remotePickerWindow?.show());
    remotePickerWindow.on('unresponsive', () => {
      reject(new Error('Remote endpoint picker became unresponsive'));
    });
  });
}

ipcMain.handle('gr4-studio:remote-picker:submit', async (_event, endpoint) => {
  const normalized = normalizeBackendUrl(String(endpoint));
  if (!normalized) {
    throw new Error('Please enter a valid http or https endpoint.');
  }

  await saveRecentRemoteEndpoint(normalized);
  const resolve = remotePickerResolve;
  remotePickerResolve = null;
  resolve?.(normalized);
  BrowserWindow.fromWebContents(_event.sender)?.close();
  return normalized;
});

ipcMain.handle('gr4-studio:remote-picker:cancel', async () => {
  const resolve = remotePickerResolve;
  remotePickerResolve = null;
  resolve?.(null);
  BrowserWindow.fromWebContents(_event.sender)?.close();
  return null;
});

function resolveStartUrl() {
  return process.env.GR4_STUDIO_DEV_SERVER_URL || null;
}

async function createWindow() {
  const devServerUrl = resolveStartUrl();
  // The launcher injects the resolved backend URL before the renderer loads.
  process.env.GR4_STUDIO_CONTROL_PLANE_BASE_URL =
    process.env.GR4_STUDIO_CONTROL_PLANE_BASE_URL || process.env.GR4_CONTROL_PLANE_URL || DEFAULT_BACKEND_URL;
  const appIconPath = await resolveAppIconPath();

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    backgroundColor: '#0f172a',
    title: APP_NAME,
    icon: appIconPath ?? undefined,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'desktop', 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (devServerUrl) {
    return mainWindow.loadURL(devServerUrl).then(() => mainWindow);
  }

  const appIndex = pathToFileURL(path.join(app.getAppPath(), 'index.html')).toString();
  return mainWindow.loadURL(appIndex).then(() => mainWindow);
}

async function bootstrap() {
  app.on('window-all-closed', () => {
    app.quit();
  });

  app.setName(APP_NAME);
  await app.whenReady();
  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_NAME);
  }
  Menu.setApplicationMenu(buildApplicationMenu());

  const appIconPath = await resolveAppIconPath();
  if (appIconPath && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(appIconPath);
  }

  const launch = parseLaunchArgs(process.argv);
  if (launch.remoteUrl) {
    process.env.GR4_STUDIO_BACKEND_MODE = 'remote';
    process.env.GR4_STUDIO_CONTROL_PLANE_BASE_URL = launch.remoteUrl;
    await saveRecentRemoteEndpoint(launch.remoteUrl);
  } else if (launch.promptForRemote) {
    const recentEndpoints = await loadRecentRemoteEndpoints();
    const chosen = await openRemotePicker(recentEndpoints);
    if (!chosen) {
      app.quit();
      return;
    }
    process.env.GR4_STUDIO_BACKEND_MODE = 'remote';
    process.env.GR4_STUDIO_CONTROL_PLANE_BASE_URL = chosen;
  } else if (!process.env.GR4_STUDIO_BACKEND_MODE) {
    process.env.GR4_STUDIO_BACKEND_MODE = 'local';
  }

  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
}

bootstrap().catch(async (error) => {
  console.error('[gr4-studio] Failed to start desktop app:', error);
  await dialog.showErrorBox('gr4-studio failed to start', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
  app.quit();
});
