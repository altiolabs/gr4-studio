import { describe, expect, it, vi } from 'vitest';
import { normalizeControlPlaneBaseUrl, resolveAppConfig } from './runtime-config';

describe('runtime config resolution', () => {
  it('normalizes valid control plane base urls', () => {
    expect(normalizeControlPlaneBaseUrl('http://127.0.0.1:8080/').value).toBe(
      'http://127.0.0.1:8080',
    );
    expect(normalizeControlPlaneBaseUrl('https://example.test/api').value).toBe(
      'https://example.test/api',
    );
  });

  it('falls back to the loopback default on invalid urls', () => {
    const normalized = normalizeControlPlaneBaseUrl('not a url');
    expect(normalized.value).toBe('http://127.0.0.1:8080');
    expect(normalized.issues[0]?.key).toBe('VITE_CONTROL_PLANE_BASE_URL');
  });

  it('prefers the desktop injected url when present', () => {
    vi.stubGlobal('window', {
      gr4StudioRuntime: {
        controlPlaneBaseUrl: 'http://127.0.0.1:9000',
        backendMode: 'remote',
      },
    });

    expect(resolveAppConfig('http://127.0.0.1:8080')).toMatchObject({
      controlPlaneBaseUrl: 'http://127.0.0.1:9000',
      backendMode: 'remote',
    });

    vi.unstubAllGlobals();
  });
});
