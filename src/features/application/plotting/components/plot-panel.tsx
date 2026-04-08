import type { PlotPanelSpec, PlotRuntimeBinding } from '../model/types';
import { PlotSurface } from './plot-surface';
import { useTimeseriesLiveFrame } from '../runtime/timeseries-live-runtime';

type PlotPanelProps = {
  spec: PlotPanelSpec;
  binding: PlotRuntimeBinding;
  executionState?: 'idle' | 'ready' | 'running' | 'stopped' | 'error';
};

export function PlotPanel({ spec, binding, executionState }: PlotPanelProps) {
  const frame = useTimeseriesLiveFrame({
    spec,
    binding,
    executionState,
  });

  return <PlotSurface spec={spec.view} frame={frame} binding={binding} />;
}
