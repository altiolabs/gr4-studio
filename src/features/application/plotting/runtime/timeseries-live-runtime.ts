import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type HttpTimeSeriesSnapshot,
  parseHttpTimeSeriesSnapshot,
} from '../../../graph-editor/runtime/http-time-series';
import {
  createSeriesPollSubscription,
  normalizeSeriesPollMs,
} from '../../../workspace/renderers/series-live-renderer-model';
import { hasRenderableImage, hasRenderableSeries } from '../components/plot-visible-state';
import type { PlotDataFrame, PlotPanelSpec, PlotRuntimeBinding, PlotSeriesFrame } from '../model/types';
import { createPlotFrameController } from './plot-frame-controller';
import {
  mapSnapshotToVectorPlotSeriesFrames,
  type HttpVectorSnapshot,
  parseHttpDatasetXySnapshot,
  parseHttpVectorSnapshot,
} from './vector-frame';
import {
  createPowerSpectrumWebSocketSubscription,
  mapPowerSpectrumWebSocketFrameToSeriesFrame,
  normalizePowerSpectrumWebSocketEndpoint,
  type PowerSpectrumWebSocketFrame,
} from './power-spectrum-websocket-runtime';
import { mapWaterfallSnapshotToImage, parseHttpWaterfallSnapshot } from './waterfall-frame';

const PLOT_PUBLISH_MS = 120;
const PLOT_NO_DATA_GRACE_MS = 1200;
const PLOT_DEBUG_FLAG = '__GR4_STUDIO_PLOT_DEBUG';

export type PlotPayloadContract =
  | 'series-window-json-v1'
  | 'series2d-xy-json-v1'
  | 'dataset-xy-json-v1'
  | 'waterfall-spectrum-json-v1';

type ParsedLivePayload =
  | {
      kind: 'series';
      series: PlotSeriesFrame[];
      xyRenderMode?: NonNullable<PlotDataFrame['meta']>['xyRenderMode'];
      xyPointSize?: number;
      xyPointAlpha?: number;
    }
  | {
      kind: 'image';
      image: NonNullable<PlotDataFrame['image']>;
    };

export type BindingFailure = {
  errorKind: 'invalid-binding';
  message: string;
};

export type LiveTransportMode = 'http' | 'websocket' | 'unsupported';

export function deriveBindingFailureMessage(params: {
  status: PlotRuntimeBinding['status'];
  reason?: string;
}): string | null {
  if (params.status === 'invalid') {
    return 'Binding is invalid for runtime plotting.';
  }
  if (params.reason === 'unsupported-transport') {
    return 'Only http_snapshot/http_poll is supported for this live plot path.';
  }
  if (params.reason === 'missing-endpoint') {
    return 'Missing endpoint for runtime plotting.';
  }
  return null;
}

export function resolveLiveTransportMode(binding: PlotRuntimeBinding): LiveTransportMode {
  if (binding.status !== 'configured') {
    return 'unsupported';
  }
  if (binding.transport === 'websocket') {
    return 'websocket';
  }
  if (binding.transport === 'http_snapshot' || binding.transport === 'http_poll') {
    return 'http';
  }
  return 'unsupported';
}

export function deriveWebSocketIngressFps(params: {
  previousArrivalMs: number | null;
  previousFpsHz: number | null;
  nowMs: number;
}): number | null {
  if (params.previousArrivalMs === null) {
    return params.previousFpsHz;
  }
  const elapsedMs = params.nowMs - params.previousArrivalMs;
  if (elapsedMs <= 0) {
    return params.previousFpsHz;
  }
  const instantFps = 1000 / elapsedMs;
  return params.previousFpsHz === null ? instantFps : params.previousFpsHz * 0.75 + instantFps * 0.25;
}

export function deriveBindingFailure(params: {
  status: PlotRuntimeBinding['status'];
  reason?: string;
}): BindingFailure | null {
  const message = deriveBindingFailureMessage(params);
  if (!message) {
    return null;
  }
  return {
    errorKind: 'invalid-binding',
    message,
  };
}

export function shouldRetainPreviousLiveFrame(params: {
  currentFrame: PlotDataFrame;
  nextFrame: PlotDataFrame;
}): boolean {
  const nextState = params.nextFrame.meta?.state;
  if (nextState !== 'loading' && nextState !== 'no-data') {
    return false;
  }

  return (
    params.currentFrame.meta?.state === 'ready' &&
    (hasRenderableSeries(params.currentFrame) || hasRenderableImage(params.currentFrame))
  );
}

async function fetchSnapshotPayload(endpointUrl: string): Promise<unknown> {
  if (import.meta.env.DEV) {
    const proxied = await fetch(`/__gr4studio/runtime-http-proxy?target=${encodeURIComponent(endpointUrl)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    if (!proxied.ok) {
      throw new Error(`Proxy HTTP ${proxied.status}`);
    }
    return proxied.json();
  }

  const directResponse = await fetch(endpointUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });
  if (!directResponse.ok) {
    throw new Error(`HTTP ${directResponse.status}`);
  }
  return directResponse.json();
}

export function mapSnapshotToPlotSeriesFrames(
  snapshot: HttpTimeSeriesSnapshot,
  seriesLabels?: readonly string[],
): PlotSeriesFrame[] {
  return snapshot.seriesByChannel.map((series, index) => ({
    id: `ch${index}`,
    label: seriesLabels?.[index] ?? `ch${index}`,
    y: series,
  }));
}

function isComplexScalarPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const record = payload as Record<string, unknown>;
  const sampleType = typeof record.sample_type === 'string' ? record.sample_type : '';
  const layout = typeof record.layout === 'string' ? record.layout : '';
  return sampleType.includes('complex') || layout.includes('complex');
}

function mapComplexSnapshotToSplitSeriesFrames(
  realSnapshot: HttpTimeSeriesSnapshot,
  imagSnapshot: HttpTimeSeriesSnapshot,
  seriesLabels?: readonly string[],
): PlotSeriesFrame[] {
  const channelCount = Math.max(realSnapshot.seriesByChannel.length, imagSnapshot.seriesByChannel.length);
  const next: PlotSeriesFrame[] = [];
  for (let index = 0; index < channelCount; index += 1) {
    const baseLabel = seriesLabels?.[index] ?? `ch${index}`;
    const real = realSnapshot.seriesByChannel[index] ?? [];
    const imag = imagSnapshot.seriesByChannel[index] ?? [];
    next.push({
      id: `ch${index}.real`,
      label: `${baseLabel} (real)`,
      y: real,
    });
    next.push({
      id: `ch${index}.imag`,
      label: `${baseLabel} (imag)`,
      y: imag,
    });
  }
  return next;
}

type SeriesShapeAssertionContext = {
  stage: 'payload-parser' | 'frame-ingest' | 'frame-readback' | 'adapter-input';
  expectedSeriesCount?: number;
  sourceChannels?: number;
  samplesPerChannel?: number;
};

export function assertSeriesShape(series: PlotSeriesFrame[], context: SeriesShapeAssertionContext): void {
  if (context.expectedSeriesCount !== undefined && series.length !== context.expectedSeriesCount) {
    throw new Error(
      `Series shape mismatch at ${context.stage}: expected ${context.expectedSeriesCount} series, got ${series.length}. ` +
        `sourceChannels=${context.sourceChannels ?? 'n/a'} samplesPerChannel=${context.samplesPerChannel ?? 'n/a'}`,
    );
  }
  for (const item of series) {
    if (!Array.isArray(item.y) && !(item.y instanceof Float32Array) && !(item.y instanceof Float64Array)) {
      throw new Error(`Series shape mismatch at ${context.stage}: ${item.id} is not numeric series data.`);
    }
  }
}

export function assertImageShape(image: NonNullable<PlotDataFrame['image']>, context: SeriesShapeAssertionContext): void {
  if (context.expectedSeriesCount !== undefined && image.width !== context.expectedSeriesCount) {
    throw new Error(
      `Image shape mismatch at ${context.stage}: expected width ${context.expectedSeriesCount}, got ${image.width}. ` +
        `sourceChannels=${context.sourceChannels ?? 'n/a'} samplesPerChannel=${context.samplesPerChannel ?? 'n/a'}`,
    );
  }
  if (!Number.isFinite(image.width) || !Number.isFinite(image.height)) {
    throw new Error(`Image shape mismatch at ${context.stage}: image dimensions are not finite.`);
  }
  const values = Array.isArray(image.values) ? image.values : Array.from(image.values);
  if (values.length !== image.width * image.height) {
    throw new Error(
      `Image shape mismatch at ${context.stage}: values.length=${values.length}, width=${image.width}, height=${image.height}.`,
    );
  }
}

export function resolvePayloadContract(payloadFormat?: PlotPanelSpec['source']['payloadFormat']): PlotPayloadContract {
  if (payloadFormat === 'series2d-xy-json-v1') {
    return payloadFormat;
  }
  if (payloadFormat === 'dataset-xy-json-v1') {
    return payloadFormat;
  }
  if (payloadFormat === 'waterfall-spectrum-json-v1') {
    return payloadFormat;
  }
  return 'series-window-json-v1';
}

export function identifyPayloadFormat(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  return typeof record.payload_format === 'string' ? record.payload_format : undefined;
}

function identifyPayloadLayout(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  return typeof record.layout === 'string' ? record.layout : undefined;
}

export function formatPayloadParseError(params: {
  contract: PlotPayloadContract;
  reason: string;
  payload: unknown;
}): string {
  const formatToken = identifyPayloadFormat(params.payload);
  const layoutToken = identifyPayloadLayout(params.payload);
  const hints: string[] = [];
  if (formatToken) {
    hints.push(`payload_format=${formatToken}`);
  }
  if (layoutToken) {
    hints.push(`layout=${layoutToken}`);
  }
  const hintText = hints.length > 0 ? ` (${hints.join(', ')})` : '';
  return `Invalid ${params.contract} payload: ${params.reason}${hintText}`;
}

function isPlotDebugEnabled(): boolean {
  if (!import.meta.env.DEV) {
    return false;
  }
  return Boolean((window as unknown as { __GR4_STUDIO_PLOT_DEBUG?: boolean })[PLOT_DEBUG_FLAG]);
}

function tracePlotDiagnostic(event: string, details: Record<string, unknown>): void {
  if (!isPlotDebugEnabled()) {
    return;
  }
  console.debug(`[plot:binding] ${event}`, details);
}

export function parseLiveFrameFromPayload(params: {
  payloadFormat?: PlotPanelSpec['source']['payloadFormat'];
  seriesLabels?: readonly string[];
  payload: unknown;
}): ParsedLivePayload {
  const mapVectorSnapshot = (snapshot: HttpVectorSnapshot): {
    kind: 'series';
    series: PlotSeriesFrame[];
    xyRenderMode?: NonNullable<PlotDataFrame['meta']>['xyRenderMode'];
    xyPointSize?: number;
    xyPointAlpha?: number;
  } => ({
    kind: 'series',
    series: mapSnapshotToVectorPlotSeriesFrames(snapshot, params.seriesLabels?.[0]),
    xyRenderMode: snapshot.renderMode,
    xyPointSize: snapshot.pointSize,
    xyPointAlpha: snapshot.pointAlpha,
  });

  // Contract-first routing:
  // - series-window-json-v1     -> scalar channel parser
  // - series2d-xy-json-v1       -> XY parser
  // - dataset-xy-json-v1        -> DataSet->XY parser
  // - waterfall-spectrum-json-v1 -> matrix waterfall parser
  const payloadFormat = resolvePayloadContract(params.payloadFormat);
  try {
    if (payloadFormat === 'dataset-xy-json-v1') {
      return mapVectorSnapshot(parseHttpDatasetXySnapshot(params.payload));
    }
    if (payloadFormat === 'series2d-xy-json-v1') {
      return mapVectorSnapshot(parseHttpVectorSnapshot(params.payload));
    }
    if (payloadFormat === 'waterfall-spectrum-json-v1') {
      const waterfall = parseHttpWaterfallSnapshot(params.payload);
      return {
        kind: 'image',
        image: mapWaterfallSnapshotToImage(waterfall),
      };
    }
    if (isComplexScalarPayload(params.payload)) {
      const real = parseHttpTimeSeriesSnapshot(params.payload, 'real');
      const imag = parseHttpTimeSeriesSnapshot(params.payload, 'imag');
      const series = mapComplexSnapshotToSplitSeriesFrames(real, imag, params.seriesLabels);
      assertSeriesShape(series, {
        stage: 'payload-parser',
        expectedSeriesCount: real.channelCount * 2,
        sourceChannels: real.channelCount,
        samplesPerChannel: real.samplesPerChannel,
      });
      return {
        kind: 'series',
        series,
      };
    }
    return {
      kind: 'series',
      series: mapSnapshotToPlotSeriesFrames(parseHttpTimeSeriesSnapshot(params.payload, 'magnitude'), params.seriesLabels),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Malformed payload.';
    throw new Error(formatPayloadParseError({ contract: payloadFormat, reason: message, payload: params.payload }));
  }
}

type UseTimeseriesLiveFrameArgs = {
  spec: PlotPanelSpec;
  binding: PlotRuntimeBinding;
  executionState?: 'idle' | 'ready' | 'running' | 'stopped' | 'error';
};

export function useTimeseriesLiveFrame({ spec, binding, executionState }: UseTimeseriesLiveFrameArgs): PlotDataFrame {
  const controllerRef = useRef(createPlotFrameController(spec));
  const [frame, setFrame] = useState<PlotDataFrame>(() => controllerRef.current.getFrame());
  const frameRef = useRef(frame);
  const isFetchingRef = useRef(false);
  const fetchGenerationRef = useRef(0);
  const lastPublishedVersionRef = useRef(-1);
  const publishCounterRef = useRef(0);
  const publishWindowStartedAtRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const pendingNoDataTimeoutRef = useRef<number | null>(null);
  const pendingNoDataFrameRef = useRef<PlotDataFrame | null>(null);
  const websocketStatsRef = useRef<{
    lastArrivalMs: number | null;
    liveIngressFpsHz: number | null;
    lastSeq: number | null;
  }>({
    lastArrivalMs: null,
    liveIngressFpsHz: null,
    lastSeq: null,
  });
  const websocketPendingFrameRef = useRef<{
    frame: PowerSpectrumWebSocketFrame;
    liveIngressFpsHz: number | null;
  } | null>(null);
  const websocketRenderHandleRef = useRef<number | null>(null);

  const endpoint = binding.endpoint?.trim() ?? '';
  const websocketEndpoint = normalizePowerSpectrumWebSocketEndpoint(endpoint);
  const runtimeActive = executionState === 'running';
  const transportMode = resolveLiveTransportMode(binding);
  const hasEndpoint = endpoint.length > 0;
  const supportsHttpLivePath = transportMode === 'http' && runtimeActive && hasEndpoint;
  const supportsWebSocketLivePath = transportMode === 'websocket' && runtimeActive && hasEndpoint;
  const pollMs = normalizeSeriesPollMs(binding.pollMs);
  const expectedContract = resolvePayloadContract(spec.source.payloadFormat);

  useEffect(() => {
    fetchGenerationRef.current += 1;
    controllerRef.current = createPlotFrameController(spec);
    lastPublishedVersionRef.current = -1;
    if (pendingNoDataTimeoutRef.current !== null) {
      window.clearTimeout(pendingNoDataTimeoutRef.current);
      pendingNoDataTimeoutRef.current = null;
    }
    pendingNoDataFrameRef.current = null;
  }, [spec]);

  const refresh = useCallback(async () => {
    if (!supportsHttpLivePath || !endpoint || isFetchingRef.current) {
      return;
    }

    const refreshGeneration = fetchGenerationRef.current;
    isFetchingRef.current = true;
    try {
      const payload = await fetchSnapshotPayload(endpoint);
      if (refreshGeneration !== fetchGenerationRef.current) {
        return;
      }
      const parsed = parseLiveFrameFromPayload({
        payloadFormat: spec.source.payloadFormat,
        seriesLabels: spec.view.seriesLabels,
        payload,
      });
      if (parsed.kind === 'image') {
        assertImageShape(parsed.image, {
          stage: 'frame-ingest',
        });
        controllerRef.current.ingestImage(parsed.image, Date.now());
        assertImageShape(controllerRef.current.getFrame().image ?? parsed.image, {
          stage: 'frame-readback',
        });
      } else {
        assertSeriesShape(parsed.series, {
          stage: 'frame-ingest',
        });
        controllerRef.current.ingestSeries(parsed.series, Date.now(), 'replace', {
          xyRenderMode: parsed.xyRenderMode,
          xyPointSize: parsed.xyPointSize,
          xyPointAlpha: parsed.xyPointAlpha,
        });
        assertSeriesShape(controllerRef.current.getFrame().series ?? [], {
          stage: 'frame-readback',
        });
      }
    } catch (error) {
      if (refreshGeneration !== fetchGenerationRef.current) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to load timeseries snapshot.';
      tracePlotDiagnostic('payload-rejected', {
        panelId: spec.panelId,
        contract: expectedContract,
        transport: binding.transport,
        endpoint,
        reason: message,
      });
      controllerRef.current.setError(`Live fetch failed: ${message}`, 'runtime');
    } finally {
      isFetchingRef.current = false;
    }
  }, [binding.transport, endpoint, expectedContract, spec.panelId, spec.source.payloadFormat, spec.view.seriesLabels, supportsHttpLivePath]);

  useEffect(() => {
    if (supportsHttpLivePath) {
      tracePlotDiagnostic('binding-route', {
        panelId: spec.panelId,
        contract: expectedContract,
        transport: binding.transport,
        endpoint,
      });
      controllerRef.current.setLoading(`Connecting ${binding.transport}…`);
      void refresh();
      return;
    }

    if (supportsWebSocketLivePath) {
      tracePlotDiagnostic('binding-route', {
        panelId: spec.panelId,
        contract: expectedContract,
        transport: binding.transport,
        endpoint: websocketEndpoint,
        mode: 'websocket',
      });
      controllerRef.current.setLoading(`Connecting websocket to ${websocketEndpoint}…`);
      return;
    }

    fetchGenerationRef.current += 1;
    controllerRef.current.reset();
    if (!runtimeActive && binding.status === 'configured' && transportMode !== 'unsupported' && hasEndpoint) {
      controllerRef.current.setNoData();
      setFrame(controllerRef.current.getFrame());
      return;
    }
    const failure =
      binding.status === 'invalid' || (binding.status === 'configured' && transportMode === 'unsupported')
        ? deriveBindingFailure({
            status: binding.status,
            reason: binding.status === 'configured' ? 'unsupported-transport' : undefined,
          })
        : null;
    if (failure) {
      tracePlotDiagnostic('binding-invalid', {
        panelId: spec.panelId,
        contract: expectedContract,
        status: binding.status,
        reason: transportMode,
        transport: binding.transport,
        endpoint,
      });
      controllerRef.current.setError(failure.message, failure.errorKind);
    }
    setFrame(controllerRef.current.getFrame());
  }, [
    binding.status,
    binding.transport,
    endpoint,
    hasEndpoint,
    expectedContract,
    refresh,
    runtimeActive,
    spec.panelId,
    supportsHttpLivePath,
    supportsWebSocketLivePath,
    transportMode,
  ]);

  useEffect(() => {
    if (!supportsHttpLivePath) {
      return undefined;
    }

    return createSeriesPollSubscription(binding.transport, pollMs, () => {
      void refresh();
    });
  }, [binding.transport, pollMs, refresh, supportsHttpLivePath]);

  useEffect(() => {
    if (!supportsWebSocketLivePath) {
      return undefined;
    }

    websocketStatsRef.current = {
      lastArrivalMs: null,
      liveIngressFpsHz: null,
      lastSeq: null,
    };
    websocketPendingFrameRef.current = null;
    const publishControllerFrame = () => {
      const nextFrame = controllerRef.current.getFrame();
      frameRef.current = nextFrame;
      setFrame(nextFrame);
      return nextFrame;
    };

    const scheduleWebSocketRender = () => {
      if (websocketRenderHandleRef.current !== null) {
        return;
      }
      websocketRenderHandleRef.current = window.requestAnimationFrame(() => {
        websocketRenderHandleRef.current = null;

        const pending = websocketPendingFrameRef.current;
        if (!pending) {
          return;
        }

        websocketPendingFrameRef.current = null;
        const mappedSeries = mapPowerSpectrumWebSocketFrameToSeriesFrame(
          pending.frame,
          spec.view.seriesLabels?.[0],
        );
        controllerRef.current.ingestSeries(
          [mappedSeries],
          Math.round(pending.frame.timestampSec * 1000),
          'replace',
          {
            xyRenderMode: 'line',
            statusMessage: `WebSocket connected · seq ${pending.frame.seq}`,
            liveIngressFpsHz: pending.liveIngressFpsHz ?? undefined,
          },
        );
        lastPublishedVersionRef.current = controllerRef.current.getVersion();
        publishControllerFrame();

        if (websocketPendingFrameRef.current !== null) {
          scheduleWebSocketRender();
        }
      });
    };

    controllerRef.current.setLoading();
    publishControllerFrame();
    return createPowerSpectrumWebSocketSubscription({
      endpoint: websocketEndpoint,
      onFrame: (spectrumFrame) => {
        const nowMs = Date.now();
        const previous = websocketStatsRef.current;
        const liveIngressFpsHz = deriveWebSocketIngressFps({
          previousArrivalMs: previous.lastArrivalMs,
          previousFpsHz: previous.liveIngressFpsHz,
          nowMs,
        });
        websocketStatsRef.current = {
          lastArrivalMs: nowMs,
          liveIngressFpsHz,
          lastSeq: spectrumFrame.seq,
        };
        tracePlotDiagnostic('websocket-frame', {
          panelId: spec.panelId,
          endpoint: websocketEndpoint,
          seq: spectrumFrame.seq,
          bins: spectrumFrame.bins,
          centerHz: spectrumFrame.centerHz,
          spanHz: spectrumFrame.spanHz,
          timestampSec: spectrumFrame.timestampSec,
        });
        websocketPendingFrameRef.current = {
          frame: spectrumFrame,
          liveIngressFpsHz,
        };
        scheduleWebSocketRender();
      },
      onConnectionState: (state, message) => {
        tracePlotDiagnostic('websocket-state', {
          panelId: spec.panelId,
          endpoint: websocketEndpoint,
          state,
          message,
        });
        if (state === 'connecting' || state === 'reconnecting') {
          controllerRef.current.setLoading(
            state === 'reconnecting'
              ? `Reconnecting websocket to ${websocketEndpoint}…`
              : `Connecting websocket to ${websocketEndpoint}…`,
          );
          publishControllerFrame();
          return;
        }
        if (state === 'open') {
          controllerRef.current.setLoading(`WebSocket connected to ${websocketEndpoint}. Waiting for spectrum…`);
          publishControllerFrame();
          return;
        }
        if (state === 'error') {
          controllerRef.current.setError(message ?? 'Power spectrum websocket connection failed.', 'runtime');
          publishControllerFrame();
        }
      },
    });
  }, [spec.view.seriesLabels, supportsWebSocketLivePath, websocketEndpoint]);

  useEffect(() => {
    const handle = window.setInterval(() => {
      const nextVersion = controllerRef.current.getVersion();
      if (nextVersion === lastPublishedVersionRef.current) {
        return;
      }

      const nextFrame = controllerRef.current.getFrame();
      lastPublishedVersionRef.current = nextVersion;

      if (shouldRetainPreviousLiveFrame({ currentFrame: frameRef.current, nextFrame })) {
        pendingNoDataFrameRef.current = nextFrame;
        if (pendingNoDataTimeoutRef.current === null) {
          pendingNoDataTimeoutRef.current = window.setTimeout(() => {
            const pendingFrame = pendingNoDataFrameRef.current;
            pendingNoDataTimeoutRef.current = null;
            pendingNoDataFrameRef.current = null;
            if (pendingFrame) {
              frameRef.current = pendingFrame;
              setFrame(pendingFrame);
            }
          }, PLOT_NO_DATA_GRACE_MS);
        }
        return;
      }

      if (pendingNoDataTimeoutRef.current !== null) {
        window.clearTimeout(pendingNoDataTimeoutRef.current);
        pendingNoDataTimeoutRef.current = null;
        pendingNoDataFrameRef.current = null;
      }

      frameRef.current = nextFrame;
      setFrame(nextFrame);

      publishCounterRef.current += 1;
      if (
        import.meta.env.DEV &&
        (window as unknown as { __GR4_STUDIO_PLOT_DEBUG?: boolean }).__GR4_STUDIO_PLOT_DEBUG
      ) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const elapsedMs = now - publishWindowStartedAtRef.current;
        if (elapsedMs >= 2000) {
          const hz = (publishCounterRef.current * 1000) / elapsedMs;
          const points = nextFrame.series?.[0]?.y?.length ?? 0;
          console.debug('[plot:timeseries]', {
            panelId: spec.panelId,
            publishHz: Number(hz.toFixed(2)),
            points,
            state: nextFrame.meta?.state,
          });
          publishCounterRef.current = 0;
          publishWindowStartedAtRef.current = now;
        }
      }
    }, PLOT_PUBLISH_MS);
    return () => {
      fetchGenerationRef.current += 1;
      if (pendingNoDataTimeoutRef.current !== null) {
        window.clearTimeout(pendingNoDataTimeoutRef.current);
        pendingNoDataTimeoutRef.current = null;
      }
      if (websocketRenderHandleRef.current !== null) {
        window.cancelAnimationFrame(websocketRenderHandleRef.current);
        websocketRenderHandleRef.current = null;
      }
      websocketPendingFrameRef.current = null;
      window.clearInterval(handle);
    };
  }, [spec.panelId]);

  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);

  return frame;
}
