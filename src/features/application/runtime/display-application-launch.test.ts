import { describe, expect, it } from 'vitest';
import {
  buildDisplayApplicationUrl,
  readDisplayApplicationLaunchSnapshot,
  writeDisplayApplicationLaunchSnapshot,
} from './display-application-launch';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('display application launch handoff', () => {
  it('writes and reads a launch snapshot from storage', () => {
    const storage = createMemoryStorage();
    const snapshot = writeDisplayApplicationLaunchSnapshot(
      {
        sourceTabId: 'tab-1',
        sessionId: 'session-1',
        title: 'Application',
        mode: 'new_tab',
        executionState: 'running',
        panelEntries: [],
        layout: {
          version: 2,
          root: { kind: 'pane', panelId: 'panel-1' },
        },
      },
      storage,
    );

    expect(readDisplayApplicationLaunchSnapshot(snapshot.launchId, storage)).toEqual(snapshot);
  });

  it('builds browser and file-protocol route urls', () => {
    expect(
      buildDisplayApplicationUrl('launch-1', {
        protocol: 'http:',
        origin: 'http://localhost:5173',
      } as Location),
    ).toBe('http://localhost:5173/app-runtime/launch-1');

    expect(
      buildDisplayApplicationUrl('launch-1', {
        protocol: 'file:',
        href: 'file:///tmp/gr4-studio/index.html#/old',
      } as Location),
    ).toBe('file:///tmp/gr4-studio/index.html#/app-runtime/launch-1');
  });
});
