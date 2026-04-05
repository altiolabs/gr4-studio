import type { WorkspacePanelViewModel } from '../../../workspace/workspace-view';
import { lookupStudioKnownBlockBinding } from '../../../graph-editor/runtime/known-block-bindings';
import type { PhosphorSpectrumTuning, PlotPanelSpec } from './types';
import { resolveStudioPlotStyle } from './plot-style';

const plotSpecCache = new Map<string, PlotPanelSpec>();

// Scalar timeseries metadata remains graph/block-owned.
// Accepted optional keys from node parameters:
// - plot_title | title
// - x_label | xlabel
// - y_label | ylabel
// - series_labels | channel_labels (comma-separated)
function readParameterValue(parameters: Readonly<Record<string, string>> | undefined, keys: readonly string[]): string | undefined {
  if (!parameters) {
    return undefined;
  }

  for (const key of keys) {
    const value = parameters[key];
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return undefined;
}

function parseSeriesLabels(parameters: Readonly<Record<string, string>> | undefined): string[] | undefined {
  const raw = readParameterValue(parameters, ['series_labels', 'channel_labels']);
  if (!raw) {
    return undefined;
  }
  const labels = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return labels.length > 0 ? labels : undefined;
}

function parseChannels(parameters: Readonly<Record<string, string>> | undefined): number | undefined {
  const raw = readParameterValue(parameters, ['channels']);
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function buildDefaultSeriesLabels(channelCount: number | undefined): string[] | undefined {
  if (!channelCount || channelCount <= 1) {
    return undefined;
  }
  return Array.from({ length: channelCount }, (_, index) => `ch${index}`);
}

function parseWindowSize(parameters: Readonly<Record<string, string>> | undefined): number | undefined {
  const raw = readParameterValue(parameters, ['window_size']);
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function parseBooleanValue(raw: string | undefined): boolean | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return undefined;
}

function parseOptionalNumber(parameters: Readonly<Record<string, string>> | undefined, keys: readonly string[]): number | undefined {
  const raw = readParameterValue(parameters, keys);
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolvePhosphorSpectrumTuning(
  parameters: Readonly<Record<string, string>> | undefined,
): PhosphorSpectrumTuning | undefined {
  const intensity = parseOptionalNumber(parameters, ['phosphor_intensity', 'histo_scale', 'phosphor_scale']);
  const decayMs = parseOptionalNumber(parameters, ['phosphor_decay_ms', 'histo_t0d']);
  const colorMap = readParameterValue(parameters, ['color_map', 'phosphor_color_map']);

  if (
    intensity === undefined &&
    decayMs === undefined &&
    colorMap === undefined
  ) {
    return {
      intensity: 1.1,
      decayMs: 1024,
      colorMap: 'gqrx',
    };
  }

  return {
    intensity: intensity ?? 1.1,
    decayMs: decayMs ?? 1024,
    colorMap: colorMap ?? 'gqrx',
  };
}

function hasValidManualRange(min: number | undefined, max: number | undefined): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return false;
  }
  return (max as number) > (min as number);
}

function serializeParameters(parameters: Readonly<Record<string, string>> | undefined, excludedKeys: readonly string[] = []): string {
  if (!parameters) {
    return '';
  }

  const excluded = new Set(excludedKeys);
  return JSON.stringify(
    Object.keys(parameters)
      .filter((key) => !excluded.has(key))
      .sort()
      .reduce<Record<string, string>>((acc, key) => {
        acc[key] = parameters[key];
        return acc;
      }, {}),
  );
}

function buildPlotSpecCacheKey(entry: WorkspacePanelViewModel, isWaterfall: boolean): string {
  return JSON.stringify({
    panel: {
      id: entry.panel.id,
      kind: entry.panel.kind,
      title: entry.panel.title ?? '',
      nodeId: entry.panel.nodeId,
      visible: entry.panel.visible,
      previewOnCanvas: entry.panel.previewOnCanvas,
      plotStyle: entry.panel.plotStyle ?? null,
    },
    node: {
      displayName: entry.nodeDisplayName ?? '',
      blockTypeId: entry.nodeBlockTypeId ?? '',
      parameters: serializeParameters(entry.nodeParameters, isWaterfall ? ['x_min', 'x_max', 'y_min', 'y_max'] : []),
      palettes: entry.studioPlotPalettes ?? null,
    },
  });
}

export function derivePlotPanelSpec(entry: WorkspacePanelViewModel): PlotPanelSpec | null {
  if (
    entry.panel.kind !== 'series' &&
    entry.panel.kind !== 'series2d' &&
    entry.panel.kind !== 'histogram' &&
    entry.panel.kind !== 'waterfall'
  ) {
    return null;
  }

  const binding = entry.nodeBlockTypeId ? lookupStudioKnownBlockBinding(entry.nodeBlockTypeId) : null;
  const payloadFormat = binding?.payloadFormat;
  const title =
    readParameterValue(entry.nodeParameters, ['plot_title', 'title']) ??
    entry.nodeDisplayName ??
    entry.panel.title ??
    entry.panel.nodeId;
  const persistenceEnabled = parseBooleanValue(readParameterValue(entry.nodeParameters, ['persistence'])) ?? false;
  const isPersistentSpectrum =
    persistenceEnabled &&
    Boolean(binding?.blockTypeId.startsWith('gr::studio::StudioPowerSpectrumSink'));
  const isHistogram = entry.panel.kind === 'histogram' || isPersistentSpectrum;
  const isSeries2D =
    !isHistogram &&
    (entry.panel.kind === 'series2d' ||
      payloadFormat === 'series2d-xy-json-v1' ||
      payloadFormat === 'dataset-xy-json-v1');
  const isWaterfall = entry.panel.kind === 'waterfall' || payloadFormat === 'waterfall-spectrum-json-v1';
  const xLabel =
    readParameterValue(entry.nodeParameters, ['x_label', 'xlabel']) ?? (isSeries2D || isWaterfall || isHistogram ? 'Frequency' : 'sample');
  const yLabel = readParameterValue(entry.nodeParameters, ['y_label', 'ylabel']) ?? (isWaterfall || isHistogram ? 'Power' : 'value');
  // Metadata precedence:
  // 1) explicit graph/block params (series_labels/channel_labels)
  // 2) payload-side metadata (handled at runtime for dataset/vector payloads)
  // 3) stable defaults
  const seriesLabels =
    parseSeriesLabels(entry.nodeParameters) ??
    (isSeries2D || isWaterfall || isHistogram ? undefined : buildDefaultSeriesLabels(parseChannels(entry.nodeParameters)));
  const windowSize = parseWindowSize(entry.nodeParameters) ?? 1024;
  const autoscale =
    parseBooleanValue(readParameterValue(entry.nodeParameters, ['autoscale', 'auto_scale'])) ?? true;
  const xMin = parseOptionalNumber(entry.nodeParameters, ['x_min']);
  const xMax = parseOptionalNumber(entry.nodeParameters, ['x_max']);
  const yMin = parseOptionalNumber(entry.nodeParameters, ['y_min']);
  const yMax = parseOptionalNumber(entry.nodeParameters, ['y_max']);
  const hasManualXRange = hasValidManualRange(xMin, xMax);
  const hasManualYRange = hasValidManualRange(yMin, yMax);
  const resolvedPayloadFormat =
    payloadFormat === 'dataset-xy-json-v1'
      ? 'dataset-xy-json-v1'
      : payloadFormat === 'series2d-xy-json-v1'
        ? 'series2d-xy-json-v1'
        : payloadFormat === 'waterfall-spectrum-json-v1'
          ? 'waterfall-spectrum-json-v1'
        : isHistogram
          ? 'dataset-xy-json-v1'
        : isWaterfall
          ? 'waterfall-spectrum-json-v1'
        : isSeries2D
            ? 'series2d-xy-json-v1'
            : 'series-window-json-v1';
  const resolvedPlotStyle = resolveStudioPlotStyle({
    panelOverride: entry.panel.plotStyle,
    studioPalettes: entry.studioPlotPalettes,
  });
  const phosphorTuning = isHistogram ? resolvePhosphorSpectrumTuning(entry.nodeParameters) : undefined;
  const cacheKey = buildPlotSpecCacheKey(entry, isWaterfall);
  const cached = plotSpecCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const rangeSpec = isWaterfall
    ? {}
    : {
        xRange:
          !autoscale && hasManualXRange
            ? {
                auto: false,
                min: xMin,
                max: xMax,
              }
            : { auto: true },
        yRange: {
          auto: !(!autoscale && hasManualYRange),
          min: !autoscale && hasManualYRange ? yMin : undefined,
          max: !autoscale && hasManualYRange ? yMax : undefined,
        },
      };

  const spec: PlotPanelSpec = {
    panelId: entry.panel.id,
    kind: isWaterfall ? 'waterfall' : isHistogram ? 'histogram' : 'timeseries',
    source: {
      sinkId: entry.panel.nodeId,
      channel: 'all',
      field: isWaterfall ? 'image' : 'y',
      payloadFormat: resolvedPayloadFormat,
    },
    view: {
      kind: isWaterfall ? 'waterfall' : isHistogram ? 'histogram' : 'timeseries',
      title,
      xMode: isSeries2D || isWaterfall || isHistogram ? 'frequency' : 'sample-index',
      streaming: true,
      legend: !isWaterfall,
      windowSize,
      xLabel,
      yLabel,
      seriesLabels,
      ...(phosphorTuning ? { phosphor: phosphorTuning } : {}),
      ...rangeSpec,
      plotColors: resolvedPlotStyle.colors,
      colorAssignmentMode: resolvedPlotStyle.assignmentMode,
    },
  };

  plotSpecCache.set(cacheKey, spec);
  return spec;
}
