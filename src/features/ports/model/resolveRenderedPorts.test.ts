import { describe, expect, it } from 'vitest';
import { resolveRenderedPorts } from './resolveRenderedPorts';
import type { SchemaPort } from './types';

function resolveSingle(schemaPort: SchemaPort, parameterValues: Record<string, string> = {}) {
  return resolveRenderedPorts({
    schemaPorts: [schemaPort],
    parameterValues,
  });
}

describe('resolveRenderedPorts', () => {
  it('renders explicit dynamic collections from catalog metadata and live parameter values', () => {
    const result = resolveSingle({
      name: 'banana',
      direction: 'input',
      cardinalityKind: 'dynamic',
      isExplicitDynamicCollection: true,
      renderPortCount: 3,
      minPortCount: 1,
      maxPortCount: 32,
      sizeParameter: 'n_inputs',
      typeName: 'float',
    }, { n_inputs: '9' });

    expect(result.inputs).toHaveLength(9);
    expect(result.inputs.map((port) => port.portId)).toEqual([
      'banana#0',
      'banana#1',
      'banana#2',
      'banana#3',
      'banana#4',
      'banana#5',
      'banana#6',
      'banana#7',
      'banana#8',
    ]);
    expect(result.inputs.map((port) => port.handleId)).toEqual([
      'handle_banana_23_0',
      'handle_banana_23_1',
      'handle_banana_23_2',
      'handle_banana_23_3',
      'handle_banana_23_4',
      'handle_banana_23_5',
      'handle_banana_23_6',
      'handle_banana_23_7',
      'handle_banana_23_8',
    ]);
    expect(result.inputs.every((port) => port.connectable)).toBe(true);
  });

  it('keeps fixed ports fixed', () => {
    const result = resolveSingle({
      name: 'out',
      direction: 'output',
      cardinalityKind: 'fixed',
      typeName: 'float32',
    });

    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]).toMatchObject({
      key: 'output:out',
      direction: 'output',
      displayLabel: 'out',
      portId: 'out',
      sourceSchemaName: 'out',
      cardinalityKind: 'fixed',
      inference: 'authoritative',
      connectable: true,
      typeName: 'float32',
    });
  });

  it('uses handle_name_template when provided', () => {
    const result = resolveSingle({
      name: 'in',
      direction: 'input',
      cardinalityKind: 'dynamic',
      isExplicitDynamicCollection: true,
      renderPortCount: 2,
      handleNameTemplate: 'in#${index}',
      typeName: 'float32',
    });

    expect(result.inputs.map((port) => port.portId)).toEqual(['in#0', 'in#1']);
    expect(result.inputs.map((port) => port.displayLabel)).toEqual(['in#0', 'in#1']);
    expect(result.inputs.map((port) => port.handleId)).toEqual(['handle_in_23_0', 'handle_in_23_1']);
    expect(result.inputs[0]).toMatchObject({
      key: 'input:in#0',
      sourceSchemaName: 'in',
      inference: 'authoritative',
    });
  });

  it('uses renderPortCount when sizeParameter is absent or unset', () => {
    const result = resolveSingle(
      {
        name: 'banana',
        direction: 'input',
        cardinalityKind: 'dynamic',
        isExplicitDynamicCollection: true,
        renderPortCount: 4,
        sizeParameter: 'n_inputs',
        minPortCount: 1,
        maxPortCount: 32,
      },
    );

    expect(result.inputs).toHaveLength(4);
    expect(result.inputs.map((port) => port.portId)).toEqual(['banana#0', 'banana#1', 'banana#2', 'banana#3']);
  });

  it('uses live sizeParameter values over renderPortCount when present', () => {
    const result = resolveSingle({
      name: 'banana',
      direction: 'input',
      cardinalityKind: 'dynamic',
      isExplicitDynamicCollection: true,
      renderPortCount: 5,
      sizeParameter: 'n_inputs',
      minPortCount: 1,
      maxPortCount: 32,
      typeName: 'float32',
    }, { n_inputs: '7' });

    expect(result.inputs).toHaveLength(7);
    expect(result.inputs.map((port) => port.portId)).toEqual([
      'banana#0',
      'banana#1',
      'banana#2',
      'banana#3',
      'banana#4',
      'banana#5',
      'banana#6',
    ]);
  });

  it('falls back to legacy name-based inference when explicit metadata is absent', () => {
    const result = resolveSingle(
      {
        name: 'inputs',
        direction: 'input',
        cardinalityKind: 'dynamic',
        typeName: 'float32',
      },
      { n_inputs: '2' },
    );

    expect(result.inputs).toHaveLength(2);
    expect(result.inputs.map((port) => port.portId)).toEqual(['inputs#0', 'inputs#1']);
    expect(result.inputs[0].inference).toBe('inferred');
  });
});
