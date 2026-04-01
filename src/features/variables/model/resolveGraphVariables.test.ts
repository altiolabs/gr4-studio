import { describe, expect, it } from 'vitest';
import type { GraphDocument } from '../../graph-document/model/types';
import { resolveGraphVariables } from './resolveGraphVariables';

function makeDocument(): GraphDocument {
  return {
    format: 'gr4-studio.graph',
    version: 1,
    metadata: {
      name: 'Graph',
      studio: {
        panels: [],
        variables: [
          {
            id: 'var-a',
            name: 'center_freq',
            binding: {
              kind: 'literal',
              value: 100,
            },
          },
          {
            id: 'var-b',
            name: 'offset',
            binding: {
              kind: 'expression',
              expr: 'center_freq / 2',
            },
          },
        ],
      },
    },
    graph: {
      nodes: [
        {
          id: 'node-1',
          blockType: 'test.Block',
          title: 'Node',
          position: { x: 0, y: 0 },
          parameters: {
            freq: {
              kind: 'expression',
              expr: 'offset + 25',
            },
          },
        },
      ],
      edges: [],
    },
  };
}

describe('resolveGraphVariables', () => {
  it('resolves variable dependencies into block parameter values', () => {
    const resolved = resolveGraphVariables(makeDocument());

    expect(resolved.variablesByName.center_freq.state).toBe('literal');
    expect(resolved.variablesByName.offset.state).toBe('resolved');
    expect(resolved.variablesByName.offset.value).toBe(50);
    expect(resolved.parametersByNodeId['node-1']?.freq.state).toBe('resolved');
    expect(resolved.parametersByNodeId['node-1']?.freq.value).toBe(75);
  });

  it('reports unknown variables and cycles', () => {
    const document: GraphDocument = {
      format: 'gr4-studio.graph',
      version: 1,
      metadata: {
        name: 'Graph',
        studio: {
          panels: [],
          variables: [
            {
              id: 'var-a',
              name: 'a',
              binding: {
                kind: 'expression',
                expr: 'b + 1',
              },
            },
            {
              id: 'var-b',
              name: 'b',
              binding: {
                kind: 'expression',
                expr: 'a + 1',
              },
            },
          ],
        },
      },
      graph: {
        nodes: [
          {
            id: 'node-1',
            blockType: 'test.Block',
            title: 'Node',
            position: { x: 0, y: 0 },
            parameters: {
              freq: {
                kind: 'expression',
                expr: 'missing + 1',
              },
            },
          },
        ],
        edges: [],
      },
    };

    const resolved = resolveGraphVariables(document);

    expect(resolved.variablesByName.a.state).toBe('cycle');
    expect(resolved.variablesByName.b.state).toBe('cycle');
    expect(resolved.parametersByNodeId['node-1']?.freq.state).toBe('unknown_variable');
    expect(resolved.diagnostics.some((diagnostic) => diagnostic.kind === 'cycle')).toBe(true);
    expect(resolved.diagnostics.some((diagnostic) => diagnostic.kind === 'unknown_variable')).toBe(true);
  });
});
