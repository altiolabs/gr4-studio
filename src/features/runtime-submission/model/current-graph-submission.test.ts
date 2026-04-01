import { describe, expect, it } from 'vitest';
import { graphDocumentFromEditor } from '../../graph-document/model/fromEditor';
import { toGrctrlContentSubmission } from './toGrctrlPayload';
import { buildCurrentGraphSubmissionFromEditorSnapshot } from './current-graph-submission';

describe('buildCurrentGraphSubmissionFromEditorSnapshot', () => {
  it('uses the same GraphDocument -> GRC serializer path as direct submission', () => {
    const snapshot = {
      metadata: {
        name: 'Example.gr4s',
        description: 'Example graph',
        studioPanels: [],
        studioVariables: [],
      },
      nodes: [
        {
          instanceId: 'node-1',
          blockTypeId: 'gr::testing::NullSource<float32>',
          displayName: 'Source',
          category: 'demo',
          parameters: {
            name: { value: 'source', bindingKind: 'literal' as const },
          },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    };

    const helper = buildCurrentGraphSubmissionFromEditorSnapshot(snapshot);
    const direct = toGrctrlContentSubmission(graphDocumentFromEditor(snapshot));

    expect(helper).toEqual(direct);
  });
});
