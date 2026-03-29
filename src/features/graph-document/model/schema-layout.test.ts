import { describe, expect, it } from 'vitest';
import { parseGraphDocument } from './schema';

describe('graph document schema split-tree layout', () => {
  it('parses valid v2 split tree layouts', () => {
    const document = parseGraphDocument({
      format: 'gr4-studio.graph',
      version: 1,
      metadata: {
        name: 'Graph',
        studio: {
          panels: [
            {
              id: 'panel-a',
              nodeId: 'node-a',
              kind: 'series',
              visible: true,
              previewOnCanvas: false,
            },
            {
              id: 'panel-b',
              nodeId: 'node-b',
              kind: 'image',
              visible: true,
              previewOnCanvas: false,
            },
          ],
          layout: {
            version: 2,
            root: {
              kind: 'split',
              direction: 'row',
              children: [
                { kind: 'pane', panelId: 'panel-a' },
                { kind: 'pane', panelId: 'panel-b' },
              ],
              sizes: [1, 1],
            },
            activePanelId: 'panel-a',
          },
        },
      },
      graph: {
        nodes: [],
        edges: [],
      },
    });

    expect(document.metadata.studio?.layout?.version).toBe(2);
  });

  it('normalizes invalid split trees on parse', () => {
    const document = parseGraphDocument({
      format: 'gr4-studio.graph',
      version: 1,
      metadata: {
        name: 'Graph',
        studio: {
          panels: [
            {
              id: 'panel-a',
              nodeId: 'node-a',
              kind: 'series',
              visible: true,
              previewOnCanvas: false,
            },
          ],
          layout: {
            version: 2,
            root: {
              kind: 'split',
              direction: 'column',
              children: [
                {
                  kind: 'split',
                  direction: 'row',
                  children: [{ kind: 'pane', panelId: 'panel-a' }],
                  sizes: [1],
                },
              ],
              sizes: [5],
            },
          },
        },
      },
      graph: {
        nodes: [],
        edges: [],
      },
    });

    expect(document.metadata.studio?.layout).toEqual({
      version: 2,
      root: {
        kind: 'pane',
        panelId: 'panel-a',
      },
      activePanelId: 'panel-a',
    });
  });
});
