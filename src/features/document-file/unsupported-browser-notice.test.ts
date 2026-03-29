import { describe, expect, it, vi } from 'vitest';
import { dismissUnsupportedBrowserNotice, shouldShowUnsupportedBrowserNotice, UNSUPPORTED_BROWSER_NOTICE_KEY } from './unsupported-browser-notice';
import type { DocumentPersistenceCapabilities } from './document-persistence-capabilities';

function capabilities(overrides: Partial<DocumentPersistenceCapabilities> = {}): DocumentPersistenceCapabilities {
  return {
    canUseFileSystemAccessApi: false,
    canSaveInPlace: false,
    canPromptForSaveLocation: false,
    usesDownloadFallback: true,
    canOpenWithPicker: false,
    ...overrides,
  };
}

describe('unsupported browser notice', () => {
  it('shows notice only when File System Access API is unsupported and not dismissed', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(null),
    };

    expect(
      shouldShowUnsupportedBrowserNotice(capabilities(), storage),
    ).toBe(true);
    expect(
      shouldShowUnsupportedBrowserNotice(
        capabilities({
          canUseFileSystemAccessApi: true,
          canSaveInPlace: true,
          canPromptForSaveLocation: true,
          canOpenWithPicker: true,
          usesDownloadFallback: false,
        }),
        storage,
      ),
    ).toBe(false);
  });

  it('respects persisted dismissal flag', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue('1'),
    };
    expect(shouldShowUnsupportedBrowserNotice(capabilities(), storage)).toBe(false);
  });

  it('writes dismissal flag', () => {
    const storage = {
      setItem: vi.fn(),
    };
    dismissUnsupportedBrowserNotice(storage);
    expect(storage.setItem).toHaveBeenCalledWith(UNSUPPORTED_BROWSER_NOTICE_KEY, '1');
  });
});
