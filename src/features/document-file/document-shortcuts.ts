export type DocumentShortcutHandlers = {
  onSave: () => void;
  onSaveAs: () => void;
  onOpen: () => void;
  onNew: () => void;
};

export type DocumentShortcutOptions = {
  disabled?: boolean;
};

export function handleDocumentShortcutKeydown(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key' | 'preventDefault'>,
  handlers: DocumentShortcutHandlers,
  options: DocumentShortcutOptions = {},
): boolean {
  if (options.disabled) {
    return false;
  }

  const modifierPressed = event.ctrlKey || event.metaKey;
  if (!modifierPressed) {
    return false;
  }

  const key = event.key.toLowerCase();
  if (key === 's' && event.shiftKey) {
    event.preventDefault();
    handlers.onSaveAs();
    return true;
  }
  if (key === 's') {
    event.preventDefault();
    handlers.onSave();
    return true;
  }
  if (key === 'o') {
    event.preventDefault();
    handlers.onOpen();
    return true;
  }
  if (key === 'n') {
    event.preventDefault();
    handlers.onNew();
    return true;
  }

  return false;
}
