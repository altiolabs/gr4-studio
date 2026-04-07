import { useEffect, useRef, useState } from 'react';
import { PlotAdapterSwitch } from '../adapters/plot-adapter-switch';
import type { PlotDataFrame, PlotRuntimeBinding, PlotViewSpec } from '../model/types';
import { derivePlotVisibleState, hasRenderableImage, hasRenderableSeries } from './plot-visible-state';

type PlotSurfaceProps = {
  spec: PlotViewSpec;
  frame: PlotDataFrame;
  binding?: PlotRuntimeBinding;
};

function shortenEndpoint(endpoint: string | undefined): string {
  const trimmed = endpoint?.trim() ?? '';
  if (trimmed.length <= 48) {
    return trimmed;
  }
  return `${trimmed.slice(0, 45)}...`;
}

function useVisibleRefreshFps(params: {
  sequence?: number;
  state?: NonNullable<PlotDataFrame['meta']>['state'];
}): number | null {
  const lastRef = useRef<{ sequence: number | null; seenAtMs: number | null; fpsHz: number | null }>({
    sequence: null,
    seenAtMs: null,
    fpsHz: null,
  });
  const [fpsHz, setFpsHz] = useState<number | null>(null);

  useEffect(() => {
    if (params.state !== 'ready' || typeof params.sequence !== 'number' || !Number.isFinite(params.sequence)) {
      lastRef.current = {
        sequence: null,
        seenAtMs: null,
        fpsHz: null,
      };
      setFpsHz(null);
      return;
    }

    const nowMs = performance.now();
    const previous = lastRef.current;
    if (previous.sequence === params.sequence) {
      return;
    }

    let nextFpsHz: number | null = previous.fpsHz;
    if (previous.seenAtMs !== null) {
      const elapsedMs = nowMs - previous.seenAtMs;
      if (elapsedMs > 0) {
        const instantFpsHz = 1000 / elapsedMs;
        nextFpsHz = nextFpsHz === null ? instantFpsHz : nextFpsHz * 0.75 + instantFpsHz * 0.25;
      }
    }

    lastRef.current = {
      sequence: params.sequence,
      seenAtMs: nowMs,
      fpsHz: nextFpsHz,
    };
    setFpsHz(nextFpsHz);
  }, [params.sequence, params.state]);

  return fpsHz;
}

function formatRateBadge(params: { renderFps: number | null; ingressFps: number | null }): string | null {
  const parts: string[] = [];
  if (typeof params.renderFps === 'number' && Number.isFinite(params.renderFps) && params.renderFps > 0) {
    parts.push(`render ${params.renderFps.toFixed(1)} fps`);
  }
  if (typeof params.ingressFps === 'number' && Number.isFinite(params.ingressFps) && params.ingressFps > 0) {
    parts.push(`ingress ${params.ingressFps.toFixed(1)} fps`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function PlotSurface({ spec, frame, binding }: PlotSurfaceProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const next = entries[0];
      if (!next) {
        return;
      }
      setSize({
        width: Math.floor(next.contentRect.width),
        height: Math.floor(next.contentRect.height),
      });
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
    };
  }, []);

  const visibleState = derivePlotVisibleState({
    frame,
    width: size.width,
    height: size.height,
  });
  const showAdapter =
    visibleState === 'live' || (visibleState === 'loading' && (hasRenderableSeries(frame) || hasRenderableImage(frame)));
  const isCompactPlaceholder = size.width < 300 || size.height < 180;
  const statusLabel = frame.meta?.state ?? 'no-data';
  const transportLabel = binding?.transport?.trim() || 'n/a';
  const endpointLabel = shortenEndpoint(binding?.endpoint);
  const sequenceLabel = typeof frame.meta?.sequence === 'number' ? `#${frame.meta.sequence}` : null;
  const rateLabel = formatRateBadge({
    renderFps: useVisibleRefreshFps({
      sequence: frame.meta?.sequence,
      state: frame.meta?.state,
    }),
    ingressFps: frame.meta?.liveIngressFpsHz ?? null,
  });
  const statusText =
    frame.meta?.errorMessage ?? frame.meta?.statusMessage ?? (visibleState === 'loading' ? 'Connecting live source...' : null);
  const showDiagnostics = Boolean(binding?.transport || binding?.endpoint || frame.meta?.state);

  const titleByState: Record<Exclude<typeof visibleState, 'live'>, string> = {
    loading: 'Connecting',
    'no-data': 'No Data Yet',
    'invalid-binding': 'Invalid Binding',
    'runtime-error': 'Runtime Error',
    'too-small': 'Panel Too Small',
  };

  const message =
    visibleState === 'loading'
      ? 'Connecting to live source...'
      : visibleState === 'invalid-binding'
        ? frame.meta?.errorMessage ?? 'Invalid plot binding. Check transport and endpoint.'
        : visibleState === 'runtime-error'
        ? frame.meta?.errorMessage ?? 'Unable to load live data.'
        : visibleState === 'too-small'
      ? 'Panel is too small to render plot.'
      : 'Waiting for live data.';

  return (
    <div ref={hostRef} className="relative h-full w-full min-h-0 min-w-0">
      {showAdapter ? <PlotAdapterSwitch spec={spec} frame={frame} width={size.width} height={size.height} /> : null}
      {showDiagnostics ? (
        <div className="absolute right-2 top-2 z-20 max-w-[70%] rounded border border-slate-700/80 bg-slate-950/90 px-2 py-1 text-[10px] text-slate-200 shadow-lg shadow-slate-950/40 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="font-semibold uppercase tracking-wide text-slate-400">{statusLabel}</span>
            <span className="rounded border border-slate-700 bg-slate-900/80 px-1.5 py-0.5 text-slate-100">
              {transportLabel}
            </span>
            {sequenceLabel ? <span className="text-slate-400">{sequenceLabel}</span> : null}
            {rateLabel ? <span className="text-slate-400">{rateLabel}</span> : null}
          </div>
          {endpointLabel ? (
            <div className="mt-0.5 truncate text-slate-400" title={binding?.endpoint}>
              {endpointLabel}
            </div>
          ) : null}
          {statusText ? <div className="mt-0.5 truncate text-slate-300">{statusText}</div> : null}
        </div>
      ) : null}
      {!showAdapter ? (
        <div className="absolute inset-0 flex items-center justify-center rounded border border-slate-800/90 bg-slate-950/70 p-3 text-center">
          <div className="max-w-full">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {titleByState[visibleState]}
            </p>
            {!isCompactPlaceholder ? (
              <div
                className={
                  visibleState === 'invalid-binding' || visibleState === 'runtime-error'
                    ? 'mt-1 text-xs text-rose-300 break-words'
                    : 'mt-1 text-xs text-slate-300'
                }
              >
                <p>{message}</p>
                {binding?.transport || binding?.endpoint ? (
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
                    {binding.transport ?? 'n/a'} · {binding.endpoint ?? 'n/a'}
                  </p>
                ) : null}
                {frame.meta?.state ? (
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
                    frame state: {frame.meta.state}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
