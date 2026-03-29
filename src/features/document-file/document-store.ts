import { create } from 'zustand';
import { detectDocumentPersistenceCapabilities, type DocumentPersistenceCapabilities } from './document-persistence-capabilities';
import { createUntitledDocumentIdentity, type DocumentIdentityState } from './document-persistence-service';

export type PendingDestructiveAction = 'none' | 'new' | 'open';

type DocumentStoreState = {
  currentDocument: DocumentIdentityState;
  capabilities: DocumentPersistenceCapabilities;
  isOpening: boolean;
  isSaving: boolean;
  isSaveAsInProgress: boolean;
  lastError: string | null;
  lastStatusMessage: string | null;
  pendingDestructiveAction: PendingDestructiveAction;
  showUnsavedChangesDialog: boolean;
  initializeLastPersistedHash: (hash: string) => void;
  setCurrentDocument: (document: DocumentIdentityState) => void;
  setDirtyFromCurrentHash: (currentHash: string) => void;
  setSaving: (saving: boolean) => void;
  setSaveAsInProgress: (saving: boolean) => void;
  setOpening: (opening: boolean) => void;
  setLastError: (error: string | null) => void;
  setLastStatusMessage: (status: string | null) => void;
  requestDestructiveAction: (action: Exclude<PendingDestructiveAction, 'none'>) => boolean;
  clearPendingDestructiveAction: () => void;
};

const initialCapabilities = typeof window !== 'undefined'
  ? detectDocumentPersistenceCapabilities(window)
  : {
      canUseFileSystemAccessApi: false,
      canSaveInPlace: false,
      canPromptForSaveLocation: false,
      usesDownloadFallback: true,
      canOpenWithPicker: false,
    };

export const useDocumentStore = create<DocumentStoreState>((set, get) => ({
  currentDocument: createUntitledDocumentIdentity(initialCapabilities),
  capabilities: initialCapabilities,
  isOpening: false,
  isSaving: false,
  isSaveAsInProgress: false,
  lastError: null,
  lastStatusMessage: null,
  pendingDestructiveAction: 'none',
  showUnsavedChangesDialog: false,

  initializeLastPersistedHash: (hash) => {
    const current = get().currentDocument;
    if (current.lastPersistedContentHash) {
      return;
    }
    set({
      currentDocument: {
        ...current,
        lastPersistedContentHash: hash,
      },
    });
  },

  setCurrentDocument: (document) => {
    set({
      currentDocument: document,
      lastError: null,
    });
  },

  setDirtyFromCurrentHash: (currentHash) => {
    const current = get().currentDocument;
    const persistedHash = current.lastPersistedContentHash;
    if (!persistedHash) {
      return;
    }

    const nextDirty = currentHash !== persistedHash;
    if (nextDirty === current.isDirty) {
      return;
    }

    set({
      currentDocument: {
        ...current,
        isDirty: nextDirty,
      },
    });
  },

  setSaving: (saving) => {
    set({ isSaving: saving });
  },

  setSaveAsInProgress: (saving) => {
    set({ isSaveAsInProgress: saving });
  },

  setOpening: (opening) => {
    set({ isOpening: opening });
  },

  setLastError: (error) => {
    set({ lastError: error });
  },

  setLastStatusMessage: (status) => {
    set({ lastStatusMessage: status });
  },

  requestDestructiveAction: (action) => {
    const isDirty = get().currentDocument.isDirty;
    if (!isDirty) {
      return true;
    }

    set({
      pendingDestructiveAction: action,
      showUnsavedChangesDialog: true,
    });
    return false;
  },

  clearPendingDestructiveAction: () => {
    set({
      pendingDestructiveAction: 'none',
      showUnsavedChangesDialog: false,
    });
  },
}));
