import { BackendPill } from './backend-pill';
import { StatusBadge } from './status-badge';
import type { BackendMode } from '../lib/runtime-config';

type DesktopShellBarProps = {
  backendMode: BackendMode;
  controlPlaneBaseUrl: string;
  connectionStatus: 'idle' | 'loading' | 'connected' | 'error';
  onOpenSessions: () => void;
  documentTitle: string;
  isDirty: boolean;
};

export function DesktopShellBar({
  backendMode,
  controlPlaneBaseUrl,
  connectionStatus,
  onOpenSessions,
  documentTitle,
  isDirty,
}: DesktopShellBarProps) {
  return (
    <div className="drag-region shrink-0 select-none border-b border-slate-800/70 bg-slate-950/95 px-4 py-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div aria-hidden="true" />
        <div className="min-w-0 text-center">
          <h1 className="truncate text-sm font-semibold uppercase tracking-[0.34em] text-slate-100">gr4-studio</h1>
          <p className="truncate text-[11px] text-slate-400">
            {documentTitle}
            {isDirty ? ' •' : ''}
          </p>
        </div>
        <div className="no-drag-region flex items-center justify-self-end gap-2">
          <BackendPill mode={backendMode} controlPlaneBaseUrl={controlPlaneBaseUrl} />
          <StatusBadge status={connectionStatus} />
          <button
            type="button"
            onClick={onOpenSessions}
            className="rounded border border-indigo-700/70 bg-indigo-900/30 px-2 py-1 text-xs text-indigo-200 hover:bg-indigo-800/40"
          >
            Sessions
          </button>
        </div>
      </div>
    </div>
  );
}
