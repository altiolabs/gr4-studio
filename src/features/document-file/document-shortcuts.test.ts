import { describe, expect, it, vi } from 'vitest';
import { handleDocumentShortcutKeydown } from './document-shortcuts';

function buildEvent(input: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) {
  return {
    key: input.key,
    ctrlKey: input.ctrlKey ?? false,
    metaKey: input.metaKey ?? false,
    shiftKey: input.shiftKey ?? false,
    preventDefault: vi.fn(),
  };
}

describe('document shortcuts', () => {
  it('Ctrl/Cmd+S prevents default and dispatches Save', () => {
    const event = buildEvent({ key: 's', ctrlKey: true });
    const handlers = {
      onSave: vi.fn(),
      onSaveAs: vi.fn(),
      onOpen: vi.fn(),
      onNew: vi.fn(),
    };

    const handled = handleDocumentShortcutKeydown(event, handlers);
    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(handlers.onSave).toHaveBeenCalledTimes(1);
  });

  it('Ctrl/Cmd+Shift+S dispatches Save As', () => {
    const event = buildEvent({ key: 's', ctrlKey: true, shiftKey: true });
    const handlers = {
      onSave: vi.fn(),
      onSaveAs: vi.fn(),
      onOpen: vi.fn(),
      onNew: vi.fn(),
    };

    handleDocumentShortcutKeydown(event, handlers);
    expect(handlers.onSaveAs).toHaveBeenCalledTimes(1);
    expect(handlers.onSave).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('Ctrl/Cmd+O and Ctrl/Cmd+N dispatch Open and New', () => {
    const handlers = {
      onSave: vi.fn(),
      onSaveAs: vi.fn(),
      onOpen: vi.fn(),
      onNew: vi.fn(),
    };
    const openEvent = buildEvent({ key: 'o', metaKey: true });
    const newEvent = buildEvent({ key: 'n', ctrlKey: true });

    handleDocumentShortcutKeydown(openEvent, handlers);
    handleDocumentShortcutKeydown(newEvent, handlers);

    expect(handlers.onOpen).toHaveBeenCalledTimes(1);
    expect(handlers.onNew).toHaveBeenCalledTimes(1);
    expect(openEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(newEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    const event = buildEvent({ key: 's', ctrlKey: true });
    const handlers = {
      onSave: vi.fn(),
      onSaveAs: vi.fn(),
      onOpen: vi.fn(),
      onNew: vi.fn(),
    };

    const handled = handleDocumentShortcutKeydown(event, handlers, { disabled: true });
    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(handlers.onSave).not.toHaveBeenCalled();
  });
});
