import { describe, expect, it } from 'vitest';
import { PlotAdapterSwitch } from './plot-adapter-switch';
import { PhosphorSpectrumUplotAdapter } from './histogram-spectrum-uplot-adapter';
import { WaterfallCanvasAdapter } from './waterfall-canvas-adapter';

describe('plot adapter switch', () => {
  it('routes waterfall plots to the waterfall canvas adapter', () => {
    const element = PlotAdapterSwitch({
      spec: { kind: 'waterfall', title: 'Waterfall' },
      frame: {
        kind: 'waterfall',
        image: {
          width: 1,
          height: 1,
          values: [1],
        },
        meta: {
          state: 'ready',
          domain: 'frequency',
        },
      },
      width: 640,
      height: 360,
    });

    expect(element.type).toBe(WaterfallCanvasAdapter);
  });

  it('routes phosphor plots to the phosphor spectrum adapter', () => {
    const element = PlotAdapterSwitch({
      spec: { kind: 'histogram', title: 'History' },
      frame: {
        kind: 'histogram',
        series: [
          {
            id: 'vector',
            label: 'vector',
            x: [1, 2],
            y: [3, 4],
          },
        ],
        meta: {
          state: 'ready',
          domain: 'frequency',
        },
      },
      width: 640,
      height: 360,
    });

    expect(element.type).toBe(PhosphorSpectrumUplotAdapter);
  });
});
