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

  it('resolves exponent notation in variables and parameter expressions', () => {
    const document = makeDocument();
    document.metadata.studio!.variables = [
      {
        id: 'var-rate',
        name: 'rf_sample_rate',
        binding: {
          kind: 'literal',
          value: '400e3',
        },
      },
      {
        id: 'var-dev',
        name: 'fm_max_deviation',
        binding: {
          kind: 'literal',
          value: 75e3,
        },
      },
      {
        id: 'var-gain',
        name: 'quadrature_gain',
        binding: {
          kind: 'expression',
          expr: 'rf_sample_rate / (2 * 3.141592653589793 * fm_max_deviation)',
        },
      },
    ];
    document.graph.nodes[0]!.parameters = {
      tau: {
        kind: 'expression',
        expr: '75e-6',
      },
    };

    const resolved = resolveGraphVariables(document);

    expect(resolved.variablesByName.quadrature_gain.state).toBe('resolved');
    expect(resolved.variablesByName.quadrature_gain.value).toBe(0.8488263631567752);
    expect(resolved.parametersByNodeId['node-1']?.tau.state).toBe('resolved');
    expect(resolved.parametersByNodeId['node-1']?.tau.value).toBe(0.000075);
  });

  it('can resolve against temporary variable overrides without mutating the document', () => {
    const document = makeDocument();
    const resolved = resolveGraphVariables(document, {
      variableOverridesByName: {
        center_freq: {
          kind: 'literal',
          value: 200,
        },
      },
    });

    expect(resolved.variablesByName.center_freq.value).toBe(200);
    expect(resolved.variablesByName.offset.value).toBe(100);
    expect(resolved.parametersByNodeId['node-1']?.freq.value).toBe(125);
    expect(document.metadata.studio?.variables?.[0]?.binding).toEqual({
      kind: 'literal',
      value: 100,
    });
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
