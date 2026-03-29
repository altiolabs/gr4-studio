import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { PlotAdapterProps, PlotSeriesFrame } from '../model/types';
import { STUDIO_BUILTIN_PLOT_PALETTES } from '../model/plot-style';

const AXIS_STROKE = '#94a3b8';
const GRID_STROKE = '#334155';

function toNumberArray(values: number[] | Float32Array | Float64Array): number[] {
  return Array.isArray(values) ? values : Array.from(values);
}

export type NormalizedTimeseriesData = {
  x: number[];
  yBySeries: number[][];
  labels: string[];
};

export function normalizeSeriesData(
  series: PlotSeriesFrame[] | undefined,
  xMode: 'time' | 'sample-index' | 'frequency' | undefined,
  windowSize: number | undefined,
  xyRenderMode: 'line' | 'scatter',
): NormalizedTimeseriesData {
  if (!series || series.length === 0) {
    return { x: [], yBySeries: [], labels: [] };
  }

  const yArrays = series.map((item) => toNumberArray(item.y));
  const maxLen = yArrays.reduce((max, values) => Math.max(max, values.length), 0);
  const fixedSampleWindow =
    xMode === 'sample-index' && typeof windowSize === 'number' && Number.isFinite(windowSize) && windowSize > 0
      ? Math.floor(windowSize)
      : undefined;
  const targetLen = fixedSampleWindow ?? maxLen;
  const useSourceX = xMode === 'time' || xMode === 'frequency';
  const xFromSource = useSourceX && series[0].x ? Array.from(series[0].x) : undefined;
  const canUseScatterPairs =
    xyRenderMode === 'scatter' && xFromSource && xFromSource.length > 0 && yArrays.length > 0 && yArrays[0].length > 0;
  const sortedScatterPairs = canUseScatterPairs
    ? xFromSource
        .map((xValue, index) => [xValue, yArrays[0][index]] as const)
        .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]))
        .sort((a, b) => a[0] - b[0])
    : undefined;
  const scatterLen = sortedScatterPairs?.length ?? 0;
  if (xyRenderMode === 'scatter' && scatterLen > 0) {
    return {
      x: sortedScatterPairs!.map((point) => point[0]),
      yBySeries: [sortedScatterPairs!.map((point) => point[1])],
      labels: series.map((item) => item.label || item.id),
    };
  }
  const x =
    xFromSource && xFromSource.length > 0
      ? xFromSource.slice(-targetLen)
      : Array.from({ length: targetLen }, (_, i) => i);

  const yBySeries = yArrays.map((values) => {
    const trimmed = values.slice(-targetLen);
    if (trimmed.length === targetLen) {
      return trimmed;
    }
    const padded = Array.from({ length: targetLen }, () => Number.NaN);
    const offset = 0;
    trimmed.forEach((value, index) => {
      padded[offset + index] = value;
    });
    return padded;
  });

  return {
    x,
    yBySeries,
    labels: series.map((item) => item.label || item.id),
  };
}

export function assertTimeseriesAdapterShape(normalized: NormalizedTimeseriesData): void {
  if (normalized.yBySeries.length !== normalized.labels.length) {
    throw new Error(
      `Timeseries adapter shape mismatch: labels=${normalized.labels.length} series=${normalized.yBySeries.length}`,
    );
  }
  for (let index = 0; index < normalized.yBySeries.length; index += 1) {
    const y = normalized.yBySeries[index];
    if (y.length !== normalized.x.length) {
      throw new Error(
        `Timeseries adapter shape mismatch: x.length=${normalized.x.length}, y[${index}].length=${y.length}, label=${normalized.labels[index]}`,
      );
    }
  }
}

function colorWithAlpha(hexColor: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  const encoded = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hexColor}${encoded}`;
}

function buildSeriesOptions(
  labels: string[],
  palette: readonly string[],
  mode: 'line' | 'scatter',
  pointSize?: number,
  pointAlpha?: number,
): uPlot.Series[] {
  return [
    {},
    ...labels.map((label, index) => {
      const color = palette[index % palette.length];
      return {
        label,
        stroke: mode === 'scatter' ? colorWithAlpha(color, 0) : color,
        width: mode === 'scatter' ? 1 : 1.8,
        points: {
          show: mode === 'scatter',
          size: pointSize && Number.isFinite(pointSize) ? Math.max(2, pointSize) : 4,
          width: mode === 'scatter' ? 2 : 1,
          stroke: color,
          fill: mode === 'scatter' ? colorWithAlpha(color, pointAlpha ?? 0.9) : color,
        },
      } satisfies uPlot.Series;
    }),
  ];
}

function buildEmptyAlignedData(seriesCount: number): uPlot.AlignedData {
  return Array.from({ length: seriesCount + 1 }, () => []) as unknown as uPlot.AlignedData;
}

export function TimeseriesUplotAdapter({ spec, frame, width, height }: PlotAdapterProps) {
  const minWidth = 180;
  const minHeight = 120;
  const canRender = width >= minWidth && height >= minHeight;
  const showLegend = (spec.legend ?? true) && width >= 420 && height >= 220;
  const plotHostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);
  const lastDataSignatureRef = useRef<string>('');
  const resolvedPalette = useMemo(() => {
    if (spec.plotColors && spec.plotColors.length > 0) {
      return spec.plotColors;
    }
    return STUDIO_BUILTIN_PLOT_PALETTES['studio-default'];
  }, [spec.plotColors]);

  const normalized = useMemo(
    () => normalizeSeriesData(frame.series, spec.xMode, spec.windowSize, frame.meta?.xyRenderMode ?? 'line'),
    [frame.meta?.xyRenderMode, frame.series, spec.windowSize, spec.xMode],
  );
  if (import.meta.env.DEV) {
    assertTimeseriesAdapterShape(normalized);
  }
  const seriesLabelSignature = useMemo(() => normalized.labels.join('|'), [normalized.labels]);
  const alignedData = useMemo<uPlot.AlignedData>(
    () => [normalized.x, ...normalized.yBySeries],
    [normalized.x, normalized.yBySeries],
  );
  const seriesOptions = useMemo(
    () =>
      buildSeriesOptions(
        seriesLabelSignature.length > 0 ? seriesLabelSignature.split('|') : [],
        resolvedPalette,
        frame.meta?.xyRenderMode ?? 'line',
        frame.meta?.xyPointSize,
        frame.meta?.xyPointAlpha,
      ),
    [frame.meta?.xyPointAlpha, frame.meta?.xyPointSize, frame.meta?.xyRenderMode, resolvedPalette, seriesLabelSignature],
  );

  useEffect(() => {
    const host = plotHostRef.current;
    if (!host) {
      return;
    }

    if (!canRender) {
      chartRef.current?.destroy();
      chartRef.current = null;
      return;
    }

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const hostWidth = Math.max(minWidth, Math.floor(host.clientWidth || 320));
    const hostHeight = Math.max(minHeight, Math.floor(host.clientHeight || 180));
    const chart = new uPlot(
      {
        width: hostWidth,
        height: hostHeight,
        legend: {
          show: showLegend,
        },
        series: seriesOptions,
        scales: {
          x:
            spec.xRange?.auto === false
              ? {
                  time: spec.xMode === 'time',
                  auto: false,
                  range: [
                    spec.xRange.min ?? 0,
                    spec.xRange.max ?? 1,
                  ],
                }
              : {
                  time: spec.xMode === 'time',
                },
          y:
            spec.yRange?.auto === false
              ? {
                  auto: false,
                  range: [
                    spec.yRange.min ?? 0,
                    spec.yRange.max ?? 1,
                  ],
                }
              : {},
        },
        axes: [
          {
            label: spec.xLabel ?? 'sample',
            stroke: AXIS_STROKE,
            grid: {
              stroke: GRID_STROKE,
              width: 1,
            },
          },
          {
            label: spec.yLabel ?? 'value',
            stroke: AXIS_STROKE,
            grid: {
              stroke: GRID_STROKE,
              width: 1,
            },
          },
        ],
      },
      buildEmptyAlignedData(seriesOptions.length - 1),
      host,
    );
    chartRef.current = chart;
    lastDataSignatureRef.current = '';

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [
    canRender,
    minHeight,
    minWidth,
    seriesOptions,
    showLegend,
    spec.xLabel,
    spec.xMode,
    spec.xRange,
    spec.yLabel,
    spec.yRange,
  ]);

  useEffect(() => {
    if (!chartRef.current || !canRender) {
      return;
    }
    const nextWidth = Math.max(minWidth, Math.floor(width));
    const nextHeight = Math.max(minHeight, Math.floor(height));
    chartRef.current.setSize({ width: nextWidth, height: nextHeight });
  }, [canRender, height, minHeight, minWidth, width]);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }
    if (alignedData.length !== chartRef.current.series.length) {
      return;
    }
    const sequence = frame.meta?.sequence ?? -1;
    const firstPoints = alignedData[0]?.length ?? 0;
    const signature = `${sequence}:${firstPoints}:${frame.meta?.state ?? 'na'}`;
    if (signature === lastDataSignatureRef.current) {
      return;
    }
    lastDataSignatureRef.current = signature;
    chartRef.current.setData(alignedData);
  }, [alignedData, frame.meta?.sequence, frame.meta?.state]);

  return <div ref={plotHostRef} className="h-full min-h-0 w-full overflow-hidden rounded border border-slate-800 bg-slate-950" />;
}
