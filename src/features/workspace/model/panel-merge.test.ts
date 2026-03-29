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

describe('mergeSavedAndDerivedStudioPanels', () => {
  it('keeps saved panels authoritative and appends only missing derived gaps', () => {
    const merged = mergeSavedAndDerivedStudioPanels({
      savedPanels: [panel('saved-a', 'node-a'), panel('saved-stale', 'missing-node')],
      derivedPanels: [panel('derived-a', 'node-a'), panel('derived-b', 'node-b')],
    });

    expect(merged).toEqual([
      panel('saved-a', 'node-a'),
      panel('saved-stale', 'missing-node'),
      panel('derived-b', 'node-b'),
    ]);
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
