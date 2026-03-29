import { beforeEach, describe, expect, it } from 'vitest';
import { createUntitledDocumentIdentity } from '../../document-file/document-persistence-service';
import { serializeEditorSnapshot } from '../../document-file/document-serialization';
import { useGraphTabsStore, type EditorSnapshot } from './graphTabsStore';

function emptySnapshot(name: string): EditorSnapshot {
  return {
    metadata: {
      name,
      description: undefined,
    },
    nodes: [],
    edges: [],
  };
}

function resetStore() {
  useGraphTabsStore.setState({
    tabs: [],
    activeTabId: null,
    initialized: false,
  });
}

function fallbackCapabilities() {
  return {
    canUseFileSystemAccessApi: false,
    canSaveInPlace: false,
    canPromptForSaveLocation: false,
    usesDownloadFallback: true,
    canOpenWithPicker: false,
  };
}

describe('graphTabsStore per-tab document state', () => {
  beforeEach(() => {
    resetStore();
  });

  it('initializes and creates independent per-tab document state', () => {
    useGraphTabsStore.getState().initializeFromSnapshot(emptySnapshot('Untitled.gr4s'));
    const firstTab = useGraphTabsStore.getState().tabs[0];
    expect(firstTab.document.displayName).toBe('Untitled.gr4s');
    expect(firstTab.document.isDirty).toBe(false);

    const secondDocument = createUntitledDocumentIdentity(fallbackCapabilities());
    const secondSnapshot = emptySnapshot('Second.gr4s');
    const secondTab = useGraphTabsStore.getState().createTab({
      snapshot: secondSnapshot,
      document: {
        ...secondDocument,
        displayName: 'Second.gr4s',
        lastPersistedContentHash: serializeEditorSnapshot(secondSnapshot).contentHash,
      },
    });

    expect(useGraphTabsStore.getState().tabs).toHaveLength(2);
    expect(useGraphTabsStore.getState().activeTabId).toBe(secondTab.id);
    expect(useGraphTabsStore.getState().tabs[0].document.displayName).toBe('Untitled.gr4s');
  });

  it('switching tabs keeps independent dirty and backing state', () => {
    useGraphTabsStore.getState().initializeFromSnapshot(emptySnapshot('TabA.gr4s'));
    const tabAId = useGraphTabsStore.getState().activeTabId as string;
    useGraphTabsStore.getState().patchTabDocument(tabAId, (current) => ({
      ...current,
      isDirty: true,
      hasWritableBacking: false,
    }));

    const tabBDocument = createUntitledDocumentIdentity(fallbackCapabilities());
    const tabBSnapshot = emptySnapshot('TabB.gr4s');
    const tabB = useGraphTabsStore.getState().createTab({
      snapshot: tabBSnapshot,
      document: {
        ...tabBDocument,
        displayName: 'TabB.gr4s',
        hasWritableBacking: true,
        sourceKind: 'file_handle',
        isDirty: false,
        lastPersistedContentHash: serializeEditorSnapshot(tabBSnapshot).contentHash,
      },
    });

    useGraphTabsStore.getState().setActiveTab(tabAId);
    const tabA = useGraphTabsStore.getState().tabs.find((tab) => tab.id === tabAId);
    const tabBAfter = useGraphTabsStore.getState().tabs.find((tab) => tab.id === tabB.id);

    expect(tabA?.document.isDirty).toBe(true);
    expect(tabBAfter?.document.hasWritableBacking).toBe(true);
    expect(tabBAfter?.document.sourceKind).toBe('file_handle');
  });

  it('rename updates tab display name without mutating backing handle', () => {
    useGraphTabsStore.getState().initializeFromSnapshot(emptySnapshot('Original.gr4s'));
    const tabId = useGraphTabsStore.getState().activeTabId as string;
    const backingHandle = { name: 'disk-name.gr4s' } as unknown as FileSystemFileHandle;
    useGraphTabsStore.getState().patchTabDocument(tabId, (current) => ({
      ...current,
      fileHandle: backingHandle,
      hasWritableBacking: true,
      sourceKind: 'file_handle',
    }));

    useGraphTabsStore.getState().renameTabDocument(tabId, 'Renamed In App.gr4s');
    const renamedTab = useGraphTabsStore.getState().tabs.find((tab) => tab.id === tabId);

    expect(renamedTab?.document.displayName).toBe('Renamed In App.gr4s');
    expect(renamedTab?.document.fileHandle).toBe(backingHandle);
    expect(renamedTab?.snapshot.metadata.name).toBe('Renamed In App.gr4s');
  });

  it('reports when any tab is dirty', () => {
    useGraphTabsStore.getState().initializeFromSnapshot(emptySnapshot('TabA.gr4s'));
    expect(useGraphTabsStore.getState().anyDirty()).toBe(false);

    const tabAId = useGraphTabsStore.getState().activeTabId as string;
    useGraphTabsStore.getState().patchTabDocument(tabAId, (current) => ({
      ...current,
      isDirty: true,
    }));

    expect(useGraphTabsStore.getState().anyDirty()).toBe(true);
  });

  it('new untitled tabs default to .gr4s extension', () => {
    useGraphTabsStore.getState().initializeFromSnapshot(emptySnapshot('Untitled.gr4s'));
    const second = useGraphTabsStore.getState().createTab();

    expect(second.document.displayName.endsWith('.gr4s')).toBe(true);
    expect(second.snapshot.metadata.name.endsWith('.gr4s')).toBe(true);
  });

  it('does not let late initialization overwrite tabs created first', () => {
    const openedSnapshot = emptySnapshot('Opened.gr4s');
    const created = useGraphTabsStore.getState().createTab({
      snapshot: openedSnapshot,
      document: {
        ...createUntitledDocumentIdentity(fallbackCapabilities()),
        displayName: 'Opened.gr4s',
        lastPersistedContentHash: serializeEditorSnapshot(openedSnapshot).contentHash,
      },
    });

    useGraphTabsStore.getState().initializeFromSnapshot(emptySnapshot('LateInit.gr4s'));

    const state = useGraphTabsStore.getState();
    expect(state.initialized).toBe(true);
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.id).toBe(created.id);
    expect(state.tabs[0]?.snapshot.metadata.name).toBe('Opened.gr4s');
  });
});
