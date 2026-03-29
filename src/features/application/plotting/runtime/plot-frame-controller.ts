import type { PlotDataFrame, PlotPanelSpec, PlotSeriesFrame } from '../model/types';

function asNumberArray(values: number[] | Float32Array | Float64Array): number[] {
  return Array.isArray(values) ? [...values] : Array.from(values);
}

export type PlotFrameController = {
  getVersion: () => number;
  getFrame: () => PlotDataFrame;
  reset: () => void;
  setLoading: () => void;
  setNoData: () => void;
  setError: (message: string, errorKind?: 'invalid-binding' | 'runtime') => void;
  ingestSeries: (
    series: PlotSeriesFrame[],
    emittedAtMs?: number,
    mode?: 'append' | 'replace',
    metadata?: {
      xyRenderMode?: NonNullable<PlotDataFrame['meta']>['xyRenderMode'];
      xyPointSize?: number;
      xyPointAlpha?: number;
    },
  ) => void;
};

export function createPlotFrameController(spec: PlotPanelSpec): PlotFrameController {
  let version = 0;
  let dirty = true;
  let sequence = 0;
  let state: NonNullable<PlotDataFrame['meta']> = {
    state: 'no-data',
    domain: spec.kind === 'timeseries' || spec.kind === 'fft' ? 'time' : 'image',
  };
  let seriesById = new Map<string, { id: string; label: string; x?: number[]; y: number[] }>();
  let cachedFrame: PlotDataFrame = {
    kind: spec.kind,
    series: [],
    meta: state,
  };

  const markDirty = () => {
    version += 1;
    dirty = true;
  };

  const getVersion = () => version;

  const getFrame = (): PlotDataFrame => {
    if (!dirty) {
      return cachedFrame;
    }

    cachedFrame = {
      kind: spec.kind,
      series: Array.from(seriesById.values()).map((series) => ({
        id: series.id,
        label: series.label,
        ...(series.x ? { x: series.x } : {}),
        y: series.y,
      })),
      meta: state,
    };
    dirty = false;
    return cachedFrame;
  };

  const reset = () => {
    sequence = 0;
    state = {
      state: 'no-data',
      domain: spec.kind === 'timeseries' || spec.kind === 'fft' ? 'time' : 'image',
    };
    seriesById = new Map();
    markDirty();
  };

  const setLoading = () => {
    if (state.state === 'loading') {
      return;
    }
    state = {
      ...state,
      state: 'loading',
      errorKind: undefined,
      errorMessage: undefined,
    };
    markDirty();
  };

  const setNoData = () => {
    if (state.state === 'no-data' && !state.errorMessage) {
      return;
    }
    state = {
      ...state,
      state: 'no-data',
      errorKind: undefined,
      errorMessage: undefined,
    };
    markDirty();
  };

  const setError = (message: string, errorKind: 'invalid-binding' | 'runtime' = 'runtime') => {
    if (state.state === 'error' && state.errorMessage === message && state.errorKind === errorKind) {
      return;
    }
    state = {
      ...state,
      state: 'error',
      errorKind,
      errorMessage: message,
    };
    markDirty();
  };

  const ingestSeries = (
    series: PlotSeriesFrame[],
    emittedAtMs?: number,
    mode: 'append' | 'replace' = 'append',
    metadata?: {
      xyRenderMode?: NonNullable<PlotDataFrame['meta']>['xyRenderMode'];
      xyPointSize?: number;
      xyPointAlpha?: number;
    },
  ) => {
    const windowSize = spec.view.windowSize;
    const next = new Map<string, { id: string; label: string; x?: number[]; y: number[] }>();
    let hasSamples = false;
    for (const item of series) {
      const previous = seriesById.get(item.id);
      const nextChunk = asNumberArray(item.y);
      const mergedY = mode === 'append' && previous ? previous.y : [];
      const nextXChunk = item.x ? asNumberArray(item.x) : undefined;
      const mergedX = mode === 'append' && previous && previous.x ? previous.x : undefined;
      if (mode === 'replace') {
        mergedY.length = 0;
        if (mergedX) {
          mergedX.length = 0;
        }
      }
      mergedY.push(...nextChunk);
      if (mergedX && nextXChunk) {
        mergedX.push(...nextXChunk);
      }
      if (windowSize && windowSize > 0 && mergedY.length > windowSize) {
        const overflow = mergedY.length - windowSize;
        mergedY.splice(0, overflow);
        if (mergedX) {
          if (mergedX.length <= overflow) {
            mergedX.length = 0;
          } else {
            mergedX.splice(0, overflow);
          }
        }
      }
      next.set(item.id, {
        id: item.id,
        label: item.label,
        x: nextXChunk ? nextXChunk : mergedX,
        y: mergedY,
      });
      hasSamples = hasSamples || mergedY.length > 0;
    }
    sequence += 1;
    seriesById = next;
    state = {
      ...state,
      sequence,
      emittedAtMs,
      state: hasSamples ? 'ready' : 'no-data',
      xyRenderMode: metadata?.xyRenderMode,
      xyPointSize: metadata?.xyPointSize,
      xyPointAlpha: metadata?.xyPointAlpha,
      errorKind: undefined,
      errorMessage: undefined,
    };
    markDirty();
  };

  return {
    getVersion,
    getFrame,
    reset,
    setLoading,
    setNoData,
    setError,
    ingestSeries,
  };
}
