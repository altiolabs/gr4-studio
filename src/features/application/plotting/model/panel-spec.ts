import type { WorkspacePanelViewModel } from '../../../workspace/workspace-view';
import { lookupStudioKnownBlockBinding } from '../../../graph-editor/runtime/known-block-bindings';
import type { PlotPanelSpec } from './types';
import { resolveStudioPlotStyle } from './plot-style';

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

function hasValidManualRange(min: number | undefined, max: number | undefined): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return false;
  }
  return (max as number) > (min as number);
}

export function derivePlotPanelSpec(entry: WorkspacePanelViewModel): PlotPanelSpec | null {
  if (entry.panel.kind !== 'series' && entry.panel.kind !== 'series2d') {
    return null;
  }

  const payloadFormat =
    entry.nodeBlockTypeId ? lookupStudioKnownBlockBinding(entry.nodeBlockTypeId)?.payloadFormat : undefined;
  const title =
    readParameterValue(entry.nodeParameters, ['plot_title', 'title']) ??
    entry.nodeDisplayName ??
    entry.panel.title ??
    entry.panel.nodeId;
  const isSeries2D =
    entry.panel.kind === 'series2d' ||
    payloadFormat === 'series2d-xy-json-v1' ||
    payloadFormat === 'dataset-xy-json-v1';
  const xLabel = readParameterValue(entry.nodeParameters, ['x_label', 'xlabel']) ?? (isSeries2D ? 'x' : 'sample');
  const yLabel = readParameterValue(entry.nodeParameters, ['y_label', 'ylabel']) ?? 'value';
  // Metadata precedence:
  // 1) explicit graph/block params (series_labels/channel_labels)
  // 2) payload-side metadata (handled at runtime for dataset/vector payloads)
  // 3) stable defaults
  const seriesLabels =
    parseSeriesLabels(entry.nodeParameters) ??
    (isSeries2D ? undefined : buildDefaultSeriesLabels(parseChannels(entry.nodeParameters)));
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
        : 'series-window-json-v1';
  const resolvedPlotStyle = resolveStudioPlotStyle({
    panelOverride: entry.panel.plotStyle,
    studioPalettes: entry.studioPlotPalettes,
  });

  return {
    panelId: entry.panel.id,
    kind: 'timeseries',
    source: {
      sinkId: entry.panel.nodeId,
      channel: 'all',
      field: 'y',
      payloadFormat: resolvedPayloadFormat,
    },
    view: {
      kind: 'timeseries',
      title,
      xMode: isSeries2D ? 'frequency' : 'sample-index',
      streaming: true,
      legend: true,
      windowSize,
      xLabel,
      yLabel,
      seriesLabels,
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
      plotColors: resolvedPlotStyle.colors,
      colorAssignmentMode: resolvedPlotStyle.assignmentMode,
    },
  };
}
