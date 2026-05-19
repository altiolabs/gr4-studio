import { describe, expect, it } from 'vitest';
import type { StudioPanelSpec } from '../../graph-document/model/studio-workspace';
import { mergeSavedAndDerivedStudioPanels } from './panel-merge';

function panel(id: string, nodeId: string): StudioPanelSpec {
  return {
    id,
    nodeId,
    kind: 'series',
    title: id,
    visible: true,
    previewOnCanvas: false,
  };
}

function controlPanel(id: string): StudioPanelSpec {
  return {
    id,
    kind: 'control',
    title: id,
    visible: true,
    previewOnCanvas: false,
    widgets: [],
  };
}

describe('mergeSavedAndDerivedStudioPanels', () => {
  it('keeps active saved panels authoritative and appends only missing derived gaps', () => {
    const merged = mergeSavedAndDerivedStudioPanels({
      savedPanels: [
        { ...panel('studio-panel:node-a', 'node-a'), title: 'Saved title' },
        panel('studio-panel:missing-node', 'missing-node'),
      ],
      derivedPanels: [panel('studio-panel:node-a', 'node-a'), panel('studio-panel:node-b', 'node-b')],
    });

    expect(merged).toEqual([
      { ...panel('studio-panel:node-a', 'node-a'), title: 'Saved title' },
      panel('studio-panel:node-b', 'node-b'),
    ]);
  });

  it('preserves saved control panels while pruning data panels for missing nodes', () => {
    const merged = mergeSavedAndDerivedStudioPanels({
      savedPanels: [controlPanel('control-a'), panel('studio-panel:missing-node', 'missing-node')],
      derivedPanels: [panel('studio-panel:node-a', 'node-a')],
    });

    expect(merged).toEqual([controlPanel('control-a'), panel('studio-panel:node-a', 'node-a')]);
  });

  it('is deterministic when no saved panels are present', () => {
    const derived = [panel('derived-a', 'node-a'), panel('derived-b', 'node-b')];

    expect(
      mergeSavedAndDerivedStudioPanels({
        savedPanels: undefined,
        derivedPanels: derived,
      }),
    ).toEqual(derived);
  });
});
