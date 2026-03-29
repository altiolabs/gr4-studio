import { useEffect, useRef, useState } from 'react';
import { PlotAdapterSwitch } from '../adapters/plot-adapter-switch';
import type { PlotDataFrame, PlotViewSpec } from '../model/types';
import { derivePlotVisibleState, hasRenderableSeries } from './plot-visible-state';

type PlotSurfaceProps = {
  spec: PlotViewSpec;
  frame: PlotDataFrame;
};

export function PlotSurface({ spec, frame }: PlotSurfaceProps) {
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
  const showAdapter = visibleState === 'live' || (visibleState === 'loading' && hasRenderableSeries(frame));
  const isCompactPlaceholder = size.width < 300 || size.height < 180;

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
      {!showAdapter ? (
        <div className="absolute inset-0 flex items-center justify-center rounded border border-slate-800/90 bg-slate-950/70 p-3 text-center">
          <div className="max-w-full">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {titleByState[visibleState]}
            </p>
            {!isCompactPlaceholder ? (
              <p
                className={
                  visibleState === 'invalid-binding' || visibleState === 'runtime-error'
                    ? 'mt-1 text-xs text-rose-300 break-words'
                    : 'mt-1 text-xs text-slate-300'
                }
              >
                {message}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
