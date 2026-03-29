export type PlotKind = 'timeseries' | 'fft' | 'waterfall' | 'histogram' | 'scatter';

export type PlotViewSpec = {
  kind: PlotKind;
  title?: string;
  xLabel?: string;
  yLabel?: string;
  seriesLabels?: string[];
  legend?: boolean;
  streaming?: boolean;
  xMode?: 'time' | 'sample-index' | 'frequency';
  windowSize?: number;
  xRange?: {
    min?: number;
    max?: number;
    auto?: boolean;
  };
  yRange?: {
    min?: number;
    max?: number;
    auto?: boolean;
  };
  plotColors?: string[];
  colorAssignmentMode?: 'byIndex';
};

export type PlotSeriesFrame = {
  id: string;
  label: string;
  x?: number[] | Float64Array;
  y: number[] | Float32Array | Float64Array;
};

export type PlotXyRenderMode = 'line' | 'scatter';

export type PlotDataFrame = {
  kind: PlotKind;
  series?: PlotSeriesFrame[];
  image?: {
    width: number;
    height: number;
    values: number[] | Float32Array | Uint8Array;
  };
  meta?: {
    sequence?: number;
    emittedAtMs?: number;
    sampleRateHz?: number;
    domain?: 'time' | 'frequency' | 'image';
    xyRenderMode?: PlotXyRenderMode;
    xyPointSize?: number;
    xyPointAlpha?: number;
    state?: 'loading' | 'no-data' | 'error' | 'ready';
    errorKind?: 'invalid-binding' | 'runtime';
    errorMessage?: string;
  };
};

export type PlotPanelSpec = {
  panelId: string;
  kind: PlotKind;
  source: {
    sinkId: string;
    channel?: string;
    field?: string;
    payloadFormat?: 'series-window-json-v1' | 'series2d-xy-json-v1' | 'dataset-xy-json-v1';
  };
  view: PlotViewSpec;
};

export type PlotRuntimeBinding = {
  status: 'unsupported' | 'unconfigured' | 'configured' | 'invalid';
  transport?: string;
  endpoint?: string;
  pollMs?: number;
};

export type PlotAdapterProps = {
  spec: PlotViewSpec;
  frame: PlotDataFrame;
  width: number;
  height: number;
};
