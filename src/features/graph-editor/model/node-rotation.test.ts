import { describe, expect, it } from 'vitest';
import { isQuarterTurnNodeRotation, rotateNodeRotation } from './node-rotation';

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
});
