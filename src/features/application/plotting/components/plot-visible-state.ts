import type { PlotDataFrame } from '../model/types';

export type PlotVisibleState = 'loading' | 'live' | 'no-data' | 'invalid-binding' | 'runtime-error' | 'too-small';

const MIN_PLOT_WIDTH = 180;
const MIN_PLOT_HEIGHT = 120;

export function hasRenderableSeries(frame: PlotDataFrame): boolean {
  const series = frame.series;
  if (!series || series.length === 0) {
    return false;
  }
  return series.some((item) => item.y.length > 0);
}

export function derivePlotVisibleState(params: {
  frame: PlotDataFrame;
  width: number;
  height: number;
}): PlotVisibleState {
  const { frame, width, height } = params;
  const state = frame.meta?.state ?? 'no-data';

  if (state === 'error') {
    return frame.meta?.errorKind === 'invalid-binding' ? 'invalid-binding' : 'runtime-error';
  }

  if (width < MIN_PLOT_WIDTH || height < MIN_PLOT_HEIGHT) {
    return 'too-small';
  }

  if (state === 'loading') {
    return 'loading';
  }

  if (state === 'ready' && hasRenderableSeries(frame)) {
    return 'live';
  }

  return 'no-data';
}
