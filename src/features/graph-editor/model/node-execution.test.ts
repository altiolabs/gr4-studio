import { describe, expect, it } from 'vitest';
import { isLinearBypassableBlock } from './node-execution';
import type { BlockDetails } from '../../../lib/api/block-details';

function makeBlockDetails(inputPorts: number, outputPorts: number): BlockDetails {
  return {
    blockTypeId: 'test.block',
    displayName: 'Test Block',
    parameters: [],
    inputPorts: Array.from({ length: inputPorts }, (_, index) => ({
      name: `in${index}`,
      direction: 'input',
      cardinalityKind: 'fixed',
    })),
    outputPorts: Array.from({ length: outputPorts }, (_, index) => ({
      name: `out${index}`,
      direction: 'output',
      cardinalityKind: 'fixed',
    })),
  };
}

describe('node execution helpers', () => {
  it('only treats single-input single-output blocks as bypassable', () => {
    expect(isLinearBypassableBlock(makeBlockDetails(1, 1))).toBe(true);
    expect(isLinearBypassableBlock(makeBlockDetails(0, 1))).toBe(false);
    expect(isLinearBypassableBlock(makeBlockDetails(1, 2))).toBe(false);
    expect(isLinearBypassableBlock(undefined)).toBe(false);
  });
});

