export function registerBeforeUnloadUnsavedChangesGuard(enabled: boolean): () => void {
  if (!enabled || typeof window === 'undefined') {
    return () => {};
  }

  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = '';
  };

  window.addEventListener('beforeunload', onBeforeUnload);
  return () => {
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}
