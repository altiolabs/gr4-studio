import type { ApplicationMode, StudioLayoutSpec } from '../../graph-document/model/studio-workspace';
import type { ExecutionState } from '../../runtime-session/store/runtimeSessionStore';
import type { WorkspacePanelViewModel } from '../../workspace/workspace-view';

const STORAGE_PREFIX = 'gr4-studio:display-application:';

export type DisplayApplicationLaunchSnapshot = {
  launchId: string;
  sourceTabId: string;
  sessionId: string;
  title: string;
  mode: Extract<ApplicationMode, 'new_tab' | 'popout'>;
  executionState: ExecutionState;
  panelEntries: WorkspacePanelViewModel[];
  layout: StudioLayoutSpec;
  createdAt: string;
};

function createLaunchId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function storageKey(launchId: string): string {
  return `${STORAGE_PREFIX}${launchId}`;
}

export function writeDisplayApplicationLaunchSnapshot(
  input: Omit<DisplayApplicationLaunchSnapshot, 'launchId' | 'createdAt'>,
  storage: Storage = window.localStorage,
): DisplayApplicationLaunchSnapshot {
  const snapshot: DisplayApplicationLaunchSnapshot = {
    ...input,
    launchId: createLaunchId(),
    createdAt: new Date().toISOString(),
  };
  storage.setItem(storageKey(snapshot.launchId), JSON.stringify(snapshot));
  return snapshot;
}

export function readDisplayApplicationLaunchSnapshot(
  launchId: string,
  storage: Storage = window.localStorage,
): DisplayApplicationLaunchSnapshot | null {
  const raw = storage.getItem(storageKey(launchId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as DisplayApplicationLaunchSnapshot;
    if (!parsed || parsed.launchId !== launchId || !parsed.sessionId || !Array.isArray(parsed.panelEntries)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function buildDisplayApplicationUrl(launchId: string, location: Location = window.location): string {
  if (location.protocol === 'file:') {
    const base = location.href.split('#')[0];
    return `${base}#/app-runtime/${encodeURIComponent(launchId)}`;
  }
  return `${location.origin}/app-runtime/${encodeURIComponent(launchId)}`;
}
