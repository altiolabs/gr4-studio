import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBeforeUnloadUnsavedChangesGuard } from './unsaved-changes-guard';

describe('unsaved changes beforeunload guard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('activates beforeunload handler only when dirty', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal('window', {
      addEventListener,
      removeEventListener,
    });

    const cleanDisposer = registerBeforeUnloadUnsavedChangesGuard(false);
    expect(addEventListener).not.toHaveBeenCalled();
    cleanDisposer();

    const dirtyDisposer = registerBeforeUnloadUnsavedChangesGuard(true);
    expect(addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    dirtyDisposer();
    expect(removeEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });
});
