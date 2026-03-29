import type { DocumentPersistenceCapabilities } from './document-persistence-capabilities';

export const UNSUPPORTED_BROWSER_NOTICE_KEY = 'gr4studio.unsupported_fs_notice.dismissed';

function readFlag(storage: Pick<Storage, 'getItem'>): boolean {
  return storage.getItem(UNSUPPORTED_BROWSER_NOTICE_KEY) === '1';
}

export function shouldShowUnsupportedBrowserNotice(
  capabilities: DocumentPersistenceCapabilities,
  storage: Pick<Storage, 'getItem'>,
): boolean {
  if (capabilities.canUseFileSystemAccessApi) {
    return false;
  }
  try {
    return !readFlag(storage);
  } catch {
    return true;
  }
}

export function dismissUnsupportedBrowserNotice(storage: Pick<Storage, 'setItem'>): void {
  try {
    storage.setItem(UNSUPPORTED_BROWSER_NOTICE_KEY, '1');
  } catch {
    // Ignore storage write failures; notice simply won't persist dismissal.
  }
}
