import { describe, expect, it } from 'vitest';
import {
  isQuarterTurnNodeRotation,
  resolveNodePortVisualSide,
  rotateNodeRotation,
} from './node-rotation';

describe('node rotation helpers', () => {
  it('cycles node rotations left and right', () => {
    expect(rotateNodeRotation(0, 'right')).toBe(90);
    expect(rotateNodeRotation(90, 'right')).toBe(180);
    expect(rotateNodeRotation(180, 'right')).toBe(270);
    expect(rotateNodeRotation(270, 'right')).toBe(0);

    expect(rotateNodeRotation(0, 'left')).toBe(270);
    expect(rotateNodeRotation(270, 'left')).toBe(180);
    expect(rotateNodeRotation(180, 'left')).toBe(90);
    expect(rotateNodeRotation(90, 'left')).toBe(0);
  });

  it('detects quarter-turn rotations', () => {
    expect(isQuarterTurnNodeRotation(0)).toBe(false);
    expect(isQuarterTurnNodeRotation(90)).toBe(true);
    expect(isQuarterTurnNodeRotation(180)).toBe(false);
    expect(isQuarterTurnNodeRotation(270)).toBe(true);
  });

  it('maps logical port sides to visual sides by rotation', () => {
    expect(resolveNodePortVisualSide('input', 0)).toBe('left');
    expect(resolveNodePortVisualSide('output', 0)).toBe('right');

    expect(resolveNodePortVisualSide('input', 90)).toBe('top');
    expect(resolveNodePortVisualSide('output', 90)).toBe('bottom');

    expect(resolveNodePortVisualSide('input', 180)).toBe('right');
    expect(resolveNodePortVisualSide('output', 180)).toBe('left');

    expect(resolveNodePortVisualSide('input', 270)).toBe('bottom');
    expect(resolveNodePortVisualSide('output', 270)).toBe('top');
  });
});
