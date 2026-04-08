import { useMemo } from 'react';
import { PlotPanel } from '../../application/plotting/components/plot-panel';
import type { PlotPanelSpec, PlotRuntimeBinding } from '../../application/plotting/model/types';
import type { WorkspaceLiveRendererContext } from './live-renderer-contract';

type HistogramLiveRendererProps = {
  liveContext: WorkspaceLiveRendererContext;
};

function buildHistogramSpec(panelId: string, sinkId: string, title: string): PlotPanelSpec {
  return {
    panelId,
    kind: 'histogram',
    source: {
      sinkId,
      channel: 'all',
      field: 'y',
      payloadFormat: 'dataset-xy-json-v1',
    },
    view: {
      kind: 'histogram',
      title,
      xMode: 'frequency',
      streaming: true,
      legend: true,
      xLabel: 'Frequency',
      yLabel: 'Power',
    },
  };
}

export function PhosphorSpectrumLiveRenderer({ liveContext }: HistogramLiveRendererProps) {
  const spec = useMemo(
    () =>
      buildHistogramSpec(
        liveContext.panel.panelId,
        liveContext.panel.nodeId ?? liveContext.panel.panelId,
        liveContext.panel.title ?? 'Phosphor Spectrum',
      ),
    [liveContext.panel.nodeId, liveContext.panel.panelId, liveContext.panel.title],
  );

  const binding: PlotRuntimeBinding = {
    status: liveContext.binding.status,
    transport: liveContext.binding.transport,
    endpoint: liveContext.binding.endpoint,
    updateMs: liveContext.binding.updateMs,
  };

  return <PlotPanel spec={spec} binding={binding} executionState={liveContext.executionState} />;
}
