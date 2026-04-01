import { describe, expect, it } from 'vitest';
import { graphDocumentFromEditor } from './fromEditor';
import { editorGraphFromDocument } from './toEditor';

describe('studio panel metadata round-trip', () => {
  it('preserves studio panels and layout between editor snapshot and graph document', () => {
    const snapshot = {
      metadata: {
        name: 'Graph',
        description: 'desc',
        studioPanels: [
          {
            id: 'studio-panel:node-1',
            nodeId: 'node-1',
            kind: 'series' as const,
            title: 'Series',
            visible: true,
            previewOnCanvas: false,
            plotStyle: {
              assignmentMode: 'byIndex' as const,
              palette: {
                kind: 'custom' as const,
                colors: ['#00ff00', '#ff00ff'],
              },
            },
          },
        ],
        studioLayout: {
          version: 2 as const,
          root: {
            kind: 'pane' as const,
            panelId: 'studio-panel:node-1',
          },
          activePanelId: 'studio-panel:node-1',
        },
        studioPlotPalettes: [
          {
            id: 'studio-default',
            colors: ['#22d3ee', '#38bdf8'],
          },
        ],
      },
      nodes: [],
      edges: [],
    };

    const document = graphDocumentFromEditor(snapshot);
    expect(document.metadata.studio?.panels).toEqual(snapshot.metadata.studioPanels);
    expect(document.metadata.studio?.layout).toEqual(snapshot.metadata.studioLayout);
    expect(document.metadata.studio?.plotPalettes).toEqual(snapshot.metadata.studioPlotPalettes);

    const restored = editorGraphFromDocument(document);
    expect(restored.metadata.studioPanels).toEqual(snapshot.metadata.studioPanels);
    expect(restored.metadata.studioLayout).toEqual(snapshot.metadata.studioLayout);
    expect(restored.metadata.studioPlotPalettes).toEqual(snapshot.metadata.studioPlotPalettes);
  });

  it('preserves control panels and widgets between editor snapshot and graph document', () => {
    const snapshot = {
      metadata: {
        name: 'Graph',
        studioPanels: [
          {
            id: 'studio-control:node-1',
            kind: 'control' as const,
            title: 'Controls',
            visible: true,
            widgets: [
              {
                id: 'gain',
                kind: 'parameter' as const,
                label: 'Gain',
                inputKind: 'number' as const,
                binding: {
                  kind: 'parameter' as const,
                  nodeId: 'node-1',
                  parameterName: 'gain',
                },
                mode: 'immediate' as const,
              },
              {
                id: 'enabled',
                kind: 'parameter' as const,
                label: 'Enabled',
                inputKind: 'boolean' as const,
                binding: {
                  kind: 'parameter' as const,
                  nodeId: 'node-2',
                  parameterName: 'enabled',
                },
              },
            ],
          },
        ],
      },
      nodes: [],
      edges: [],
    };

    const document = graphDocumentFromEditor(snapshot);
    expect(document.metadata.studio?.panels).toEqual(snapshot.metadata.studioPanels);

    const restored = editorGraphFromDocument(document);
    expect(restored.metadata.studioPanels).toEqual(snapshot.metadata.studioPanels);
  });
});
