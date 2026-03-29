import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentStore } from './document-store';
import { createUntitledDocumentIdentity } from './document-persistence-service';
import type { DocumentPersistenceCapabilities } from './document-persistence-capabilities';

function capabilities(): DocumentPersistenceCapabilities {
  return {
    canUseFileSystemAccessApi: false,
    canSaveInPlace: false,
    canPromptForSaveLocation: false,
    usesDownloadFallback: true,
    canOpenWithPicker: false,
  };
}

function resetStore() {
  useDocumentStore.setState({
    currentDocument: createUntitledDocumentIdentity(capabilities()),
    capabilities: capabilities(),
    isOpening: false,
    isSaving: false,
    isSaveAsInProgress: false,
    lastError: null,
    pendingDestructiveAction: 'none',
    showUnsavedChangesDialog: false,
  });
}

describe('document-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it('New on clean document proceeds with no unsaved dialog request', () => {
    const proceeded = useDocumentStore.getState().requestDestructiveAction('new');
    expect(proceeded).toBe(true);
    expect(useDocumentStore.getState().showUnsavedChangesDialog).toBe(false);
  });

  it('New on dirty document requests unsaved dialog', () => {
    const state = useDocumentStore.getState();
    useDocumentStore.setState({
      currentDocument: {
        ...state.currentDocument,
        isDirty: true,
      },
    });

    const proceeded = useDocumentStore.getState().requestDestructiveAction('new');
    expect(proceeded).toBe(false);
    expect(useDocumentStore.getState().showUnsavedChangesDialog).toBe(true);
    expect(useDocumentStore.getState().pendingDestructiveAction).toBe('new');
  });

  it('Open on dirty document requests unsaved dialog', () => {
    const state = useDocumentStore.getState();
    useDocumentStore.setState({
      currentDocument: {
        ...state.currentDocument,
        isDirty: true,
      },
    });

    const proceeded = useDocumentStore.getState().requestDestructiveAction('open');
    expect(proceeded).toBe(false);
    expect(useDocumentStore.getState().showUnsavedChangesDialog).toBe(true);
    expect(useDocumentStore.getState().pendingDestructiveAction).toBe('open');
  });

  it('dirty tracking compares current hash with last persisted hash', () => {
    useDocumentStore.getState().initializeLastPersistedHash('hash-v1');
    useDocumentStore.getState().setDirtyFromCurrentHash('hash-v1');
    expect(useDocumentStore.getState().currentDocument.isDirty).toBe(false);

    useDocumentStore.getState().setDirtyFromCurrentHash('hash-v2');
    expect(useDocumentStore.getState().currentDocument.isDirty).toBe(true);
  });

  it('clearPendingDestructiveAction resets dialog state', () => {
    useDocumentStore.setState({
      pendingDestructiveAction: 'open',
      showUnsavedChangesDialog: true,
    });
    useDocumentStore.getState().clearPendingDestructiveAction();
    expect(useDocumentStore.getState().pendingDestructiveAction).toBe('none');
    expect(useDocumentStore.getState().showUnsavedChangesDialog).toBe(false);
  });
});
