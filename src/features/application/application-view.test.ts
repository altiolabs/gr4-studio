import { describe, expect, it } from 'vitest';
import { readExplicitPlotPanelTitle } from './application-view-model';

describe('readExplicitPlotPanelTitle', () => {
  it('returns a trimmed explicit plot_title when present', () => {
    expect(readExplicitPlotPanelTitle({ plot_title: '  Spectrum  ' })).toBe('Spectrum');
  });

  it('falls back to title when plot_title is absent', () => {
    expect(readExplicitPlotPanelTitle({ title: 'Series View' })).toBe('Series View');
  });

  it('treats blank title parameters as absent', () => {
    expect(readExplicitPlotPanelTitle({ plot_title: '   ', title: '' })).toBeUndefined();
  });
});
