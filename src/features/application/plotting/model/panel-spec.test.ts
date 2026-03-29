import { describe, expect, it } from 'vitest';
import { derivePlotPanelSpec } from './panel-spec';
import type { WorkspacePanelViewModel } from '../../../workspace/workspace-view';

function makeSeriesEntry(overrides: Partial<WorkspacePanelViewModel> = {}): WorkspacePanelViewModel {
  return {
    panel: {
      id: 'studio-panel:node-a',
      nodeId: 'node-a',
      kind: 'series',
      title: 'Panel Title',
      visible: true,
      previewOnCanvas: false,
    },
    nodeDisplayName: 'Node Display',
    ...overrides,
  };
}

describe('derivePlotPanelSpec', () => {
  it('prefers graph-side semantic metadata when available', () => {
    const spec = derivePlotPanelSpec(
      makeSeriesEntry({
        nodeParameters: {
          plot_title: 'Semantic Plot',
          x_label: 'time (s)',
          y_label: 'amplitude',
          series_labels: 'left,right',
        },
      }),
    );

    expect(spec?.view.title).toBe('Semantic Plot');
    expect(spec?.view.xLabel).toBe('time (s)');
    expect(spec?.view.yLabel).toBe('amplitude');
    expect(spec?.view.seriesLabels).toEqual(['left', 'right']);
  });

  it('falls back to sensible defaults when semantic metadata is missing', () => {
    const spec = derivePlotPanelSpec(
      makeSeriesEntry({
        nodeParameters: {
          channels: '2',
        },
      }),
    );

    expect(spec?.view.title).toBe('Node Display');
    expect(spec?.view.xLabel).toBe('sample');
    expect(spec?.view.yLabel).toBe('value');
    expect(spec?.view.seriesLabels).toEqual(['ch0', 'ch1']);
    expect(spec?.view.colorAssignmentMode).toBe('byIndex');
    expect(spec?.view.plotColors?.length).toBeGreaterThan(0);
  });

  it('uses panel plot style override when present', () => {
    const spec = derivePlotPanelSpec(
      makeSeriesEntry({
        panel: {
          id: 'studio-panel:node-a',
          nodeId: 'node-a',
          kind: 'series',
          title: 'Panel Title',
          visible: true,
          previewOnCanvas: false,
          plotStyle: {
            palette: {
              kind: 'custom',
              colors: ['#111111', '#222222', '#333333'],
            },
            assignmentMode: 'byIndex',
          },
        },
      }),
    );

    expect(spec?.view.plotColors).toEqual(['#111111', '#222222', '#333333']);
    expect(spec?.view.colorAssignmentMode).toBe('byIndex');
  });

  it('resolves studio palette references via workspace palette definitions', () => {
    const spec = derivePlotPanelSpec(
      makeSeriesEntry({
        studioPlotPalettes: [
          {
            id: 'operations',
            colors: ['#101010', '#202020', '#303030'],
          },
        ],
        panel: {
          id: 'studio-panel:node-a',
          nodeId: 'node-a',
          kind: 'series',
          title: 'Panel Title',
          visible: true,
          previewOnCanvas: false,
          plotStyle: {
            assignmentMode: 'byIndex',
            palette: {
              kind: 'studio',
              id: 'operations',
            },
          },
        },
      }),
    );

    expect(spec?.view.plotColors).toEqual(['#101010', '#202020', '#303030']);
  });

  it('returns null for non-series panels', () => {
    const entry: WorkspacePanelViewModel = {
      ...makeSeriesEntry(),
      panel: {
        id: 'studio-panel:image-1',
        nodeId: 'image-1',
        kind: 'image',
        visible: true,
        previewOnCanvas: false,
      },
    };
    expect(derivePlotPanelSpec(entry)).toBeNull();
  });

  it('derives vector sink plotting spec from series2d panels', () => {
    const spec = derivePlotPanelSpec(
      makeSeriesEntry({
        panel: {
          id: 'studio-panel:node-2d',
          nodeId: 'node-2d',
          kind: 'series2d',
          title: '2D Sink',
          visible: true,
          previewOnCanvas: false,
        },
        nodeBlockTypeId: 'gr::studio::Studio2DSeriesSink<float32>',
        nodeParameters: {
          window_size: '512',
          x_label: 'bin',
          y_label: 'value',
          series_labels: 'spectrum',
        },
      }),
    );

    expect(spec?.kind).toBe('timeseries');
    expect(spec?.source.payloadFormat).toBe('series2d-xy-json-v1');
    expect(spec?.view.xMode).toBe('frequency');
    expect(spec?.view.windowSize).toBe(512);
    expect(spec?.view.seriesLabels).toEqual(['spectrum']);
    expect(spec?.view.xLabel).toBe('bin');
  });

  it('derives dataset-xy payload format from StudioDataSetSink IDs', () => {
    const spec = derivePlotPanelSpec(
      makeSeriesEntry({
        panel: {
          id: 'studio-panel:node-dataset',
          nodeId: 'node-dataset',
          kind: 'series2d',
          title: 'DataSet Sink',
          visible: true,
          previewOnCanvas: false,
        },
        nodeBlockTypeId: 'gr::studio::StudioDataSetSink<float32>',
      }),
    );

    expect(spec?.source.payloadFormat).toBe('dataset-xy-json-v1');
    expect(spec?.view.xMode).toBe('frequency');
  });

  it('derives fixed axis ranges when autoscale is disabled', () => {
    const spec = derivePlotPanelSpec(
      makeSeriesEntry({
        nodeParameters: {
          autoscale: 'false',
          x_min: '-2',
          x_max: '2',
          y_min: '-1.5',
          y_max: '1.5',
        },
      }),
    );

    expect(spec?.view.xRange).toEqual({
      auto: false,
      min: -2,
      max: 2,
    });
    expect(spec?.view.yRange).toEqual({
      auto: false,
      min: -1.5,
      max: 1.5,
    });
  });

  it('falls back to auto axis scaling when manual range is invalid', () => {
    const spec = derivePlotPanelSpec(
      makeSeriesEntry({
        nodeParameters: {
          autoscale: 'false',
          x_min: '0',
          x_max: '0',
          y_min: '2',
          y_max: '1',
        },
      }),
    );

    expect(spec?.view.xRange).toEqual({ auto: true });
    expect(spec?.view.yRange).toEqual({
      auto: true,
      min: undefined,
      max: undefined,
    });
  });
});
