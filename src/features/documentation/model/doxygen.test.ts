import { describe, expect, it } from 'vitest';
import { extractDoxygenBrief, parseDoxygenBlocks } from './doxygen';

describe('parseDoxygenBlocks', () => {
  it('formats brief text, lists, definitions, and code blocks into structured blocks', () => {
    const blocks = parseDoxygenBlocks(`@brief Compute a spectrum

The block computes:
- FFT of the input frame
- averaged power spectrum

@param[in] fft_size Number of points per FFT
@param window Window function name
@tparam T Sample type

@code
power = mag2(fft(frame));
@endcode`);

    expect(blocks).toEqual([
      { kind: 'paragraph', text: 'Compute a spectrum' },
      {
        kind: 'paragraph',
        text: 'The block computes:',
      },
      {
        kind: 'list',
        items: ['FFT of the input frame', 'averaged power spectrum'],
      },
      {
        kind: 'definitionList',
        items: [
          { term: 'fft_size', description: 'Number of points per FFT' },
          { term: 'window', description: 'Window function name' },
          { term: 'T', description: 'Sample type' },
        ],
      },
      {
        kind: 'code',
        text: 'power = mag2(fft(frame));',
      },
    ]);
  });

  it('treats HTML-ish line breaks as paragraph boundaries', () => {
    const blocks = parseDoxygenBlocks('Line one<br>Line two<p>Line three');

    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        text: 'Line one\nLine two',
      },
      {
        kind: 'paragraph',
        text: 'Line three',
      },
    ]);
  });

  it('extracts the first non-empty line as the brief and removes the brief marker', () => {
    expect(extractDoxygenBrief('@brief Compute a spectrum')).toBe('Compute a spectrum');
    expect(extractDoxygenBrief('Plain summary text')).toBe('Plain summary text');
    expect(extractDoxygenBrief('')).toBeUndefined();
  });
});
