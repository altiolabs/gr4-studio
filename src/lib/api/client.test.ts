import { describe, expect, it } from 'vitest';
import { buildApiUrl } from './client';

describe('api client url building', () => {
  it('uses relative proxy paths in dev for control-plane requests', () => {
    expect(buildApiUrl('/sessions')).toBe('/sessions');
    expect(buildApiUrl('blocks/gr::testing::NullSink%3Cfloat32%3E')).toBe(
      '/blocks/gr::testing::NullSink%3Cfloat32%3E',
    );
    expect(buildApiUrl('/sessions/sess_1/blocks/sig0/settings')).toBe(
      '/sessions/sess_1/blocks/sig0/settings',
    );
  });

  it('passes through absolute urls unchanged', () => {
    expect(buildApiUrl('http://127.0.0.1:8080/sessions')).toBe('http://127.0.0.1:8080/sessions');
  });
});
