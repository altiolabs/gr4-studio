import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './client';
import { getBlockSettings, setBlockSettings } from './block-settings';

describe('block-settings api', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests runtime settings with encoded session and block ids', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          settings: {
            gain: 2.5,
            enabled: true,
          },
        }),
        { status: 200 },
      ),
    );

    const result = await getBlockSettings('sess 1', 'sig/0');

    expect(result).toEqual({
      gain: 2.5,
      enabled: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/sessions/sess%201/blocks/sig%2F0/settings',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('posts a plain json patch and defaults to staged mode', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          session_id: 'sess_1',
          block: 'sig0',
          applied_via: 'staged_settings',
          accepted: true,
        }),
        { status: 200 },
      ),
    );

    await setBlockSettings('sess_1', 'sig0', { gain: 1.25 });

    expect(fetchMock).toHaveBeenCalledWith(
      '/sessions/sess_1/blocks/sig0/settings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ gain: 1.25 }),
      }),
    );
  });

  it('adds mode query string for immediate writes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          session_id: 'sess_1',
          block: 'sig0',
          applied_via: 'settings',
          accepted: true,
        }),
        { status: 200 },
      ),
    );

    await setBlockSettings('sess_1', 'sig0', { gain: 1.25 }, 'immediate');

    expect(fetchMock).toHaveBeenCalledWith(
      '/sessions/sess_1/blocks/sig0/settings?mode=immediate',
      expect.any(Object),
    );
  });

  it('rejects malformed runtime settings payloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ settings: [] }), { status: 200 }),
    );

    await expect(getBlockSettings('sess_1', 'sig0')).rejects.toBeInstanceOf(ApiClientError);
  });
});
