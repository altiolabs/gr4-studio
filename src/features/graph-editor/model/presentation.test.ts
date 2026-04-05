import { describe, expect, it } from 'vitest';
import { toCanonicalBlockDisplayName, toDisambiguatedShortBlockName, toShortBlockName } from './presentation';

describe('graph node short-name presentation', () => {
  it('keeps short names without template disambiguation', () => {
    expect(toShortBlockName('Abs<float32>', 'gr::math::Abs<float32>')).toBe('Abs');
    expect(toDisambiguatedShortBlockName('Abs', 'gr::math::Abs')).toBe('Abs');
  });

  it('prefers canonical casing from block type when names are case-insensitive matches', () => {
    expect(
      toShortBlockName('studioseriessink<float32>', 'gr::studio::StudioSeriesSink<float32>'),
    ).toBe('StudioSeriesSink');
  });

  it('canonicalizes display names when they only differ by case from type-derived name', () => {
    expect(
      toCanonicalBlockDisplayName(
        'studioseriessink<complex<float32>>',
        'gr::studio::StudioSeriesSink<complex<float32>>',
      ),
    ).toBe('StudioSeriesSink');
    expect(toCanonicalBlockDisplayName('booger', 'gr::studio::StudioSeriesSink<float32>')).toBe(
      'StudioSeriesSink',
    );
  });

  it('falls back to the reflected block type when the display name collapses to a type fragment', () => {
    expect(
      toShortBlockName('complex<float32>>', 'gr::io::SigmfSource<complex<float32>>'),
    ).toBe('SigmfSource');
    expect(
      toDisambiguatedShortBlockName('complex<float32>>', 'gr::io::SigmfSource<complex<float32>>'),
    ).toBe('SigmfSource');
  });


  it('preserves namespaces inside template arguments', () => {
    expect(
      toShortBlockName(
        'whatever',
        'gr::blocks::math::Rotator<std::complex<float32>>',
      ),
    ).toBe('Rotator');
  });

  it('adds template suffix for disambiguation when available', () => {
    expect(toDisambiguatedShortBlockName('Abs<float32>', 'gr::math::Abs<float32>')).toBe(
      'Abs',
    );
    expect(
      toDisambiguatedShortBlockName('Abs', 'gr::math::Abs<complex<float32>>'),
    ).toBe('Abs');
    expect(
      toDisambiguatedShortBlockName(
        'complex<float32>>',
        'gr::studio::StudioPowerSpectrumSink<complex<float32>>',
      ),
    ).toBe('StudioPowerSpectrumSink');
  });
});
