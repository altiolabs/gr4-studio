import { useMemo } from 'react';
import { PlotPanel } from '../../application/plotting/components/plot-panel';
import type { PlotPanelSpec, PlotRuntimeBinding } from '../../application/plotting/model/types';
import type { WorkspaceLiveRendererContext } from './live-renderer-contract';

type WaterfallLiveRendererProps = {
  liveContext: WorkspaceLiveRendererContext;
};

function buildWaterfallSpec(panelId: string, sinkId: string, title: string): PlotPanelSpec {
  return {
    panelId,
    kind: 'waterfall',
    source: {
      sinkId,
      channel: 'all',
      field: 'image',
      payloadFormat: 'waterfall-spectrum-json-v1',
    },
    view: {
      kind: 'waterfall',
      title,
      xMode: 'frequency',
      streaming: true,
      legend: false,
      xLabel: 'Frequency',
      yLabel: 'Power',
    },
  };
}

export function WaterfallLiveRenderer({ liveContext }: WaterfallLiveRendererProps) {
  const spec = useMemo(
    () =>
      buildWaterfallSpec(
        liveContext.panel.panelId,
        liveContext.panel.nodeId ?? liveContext.panel.panelId,
        liveContext.panel.title ?? 'Waterfall',
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
