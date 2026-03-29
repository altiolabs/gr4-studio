export type DocumentPersistenceCapabilities = {
  canUseFileSystemAccessApi: boolean;
  canSaveInPlace: boolean;
  canPromptForSaveLocation: boolean;
  usesDownloadFallback: boolean;
  canOpenWithPicker: boolean;
};

type FileSystemWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
    excludeAcceptAllOption?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
    excludeAcceptAllOption?: boolean;
  }) => Promise<FileSystemFileHandle>;
};

export function detectDocumentPersistenceCapabilities(win: Window = window): DocumentPersistenceCapabilities {
  const typedWindow = win as FileSystemWindow;
  const canUseFileSystemAccessApi =
    typeof typedWindow.showOpenFilePicker === 'function' &&
    typeof typedWindow.showSaveFilePicker === 'function';

  return {
    canUseFileSystemAccessApi,
    canSaveInPlace: canUseFileSystemAccessApi,
    canPromptForSaveLocation: canUseFileSystemAccessApi,
    usesDownloadFallback: !canUseFileSystemAccessApi,
    canOpenWithPicker: canUseFileSystemAccessApi,
  };
}
