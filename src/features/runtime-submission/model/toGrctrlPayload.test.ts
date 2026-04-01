import { describe, expect, it } from 'vitest';
import { toGrctrlContentSubmission } from './toGrctrlPayload';
import type { GraphDocument } from '../../graph-document/model/types';
import type { BlockDetails } from '../../../lib/api/block-details';

function makeDocument(name: string, uiConstraintsValue: string): GraphDocument {
  return {
    format: 'gr4-studio.graph',
    version: 1,
    metadata: {
      name,
    },
    graph: {
      nodes: [
        {
          id: 'http_sink_1',
          blockType: 'gr::incubator::http::HttpTimeSeriesSink<float32>',
          title: 'HttpTimeSeriesSink',
          position: { x: 0, y: 0 },
          parameters: {
            ui_constraints: { kind: 'expression', expr: uiConstraintsValue },
            bind_port: { kind: 'expression', expr: '8080' },
          },
        },
      ],
      edges: [],
    },
  };
}

function makeVectorSettingsDocument(name: string): GraphDocument {
  return {
    format: 'gr4-studio.graph',
    version: 1,
    metadata: {
      name,
    },
    graph: {
      nodes: [
        {
          id: 'pfb_1',
          blockType: 'gr::incubator::pfb::PfbArbResampler<float32>',
          title: 'PfbArbResampler<float32>',
          position: { x: 0, y: 0 },
          parameters: {
            taps: { kind: 'expression', expr: '' },
            gain: { kind: 'expression', expr: '' },
            name: { kind: 'expression', expr: 'pfb_1' },
          },
        },
      ],
      edges: [],
    },
  };
}

function makeBlockDetailsMap(): ReadonlyMap<string, BlockDetails> {
  return new Map([
    [
      'gr::incubator::pfb::PfbArbResampler<float32>',
      {
        blockTypeId: 'gr::incubator::pfb::PfbArbResampler<float32>',
        displayName: 'PfbArbResampler<float32>',
        parameters: [
          {
            name: 'taps',
            label: 'taps',
            mutable: true,
            readOnly: false,
            valueKind: 'scalar',
            isCollectionLike: true,
          },
          {
            name: 'gain',
            label: 'gain',
            mutable: true,
            readOnly: false,
            valueKind: 'scalar',
          },
        ],
        inputPorts: [],
        outputPorts: [],
      },
    ],
  ]);
}

describe('toGrctrlContentSubmission', () => {
  it('emits runtime importer block shape with block type in id and instance name in parameters.name', () => {
    const document: GraphDocument = {
      format: 'gr4-studio.graph',
      version: 1,
      metadata: { name: 'runtime-shape' },
      graph: {
        nodes: [
          {
            id: 'gr__testing__NullSink_float32__5',
            blockType: 'gr::testing::NullSink<float32>',
            title: 'NullSink<float32>',
            position: { x: 0, y: 0 },
            parameters: {},
          },
          {
            id: 'gr__testing__NullSource_float32__2',
            blockType: 'gr::testing::NullSource<float32>',
            title: 'NullSource<float32>',
            position: { x: 100, y: 0 },
            parameters: {},
          },
        ],
        edges: [
          {
            id: 'edge_1',
            source: { nodeId: 'gr__testing__NullSource_float32__2', portId: 'out' },
            target: { nodeId: 'gr__testing__NullSink_float32__5', portId: 'in' },
          },
        ],
      },
    };

    const submission = toGrctrlContentSubmission(document);
    expect(submission.content).toContain('- id: "gr::testing::NullSink<float32>"');
    expect(submission.content).toContain('- id: "gr::testing::NullSource<float32>"');
    expect(submission.content).toContain('name: gr__testing__NullSink_float32__5');
    expect(submission.content).toContain('name: gr__testing__NullSource_float32__2');
    expect(submission.content).toContain(
      '- [gr__testing__NullSource_float32__2, out, gr__testing__NullSink_float32__5, in]',
    );
    expect(submission.content).not.toContain('  block:');
    expect(submission.content).not.toContain('  title:');
  });

  it('normalizes quoted ui_constraints map expressions into inline YAML map values', () => {
    const submission = toGrctrlContentSubmission(makeDocument('graph', '"{}"'));
    expect(submission.content).toContain('ui_constraints: {}');
  });

  it('serializes blank ui_constraints as an empty map instead of an empty string', () => {
    const submission = toGrctrlContentSubmission(makeDocument('graph', ''));
    expect(submission.content).toContain('ui_constraints: {}');
    expect(submission.content).not.toContain('ui_constraints: ""');
  });

  it('omits unset collection-like parameters when block metadata marks them as collections', () => {
    const submission = toGrctrlContentSubmission(makeVectorSettingsDocument('graph'), {
      blockDetailsByType: makeBlockDetailsMap(),
    });

    expect(submission.content).not.toContain('taps: ""');
    expect(submission.content).not.toContain('taps:');
    expect(submission.content).toContain('gain: ""');
  });

  it('keeps blank scalar parameters serialized when metadata does not mark them as collections', () => {
    const document = makeVectorSettingsDocument('graph');
    const submission = toGrctrlContentSubmission(document);

    expect(submission.content).toContain('taps: ""');
    expect(submission.content).toContain('gain: ""');
  });

  it('produces deterministic output and hash for equivalent documents', () => {
    const left = toGrctrlContentSubmission(makeDocument('graph', '"{}"'));
    const right = toGrctrlContentSubmission(makeDocument('graph', '"{}"'));

    expect(left.content).toBe(right.content);
    expect(left.contentHash).toBe(right.contentHash);
  });

  it('changes content hash when graph content changes', () => {
    const left = toGrctrlContentSubmission(makeDocument('graph-a', '"{}"'));
    const right = toGrctrlContentSubmission(makeDocument('graph-b', '"{}"'));

    expect(left.contentHash).not.toBe(right.contentHash);
  });
});
