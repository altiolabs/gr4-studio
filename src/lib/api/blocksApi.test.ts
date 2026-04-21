import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBlocks } from './blocksApi';

describe('getBlocks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts catalog parameters with structured default values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify([
            {
              id: 'gr::studio::StudioSeriesSink',
              name: 'Studio Series Sink',
              category: 'Studio',
              parameters: [
                {
                  name: 'ui_constraints',
                  type: 'map',
                  default: { panel: 'main', limits: [0, 1] },
                },
                {
                  name: 'values',
                  type: 'float_vector',
                  default: [1, 2, 3],
                },
              ],
            },
          ]),
      }),
    );

    await expect(getBlocks()).resolves.toEqual([
      {
        blockTypeId: 'gr::studio::StudioSeriesSink',
        displayName: 'Studio Series Sink',
        category: 'Studio',
        description: undefined,
        inputs: [],
        outputs: [],
        parameters: [
          {
            name: 'ui_constraints',
            type: 'map',
            default: { panel: 'main', limits: [0, 1] },
          },
          {
            name: 'values',
            type: 'float_vector',
            default: [1, 2, 3],
          },
        ],
      },
    ]);
  });

  it('accepts envelope-shaped catalog responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            blocks: [
              {
                id: 'gr::studio::StudioPowerSpectrumSink<float32>',
                name: 'Studio Power Spectrum Sink',
              },
            ],
          }),
      }),
    );

    await expect(getBlocks()).resolves.toEqual([
      {
        blockTypeId: 'gr::studio::StudioPowerSpectrumSink<float32>',
        displayName: 'Studio Power Spectrum Sink',
        category: undefined,
        description: undefined,
        inputs: [],
        outputs: [],
        parameters: [],
      },
    ]);
  });

  it('fails loudly for invalid top-level payloads instead of treating them as an empty catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            error: {
              code: 'proxy_failed',
              message: 'upstream unavailable',
            },
          }),
      }),
    );

    await expect(getBlocks()).rejects.toMatchObject({
      message: 'Block response schema mismatch',
      code: 'PARSE',
    });
  });
});
