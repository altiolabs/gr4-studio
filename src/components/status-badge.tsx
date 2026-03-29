type Status = 'idle' | 'loading' | 'connected' | 'error';

const badgeStyles: Record<Status, string> = {
  idle: 'border-slate-600 text-slate-300 bg-slate-800/80',
  loading: 'border-amber-500/60 text-amber-200 bg-amber-950/40',
  connected: 'border-emerald-500/60 text-emerald-200 bg-emerald-950/30',
  error: 'border-rose-500/60 text-rose-200 bg-rose-950/30',
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeStyles[status]}`}>
      {status}
    </span>
  );
}
